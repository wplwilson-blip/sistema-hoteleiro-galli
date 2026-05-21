import type { HrEmployeeRow } from "@/lib/hr/api-auth";

type UnitMeta = { id: string; code: string | null; name: string | null };
type DepartmentMeta = { id: string; code: string | null; name: string | null };
type JobPositionMeta = { id: string; code: string | null; name: string | null };

export type EmployeeDocumentSummary = {
  total: number;
  pending: number;
  expired: number;
};

export type EmployeeRelations = {
  unit?: UnitMeta | null;
  department?: DepartmentMeta | null;
  jobPosition?: JobPositionMeta | null;
};

export type EmployeeDocumentRow = {
  id: string;
  organization_id: string;
  unit_id: string;
  employee_id: string;
  document_type_id: string;
  current_attachment_id: string | null;
  status: string;
  issue_date: string | null;
  received_at: string | null;
  valid_until: string | null;
  verified_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  waived_at: string | null;
  waiver_reason: string | null;
  replaced_by_document_id: string | null;
  is_sensitive: boolean;
  visibility_scope: string;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type HrDocumentTypeRow = {
  id: string;
  organization_id: string | null;
  unit_id: string | null;
  code: string;
  name: string;
  description: string | null;
  category: string;
  is_system_default: boolean;
  is_required: boolean;
  requires_valid_until: boolean;
  default_validity_days: number | null;
  recurrence_months: number | null;
  is_sensitive_default: boolean;
  visibility_scope_default: string;
  sort_order: number;
  status: string;
  created_at: string;
  updated_at: string;
};

export type EmployeeFunctionalEventRow = {
  id: string;
  organization_id: string;
  unit_id: string;
  employee_id: string;
  event_type: string;
  event_date: string;
  title: string;
  description: string | null;
  severity: string;
  visibility_scope: string;
  is_sensitive: boolean;
  source_module: string;
  source_entity_type: string | null;
  source_entity_id: string | null;
  related_document_id: string | null;
  related_attachment_id: string | null;
  actor_user_id: string | null;
  actor_employee_id: string | null;
  event_payload: Record<string, unknown>;
  status: string;
  correction_of_event_id: string | null;
  created_at: string;
  updated_at: string | null;
};

function mapUnit(unit?: UnitMeta | null) {
  return unit
    ? {
        id: unit.id,
        code: unit.code ?? "",
        name: unit.name ?? ""
      }
    : null;
}

function mapDepartment(department?: DepartmentMeta | null) {
  return department
    ? {
        id: department.id,
        code: department.code ?? "",
        name: department.name ?? ""
      }
    : null;
}

function mapJobPosition(jobPosition?: JobPositionMeta | null) {
  return jobPosition
    ? {
        id: jobPosition.id,
        code: jobPosition.code ?? "",
        name: jobPosition.name ?? ""
      }
    : null;
}

export function redactEmployeeForHrList(
  employee: HrEmployeeRow,
  relations: EmployeeRelations,
  documentSummary: EmployeeDocumentSummary
) {
  return {
    id: employee.id,
    organizationId: employee.organization_id,
    unitId: employee.unit_id,
    unit: mapUnit(relations.unit),
    departmentId: employee.department_id,
    department: mapDepartment(relations.department),
    jobPositionId: employee.job_position_id,
    jobPosition: mapJobPosition(relations.jobPosition),
    fullName: employee.full_name,
    preferredName: employee.preferred_name ?? "",
    hireDate: employee.hire_date ?? "",
    status: employee.status,
    documentSummary
  };
}

export function redactEmployeeForHrDetail(employee: HrEmployeeRow, relations: EmployeeRelations, canViewSensitive: boolean) {
  return {
    id: employee.id,
    organizationId: employee.organization_id,
    unitId: employee.unit_id,
    unit: mapUnit(relations.unit),
    departmentId: employee.department_id,
    department: mapDepartment(relations.department),
    jobPositionId: employee.job_position_id,
    jobPosition: mapJobPosition(relations.jobPosition),
    fullName: employee.full_name,
    preferredName: employee.preferred_name ?? "",
    corporateEmail: employee.corporate_email ?? "",
    hireDate: employee.hire_date ?? "",
    status: employee.status,
    createdAt: employee.created_at,
    updatedAt: employee.updated_at ?? "",
    sensitive: canViewSensitive
      ? {
          documentNumber: employee.document_number ?? "",
          personalEmail: employee.personal_email ?? "",
          phone: employee.phone ?? "",
          terminationDate: employee.termination_date ?? ""
        }
      : null
  };
}

export function mapHrDocumentType(row: HrDocumentTypeRow) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    unitId: row.unit_id,
    code: row.code,
    name: row.name,
    description: row.description ?? "",
    category: row.category,
    isSystemDefault: row.is_system_default,
    isRequired: row.is_required,
    requiresValidUntil: row.requires_valid_until,
    defaultValidityDays: row.default_validity_days,
    recurrenceMonths: row.recurrence_months,
    isSensitiveDefault: row.is_sensitive_default,
    visibilityScopeDefault: row.visibility_scope_default,
    sortOrder: row.sort_order,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function redactEmployeeDocument(input: {
  document: EmployeeDocumentRow;
  documentType?: HrDocumentTypeRow | null;
  canViewSensitive: boolean;
  includeSensitive: boolean;
}) {
  const canShowSensitiveFields = input.includeSensitive && (!input.document.is_sensitive || input.canViewSensitive);
  const base = {
    id: input.document.id,
    documentTypeId: input.document.document_type_id,
    documentType: input.documentType
      ? {
          id: input.documentType.id,
          code: input.documentType.code,
          name: input.documentType.name,
          category: input.documentType.category,
          isRequired: input.documentType.is_required,
          requiresValidUntil: input.documentType.requires_valid_until
        }
      : null,
    status: input.document.status,
    validUntil: input.document.valid_until ?? "",
    isSensitive: input.document.is_sensitive,
    visibilityScope: input.document.visibility_scope,
    hasCurrentAttachment: Boolean(input.document.current_attachment_id),
    createdAt: input.document.created_at,
    updatedAt: input.document.updated_at,
    redacted: input.document.is_sensitive && !input.canViewSensitive
  };

  if (!canShowSensitiveFields) {
    return base;
  }

  return {
    ...base,
    issueDate: input.document.issue_date ?? "",
    receivedAt: input.document.received_at ?? "",
    verifiedAt: input.document.verified_at ?? "",
    rejectedAt: input.document.rejected_at ?? "",
    rejectionReason: input.document.rejection_reason ?? "",
    waivedAt: input.document.waived_at ?? "",
    waiverReason: input.document.waiver_reason ?? "",
    replacedByDocumentId: input.document.replaced_by_document_id ?? "",
    currentAttachmentId: input.document.current_attachment_id ?? "",
    notes: input.document.notes ?? "",
    metadata: input.document.metadata ?? {}
  };
}

export function redactFunctionalEvent(input: {
  event: EmployeeFunctionalEventRow;
  canViewSensitive: boolean;
  includeSensitive: boolean;
}) {
  const isRedacted = input.event.is_sensitive && !input.canViewSensitive;
  const base = {
    id: input.event.id,
    eventType: isRedacted ? "redacted" : input.event.event_type,
    eventDate: input.event.event_date,
    title: isRedacted ? "Evento sensivel" : input.event.title,
    description: isRedacted ? "" : input.event.description ?? "",
    severity: input.event.severity,
    visibilityScope: input.event.visibility_scope,
    isSensitive: input.event.is_sensitive,
    sourceModule: input.event.source_module,
    sourceEntityType: isRedacted ? "" : input.event.source_entity_type ?? "",
    sourceEntityId: isRedacted ? "" : input.event.source_entity_id ?? "",
    status: input.event.status,
    createdAt: input.event.created_at,
    updatedAt: input.event.updated_at ?? "",
    redacted: isRedacted
  };

  if (!input.includeSensitive || !input.canViewSensitive) {
    return base;
  }

  return {
    ...base,
    relatedDocumentId: input.event.related_document_id ?? "",
    relatedAttachmentId: input.event.related_attachment_id ?? "",
    actorUserId: input.event.actor_user_id ?? "",
    actorEmployeeId: input.event.actor_employee_id ?? "",
    correctionOfEventId: input.event.correction_of_event_id ?? "",
    eventPayload: input.event.event_payload ?? {}
  };
}
