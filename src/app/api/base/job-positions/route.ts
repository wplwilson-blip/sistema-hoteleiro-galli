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
  code: string
) {
  const { data, error } = await supabase
    .from("job_positions")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("code", code)
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

export async function GET() {
  const { context, response } = await requirePermission(BASE_PERMISSIONS.jobPositionsView);

  if (response || !context) {
    return response;
  }

  try {
    if (!context.isSuperAdmin && !context.accessibleUnitIds.length) {
      return NextResponse.json({ ok: true, positions: [] });
    }

    let positionsQuery = context.supabase
      .from("job_positions")
      .select("id, organization_id, unit_id, department_id, code, name, description, is_leadership, status, created_at")
      .is("deleted_at", null)
      .not("unit_id", "is", null)
      .order("name", { ascending: true });

    if (!context.isSuperAdmin) {
      positionsQuery = positionsQuery.in("unit_id", context.accessibleUnitIds);
    }

    const { data: positions, error: positionsError } = await positionsQuery;

    if (positionsError) {
      logBaseCadastroError("job_positions.list_failed", positionsError);
      return apiError("Nao foi possivel carregar os cargos.", 500);
    }

    const unitIds = Array.from(new Set((positions ?? []).map((position) => position.unit_id).filter(Boolean)));
    const departmentIds = Array.from(new Set((positions ?? []).map((position) => position.department_id).filter(Boolean)));

    const { data: units, error: unitsError } = unitIds.length
      ? await context.supabase.from("units").select("id, code, name").in("id", unitIds)
      : { data: [], error: null };
    const { data: departments, error: departmentsError } = departmentIds.length
      ? await context.supabase.from("departments").select("id, code, name").in("id", departmentIds)
      : { data: [], error: null };

    if (unitsError) {
      logBaseCadastroError("job_positions.units_lookup_failed", unitsError);
      return apiError("Nao foi possivel carregar as unidades dos cargos.", 500);
    }

    if (departmentsError) {
      logBaseCadastroError("job_positions.departments_lookup_failed", departmentsError);
      return apiError("Nao foi possivel carregar os departamentos dos cargos.", 500);
    }

    const unitsById = new Map((units ?? []).map((unit) => [unit.id, unit]));
    const departmentsById = new Map((departments ?? []).map((department) => [department.id, department]));

    return NextResponse.json({
      ok: true,
      positions: (positions ?? []).map((position) => {
        const unit = position.unit_id ? unitsById.get(position.unit_id) : null;
        const department = position.department_id ? departmentsById.get(position.department_id) : null;

        return {
          id: position.id,
          organizationId: position.organization_id,
          unitId: position.unit_id,
          unitName: unit?.name ?? "",
          unitCode: unit?.code ?? "",
          departmentId: position.department_id,
          departmentName: department?.name ?? "",
          departmentCode: department?.code ?? "",
          code: position.code,
          name: position.name,
          description: position.description ?? "",
          isLeadership: position.is_leadership,
          status: position.status,
          createdAt: position.created_at
        };
      })
    });
  } catch {
    return apiError("Nao foi possivel carregar os cargos.", 500);
  }
}

export async function POST(request: Request) {
  const { context, response } = await requirePermission(BASE_PERMISSIONS.jobPositionsManage);

  if (response || !context) {
    return response;
  }

  try {
    if (!context.isSuperAdmin) {
      return apiError("Voce nao tem permissao para criar cargos.", 403);
    }

    const payload = jobPositionPayloadSchema.parse(await request.json());
    const supabase = context.supabase;
    const organizationId = await getUnitOrganizationId(supabase, payload.unitId);
    await validateDepartmentForUnit(supabase, payload.departmentId, payload.unitId);

    if (await hasJobPositionCodeInOrganization(supabase, organizationId, payload.code)) {
      return apiError("Ja existe um cargo com este codigo nesta organizacao.", 409);
    }

    const { error } = await supabase.from("job_positions").insert({
      organization_id: organizationId,
      unit_id: payload.unitId,
      department_id: payload.departmentId ?? null,
      code: payload.code,
      name: payload.name,
      description: payload.description || null,
      is_leadership: payload.isLeadership,
      status: payload.status,
      created_by: context.session.user.id,
      updated_by: context.session.user.id
    });

    if (error) {
      logBaseCadastroError("job_position.create_failed", error);
      return apiError("Nao foi possivel salvar o cargo.", 500);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    }

    return apiError(error instanceof Error ? error.message : "Nao foi possivel salvar o cargo.", 500);
  }
}
