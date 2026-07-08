import { NextResponse } from "next/server";
import { z } from "zod";
import { claimBackgroundJob, completeBackgroundJob, createBackgroundJob, failBackgroundJob } from "@/lib/hr/background-jobs";
import { handleHrRouteError, HR_PERMISSIONS, hrApiError, logHrApiError, requireHrPermission } from "@/lib/hr/api-auth";
import { processOccupationalExpirationGovernance } from "@/lib/hr/occupational-health";

const processOccupationalExpirationsSchema = z.object({
  unitId: z.string().uuid("Unidade invalida.").optional().or(z.literal("").transform(() => undefined))
});

export async function POST(request: Request) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.occupationalVerify);
  if (response || !context) return response;

  try {
    const payload = processOccupationalExpirationsSchema.parse(await request.json().catch(() => ({})));
    const unitIds = payload.unitId ? [payload.unitId] : context.accessibleUnitIds;

    if (!unitIds.length) {
      return hrApiError("Nenhuma unidade disponivel para processar Saude Ocupacional.", 422);
    }

    if (!context.isSuperAdmin && payload.unitId && !context.accessibleUnitIds.includes(payload.unitId)) {
      return hrApiError("Unidade nao encontrada.", 404);
    }

    const summary = {
      processedCount: 0,
      asoExpiringCount: 0,
      asoExpiredCount: 0,
      nrExpiringCount: 0,
      nrExpiredCount: 0,
      restrictionCount: 0,
      jobs: [] as Array<{ id: string; unitId: string; status: string }>
    };

    for (const unitId of unitIds) {
      const job = await createBackgroundJob({
        context,
        unitId,
        jobType: "occupational_expiration_scan",
        status: "pending",
        priority: "normal",
        payload: { source: "occupational", occupational_scope: payload.unitId ? "unit" : "accessible_units" },
        correlationId: `occupational-expiration:${unitId}:${new Date().toISOString().slice(0, 10)}`,
        maxAttempts: 1
      });

      const claimedJob = await claimBackgroundJob({ supabase: context.supabase, jobId: job.id, lockedBy: context.session.user.id });
      if (!claimedJob) {
        summary.jobs.push({ id: job.id, unitId, status: "not_claimed" });
        continue;
      }

      try {
        const result = await processOccupationalExpirationGovernance(context.supabase, unitId, context.session.user.id);
        await completeBackgroundJob({
          supabase: context.supabase,
          jobId: job.id,
          result: {
            source: "occupational",
            processed_count: result.processedCount,
            aso_expiring_count: result.asoExpiringCount,
            aso_expired_count: result.asoExpiredCount,
            nr_expiring_count: result.nrExpiringCount,
            nr_expired_count: result.nrExpiredCount,
            restriction_count: result.restrictionCount
          }
        });
        summary.processedCount += result.processedCount;
        summary.asoExpiringCount += result.asoExpiringCount;
        summary.asoExpiredCount += result.asoExpiredCount;
        summary.nrExpiringCount += result.nrExpiringCount;
        summary.nrExpiredCount += result.nrExpiredCount;
        summary.restrictionCount += result.restrictionCount;
        summary.jobs.push({ id: job.id, unitId, status: "completed" });
      } catch (error) {
        logHrApiError("occupational.expiration_job_failed", error instanceof Error ? error : { message: "Erro desconhecido." });
        await failBackgroundJob({
          supabase: context.supabase,
          jobId: job.id,
          failureReason: error instanceof Error ? error.message : "Erro desconhecido no processamento de Saude Ocupacional."
        });
        summary.jobs.push({ id: job.id, unitId, status: "failed" });
      }
    }

    return NextResponse.json({ ok: true, data: summary });
  } catch (error) {
    if (error instanceof z.ZodError) return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    return handleHrRouteError(error, "Nao foi possivel processar vencimentos de Saude Ocupacional.");
  }
}
