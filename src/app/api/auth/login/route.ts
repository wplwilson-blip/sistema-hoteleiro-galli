import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionContextByAuthUserId } from "@/lib/auth/session";
import { loginSchema } from "@/lib/auth/schemas";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const invalidLoginMessage = "Usuario ou senha invalidos.";

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
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
  try {
    const payload = loginSchema.parse(await request.json());
    const admin = createSupabaseAdminClient();

    const { data: appUser, error: userError } = await admin
      .from("app_users")
      .select("id, auth_user_id, username, auth_email, display_name, status")
      .eq("username", payload.username)
      .is("deleted_at", null)
      .maybeSingle();

    if (userError || !appUser || appUser.status !== "active") {
      await writeAuthLog({
        level: "warning",
        action: "auth.login.failed",
        message: "Falha de login.",
        username: payload.username
      });
      return errorResponse(invalidLoginMessage, 401);
    }

    const { data: activeLinks, error: activeLinksError } = await admin
      .from("user_unit_links")
      .select("id")
      .eq("app_user_id", appUser.id)
      .eq("status", "active")
      .is("deleted_at", null)
      .limit(1);

    if (activeLinksError || !activeLinks?.length) {
      await writeAuthLog({
        level: "warning",
        action: "auth.login.failed_no_unit",
        message: "Login bloqueado por ausencia de vinculo ativo.",
        appUserId: appUser.id,
        username: payload.username
      });
      return errorResponse("Acesso bloqueado. Procure o administrador do sistema.", 403);
    }

    const serverClient = createSupabaseServerClient();
    const { data: authData, error: authError } = await serverClient.auth.signInWithPassword({
      email: appUser.auth_email,
      password: payload.password
    });

    if (authError || !authData.user) {
      await writeAuthLog({
        level: "warning",
        action: "auth.login.failed",
        message: "Falha de login.",
        appUserId: appUser.id,
        username: payload.username
      });
      return errorResponse(invalidLoginMessage, 401);
    }

    const sessionContext = await getSessionContextByAuthUserId(authData.user.id);

    if (!sessionContext) {
      await serverClient.auth.signOut();
      return errorResponse("Nao foi possivel carregar seu perfil de acesso.", 403);
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
