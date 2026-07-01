import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/permissions";
import { apiError, logBaseCadastroError } from "@/lib/base-cadastros/api-helpers";
import { appUserHasSuperAdminLink } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// Fase 3-B: ESCRITA de autorizacao (excecoes por usuario). Gate: ADMIN:overrides.manage.
// Escreve SOMENTE em user_permission_overrides. unit_id SEMPRE null (escopo = todas as unidades).
// Upsert MANUAL (o unique nao dedupe com unit_id NULL): reusa/reativa a linha existente, nunca duplica.
// DELETE = soft-delete (status inactive + deleted_at/deleted_by), idempotente. Salvaguardas no backend.

type SupabaseAdmin = ReturnType<typeof createSupabaseAdminClient>;

// Permissoes de administracao protegidas contra auto-trancamento (o ator nao pode negar/remover a
// propria capacidade de administrar acessos).
const PROTECTED_ADMIN = ["ADMIN:permissions.view", "ADMIN:overrides.manage", "ADMIN:profiles.manage"];

const putSchema = z.object({
  targetUserId: z.string().uuid("Usuario invalido."),
  permissionCode: z.string().trim().min(1, "Permissao invalida."),
  isAllowed: z.boolean({ required_error: "Informe conceder ou negar.", invalid_type_error: "Informe conceder ou negar." }),
  reason: z.string().trim().optional().or(z.literal("").transform(() => undefined))
});

const deleteSchema = z.object({
  targetUserId: z.string().uuid("Usuario invalido."),
  permissionCode: z.string().trim().min(1, "Permissao invalida.")
});

type OverrideRow = {
  id: string;
  app_user_id: string;
  unit_id: string | null;
  permission_id: string;
  is_allowed: boolean;
  reason: string | null;
  status: string;
  deleted_at: string | null;
};

const OVERRIDE_COLUMNS = "id, app_user_id, unit_id, permission_id, is_allowed, reason, status, deleted_at";

async function resolvePermissionId(supabase: SupabaseAdmin, permissionCode: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("permissions")
    .select("id")
    .eq("code", permissionCode)
    .eq("status", "active")
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    logBaseCadastroError("admin_overrides.permission_lookup_failed", error);
    throw new Error("Nao foi possivel validar a permissao.");
  }

  return data?.id ?? null;
}

async function assertTargetExists(supabase: SupabaseAdmin, targetUserId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("app_users")
    .select("id")
    .eq("id", targetUserId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    logBaseCadastroError("admin_overrides.target_lookup_failed", error);
    throw new Error("Nao foi possivel validar o usuario.");
  }

  return Boolean(data);
}

// Auditoria best-effort: NUNCA reverte a escrita ja efetivada; falha e' LOGADA (nao silenciada).
async function writeOverrideAudit(
  supabase: SupabaseAdmin,
  input: {
    action: "insert" | "update" | "soft_delete";
    overrideId: string;
    actorId: string;
    targetUserId: string;
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
      entity_type: "user_permission_override",
      entity_id: input.overrideId,
      table_name: "user_permission_overrides",
      app_user_id: input.actorId,
      old_value: input.oldValue,
      new_value: input.newValue,
      metadata: { targetUserId: input.targetUserId, permissionCode: input.permissionCode, isAllowed: input.isAllowed }
    });

    if (error) {
      logBaseCadastroError("admin_overrides.audit_write_failed", error);
    }
  } catch (error) {
    logBaseCadastroError("admin_overrides.audit_write_exception", error instanceof Error ? error : { message: "unknown" });
  }
}

export async function PUT(request: Request) {
  const { context, response } = await requirePermission("ADMIN:overrides.manage");

  if (response || !context) {
    return response;
  }

  try {
    const payload = putSchema.parse(await request.json());
    const supabase = context.supabase;
    const actorId = context.session.user.id;

    const permissionId = await resolvePermissionId(supabase, payload.permissionCode);
    if (!permissionId) {
      return apiError("Permissao nao encontrada.", 422);
    }

    if (!(await assertTargetExists(supabase, payload.targetUserId))) {
      return apiError("Usuario nao encontrado.", 404);
    }

    // Salvaguarda (a): alvo super admin nao pode ter excecao.
    if (await appUserHasSuperAdminLink(supabase, payload.targetUserId)) {
      return apiError("Nao e possivel criar excecoes de permissao para um super administrador.", 422);
    }

    // Salvaguarda (b): anti auto-trancamento (negar a si mesmo permissao de administracao).
    if (payload.targetUserId === actorId && PROTECTED_ADMIN.includes(payload.permissionCode) && payload.isAllowed === false) {
      return apiError("Voce nao pode remover a sua propria capacidade de administrar acessos.", 422);
    }

    // Upsert MANUAL: procura a linha existente (qualquer status), incluindo soft-deletadas.
    const { data: existing, error: existingError } = await supabase
      .from("user_permission_overrides")
      .select(OVERRIDE_COLUMNS)
      .eq("app_user_id", payload.targetUserId)
      .eq("permission_id", permissionId)
      .is("unit_id", null)
      .limit(1)
      .maybeSingle();

    if (existingError) {
      logBaseCadastroError("admin_overrides.existing_lookup_failed", existingError);
      return apiError("Nao foi possivel validar a excecao existente.", 500);
    }

    const reason = payload.reason ?? null;
    let overrideId: string;
    let action: "insert" | "update";
    let oldValue: Record<string, unknown> | null = null;

    if (existing) {
      // Reutiliza/reativa a MESMA linha (nunca cria uma segunda para a mesma pessoa/permissao).
      const current = existing as OverrideRow;
      oldValue = { ...current };
      const { data: updated, error: updateError } = await supabase
        .from("user_permission_overrides")
        .update({
          is_allowed: payload.isAllowed,
          reason,
          status: "active",
          deleted_at: null,
          deleted_by: null,
          updated_by: actorId
        })
        .eq("id", current.id)
        .select(OVERRIDE_COLUMNS)
        .single();

      if (updateError || !updated) {
        logBaseCadastroError("admin_overrides.update_failed", updateError ?? { message: "no row" });
        return apiError("Nao foi possivel salvar a excecao.", 500);
      }

      overrideId = current.id;
      action = "update";
      await writeOverrideAudit(supabase, {
        action,
        overrideId,
        actorId,
        targetUserId: payload.targetUserId,
        permissionCode: payload.permissionCode,
        isAllowed: payload.isAllowed,
        oldValue,
        newValue: updated as Record<string, unknown>
      });
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from("user_permission_overrides")
        .insert({
          app_user_id: payload.targetUserId,
          unit_id: null,
          permission_id: permissionId,
          is_allowed: payload.isAllowed,
          reason,
          status: "active",
          created_by: actorId,
          updated_by: actorId
        })
        .select(OVERRIDE_COLUMNS)
        .single();

      if (insertError || !inserted) {
        logBaseCadastroError("admin_overrides.insert_failed", insertError ?? { message: "no row" });
        return apiError("Nao foi possivel criar a excecao.", 500);
      }

      overrideId = (inserted as OverrideRow).id;
      action = "insert";
      await writeOverrideAudit(supabase, {
        action,
        overrideId,
        actorId,
        targetUserId: payload.targetUserId,
        permissionCode: payload.permissionCode,
        isAllowed: payload.isAllowed,
        oldValue: null,
        newValue: inserted as Record<string, unknown>
      });
    }

    return NextResponse.json({
      ok: true,
      override: { id: overrideId, permissionCode: payload.permissionCode, isAllowed: payload.isAllowed, reason }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    }
    return apiError(error instanceof Error ? error.message : "Nao foi possivel salvar a excecao.", 500);
  }
}

export async function DELETE(request: Request) {
  const { context, response } = await requirePermission("ADMIN:overrides.manage");

  if (response || !context) {
    return response;
  }

  try {
    const payload = deleteSchema.parse(await request.json());
    const supabase = context.supabase;
    const actorId = context.session.user.id;

    const permissionId = await resolvePermissionId(supabase, payload.permissionCode);
    if (!permissionId) {
      return apiError("Permissao nao encontrada.", 422);
    }

    if (!(await assertTargetExists(supabase, payload.targetUserId))) {
      return apiError("Usuario nao encontrado.", 404);
    }

    // Salvaguarda (a): alvo super admin.
    if (await appUserHasSuperAdminLink(supabase, payload.targetUserId)) {
      return apiError("Nao e possivel alterar excecoes de um super administrador.", 422);
    }

    // Salvaguarda (b): remover a propria excecao de administracao poderia se auto-trancar.
    if (payload.targetUserId === actorId && PROTECTED_ADMIN.includes(payload.permissionCode)) {
      return apiError("Voce nao pode remover a sua propria capacidade de administrar acessos.", 422);
    }

    const { data: existing, error: existingError } = await supabase
      .from("user_permission_overrides")
      .select(OVERRIDE_COLUMNS)
      .eq("app_user_id", payload.targetUserId)
      .eq("permission_id", permissionId)
      .is("unit_id", null)
      .eq("status", "active")
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();

    if (existingError) {
      logBaseCadastroError("admin_overrides.delete_lookup_failed", existingError);
      return apiError("Nao foi possivel validar a excecao.", 500);
    }

    // Idempotente: sem excecao ativa, nao ha o que remover.
    if (!existing) {
      return NextResponse.json({ ok: true, removed: false });
    }

    const current = existing as OverrideRow;
    const { data: updated, error: updateError } = await supabase
      .from("user_permission_overrides")
      .update({ status: "inactive", deleted_at: new Date().toISOString(), deleted_by: actorId, updated_by: actorId })
      .eq("id", current.id)
      .select(OVERRIDE_COLUMNS)
      .single();

    if (updateError || !updated) {
      logBaseCadastroError("admin_overrides.soft_delete_failed", updateError ?? { message: "no row" });
      return apiError("Nao foi possivel remover a excecao.", 500);
    }

    await writeOverrideAudit(supabase, {
      action: "soft_delete",
      overrideId: current.id,
      actorId,
      targetUserId: payload.targetUserId,
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
    return apiError(error instanceof Error ? error.message : "Nao foi possivel remover a excecao.", 500);
  }
}
