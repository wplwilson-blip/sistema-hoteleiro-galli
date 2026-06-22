"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Loader2, ShieldAlert, UserPlus } from "lucide-react";
import { ErrorMessage } from "@/components/base-cadastros/crud-components";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { candidateStatusLabel, requestJson, type Candidate, type CandidateAdmissionConversion } from "@/components/hr/hr-candidate-shared";
import { cn } from "@/lib/utils";

type AdmissionConversionResponse = {
  data: {
    admission_workflow_id: string;
    already_exists: boolean;
  };
};

function createIdempotencyKey(candidateId: string) {
  return `candidate-admission-${candidateId}-${crypto.randomUUID()}`;
}

export function HrCandidateAdmissionActionButton({
  workflowId,
  candidate,
  admissionWorkflowId,
  size = "sm",
  className,
  showError = false
}: {
  workflowId: string;
  candidate: Candidate;
  admissionWorkflowId?: string | null;
  size?: "default" | "sm" | "icon";
  className?: string;
  showError?: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const idempotencyKey = useMemo(() => createIdempotencyKey(candidate.id), [candidate.id]);
  const canConvert = candidate.status === "aprovado";

  const mutation = useMutation({
    mutationFn: async () =>
      requestJson<AdmissionConversionResponse>(`/api/hr/workflows/${workflowId}/candidates/${candidate.id}/admission`, {
        method: "POST",
        headers: {
          "Idempotency-Key": idempotencyKey
        }
      }),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["hr", "candidate-detail", workflowId, candidate.id] }),
        queryClient.invalidateQueries({ queryKey: ["hr", "workflows"] }),
        queryClient.invalidateQueries({ queryKey: ["hr", "job-opening-candidates"] }),
        queryClient.invalidateQueries({ queryKey: ["hr", "job-opening-candidates-summary", workflowId] }),
        queryClient.invalidateQueries({ queryKey: ["hr", "admission-processes", "job-opening", workflowId] })
      ]);
      const admissionWorkflowId = result.data.admission_workflow_id;
      router.push(admissionWorkflowId ? `/rh/admissoes/${admissionWorkflowId}` : `/rh/admissoes`);
    }
  });

  function handleConvert() {
    if (!canConvert) return;
    if (window.confirm("Encaminhar este candidato aprovado para admissão? O processo aparecerá em Admissões.")) {
      mutation.mutate();
    }
  }

  const button = admissionWorkflowId ? (
    <Button asChild variant="outline" size={size} className={className}>
      <Link href={`/rh/admissoes/${admissionWorkflowId}`}>
        Acompanhar admissão
        <ArrowRight className="h-4 w-4" />
      </Link>
    </Button>
  ) : (
    <Button type="button" size={size} className={className} onClick={handleConvert} disabled={!canConvert || mutation.isPending}>
      {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
      {mutation.isPending ? "Encaminhando..." : "Encaminhar para admissão"}
    </Button>
  );

  if (!showError) return button;

  return (
    <div className="space-y-2">
      {button}
      {mutation.error ? <ErrorMessage message={mutation.error instanceof Error ? mutation.error.message : "Não foi possível encaminhar para admissão."} /> : null}
    </div>
  );
}

export function HrCandidateAdmissionConversionCard({
  workflowId,
  candidate,
  admissionConversion
}: {
  workflowId: string;
  candidate: Candidate;
  admissionConversion: CandidateAdmissionConversion | null;
}) {
  const canConvert = candidate.status === "aprovado";
  const admissionWorkflowId = admissionConversion?.status === "completed" ? admissionConversion.admission_workflow_id : null;

  return (
    <Card id="admissao" className={cn("min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5", canConvert && !admissionWorkflowId && "border-primary/40 bg-primary/5 shadow-primary/10")}>
      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <UserPlus className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Admissão</h2>
            {admissionWorkflowId ? <StatusBadge status="success" label="Admissão gerada" /> : <StatusBadge status="visual" label="Decisão humana" />}
            {canConvert && !admissionWorkflowId ? <StatusBadge status="info" label="Próxima ação" /> : null}
          </div>
          {admissionWorkflowId ? (
            <p className="mt-2 text-sm text-muted-foreground">Candidato encaminhado para admissão. Responsável pela próxima etapa: RH/Admissão. Acompanhe o processo em Admissões.</p>
          ) : canConvert ? (
            <p className="mt-2 text-sm text-muted-foreground">Candidato aprovado. Próxima etapa: encaminhar para admissão.</p>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              A admissão só pode ser aberta após o candidato ser marcado como aprovado. Status atual: {candidateStatusLabel(candidate.status)}.
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <HrCandidateAdmissionActionButton workflowId={workflowId} candidate={candidate} admissionWorkflowId={admissionWorkflowId} size="default" showError />
        </div>
      </div>

      {!canConvert ? (
        <div className="mt-3 flex items-start gap-2 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          A admissão é liberada somente depois da aprovação do candidato.
        </div>
      ) : null}
    </Card>
  );
}
