"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  ClipboardCheck,
  Clock3,
  FileText,
  GitBranch,
  GraduationCap,
  History,
  HeartPulse,
  LogOut,
  Lock,
  Mail,
  MessageSquareText,
  ShieldAlert,
  ShieldCheck,
  Shuffle,
  UserRound,
  UsersRound
} from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { StatusBadge } from "@/components/common/status-badge";
import { ErrorMessage, LoadingTable } from "@/components/base-cadastros/crud-components";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { HrEmployeeConductCard } from "@/components/hr/hr-employee-conduct-card";
import { HrEmployeeDocumentsCard } from "@/components/hr/hr-employee-documents-card";
import { HrEmployeeDevelopmentPlansCard } from "@/components/hr/hr-employee-development-plans-card";
import { HrEmployeeEvaluationsCard } from "@/components/hr/hr-employee-evaluations-card";
import { HrEmployeeOnboardingCard } from "@/components/hr/hr-employee-onboarding-card";
import { HrEmployeeOccupationalHealthCard } from "@/components/hr/hr-employee-occupational-health-card";
import { HrEmployeeRhSummaryCard } from "@/components/hr/hr-employee-rh-summary-card";
import { HrEmployeeTerminationsCard } from "@/components/hr/hr-employee-terminations-card";
import { HrEmployeeTrainingsCard } from "@/components/hr/hr-employee-trainings-card";
import { cn } from "@/lib/utils";
import { formatDate, formatDateTime } from "@/lib/format";

type RelatedMeta = {
  id: string;
  code: string;
  name: string;
} | null;

type SensitiveEmployeeData = {
  documentNumber: string;
  personalEmail: string;
  phone: string;
  terminationDate: string;
};

type HrEmployeeDetail = {
  id: string;
  organizationId: string | null;
  unitId: string | null;
  unit: RelatedMeta;
  departmentId: string | null;
  department: RelatedMeta;
  jobPositionId: string | null;
  jobPosition: RelatedMeta;
  fullName: string;
  preferredName: string;
  corporateEmail: string;
  hireDate: string;
  status: "active" | "inactive" | "archived";
  createdAt: string;
  updatedAt: string;
  sensitive: SensitiveEmployeeData | null;
};

type HrEmployeePermissions = {
  canViewSensitive?: boolean;
  canViewDocuments?: boolean;
  canManageDocuments?: boolean;
  canViewSensitiveDocuments?: boolean;
  canVerifyDocuments?: boolean;
  canViewHistory?: boolean;
  canViewSensitiveHistory?: boolean;
  canViewMovements?: boolean;
  canViewSensitiveMovements?: boolean;
  canViewTrainings?: boolean;
  canViewSensitiveTrainings?: boolean;
  canViewOccupational?: boolean;
  canViewSensitiveOccupational?: boolean;
  canViewConduct?: boolean;
  canViewSensitiveConduct?: boolean;
  canViewTerminations?: boolean;
  canViewSensitiveTerminations?: boolean;
};

type HrEmployeeDetailResponse = {
  ok: true;
  data: HrEmployeeDetail;
  permissions: HrEmployeePermissions;
};

type HrFunctionalEvent = {
  id: string;
  eventType: string;
  eventDate: string;
  title: string;
  description: string;
  severity: string;
  visibilityScope: string;
  isSensitive: boolean;
  sourceModule: string;
  sourceEntityType: string;
  sourceEntityId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  redacted: boolean;
};

type HrHistoryResponse = {
  ok: true;
  data: HrFunctionalEvent[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  permissions: {
    canViewSensitiveHistory?: boolean;
  };
};

type HrCareerMovement = {
  id: string;
  movementType: string;
  movementTypeLabel: string;
  status: string;
  statusLabel: string;
  effectiveDate: string;
  oldUnit: (RelatedMeta & { label?: string }) | null;
  newUnit: (RelatedMeta & { label?: string }) | null;
  oldDepartment: (RelatedMeta & { label?: string }) | null;
  newDepartment: (RelatedMeta & { label?: string }) | null;
  oldJobPosition: (RelatedMeta & { label?: string }) | null;
  newJobPosition: (RelatedMeta & { label?: string }) | null;
  oldSalary: number | null;
  newSalary: number | null;
  isSensitive: boolean;
  reason: string;
  approvals: Array<{
    id: string;
    action: string;
    actionLabel: string;
    comments: string;
    actorUserId: string;
    createdAt: string;
  }>;
  redacted: boolean;
};

type HrCareerResponse = {
  ok: true;
  data: HrCareerMovement[];
};

type DetailTab = "summary" | "sensitive" | "documents" | "onboarding" | "evaluations" | "development" | "career" | "trainings" | "occupational" | "conduct" | "termination" | "history";
type TimelineCategory =
  | "all"
  | "registration"
  | "documents"
  | "admission"
  | "onboarding"
  | "evaluations"
  | "development"
  | "termination"
  | "movement"
  | "conduct"
  | "training"
  | "occupational_health"
  | "other";
type TimelinePeriod = "all" | "today" | "7d" | "30d" | "90d" | "custom";
type TimelineSeverity = "all" | "info" | "notice" | "warning" | "critical";
type TimelineSensitiveFilter = "all" | "only_sensitive" | "hide_sensitive";

const detailTabs: DetailTab[] = ["summary", "sensitive", "documents", "onboarding", "evaluations", "development", "history", "career", "trainings", "occupational", "conduct", "termination"];
const timelineCategories: Array<{ value: TimelineCategory; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "registration", label: "Cadastro" },
  { value: "documents", label: "Documentos" },
  { value: "admission", label: "Admissao" },
  { value: "onboarding", label: "Onboarding" },
  { value: "evaluations", label: "Avaliacoes" },
  { value: "development", label: "Plano de Desenvolvimento (PDI)" },
  { value: "termination", label: "Desligamento" },
  { value: "movement", label: "Movimentacoes" },
  { value: "conduct", label: "Conduta" },
  { value: "training", label: "Treinamentos" },
  { value: "occupational_health", label: "Saude Ocupacional" },
  { value: "other", label: "Outros" }
];
const timelinePeriods: Array<{ value: TimelinePeriod; label: string }> = [
  { value: "all", label: "Todo periodo" },
  { value: "today", label: "Hoje" },
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
  { value: "90d", label: "90 dias" },
  { value: "custom", label: "Personalizado" }
];
const timelineSeverities: Array<{ value: TimelineSeverity; label: string }> = [
  { value: "all", label: "Todas" },
  { value: "info", label: "Info" },
  { value: "notice", label: "Aviso" },
  { value: "warning", label: "Alerta" },
  { value: "critical", label: "Critico" }
];
const timelineSensitiveFilters: Array<{ value: TimelineSensitiveFilter; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "only_sensitive", label: "Somente restritos" },
  { value: "hide_sensitive", label: "Ocultar restritos" }
];

const eventTypeLabels: Record<string, string> = {
  employee_created: "Colaborador criado",
  employee_basic_updated: "Dados basicos alterados",
  employee_sensitive_updated: "Dados protegidos alterados",
  unit_changed: "Unidade alterada",
  department_changed: "Departamento alterado",
  job_position_changed: "Cargo alterado",
  document_requested: "Documento solicitado",
  document_uploaded: "Documento enviado",
  document_verified: "Documento aprovado",
  document_rejected: "Documento rejeitado",
  document_expired: "Documento vencido",
  document_replaced: "Documento substituido",
  document_waived: "Documento dispensado",
  admission_started: "Admissao iniciada",
  admission_completed: "Admissao concluida",
  termination_started: "Desligamento iniciado",
  termination_completed: "Desligamento concluido",
  training_registered: "Treinamento registrado",
  warning_registered: "Advertencia registrada",
  vacation_registered: "Ferias registradas",
  note_added: "Observacao registrada",
  onboarding_created: "Onboarding criado",
  onboarding_started: "Onboarding iniciado",
  onboarding_item_started: "Item de onboarding iniciado",
  onboarding_item_completed: "Item de onboarding concluido",
  onboarding_item_blocked: "Item de onboarding bloqueado",
  onboarding_item_waived: "Item de onboarding dispensado",
  onboarding_completed: "Onboarding concluido",
  onboarding_cancelled: "Onboarding cancelado",
  evaluation_created: "Avaliacao criada",
  evaluation_started: "Avaliacao iniciada",
  evaluation_submitted: "Avaliacao enviada",
  evaluation_reviewed: "Avaliacao revisada",
  evaluation_feedback_given: "Devolutiva registrada",
  evaluation_acknowledged: "Ciencia do colaborador registrada",
  evaluation_closed: "Avaliacao encerrada",
  evaluation_cancelled: "Avaliacao cancelada",
  development_plan_created: "Plano de Desenvolvimento (PDI) criado",
  development_plan_item_created: "Item do Plano de Desenvolvimento (PDI) criado",
  development_plan_item_completed: "Item do Plano de Desenvolvimento (PDI) concluído",
  development_plan_item_overdue: "Item do Plano de Desenvolvimento (PDI) em atraso",
  development_plan_reviewed: "Plano de Desenvolvimento (PDI) revisado",
  development_plan_completed: "Plano de Desenvolvimento (PDI) concluído",
  development_plan_cancelled: "Plano de Desenvolvimento (PDI) cancelado",
  salary_changed: "Salario alterado",
  promotion_registered: "Promocao registrada",
  transfer_registered: "Transferencia registrada",
  suspension_registered: "Suspensao registrada",
  complaint_registered: "Reclamacao registrada",
  compliment_registered: "Elogio registrado",
  formal_guidance_registered: "Orientacao formal registrada",
  formal_conversation_registered: "Conversa formal registrada",
  training_required: "Treinamento obrigatorio criado",
  training_completed: "Treinamento concluido",
  training_certificate_uploaded: "Certificado de treinamento anexado",
  training_expiring: "Treinamento vencendo",
  training_expired: "Treinamento vencido",
  training_retraining_required: "Reciclagem necessaria",
  aso_requested: "ASO solicitado",
  aso_completed: "ASO concluido",
  aso_expiring: "ASO vencendo",
  aso_expired: "ASO vencido",
  occupational_restriction_registered: "Restricao ocupacional registrada",
  occupational_exam_registered: "Exame ocupacional registrado",
  termination_checklist_created: "Checklist de desligamento criado",
  termination_pending_item_registered: "Pendencia de desligamento registrada",
  employee_inactivated: "Colaborador inativado",
  redacted: "Evento restrito"
};

function isDetailTab(value: string | null): value is DetailTab {
  return Boolean(value && detailTabs.includes(value as DetailTab));
}

async function requestJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.message ?? "Nao foi possivel carregar os dados de RH.");
  }

  return payload as T;
}

function metaLabel(meta: RelatedMeta, fallback = "-") {
  if (!meta) return fallback;
  return [meta.code, meta.name].filter(Boolean).join(" - ") || fallback;
}

function movementMetaLabel(meta: (RelatedMeta & { label?: string }) | null, fallback = "-") {
  if (!meta) return fallback;
  return meta.label || metaLabel(meta, fallback);
}

function recordStatusLabel(status: HrEmployeeDetail["status"]) {
  if (status === "active") return "Ativo";
  if (status === "inactive") return "Inativo";
  return "Arquivado";
}

function recordStatusTone(status: HrEmployeeDetail["status"]) {
  return status === "active" ? "success" : "visual";
}

function movementStatusTone(status: string) {
  if (status === "implemented" || status === "approved") return "success" as const;
  if (status === "rejected") return "danger" as const;
  if (status === "pending_approval") return "warning" as const;
  return "visual" as const;
}

function formatMoney(value: number | null | undefined) {
  if (value == null) return "-";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function daysSince(value: string | null | undefined) {
  if (!value) return "-";
  const date = value.includes("T") ? new Date(value) : new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return "-";
  const diff = Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
  if (diff === 0) return "Hoje";
  if (diff === 1) return "1 dia";
  return `${diff} dias`;
}

function movementTransitionLabel(movement: HrCareerMovement, kind: "unit" | "department" | "job" | "salary") {
  if (kind === "salary") {
    if (movement.redacted) return "Informacao restrita";
    return `${formatMoney(movement.oldSalary)} -> ${formatMoney(movement.newSalary)}`;
  }

  const oldValue =
    kind === "unit"
      ? movementMetaLabel(movement.oldUnit)
      : kind === "department"
        ? movementMetaLabel(movement.oldDepartment)
        : movementMetaLabel(movement.oldJobPosition);
  const newValue =
    kind === "unit"
      ? movementMetaLabel(movement.newUnit)
      : kind === "department"
        ? movementMetaLabel(movement.newDepartment)
        : movementMetaLabel(movement.newJobPosition);

  if (oldValue === "-" && newValue === "-") return "-";
  if (oldValue === newValue) return newValue;
  return `${oldValue} -> ${newValue}`;
}

function CareerSummaryTile({ label, value, icon: Icon, tone = "visual" }: { label: string; value: string; icon: typeof UserRound; tone?: "visual" | "info" | "warning" | "success" }) {
  return (
    <div className="min-w-0 rounded-md border bg-background p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
        <Icon className="h-4 w-4 text-primary" />
        {label}
      </div>
      <div className="flex items-start justify-between gap-3">
        <p className="break-words text-sm font-medium text-foreground">{value || "-"}</p>
        <StatusBadge status={tone} label="Carreira" />
      </div>
    </div>
  );
}

function eventSeverityTone(severity: string) {
  if (severity === "critical") return "danger" as const;
  if (severity === "warning") return "warning" as const;
  if (severity === "notice") return "info" as const;
  return "visual" as const;
}

function eventSeverityLabel(severity: string) {
  if (severity === "critical") return "Critico";
  if (severity === "warning") return "Alerta";
  if (severity === "notice") return "Aviso";
  return "Info";
}

function eventStatusLabel(status: string) {
  if (status === "active") return "Ativo";
  if (status === "corrected") return "Corrigido";
  if (status === "cancelled") return "Cancelado";
  return status;
}

function eventTypeLabel(eventType: string) {
  return eventTypeLabels[eventType] ?? "Evento funcional";
}

function eventCategory(eventType: string): TimelineCategory {
  if (["employee_created", "employee_basic_updated", "employee_sensitive_updated"].includes(eventType)) return "registration";
  if (eventType.startsWith("document_")) return "documents";
  if (eventType.startsWith("admission_")) return "admission";
  if (eventType.startsWith("onboarding_")) return "onboarding";
  if (eventType.startsWith("evaluation_")) return "evaluations";
  if (eventType.startsWith("development_plan_")) return "development";
  if (eventType.startsWith("termination_") || eventType === "employee_inactivated") return "termination";
  if (["unit_changed", "department_changed", "job_position_changed", "salary_changed", "promotion_registered", "transfer_registered"].includes(eventType)) return "movement";
  if (
    [
      "warning_registered",
      "suspension_registered",
      "complaint_registered",
      "compliment_registered",
      "formal_guidance_registered",
      "formal_conversation_registered"
    ].includes(eventType)
  ) {
    return "conduct";
  }
  if (eventType.startsWith("training_")) return "training";
  if (eventType.startsWith("aso_") || eventType.startsWith("occupational_")) return "occupational_health";
  return "other";
}

function eventCategoryLabel(category: TimelineCategory) {
  return timelineCategories.find((item) => item.value === category)?.label ?? "Outros";
}

function eventCategoryTone(category: TimelineCategory) {
  if (category === "documents") return "info" as const;
  if (category === "admission" || category === "onboarding" || category === "development") return "success" as const;
  if (category === "evaluations" || category === "occupational_health") return "info" as const;
  if (category === "termination" || category === "conduct") return "warning" as const;
  return "visual" as const;
}

function eventCategoryIcon(category: TimelineCategory) {
  if (category === "registration") return UserRound;
  if (category === "documents") return FileText;
  if (category === "admission") return ClipboardCheck;
  if (category === "onboarding") return ClipboardCheck;
  if (category === "evaluations") return ShieldCheck;
  if (category === "development") return CalendarClock;
  if (category === "termination") return BriefcaseBusiness;
  if (category === "movement") return UsersRound;
  if (category === "conduct") return ShieldAlert;
  if (category === "training") return GraduationCap;
  if (category === "occupational_health") return ShieldCheck;
  return MessageSquareText;
}

function sourceLabel(event: HrFunctionalEvent) {
  const entityTypeLabels: Record<string, string> = {
    employee_document: "Documentos",
    employee_onboarding: "Onboarding",
    employee_onboarding_item: "Onboarding",
    employee_evaluation: "Avaliacoes",
    employee_development_plan: "Plano de Desenvolvimento (PDI)",
    employee_movement: "Movimentacoes",
    employee_training: "Treinamentos",
    employee_occupational_record: "Saude Ocupacional",
    employee_nr_certification: "Saude Ocupacional",
    employee_conduct_record: "Conduta",
    employee_termination: "Desligamento",
    hr_workflow: "Workflow RH",
    hr_workflow_event: "Workflow RH"
  };

  if (event.sourceEntityType && entityTypeLabels[event.sourceEntityType]) return entityTypeLabels[event.sourceEntityType];
  if (event.sourceModule?.toLowerCase() === "hr") return "RH";
  return event.sourceModule || "RH";
}

function sourceHref(employeeId: string, event: HrFunctionalEvent) {
  if (!event.sourceEntityId || event.redacted) return "";
  if (event.sourceEntityType === "employee_document") return `/rh/employees/${employeeId}?tab=documents`;
  if (event.sourceEntityType === "employee_evaluation") return `/rh/employees/${employeeId}?tab=evaluations&evaluationId=${event.sourceEntityId}`;
  if (event.sourceEntityType === "employee_development_plan") return `/rh/employees/${employeeId}?tab=development`;
  if (event.sourceEntityType === "employee_movement") return `/rh/employees/${employeeId}?tab=career`;
  if (event.sourceEntityType === "employee_training") return `/rh/employees/${employeeId}?tab=trainings`;
  if (event.sourceEntityType === "employee_occupational_record" || event.sourceEntityType === "employee_nr_certification") return `/rh/employees/${employeeId}?tab=occupational`;
  if (event.sourceEntityType === "employee_conduct_record") return `/rh/employees/${employeeId}?tab=conduct`;
  if (event.sourceEntityType === "employee_termination") return `/rh/employees/${employeeId}?tab=termination`;
  if (event.sourceEntityType === "employee_onboarding" || event.sourceEntityType === "employee_onboarding_item") return `/rh/employees/${employeeId}?tab=onboarding`;
  if (event.sourceEntityType === "hr_workflow") return `/rh/workflows/${event.sourceEntityId}`;
  return "";
}

function monthGroupLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sem data";
  const label = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function dateOnlyIso(date: Date) {
  return date.toISOString().slice(0, 10);
}

function periodRange(period: TimelinePeriod, customFrom: string, customTo: string) {
  if (period === "all") return { from: "", to: "" };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (period === "custom") return { from: customFrom, to: customTo };

  const days = period === "today" ? 0 : period === "7d" ? 6 : period === "30d" ? 29 : 89;
  const from = new Date(today);
  from.setDate(today.getDate() - days);
  return { from: dateOnlyIso(from), to: dateOnlyIso(today) };
}

function isWithinPeriod(eventDate: string, period: TimelinePeriod, customFrom: string, customTo: string) {
  const range = periodRange(period, customFrom, customTo);
  if (!range.from && !range.to) return true;
  const date = new Date(eventDate);
  if (Number.isNaN(date.getTime())) return false;
  const dateOnly = dateOnlyIso(date);
  if (range.from && dateOnly < range.from) return false;
  if (range.to && dateOnly > range.to) return false;
  return true;
}

function groupEventsByMonth(events: HrFunctionalEvent[]) {
  const groups: Array<{ label: string; events: HrFunctionalEvent[] }> = [];

  for (const event of events) {
    const label = monthGroupLabel(event.eventDate);
    const group = groups.find((item) => item.label === label);
    if (group) group.events.push(event);
    else groups.push({ label, events: [event] });
  }

  return groups;
}

function InfoTile({ label, value, icon: Icon }: { label: string; value: string; icon: typeof UserRound }) {
  return (
    <div className="min-w-0 rounded-md border bg-background p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
        <Icon className="h-4 w-4 text-primary" />
        {label}
      </div>
      <p className="break-words text-sm font-medium text-foreground">{value || "-"}</p>
    </div>
  );
}

function RestrictedState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex items-start gap-3 rounded-md border bg-muted/45 p-4 text-sm text-muted-foreground">
      <Lock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0">
        <p className="font-medium text-foreground">{title}</p>
        <p className="mt-1 leading-5">{description}</p>
      </div>
    </div>
  );
}

export function HrEmployeeDetailClient({ employeeId }: { employeeId: string }) {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<DetailTab>("summary");
  const [historyPage, setHistoryPage] = useState(1);
  const [timelineCategory, setTimelineCategory] = useState<TimelineCategory>("all");
  const [timelinePeriod, setTimelinePeriod] = useState<TimelinePeriod>("all");
  const [timelineSeverity, setTimelineSeverity] = useState<TimelineSeverity>("all");
  const [timelineSensitiveFilter, setTimelineSensitiveFilter] = useState<TimelineSensitiveFilter>("all");
  const [timelineCustomFrom, setTimelineCustomFrom] = useState("");
  const [timelineCustomTo, setTimelineCustomTo] = useState("");
  const requestedTab = searchParams.get("tab");
  const initialEvaluationId = searchParams.get("evaluationId");

  const detailQuery = useQuery({
    queryKey: ["hr", "employees", employeeId],
    queryFn: async () => requestJson<HrEmployeeDetailResponse>(`/api/hr/employees/${employeeId}`)
  });

  const employee = detailQuery.data?.data ?? null;
  const permissions = detailQuery.data?.permissions ?? {};
  const canViewSensitive = Boolean(permissions.canViewSensitive);
  const canViewDocuments = Boolean(permissions.canViewDocuments);
  const canManageDocuments = Boolean(permissions.canManageDocuments);
  const canViewSensitiveDocuments = Boolean(permissions.canViewSensitiveDocuments);
  const canVerifyDocuments = Boolean(permissions.canVerifyDocuments);
  const canViewHistory = Boolean(permissions.canViewHistory);
  const canViewSensitiveHistory = Boolean(permissions.canViewSensitiveHistory);
  const canViewMovements = Boolean(permissions.canViewMovements);
  const canViewSensitiveMovements = Boolean(permissions.canViewSensitiveMovements);
  const canViewTrainings = Boolean(permissions.canViewTrainings);
  const canViewOccupational = Boolean(permissions.canViewOccupational);
  const canViewSensitiveOccupational = Boolean(permissions.canViewSensitiveOccupational);
  const canViewConduct = Boolean(permissions.canViewConduct);
  const canViewSensitiveConduct = Boolean(permissions.canViewSensitiveConduct);
  const canViewTerminations = Boolean(permissions.canViewTerminations);
  const canViewSensitiveTerminations = Boolean(permissions.canViewSensitiveTerminations);

  const tabs = useMemo(
    () =>
      [
        { value: "summary" as const, label: "Dados", enabled: true },
        { value: "sensitive" as const, label: "Dados protegidos", enabled: canViewSensitive },
        { value: "documents" as const, label: "Documentos", enabled: canViewDocuments },
        { value: "onboarding" as const, label: "Onboarding", enabled: true },
        { value: "evaluations" as const, label: "Avaliacoes", enabled: true },
        { value: "development" as const, label: "Plano de Desenvolvimento (PDI)", enabled: true },
        { value: "history" as const, label: "Vida Funcional", enabled: canViewHistory },
        { value: "career" as const, label: "Carreira", enabled: canViewMovements },
        { value: "trainings" as const, label: "Treinamentos", enabled: canViewTrainings },
        { value: "occupational" as const, label: "Saude Ocupacional", enabled: canViewOccupational },
        { value: "conduct" as const, label: "Conduta", enabled: canViewConduct },
        { value: "termination" as const, label: "Desligamento", enabled: canViewTerminations }
      ].filter((tab) => tab.enabled),
    [canViewConduct, canViewDocuments, canViewHistory, canViewMovements, canViewOccupational, canViewSensitive, canViewTerminations, canViewTrainings]
  );

  useEffect(() => {
    if (!tabs.some((tab) => tab.value === activeTab)) setActiveTab("summary");
  }, [activeTab, tabs]);

  useEffect(() => {
    if (!isDetailTab(requestedTab)) return;
    if (tabs.some((tab) => tab.value === requestedTab)) setActiveTab(requestedTab);
  }, [requestedTab, tabs]);

  const historyQuery = useQuery({
    queryKey: ["hr", "employees", employeeId, "history", historyPage],
    queryFn: async () => requestJson<HrHistoryResponse>(`/api/hr/employees/${employeeId}/history?page=${historyPage}&pageSize=20`),
    enabled: Boolean(employee && canViewHistory && activeTab === "history")
  });

  const careerQuery = useQuery({
    queryKey: ["hr", "employees", employeeId, "career"],
    queryFn: async () => requestJson<HrCareerResponse>(`/api/hr/movements?employeeId=${employeeId}&pageSize=50`),
    enabled: Boolean(employee && canViewMovements && activeTab === "career")
  });

  const filteredHistoryEvents = useMemo(() => {
    const events = historyQuery.data?.data ?? [];
    return events.filter((event) => {
      const category = eventCategory(event.eventType);
      if (timelineCategory !== "all" && category !== timelineCategory) return false;
      if (timelineSeverity !== "all" && event.severity !== timelineSeverity) return false;
      if (timelineSensitiveFilter === "only_sensitive" && !event.isSensitive) return false;
      if (timelineSensitiveFilter === "hide_sensitive" && event.isSensitive) return false;
      return isWithinPeriod(event.eventDate, timelinePeriod, timelineCustomFrom, timelineCustomTo);
    });
  }, [historyQuery.data?.data, timelineCategory, timelineCustomFrom, timelineCustomTo, timelinePeriod, timelineSensitiveFilter, timelineSeverity]);
  const timelineGroups = useMemo(() => groupEventsByMonth(filteredHistoryEvents), [filteredHistoryEvents]);
  const historyPagination = historyQuery.data?.pagination;
  const careerMovements = useMemo(() => careerQuery.data?.data ?? [], [careerQuery.data?.data]);
  const careerImplemented = useMemo(() => careerMovements.filter((movement) => movement.status === "implemented"), [careerMovements]);
  const careerPending = useMemo(
    () => careerMovements.filter((movement) => ["draft", "pending_approval", "approved"].includes(movement.status)),
    [careerMovements]
  );
  const careerRecentRejected = useMemo(() => careerMovements.filter((movement) => movement.status === "rejected").slice(0, 3), [careerMovements]);
  const latestCareerMovement = careerMovements[0] ?? null;
  const latestImplementedMovement = careerImplemented[0] ?? null;

  if (detailQuery.isLoading) return <LoadingTable label="Carregando prontuario administrativo..." />;

  if (detailQuery.error) {
    return (
      <div className="space-y-4">
        <Button asChild variant="outline" size="sm">
          <Link href="/rh/employees">
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Link>
        </Button>
        <ErrorMessage message={detailQuery.error instanceof Error ? detailQuery.error.message : "Nao foi possivel carregar o colaborador."} />
      </div>
    );
  }

  if (!employee) {
    return <EmptyState title="Colaborador nao encontrado" description="O colaborador nao existe ou esta fora das unidades permitidas." />;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/rh/employees">
              <ArrowLeft className="h-4 w-4" />
              Voltar para colaboradores
            </Link>
          </Button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="break-words text-xl font-semibold text-foreground">{employee.fullName}</h2>
              <StatusBadge status={recordStatusTone(employee.status)} label={recordStatusLabel(employee.status)} />
              <StatusBadge status="info" label={metaLabel(employee.unit, "Sem unidade")} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Consulta administrativa protegida por permissao de RH e escopo de unidade.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge status={canViewSensitive ? "info" : "visual"} label={canViewSensitive ? "Dados protegidos permitidos" : "Dados protegidos ocultos"} />
          <StatusBadge status={canViewDocuments ? "success" : "visual"} label={canViewDocuments ? "Documentos liberados" : "Documentos restritos"} />
          <StatusBadge status={canViewMovements ? "success" : "visual"} label={canViewMovements ? "Carreira liberada" : "Carreira restrita"} />
          <StatusBadge status={canViewTrainings ? "success" : "visual"} label={canViewTrainings ? "Treinamentos liberados" : "Treinamentos restritos"} />
          <StatusBadge status={canViewOccupational ? "success" : "visual"} label={canViewOccupational ? "Saude ocupacional liberada" : "Saude ocupacional restrita"} />
          <StatusBadge status={canViewConduct ? "success" : "visual"} label={canViewConduct ? "Conduta liberada" : "Conduta restrita"} />
          <StatusBadge status={canViewTerminations ? "success" : "visual"} label={canViewTerminations ? "Desligamento liberado" : "Desligamento restrito"} />
          <StatusBadge status={canViewHistory ? "success" : "visual"} label={canViewHistory ? "Vida funcional liberada" : "Vida funcional restrita"} />
        </div>
      </div>

      <HrEmployeeRhSummaryCard employeeId={employeeId} />

      <Card className="border-border/80 p-3 shadow-sm shadow-primary/5">
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <Button key={tab.value} type="button" size="sm" variant={activeTab === tab.value ? "default" : "outline"} onClick={() => setActiveTab(tab.value)}>
              {tab.label}
            </Button>
          ))}
        </div>
      </Card>

      {activeTab === "summary" ? (
        <div className="space-y-4">
          <Card className="border-border/80 p-5 shadow-sm shadow-primary/5">
            <div className="mb-4 flex items-center gap-2">
              <UserRound className="h-4 w-4 text-primary" />
              <h3 className="text-base font-semibold">Resumo administrativo</h3>
            </div>
            <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3">
              <InfoTile label="Nome completo" value={employee.fullName} icon={UserRound} />
              <InfoTile label="Nome preferencial" value={employee.preferredName || "-"} icon={UserRound} />
              <InfoTile label="Status" value={recordStatusLabel(employee.status)} icon={ShieldCheck} />
              <InfoTile label="Unidade" value={metaLabel(employee.unit)} icon={Building2} />
              <InfoTile label="Departamento" value={metaLabel(employee.department)} icon={Building2} />
              <InfoTile label="Cargo" value={metaLabel(employee.jobPosition)} icon={UserRound} />
              <InfoTile label="E-mail corporativo" value={employee.corporateEmail || "-"} icon={Mail} />
              <InfoTile label="Data de admissao" value={formatDate(employee.hireDate)} icon={CalendarClock} />
              <InfoTile label="Ultima atualizacao" value={formatDateTime(employee.updatedAt)} icon={CalendarClock} />
            </div>
          </Card>
        </div>
      ) : null}

      {activeTab === "sensitive" ? (
        canViewSensitive && employee.sensitive ? (
          <Card className="border-border/80 p-5 shadow-sm shadow-primary/5">
            <div className="mb-4 flex items-center gap-2">
              <Lock className="h-4 w-4 text-primary" />
              <h3 className="text-base font-semibold">Dados protegidos</h3>
            </div>
            <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-4">
              <InfoTile label="Documento pessoal" value={employee.sensitive.documentNumber || "-"} icon={ShieldCheck} />
              <InfoTile label="Telefone" value={employee.sensitive.phone || "-"} icon={UserRound} />
              <InfoTile label="E-mail pessoal" value={employee.sensitive.personalEmail || "-"} icon={Mail} />
              <InfoTile label="Data de desligamento" value={formatDate(employee.sensitive.terminationDate)} icon={CalendarClock} />
            </div>
          </Card>
        ) : (
          <RestrictedState title="Dados restritos" description="Seu perfil nao possui permissao para visualizar dados protegidos deste colaborador." />
        )
      ) : null}

      {activeTab === "documents" ? (
        canViewDocuments ? (
          <HrEmployeeDocumentsCard
            employeeId={employeeId}
            canViewSensitiveDocuments={canViewSensitiveDocuments}
            canManageDocuments={canManageDocuments}
            canVerifyDocuments={canVerifyDocuments}
          />
        ) : (
          <RestrictedState title="Documentos restritos" description="Seu perfil nao possui permissao para consultar documentos de RH deste colaborador." />
        )
      ) : null}

      {activeTab === "onboarding" ? <HrEmployeeOnboardingCard employeeId={employeeId} /> : null}
      {activeTab === "evaluations" ? (
        <HrEmployeeEvaluationsCard employeeId={employeeId} initialEvaluationId={initialEvaluationId} onOpenDevelopment={() => setActiveTab("development")} />
      ) : null}
      {activeTab === "development" ? <HrEmployeeDevelopmentPlansCard employeeId={employeeId} /> : null}

      {activeTab === "trainings" ? (
        canViewTrainings ? (
          <HrEmployeeTrainingsCard employeeId={employeeId} />
        ) : (
          <RestrictedState title="Treinamentos restritos" description="Seu perfil nao possui permissao para consultar treinamentos deste colaborador." />
        )
      ) : null}

      {activeTab === "occupational" ? (
        canViewOccupational ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/35 p-3 text-xs text-muted-foreground">
              <HeartPulse className="h-4 w-4 text-primary" />
              <StatusBadge status={canViewSensitiveOccupational ? "info" : "visual"} label={canViewSensitiveOccupational ? "Dados ocupacionais permitidos" : "Dados ocupacionais redigidos"} />
            </div>
            <HrEmployeeOccupationalHealthCard employeeId={employeeId} />
          </div>
        ) : (
          <RestrictedState title="Saude Ocupacional restrita" description="Seu perfil nao possui permissao para consultar dados ocupacionais deste colaborador." />
        )
      ) : null}

      {activeTab === "conduct" ? (
        canViewConduct ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/35 p-3 text-xs text-muted-foreground">
              <MessageSquareText className="h-4 w-4 text-primary" />
              <StatusBadge status={canViewSensitiveConduct ? "info" : "visual"} label={canViewSensitiveConduct ? "Dados de conduta permitidos" : "Dados de conduta redigidos"} />
            </div>
            <HrEmployeeConductCard employeeId={employeeId} />
          </div>
        ) : (
          <RestrictedState title="Conduta restrita" description="Seu perfil nao possui permissao para consultar registros de conduta deste colaborador." />
        )
      ) : null}

      {activeTab === "termination" ? (
        canViewTerminations ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/35 p-3 text-xs text-muted-foreground">
              <LogOut className="h-4 w-4 text-primary" />
              <StatusBadge status={canViewSensitiveTerminations ? "info" : "visual"} label={canViewSensitiveTerminations ? "Dados de desligamento permitidos" : "Dados de desligamento redigidos"} />
            </div>
            <HrEmployeeTerminationsCard employeeId={employeeId} />
          </div>
        ) : (
          <RestrictedState title="Desligamento restrito" description="Seu perfil nao possui permissao para consultar processos de desligamento deste colaborador." />
        )
      ) : null}

      {activeTab === "career" ? (
        canViewMovements ? (
          <Card className="min-w-0 overflow-hidden border-border/80 shadow-sm shadow-primary/5">
            <div className="border-b p-5">
              <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Shuffle className="h-4 w-4 text-primary" />
                    <h3 className="text-base font-semibold">Carreira</h3>
                    <StatusBadge status="info" label="Historico funcional" />
                    {careerPending.length ? <StatusBadge status="warning" label={`${careerPending.length} pendente(s)`} /> : null}
                  </div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Resumo da posicao atual, movimentacoes em andamento e linha do tempo de carreira do colaborador.
                  </p>
                </div>
                <StatusBadge status={canViewSensitiveMovements ? "info" : "visual"} label={canViewSensitiveMovements ? "Dados salariais permitidos" : "Dados salariais restritos"} />
              </div>
            </div>
            <div className="space-y-5 p-5">
              {careerQuery.isLoading ? <LoadingTable label="Carregando carreira..." /> : null}
              {careerQuery.error ? <ErrorMessage message={careerQuery.error instanceof Error ? careerQuery.error.message : "Nao foi possivel carregar carreira."} /> : null}
              {!careerQuery.isLoading && careerQuery.data && !careerQuery.data.data.length ? (
                <EmptyState title="Nenhuma movimentação registrada" description="Promoções, transferências e mudanças administrativas do colaborador aparecerão aqui." />
              ) : null}

              <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3">
                <CareerSummaryTile label="Cargo atual" value={metaLabel(employee.jobPosition)} icon={UserRound} tone="info" />
                <CareerSummaryTile label="Departamento atual" value={metaLabel(employee.department)} icon={Building2} tone="visual" />
                <CareerSummaryTile label="Unidade atual" value={metaLabel(employee.unit)} icon={Building2} tone="visual" />
                <CareerSummaryTile label="Última movimentação" value={latestCareerMovement ? `${latestCareerMovement.movementTypeLabel} em ${formatDate(latestCareerMovement.effectiveDate)}` : "Nenhuma movimentação"} icon={GitBranch} tone={latestCareerMovement ? "info" : "visual"} />
                <CareerSummaryTile label="Movimentacoes pendentes" value={String(careerPending.length)} icon={ShieldAlert} tone={careerPending.length ? "warning" : "success"} />
                <CareerSummaryTile label="Tempo desde última movimentação" value={daysSince(latestImplementedMovement?.effectiveDate)} icon={Clock3} tone="visual" />
              </div>

              {careerPending.length || careerRecentRejected.length ? (
                <div className="grid min-w-0 gap-3 lg:grid-cols-2">
                  <div className="rounded-md border bg-background p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <ShieldAlert className="h-4 w-4 text-primary" />
                      <h4 className="text-sm font-semibold">Movimentacoes pendentes</h4>
                    </div>
                    {careerPending.length ? (
                      <div className="space-y-2">
                        {careerPending.map((movement) => (
                          <div key={movement.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
                            <span className="font-medium">{movement.movementTypeLabel}</span>
                            <div className="flex flex-wrap items-center gap-2">
                              <StatusBadge status={movementStatusTone(movement.status)} label={movement.statusLabel} />
                              <span className="text-xs text-muted-foreground">{formatDate(movement.effectiveDate)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Nenhuma movimentação aguardando ação.</p>
                    )}
                  </div>
                  <div className="rounded-md border bg-background p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-primary" />
                      <h4 className="text-sm font-semibold">Efetivadas e rejeitadas recentes</h4>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge status="success" label={`Efetivadas: ${careerImplemented.length}`} />
                      <StatusBadge status={careerRecentRejected.length ? "danger" : "visual"} label={`Rejeitadas recentes: ${careerRecentRejected.length}`} />
                    </div>
                    {careerRecentRejected.length ? (
                      <div className="mt-3 space-y-2">
                        {careerRecentRejected.map((movement) => (
                          <div key={movement.id} className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">{movement.movementTypeLabel}</span> rejeitada em {formatDate(movement.effectiveDate)}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {careerQuery.data?.data.length ? (
                <div className="grid min-w-0 gap-4 xl:grid-cols-[0.9fr_1.1fr]">
                  <div className="min-w-0 rounded-md border bg-background p-4">
                    <div className="mb-4 flex items-center gap-2">
                      <GitBranch className="h-4 w-4 text-primary" />
                      <h4 className="text-sm font-semibold">Linha do tempo de carreira</h4>
                    </div>
                    <div className="relative space-y-3 pl-7 before:absolute before:bottom-2 before:left-[13px] before:top-2 before:w-px before:bg-border">
                      {careerQuery.data.data.map((movement) => (
                        <article key={movement.id} className="relative rounded-md border bg-muted/25 p-3">
                          <div className="absolute -left-7 top-3 flex h-7 w-7 items-center justify-center rounded-full border bg-background shadow-sm">
                            <Shuffle className="h-4 w-4 text-primary" />
                          </div>
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold text-foreground">{movement.movementTypeLabel}</p>
                              <p className="mt-1 text-xs text-muted-foreground">{formatDate(movement.effectiveDate)} | {movement.reason || "Movimentacao funcional"}</p>
                            </div>
                            <StatusBadge status={movementStatusTone(movement.status)} label={movement.statusLabel} />
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-md border">
                    <table className="min-w-[1120px] w-full text-sm">
                      <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3">Data efetiva</th>
                          <th className="px-4 py-3">Tipo</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3">Unidade</th>
                          <th className="px-4 py-3">Departamento</th>
                          <th className="px-4 py-3">Cargo</th>
                          <th className="px-4 py-3">Salario</th>
                          <th className="px-4 py-3">Motivo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {careerQuery.data.data.map((movement) => (
                          <tr key={movement.id} className="align-top">
                            <td className="px-4 py-3">{formatDate(movement.effectiveDate)}</td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-2">
                                <StatusBadge status="info" label={movement.movementTypeLabel} />
                                {movement.isSensitive ? <StatusBadge status="warning" label={movement.redacted ? "Informacao restrita" : "Informacao sensivel"} /> : null}
                              </div>
                            </td>
                            <td className="px-4 py-3"><StatusBadge status={movementStatusTone(movement.status)} label={movement.statusLabel} /></td>
                            <td className="px-4 py-3">{movementTransitionLabel(movement, "unit")}</td>
                            <td className="px-4 py-3">{movementTransitionLabel(movement, "department")}</td>
                            <td className="px-4 py-3">{movementTransitionLabel(movement, "job")}</td>
                            <td className="px-4 py-3">{movementTransitionLabel(movement, "salary")}</td>
                            <td className="px-4 py-3">{movement.redacted ? "Informacao restrita" : movement.reason || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </div>
          </Card>
        ) : (
          <RestrictedState title="Carreira restrita" description="Seu perfil nao possui permissao para consultar movimentacoes funcionais deste colaborador." />
        )
      ) : null}

      {activeTab === "history" ? (
        canViewHistory ? (
          <Card className="min-w-0 overflow-hidden border-border/80 shadow-sm shadow-primary/5">
            <div className="border-b p-5">
              <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <History className="h-4 w-4 text-primary" />
                    <h3 className="text-base font-semibold">Vida Funcional</h3>
                    <StatusBadge status="info" label="Linha do tempo oficial do colaborador" />
                  </div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Principais acontecimentos administrativos do colaborador, com dados protegidos redigidos quando necessario.
                  </p>
                </div>
                <StatusBadge status={canViewSensitiveHistory ? "info" : "visual"} label={canViewSensitiveHistory ? "Eventos restritos permitidos" : "Eventos restritos redigidos"} />
              </div>
            </div>

            <div className="space-y-4 p-5">
              <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-4">
                <TimelineSelect label="Categoria" value={timelineCategory} onChange={(value) => setTimelineCategory(value as TimelineCategory)} options={timelineCategories} />
                <TimelineSelect label="Periodo" value={timelinePeriod} onChange={(value) => setTimelinePeriod(value as TimelinePeriod)} options={timelinePeriods} />
                <TimelineSelect label="Severidade" value={timelineSeverity} onChange={(value) => setTimelineSeverity(value as TimelineSeverity)} options={timelineSeverities} />
                <TimelineSelect label="Restricao" value={timelineSensitiveFilter} onChange={(value) => setTimelineSensitiveFilter(value as TimelineSensitiveFilter)} options={timelineSensitiveFilters} />
              </div>

              {timelinePeriod === "custom" ? (
                <div className="grid min-w-0 gap-3 md:grid-cols-2">
                  <TimelineDateInput label="Inicio" value={timelineCustomFrom} onChange={setTimelineCustomFrom} />
                  <TimelineDateInput label="Fim" value={timelineCustomTo} onChange={setTimelineCustomTo} />
                </div>
              ) : null}

              {historyQuery.isLoading ? <LoadingTable label="Carregando vida funcional..." /> : null}
              {historyQuery.error ? <ErrorMessage message={historyQuery.error instanceof Error ? historyQuery.error.message : "Nao foi possivel carregar a vida funcional."} /> : null}
              {!historyQuery.isLoading && historyQuery.data && !historyQuery.data.data.length ? (
                <EmptyState title="Nenhum evento funcional registrado" description="Os principais acontecimentos da vida funcional do colaborador aparecerão aqui." />
              ) : null}
              {!historyQuery.isLoading && historyQuery.data?.data.length && !filteredHistoryEvents.length ? (
                <EmptyState title="Nenhum evento encontrado" description="Ajuste os filtros para consultar outros registros da vida funcional." />
              ) : null}

              {timelineGroups.length ? (
                <div className="space-y-6">
                  {timelineGroups.map((group) => (
                    <section key={group.label} className="min-w-0">
                      <div className="mb-3 flex items-center gap-3">
                        <h4 className="shrink-0 text-sm font-semibold text-foreground">{group.label}</h4>
                        <div className="h-px min-w-0 flex-1 bg-border" />
                      </div>
                      <div className="relative space-y-3 pl-7 before:absolute before:bottom-2 before:left-[13px] before:top-2 before:w-px before:bg-border">
                        {group.events.map((event) => (
                          <TimelineEventCard key={event.id} event={event} employeeId={employeeId} />
                        ))}
                      </div>
                    </section>
                  ))}
                  <div className="flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-muted-foreground">
                      Pagina {historyPagination?.page ?? historyPage} de {Math.max(historyPagination?.totalPages ?? 1, 1)} | {filteredHistoryEvents.length} evento(s) nesta pagina
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => setHistoryPage((current) => Math.max(1, current - 1))} disabled={historyPage <= 1 || historyQuery.isFetching}>
                        Anterior
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setHistoryPage((current) => current + 1)}
                        disabled={historyPage >= Math.max(historyPagination?.totalPages ?? 1, 1) || historyQuery.isFetching}
                      >
                        Proxima
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </Card>
        ) : (
          <RestrictedState title="Vida funcional restrita" description="Seu perfil nao possui permissao para consultar a vida funcional deste colaborador." />
        )
      ) : null}
    </div>
  );
}

function TimelineSelect({
  label,
  value,
  onChange,
  options
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="min-w-0 space-y-1 text-xs font-medium text-muted-foreground">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground">
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function TimelineDateInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="min-w-0 space-y-1 text-xs font-medium text-muted-foreground">
      {label}
      <input type="date" value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground" />
    </label>
  );
}

function TimelineEventCard({ event, employeeId }: { event: HrFunctionalEvent; employeeId: string }) {
  const category = eventCategory(event.eventType);
  const Icon = eventCategoryIcon(category);
  const href = sourceHref(employeeId, event);

  return (
    <article className={cn("relative rounded-md border bg-background p-4", event.redacted && "bg-muted/35")}>
      <div className="absolute -left-7 top-4 flex h-7 w-7 items-center justify-center rounded-full border bg-background shadow-sm">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={eventCategoryTone(category)} label={eventCategoryLabel(category)} />
            <StatusBadge status={eventSeverityTone(event.severity)} label={eventSeverityLabel(event.severity)} />
            <StatusBadge status="visual" label={eventStatusLabel(event.status)} />
            {event.isSensitive ? <StatusBadge status="warning" label={event.redacted ? "Evento restrito" : "Visivel apenas para usuarios autorizados"} /> : null}
          </div>
          <h4 className="mt-2 break-words text-sm font-semibold text-foreground">{eventTypeLabel(event.eventType)}</h4>
          <p className="mt-1 break-words text-sm leading-6 text-foreground">{event.title}</p>
          {event.description ? <p className="mt-1 break-words text-sm leading-6 text-muted-foreground">{event.description}</p> : null}
        </div>
        <div className="shrink-0 text-xs text-muted-foreground">{formatDateTime(event.eventDate)}</div>
      </div>
      <div className="mt-4 flex min-w-0 flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 text-xs leading-5 text-muted-foreground">
          <span className="font-medium text-foreground">Origem:</span> {sourceLabel(event)}
        </div>
        {href ? (
          <Button asChild type="button" variant="outline" size="sm">
            <Link href={href}>Abrir origem</Link>
          </Button>
        ) : (
          <Button type="button" variant="outline" size="sm" disabled>
            Abrir origem
          </Button>
        )}
      </div>
    </article>
  );
}
