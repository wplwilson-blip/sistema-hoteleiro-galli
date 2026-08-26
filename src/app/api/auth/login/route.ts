import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionContextByAuthUserId } from "@/lib/auth/session";
import { loginSchema } from "@/lib/auth/schemas";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  resolveLoginFailureResponse,
  type LoginFailureReason
} from "@/lib/auth/login-response";

// Piso de tempo das respostas de falha de CREDENCIAL (plano docs/codex/54, fatia 1).
//
// Sem ele, "usuario nao existe" custa 1 query e "senha errada" custa 1 query + o
// round-trip do Supabase Auth — diferenca de ordem de grandeza, mensuravel do cliente.
// E' um oraculo de timing: da' para enumerar contas cronometrando as respostas.
//
// O `await` de timer no Node nao ocupa CPU nem thread; o custo e' manter a invocacao
// aberta. Por isso o piso vale SO' para falha de credencial: o 429 do rate limit, o 422 de
// payload invalido e o sucesso respondem na hora (nenhum deles revela existencia de conta).
const CREDENTIAL_FAILURE_FLOOR_MS = 400;

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

async function padUntilFloor(startedAt: number) {
  const elapsed = Date.now() - startedAt;
  const remaining = CREDENTIAL_FAILURE_FLOOR_MS - elapsed;

  if (remaining > 0) {
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }
}

async function writeAuthLog(input: {
  level?: "info" | "warning" | "error";
  action: string;
  message: string;
  appUserId?: string;
  unitId?: string;
  username?: string;
}) {
  const supabase = createSupabaseAdminClient();

  await supabase.from("system_logs").insert({
    level: input.level ?? "info",
    action: input.action,
    module_code: "BASE",
    entity_type: "auth",
    app_user_id: input.appUserId,
    unit_id: input.unitId,
    message: input.message,
    context: input.username ? { username: input.username } : {}
  });
}

export async function POST(request: Request) {
  // Marcado no inicio do handler: o piso e' medido sobre o tempo TOTAL da requisicao, nao
  // sobre um trecho — senao a diferenca entre os caminhos reaparece.
  const startedAt = Date.now();

  try {
    const payload = loginSchema.parse(await request.json());
    const admin = createSupabaseAdminClient();

    // Falha de credencial: responde sempre igual, sempre depois do piso. A trilha em
    // system_logs continua distinguindo os motivos — a uniformidade e' so' para o cliente.
    const credentialFailure = async (reason: LoginFailureReason, appUserId?: string) => {
      const resolved = resolveLoginFailureResponse(reason);

      await writeAuthLog({
        level: "warning",
        action: "auth.login.failed",
        message: "Falha de login.",
        appUserId,
        username: payload.username
      });

      await padUntilFloor(startedAt);
      return errorResponse(resolved.message, resolved.status);
    };

    const { data: appUser, error: userError } = await admin
      .from("app_users")
      .select("id, auth_user_id, username, auth_email, display_name, status")
      .eq("username", payload.username)
      .is("deleted_at", null)
      .maybeSingle();

    if (userError) {
      return credentialFailure("user_lookup_failed");
    }

    if (!appUser) {
      return credentialFailure("user_not_found");
    }

    if (appUser.status !== "active") {
      return credentialFailure("user_inactive", appUser.id);
    }

    // A SENHA E' VERIFICADA AQUI, antes de qualquer resposta que distinga este usuario dos
    // demais. A checagem de vinculo ativo, que antes vinha nesta posicao, desceu para
    // depois — era ela que revelava "este usuario existe" a quem nao tinha a senha.
    const serverClient = createSupabaseServerClient();
    const { data: authData, error: authError } = await serverClient.auth.signInWithPassword({
      email: appUser.auth_email,
      password: payload.password
    });

    if (authError || !authData.user) {
      return credentialFailure("invalid_password", appUser.id);
    }

    const { data: activeLinks, error: activeLinksError } = await admin
      .from("user_unit_links")
      .select("id")
      .eq("app_user_id", appUser.id)
      .eq("status", "active")
      .is("deleted_at", null)
      .limit(1);

    if (activeLinksError || !activeLinks?.length) {
      // A senha ja' foi aceita neste ponto, entao os cookies de sessao JA' FORAM emitidos.
      // Sem este signOut, um usuario sem vinculo sairia do login com sessao valida — o
      // efeito colateral que a reordenacao cria e que precisa ser fechado aqui.
      await serverClient.auth.signOut();

      const resolved = resolveLoginFailureResponse("no_active_unit");

      await writeAuthLog({
        level: "warning",
        action: "auth.login.failed_no_unit",
        message: "Login bloqueado por ausencia de vinculo ativo.",
        appUserId: appUser.id,
        username: payload.username
      });

      // Sem piso: quem chegou aqui provou a senha, e o tempo nao lhe informa nada novo.
      return errorResponse(resolved.message, resolved.status);
    }

    const sessionContext = await getSessionContextByAuthUserId(authData.user.id);

    if (!sessionContext) {
      await serverClient.auth.signOut();

      const resolved = resolveLoginFailureResponse("no_session_context");
      return errorResponse(resolved.message, resolved.status);
    }

    await admin.from("app_users").update({ last_login_at: new Date().toISOString(), updated_by: appUser.id }).eq("id", appUser.id);
    await writeAuthLog({
      action: "auth.login.success",
      message: "Login realizado com sucesso.",
      appUserId: appUser.id,
      unitId: sessionContext.activeUnit.id,
      username: payload.username
    });

    return NextResponse.json({ ok: true, user: sessionContext });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(error.errors[0]?.message ?? "Dados invalidos.", 422);
    }

    await writeAuthLog({
      level: "error",
      action: "auth.login.error",
      message: "Erro inesperado no login."
    });

    return errorResponse("Nao foi possivel realizar login agora.", 500);
  }
}
