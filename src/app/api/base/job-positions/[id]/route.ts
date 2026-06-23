import { NextResponse } from "next/server";
import { z } from "zod";
import { BASE_PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { jobPositionPayloadSchema } from "@/lib/base-cadastros/schemas";
import {
  apiError,
  getUnitOrganizationId,
  logBaseCadastroError,
} from "@/lib/base-cadastros/api-helpers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

async function hasJobPositionCodeInOrganization(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  organizationId: string,
  code: string,
  currentJobPositionId: string
) {
  const { data, error } = await supabase
    .from("job_positions")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("code", code)
    .neq("id", currentJobPositionId)
    .is("deleted_at", null)
    .limit(1);

  if (error) {
    logBaseCadastroError("job_position.code_lookup_failed", error);
    throw new Error("Nao foi possivel validar o codigo do cargo.");
  }

  return Boolean(data?.[0]);
}

async function validateDepartmentForUnit(supabase: ReturnType<typeof createSupabaseAdminClient>, departmentId: string | undefined, unitId: string) {
  if (!departmentId) {
    return;
  }

  const { data, error } = await supabase
    .from("departments")
    .select("id")
    .eq("id", departmentId)
    .eq("unit_id", unitId)
    .is("deleted_at", null)
    .limit(1);

  if (error) {
    logBaseCadastroError("job_position.department_lookup_failed", error);
    throw new Error("Nao foi possivel validar o departamento do cargo.");
  }

  if (!data?.[0]) {
    throw new Error("Departamento nao encontrado para a unidade selecionada.");
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const { context, response } = await requirePermission(BASE_PERMISSIONS.jobPositionsManage);

  if (response || !context) {
    return response;
  }

  try {
    if (!context.isSuperAdmin) {
      return apiError("Voce nao tem permissao para editar cargos.", 403);
    }

    const payload = jobPositionPayloadSchema.parse(await request.json());
    const supabase = context.supabase;
    const organizationId = await getUnitOrganizationId(supabase, payload.unitId);
    await validateDepartmentForUnit(supabase, payload.departmentId, payload.unitId);

    if (await hasJobPositionCodeInOrganization(supabase, organizationId, payload.code, params.id)) {
      return apiError("Ja existe um cargo com este codigo nesta organizacao.", 409);
    }

    const { error } = await supabase
      .from("job_positions")
      .update({
        organization_id: organizationId,
        unit_id: payload.unitId,
        department_id: payload.departmentId ?? null,
        code: payload.code,
        name: payload.name,
        description: payload.description || null,
        is_leadership: payload.isLeadership,
        status: payload.status,
        updated_by: context.session.user.id
      })
      .eq("id", params.id)
      .is("deleted_at", null);

    if (error) {
      logBaseCadastroError("job_position.update_failed", error);
      return apiError("Nao foi possivel atualizar o cargo.", 500);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    }

    return apiError(error instanceof Error ? error.message : "Nao foi possivel atualizar o cargo.", 500);
  }
}
