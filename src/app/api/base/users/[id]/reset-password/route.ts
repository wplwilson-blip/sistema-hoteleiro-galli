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

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    }

    return apiError(error instanceof Error ? error.message : "Nao foi possivel redefinir a senha.", 500);
  }
}
