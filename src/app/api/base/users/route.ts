import { NextResponse } from "next/server";
import { z } from "zod";
import { buildTechnicalAuthEmail } from "@/lib/auth/schemas";
import { BASE_PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { internalUserCreatePayloadSchema } from "@/lib/base-cadastros/schemas";
import { apiError, logBaseCadastroError } from "@/lib/base-cadastros/api-helpers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

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

async function employeeHasActiveUser(supabase: SupabaseAdmin, employeeId: string) {
  const { data, error } = await supabase
    .from("user_employee_links")
    .select("id")
    .eq("employee_id", employeeId)
    .eq("status", "active")
    .is("deleted_at", null)
    .limit(1);

  if (error) {
    logBaseCadastroError("users.employee_link_lookup_failed", error);
    throw new Error("Nao foi possivel validar o vinculo do colaborador.");
  }

  return Boolean(data?.[0]);
}

async function createUnitLinks(input: {
  supabase: SupabaseAdmin;
  appUserId: string;
  unitIds: string[];
  accessProfileId: string;
  actorUserId: string;
}) {
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
    logBaseCadastroError("users.unit_links_create_failed", error);
    throw new Error("Nao foi possivel vincular as unidades ao usuario.");
  }
}

export async function GET() {
  const { context, response } = await requirePermission(BASE_PERMISSIONS.usersView);

  if (response || !context) {
    return response;
  }

  try {
    if (!context.isSuperAdmin) {
      return apiError("Voce nao tem permissao para gerenciar usuarios internos.", 403);
    }

    const supabase = context.supabase;
    const { data: users, error: usersError } = await supabase
      .from("app_users")
      .select("id, username, display_name, status, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (usersError) {
      logBaseCadastroError("users.list_failed", usersError);
      return apiError("Nao foi possivel carregar os usuarios.", 500);
    }

    const userIds = users?.map((user) => user.id) ?? [];
    const { data: employeeLinks, error: employeeLinksError } = userIds.length
      ? await supabase
          .from("user_employee_links")
          .select("app_user_id, employee_id")
          .in("app_user_id", userIds)
          .eq("status", "active")
          .is("deleted_at", null)
      : { data: [], error: null };
    const { data: unitLinks, error: unitLinksError } = userIds.length
      ? await supabase
          .from("user_unit_links")
          .select("app_user_id, unit_id, access_profile_id")
          .in("app_user_id", userIds)
          .eq("status", "active")
          .is("deleted_at", null)
      : { data: [], error: null };
    const { data: employees, error: employeesError } = await supabase
      .from("employees")
      .select("id, full_name, status")
      .is("deleted_at", null)
      .order("full_name", { ascending: true });
    const { data: profiles, error: profilesError } = await supabase
      .from("access_profiles")
      .select("id, code, name, status")
      .eq("status", "active")
      .is("deleted_at", null)
      .order("name", { ascending: true });
    const { data: units, error: unitsError } = await supabase
      .from("units")
      .select("id, code, name, status")
      .is("deleted_at", null)
      .order("name", { ascending: true });

    if (employeeLinksError) {
      logBaseCadastroError("users.employee_links_list_failed", employeeLinksError);
      return apiError("Nao foi possivel carregar os vinculos de colaboradores.", 500);
    }

    if (unitLinksError) {
      logBaseCadastroError("users.unit_links_list_failed", unitLinksError);
      return apiError("Nao foi possivel carregar as unidades permitidas.", 500);
    }

    if (employeesError) {
      logBaseCadastroError("users.employees_list_failed", employeesError);
      return apiError("Nao foi possivel carregar colaboradores.", 500);
    }

    if (profilesError) {
      logBaseCadastroError("users.profiles_list_failed", profilesError);
      return apiError("Nao foi possivel carregar perfis de acesso.", 500);
    }

    if (unitsError) {
      logBaseCadastroError("users.units_list_failed", unitsError);
      return apiError("Nao foi possivel carregar unidades.", 500);
    }

    const employeesById = new Map((employees ?? []).map((employee) => [employee.id, employee]));
    const profilesById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
    const unitsById = new Map((units ?? []).map((unit) => [unit.id, unit]));
    const employeeByUser = new Map((employeeLinks ?? []).map((link) => [link.app_user_id, employeesById.get(link.employee_id)]));
    const linksByUser = new Map<string, NonNullable<typeof unitLinks>>();

    for (const link of unitLinks ?? []) {
      linksByUser.set(link.app_user_id, [...(linksByUser.get(link.app_user_id) ?? []), link]);
    }

    return NextResponse.json({
      ok: true,
      users: (users ?? []).map((user) => {
        const links = linksByUser.get(user.id) ?? [];
        const profile = links[0]?.access_profile_id ? profilesById.get(links[0].access_profile_id) : null;
        const unitIds = Array.from(new Set(links.map((link) => link.unit_id)));
        const allowedUnits = unitIds.map((unitId) => unitsById.get(unitId)).filter(Boolean);
        const employee = employeeByUser.get(user.id);

        return {
          id: user.id,
          username: user.username,
          displayName: user.display_name,
          employeeId: employee?.id ?? "",
          employeeName: employee?.full_name ?? "",
          accessProfileId: profile?.id ?? "",
          accessProfileName: profile?.name ?? "",
          accessProfileCode: profile?.code ?? "",
          unitIds,
          unitNames: allowedUnits.map((unit) => unit?.name).filter(Boolean),
          status: user.status,
          createdAt: user.created_at
        };
      }),
      employees: (employees ?? [])
        .filter((employee) => employee.status === "active")
        .map((employee) => ({ id: employee.id, name: employee.full_name })),
      profiles: (profiles ?? []).map((profile) => ({ id: profile.id, code: profile.code, name: profile.name })),
      units: (units ?? [])
        .filter((unit) => unit.status === "active")
        .map((unit) => ({ id: unit.id, code: unit.code, name: unit.name }))
    });
  } catch {
    return apiError("Nao foi possivel carregar os usuarios.", 500);
  }
}

export async function POST(request: Request) {
  const { context, response } = await requirePermission(BASE_PERMISSIONS.usersManage);

  if (response || !context) {
    return response;
  }

  let authUserId: string | null = null;
  let appUserId: string | null = null;

  try {
    if (!context.isSuperAdmin) {
      return apiError("Voce nao tem permissao para gerenciar usuarios internos.", 403);
    }

    const payload = internalUserCreatePayloadSchema.parse(await request.json());
    const supabase = context.supabase;
    const employee = await getEmployeeForUser(supabase, payload.employeeId);

    if (await employeeHasActiveUser(supabase, payload.employeeId)) {
      return apiError("Este colaborador ja possui usuario ativo vinculado.", 409);
    }

    const { data: existingUser, error: existingUserError } = await supabase
      .from("app_users")
      .select("id")
      .eq("username", payload.username)
      .is("deleted_at", null)
      .limit(1);

    if (existingUserError) {
      logBaseCadastroError("users.username_lookup_failed", existingUserError);
      return apiError("Nao foi possivel validar o username.", 500);
    }

    if (existingUser?.[0]) {
      return apiError("Ja existe um usuario com este username.", 409);
    }

    const authEmail = buildTechnicalAuthEmail(payload.username);
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: authEmail,
      password: payload.password,
      email_confirm: true,
      user_metadata: {
        username: payload.username,
        display_name: employee.full_name,
        internal_login: true
      }
    });

    if (authError || !authUser.user) {
      return apiError("Nao foi possivel criar o usuario de autenticacao.", 500);
    }

    authUserId = authUser.user.id;

    const { data: appUser, error: appUserError } = await supabase
      .from("app_users")
      .insert({
        auth_user_id: authUserId,
        username: payload.username,
        auth_email: authEmail,
        display_name: employee.full_name,
        personal_email: employee.personal_email ?? employee.corporate_email ?? null,
        status: payload.status,
        created_by: context.session.user.id,
        updated_by: context.session.user.id
      })
      .select("id")
      .single();

    if (appUserError || !appUser) {
      if (appUserError) {
        logBaseCadastroError("users.app_user_create_failed", appUserError);
      }

      await supabase.auth.admin.deleteUser(authUserId);
      return apiError("Nao foi possivel criar o usuario do sistema.", 500);
    }

    appUserId = appUser.id;

    const { error: employeeLinkError } = await supabase.from("user_employee_links").insert({
      app_user_id: appUser.id,
      employee_id: payload.employeeId,
      status: "active",
      created_by: context.session.user.id,
      updated_by: context.session.user.id
    });

    if (employeeLinkError) {
      logBaseCadastroError("users.employee_link_create_failed", employeeLinkError);
      await supabase.from("app_users").update({ deleted_at: new Date().toISOString(), deleted_by: context.session.user.id }).eq("id", appUser.id);
      await supabase.auth.admin.deleteUser(authUserId);
      return apiError("Nao foi possivel vincular o colaborador ao usuario.", 500);
    }

    await createUnitLinks({
      supabase,
      appUserId: appUser.id,
      unitIds: payload.unitIds,
      accessProfileId: payload.accessProfileId,
      actorUserId: context.session.user.id
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const supabase = createSupabaseAdminClient();

    if (appUserId) {
      await supabase
        .from("user_employee_links")
        .update({ status: "inactive", unlinked_at: new Date().toISOString(), updated_by: context.session.user.id })
        .eq("app_user_id", appUserId)
        .eq("status", "active")
        .is("deleted_at", null);
      await supabase
        .from("user_unit_links")
        .update({ status: "inactive", updated_by: context.session.user.id })
        .eq("app_user_id", appUserId)
        .eq("status", "active")
        .is("deleted_at", null);
      await supabase.from("app_users").update({ deleted_at: new Date().toISOString(), deleted_by: context.session.user.id }).eq("id", appUserId);
    }

    if (authUserId) {
      await supabase.auth.admin.deleteUser(authUserId);
    }

    if (error instanceof z.ZodError) {
      return apiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    }

    return apiError(error instanceof Error ? error.message : "Nao foi possivel criar o usuario.", 500);
  }
}
