"use client";

import type { ReactNode } from "react";
import { Field, TextArea, TextInput } from "@/components/base-cadastros/crud-components";
import { StatusBadge } from "@/components/common/status-badge";
import {
  purchaseQuoteEvidenceTypeLabelMap,
  purchaseQuoteSourceContactChannelLabelMap,
  purchaseQuoteSourceTypeLabelMap,
  type PurchaseQuoteEvidenceClassification,
  type PurchaseQuoteEvidenceType,
  type PurchaseQuoteSourceContactChannel,
  type PurchaseQuoteSourceType
} from "@/lib/purchases/quote-schemas";
import { getEvidenceUploadHint, isSourceNotesRequired, type EvidenceBlockField } from "@/components/purchases/purchase-quotes-utils";

const quoteSourceTypeOptions = Object.entries(purchaseQuoteSourceTypeLabelMap) as Array<[PurchaseQuoteSourceType, string]>;
const evidenceTypeOptions = Object.entries(purchaseQuoteEvidenceTypeLabelMap) as Array<[PurchaseQuoteEvidenceType, string]>;
const sourceContactChannelOptions = Object.entries(purchaseQuoteSourceContactChannelLabelMap) as Array<[PurchaseQuoteSourceContactChannel, string]>;

export type QuoteEvidenceValues = {
  quoteSourceType: PurchaseQuoteSourceType | "";
  evidenceType: PurchaseQuoteEvidenceType | "";
  sourceContactName: string;
  sourceContactChannel: PurchaseQuoteSourceContactChannel | "";
  sourceReference: string;
  sourceUrl: string;
  sourceNotes: string;
  evidenceMissingReason: string;
  emergencyReason: string;
  regularizationDeadline: string;
  isVerbalQuote: boolean;
  isEmergencyQuote: boolean;
  regularizationRequired: boolean;
};

export type QuoteEvidenceErrors = Partial<Record<EvidenceBlockField, string | undefined>>;

type QuoteEvidenceFieldsProps = {
  values: QuoteEvidenceValues;
  onChange: (field: keyof QuoteEvidenceValues, value: string | boolean) => void;
  /** Ausente = o chamador não valida estes campos (é o caso da negociação). */
  errors?: QuoteEvidenceErrors;
  classification: PurchaseQuoteEvidenceClassification;
  /** P3: enquanto false, o badge fica neutro ("A classificar"), sem severidade nem alertas. */
  showClassification: boolean;
  /** Bloco de anexos, que difere entre cotação e negociação (estados de arquivo distintos). */
  attachmentSlot?: ReactNode;
  /** Prefixo dos data-testid, para as duas telas não colidirem. */
  testIdPrefix?: string;
};

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return <p className="text-xs text-destructive">{message}</p>;
}

/**
 * Seção "origem e evidência" compartilhada entre o formulário de cotação e o de nova proposta
 * (negociação), que antes eram dois blocos de JSX divergentes.
 *
 * Componente CONTROLADO de propósito: a cotação usa react-hook-form e a negociação usa um
 * objeto de estado plano. Receber o objeto do RHF obrigaria a migrar a negociação junto —
 * refactor maior e fora desta fatia. Com values/onChange os dois chamadores adaptam.
 *
 * Este componente é só apresentação: não valida, não classifica, não decide alçada.
 */
export function QuoteEvidenceFields({
  values,
  onChange,
  errors,
  classification,
  showClassification,
  attachmentSlot,
  testIdPrefix = "cotacao"
}: QuoteEvidenceFieldsProps) {
  const sourceNotesRequired = isSourceNotesRequired(values);

  return (
    <div className="space-y-3">
      <div className="grid min-w-0 gap-4 xl:grid-cols-3">
        <Field label="Origem da cotação">
          <select
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            data-testid={`${testIdPrefix}-origem`}
            name="quoteSourceType"
            value={values.quoteSourceType}
            onChange={(event) => onChange("quoteSourceType", event.target.value)}
          >
            {quoteSourceTypeOptions.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <FieldError message={errors?.quoteSourceType} />
        </Field>
        <Field label="Tipo de evidência">
          <select
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            data-testid={`${testIdPrefix}-tipo-evidencia`}
            name="evidenceType"
            value={values.evidenceType}
            onChange={(event) => onChange("evidenceType", event.target.value)}
          >
            {evidenceTypeOptions.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <FieldError message={errors?.evidenceType} />
        </Field>
        {values.quoteSourceType !== "formal_proposal" && values.quoteSourceType !== "website_catalog" ? (
          <Field label={values.quoteSourceType === "in_person" ? "Contato/atendente" : "Nome do contato"}>
            <TextInput name="sourceContactName" value={values.sourceContactName} onChange={(event) => onChange("sourceContactName", event.target.value)} />
            <FieldError message={errors?.sourceContactName} />
          </Field>
        ) : null}
        {(values.quoteSourceType === "phone_call" || values.quoteSourceType === "other") ? (
          <Field label="Canal de contato">
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              name="sourceContactChannel"
              value={values.sourceContactChannel}
              onChange={(event) => onChange("sourceContactChannel", event.target.value)}
            >
              <option value="">Não informado</option>
              {sourceContactChannelOptions.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <FieldError message={errors?.sourceContactChannel} />
          </Field>
        ) : null}
        {values.quoteSourceType !== "phone_call" && values.quoteSourceType !== "in_person" ? (
          <Field label={values.quoteSourceType === "whatsapp" ? "Telefone/WhatsApp ou referência" : "Referência externa"}>
            <TextInput
              name="sourceReference"
              placeholder="Ex.: e-mail, protocolo, mensagem"
              value={values.sourceReference}
              onChange={(event) => onChange("sourceReference", event.target.value)}
            />
            <FieldError message={errors?.sourceReference} />
          </Field>
        ) : null}
        {values.quoteSourceType === "website_catalog" ? (
          <Field label="URL da origem" className="xl:col-span-2">
            <TextInput name="sourceUrl" placeholder="https://..." value={values.sourceUrl} onChange={(event) => onChange("sourceUrl", event.target.value)} />
            <FieldError message={errors?.sourceUrl} />
          </Field>
        ) : null}
        {(values.quoteSourceType === "emergency" || values.regularizationRequired) ? (
          <Field label="Prazo de regularização">
            <TextInput
              type="date"
              name="regularizationDeadline"
              value={values.regularizationDeadline}
              onChange={(event) => onChange("regularizationDeadline", event.target.value)}
            />
            <FieldError message={errors?.regularizationDeadline} />
          </Field>
        ) : null}
        {/* M2: a justificativa sobe e fica em destaque; a observação da origem desce e vira
            opcional no caminho verbal (o superRefine passou a aceitar uma OU outra). */}
        {(values.evidenceType === "none" || classification.requiresJustification) ? (
          <Field label="Justificativa da evidência frágil ou ausente" className="xl:col-span-3">
            <TextArea
              rows={3}
              data-testid={`${testIdPrefix}-justificativa`}
              name="evidenceMissingReason"
              value={values.evidenceMissingReason}
              onChange={(event) => onChange("evidenceMissingReason", event.target.value)}
            />
            <FieldError message={errors?.evidenceMissingReason} />
          </Field>
        ) : null}
        <Field label={sourceNotesRequired ? "Observações da origem" : "Observações da origem (opcional)"} className="xl:col-span-3">
          <TextArea
            rows={3}
            data-testid={`${testIdPrefix}-observacoes`}
            name="sourceNotes"
            value={values.sourceNotes}
            onChange={(event) => onChange("sourceNotes", event.target.value)}
          />
          <FieldError message={errors?.sourceNotes} />
        </Field>
        {(values.isEmergencyQuote || values.quoteSourceType === "emergency") ? (
          <Field label="Motivo da emergência" className="xl:col-span-3">
            <TextArea rows={3} name="emergencyReason" value={values.emergencyReason} onChange={(event) => onChange("emergencyReason", event.target.value)} />
            <FieldError message={errors?.emergencyReason} />
          </Field>
        ) : null}
      </div>

      <div className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-3">
        <Field label="Cotação verbal?" className="flex items-center gap-2">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-input"
            checked={values.isVerbalQuote}
            onChange={(event) => onChange("isVerbalQuote", event.target.checked)}
          />
          <span className="text-muted-foreground">Sem proposta formal escrita</span>
        </Field>
        <Field label="Cotação emergencial?" className="flex items-center gap-2">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-input"
            checked={values.isEmergencyQuote}
            onChange={(event) => onChange("isEmergencyQuote", event.target.checked)}
          />
          <span className="text-muted-foreground">Compra sensível ao tempo</span>
        </Field>
        <Field label="Exige regularização?" className="flex items-center gap-2">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-input"
            checked={values.regularizationRequired}
            onChange={(event) => onChange("regularizationRequired", event.target.checked)}
          />
          <span className="text-muted-foreground">Documentar depois</span>
        </Field>
      </div>

      <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
        {getEvidenceUploadHint(values.quoteSourceType)}
      </div>

      {attachmentSlot}

      {/* P3: a classificação fica DEPOIS dos campos que a determinam, nunca antes. */}
      <div className="space-y-2 rounded-md border bg-muted/20 px-3 py-2 text-sm" data-testid={`${testIdPrefix}-classificacao`}>
        {showClassification ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-foreground">Classificação documental: {classification.label}</span>
              <StatusBadge status={classification.severity} label={classification.label} />
            </div>
            <p className="text-xs text-muted-foreground">Motivo: {classification.reason}</p>
            {classification.alerts.length ? (
              <div className="flex flex-wrap gap-1.5">
                {classification.alerts.map((alert) => (
                  <StatusBadge key={alert} status={classification.severity === "danger" ? "danger" : "warning"} label={alert} />
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium text-foreground">Classificação documental: a classificar</span>
            <StatusBadge status="info" label="A classificar" />
          </div>
        )}
      </div>
    </div>
  );
}
