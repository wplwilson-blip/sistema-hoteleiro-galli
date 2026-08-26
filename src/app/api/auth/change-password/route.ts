import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSessionContext } from "@/lib/auth/session";
import { changePasswordPayloadSchema } from "@/lib/base-cadastros/schemas";
import { apiError, logBaseCadastroError } from "@/lib/base-cadastros/api-helpers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Troca da PROPRIA senha (#C7, plano docs/codex/65).
 *
 * DE QUEM E' A SENHA QUE ESTA ROTA TROCA: sempre a de quem esta' logado. O alvo vem de
 * `getCurrentSessionContext()` e NUNCA de um id no corpo ou na URL. Nao ha' parametro de
 * usuario nesta rota -- e' isso que a impede de virar "trocar a senha de qualquer um".
 *
 * NAO tem gate de permissao: qualquer usuario autenticado troca a propria senha. Exigir
 * `usersManage` seria confundir isto com gestao de terceiros, que ja' vive em
 * /api/base/users/[id]/reset-password.
 *
 * Nao toca no fluxo de login nem no rate limit do #4: a verificacao da senha atual e' uma
 * chamada separada, em cliente proprio e descartavel.
 */
export async function POST(request: Request) {
  try {
    const sessionContext = await getCurrentSessionContext();

    if (!sessionContext) {
      return apiError("Sessao expirada. Entre novamente para trocar a senha.", 401);
    }

    const payload = changePasswordPayloadSchema.parse(await request.json());
    const admin = createSupabaseAdminClient();

    // O auth_email e o auth_user_id sao buscados PELO ID DA SESSAO, nao por nada que o
    // cliente tenha mandado.
    const { data: appUser, error: appUserError } = await admin
      .from("app_users")
      .select("id, auth_user_id, auth_email, status")
      .eq("id", sessionContext.user.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (appUserError) {
      logBaseCadastroError("auth.change_password_lookup_failed", appUserError);
      return apiError("Nao foi possivel trocar a senha agora.", 500);
    }

    if (!appUser || !appUser.auth_user_id || appUser.status !== "active") {
      return apiError("Nao foi possivel trocar a senha agora.", 403);
    }

    // VERIFICACAO DA SENHA ATUAL. Exigida mesmo com sessao valida: sem ela, um cookie
    // roubado ou uma maquina destravada permitiriam TOMAR a conta -- trocar a senha e
    // expulsar o dono. Com ela, roubo de sessao nao escala para tomada de conta.
    //
    // Cliente PROPRIO e descartavel: nao o do fluxo de sessao, para nao haver chance de
    // mexer nos cookies da requisicao em andamento.
    const probeClient = createSupabaseServerClient();
    const { error: currentPasswordError } = await probeClient.auth.signInWithPassword({
      email: appUser.auth_email,
      password: payload.currentPassword
    });

    if (currentPasswordError) {
      return apiError("Senha atual incorreta.", 401);
    }

    const { error: updateError } = await admin.auth.admin.updateUserById(appUser.auth_user_id, {
      password: payload.newPassword
    });

    if (updateError) {
      logBaseCadastroError("auth.change_password_update_failed", updateError);
      return apiError("Nao foi possivel trocar a senha agora.", 500);
    }

    // A flag so' e' limpa DEPOIS do sucesso no Auth: se a troca falhasse, limpar aqui
    // liberaria o sistema com a senha temporaria ainda valendo.
    const { error: flagError } = await admin
      .from("app_users")
      .update({ must_change_password: false, updated_by: appUser.id })
      .eq("id", appUser.id);

    if (flagError) {
      // A senha JA' mudou. Devolver 500 faria o usuario tentar de novo com a senha antiga,
      // que nao vale mais. Registra e responde ok: o pior caso e' ele ver a tela de troca
      // mais uma vez no proximo carregamento.
      logBaseCadastroError("auth.change_password_flag_failed", flagError);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    }

    return apiError(error instanceof Error ? error.message : "Nao foi possivel trocar a senha.", 500);
  }
}
