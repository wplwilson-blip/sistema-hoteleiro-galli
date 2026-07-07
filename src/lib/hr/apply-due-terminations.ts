import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { logHrApiError } from "@/lib/hr/api-auth";
import { createEmployeeFunctionalEvent } from "@/lib/hr/employee-functional-events";

// RH-E-05 — EFETIVADOR de desligamento (roda via GitHub Actions / cron, service_role).
//
// O desligamento "implementado" (terminations/[id]/implement) so transiciona status + eventos; NAO
// altera o cadastro. A inativacao efetiva do colaborador acontece na EFFECTIVE_DATE, aplicada por este
// efetivador. Regra do dono: seta employees.status='inactive' (NUNCA deleted_at) e marca applied_at.
// Idempotente via applied_at.
//
// service_role: precisa escrever no employees independentemente da unidade; a RLS da 071 filtra por
// unidade e bloquearia um cliente authenticated. Por isso o cliente e' o admin (createSupabaseAdminClient()).

export type ApplyDueTerminationsSummary = {
  scanned: number;
  applied: number; // employees.status -> inactive
  skipped: number; // marcado como efetivado sem reescrever cadastro (ja inativo/soft-deletado/inexistente)
  errors: number;
};

type DueTerminationRow = {
  id: string;
  employee_id: string;
  effective_date: string | null;
  requested_at: string;
  is_sensitive: boolean;
};

type EmployeeStatusRow = {
  id: string;
  status: string;
  deleted_at: string | null;
};

const DUE_TERMINATION_SELECT = "id, employee_id, effective_date, requested_at, is_sensitive";

/** Marca o desligamento como efetivado (guarda de idempotencia no proprio UPDATE). */
async function markApplied(supabase: SupabaseClient, terminationId: string): Promise<boolean> {
  const { error } = await supabase
    .from("employee_terminations")
    .update({ applied_at: new Date().toISOString() })
    .eq("id", terminationId)
    .is("applied_at", null);

  if (error) {
    logHrApiError("apply_due_terminations.mark_failed", error);
    return false;
  }
  return true;
}

/** Publica o evento funcional de efetivacao (dedupe distinto do publicado no implement). */
async function publishAppliedEvent(supabase: SupabaseClient, termination: DueTerminationRow, description: string): Promise<void> {
  const result = await createEmployeeFunctionalEvent(supabase, {
    employeeId: termination.employee_id,
    eventType: "employee_inactivated",
    eventDate: termination.effective_date ?? termination.requested_at,
    title: "Colaborador inativado",
    description,
    severity: "warning",
    visibilityScope: "restricted",
    isSensitive: true,
    sourceModule: "hr",
    sourceEntityType: "employee_termination",
    sourceEntityId: termination.id,
    // actorUserId omitido: o cron nao tem sessao. A origem "sistema/cron" fica explicita no payload
    // (applied_by/source); a rastreabilidade do ator humano vem do proprio desligamento
    // (requested_by/approved_by/implemented_by).
    dedupeKey: `termination:${termination.id}:applied`,
    eventPayload: {
      applied_by: "system_cron",
      source: "hr.apply_due_terminations",
      effective_date: termination.effective_date
    }
  });

  if (!result.ok) {
    logHrApiError("apply_due_terminations.event_failed", { message: result.error.message, code: result.error.code });
  }
}

/**
 * Efetiva os desligamentos vencidos: status='implemented' AND applied_at is null AND deleted_at is null
 * AND (effective_date <= hoje OR effective_date is null=imediato), na ordem de effective_date asc.
 *
 * Idempotencia tripla: (a) filtro applied_at is null na selecao; (b) UPDATE condicional
 * (`where applied_at is null`); (c) guarda no employees (status ja != 'active' -> nao reescreve) + dedupe
 * do evento. Rodar 2x = no-op. Recebe o client service_role.
 */
export async function applyDueEmployeeTerminations(supabase: SupabaseClient): Promise<ApplyDueTerminationsSummary> {
  const summary: ApplyDueTerminationsSummary = { scanned: 0, applied: 0, skipped: 0, errors: 0 };

  // effective_date e' `date`; comparamos com a data de hoje (UTC — o Supabase roda em UTC, mesma base do
  // current_date do Postgres). effective_date null = imediato (efetiva assim que implementado).
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("employee_terminations")
    .select(DUE_TERMINATION_SELECT)
    .eq("status", "implemented")
    .is("applied_at", null)
    .is("deleted_at", null)
    .or(`effective_date.is.null,effective_date.lte.${today}`)
    .order("effective_date", { ascending: true })
    .order("requested_at", { ascending: true });

  if (error) {
    logHrApiError("apply_due_terminations.select_failed", error);
    throw new Error("Nao foi possivel carregar os desligamentos a efetivar.");
  }

  const terminations = (data ?? []) as unknown as DueTerminationRow[];
  summary.scanned = terminations.length;

  for (const termination of terminations) {
    try {
      const { data: empData, error: empError } = await supabase
        .from("employees")
        .select("id, status, deleted_at")
        .eq("id", termination.employee_id)
        .limit(1);

      if (empError) {
        logHrApiError("apply_due_terminations.employee_lookup_failed", empError);
        summary.errors += 1;
        continue;
      }

      const employee = empData?.[0] as EmployeeStatusRow | undefined;

      // Colaborador inexistente: marca como efetivado (nao ha o que aplicar) para nao reprocessar todo
      // dia; registra o desfecho.
      if (!employee) {
        if (await markApplied(supabase, termination.id)) {
          await publishAppliedEvent(supabase, termination, "Desligamento nao efetivado no cadastro: colaborador nao encontrado.");
          summary.skipped += 1;
        } else {
          summary.errors += 1;
        }
        continue;
      }

      // Guard: colaborador ja inativo/arquivado ou soft-deletado -> NAO reescreve o cadastro, so marca o
      // desligamento como efetivado (com evento) para nao reprocessar diariamente.
      if (employee.deleted_at || employee.status !== "active") {
        if (await markApplied(supabase, termination.id)) {
          await publishAppliedEvent(supabase, termination, "Desligamento nao reescreveu o cadastro: colaborador ja inativo ou indisponivel.");
          summary.skipped += 1;
        } else {
          summary.errors += 1;
        }
        continue;
      }

      // Caso normal: inativa o cadastro. NUNCA deleted_at. updated_by=null: efetivacao de sistema (cron
      // sem usuario); os triggers cuidam de updated_at + audit_trail automaticamente.
      const { error: updateError } = await supabase
        .from("employees")
        .update({ status: "inactive", updated_by: null })
        .eq("id", termination.employee_id)
        .is("deleted_at", null);

      if (updateError) {
        logHrApiError("apply_due_terminations.employee_update_failed", updateError);
        summary.errors += 1;
        continue;
      }

      // Marca efetivado APOS o update do cadastro. Se falhar aqui, o employees ja pode ter mudado, mas o
      // proximo run re-encontra status='inactive' e cai no guard acima (idempotente); o evento nao duplica
      // (dedupe).
      if (!(await markApplied(supabase, termination.id))) {
        summary.errors += 1;
        continue;
      }

      await publishAppliedEvent(
        supabase,
        termination,
        "Colaborador inativado no cadastro pelo efetivador automatico (cron) apos desligamento administrativo."
      );
      summary.applied += 1;
    } catch (error) {
      logHrApiError("apply_due_terminations.termination_failed", error instanceof Error ? error : { message: "unknown" });
      summary.errors += 1;
    }
  }

  return summary;
}
