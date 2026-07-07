import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { logHrApiError } from "@/lib/hr/api-auth";
import {
  createEmployeeFunctionalEvent,
  type EmployeeFunctionalEventSeverity,
  type EmployeeFunctionalEventType
} from "@/lib/hr/employee-functional-events";
import {
  movementSelect,
  movementTypeLabels,
  type EmployeeMovementRow,
  type EmployeeMovementType
} from "@/lib/hr/employee-movements";

// RH-E-01 — EFETIVADOR de movimentacao funcional (roda via Vercel Cron, service_role).
//
// A movimentacao "implementada" (implement/route.ts) so transiciona status + evento; NAO altera o
// cadastro. A mudanca efetiva no employees acontece na EFFECTIVE_DATE, aplicada por este efetivador.
// Regra do dono: propaga unit_id/department_id/job_position_id quando o new_* correspondente NAO for
// nulo; SALARIO nunca e' aplicado (folha fora do escopo). Idempotente via movement_applied_at.
//
// service_role: precisa cruzar unidade (uma transferencia vai da unidade A para a B); a RLS da 071
// bloquearia um cliente authenticated. Por isso o cliente e' o admin (createSupabaseAdminClient()).

// Replica local do mapa nao-exportado de employee-movements.ts:395-406 (evita alterar aquele arquivo).
const MOVEMENT_EVENT_TYPE: Record<EmployeeMovementType, EmployeeFunctionalEventType> = {
  promotion: "promotion_registered",
  transfer: "transfer_registered",
  job_position_change: "job_position_changed",
  department_change: "department_changed",
  unit_change: "unit_changed",
  salary_change: "salary_changed"
};

export type ApplyDueMovementsSummary = {
  scanned: number;
  applied: number; // patch aplicado ao employees
  markedNoChange: number; // marcado como efetivado sem alterar employees (ex.: salary_change puro)
  skippedTerminated: number; // colaborador com desligamento vigente (ou cadastro indisponivel) -> nao aplica
  errors: number;
};

type DueMovement = EmployeeMovementRow;

type EmployeeScopeRow = {
  id: string;
  unit_id: string | null;
  department_id: string | null;
  job_position_id: string | null;
  deleted_at: string | null;
};

/** Marca a movimentacao como efetivada (guarda de idempotencia no proprio UPDATE). */
async function markApplied(supabase: SupabaseClient, movementId: string): Promise<boolean> {
  const { error } = await supabase
    .from("employee_movements")
    .update({ movement_applied_at: new Date().toISOString() })
    .eq("id", movementId)
    .is("movement_applied_at", null);

  if (error) {
    logHrApiError("apply_due.mark_failed", error);
    return false;
  }
  return true;
}

/**
 * Existe um desligamento JA VIGENTE para o colaborador na data da movimentacao?
 *
 * O implement do desligamento (employee-terminations.ts) NAO seta employees.deleted_at nem
 * employees.status — so marca a propria termination como status='implemented'. Logo o sinal de
 * "desligado" precisa vir da tabela employee_terminations, e nao do cadastro. Criterio do dono:
 *   status='implemented' AND deleted_at is null AND (effective_date is null OR effective_date <= a
 *   da movimentacao). Um desligamento de effective_date futura NAO barra a movimentacao.
 */
async function hasEffectiveTermination(
  supabase: SupabaseClient,
  employeeId: string,
  movementEffectiveDate: string
): Promise<{ ok: true; terminated: boolean } | { ok: false }> {
  const { data, error } = await supabase
    .from("employee_terminations")
    .select("id")
    .eq("employee_id", employeeId)
    .eq("status", "implemented")
    .is("deleted_at", null)
    .or(`effective_date.is.null,effective_date.lte.${movementEffectiveDate}`)
    .limit(1);

  if (error) {
    logHrApiError("apply_due.termination_lookup_failed", error);
    return { ok: false };
  }
  return { ok: true, terminated: (data?.length ?? 0) > 0 };
}

/** Publica o evento funcional de efetivacao (dedupe distinto do publicado no implement). */
async function publishAppliedEvent(
  supabase: SupabaseClient,
  movement: DueMovement,
  dedupeSuffix: "applied" | "skipped_terminated",
  description: string,
  severity: EmployeeFunctionalEventSeverity
): Promise<void> {
  const result = await createEmployeeFunctionalEvent(supabase, {
    employeeId: movement.employee_id,
    eventType: MOVEMENT_EVENT_TYPE[movement.movement_type],
    eventDate: movement.effective_date,
    title: `${movementTypeLabels[movement.movement_type]} efetivada`,
    description,
    severity,
    visibilityScope: movement.is_sensitive ? "restricted" : "unit",
    isSensitive: movement.is_sensitive,
    sourceModule: "hr",
    sourceEntityType: "employee_movement",
    sourceEntityId: movement.id,
    // actorUserId omitido de proposito: o cron nao tem sessao de usuario. A origem "sistema/cron"
    // fica explicita no payload (applied_by/source) para a auditoria de RH — a rastreabilidade do
    // ator humano vem da propria movimentacao (requested_by/approved_by).
    dedupeKey: `movement:${movement.id}:${dedupeSuffix}`,
    eventPayload: {
      movement_type: movement.movement_type,
      effective_date: movement.effective_date,
      outcome: dedupeSuffix,
      applied_by: "system_cron",
      source: "hr.apply_due_movements",
      new_unit_id: movement.new_unit_id,
      new_department_id: movement.new_department_id,
      new_job_position_id: movement.new_job_position_id
    }
  });

  if (!result.ok) {
    logHrApiError("apply_due.event_failed", { message: result.error.message, code: result.error.code });
  }
}

/**
 * Efetiva as movimentacoes vencidas: status='implemented' AND effective_date <= hoje AND
 * movement_applied_at is null, na ordem de effective_date (asc) para que, havendo varias para o mesmo
 * colaborador, a mais antiga aplique primeiro e a mais recente prevaleca por campo.
 *
 * Idempotente: o filtro `is null` + o UPDATE condicional (`where movement_applied_at is null`) + o
 * dedupe do evento garantem que rodar 2x = no-op. Recebe o client service_role.
 */
export async function applyDueEmployeeMovements(supabase: SupabaseClient): Promise<ApplyDueMovementsSummary> {
  const summary: ApplyDueMovementsSummary = {
    scanned: 0,
    applied: 0,
    markedNoChange: 0,
    skippedTerminated: 0,
    errors: 0
  };

  // effective_date e' `date`; comparamos com a data de hoje (UTC — o Supabase roda em UTC, mesma base
  // do current_date do Postgres).
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("employee_movements")
    .select(movementSelect)
    .eq("status", "implemented")
    .is("movement_applied_at", null)
    .is("deleted_at", null)
    .lte("effective_date", today)
    .order("effective_date", { ascending: true })
    .order("requested_at", { ascending: true });

  if (error) {
    logHrApiError("apply_due.select_failed", error);
    throw new Error("Nao foi possivel carregar as movimentacoes a efetivar.");
  }

  const movements = (data ?? []) as unknown as DueMovement[];
  summary.scanned = movements.length;

  for (const movement of movements) {
    try {
      const { data: empData, error: empError } = await supabase
        .from("employees")
        .select("id, unit_id, department_id, job_position_id, deleted_at")
        .eq("id", movement.employee_id)
        .limit(1);

      if (empError) {
        logHrApiError("apply_due.employee_lookup_failed", empError);
        summary.errors += 1;
        continue;
      }

      const employee = empData?.[0] as EmployeeScopeRow | undefined;

      // Colaborador inexistente: marca como efetivado (nao ha o que aplicar) para nao reprocessar todo
      // dia; registra o desfecho.
      if (!employee) {
        if (await markApplied(supabase, movement.id)) {
          await publishAppliedEvent(
            supabase,
            movement,
            "skipped_terminated",
            "Movimentacao nao efetivada: colaborador nao encontrado.",
            "warning"
          );
          summary.skippedTerminated += 1;
        } else {
          summary.errors += 1;
        }
        continue;
      }

      // Desligamento vence movimentacao: se existe um desligamento JA VIGENTE (checado na tabela
      // employee_terminations, nao no cadastro — o implement do desligamento nao mexe no employees),
      // NAO altera o cadastro, mas marca a movimentacao como efetivada (com evento) para nao
      // reprocessar diariamente.
      const termination = await hasEffectiveTermination(supabase, movement.employee_id, movement.effective_date);
      if (!termination.ok) {
        summary.errors += 1;
        continue;
      }
      if (termination.terminated) {
        if (await markApplied(supabase, movement.id)) {
          await publishAppliedEvent(
            supabase,
            movement,
            "skipped_terminated",
            "Movimentacao nao efetivada: colaborador com desligamento vigente.",
            "warning"
          );
          summary.skippedTerminated += 1;
        } else {
          summary.errors += 1;
        }
        continue;
      }

      // Guard de integridade (NAO e' sinal de "desligado" — isso ja foi checado acima): nao escrever
      // em cadastro soft-deletado por qualquer outro motivo. Marca efetivado para nao reprocessar.
      if (employee.deleted_at) {
        if (await markApplied(supabase, movement.id)) {
          await publishAppliedEvent(
            supabase,
            movement,
            "skipped_terminated",
            "Movimentacao nao efetivada: cadastro do colaborador indisponivel (removido).",
            "warning"
          );
          summary.skippedTerminated += 1;
        } else {
          summary.errors += 1;
        }
        continue;
      }

      // Patch dirigido por new_* nao-nulo (NAO por movement_type). Salario nunca entra.
      const patch: Record<string, string> = {};
      if (movement.new_unit_id) patch.unit_id = movement.new_unit_id;
      if (movement.new_department_id) patch.department_id = movement.new_department_id;
      if (movement.new_job_position_id) patch.job_position_id = movement.new_job_position_id;

      const hasCadastroChange = Object.keys(patch).length > 0;

      if (hasCadastroChange) {
        const { error: updateError } = await supabase
          .from("employees")
          // updated_by=null: efetivacao de sistema (cron sem usuario). Os triggers da 008 cuidam de
          // updated_at + audit_trail automaticamente.
          .update({ ...patch, updated_by: null })
          .eq("id", movement.employee_id)
          .is("deleted_at", null);

        if (updateError) {
          logHrApiError("apply_due.employee_update_failed", updateError);
          summary.errors += 1;
          continue;
        }
      }

      // Marca efetivado APOS o update do cadastro. Se falhar aqui, o employees ja pode ter mudado, mas
      // o proximo run reaplica o MESMO patch (mesmo new_*) -> resultado identico (idempotente) e o
      // evento nao duplica (dedupe).
      if (!(await markApplied(supabase, movement.id))) {
        summary.errors += 1;
        continue;
      }

      await publishAppliedEvent(
        supabase,
        movement,
        "applied",
        hasCadastroChange
          ? "Movimentacao efetivada no cadastro do colaborador pelo efetivador automatico (cron)."
          : "Movimentacao efetivada pelo efetivador automatico (cron) sem alteracao de cadastro (ex.: alteracao salarial nao aplicada).",
        movement.movement_type === "salary_change" ? "warning" : "notice"
      );

      if (hasCadastroChange) {
        summary.applied += 1;
      } else {
        summary.markedNoChange += 1;
      }
    } catch (error) {
      logHrApiError(
        "apply_due.movement_failed",
        error instanceof Error ? error : { message: "unknown" }
      );
      summary.errors += 1;
    }
  }

  return summary;
}
