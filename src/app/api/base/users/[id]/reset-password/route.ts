import { NextResponse } from "next/server";
import { z } from "zod";
import { BASE_PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { internalUserResetPasswordSchema } from "@/lib/base-cadastros/schemas";
import { apiError, logBaseCadastroError } from "@/lib/base-cadastros/api-helpers";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const { context, response } = await requirePermission(BASE_PERMISSIONS.usersManage);

  if (response || !context) {
    return response;
  }

  try {
    if (!context.isSuperAdmin) {
      return apiError("Voce nao tem permissao para gerenciar usuarios internos.", 403);
    }

    const payload = internalUserResetPasswordSchema.parse(await request.json());
    const supabase = context.supabase;

    const { data: appUser, error: appUserError } = await supabase
      .from("app_users")
      .select("id, auth_user_id")
      .eq("id", params.id)
      .is("deleted_at", null)
      .limit(1);

    if (appUserError) {
      logBaseCadastroError("users.password_reset_lookup_failed", appUserError);
      return apiError("Nao foi possivel localizar o usuario.", 500);
    }

    const target = appUser?.[0];

    if (!target || !target.auth_user_id) {
      return apiError("Usuario nao encontrado.", 404);
    }

    const { error: updateError } = await supabase.auth.admin.updateUserById(target.auth_user_id, {
      password: payload.password
    });

    if (updateError) {
      logBaseCadastroError("users.password_reset_failed", updateError);
      return apiError("Nao foi possivel redefinir a senha do usuario.", 500);
    }

    // #C7: reset feito por admin tambem gera senha temporaria -- o admin passa a conhece-la.
    // O update vem DEPOIS do sucesso no Auth de proposito: se a troca la' falhasse, armar a
    // flag obrigaria o usuario a trocar uma senha que nao mudou.
    const { error: flagError } = await supabase
      .from("app_users")
      .update({ must_change_password: true, updated_by: context.session.user.id })
      .eq("id", target.id);

    if (flagError) {
      // A senha JA' foi trocada no Auth. Falhar aqui com 500 faria o admin repetir o reset
      // achando que nada aconteceu. Registra e segue: o pior caso e' o usuario nao ser
      // forcado a trocar -- exatamente o comportamento de antes desta fatia.
      logBaseCadastroError("users.password_reset_flag_failed", flagError);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    }

    return apiError(error instanceof Error ? error.message : "Nao foi possivel redefinir a senha.", 500);
  }
}
