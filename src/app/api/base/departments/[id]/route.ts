import { NextResponse } from "next/server";
import { z } from "zod";
import { BASE_PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { departmentPayloadSchema } from "@/lib/base-cadastros/schemas";
import {
  apiError,
  getUnitOrganizationId,
  logBaseCadastroError,
} from "@/lib/base-cadastros/api-helpers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

async function hasDepartmentCodeInUnit(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  unitId: string,
  code: string,
  currentDepartmentId: string
) {
  const { data, error } = await supabase
    .from("departments")
    .select("id")
    .eq("unit_id", unitId)
    .eq("code", code)
    .neq("id", currentDepartmentId)
    .is("deleted_at", null)
    .limit(1);

  if (error) {
    logBaseCadastroError("department.code_lookup_failed", error);
    throw new Error("Nao foi possivel validar o codigo do departamento.");
  }

  return Boolean(data?.[0]);
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const { context, response } = await requirePermission(BASE_PERMISSIONS.departmentsManage);

  if (response || !context) {
    return response;
  }

  try {
    if (!context.isSuperAdmin) {
      return apiError("Voce nao tem permissao para editar departamentos.", 403);
    }

    const payload = departmentPayloadSchema.parse(await request.json());
    const supabase = context.supabase;
    const organizationId = await getUnitOrganizationId(supabase, payload.unitId);

    if (await hasDepartmentCodeInUnit(supabase, payload.unitId, payload.code, params.id)) {
      return apiError("Ja existe um departamento com este codigo nesta unidade.", 409);
    }

    const { error } = await supabase
      .from("departments")
      .update({
        organization_id: organizationId,
        unit_id: payload.unitId,
        code: payload.code,
        name: payload.name,
        description: payload.description || null,
        status: payload.status,
        updated_by: context.session.user.id
      })
      .eq("id", params.id)
      .is("deleted_at", null);

    if (error) {
      logBaseCadastroError("department.update_failed", error);
      return apiError("Nao foi possivel atualizar o departamento.", 500);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    }

    return apiError(error instanceof Error ? error.message : "Nao foi possivel atualizar o departamento.", 500);
  }
}
