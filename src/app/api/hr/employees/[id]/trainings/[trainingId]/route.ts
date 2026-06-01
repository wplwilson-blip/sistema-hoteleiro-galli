import { NextResponse } from "next/server";
import { z } from "zod";
import { assertCanAccessHrEmployee, handleHrRouteError, HR_PERMISSIONS, hrApiError, logHrApiError, requireHrPermission } from "@/lib/hr/api-auth";
import { employeeTrainingUpdatePayloadSchema, hrIdParamSchema } from "@/lib/hr/schemas";
import {
  employeeTrainingListSelect,
  loadEmployeeTraining,
  prepareEmployeeTrainingUpdate,
  publishEmployeeTrainingEvent,
  redactEmployeeTraining,
  type EmployeeTrainingRow
} from "@/lib/hr/trainings";

type RouteParams = { params: { id: string; trainingId: string } };

export async function PATCH(request: Request, { params }: RouteParams) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.trainingsVerify);
  if (response || !context) return response;

  try {
    const { id } = hrIdParamSchema.parse({ id: params.id });
    const { id: trainingId } = hrIdParamSchema.parse({ id: params.trainingId });
    await assertCanAccessHrEmployee(context, id);
    const existing = await loadEmployeeTraining(context, trainingId);
    if (!existing || existing.employee_id !== id) return hrApiError("Treinamento do colaborador nao encontrado.", 404);

    const payload = employeeTrainingUpdatePayloadSchema.parse(await request.json());
    const updatePayload = prepareEmployeeTrainingUpdate(existing, payload);
    const { data, error } = await context.supabase
      .from("employee_trainings")
      .update({ ...updatePayload, updated_by: context.session.user.id })
      .eq("id", trainingId)
      .select(employeeTrainingListSelect)
      .single();

    if (error) {
      logHrApiError("employee_trainings.update_failed", error);
      return hrApiError("Nao foi possivel atualizar treinamento do colaborador.", 500);
    }

    const updated = data as unknown as EmployeeTrainingRow;
    if (existing.status !== "completed" && updated.status === "completed") {
      await publishEmployeeTrainingEvent({ context, eventType: "training_completed", employeeTraining: updated, previous: existing });
    }
    if (existing.status !== "expired" && updated.status === "expired") {
      await publishEmployeeTrainingEvent({ context, eventType: "training_expired", employeeTraining: updated, previous: existing });
    }
    if (existing.status !== "retraining_required" && updated.status === "retraining_required") {
      await publishEmployeeTrainingEvent({ context, eventType: "training_retraining_required", employeeTraining: updated, previous: existing });
    }
    if (!existing.certificate_attachment_id && updated.certificate_attachment_id) {
      await publishEmployeeTrainingEvent({ context, eventType: "training_certificate_uploaded", employeeTraining: updated, previous: existing });
    }

    return NextResponse.json({ ok: true, data: redactEmployeeTraining(updated, true) });
  } catch (error) {
    if (error instanceof z.ZodError) return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    return handleHrRouteError(error, "Nao foi possivel atualizar treinamento do colaborador.");
  }
}
