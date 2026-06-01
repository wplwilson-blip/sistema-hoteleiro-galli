import { NextResponse } from "next/server";
import { z } from "zod";
import { claimBackgroundJob, completeBackgroundJob, createBackgroundJob, failBackgroundJob } from "@/lib/hr/background-jobs";
import { handleHrRouteError, HR_PERMISSIONS, hrApiError, logHrApiError, requireHrPermission } from "@/lib/hr/api-auth";
import { processTrainingExpirationGovernance } from "@/lib/hr/trainings";

const processTrainingExpirationsSchema = z.object({
  unitId: z.string().uuid("Unidade invalida.").optional().or(z.literal("").transform(() => undefined))
});

export async function POST(request: Request) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.trainingsVerify);
  if (response || !context) return response;

  try {
    const payload = processTrainingExpirationsSchema.parse(await request.json().catch(() => ({})));
    const unitIds = payload.unitId ? [payload.unitId] : context.accessibleUnitIds;

    if (!unitIds.length) {
      return hrApiError("Nenhuma unidade disponivel para processar treinamentos.", 422);
    }

    if (!context.isSuperAdmin && payload.unitId && !context.accessibleUnitIds.includes(payload.unitId)) {
      return hrApiError("Unidade nao encontrada.", 404);
    }

    const summary = {
      processedCount: 0,
      expiringCount: 0,
      expiredCount: 0,
      retrainingCount: 0,
      jobs: [] as Array<{ id: string; unitId: string; status: string }>
    };

    for (const unitId of unitIds) {
      const job = await createBackgroundJob({
        context,
        unitId,
        jobType: "training_expiration_scan",
        status: "pending",
        priority: "normal",
        payload: { source: "trainings", training_scope: payload.unitId ? "unit" : "accessible_units" },
        correlationId: `training-expiration:${unitId}:${new Date().toISOString().slice(0, 10)}`,
        maxAttempts: 1
      });

      const claimedJob = await claimBackgroundJob({ supabase: context.supabase, jobId: job.id, lockedBy: context.session.user.id });
      if (!claimedJob) {
        summary.jobs.push({ id: job.id, unitId, status: "not_claimed" });
        continue;
      }

      try {
        const result = await processTrainingExpirationGovernance({ context, unitId });
        await completeBackgroundJob({
          supabase: context.supabase,
          jobId: job.id,
          result: {
            source: "trainings",
            processed_count: result.processedCount,
            expiring_count: result.expiringCount,
            expired_count: result.expiredCount,
            retraining_count: result.retrainingCount
          }
        });
        summary.processedCount += result.processedCount;
        summary.expiringCount += result.expiringCount;
        summary.expiredCount += result.expiredCount;
        summary.retrainingCount += result.retrainingCount;
        summary.jobs.push({ id: job.id, unitId, status: "completed" });
      } catch (error) {
        logHrApiError("trainings.expiration_job_failed", error instanceof Error ? error : { message: "Erro desconhecido." });
        await failBackgroundJob({
          supabase: context.supabase,
          jobId: job.id,
          failureReason: error instanceof Error ? error.message : "Erro desconhecido no processamento de treinamentos."
        });
        summary.jobs.push({ id: job.id, unitId, status: "failed" });
      }
    }

    return NextResponse.json({ ok: true, data: summary });
  } catch (error) {
    if (error instanceof z.ZodError) return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    return handleHrRouteError(error, "Nao foi possivel processar vencimentos de treinamentos.");
  }
}
