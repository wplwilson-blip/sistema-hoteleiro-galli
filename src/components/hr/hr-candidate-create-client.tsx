"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FileText, Save, ShieldAlert, Upload, UserPlus } from "lucide-react";
import { StatusBadge } from "@/components/common/status-badge";
import { ErrorMessage, Field, SelectField, TextArea } from "@/components/base-cadastros/crud-components";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { candidateStatusOptions, requestJson, type CandidateStatus } from "@/components/hr/hr-candidate-shared";

type CandidateForm = {
  full_name: string;
  phone: string;
  source: string;
  status: CandidateStatus;
  notes: string;
};

const initialForm: CandidateForm = {
  full_name: "",
  phone: "",
  source: "",
  status: "novo",
  notes: ""
};

const MAX_RESUME_SIZE_BYTES = 5 * 1024 * 1024;
const allowedResumeMimeTypes = ["application/pdf", "image/jpeg", "image/png"];
const allowedResumeExtensions = ["pdf", "jpg", "jpeg", "png"];

function validateResumeFile(file: File) {
  if (file.size > MAX_RESUME_SIZE_BYTES) return "Arquivo excede o limite de 5 MB.";

  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!allowedResumeExtensions.includes(extension)) return "Tipo invalido. Envie PDF, JPG, JPEG ou PNG.";
  if (file.type && !allowedResumeMimeTypes.includes(file.type)) return "Tipo invalido. Envie PDF, JPG, JPEG ou PNG.";

  return "";
}

async function uploadCandidateResume(workflowId: string, candidateId: string, file: File) {
  const formData = new FormData();
  formData.set("file", file);

  const response = await fetch(`/api/hr/workflows/${workflowId}/candidates/${candidateId}/resume`, {
    method: "POST",
    body: formData
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.message ?? payload?.error?.message ?? "Nao foi possivel enviar o curriculo.");
  }
}

export function HrCandidateCreateClient({ workflowId }: { workflowId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const resumeInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<CandidateForm>(initialForm);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeError, setResumeError] = useState("");
  const mutation = useMutation({
    mutationFn: async (form: CandidateForm) => {
      const response = await requestJson<{ data: { id: string } }>(`/api/hr/workflows/${workflowId}/candidates`, {
        method: "POST",
        body: JSON.stringify({
          full_name: form.full_name,
          phone: form.phone,
          source: form.source,
          status: form.status,
          notes: form.notes || null
        })
      });

      if (resumeFile) {
        await uploadCandidateResume(workflowId, response.data.id, resumeFile);
      }

      return response;
    },
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: ["hr", "job-opening-candidates"] });
      router.push(`/rh/vagas/${workflowId}/candidatos/${response.data.id}`);
    }
  });

  function updateForm(next: Partial<CandidateForm>) {
    mutation.reset();
    setForm((current) => ({ ...current, ...next }));
  }

  function handleResumeChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    mutation.reset();
    setResumeError("");

    if (!file) {
      setResumeFile(null);
      return;
    }

    const validationMessage = validateResumeFile(file);
    if (validationMessage) {
      setResumeFile(null);
      setResumeError(validationMessage);
      event.target.value = "";
      return;
    }

    setResumeFile(file);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate({ ...form });
  }

  return (
    <div className="space-y-5">
      <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status="info" label="Novo candidato" />
              <StatusBadge status="visual" label="Processo leve" />
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Cadastre os dados basicos do candidato. O curriculo deve ser anexado no campo proprio, nao colado nas observacoes.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href={`/rh/vagas/${workflowId}/candidatos`}>
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Link>
          </Button>
        </div>
      </Card>

      <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
        <form className="space-y-4" onSubmit={submit}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Nome">
              <Input value={form.full_name} onChange={(event) => updateForm({ full_name: event.target.value })} required minLength={2} maxLength={140} />
            </Field>
            <Field label="Telefone">
              <Input value={form.phone} onChange={(event) => updateForm({ phone: event.target.value })} required minLength={6} maxLength={30} />
            </Field>
            <Field label="Origem">
              <Input value={form.source} onChange={(event) => updateForm({ source: event.target.value })} required minLength={2} maxLength={80} placeholder="Ex.: curriculo, indicacao, WhatsApp, presencial, Indeed." />
            </Field>
            <Field label="Status inicial">
              <SelectField value={form.status} onChange={(event) => updateForm({ status: event.target.value as CandidateStatus })}>
                {candidateStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </SelectField>
            </Field>
          </div>
          <Field label="Observacoes">
            <TextArea value={form.notes} onChange={(event) => updateForm({ notes: event.target.value })} maxLength={1000} placeholder="Use apenas contexto operacional breve. Nao cole documentos, CPF, RG, dados medicos ou informacoes discriminatorias." />
          </Field>

          <div className="rounded-md border bg-muted/20 p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-semibold text-foreground">Curriculo do candidato</h2>
                  <StatusBadge status={resumeFile ? "success" : "visual"} label={resumeFile ? "Selecionado" : "Opcional"} />
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  Anexe aqui o curriculo recebido. Nao cole dados sensiveis nas observacoes. O arquivo fica vinculado ao candidato e nao vai para o dossie do colaborador.
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Formatos aceitos: PDF, JPG, JPEG ou PNG ate 5 MB.</p>
                {resumeFile ? <p className="mt-2 break-words text-xs font-medium text-foreground">{resumeFile.name}</p> : null}
              </div>
              <div className="shrink-0">
                <input ref={resumeInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" className="hidden" onChange={handleResumeChange} />
                <Button type="button" variant="outline" size="sm" onClick={() => resumeInputRef.current?.click()} disabled={mutation.isPending}>
                  <Upload className="h-4 w-4" />
                  {resumeFile ? "Trocar arquivo" : "Selecionar curriculo"}
                </Button>
              </div>
            </div>
            {resumeError ? <div className="mt-3"><ErrorMessage message={resumeError} /></div> : null}
          </div>

          <div className="flex items-start gap-2 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            O cadastro nao cria colaborador, admissao, dossie de colaborador, ranking ou decisao automatica. A decisao continua humana.
          </div>

          {mutation.error ? <ErrorMessage message={mutation.error instanceof Error ? mutation.error.message : "Nao foi possivel cadastrar o candidato."} /> : null}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button asChild variant="outline">
              <Link href={`/rh/vagas/${workflowId}/candidatos`}>
                <ArrowLeft className="h-4 w-4" />
                Cancelar
              </Link>
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? <Save className="h-4 w-4 animate-pulse" /> : <UserPlus className="h-4 w-4" />}
              Cadastrar candidato
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
