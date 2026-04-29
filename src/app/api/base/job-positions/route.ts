import { NextResponse } from "next/server";
import { z } from "zod";
import { jobPositionPayloadSchema } from "@/lib/base-cadastros/schemas";
import {
  apiError,
  getUnitOrganizationId,
  logBaseCadastroError,
  requireAuthenticatedRequest
} from "@/lib/base-cadastros/api-helpers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const { response } = await requireAuthenticatedRequest();

  if (response) {
    return response;
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { data: positions, error: positionsError } = await supabase
      .from("job_positions")
      .select("id, organization_id, unit_id, department_id, code, name, description, is_leadership, status, created_at")
      .is("deleted_at", null)
      .not("unit_id", "is", null)
      .order("name", { ascending: true });

    if (positionsError) {
      logBaseCadastroError("job_positions.list_failed", positionsError);
      return apiError("Nao foi possivel carregar os cargos.", 500);
    }

    const unitIds = Array.from(new Set((positions ?? []).map((position) => position.unit_id).filter(Boolean)));
    const departmentIds = Array.from(new Set((positions ?? []).map((position) => position.department_id).filter(Boolean)));

    const { data: units, error: unitsError } = unitIds.length
      ? await supabase.from("units").select("id, code, name").in("id", unitIds)
      : { data: [], error: null };
    const { data: departments, error: departmentsError } = departmentIds.length
      ? await supabase.from("departments").select("id, code, name").in("id", departmentIds)
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
  const { session, response } = await requireAuthenticatedRequest();

  if (response || !session) {
    return response;
  }

  try {
    const payload = jobPositionPayloadSchema.parse(await request.json());
    const supabase = createSupabaseAdminClient();
    const organizationId = await getUnitOrganizationId(supabase, payload.unitId);

    const { error } = await supabase.from("job_positions").insert({
      organization_id: organizationId,
      unit_id: payload.unitId,
      department_id: payload.departmentId ?? null,
      code: payload.code,
      name: payload.name,
      description: payload.description || null,
      is_leadership: payload.isLeadership,
      status: payload.status,
      created_by: session.user.id,
      updated_by: session.user.id
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
