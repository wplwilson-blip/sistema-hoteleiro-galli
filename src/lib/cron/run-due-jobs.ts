import "server-only";

import type { SupabaseAdmin } from "@/lib/base-cadastros/api-helpers";
import { logHrApiError } from "@/lib/hr/api-auth";
import {
  claimBackgroundJob,
  completeBackgroundJob,
  completedBackgroundJobExistsByCorrelation,
  createBackgroundJobSystem,
  failBackgroundJob,
  type HrBackgroundJobType
} from "@/lib/hr/background-jobs";
import { processTrainingExpirationGovernance } from "@/lib/hr/trainings";
import { processOccupationalExpirationGovernance } from "@/lib/hr/occupational-health";

// CORE Fatia 2 — RUNNER da fila hr_background_jobs. Roda via cron (service_role, sem sessao): varre TODAS
// as unidades ativas e, por (job_type x unidade), enfileira (system) -> claim -> handler -> complete/fail.
//
// Idempotencia diaria: pre-check por correlation_id = '{tipo}:{unidade}:{yyyy-mm-dd}' ANTES de enfileirar
// (o indice correlation_idx NAO e' unico -> a garantia contra linha duplicada e' feita aqui). Os handlers
// tambem sao idempotentes por dominio (so mudam status quando != alvo; eventos tem dedupeKey).

type CronJobType = Extract<HrBackgroundJobType, "training_expiration_scan" | "occupational_expiration_scan">;

// Registry: nasce com 2 entradas. Cada handler roda com actorUserId=null (system) e devolve o result ja
// no formato snake_case da allowlist de payload (sanitizeBackgroundJobPayload).
const REGISTRY: Record<CronJobType, (supabase: SupabaseAdmin, unitId: string) => Promise<Record<string, unknown>>> = {
  training_expiration_scan: async (supabase, unitId) => {
    const r = await processTrainingExpirationGovernance(supabase, unitId, null);
    return {
      source: "cron",
      processed_count: r.processedCount,
      expiring_count: r.expiringCount,
      expired_count: r.expiredCount,
      retraining_count: r.retrainingCount
    };
  },
  occupational_expiration_scan: async (supabase, unitId) => {
    const r = await processOccupationalExpirationGovernance(supabase, unitId, null);
    return {
      source: "cron",
      processed_count: r.processedCount,
      aso_expiring_count: r.asoExpiringCount,
      aso_expired_count: r.asoExpiredCount,
      nr_expiring_count: r.nrExpiringCount,
      nr_expired_count: r.nrExpiredCount,
      restriction_count: r.restrictionCount
    };
  }
};

const JOB_TYPES = Object.keys(REGISTRY) as CronJobType[];

export type RunDueJobsSummary = {
  scanned: number; // pares (job_type x unidade) considerados
  enqueued: number; // jobs criados
  completed: number; // handler concluiu
  failed: number; // handler falhou
  skipped: number; // pre-check (ja COMPLETED no dia) OU nao claimado
  // Contagens de dominio agregadas (paliativo do NR ate a Fatia 2.1 — sao o unico sinal de NR vencendo,
  // ja que o evento de NR esta adiado). Somadas a partir do result de cada handler concluido.
  asoExpired: number;
  nrExpired: number;
  nrExpiring: number;
};

function toCount(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

async function loadActiveUnitIds(supabase: SupabaseAdmin): Promise<string[]> {
  const { data, error } = await supabase
    .from("units")
    .select("id")
    .eq("status", "active")
    .is("deleted_at", null);

  if (error) {
    logHrApiError("run_due_jobs.units_lookup_failed", error);
    throw new Error("Nao foi possivel carregar as unidades ativas.");
  }

  return (data ?? []).map((row) => (row as { id: string }).id);
}

export async function runDueJobs(supabase: SupabaseAdmin): Promise<RunDueJobsSummary> {
  const summary: RunDueJobsSummary = { scanned: 0, enqueued: 0, completed: 0, failed: 0, skipped: 0, asoExpired: 0, nrExpired: 0, nrExpiring: 0 };

  const today = new Date().toISOString().slice(0, 10);
  const runId = new Date().toISOString();
  const lockedBy = `cron:run-due-jobs:${runId}`;

  const unitIds = await loadActiveUnitIds(supabase);

  for (const jobType of JOB_TYPES) {
    for (const unitId of unitIds) {
      summary.scanned += 1;
      const correlationId = `${jobType}:${unitId}:${today}`;

      try {
        // Pre-check: ja existe job COMPLETED deste tipo/unidade/dia? Se sim, nao reenfileira. Jobs
        // failed/cancelados/nao-claimados NAO barram -> uma nova run recupera a unidade que falhou.
        if (await completedBackgroundJobExistsByCorrelation(supabase, correlationId)) {
          summary.skipped += 1;
          continue;
        }

        const job = await createBackgroundJobSystem(supabase, {
          unitId,
          jobType,
          status: "pending",
          priority: "normal",
          payload: { source: "cron" },
          correlationId,
          maxAttempts: 1
        });
        summary.enqueued += 1;

        const claimed = await claimBackgroundJob({ supabase, jobId: job.id, lockedBy });
        if (!claimed) {
          summary.skipped += 1;
          continue;
        }

        try {
          const result = await REGISTRY[jobType](supabase, unitId);
          await completeBackgroundJob({ supabase, jobId: job.id, result });
          summary.completed += 1;
          // Agrega contagens de dominio (chaves snake_case do result; ausentes no treinamento -> 0).
          summary.asoExpired += toCount(result.aso_expired_count);
          summary.nrExpired += toCount(result.nr_expired_count);
          summary.nrExpiring += toCount(result.nr_expiring_count);
        } catch (error) {
          logHrApiError("run_due_jobs.handler_failed", error instanceof Error ? error : { message: "unknown" });
          await failBackgroundJob({
            supabase,
            jobId: job.id,
            failureReason: error instanceof Error ? error.message : "Erro desconhecido no runner de jobs."
          });
          summary.failed += 1;
        }
      } catch (error) {
        // Falha ANTES do claim (pre-check/enqueue): conta como erro de execucao do runner.
        logHrApiError("run_due_jobs.enqueue_failed", error instanceof Error ? error : { message: "unknown" });
        summary.failed += 1;
      }
    }
  }

  return summary;
}
