"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Download, Eye, FileCheck2, FilePlus2, FileText, ShieldAlert, Upload, XCircle } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { StatusBadge } from "@/components/common/status-badge";
import { ErrorMessage, Field, LoadingTable, SelectField, TextArea } from "@/components/base-cadastros/crud-components";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type HrDocumentType = {
  id: string;
  code: string;
  name: string;
  description: string;
  category: string;
  isRequired: boolean;
  requiresValidUntil: boolean;
};

type HrDocumentTypesResponse = {
  ok: true;
  data: HrDocumentType[];
};

type HrEmployeeDocument = {
  id: string;
  documentTypeId: string;
  documentType: {
    id: string;
    code: string;
    name: string;
    category: string;
    isRequired?: boolean;
    requiresValidUntil?: boolean;
  } | null;
  status: string;
  validUntil: string;
  isSensitive: boolean;
  visibilityScope: string;
  hasCurrentAttachment: boolean;
  createdAt: string;
  updatedAt: string;
  redacted: boolean;
  notes?: string;
  rejectionReason?: string;
  waiverReason?: string;
  currentAttachment: {
    id: string;
    fileName: string;
    fileMimeType: string;
    fileSizeBytes: number;
    uploadedAt: string;
    signedUrl?: string;
  } | null;
};

type HrDocumentsResponse = {
  ok: true;
  data: HrEmployeeDocument[];
  permissions: {
    canViewSensitiveDocuments?: boolean;
    canManageDocuments?: boolean;
    canVerifyDocuments?: boolean;
  };
};

type CreateForm = {
  documentTypeId: string;
  validUntil: string;
  notes: string;
};

type ActiveAction =
  | { type: "update"; document: HrEmployeeDocument }
  | { type: "reject"; document: HrEmployeeDocument }
  | { type: "waive"; document: HrEmployeeDocument }
  | null;

const emptyDocuments: HrEmployeeDocument[] = [];

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: init?.body instanceof FormData ? init.headers : { "Content-Type": "application/json", Accept: "application/json", ...init?.headers }
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.message ?? "Não foi possível atualizar o dossiê documental.");
  }

  return payload as T;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = value.includes("T") ? new Date(value) : new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("pt-BR", value.includes("T") ? undefined : { timeZone: "UTC" });
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatBytes(value: number) {
  if (!Number.isFinite(value)) return "-";
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function documentStatusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: "Pendente",
    received: "Enviado",
    under_review: "Em análise",
    approved: "Aprovado",
    rejected: "Rejeitado",
    expired: "Vencido",
    replaced: "Substituído",
    waived: "Dispensado"
  };

  return labels[status] ?? status;
}

function documentStatusTone(status: string) {
  if (status === "approved" || status === "received") return "success" as const;
  if (status === "expired" || status === "rejected") return "danger" as const;
  if (status === "pending" || status === "under_review") return "warning" as const;
  return "visual" as const;
}

function categoryLabel(category: string | undefined) {
  const labels: Record<string, string> = {
    personal: "Pessoal",
    admission: "Admissão",
    contract: "Contrato",
    training: "Treinamento",
    termination: "Desligamento",
    internal: "Interno",
    other: "Outro"
  };

  return labels[category ?? ""] ?? "Documento";
}

function activeDocumentTypeIds(documents: HrEmployeeDocument[]) {
  return new Set(documents.map((document) => document.documentTypeId));
}

export function HrEmployeeDocumentsCard({
  employeeId,
  canViewSensitiveDocuments,
  canManageDocuments,
  canVerifyDocuments
}: {
  employeeId: string;
  canViewSensitiveDocuments: boolean;
  canManageDocuments: boolean;
  canVerifyDocuments: boolean;
}) {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [activeAction, setActiveAction] = useState<ActiveAction>(null);
  const [createForm, setCreateForm] = useState<CreateForm>({ documentTypeId: "", validUntil: "", notes: "" });
  const [actionText, setActionText] = useState("");
  const [actionValidUntil, setActionValidUntil] = useState("");

  const documentsQuery = useQuery({
    queryKey: ["hr", "employees", employeeId, "documents"],
    queryFn: async () => requestJson<HrDocumentsResponse>(`/api/hr/employees/${employeeId}/documents?includeSensitive=true`)
  });

  const documentTypesQuery = useQuery({
    queryKey: ["hr", "document-types", "active"],
    queryFn: async () => requestJson<HrDocumentTypesResponse>("/api/hr/document-types?status=active"),
    enabled: canManageDocuments && showCreate
  });

  const documents = documentsQuery.data?.data ?? emptyDocuments;
  const existingTypeIds = useMemo(() => activeDocumentTypeIds(documents), [documents]);
  const availableDocumentTypes = useMemo(
    () => (documentTypesQuery.data?.data ?? []).filter((documentType) => !existingTypeIds.has(documentType.id)),
    [documentTypesQuery.data?.data, existingTypeIds]
  );

  async function refreshDocuments() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["hr", "employees", employeeId, "documents"] }),
      queryClient.invalidateQueries({ queryKey: ["hr", "employees", employeeId] }),
      queryClient.invalidateQueries({ queryKey: ["hr", "employees", employeeId, "history"] })
    ]);
  }

  const actionMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) =>
      requestJson(`/api/hr/employees/${employeeId}/documents`, {
        method: "POST",
        body: JSON.stringify(body)
      }),
    onSuccess: async () => {
      setShowCreate(false);
      setCreateForm({ documentTypeId: "", validUntil: "", notes: "" });
      setActiveAction(null);
      setActionText("");
      setActionValidUntil("");
      await refreshDocuments();
    }
  });

  const uploadMutation = useMutation({
    mutationFn: async ({ documentId, file }: { documentId: string; file: File }) => {
      const formData = new FormData();
      formData.set("documentId", documentId);
      formData.set("file", file);
      return requestJson(`/api/hr/employees/${employeeId}/documents`, {
        method: "POST",
        body: formData
      });
    },
    onSuccess: refreshDocuments
  });

  function submitCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    actionMutation.mutate({
      action: "create",
      documentTypeId: createForm.documentTypeId,
      validUntil: createForm.validUntil,
      notes: createForm.notes
    });
  }

  function ensureDossier() {
    actionMutation.mutate({ action: "ensure_dossier" });
  }

  function startAction(type: NonNullable<ActiveAction>["type"], document: HrEmployeeDocument) {
    setActiveAction({ type, document });
    setActionText(type === "update" ? document.notes ?? "" : "");
    setActionValidUntil(type === "update" ? document.validUntil ?? "" : "");
  }

  function submitActiveAction(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeAction) return;

    if (activeAction.type === "update") {
      actionMutation.mutate({
        action: "update",
        documentId: activeAction.document.id,
        validUntil: actionValidUntil,
        notes: actionText
      });
      return;
    }

    actionMutation.mutate({
      action: activeAction.type,
      documentId: activeAction.document.id,
      reason: actionText
    });
  }

  return (
    <Card className="min-w-0 overflow-hidden border-border/80 shadow-sm shadow-primary/5">
      <div className="border-b p-4">
        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <FileCheck2 className="h-4 w-4 text-primary" />
              <h3 className="text-base font-semibold">Dossiê documental</h3>
              <StatusBadge status={canViewSensitiveDocuments ? "info" : "visual"} label={canViewSensitiveDocuments ? "Arquivos liberados" : "Arquivos protegidos"} />
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Controle operacional dos documentos do colaborador. Arquivos ficam em armazenamento privado e não expõem caminho técnico.
            </p>
          </div>
          {canManageDocuments ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={ensureDossier} disabled={actionMutation.isPending}>
                <FileCheck2 className="h-4 w-4" />
                Criar dossie padrao
              </Button>
              <Button type="button" size="sm" onClick={() => setShowCreate((current) => !current)} disabled={actionMutation.isPending}>
                <FilePlus2 className="h-4 w-4" />
                Solicitar documento
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="space-y-4 p-4">
        {documentsQuery.isLoading ? <LoadingTable label="Carregando dossiê documental..." /> : null}
        {documentsQuery.error ? <ErrorMessage message={documentsQuery.error instanceof Error ? documentsQuery.error.message : "Não foi possível carregar documentos."} /> : null}
        {actionMutation.error ? <ErrorMessage message={actionMutation.error instanceof Error ? actionMutation.error.message : "Não foi possível atualizar o documento."} /> : null}
        {uploadMutation.error ? <ErrorMessage message={uploadMutation.error instanceof Error ? uploadMutation.error.message : "Não foi possível anexar o arquivo."} /> : null}

        {showCreate ? (
          <form onSubmit={submitCreate} className="rounded-md border bg-muted/25 p-4">
            <div className="grid min-w-0 gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
              <Field label="Documento">
                <SelectField
                  value={createForm.documentTypeId}
                  onChange={(event) => setCreateForm((current) => ({ ...current, documentTypeId: event.target.value }))}
                  required
                  disabled={documentTypesQuery.isLoading || actionMutation.isPending}
                >
                  <option value="">Selecione o tipo documental</option>
                  {availableDocumentTypes.map((documentType) => (
                    <option key={documentType.id} value={documentType.id}>
                      {documentType.name}
                      {documentType.isRequired ? " - obrigatório" : ""}
                    </option>
                  ))}
                </SelectField>
              </Field>
              <Field label="Vencimento">
                <Input
                  type="date"
                  value={createForm.validUntil}
                  onChange={(event) => setCreateForm((current) => ({ ...current, validUntil: event.target.value }))}
                  disabled={actionMutation.isPending}
                />
              </Field>
              <Field label="Observação" className="md:col-span-2">
                <TextArea
                  value={createForm.notes}
                  onChange={(event) => setCreateForm((current) => ({ ...current, notes: event.target.value }))}
                  maxLength={500}
                  placeholder="Orientação curta para o RH sobre este documento."
                  disabled={actionMutation.isPending}
                />
              </Field>
            </div>
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)} disabled={actionMutation.isPending}>
                Cancelar
              </Button>
              <Button type="submit" disabled={actionMutation.isPending || !createForm.documentTypeId}>
                Solicitar
              </Button>
            </div>
          </form>
        ) : null}

        {!documentsQuery.isLoading && !documentsQuery.error && !documents.length ? (
          <div className="space-y-3">
            <EmptyState
              title="Nenhuma pendencia documental criada"
              description="Crie o dossie padrao para acompanhar documentos obrigatorios, envios, conferencias, dispensas e vencimentos do colaborador."
            />
            {canManageDocuments ? (
              <div className="flex justify-center">
                <Button type="button" onClick={ensureDossier} disabled={actionMutation.isPending}>
                  <FileCheck2 className="h-4 w-4" />
                  Criar dossie padrao
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        {documents.length ? (
          <div className="space-y-3">
            {documents.map((document) => (
              <article key={document.id} className="rounded-md border bg-background p-4">
                <div className="flex min-w-0 flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <FileText className="h-4 w-4 text-primary" />
                      <h4 className="break-words text-sm font-semibold text-foreground">{document.documentType?.name ?? "Documento sem tipo informado"}</h4>
                      <StatusBadge status={documentStatusTone(document.status)} label={documentStatusLabel(document.status)} />
                      <StatusBadge status={document.documentType?.isRequired ? "warning" : "visual"} label={document.documentType?.isRequired ? "Obrigatório" : "Opcional"} />
                      {document.isSensitive ? <StatusBadge status="warning" label="Restrito" /> : null}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>Categoria: {categoryLabel(document.documentType?.category)}</span>
                      <span>Vencimento: {formatDate(document.validUntil)}</span>
                      <span>Atualizado: {formatDateTime(document.updatedAt)}</span>
                    </div>
                    {document.notes ? <p className="break-words text-sm leading-6 text-muted-foreground">Observação: {document.notes}</p> : null}
                    {document.rejectionReason ? <p className="break-words text-sm leading-6 text-destructive">Motivo da rejeição: {document.rejectionReason}</p> : null}
                    {document.waiverReason ? <p className="break-words text-sm leading-6 text-muted-foreground">Motivo da dispensa: {document.waiverReason}</p> : null}
                  </div>

                  <div className="min-w-0 xl:w-[360px]">
                    {document.currentAttachment ? (
                      <div className="rounded-md border bg-muted/25 p-3">
                        <p className="break-words text-sm font-medium text-foreground">{document.currentAttachment.fileName}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatBytes(document.currentAttachment.fileSizeBytes)} | Enviado em {formatDateTime(document.currentAttachment.uploadedAt)}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {document.currentAttachment.signedUrl ? (
                            <>
                              <Button asChild variant="outline" size="sm">
                                <a href={document.currentAttachment.signedUrl} target="_blank" rel="noreferrer">
                                  <Eye className="h-4 w-4" />
                                  Visualizar
                                </a>
                              </Button>
                              <Button asChild variant="outline" size="sm">
                                <a href={document.currentAttachment.signedUrl} download={document.currentAttachment.fileName}>
                                  <Download className="h-4 w-4" />
                                  Baixar
                                </a>
                              </Button>
                            </>
                          ) : (
                            <StatusBadge status="visual" label="Arquivo restrito" />
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-md border bg-muted/25 p-3 text-sm text-muted-foreground">Nenhum arquivo anexado.</div>
                    )}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3">
                  {canManageDocuments ? (
                    <>
                      <label className="inline-flex max-w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium leading-tight hover:bg-muted">
                        <Upload className="h-4 w-4" />
                        {document.hasCurrentAttachment ? "Substituir arquivo" : "Anexar arquivo"}
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                          className="hidden"
                          disabled={uploadMutation.isPending}
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) uploadMutation.mutate({ documentId: document.id, file });
                            event.target.value = "";
                          }}
                        />
                      </label>
                      <Button type="button" variant="outline" size="sm" onClick={() => startAction("update", document)}>
                        Registrar observação
                      </Button>
                    </>
                  ) : null}
                  {canVerifyDocuments ? (
                    <>
                      <Button type="button" variant="outline" size="sm" onClick={() => actionMutation.mutate({ action: "approve", documentId: document.id })} disabled={document.status === "approved"}>
                        <CheckCircle2 className="h-4 w-4" />
                        Aprovar
                      </Button>
                      <Button type="button" variant="danger" size="sm" onClick={() => startAction("reject", document)}>
                        <XCircle className="h-4 w-4" />
                        Rejeitar
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => startAction("waive", document)}>
                        <ShieldAlert className="h-4 w-4" />
                        Dispensar
                      </Button>
                    </>
                  ) : null}
                </div>

                {activeAction?.document.id === document.id ? (
                  <form onSubmit={submitActiveAction} className="mt-3 rounded-md border bg-muted/25 p-3">
                    {activeAction.type === "update" ? (
                      <div className="grid min-w-0 gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
                        <Field label="Vencimento">
                          <Input type="date" value={actionValidUntil} onChange={(event) => setActionValidUntil(event.target.value)} disabled={actionMutation.isPending} />
                        </Field>
                        <Field label="Observação">
                          <TextArea value={actionText} onChange={(event) => setActionText(event.target.value)} maxLength={500} disabled={actionMutation.isPending} />
                        </Field>
                      </div>
                    ) : (
                      <Field label={activeAction.type === "reject" ? "Motivo da rejeição" : "Motivo da dispensa"}>
                        <TextArea
                          value={actionText}
                          onChange={(event) => setActionText(event.target.value)}
                          maxLength={500}
                          required
                          disabled={actionMutation.isPending}
                          placeholder="Registre uma justificativa objetiva."
                        />
                      </Field>
                    )}
                    <div className="mt-3 flex flex-wrap justify-end gap-2">
                      <Button type="button" variant="outline" onClick={() => setActiveAction(null)} disabled={actionMutation.isPending}>
                        Cancelar
                      </Button>
                      <Button type="submit" disabled={actionMutation.isPending || (activeAction.type !== "update" && actionText.trim().length < 3)}>
                        Salvar
                      </Button>
                    </div>
                  </form>
                ) : null}
              </article>
            ))}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
