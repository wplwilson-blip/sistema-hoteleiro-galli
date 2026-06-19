import { NextResponse } from "next/server";
import { z } from "zod";

import {
  HR_ADMISSION_CHECKLIST_ITEM_SELECT,
  loadAdmissionProcessById,
  recalculateAdmissionProcessAggregateStatuses,
  type HrAdmissionChecklistItemRow,
  type HrAdmissionChecklistStatus
} from "@/lib/hr/admission-processes";
import { handleHrRouteError, HR_PERMISSIONS, hrApiError, logHrApiError, requireHrPermission } from "@/lib/hr/api-auth";

export const dynamic = "force-dynamic";

const checklistItemParamsSchema = z.object({
  id: z.string().uuid("Identificador de processo invalido."),
  itemId: z.string().uuid("Identificador de item invalido.")
});

const checklistStatusSchema = z.enum([
  "pending",
  "requested",
  "received",
  "under_review",
  "approved",
  "rejected",
  "waived",
  "completed",
  "not_applicable",
  "cancelled"
]);

const optionalTextSchema = (max: number) =>
  z
    .preprocess((value) => (typeof value === "string" ? value.trim().replace(/\s+/g, " ") : value), z.string().max(max).nullable().optional())
    .transform((value) => {
      if (value === undefined) return undefined;
      return value ? value : null;
    });

const checklistItemPatchSchema = z.object({
  status: checklistStatusSchema,
  notes: optionalTextSchema(2000),
  waiverReason: optionalTextSchema(1000),
  rejectionReason: optionalTextSchema(1000)
});

const allowedStatusesByItemKey: Record<string, readonly HrAdmissionChecklistStatus[]> = {
  request_documents: ["requested", "completed", "waived"],
  review_documents: ["under_review", "approved", "rejected", "waived"],
  send_to_accounting: ["requested", "completed", "waived"],
  confirm_registration: ["completed", "waived"],
  occupational_health_aso: ["requested", "completed", "waived"],
  uniform_delivery: ["completed", "waived"],
  start_onboarding: ["completed", "waived"]
};

const completionStatuses = new Set<HrAdmissionChecklistStatus>(["completed", "approved"]);
const forbiddenChecklistTextPattern =
  /([0-9]{3}\.?[0-9]{3}\.?[0-9]{3}-?[0-9]{2}|\b(cpf|rg|ctps|pis|sal(?:a|\u00e1)rio|salary|folha|e-?social|c(?:a|\u00e1)lculo|financeiro|valores?|remunera(?:c|\u00e7)(?:a|\u00e3)o|auth_email|senha|password|token|file_path|storage_path|signed_url|dados?\s+banc(?:a|\u00e1)rios?|banco|pix|conta\s+corrente|ag(?:e|\u00ea)ncia)\b)/i;

type ChecklistPatchPayload = z.infer<typeof checklistItemPatchSchema>;

interface AdmissionChecklistItemRouteParams {
  params: {
    id: string;
    itemId: string;
  };
}

function findSensitiveText(payload: ChecklistPatchPayload) {
  return [payload.notes, payload.waiverReason, payload.rejectionReason].find(
    (value) => typeof value === "string" && forbiddenChecklistTextPattern.test(value)
  );
}

function resolveNotes(item: HrAdmissionChecklistItemRow, payload: ChecklistPatchPayload) {
  if (payload.status === "rejected") {
    return payload.rejectionReason ?? payload.notes ?? item.notes;
  }

  return payload.notes === undefined ? item.notes : payload.notes;
}

function validateChecklistTransition(item: HrAdmissionChecklistItemRow, payload: ChecklistPatchPayload) {
  const allowedStatuses = allowedStatusesByItemKey[item.item_key] ?? [];

  if (!allowedStatuses.includes(payload.status)) {
    return "Status nao permitido para este item do checklist admissional.";
  }

  if (payload.status === "waived" && !payload.waiverReason) {
    return "Informe a justificativa para dispensar este item.";
  }

  if (payload.status === "rejected" && !payload.rejectionReason && !payload.notes) {
    return "Informe o motivo da rejeicao deste item.";
  }

  if (findSensitiveText(payload)) {
    return "Texto contem informacao sensivel ou fora do escopo da admissao administrativa.";
  }

  return null;
}

export async function PATCH(request: Request, { params }: AdmissionChecklistItemRouteParams) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.workflowsManage);

  if (response || !context) {
    return response;
  }

  try {
    const { id, itemId } = checklistItemParamsSchema.parse(params);
    const process = await loadAdmissionProcessById(context, id);

    if (!process) {
      return hrApiError("Processo admissional nao encontrado.", 404);
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return hrApiError("Payload invalido.", 400);
    }

    const payload = checklistItemPatchSchema.parse(body);

    const { data: itemData, error: itemError } = await context.supabase
      .from("hr_admission_checklist_items")
      .select(HR_ADMISSION_CHECKLIST_ITEM_SELECT)
      .eq("id", itemId)
      .eq("admission_process_id", id)
      .is("deleted_at", null)
      .limit(1);

    if (itemError) {
      logHrApiError("admission_process.checklist_item_lookup_failed", itemError);
      return hrApiError("Nao foi possivel localizar o item do checklist admissional.", 500);
    }

    const item = (itemData?.[0] as HrAdmissionChecklistItemRow | undefined) ?? null;

    if (!item) {
      return hrApiError("Item do checklist admissional nao encontrado.", 404);
    }

    const validationError = validateChecklistTransition(item, payload);

    if (validationError) {
      return hrApiError(validationError, 422);
    }

    const now = new Date().toISOString();
    const updatePayload: Record<string, string | null> = {
      status: payload.status,
      notes: resolveNotes(item, payload),
      updated_by: context.session.user.id,
      updated_at: now
    };

    if (completionStatuses.has(payload.status)) {
      updatePayload.completed_at = now;
      updatePayload.completed_by = context.session.user.id;
    }

    if (payload.status === "waived") {
      updatePayload.waived_at = now;
      updatePayload.waived_by = context.session.user.id;
      updatePayload.waiver_reason = payload.waiverReason ?? null;
    }

    const { data: updatedItem, error: updateError } = await context.supabase
      .from("hr_admission_checklist_items")
      .update(updatePayload)
      .eq("id", item.id)
      .eq("admission_process_id", id)
      .is("deleted_at", null)
      .select(HR_ADMISSION_CHECKLIST_ITEM_SELECT)
      .single();

    if (updateError) {
      logHrApiError("admission_process.checklist_item_update_failed", updateError);

      if (updateError.code === "23514") {
        return hrApiError("Texto contem informacao sensivel ou fora do escopo da admissao administrativa.", 422);
      }

      return hrApiError("Nao foi possivel atualizar o item do checklist admissional.", 500);
    }

    const aggregate = await recalculateAdmissionProcessAggregateStatuses(context.supabase, id, context.session.user.id);

    return NextResponse.json({
      ok: true,
      data: {
        item: updatedItem as HrAdmissionChecklistItemRow,
        process: aggregate.process,
        statuses: aggregate.statuses,
        summary: aggregate.summary
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return hrApiError(error.errors[0]?.message ?? "Payload invalido.", 422);
    }

    return handleHrRouteError(error, "Nao foi possivel atualizar o item do checklist admissional.");
  }
}
