"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save, ShieldAlert, UserPlus } from "lucide-react";
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

export function HrCandidateCreateClient({ workflowId }: { workflowId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CandidateForm>(initialForm);
  const mutation = useMutation({
    mutationFn: async (form: CandidateForm) =>
      requestJson<{ data: { id: string } }>(`/api/hr/workflows/${workflowId}/candidates`, {
        method: "POST",
        body: JSON.stringify({
          full_name: form.full_name,
          phone: form.phone,
          source: form.source,
          status: form.status,
          notes: form.notes || null
        })
      }),
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: ["hr", "job-opening-candidates"] });
      router.push(`/rh/vagas/${workflowId}/candidatos/${response.data.id}`);
    }
  });

  function updateForm(next: Partial<CandidateForm>) {
    mutation.reset();
    setForm((current) => ({ ...current, ...next }));
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
              Cadastre apenas dados operacionais de contato. Não registre documentos, dados discriminatórios ou informações sensíveis.
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
              <Input value={form.source} onChange={(event) => updateForm({ source: event.target.value })} required minLength={2} maxLength={80} placeholder="Indicado, currículo entregue, rede social..." />
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
            <TextArea value={form.notes} onChange={(event) => updateForm({ notes: event.target.value })} maxLength={1000} placeholder="Contexto operacional breve, sem dados sensíveis." />
          </Field>

          <div className="flex items-start gap-2 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            O cadastro nao cria colaborador, admissao, ranking ou decisao automatica. A decisao continua humana.
          </div>

          {mutation.error ? <ErrorMessage message={mutation.error instanceof Error ? mutation.error.message : "Não foi possível cadastrar o candidato."} /> : null}

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
