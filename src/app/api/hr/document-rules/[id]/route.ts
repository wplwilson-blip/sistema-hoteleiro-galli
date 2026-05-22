import { NextResponse } from "next/server";
import { z } from "zod";
import {
  handleHrRouteError,
  HR_PERMISSIONS,
  hrApiError,
  logHrApiError,
  requireHrPermission
} from "@/lib/hr/api-auth";
import { prepareHrDocumentRuleWrite } from "@/lib/hr/document-rule-actions";
import {
  documentRuleListSelect,
  documentRuleSelect,
  mapHrDocumentRule,
  type HrDocumentRuleListRow,
  type HrDocumentRuleRow
} from "@/lib/hr/document-rules";
import { hrDocumentRuleUpdateSchema, hrIdParamSchema } from "@/lib/hr/schemas";

type RouteParams = { params: { id: string } };

function pickPayload<T extends Record<string, unknown>, K extends keyof T, F>(payload: T, key: K, fallback: F) {
  return Object.prototype.hasOwnProperty.call(payload, key) ? payload[key] : fallback;
}

async function loadExistingRule(context: NonNullable<Awaited<ReturnType<typeof requireHrPermission>>["context"]>, id: string) {
  const { data, error } = await context.supabase
    .from("hr_document_rules")
    .select(documentRuleSelect)
    .eq("id", id)
    .is("deleted_at", null)
    .limit(1);

  if (error) {
    logHrApiError("document_rules.lookup_failed", error);
    throw new Error("Nao foi possivel localizar a regra documental.");
  }

  return (data?.[0] as HrDocumentRuleRow | undefined) ?? null;
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.documentsManage);

  if (response || !context) {
    return response;
  }

  try {
    const { id } = hrIdParamSchema.parse(params);
    const payload = hrDocumentRuleUpdateSchema.parse(await request.json());
    const existing = await loadExistingRule(context, id);

    if (!existing) {
      return hrApiError("Regra documental nao encontrada.", 404);
    }

    const mergedPayload = {
      organizationId: pickPayload(payload, "organizationId", existing.organization_id ?? undefined) as string | undefined,
      unitId: pickPayload(payload, "unitId", existing.unit_id ?? undefined) as string | undefined,
      departmentId: pickPayload(payload, "departmentId", existing.department_id ?? undefined) as string | undefined,
      jobPositionId: pickPayload(payload, "jobPositionId", existing.job_position_id ?? undefined) as string | undefined,
      admissionType: pickPayload(payload, "admissionType", existing.admission_type ?? undefined) as string | undefined,
      documentTypeId: payload.documentTypeId ?? existing.document_type_id,
      isRequired: payload.isRequired ?? existing.is_required,
      dueDaysAfterAdmission: pickPayload(payload, "dueDaysAfterAdmission", existing.due_days_after_admission ?? undefined) as number | undefined,
      recurrenceMonths: pickPayload(payload, "recurrenceMonths", existing.recurrence_months ?? undefined) as number | undefined,
      priority: payload.priority ?? existing.priority,
      notes: pickPayload(payload, "notes", existing.notes ?? undefined) as string | undefined,
      status: payload.status ?? existing.status
    };
    const updatePayload = await prepareHrDocumentRuleWrite(context, mergedPayload);
    const { data, error } = await context.supabase
      .from("hr_document_rules")
      .update({
        ...updatePayload,
        updated_by: context.session.user.id
      })
      .eq("id", id)
      .select(documentRuleListSelect)
      .single();

    if (error) {
      logHrApiError("document_rules.update_failed", error);
      return hrApiError("Nao foi possivel atualizar a regra documental. Verifique se ja existe uma regra igual.", 500);
    }

    return NextResponse.json({ ok: true, data: mapHrDocumentRule(data as unknown as HrDocumentRuleListRow) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    }

    return handleHrRouteError(error, "Nao foi possivel atualizar a regra documental.");
  }
}
