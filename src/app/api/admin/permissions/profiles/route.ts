import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/permissions";
import { apiError, logBaseCadastroError, type SupabaseAdmin } from "@/lib/base-cadastros/api-helpers";
import { SUPER_ADMIN_PROFILE_CODE } from "@/lib/auth/session";

// Fase 3-A: perfis de acesso + suas permissoes concedidas (READ-ONLY). Gate: ADMIN:permissions.view.
// Fase 3-C: ESCRITA de autorizacao (permissoes de PERFIL). Gate: ADMIN:profiles.manage.
//   PUT (conceder) / DELETE (revogar = soft-delete). Escreve SOMENTE em profile_permissions.
//   A operacao afeta TODOS os usuarios do perfil de uma vez. Salvaguardas no backend (bloqueio total).
//   Upsert MANUAL (reativa linha soft-deletada; nunca duplica). Espelha o padrao de overrides/route.ts.
type ProfilePermission = { code: string; moduleCode: string; actionCode: string; name: string; description: string };

// Permissoes de administracao protegidas contra auto-trancamento (mesma lista da 3-B; espelhada na UI).
const PROTECTED_ADMIN = ["ADMIN:permissions.view", "ADMIN:overrides.manage", "ADMIN:profiles.manage"];

const writeSchema = z.object({
  profileId: z.string().uuid("Perfil invalido."),
  permissionCode: z.string().trim().min(1, "Permissao invalida.")
});

type ProfilePermissionRow = {
  id: string;
  access_profile_id: string;
  permission_id: string;
  is_allowed: boolean;
  status: string;
  deleted_at: string | null;
};

const PROFILE_PERMISSION_COLUMNS = "id, access_profile_id, permission_id, is_allowed, status, deleted_at";

async function loadProfile(supabase: SupabaseAdmin, profileId: string): Promise<{ id: string; code: string } | null> {
  const { data, error } = await supabase
    .from("access_profiles")
    .select("id, code")
    .eq("id", profileId)
    .eq("status", "active")
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    logBaseCadastroError("admin_profiles.profile_lookup_failed", error);
    throw new Error("Nao foi possivel validar o perfil.");
  }

  return data ? { id: data.id, code: data.code } : null;
}

async function resolvePermissionId(supabase: SupabaseAdmin, permissionCode: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("permissions")
    .select("id")
    .eq("code", permissionCode)
    .eq("status", "active")
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    logBaseCadastroError("admin_profiles.permission_lookup_failed", error);
    throw new Error("Nao foi possivel validar a permissao.");
  }

  return data?.id ?? null;
}

// Anti-auto-trancamento: o ator possui algum vinculo ATIVO usando o perfil-alvo?
// Query direta em user_unit_links (NAO usa o perfil ativo da sessao — o ator pode ter o perfil em
// unidade nao-ativa).
async function actorUsesProfile(supabase: SupabaseAdmin, actorId: string, profileId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("user_unit_links")
    .select("id")
    .eq("app_user_id", actorId)
    .eq("access_profile_id", profileId)
    .eq("status", "active")
    .is("deleted_at", null)
    .limit(1);

  if (error) {
    logBaseCadastroError("admin_profiles.actor_link_lookup_failed", error);
    throw new Error("Nao foi possivel validar o vinculo do ator.");
  }

  return Boolean(data?.length);
}

// Auditoria best-effort: NUNCA reverte a escrita ja efetivada; falha e' LOGADA (nao silenciada).
async function writeProfilePermissionAudit(
  supabase: SupabaseAdmin,
  input: {
    action: "insert" | "update" | "soft_delete";
    rowId: string;
    actorId: string;
    profileId: string;
    profileCode: string;
    permissionCode: string;
    isAllowed: boolean | null;
    oldValue: Record<string, unknown> | null;
    newValue: Record<string, unknown> | null;
  }
) {
  try {
    const { error } = await supabase.from("audit_trail").insert({
      action: input.action,
      module_code: "ADMIN",
      entity_type: "profile_permission",
      entity_id: input.rowId,
      table_name: "profile_permissions",
      app_user_id: input.actorId,
      old_value: input.oldValue,
      new_value: input.newValue,
      metadata: {
        profileId: input.profileId,
        profileCode: input.profileCode,
        permissionCode: input.permissionCode,
        isAllowed: input.isAllowed
      }
    });

    if (error) {
      logBaseCadastroError("admin_profiles.audit_write_failed", error);
    }
  } catch (error) {
    logBaseCadastroError("admin_profiles.audit_write_exception", error instanceof Error ? error : { message: "unknown" });
  }
}

export async function GET() {
  const { context, response } = await requirePermission("ADMIN:permissions.view");

  if (response || !context) {
    return response;
  }

  try {
    const supabase = context.supabase;
    const actorId = context.session.user.id;

    const { data: profiles, error: profilesError } = await supabase
      .from("access_profiles")
      .select("id, code, name, description, is_system_default")
      .eq("status", "active")
      .is("deleted_at", null)
      .order("name", { ascending: true });

    if (profilesError) {
      logBaseCadastroError("admin_permissions.profiles_failed", profilesError);
      return apiError("Nao foi possivel carregar os perfis de acesso.", 500);
    }

    const profileIds = (profiles ?? []).map((profile) => profile.id);

    const { data: grantRows, error: grantError } = profileIds.length
      ? await supabase
          .from("profile_permissions")
          .select("access_profile_id, permissions!inner(code, module_code, action_code, name, description, status, deleted_at)")
          .in("access_profile_id", profileIds)
          .eq("is_allowed", true)
          .eq("status", "active")
          .is("deleted_at", null)
      : { data: [], error: null };

    if (grantError) {
      logBaseCadastroError("admin_permissions.profile_grants_failed", grantError);
      return apiError("Nao foi possivel carregar as permissoes dos perfis.", 500);
    }

    const permissionsByProfile = new Map<string, ProfilePermission[]>();
    for (const row of (grantRows ?? []) as any[]) {
      const permission = row.permissions as { code: string; module_code: string; action_code: string; name: string; description: string | null; status: string; deleted_at: string | null };
      // Ignora permissoes inativas/removidas (o !inner apenas garante existencia do vinculo).
      if (!permission || permission.status !== "active" || permission.deleted_at) {
        continue;
      }
      const list = permissionsByProfile.get(row.access_profile_id) ?? [];
      list.push({
        code: permission.code,
        moduleCode: permission.module_code,
        actionCode: permission.action_code,
        name: permission.name,
        description: permission.description ?? ""
      });
      permissionsByProfile.set(row.access_profile_id, list);
    }

    // Fase 3-C: contagem de impacto (usuarios distintos por perfil) + se o ATOR usa o perfil.
    const { data: linkRows, error: linkError } = profileIds.length
      ? await supabase
          .from("user_unit_links")
          .select("access_profile_id, app_user_id")
          .in("access_profile_id", profileIds)
          .eq("status", "active")
          .is("deleted_at", null)
      : { data: [], error: null };

    if (linkError) {
      logBaseCadastroError("admin_permissions.profile_links_failed", linkError);
      return apiError("Nao foi possivel calcular o impacto dos perfis.", 500);
    }

    const usersByProfile = new Map<string, Set<string>>();
    for (const link of (linkRows ?? []) as Array<{ access_profile_id: string; app_user_id: string }>) {
      const set = usersByProfile.get(link.access_profile_id) ?? new Set<string>();
      set.add(link.app_user_id);
      usersByProfile.set(link.access_profile_id, set);
    }

    return NextResponse.json({
      ok: true,
      profiles: (profiles ?? []).map((profile) => {
        const users = usersByProfile.get(profile.id);
        return {
          id: profile.id,
          code: profile.code,
          name: profile.name,
          description: profile.description ?? "",
          isSystemDefault: Boolean(profile.is_system_default),
          userCount: users?.size ?? 0,
          usedByActor: users?.has(actorId) ?? false,
          permissions: permissionsByProfile.get(profile.id) ?? []
        };
      })
    });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Nao foi possivel carregar os perfis de acesso.", 500);
  }
}

export async function PUT(request: Request) {
  const { context, response } = await requirePermission("ADMIN:profiles.manage");

  if (response || !context) {
    return response;
  }

  try {
    const payload = writeSchema.parse(await request.json());
    const supabase = context.supabase;
    const actorId = context.session.user.id;

    const profile = await loadProfile(supabase, payload.profileId);
    if (!profile) {
      return apiError("Perfil nao encontrado.", 404);
    }

    // Salvaguarda (a): SUPER_ADMIN intocavel.
    if (profile.code === SUPER_ADMIN_PROFILE_CODE) {
      return apiError("O perfil Super Administrador nao pode ser editado.", 422);
    }

    const permissionId = await resolvePermissionId(supabase, payload.permissionCode);
    if (!permissionId) {
      return apiError("Permissao nao encontrada.", 422);
    }

    // Conceder (PUT) nao reduz o proprio acesso => nao ha trava de auto-trancamento aqui.
    // Upsert MANUAL: procura a linha existente (qualquer status), incluindo soft-deletadas.
    const { data: existing, error: existingError } = await supabase
      .from("profile_permissions")
      .select(PROFILE_PERMISSION_COLUMNS)
      .eq("access_profile_id", profile.id)
      .eq("permission_id", permissionId)
      .limit(1)
      .maybeSingle();

    if (existingError) {
      logBaseCadastroError("admin_profiles.existing_lookup_failed", existingError);
      return apiError("Nao foi possivel validar a permissao existente.", 500);
    }

    let rowId: string;

    if (existing) {
      // Reutiliza/reativa a MESMA linha (nunca cria uma segunda para o mesmo perfil/permissao).
      const current = existing as ProfilePermissionRow;
      const { data: updated, error: updateError } = await supabase
        .from("profile_permissions")
        .update({
          is_allowed: true,
          status: "active",
          deleted_at: null,
          deleted_by: null,
          updated_by: actorId
        })
        .eq("id", current.id)
        .select(PROFILE_PERMISSION_COLUMNS)
        .single();

      if (updateError || !updated) {
        logBaseCadastroError("admin_profiles.update_failed", updateError ?? { message: "no row" });
        return apiError("Nao foi possivel salvar a permissao do perfil.", 500);
      }

      rowId = current.id;
      await writeProfilePermissionAudit(supabase, {
        action: "update",
        rowId,
        actorId,
        profileId: profile.id,
        profileCode: profile.code,
        permissionCode: payload.permissionCode,
        isAllowed: true,
        oldValue: { ...current },
        newValue: updated as Record<string, unknown>
      });
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from("profile_permissions")
        .insert({
          access_profile_id: profile.id,
          permission_id: permissionId,
          is_allowed: true,
          status: "active",
          created_by: actorId,
          updated_by: actorId
        })
        .select(PROFILE_PERMISSION_COLUMNS)
        .single();

      if (insertError || !inserted) {
        logBaseCadastroError("admin_profiles.insert_failed", insertError ?? { message: "no row" });
        return apiError("Nao foi possivel conceder a permissao ao perfil.", 500);
      }

      rowId = (inserted as ProfilePermissionRow).id;
      await writeProfilePermissionAudit(supabase, {
        action: "insert",
        rowId,
        actorId,
        profileId: profile.id,
        profileCode: profile.code,
        permissionCode: payload.permissionCode,
        isAllowed: true,
        oldValue: null,
        newValue: inserted as Record<string, unknown>
      });
    }

    return NextResponse.json({
      ok: true,
      grant: { profileId: profile.id, permissionCode: payload.permissionCode, isAllowed: true }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    }
    return apiError(error instanceof Error ? error.message : "Nao foi possivel salvar a permissao do perfil.", 500);
  }
}

export async function DELETE(request: Request) {
  const { context, response } = await requirePermission("ADMIN:profiles.manage");

  if (response || !context) {
    return response;
  }

  try {
    const payload = writeSchema.parse(await request.json());
    const supabase = context.supabase;
    const actorId = context.session.user.id;

    const profile = await loadProfile(supabase, payload.profileId);
    if (!profile) {
      return apiError("Perfil nao encontrado.", 404);
    }

    // Salvaguarda (a): SUPER_ADMIN intocavel.
    if (profile.code === SUPER_ADMIN_PROFILE_CODE) {
      return apiError("O perfil Super Administrador nao pode ser editado.", 422);
    }

    const permissionId = await resolvePermissionId(supabase, payload.permissionCode);
    if (!permissionId) {
      return apiError("Permissao nao encontrada.", 422);
    }

    // Salvaguarda (b): anti auto-trancamento — nao remover permissao de administracao de um perfil
    // que o PROPRIO ator utiliza.
    if (PROTECTED_ADMIN.includes(payload.permissionCode) && (await actorUsesProfile(supabase, actorId, profile.id))) {
      return apiError("Voce nao pode remover permissoes de administracao de um perfil que voce mesmo utiliza.", 422);
    }

    const { data: existing, error: existingError } = await supabase
      .from("profile_permissions")
      .select(PROFILE_PERMISSION_COLUMNS)
      .eq("access_profile_id", profile.id)
      .eq("permission_id", permissionId)
      .eq("status", "active")
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();

    if (existingError) {
      logBaseCadastroError("admin_profiles.delete_lookup_failed", existingError);
      return apiError("Nao foi possivel validar a permissao do perfil.", 500);
    }

    // Idempotente: sem grant ativo, nao ha o que revogar.
    if (!existing) {
      return NextResponse.json({ ok: true, removed: false });
    }

    const current = existing as ProfilePermissionRow;
    const { data: updated, error: updateError } = await supabase
      .from("profile_permissions")
      .update({ status: "inactive", deleted_at: new Date().toISOString(), deleted_by: actorId, updated_by: actorId })
      .eq("id", current.id)
      .select(PROFILE_PERMISSION_COLUMNS)
      .single();

    if (updateError || !updated) {
      logBaseCadastroError("admin_profiles.soft_delete_failed", updateError ?? { message: "no row" });
      return apiError("Nao foi possivel revogar a permissao do perfil.", 500);
    }

    await writeProfilePermissionAudit(supabase, {
      action: "soft_delete",
      rowId: current.id,
      actorId,
      profileId: profile.id,
      profileCode: profile.code,
      permissionCode: payload.permissionCode,
      isAllowed: null,
      oldValue: { ...current },
      newValue: updated as Record<string, unknown>
    });

    return NextResponse.json({ ok: true, removed: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    }
    return apiError(error instanceof Error ? error.message : "Nao foi possivel revogar a permissao do perfil.", 500);
  }
}
