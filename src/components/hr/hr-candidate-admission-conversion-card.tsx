"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, ShieldAlert, UserPlus } from "lucide-react";
import { ErrorMessage } from "@/components/base-cadastros/crud-components";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { candidateStatusLabel, requestJson, type Candidate, type CandidateAdmissionConversion } from "@/components/hr/hr-candidate-shared";

type AdmissionConversionResponse = {
  data: {
    admission_workflow_id: string;
    already_exists: boolean;
  };
};

function createIdempotencyKey(candidateId: string) {
  return `candidate-admission-${candidateId}-${crypto.randomUUID()}`;
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
  const router = useRouter();
  const queryClient = useQueryClient();
  const canConvert = candidate.status === "aprovado";
  const admissionWorkflowId = admissionConversion?.status === "completed" ? admissionConversion.admission_workflow_id : null;
  const idempotencyKey = useMemo(() => createIdempotencyKey(candidate.id), [candidate.id]);

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
        queryClient.invalidateQueries({ queryKey: ["hr", "job-opening-candidates"] })
      ]);
      router.push(`/rh/workflows/${result.data.admission_workflow_id}`);
    }
  });

  function handleConvert() {
    const confirmed = window.confirm(
      "Gerar um processo de admissao para este candidato aprovado? Isso nao cria colaborador, folha, salario, documentos ou ponto automaticamente."
    );

    if (confirmed) {
      mutation.mutate();
    }
  }

  return (
    <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <UserPlus className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Admissao</h2>
            {admissionWorkflowId ? <StatusBadge status="success" label="Admissao gerada" /> : <StatusBadge status="visual" label="Decisao humana" />}
          </div>
          {admissionWorkflowId ? (
            <p className="mt-2 text-sm text-muted-foreground">Este candidato ja possui um processo de admissao vinculado.</p>
          ) : canConvert ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Gere um processo de admissao a partir deste candidato aprovado. O colaborador ainda nao sera criado.
            </p>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              A admissao so pode ser gerada apos o candidato ser marcado como aprovado. Status atual: {candidateStatusLabel(candidate.status)}.
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          {admissionWorkflowId ? (
            <Button asChild>
              <Link href={`/rh/workflows/${admissionWorkflowId}`}>
                Abrir admissao
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          ) : (
            <Button type="button" onClick={handleConvert} disabled={!canConvert || mutation.isPending}>
              <UserPlus className="h-4 w-4" />
              Gerar admissao
            </Button>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-start gap-2 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        A conversao nao copia telefone, curriculo, scorecard ou pareceres completos para a admissao.
      </div>

      {mutation.error ? <ErrorMessage message={mutation.error instanceof Error ? mutation.error.message : "Nao foi possivel gerar a admissao."} /> : null}
    </Card>
  );
}
