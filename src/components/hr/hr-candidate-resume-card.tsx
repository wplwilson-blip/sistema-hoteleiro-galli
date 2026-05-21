"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Eye, FileText, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { StatusBadge } from "@/components/common/status-badge";
import { ErrorMessage, LoadingTable } from "@/components/base-cadastros/crud-components";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDateTime, requestJson } from "@/components/hr/hr-candidate-shared";
import { HrCandidateResumeUpload } from "@/components/hr/hr-candidate-resume-upload";

type CandidateResume = {
  id: string;
  fileName: string;
  fileMimeType: string;
  fileSizeBytes: number;
  uploadedAt: string;
  signedUrl?: string;
} | null;

type CandidateResumeResponse = {
  data: CandidateResume;
};

function formatBytes(value: number) {
  if (!Number.isFinite(value)) return "-";
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function HrCandidateResumeCard({ workflowId, candidateId }: { workflowId: string; candidateId: string }) {
  const queryClient = useQueryClient();
  const queryKey = ["hr", "candidate-resume", workflowId, candidateId];
  const resumeQuery = useQuery({
    queryKey,
    queryFn: async () => requestJson<CandidateResumeResponse>(`/api/hr/workflows/${workflowId}/candidates/${candidateId}/resume`)
  });

  const deleteMutation = useMutation({
    mutationFn: async () =>
      requestJson(`/api/hr/workflows/${workflowId}/candidates/${candidateId}/resume`, {
        method: "DELETE"
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
    }
  });

  const resume = resumeQuery.data?.data ?? null;

  return (
    <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
      <div className="mb-4 flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Curriculo</h2>
            {resume ? <StatusBadge status="success" label="Anexado" /> : <StatusBadge status="visual" label="Opcional" />}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">Arquivo simples do candidato. Sem OCR, IA, parsing ou ranking automatico.</p>
        </div>
        <HrCandidateResumeUpload
          workflowId={workflowId}
          candidateId={candidateId}
          label={resume ? "Substituir" : "Anexar currículo"}
          onUploaded={() => {
            void queryClient.invalidateQueries({ queryKey });
          }}
        />
      </div>

      {resumeQuery.isLoading ? <LoadingTable label="Carregando currículo..." /> : null}
      {resumeQuery.error ? <ErrorMessage message={resumeQuery.error instanceof Error ? resumeQuery.error.message : "Erro ao carregar currículo."} /> : null}

      {!resumeQuery.isLoading && !resumeQuery.error && !resume ? (
        <EmptyState title="Sem currículo" description="Anexe PDF, JPG, JPEG ou PNG com até 5 MB quando houver arquivo do candidato." />
      ) : null}

      {resume ? (
        <div className="rounded-md border bg-background p-3">
          <p className="break-words text-sm font-semibold text-foreground">{resume.fileName}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatBytes(resume.fileSizeBytes)} | Enviado em {formatDateTime(resume.uploadedAt)}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {resume.signedUrl ? (
              <>
                <Button asChild variant="outline" size="sm">
                  <a href={resume.signedUrl} target="_blank" rel="noreferrer">
                    <Eye className="h-4 w-4" />
                    Visualizar
                  </a>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <a href={resume.signedUrl} download={resume.fileName}>
                    <Download className="h-4 w-4" />
                    Baixar
                  </a>
                </Button>
              </>
            ) : (
              <StatusBadge status="warning" label="URL temporaria indisponivel" />
            )}
            <Button type="button" variant="danger" size="sm" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
              <Trash2 className="h-4 w-4" />
              Remover
            </Button>
          </div>
          {deleteMutation.error ? <div className="mt-3"><ErrorMessage message={deleteMutation.error instanceof Error ? deleteMutation.error.message : "Não foi possível remover o currículo."} /></div> : null}
        </div>
      ) : null}
    </Card>
  );
}
