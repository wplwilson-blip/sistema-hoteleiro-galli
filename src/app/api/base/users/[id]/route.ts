import { NextResponse } from "next/server";
import { z } from "zod";
import { BASE_PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { internalUserUpdatePayloadSchema } from "@/lib/base-cadastros/schemas";
import { apiError, logBaseCadastroError } from "@/lib/base-cadastros/api-helpers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { SUPER_ADMIN_PROFILE_CODE } from "@/lib/auth/session";

type SupabaseAdmin = ReturnType<typeof createSupabaseAdminClient>;

async function getEmployeeForUser(supabase: SupabaseAdmin, employeeId: string) {
  const { data, error } = await supabase
    .from("employees")
    .select("id, full_name, personal_email, corporate_email, status")
    .eq("id", employeeId)
    .is("deleted_at", null)
    .limit(1);

  if (error) {
    logBaseCadastroError("users.employee_lookup_failed", error);
    throw new Error("Nao foi possivel localizar o colaborador.");
  }

  const employee = data?.[0];

  if (!employee || employee.status !== "active") {
    throw new Error("Colaborador ativo nao encontrado.");
  }

  return employee;
}

async function employeeHasOtherActiveUser(supabase: SupabaseAdmin, employeeId: string, appUserId: string) {
  const { data, error } = await supabase
    .from("user_employee_links")
    .select("app_user_id")
    .eq("employee_id", employeeId)
    .eq("status", "active")
    .is("deleted_at", null);

  if (error) {
    logBaseCadastroError("users.employee_link_lookup_failed", error);
    throw new Error("Nao foi possivel validar o vinculo do colaborador.");
  }

  return (data ?? []).some((link) => link.app_user_id !== appUserId);
}

async function replaceEmployeeLink(input: { supabase: SupabaseAdmin; appUserId: string; employeeId: string; actorUserId: string }) {
  const now = new Date().toISOString();

  const { error: deactivateError } = await input.supabase
    .from("user_employee_links")
    .update({ status: "inactive", unlinked_at: now, updated_by: input.actorUserId })
    .eq("app_user_id", input.appUserId)
    .eq("status", "active")
    .is("deleted_at", null);

  if (deactivateError) {
    logBaseCadastroError("users.employee_link_deactivate_failed", deactivateError);
    throw new Error("Nao foi possivel atualizar o vinculo do colaborador.");
  }

  const { data: existingLink, error: existingLinkError } = await input.supabase
    .from("user_employee_links")
    .select("id")
    .eq("app_user_id", input.appUserId)
    .eq("employee_id", input.employeeId)
    .limit(1);

  if (existingLinkError) {
    logBaseCadastroError("users.employee_link_existing_lookup_failed", existingLinkError);
    throw new Error("Nao foi possivel atualizar o vinculo do colaborador.");
  }

  if (existingLink?.[0]) {
    const { error } = await input.supabase
      .from("user_employee_links")
      .update({ status: "active", unlinked_at: null, updated_by: input.actorUserId })
      .eq("id", existingLink[0].id);

    if (error) {
      logBaseCadastroError("users.employee_link_reactivate_failed", error);
      throw new Error("Nao foi possivel atualizar o vinculo do colaborador.");
    }

    return;
  }

  const { error } = await input.supabase.from("user_employee_links").insert({
    app_user_id: input.appUserId,
    employee_id: input.employeeId,
    status: "active",
    created_by: input.actorUserId,
    updated_by: input.actorUserId
  });

  if (error) {
    logBaseCadastroError("users.employee_link_insert_failed", error);
    throw new Error("Nao foi possivel atualizar o vinculo do colaborador.");
  }
}

async function replaceUnitLinks(input: {
  supabase: SupabaseAdmin;
  appUserId: string;
  unitIds: string[];
  accessProfileId: string;
  actorUserId: string;
}) {
  const { error: deactivateError } = await input.supabase
    .from("user_unit_links")
    .update({ status: "inactive", updated_by: input.actorUserId })
    .eq("app_user_id", input.appUserId)
    .eq("status", "active")
    .is("deleted_at", null);

  if (deactivateError) {
    logBaseCadastroError("users.unit_links_deactivate_failed", deactivateError);
    throw new Error("Nao foi possivel atualizar as unidades permitidas.");
  }

  const links = input.unitIds.map((unitId) => ({
    app_user_id: input.appUserId,
    unit_id: unitId,
    access_profile_id: input.accessProfileId,
    status: "active",
    created_by: input.actorUserId,
    updated_by: input.actorUserId
  }));

  const { error } = await input.supabase.from("user_unit_links").insert(links);

  if (error) {
    logBaseCadastroError("users.unit_links_insert_failed", error);
    throw new Error("Nao foi possivel atualizar as unidades permitidas.");
  }
}

// Conjunto de app_user_ids que sao super admins ATIVOS:
// app_user ativo (status active, deleted_at null) COM vinculo user_unit_links ATIVO
// (status active, deleted_at null) no perfil SUPER_ADMIN. Vinculo inativo nao conta.
async function getActiveSuperAdminUserIds(supabase: SupabaseAdmin): Promise<string[]> {
  const { data: profile, error: profileError } = await supabase
    .from("access_profiles")
    .select("id")
    .eq("code", SUPER_ADMIN_PROFILE_CODE)
    .eq("status", "active")
    .is("deleted_at", null)
    .limit(1);

  if (profileError) {
    logBaseCadastroError("users.super_admin_profile_lookup_failed", profileError);
    throw new Error("Nao foi possivel validar os super admins ativos.");
  }

  const superAdminProfile = profile?.[0];

  if (!superAdminProfile) {
    return [];
  }

  const { data: links, error: linksError } = await supabase
    .from("user_unit_links")
    .select("app_user_id")
    .eq("access_profile_id", superAdminProfile.id)
    .eq("status", "active")
    .is("deleted_at", null);

  if (linksError) {
    logBaseCadastroError("users.super_admin_link_lookup_failed", linksError);
    throw new Error("Nao foi possivel validar os super admins ativos.");
  }

  const candidateIds = Array.from(new Set((links ?? []).map((link) => link.app_user_id).filter(Boolean)));

  if (!candidateIds.length) {
    return [];
  }

  const { data: activeUsers, error: activeUsersError } = await supabase
    .from("app_users")
    .select("id")
    .in("id", candidateIds)
    .eq("status", "active")
    .is("deleted_at", null);

  if (activeUsersError) {
    logBaseCadastroError("users.super_admin_user_lookup_failed", activeUsersError);
    throw new Error("Nao foi possivel validar os super admins ativos.");
  }

  return Array.from(new Set((activeUsers ?? []).map((user) => user.id)));
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const { context, response } = await requirePermission(BASE_PERMISSIONS.usersManage);

  if (response || !context) {
    return response;
  }

  try {
    if (!context.isSuperAdmin) {
      return apiError("Voce nao tem permissao para gerenciar usuarios internos.", 403);
    }

    const payload = internalUserUpdatePayloadSchema.parse(await request.json());
    const supabase = context.supabase;
    const employee = await getEmployeeForUser(supabase, payload.employeeId);

    if (await employeeHasOtherActiveUser(supabase, payload.employeeId, params.id)) {
      return apiError("Este colaborador ja possui outro usuario ativo vinculado.", 409);
    }

    const { error: appUserError } = await supabase
      .from("app_users")
      .update({
        display_name: employee.full_name,
        personal_email: employee.personal_email ?? employee.corporate_email ?? null,
        status: payload.status,
        updated_by: context.session.user.id
      })
      .eq("id", params.id)
      .is("deleted_at", null);

    if (appUserError) {
      logBaseCadastroError("users.app_user_update_failed", appUserError);
      return apiError("Nao foi possivel atualizar o usuario.", 500);
    }

    await replaceEmployeeLink({
      supabase,
      appUserId: params.id,
      employeeId: payload.employeeId,
      actorUserId: context.session.user.id
    });
    await replaceUnitLinks({
      supabase,
      appUserId: params.id,
      unitIds: payload.unitIds,
      accessProfileId: payload.accessProfileId,
      actorUserId: context.session.user.id
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    }

    return apiError(error instanceof Error ? error.message : "Nao foi possivel atualizar o usuario.", 500);
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const { context, response } = await requirePermission(BASE_PERMISSIONS.usersManage);

  if (response || !context) {
    return response;
  }

  try {
    if (!context.isSuperAdmin) {
      return apiError("Voce nao tem permissao para gerenciar usuarios internos.", 403);
    }

    const actorUserId = context.session.user.id;

    if (params.id === actorUserId) {
      return apiError("Voce nao pode excluir o proprio usuario.", 409);
    }

    const supabase = context.supabase;

    const { data: existing, error: existingError } = await supabase
      .from("app_users")
      .select("id")
      .eq("id", params.id)
      .is("deleted_at", null)
      .limit(1);

    if (existingError) {
      logBaseCadastroError("users.delete_lookup_failed", existingError);
      return apiError("Nao foi possivel localizar o usuario.", 500);
    }

    if (!existing?.[0]) {
      return apiError("Usuario nao encontrado.", 404);
    }

    // Anti-lockout: nao excluir o ultimo super admin ativo.
    const activeSuperAdminIds = await getActiveSuperAdminUserIds(supabase);
    const isTargetSuperAdmin = activeSuperAdminIds.includes(params.id);
    const remainingSuperAdmins = activeSuperAdminIds.filter((id) => id !== params.id);

    if (isTargetSuperAdmin && remainingSuperAdmins.length === 0) {
      return apiError("Nao e possivel excluir o ultimo super admin ativo.", 409);
    }

    const now = new Date().toISOString();

    // (a) desativar vinculos primeiro (mantem o usuario visivel/retryavel se algo falhar aqui)
    const { error: linksError } = await supabase
      .from("user_unit_links")
      .update({ status: "inactive", deleted_at: now, updated_by: actorUserId })
      .eq("app_user_id", params.id)
      .eq("status", "active")
      .is("deleted_at", null);

    if (linksError) {
      logBaseCadastroError("users.delete_unit_links_failed", linksError);
      return apiError("Nao foi possivel desativar os vinculos do usuario.", 500);
    }

    // (b) commit: marcar o app_user como excluido (o que GET/login ja respeitam)
    const { error: appUserError } = await supabase
      .from("app_users")
      .update({ deleted_at: now, status: "inactive", updated_by: actorUserId })
      .eq("id", params.id)
      .is("deleted_at", null);

    if (appUserError) {
      logBaseCadastroError("users.delete_app_user_failed", appUserError);
      return apiError("Nao foi possivel excluir o usuario.", 500);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Nao foi possivel excluir o usuario.", 500);
  }
}
