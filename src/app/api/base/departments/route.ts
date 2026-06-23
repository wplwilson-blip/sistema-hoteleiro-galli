import { NextResponse } from "next/server";
import { z } from "zod";
import { BASE_PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { departmentPayloadSchema } from "@/lib/base-cadastros/schemas";
import {
  apiError,
  getUnitOrganizationId,
  logBaseCadastroError
} from "@/lib/base-cadastros/api-helpers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

async function hasDepartmentCodeInUnit(supabase: ReturnType<typeof createSupabaseAdminClient>, unitId: string, code: string) {
  const { data, error } = await supabase
    .from("departments")
    .select("id")
    .eq("unit_id", unitId)
    .eq("code", code)
    .is("deleted_at", null)
    .limit(1);

  if (error) {
    logBaseCadastroError("department.code_lookup_failed", error);
    throw new Error("Nao foi possivel validar o codigo do departamento.");
  }

  return Boolean(data?.[0]);
}

export async function GET() {
  const { context, response } = await requirePermission(BASE_PERMISSIONS.departmentsView);

  if (response || !context) {
    return response;
  }

  try {
    if (!context.isSuperAdmin && !context.accessibleUnitIds.length) {
      return NextResponse.json({ ok: true, departments: [] });
    }

    let departmentQuery = context.supabase
      .from("departments")
      .select("id, organization_id, unit_id, code, name, description, status, created_at")
      .is("deleted_at", null)
      .not("unit_id", "is", null)
      .order("name", { ascending: true });

    if (!context.isSuperAdmin) {
      departmentQuery = departmentQuery.in("unit_id", context.accessibleUnitIds);
    }

    const { data: departments, error: departmentsError } = await departmentQuery;

    if (departmentsError) {
      logBaseCadastroError("departments.list_failed", departmentsError);
      return apiError("Nao foi possivel carregar os departamentos.", 500);
    }

    const unitIds = Array.from(new Set((departments ?? []).map((department) => department.unit_id).filter(Boolean)));
    const { data: units, error: unitsError } = unitIds.length
      ? await context.supabase.from("units").select("id, code, name").in("id", unitIds)
      : { data: [], error: null };

    if (unitsError) {
      logBaseCadastroError("departments.units_lookup_failed", unitsError);
      return apiError("Nao foi possivel carregar as unidades dos departamentos.", 500);
    }

    const unitsById = new Map((units ?? []).map((unit) => [unit.id, unit]));

    return NextResponse.json({
      ok: true,
      departments: (departments ?? []).map((department) => {
        const unit = department.unit_id ? unitsById.get(department.unit_id) : null;

        return {
          id: department.id,
          organizationId: department.organization_id,
          unitId: department.unit_id,
          unitName: unit?.name ?? "",
          unitCode: unit?.code ?? "",
          code: department.code,
          name: department.name,
          description: department.description ?? "",
          status: department.status,
          createdAt: department.created_at
        };
      })
    });
  } catch {
    return apiError("Nao foi possivel carregar os departamentos.", 500);
  }
}

export async function POST(request: Request) {
  const { context, response } = await requirePermission(BASE_PERMISSIONS.departmentsManage);

  if (response || !context) {
    return response;
  }

  try {
    if (!context.isSuperAdmin) {
      return apiError("Voce nao tem permissao para criar departamentos.", 403);
    }

    const payload = departmentPayloadSchema.parse(await request.json());
    const supabase = context.supabase;
    const organizationId = await getUnitOrganizationId(supabase, payload.unitId);

    if (await hasDepartmentCodeInUnit(supabase, payload.unitId, payload.code)) {
      return apiError("Ja existe um departamento com este codigo nesta unidade.", 409);
    }

    const { error } = await supabase.from("departments").insert({
      organization_id: organizationId,
      unit_id: payload.unitId,
      code: payload.code,
      name: payload.name,
      description: payload.description || null,
      status: payload.status,
      created_by: context.session.user.id,
      updated_by: context.session.user.id
    });

    if (error) {
      logBaseCadastroError("department.create_failed", error);
      return apiError("Nao foi possivel salvar o departamento.", 500);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    }

    return apiError(error instanceof Error ? error.message : "Nao foi possivel salvar o departamento.", 500);
  }
}
