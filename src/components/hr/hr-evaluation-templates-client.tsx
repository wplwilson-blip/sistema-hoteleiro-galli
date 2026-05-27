"use client";

import { useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  ClipboardCheck,
  Edit2,
  Eye,
  FilePlus2,
  ListChecks,
  Plus,
  PowerOff,
  Save,
  Search,
  SlidersHorizontal,
  Star,
  Trash2,
  Wand2
} from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { StatusBadge } from "@/components/common/status-badge";
import { ErrorMessage, Field, LoadingTable, SelectField, TextArea } from "@/components/base-cadastros/crud-components";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { hotelGalliEvaluationTemplatePresets, type EvaluationTemplatePreset } from "@/lib/hr/evaluation-template-presets";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";

type OptionRow = {
  id: string;
  code: string;
  name: string;
  status: string;
  unitId?: string;
  departmentId?: string;
  unitName?: string;
  departmentName?: string;
};

type EvaluationCriterion = {
  id: string;
  sectionId: string;
  code: string;
  title: string;
  description: string;
  expectedBehavior: string;
  weight: number;
  sortOrder: number;
  isRequired: boolean;
  isCritical: boolean;
  requiresCommentBelowScore: boolean;
  commentRequiredScoreThreshold: number | null;
  status: string;
};

type EvaluationSection = {
  id: string;
  templateId: string;
  code: string;
  title: string;
  description: string;
  weight: number;
  sortOrder: number;
  isRequired: boolean;
  status: string;
  criteria: EvaluationCriterion[];
};

type EvaluationTemplate = {
  id: string;
  organizationId: string | null;
  unitId: string | null;
  departmentId: string | null;
  jobPositionId: string | null;
  code: string;
  name: string;
  description: string;
  evaluationType: string;
  status: string;
  scaleMin: number;
  scaleMax: number;
  passingScore: number | null;
  requiresFeedback: boolean;
  requiresEmployeeAcknowledgement: boolean;
  defaultFrequency: string;
  isSystemDefault: boolean;
  unitName: string;
  departmentName: string;
  jobPositionName: string;
  updatedAt: string;
  sections?: EvaluationSection[];
};

type ListResponse<T> = { ok: true; data: T[] };
type DetailResponse<T> = { ok: true; data: T };
type UnitsResponse = { ok: true; units: OptionRow[] };
type DepartmentsResponse = { ok: true; departments: OptionRow[] };
type JobPositionsResponse = { ok: true; positions: OptionRow[] };

type TemplateForm = {
  code: string;
  name: string;
  description: string;
  evaluationType: string;
  defaultFrequency: string;
  status: string;
  unitId: string;
  departmentId: string;
  jobPositionId: string;
  passingScore: string;
  requiresFeedback: boolean;
  requiresEmployeeAcknowledgement: boolean;
};

type SectionForm = {
  code: string;
  title: string;
  description: string;
  weight: string;
  sortOrder: string;
  status: string;
  isRequired: boolean;
};

type CriterionForm = {
  code: string;
  title: string;
  description: string;
  expectedBehavior: string;
  weight: string;
  sortOrder: string;
  status: string;
  isRequired: boolean;
  isCritical: boolean;
  requiresCommentBelowScore: boolean;
  commentRequiredScoreThreshold: string;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

const evaluationTypeOptions = [
  { value: "experience", label: "Experiencia" },
  { value: "periodic", label: "Periodica" },
  { value: "promotion", label: "Mudanca de funcao" },
  { value: "corrective", label: "Acompanhamento" },
  { value: "specific", label: "Pontual" }
];

const frequencyOptions = [
  { value: "experience_45_days", label: "Experiencia - 45 dias" },
  { value: "experience_90_days", label: "Experiencia - 90 dias" },
  { value: "semiannual", label: "Semestral" },
  { value: "annual", label: "Anual" },
  { value: "on_demand", label: "Sob demanda" }
];

const statusOptions = [
  { value: "draft", label: "Rascunho" },
  { value: "active", label: "Ativo" },
  { value: "inactive", label: "Inativo" },
  { value: "archived", label: "Arquivado" }
];

const childStatusOptions = [
  { value: "active", label: "Ativo" },
  { value: "inactive", label: "Inativo" },
  { value: "archived", label: "Arquivado" }
];

const emptyTemplateForm: TemplateForm = {
  code: "",
  name: "",
  description: "",
  evaluationType: "experience",
  defaultFrequency: "experience_90_days",
  status: "draft",
  unitId: "",
  departmentId: "",
  jobPositionId: "",
  passingScore: "",
  requiresFeedback: true,
  requiresEmployeeAcknowledgement: true
};

const emptySectionForm: SectionForm = {
  code: "",
  title: "",
  description: "",
  weight: "1",
  sortOrder: "0",
  status: "active",
  isRequired: true
};

const emptyCriterionForm: CriterionForm = {
  code: "",
  title: "",
  description: "",
  expectedBehavior: "",
  weight: "1",
  sortOrder: "0",
  status: "active",
  isRequired: true,
  isCritical: false,
  requiresCommentBelowScore: false,
  commentRequiredScoreThreshold: ""
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", Accept: "application/json", ...init?.headers }
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.message ?? "Nao foi possivel atualizar os modelos de avaliacao.");
  }
  return payload as T;
}

function buildUrl(path: string, params: Record<string, string | undefined>) {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) searchParams.set(key, value);
  }
  const query = searchParams.toString();
  return query ? `${path}?${query}` : path;
}

function typeLabel(value: string) {
  return evaluationTypeOptions.find((item) => item.value === value)?.label ?? value;
}

function frequencyLabel(value: string) {
  return frequencyOptions.find((item) => item.value === value)?.label ?? "Nao definida";
}

function statusLabel(value: string) {
  return statusOptions.find((item) => item.value === value)?.label ?? childStatusOptions.find((item) => item.value === value)?.label ?? value;
}

function statusTone(status: string) {
  if (status === "active") return "success" as const;
  if (status === "draft") return "warning" as const;
  if (status === "archived") return "visual" as const;
  return "info" as const;
}

function toCode(value: string, fallback: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase()
    .slice(0, 40);
  return normalized || fallback;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("pt-BR");
}

function templateToForm(template: EvaluationTemplate): TemplateForm {
  return {
    code: template.code,
    name: template.name,
    description: template.description,
    evaluationType: template.evaluationType,
    defaultFrequency: template.defaultFrequency,
    status: template.status,
    unitId: template.unitId ?? "",
    departmentId: template.departmentId ?? "",
    jobPositionId: template.jobPositionId ?? "",
    passingScore: template.passingScore == null ? "" : String(template.passingScore),
    requiresFeedback: template.requiresFeedback,
    requiresEmployeeAcknowledgement: template.requiresEmployeeAcknowledgement
  };
}

function sectionToForm(section: EvaluationSection): SectionForm {
  return {
    code: section.code,
    title: section.title,
    description: section.description,
    weight: String(section.weight),
    sortOrder: String(section.sortOrder),
    status: section.status,
    isRequired: section.isRequired
  };
}

function criterionToForm(criterion: EvaluationCriterion): CriterionForm {
  return {
    code: criterion.code,
    title: criterion.title,
    description: criterion.description,
    expectedBehavior: criterion.expectedBehavior,
    weight: String(criterion.weight),
    sortOrder: String(criterion.sortOrder),
    status: criterion.status,
    isRequired: criterion.isRequired,
    isCritical: criterion.isCritical,
    requiresCommentBelowScore: criterion.requiresCommentBelowScore,
    commentRequiredScoreThreshold: criterion.commentRequiredScoreThreshold == null ? "" : String(criterion.commentRequiredScoreThreshold)
  };
}

function templatePayload(form: TemplateForm) {
  return {
    code: form.code.trim().toUpperCase(),
    name: form.name.trim(),
    description: form.description.trim() || undefined,
    evaluationType: form.evaluationType,
    defaultFrequency: form.defaultFrequency || undefined,
    status: form.status,
    unitId: form.unitId || undefined,
    departmentId: form.departmentId || undefined,
    jobPositionId: form.jobPositionId || undefined,
    scaleMin: 1,
    scaleMax: 5,
    passingScore: form.passingScore === "" ? undefined : Number(form.passingScore),
    requiresFeedback: form.requiresFeedback,
    requiresEmployeeAcknowledgement: form.requiresEmployeeAcknowledgement,
    isSystemDefault: false
  };
}

function sectionPayload(form: SectionForm) {
  return {
    code: form.code.trim().toUpperCase(),
    title: form.title.trim(),
    description: form.description.trim() || undefined,
    weight: Number(form.weight || 1),
    sortOrder: Number(form.sortOrder || 0),
    appliesToAll: true,
    isRequired: form.isRequired,
    status: form.status
  };
}

function criterionPayload(form: CriterionForm) {
  return {
    code: form.code.trim().toUpperCase(),
    title: form.title.trim(),
    description: form.description.trim() || undefined,
    expectedBehavior: form.expectedBehavior.trim() || undefined,
    weight: Number(form.weight || 1),
    sortOrder: Number(form.sortOrder || 0),
    isRequired: form.isRequired,
    isCritical: form.isCritical,
    requiresCommentBelowScore: form.requiresCommentBelowScore,
    commentRequiredScoreThreshold: form.commentRequiredScoreThreshold === "" ? undefined : Number(form.commentRequiredScoreThreshold),
    status: form.status
  };
}

function presetTemplatePayload(preset: EvaluationTemplatePreset, unitId?: string) {
  return {
    code: preset.code,
    name: preset.name,
    description: preset.description,
    evaluationType: preset.evaluationType,
    defaultFrequency: preset.defaultFrequency,
    status: "inactive",
    unitId,
    scaleMin: 1,
    scaleMax: 5,
    passingScore: preset.passingScore,
    requiresFeedback: true,
    requiresEmployeeAcknowledgement: true,
    isSystemDefault: false
  };
}

function presetSectionPayload(section: EvaluationTemplatePreset["sections"][number], sortOrder: number) {
  return {
    code: section.code,
    title: section.title,
    description: section.description,
    weight: section.weight ?? 1,
    sortOrder,
    appliesToAll: true,
    isRequired: true,
    status: "active"
  };
}

function presetCriterionPayload(criterionItem: EvaluationTemplatePreset["sections"][number]["criteria"][number], sortOrder: number) {
  return {
    code: criterionItem.code,
    title: criterionItem.title,
    description: criterionItem.description,
    expectedBehavior: undefined,
    weight: criterionItem.weight ?? 1,
    sortOrder,
    isRequired: true,
    isCritical: Boolean(criterionItem.isCritical),
    requiresCommentBelowScore: Boolean(criterionItem.requiresCommentBelowScore),
    commentRequiredScoreThreshold: criterionItem.commentRequiredScoreThreshold,
    status: "active"
  };
}

function ToggleField({
  checked,
  label,
  onChange
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-10 items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function TemplateFormPanel({
  form,
  setForm,
  units,
  departments,
  positions,
  isSaving,
  title,
  submitLabel,
  onSubmit,
  onCancel
}: {
  form: TemplateForm;
  setForm: Dispatch<SetStateAction<TemplateForm>>;
  units: OptionRow[];
  departments: OptionRow[];
  positions: OptionRow[];
  isSaving: boolean;
  title: string;
  submitLabel: string;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const filteredDepartments = departments.filter((department) => !form.unitId || department.unitId === form.unitId);
  const filteredPositions = positions.filter(
    (position) => (!form.unitId || position.unitId === form.unitId) && (!form.departmentId || position.departmentId === form.departmentId)
  );

  return (
    <Card className="border-border/80 p-4 shadow-sm shadow-primary/5">
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold">{title}</h2>
            <p className="text-xs text-muted-foreground">Escala fixa de 1 a 5 para manter a rotina simples.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onCancel}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={isSaving}>
              <Save className="h-4 w-4" />
              {submitLabel}
            </Button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Nome">
            <Input
              value={form.name}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  name: event.target.value,
                  code: current.code || toCode(event.target.value, "MODELO")
                }))
              }
              required
              maxLength={160}
            />
          </Field>
          <Field label="Código interno">
            <Input value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: toCode(event.target.value, "MODELO") }))} required />
          </Field>
          <Field label="Tipo">
            <SelectField
              value={form.evaluationType}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  evaluationType: event.target.value,
                  defaultFrequency: event.target.value === "experience" ? "experience_90_days" : "semiannual"
                }))
              }
            >
              {evaluationTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectField>
          </Field>
          <Field label="Periodicidade">
            <SelectField value={form.defaultFrequency} onChange={(event) => setForm((current) => ({ ...current, defaultFrequency: event.target.value }))}>
              {frequencyOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectField>
          </Field>
          <Field label="Status">
            <SelectField value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}>
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectField>
          </Field>
          <Field label="Unidade">
            <SelectField
              value={form.unitId}
              onChange={(event) => setForm((current) => ({ ...current, unitId: event.target.value, departmentId: "", jobPositionId: "" }))}
            >
              <option value="">Todas permitidas</option>
              {units.filter((unit) => unit.status === "active").map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.code ? `${unit.code} - ${unit.name}` : unit.name}
                </option>
              ))}
            </SelectField>
          </Field>
          <Field label="Departamento">
            <SelectField
              value={form.departmentId}
              onChange={(event) => setForm((current) => ({ ...current, departmentId: event.target.value, jobPositionId: "" }))}
              disabled={!filteredDepartments.length}
            >
              <option value="">Todos</option>
              {filteredDepartments.filter((department) => department.status === "active").map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </SelectField>
          </Field>
          <Field label="Cargo">
            <SelectField value={form.jobPositionId} onChange={(event) => setForm((current) => ({ ...current, jobPositionId: event.target.value }))} disabled={!filteredPositions.length}>
              <option value="">Todos</option>
              {filteredPositions.filter((position) => position.status === "active").map((position) => (
                <option key={position.id} value={position.id}>
                  {position.name}
                </option>
              ))}
            </SelectField>
          </Field>
          <Field label="Nota mínima">
            <Input
              type="number"
              min={1}
              max={5}
              step="0.1"
              value={form.passingScore}
              onChange={(event) => setForm((current) => ({ ...current, passingScore: event.target.value }))}
              placeholder="Opcional"
            />
          </Field>
          <div className="grid gap-2 md:col-span-2 xl:col-span-3">
            <ToggleField checked={form.requiresFeedback} label="Exigir devolutiva do gestor" onChange={(checked) => setForm((current) => ({ ...current, requiresFeedback: checked }))} />
            <ToggleField
              checked={form.requiresEmployeeAcknowledgement}
              label="Registrar ciência do colaborador"
              onChange={(checked) => setForm((current) => ({ ...current, requiresEmployeeAcknowledgement: checked }))}
            />
          </div>
          <Field label="Descrição" className="md:col-span-2 xl:col-span-4">
            <TextArea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} maxLength={2000} />
          </Field>
        </div>
      </form>
    </Card>
  );
}

function SectionFormPanel({
  form,
  setForm,
  isSaving,
  submitLabel,
  onSubmit,
  onCancel
}: {
  form: SectionForm;
  setForm: Dispatch<SetStateAction<SectionForm>>;
  isSaving: boolean;
  submitLabel: string;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <form
      className="rounded-md border bg-muted/20 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="grid gap-3 md:grid-cols-4">
        <Field label="Grupo da avaliação" className="md:col-span-2">
          <Input
            value={form.title}
            onChange={(event) => setForm((current) => ({ ...current, title: event.target.value, code: current.code || toCode(event.target.value, "SECAO") }))}
            required
          />
        </Field>
        <Field label="Ordem">
          <Input type="number" min={0} value={form.sortOrder} onChange={(event) => setForm((current) => ({ ...current, sortOrder: event.target.value }))} />
        </Field>
        <Field label="Peso">
          <Input type="number" min={0} step="0.1" value={form.weight} onChange={(event) => setForm((current) => ({ ...current, weight: event.target.value }))} />
        </Field>
        <Field label="Código interno">
          <Input value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: toCode(event.target.value, "SECAO") }))} required />
        </Field>
        <Field label="Status">
          <SelectField value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}>
            {childStatusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectField>
        </Field>
        <div className="md:col-span-2">
          <ToggleField checked={form.isRequired} label="Grupo obrigatório" onChange={(checked) => setForm((current) => ({ ...current, isRequired: checked }))} />
        </div>
        <Field label="Descrição" className="md:col-span-4">
          <TextArea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} maxLength={2000} />
        </Field>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={isSaving}>
          <Save className="h-4 w-4" />
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

function CriterionFormPanel({
  form,
  setForm,
  isSaving,
  submitLabel,
  onSubmit,
  onCancel
}: {
  form: CriterionForm;
  setForm: Dispatch<SetStateAction<CriterionForm>>;
  isSaving: boolean;
  submitLabel: string;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <form
      className="rounded-md border bg-background p-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="grid gap-3 md:grid-cols-4">
        <Field label="Item avaliado" className="md:col-span-2">
          <Input
            value={form.title}
            onChange={(event) => setForm((current) => ({ ...current, title: event.target.value, code: current.code || toCode(event.target.value, "CRITERIO") }))}
            required
          />
        </Field>
        <Field label="Ordem">
          <Input type="number" min={0} value={form.sortOrder} onChange={(event) => setForm((current) => ({ ...current, sortOrder: event.target.value }))} />
        </Field>
        <Field label="Peso">
          <Input type="number" min={0} step="0.1" value={form.weight} onChange={(event) => setForm((current) => ({ ...current, weight: event.target.value }))} />
        </Field>
        <Field label="Código interno">
          <Input value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: toCode(event.target.value, "CRITERIO") }))} required />
        </Field>
        <Field label="Status">
          <SelectField value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}>
            {childStatusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectField>
        </Field>
        <Field label="Pedir comentário até nota">
          <Input
            type="number"
            min={0}
            max={5}
            step="0.1"
            value={form.commentRequiredScoreThreshold}
            onChange={(event) => setForm((current) => ({ ...current, commentRequiredScoreThreshold: event.target.value, requiresCommentBelowScore: Boolean(event.target.value) }))}
            placeholder="Opcional"
          />
        </Field>
        <div className="grid gap-2">
          <ToggleField checked={form.isRequired} label="Obrigatório" onChange={(checked) => setForm((current) => ({ ...current, isRequired: checked }))} />
          <ToggleField checked={form.isCritical} label="Item crítico" onChange={(checked) => setForm((current) => ({ ...current, isCritical: checked }))} />
        </div>
        <Field label="Descrição" className="md:col-span-2">
          <TextArea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} maxLength={2000} />
        </Field>
        <Field label="Comportamento esperado" className="md:col-span-2">
          <TextArea value={form.expectedBehavior} onChange={(event) => setForm((current) => ({ ...current, expectedBehavior: event.target.value }))} maxLength={3000} />
        </Field>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={isSaving}>
          <Save className="h-4 w-4" />
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

export function HrEvaluationTemplatesClient() {
  const queryClient = useQueryClient();
  const activeUnit = useAppStore((state) => state.activeUnit);
  const activeUnitId = uuidPattern.test(activeUnit?.id ?? "") ? activeUnit.id : undefined;
  const [filters, setFilters] = useState({ search: "", status: "", evaluationType: "" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(false);
  const [templateFormState, setTemplateFormState] = useState<TemplateForm>(emptyTemplateForm);
  const [sectionFormState, setSectionFormState] = useState<SectionForm>(emptySectionForm);
  const [criterionFormState, setCriterionFormState] = useState<CriterionForm>(emptyCriterionForm);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [newCriterionSectionId, setNewCriterionSectionId] = useState<string | null>(null);
  const [editingCriterionId, setEditingCriterionId] = useState<string | null>(null);

  const templatesQuery = useQuery({
    queryKey: ["hr", "evaluation-templates", filters, activeUnitId],
    queryFn: async () =>
      requestJson<ListResponse<EvaluationTemplate>>(
        buildUrl("/api/hr/evaluation-templates", {
          search: filters.search,
          status: filters.status,
          evaluationType: filters.evaluationType,
          unitId: activeUnitId
        })
      )
  });

  const templates = useMemo(() => templatesQuery.data?.data ?? [], [templatesQuery.data?.data]);
  const selectedTemplateId = selectedId ?? templates[0]?.id ?? null;

  const detailQuery = useQuery({
    queryKey: ["hr", "evaluation-template-detail", selectedTemplateId],
    queryFn: async () => requestJson<DetailResponse<EvaluationTemplate>>(`/api/hr/evaluation-templates/${selectedTemplateId}`),
    enabled: Boolean(selectedTemplateId)
  });

  const unitsQuery = useQuery({ queryKey: ["base", "units"], queryFn: async () => requestJson<UnitsResponse>("/api/base/units") });
  const departmentsQuery = useQuery({ queryKey: ["base", "departments"], queryFn: async () => requestJson<DepartmentsResponse>("/api/base/departments") });
  const positionsQuery = useQuery({ queryKey: ["base", "job-positions"], queryFn: async () => requestJson<JobPositionsResponse>("/api/base/job-positions") });

  const detail = detailQuery.data?.data ?? null;
  const units = unitsQuery.data?.units ?? [];
  const departments = departmentsQuery.data?.departments ?? [];
  const positions = positionsQuery.data?.positions ?? [];
  const activeTemplates = templates.filter((template) => template.status === "active").length;
  const totalCriteria = useMemo(() => (detail?.sections ?? []).reduce((total, section) => total + section.criteria.length, 0), [detail?.sections]);

  useEffect(() => {
    if (!selectedId && templates[0]?.id) setSelectedId(templates[0].id);
  }, [selectedId, templates]);

  function refresh(templateId?: string) {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: ["hr", "evaluation-templates"] }),
      queryClient.invalidateQueries({ queryKey: ["hr", "evaluation-template-detail", templateId ?? selectedTemplateId] })
    ]);
  }

  const createTemplateMutation = useMutation({
    mutationFn: async () =>
      requestJson<DetailResponse<EvaluationTemplate>>("/api/hr/evaluation-templates", {
        method: "POST",
        body: JSON.stringify(templatePayload(templateFormState))
      }),
    onSuccess: async (payload) => {
      setShowCreate(false);
      setTemplateFormState(emptyTemplateForm);
      setSelectedId(payload.data.id);
      await refresh(payload.data.id);
    }
  });

  const updateTemplateMutation = useMutation({
    mutationFn: async (payload: Partial<ReturnType<typeof templatePayload>>) =>
      requestJson<DetailResponse<EvaluationTemplate>>(`/api/hr/evaluation-templates/${selectedTemplateId}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      }),
    onSuccess: async () => {
      setEditingTemplate(false);
      await refresh();
    }
  });

  const createSectionMutation = useMutation({
    mutationFn: async () =>
      requestJson(`/api/hr/evaluation-templates/${selectedTemplateId}/sections`, {
        method: "POST",
        body: JSON.stringify(sectionPayload(sectionFormState))
      }),
    onSuccess: async () => {
      setSectionFormState(emptySectionForm);
      await refresh();
    }
  });

  const updateSectionMutation = useMutation({
    mutationFn: async ({ sectionId, payload }: { sectionId: string; payload: ReturnType<typeof sectionPayload> }) =>
      requestJson(`/api/hr/evaluation-templates/${selectedTemplateId}/sections/${sectionId}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      }),
    onSuccess: async () => {
      setEditingSectionId(null);
      setSectionFormState(emptySectionForm);
      await refresh();
    }
  });

  const createCriterionMutation = useMutation({
    mutationFn: async ({ sectionId }: { sectionId: string }) =>
      requestJson(`/api/hr/evaluation-templates/${selectedTemplateId}/sections/${sectionId}/criteria`, {
        method: "POST",
        body: JSON.stringify(criterionPayload(criterionFormState))
      }),
    onSuccess: async () => {
      setNewCriterionSectionId(null);
      setCriterionFormState(emptyCriterionForm);
      await refresh();
    }
  });

  const updateCriterionMutation = useMutation({
    mutationFn: async ({ sectionId, criterionId, payload }: { sectionId: string; criterionId: string; payload: ReturnType<typeof criterionPayload> }) =>
      requestJson(`/api/hr/evaluation-templates/${selectedTemplateId}/sections/${sectionId}/criteria/${criterionId}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      }),
    onSuccess: async () => {
      setEditingCriterionId(null);
      setCriterionFormState(emptyCriterionForm);
      await refresh();
    }
  });

  const createPresetsMutation = useMutation({
    mutationFn: async () => {
      const existingResponse = await requestJson<ListResponse<EvaluationTemplate>>("/api/hr/evaluation-templates");
      const existingCodes = new Set(existingResponse.data.map((template) => template.code.toUpperCase()));
      const result = { created: 0, skipped: 0, firstCreatedId: "" };

      for (const preset of hotelGalliEvaluationTemplatePresets) {
        if (existingCodes.has(preset.code.toUpperCase())) {
          result.skipped += 1;
          continue;
        }

        const templateResponse = await requestJson<DetailResponse<EvaluationTemplate>>("/api/hr/evaluation-templates", {
          method: "POST",
          body: JSON.stringify(presetTemplatePayload(preset, activeUnitId))
        });

        result.created += 1;
        result.firstCreatedId ||= templateResponse.data.id;
        existingCodes.add(preset.code.toUpperCase());

        for (let sectionIndex = 0; sectionIndex < preset.sections.length; sectionIndex += 1) {
          const section = preset.sections[sectionIndex];
          const sectionResponse = await requestJson<DetailResponse<EvaluationSection>>(`/api/hr/evaluation-templates/${templateResponse.data.id}/sections`, {
            method: "POST",
            body: JSON.stringify(presetSectionPayload(section, sectionIndex + 1))
          });

          for (let criterionIndex = 0; criterionIndex < section.criteria.length; criterionIndex += 1) {
            const criterionItem = section.criteria[criterionIndex];
            await requestJson(`/api/hr/evaluation-templates/${templateResponse.data.id}/sections/${sectionResponse.data.id}/criteria`, {
              method: "POST",
              body: JSON.stringify(presetCriterionPayload(criterionItem, criterionIndex + 1))
            });
          }
        }
      }

      return result;
    },
    onSuccess: async (result) => {
      if (result.firstCreatedId) setSelectedId(result.firstCreatedId);
      await refresh(result.firstCreatedId || selectedTemplateId || undefined);
    }
  });

  function startCreateTemplate() {
    setShowCreate(true);
    setEditingTemplate(false);
    setTemplateFormState({
      ...emptyTemplateForm,
      unitId: activeUnitId ?? ""
    });
  }

  function startEditTemplate() {
    if (!detail) return;
    setEditingTemplate(true);
    setShowCreate(false);
    setTemplateFormState(templateToForm(detail));
  }

  function startEditSection(section: EvaluationSection) {
    setEditingSectionId(section.id);
    setNewCriterionSectionId(null);
    setSectionFormState(sectionToForm(section));
  }

  function startNewCriterion(section: EvaluationSection) {
    setNewCriterionSectionId(section.id);
    setEditingCriterionId(null);
    setCriterionFormState({
      ...emptyCriterionForm,
      sortOrder: String((section.criteria.at(-1)?.sortOrder ?? section.criteria.length) + 1)
    });
  }

  function startEditCriterion(criterion: EvaluationCriterion) {
    setEditingCriterionId(criterion.id);
    setNewCriterionSectionId(null);
    setCriterionFormState(criterionToForm(criterion));
  }

  const currentError =
    templatesQuery.error ||
    detailQuery.error ||
    createTemplateMutation.error ||
    updateTemplateMutation.error ||
    createSectionMutation.error ||
    updateSectionMutation.error ||
    createCriterionMutation.error ||
    updateCriterionMutation.error ||
    createPresetsMutation.error;

  return (
    <div className="space-y-4">
      <Card className="border-border/80 p-4 shadow-sm shadow-primary/5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Modelos de avaliação</h2>
              <StatusBadge status="info" label={activeUnit?.name ? `Unidade ativa: ${activeUnit.name}` : "Todas as unidades acessiveis"} />
            </div>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Os modelos definem como cada colaborador será avaliado. Comece pelos modelos do hotel, revise o conteúdo e ative somente o que será usado.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/rh/gestao">
                Gestão do RH
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button type="button" size="sm" onClick={startCreateTemplate}>
              <Plus className="h-4 w-4" />
              Criar modelo manual
            </Button>
          </div>
        </div>
      </Card>

      <Card className="border-border/80 p-4 shadow-sm shadow-primary/5">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Wand2 className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Como começar</h2>
              <StatusBadge status="visual" label={`${hotelGalliEvaluationTemplatePresets.length} modelos`} />
              <StatusBadge status="warning" label="Criados inativos" />
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Use os modelos reais do Hotel Galli para experiência, governança, recepção, A&B, manutenção, administrativo e liderança. Eles nascem inativos para o RH revisar antes de liberar.
            </p>
          </div>
          <Button type="button" onClick={() => createPresetsMutation.mutate()} disabled={createPresetsMutation.isPending} className="shrink-0">
            <Wand2 className="h-4 w-4" />
            {createPresetsMutation.isPending ? "Criando..." : "Criar modelos padrão do hotel"}
          </Button>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-4">
          {[
            ["1", "Criar modelos padrão", "Gera os modelos reais do hotel sem ativar automaticamente."],
            ["2", "Revisar conteúdo", "Confira seções, critérios e pesos antes de liberar."],
            ["3", "Ativar modelos", "Ative apenas os modelos que os gestores devem usar."],
            ["4", "Aplicar no colaborador", "Abra o colaborador e use a aba Avaliações."]
          ].map(([step, title, description]) => (
            <div key={step} className="rounded-md border bg-background p-3">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{step}</span>
                <p className="text-xs font-semibold text-foreground">{title}</p>
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{description}</p>
            </div>
          ))}
        </div>
        {createPresetsMutation.data ? (
          <p className="mt-3 rounded-md border bg-background p-3 text-sm text-muted-foreground">
            Modelos criados: {createPresetsMutation.data.created}. Modelos já existentes ignorados: {createPresetsMutation.data.skipped}. Revise e ative somente o que será usado na operação.
          </p>
        ) : null}
      </Card>

      <div className="grid min-w-0 gap-3 md:grid-cols-3">
        <Card className="border-border/80 p-3 shadow-sm shadow-primary/5">
          <p className="text-xs text-muted-foreground">Modelos ativos</p>
          <p className="mt-1 text-2xl font-semibold">{activeTemplates}</p>
        </Card>
        <Card className="border-border/80 p-3 shadow-sm shadow-primary/5">
          <p className="text-xs text-muted-foreground">Grupos do modelo aberto</p>
          <p className="mt-1 text-2xl font-semibold">{detail?.sections?.length ?? 0}</p>
        </Card>
        <Card className="border-border/80 p-3 shadow-sm shadow-primary/5">
          <p className="text-xs text-muted-foreground">Itens avaliados no modelo aberto</p>
          <p className="mt-1 text-2xl font-semibold">{totalCriteria}</p>
        </Card>
      </div>

      <Card className="border-border/80 p-3 shadow-sm shadow-primary/5">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_180px]">
          <Field label="Buscar">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Ex.: camareira, experiência, recepção" />
            </div>
          </Field>
          <Field label="Tipo">
            <SelectField value={filters.evaluationType} onChange={(event) => setFilters((current) => ({ ...current, evaluationType: event.target.value }))}>
              <option value="">Todos</option>
              {evaluationTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectField>
          </Field>
          <Field label="Status">
            <SelectField value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
              <option value="">Todos</option>
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectField>
          </Field>
        </div>
      </Card>

      {currentError ? <ErrorMessage message={currentError instanceof Error ? currentError.message : "Nao foi possivel atualizar os modelos."} /> : null}
      {showCreate ? (
        <TemplateFormPanel
          form={templateFormState}
          setForm={setTemplateFormState}
          units={units}
          departments={departments}
          positions={positions}
          isSaving={createTemplateMutation.isPending}
          title="Novo modelo"
          submitLabel="Criar modelo"
          onSubmit={() => createTemplateMutation.mutate()}
          onCancel={() => setShowCreate(false)}
        />
      ) : null}

      <div className="grid min-w-0 gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Card className="min-w-0 overflow-hidden border-border/80 shadow-sm shadow-primary/5">
          <div className="border-b p-4">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Modelos disponíveis</h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Escolha um modelo para revisar, ajustar ou ativar.</p>
          </div>
          {templatesQuery.isLoading ? <LoadingTable label="Carregando modelos..." /> : null}
          {!templatesQuery.isLoading && !templates.length ? (
            <div className="p-4">
              <EmptyState title="Nenhum modelo pronto para revisar" description="Crie os modelos padrão do hotel ou cadastre um modelo manual antes de aplicar avaliações aos colaboradores." />
            </div>
          ) : null}
          <div className="divide-y">
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => setSelectedId(template.id)}
                className={cn("w-full p-4 text-left transition-colors hover:bg-muted/30", selectedTemplateId === template.id && "bg-muted/40")}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <FilePlus2 className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="min-w-0 break-words text-sm font-semibold">{template.name}</p>
                      <StatusBadge status={statusTone(template.status)} label={statusLabel(template.status)} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {typeLabel(template.evaluationType)} | {frequencyLabel(template.defaultFrequency)}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{template.unitName}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </Card>

        <div className="min-w-0 space-y-4">
          {detailQuery.isLoading ? <LoadingTable label="Carregando estrutura do modelo..." /> : null}
          {detail && editingTemplate ? (
            <TemplateFormPanel
              form={templateFormState}
              setForm={setTemplateFormState}
              units={units}
              departments={departments}
              positions={positions}
              isSaving={updateTemplateMutation.isPending}
              title="Editar modelo"
              submitLabel="Salvar modelo"
              onSubmit={() => updateTemplateMutation.mutate(templatePayload(templateFormState))}
              onCancel={() => setEditingTemplate(false)}
            />
          ) : null}

          {detail && !editingTemplate ? (
            <Card className="border-border/80 p-4 shadow-sm shadow-primary/5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Star className="h-4 w-4 text-primary" />
                    <h2 className="break-words text-base font-semibold">{detail.name}</h2>
                    <StatusBadge status={statusTone(detail.status)} label={statusLabel(detail.status)} />
                    <StatusBadge status="info" label={typeLabel(detail.evaluationType)} />
                  </div>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{detail.description || "Sem orientação operacional cadastrada."}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <StatusBadge status="visual" label={frequencyLabel(detail.defaultFrequency)} />
                    <StatusBadge status="visual" label={detail.departmentName} />
                    <StatusBadge status="visual" label={detail.jobPositionName} />
                    <StatusBadge status="visual" label={`Atualizado em ${formatDate(detail.updatedAt)}`} />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={startEditTemplate}>
                    <Edit2 className="h-4 w-4" />
                    Editar
                  </Button>
                  {detail.status === "active" ? (
                    <Button type="button" variant="outline" size="sm" onClick={() => updateTemplateMutation.mutate({ status: "inactive" })}>
                      <PowerOff className="h-4 w-4" />
                      Inativar
                    </Button>
                  ) : (
                    <Button type="button" size="sm" onClick={() => updateTemplateMutation.mutate({ status: "active" })}>
                      <Eye className="h-4 w-4" />
                      Ativar
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ) : null}

          {detail ? (
            <Card className="min-w-0 overflow-hidden border-border/80 shadow-sm shadow-primary/5">
              <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <ListChecks className="h-4 w-4 text-primary" />
                    <h2 className="text-sm font-semibold">O que será avaliado</h2>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">Organize os grupos e itens que aparecem no formulário do gestor.</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditingSectionId("new");
                    setSectionFormState({ ...emptySectionForm, sortOrder: String((detail.sections?.at(-1)?.sortOrder ?? detail.sections?.length ?? 0) + 1) });
                  }}
                >
                  <Plus className="h-4 w-4" />
                  Novo grupo
                </Button>
              </div>

              <div className="space-y-3 p-4">
                {editingSectionId === "new" ? (
                  <SectionFormPanel
                    form={sectionFormState}
                    setForm={setSectionFormState}
                    isSaving={createSectionMutation.isPending}
                    submitLabel="Criar grupo"
                    onSubmit={() => createSectionMutation.mutate()}
                    onCancel={() => setEditingSectionId(null)}
                  />
                ) : null}

                {!(detail.sections ?? []).length && editingSectionId !== "new" ? (
                  <EmptyState title="Modelo sem grupos de avaliação" description="Adicione grupos como comportamento, operação, atendimento ou padrão do hotel." />
                ) : null}

                {(detail.sections ?? []).map((section) => (
                  <div key={section.id} className="rounded-md border bg-muted/20">
                    <div className="flex flex-col gap-3 p-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="break-words text-sm font-semibold">{section.title}</p>
                          <StatusBadge status={statusTone(section.status)} label={statusLabel(section.status)} />
                          <StatusBadge status="visual" label={`Ordem ${section.sortOrder}`} />
                          <StatusBadge status="visual" label={`Peso ${section.weight}`} />
                        </div>
                        {section.description ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{section.description}</p> : null}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => startEditSection(section)}>
                          <Edit2 className="h-4 w-4" />
                          Editar
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => updateSectionMutation.mutate({ sectionId: section.id, payload: { ...sectionPayload(sectionToForm(section)), status: "inactive" } })}>
                          <Trash2 className="h-4 w-4" />
                          Inativar
                        </Button>
                        <Button type="button" size="sm" onClick={() => startNewCriterion(section)}>
                          <Plus className="h-4 w-4" />
                          Item avaliado
                        </Button>
                      </div>
                    </div>

                    {editingSectionId === section.id ? (
                      <div className="border-t p-3">
                        <SectionFormPanel
                          form={sectionFormState}
                          setForm={setSectionFormState}
                          isSaving={updateSectionMutation.isPending}
                          submitLabel="Salvar grupo"
                          onSubmit={() => updateSectionMutation.mutate({ sectionId: section.id, payload: sectionPayload(sectionFormState) })}
                          onCancel={() => setEditingSectionId(null)}
                        />
                      </div>
                    ) : null}

                    <div className="space-y-2 border-t p-3">
                      {newCriterionSectionId === section.id ? (
                        <CriterionFormPanel
                          form={criterionFormState}
                          setForm={setCriterionFormState}
                          isSaving={createCriterionMutation.isPending}
                          submitLabel="Criar item"
                          onSubmit={() => createCriterionMutation.mutate({ sectionId: section.id })}
                          onCancel={() => setNewCriterionSectionId(null)}
                        />
                      ) : null}

                      {section.criteria.length ? (
                        section.criteria.map((criterion) => (
                          <div key={criterion.id} className="rounded-md border bg-background p-3">
                            {editingCriterionId === criterion.id ? (
                              <CriterionFormPanel
                                form={criterionFormState}
                                setForm={setCriterionFormState}
                                isSaving={updateCriterionMutation.isPending}
                                submitLabel="Salvar item"
                                onSubmit={() => updateCriterionMutation.mutate({ sectionId: section.id, criterionId: criterion.id, payload: criterionPayload(criterionFormState) })}
                                onCancel={() => setEditingCriterionId(null)}
                              />
                            ) : (
                              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="break-words text-sm font-medium">{criterion.title}</p>
                                    <StatusBadge status={statusTone(criterion.status)} label={statusLabel(criterion.status)} />
                                    {criterion.isRequired ? <StatusBadge status="info" label="Obrigatório" /> : null}
                                    {criterion.isCritical ? <StatusBadge status="warning" label="Crítico" /> : null}
                                  </div>
                                  {criterion.description ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{criterion.description}</p> : null}
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    <StatusBadge status="visual" label={`Ordem ${criterion.sortOrder}`} />
                                    <StatusBadge status="visual" label={`Peso ${criterion.weight}`} />
                                    {criterion.requiresCommentBelowScore ? (
                                      <StatusBadge status="warning" label={`Pedir comentário até nota ${criterion.commentRequiredScoreThreshold ?? "-"}`} />
                                    ) : null}
                                  </div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <Button type="button" variant="outline" size="sm" onClick={() => startEditCriterion(criterion)}>
                                    <Edit2 className="h-4 w-4" />
                                    Editar
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      updateCriterionMutation.mutate({
                                        sectionId: section.id,
                                        criterionId: criterion.id,
                                        payload: { ...criterionPayload(criterionToForm(criterion)), status: "inactive" }
                                      })
                                    }
                                  >
                                    <Trash2 className="h-4 w-4" />
                                    Inativar
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))
                      ) : (
                        <p className="rounded-md border bg-background p-3 text-sm text-muted-foreground">Nenhum item avaliado neste grupo.</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
