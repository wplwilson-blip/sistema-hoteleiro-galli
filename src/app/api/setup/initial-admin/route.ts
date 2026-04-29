import { NextResponse } from "next/server";
import { z } from "zod";
import { buildTechnicalAuthEmail, initialSetupSchema } from "@/lib/auth/schemas";
import { hasActiveSuperAdmin, SUPER_ADMIN_PROFILE_CODE } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type InitialSetupInput = z.infer<typeof initialSetupSchema>;

const superAdminProfileSeed = {
  code: SUPER_ADMIN_PROFILE_CODE,
  name: "Super Admin",
  description: "Perfil maximo do sistema, usado para setup inicial e administracao global.",
  is_system_default: true,
  status: "active",
  deleted_at: null,
  deleted_by: null
};

const safeSetupErrorMessages = new Set([
  "Nao foi possivel localizar a organizacao.",
  "Nao foi possivel criar a organizacao.",
  "Nao foi possivel criar ou localizar a organizacao.",
  "Nao foi possivel localizar a unidade inicial.",
  "Nao foi possivel criar ou localizar a unidade inicial.",
  "Nao foi possivel localizar o perfil Super Admin.",
  "Nao foi possivel preparar o perfil Super Admin."
]);

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

function logSetupDatabaseError(stage: string, error: { name?: string; message?: string; code?: string }) {
  console.error(`[setup.${stage}]`, {
    name: error.name ?? "PostgrestError",
    message: error.message ?? "unknown",
    code: error.code
  });
}

async function writeSystemLog(input: {
  level?: "info" | "warning" | "error";
  action: string;
  message: string;
  appUserId?: string;
  unitId?: string;
  context?: Record<string, unknown>;
}) {
  try {
    const supabase = createSupabaseAdminClient();

    await supabase.from("system_logs").insert({
      level: input.level ?? "info",
      action: input.action,
      module_code: "BASE",
      entity_type: "setup",
      app_user_id: input.appUserId,
      unit_id: input.unitId,
      message: input.message,
      context: input.context ?? {}
    });
  } catch (error) {
    console.error("[setup.system_log.write_failed]", {
      action: input.action,
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : "unknown"
    });
  }
}

async function getOrCreateSuperAdminProfile(supabase: ReturnType<typeof createSupabaseAdminClient>) {
  const { data: existingProfiles, error: lookupError } = await supabase
    .from("access_profiles")
    .select("id")
    .eq("code", SUPER_ADMIN_PROFILE_CODE)
    .eq("status", "active")
    .is("deleted_at", null)
    .limit(1);

  if (lookupError) {
    logSetupDatabaseError("super_admin_profile.lookup_failed", lookupError);
    throw new Error("Nao foi possivel localizar o perfil Super Admin.");
  }

  const existingProfile = existingProfiles?.[0];

  if (existingProfile) {
    return existingProfile;
  }

  const { data: upsertedProfiles, error: upsertError } = await supabase
    .from("access_profiles")
    .upsert(superAdminProfileSeed, { onConflict: "code", ignoreDuplicates: false })
    .select("id")
    .limit(1);

  if (upsertError) {
    logSetupDatabaseError("super_admin_profile.upsert_failed", upsertError);
    throw new Error("Nao foi possivel preparar o perfil Super Admin.");
  }

  const upsertedProfile = upsertedProfiles?.[0];

  if (!upsertedProfile) {
    throw new Error("Nao foi possivel preparar o perfil Super Admin.");
  }

  return upsertedProfile;
}

async function getOrCreateOrganization(supabase: ReturnType<typeof createSupabaseAdminClient>, payload: InitialSetupInput) {
  const { data: existingOrganizations, error: lookupError } = await supabase
    .from("organizations")
    .select("id")
    .eq("name", payload.organizationName)
    .is("deleted_at", null)
    .limit(1);

  if (lookupError) {
    logSetupDatabaseError("organization.lookup_failed", lookupError);
    throw new Error("Nao foi possivel localizar a organizacao.");
  }

  const existingOrganization = existingOrganizations?.[0];

  if (existingOrganization) {
    return existingOrganization;
  }

  const { data: createdOrganizations, error: createError } = await supabase
    .from("organizations")
    .insert({
      name: payload.organizationName,
      legal_name: payload.organizationName,
      status: "active",
      settings: { trade_name: payload.organizationTradeName }
    })
    .select("id")
    .limit(1);

  if (createError) {
    logSetupDatabaseError("organization.create_failed", createError);
    throw new Error("Nao foi possivel criar a organizacao.");
  }

  const createdOrganization = createdOrganizations?.[0];

  if (!createdOrganization) {
    throw new Error("Nao foi possivel criar ou localizar a organizacao.");
  }

  return createdOrganization;
}

async function getOrCreateInitialUnit(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  organizationId: string,
  payload: InitialSetupInput
) {
  const { data: existingUnits, error: lookupError } = await supabase
    .from("units")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("code", payload.unitCode)
    .is("deleted_at", null)
    .limit(1);

  if (lookupError) {
    logSetupDatabaseError("unit.lookup_failed", lookupError);
    throw new Error("Nao foi possivel localizar a unidade inicial.");
  }

  const existingUnit = existingUnits?.[0];

  if (existingUnit) {
    return existingUnit;
  }

  const { data: upsertedUnits, error: upsertError } = await supabase
    .from("units")
    .upsert(
      {
        organization_id: organizationId,
        code: payload.unitCode,
        name: payload.unitName,
        legal_name: payload.unitName,
        timezone: "America/Sao_Paulo",
        status: "active",
        deleted_at: null,
        deleted_by: null
      },
      { onConflict: "organization_id,code", ignoreDuplicates: false }
    )
    .select("id")
    .limit(1);

  if (upsertError) {
    logSetupDatabaseError("unit.upsert_failed", upsertError);
    throw new Error("Nao foi possivel criar ou localizar a unidade inicial.");
  }

  const upsertedUnit = upsertedUnits?.[0];

  if (!upsertedUnit) {
    throw new Error("Nao foi possivel criar ou localizar a unidade inicial.");
  }

  return upsertedUnit;
}

export async function POST(request: Request) {
  let authUserId: string | null = null;

  try {
    if (await hasActiveSuperAdmin()) {
      return errorResponse("Setup inicial ja foi concluido.", 409);
    }

    const payload = initialSetupSchema.parse(await request.json());
    const supabase = createSupabaseAdminClient();
    const authEmail = buildTechnicalAuthEmail(payload.username);

    const { data: existingUser } = await supabase
      .from("app_users")
      .select("id")
      .eq("username", payload.username)
      .maybeSingle();

    if (existingUser) {
      return errorResponse("Nao foi possivel concluir o setup com os dados informados.", 409);
    }

    const organization = await getOrCreateOrganization(supabase, payload);
    const unit = await getOrCreateInitialUnit(supabase, organization.id, payload);

    const { error: unitSettingsError } = await supabase.from("unit_settings").upsert(
      {
        unit_id: unit.id,
        key: "setup.initial",
        value: {
          city: payload.city,
          state: payload.state,
          total_rooms: payload.totalRooms ?? null
        },
        status: "active"
      },
      { onConflict: "unit_id,key" }
    );

    if (unitSettingsError) {
      logSetupDatabaseError("unit_settings.upsert_failed", unitSettingsError);
      return errorResponse("Nao foi possivel registrar as configuracoes iniciais da unidade.", 500);
    }

    const superAdminProfile = await getOrCreateSuperAdminProfile(supabase);

    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: authEmail,
      password: payload.password,
      email_confirm: true,
      user_metadata: {
        username: payload.username,
        display_name: payload.fullName,
        internal_login: true
      }
    });

    if (authError || !authUser.user) {
      return errorResponse("Nao foi possivel criar o usuario de autenticacao.", 500);
    }

    authUserId = authUser.user.id;

    const { data: appUser, error: appUserError } = await supabase
      .from("app_users")
      .insert({
        auth_user_id: authUserId,
        username: payload.username,
        auth_email: authEmail,
        display_name: payload.fullName,
        personal_email: null,
        status: "active",
        metadata: {
          cpf: payload.cpf || null,
          setup_initial_admin: true
        }
      })
      .select("id")
      .single();

    if (appUserError || !appUser) {
      await supabase.auth.admin.deleteUser(authUserId);
      return errorResponse("Nao foi possivel criar o usuario do sistema.", 500);
    }

    const { error: linkError } = await supabase.from("user_unit_links").insert({
      app_user_id: appUser.id,
      unit_id: unit.id,
      access_profile_id: superAdminProfile.id,
      status: "active",
      created_by: appUser.id
    });

    if (linkError) {
      await supabase.from("app_users").update({ deleted_at: new Date().toISOString(), deleted_by: appUser.id }).eq("id", appUser.id);
      await supabase.auth.admin.deleteUser(authUserId);
      return errorResponse("Nao foi possivel vincular o Super Admin a unidade inicial.", 500);
    }

    await writeSystemLog({
      action: "setup.initial_admin.created",
      message: "Setup inicial concluido com criacao do primeiro Super Admin.",
      appUserId: appUser.id,
      unitId: unit.id,
      context: {
        organization_id: organization.id,
        username: payload.username
      }
    });

    return NextResponse.json({ ok: true, message: "Setup inicial concluido." });
  } catch (error) {
    if (authUserId) {
      try {
        await createSupabaseAdminClient().auth.admin.deleteUser(authUserId);
      } catch {
        // Rollback best effort: Supabase Auth e tabelas locais nao compartilham transacao.
      }
    }

    if (error instanceof z.ZodError) {
      return errorResponse(error.errors[0]?.message ?? "Dados invalidos.", 422);
    }

    await writeSystemLog({
      level: "error",
      action: "setup.initial_admin.failed",
      message: "Falha no setup inicial.",
      context: { reason: error instanceof Error ? error.message : "unknown" }
    });

    if (error instanceof Error && safeSetupErrorMessages.has(error.message)) {
      return errorResponse(error.message, 500);
    }

    return errorResponse("Nao foi possivel concluir o setup inicial.", 500);
  }
}
