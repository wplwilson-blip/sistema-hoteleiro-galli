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

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const { session, response } = await requireAuthenticatedRequest();

  if (response || !session) {
    return response;
  }

  try {
    const payload = jobPositionPayloadSchema.parse(await request.json());
    const supabase = createSupabaseAdminClient();
    const organizationId = await getUnitOrganizationId(supabase, payload.unitId);

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
        updated_by: session.user.id
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

