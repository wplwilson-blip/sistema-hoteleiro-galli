import { NextResponse } from "next/server";
import type { SupabaseAdmin } from "@/lib/base-cadastros/api-helpers";
import { HR_PERMISSIONS, logHrApiError } from "@/lib/hr/api-auth";
import { ensureAdmissionMinimumChecklist, ensureAdmissionProcessForConversion } from "@/lib/hr/admission-processes";
import {
  loadCandidateAdmissionConversion,
  loadCandidateForWorkflow,
  loadJobOpeningWorkflow,
  type HrCandidateAdmissionConversionRow
} from "@/lib/hr/candidate-data";
import { buildWorkflowAuditState, loadWorkflowAuditSnapshot, recordWorkflowAuditLog } from "@/lib/hr/workflow-audit";
import {
  HrWorkflowMutationError,
  applyCreateWorkflowRpc,
  buildCreateWorkflowRpcPayload,
  createWorkflowRequestHash,
  getRequiredWorkflowIdempotencyKey,
  mapWorkflowRpcError,
  parseCreateWorkflowPayload
} from "@/lib/hr/workflow-mutations";
import { loadWorkflowTemplateSteps, loadWorkflowTemplates } from "@/lib/hr/workflow-templates";
import { handleHrWorkflowRouteError, hrWorkflowApiError, requireHrWorkflowPermission } from "@/lib/hr/workflow-auth";

export const dynamic = "force-dynamic";

type RouteParams = {
  params: {
    id: string;
    candidateId: string;
  };
};

type ConversionRow = HrCandidateAdmissionConversionRow & {
  organization_id?: string;
  unit_id?: string;
};

type Metadata = Record<string, unknown>;

function textValue(value: unknown, max = 160) {
  if (typeof value !== "string") return undefined;
  const compact = value.trim().replace(/\s+/g, " ");
  return compact ? compact.slice(0, max) : undefined;
}

function dateValue(value: unknown) {
  if (typeof value !== "string") return undefined;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

function uuidValue(value: unknown) {
  if (typeof value !== "string") return undefined;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : undefined;
}

function codeValue(value: unknown, max = 20) {
  if (typeof value !== "string") return undefined;
  const compact = value.trim().replace(/\s+/g, "");
  return /^[0-9A-Za-z_.-]{2,20}$/.test(compact) ? compact.slice(0, max) : undefined;
}

function normalizeStepKey(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9_.-]/g, "_").slice(0, 80);
}

async function ensurePersistentAdmissionProcess(input: {
  supabase: SupabaseAdmin;
  workflow: Awaited<ReturnType<typeof loadJobOpeningWorkflow>>;
  candidate: Awaited<ReturnType<typeof loadCandidateForWorkflow>>;
  admissionWorkflowId: string;
  userId: string;
}) {
  if (!input.workflow || !input.candidate) {
    throw new HrWorkflowMutationError("INTERNAL_ERROR", "Dados insuficientes para criar admissao persistente.", 500);
  }

  const sourceMetadata = input.workflow.metadata as Metadata;

  try {
    const admissionProcess = await ensureAdmissionProcessForConversion(input.supabase, {
      organizationId: input.workflow.organization_id,
      unitId: input.workflow.unit_id,
      sourceJobOpeningWorkflowId: input.workflow.id,
      sourceCandidateId: input.candidate.id,
      admissionWorkflowId: input.admissionWorkflowId,
      employeeId: null,
      jobPositionId: uuidValue(sourceMetadata.job_position_id) ?? null,
      departmentId: uuidValue(sourceMetadata.department_id) ?? null,
      jobTitle: textValue(sourceMetadata.job_position),
      cboCode: codeValue(sourceMetadata.cbo_code),
      departmentName: textValue(sourceMetadata.department),
      expectedStartDate: dateValue(sourceMetadata.requested_start_date) ?? dateValue(sourceMetadata.admission_date),
      actorUserId: input.userId
    });
    const checklist = await ensureAdmissionMinimumChecklist(input.supabase, {
      organizationId: admissionProcess.process.organization_id,
      unitId: admissionProcess.process.unit_id,
      admissionProcessId: admissionProcess.process.id,
      actorUserId: input.userId
    });

    return {
      ...admissionProcess,
      checklistItems: checklist.items,
      checklistCreated: checklist.created
    };
  } catch (error) {
    logHrApiError("candidate_admission_conversion.persistent_process_failed", error instanceof Error ? error : { message: String(error) });
    throw new HrWorkflowMutationError("INTERNAL_ERROR", "Admissao criada, mas nao foi possivel garantir o processo persistente.", 500);
  }
}

async function loadExistingConversion(input: {
  supabase: SupabaseAdmin;
  workflowId: string;
  candidateId: string;
}) {
  const { data, error } = await input.supabase
    .from("hr_candidate_admission_conversions")
    .select("id, candidate_id, source_job_opening_workflow_id, admission_workflow_id, status, converted_at, converted_by, created_at")
    .eq("source_job_opening_workflow_id", input.workflowId)
    .eq("candidate_id", input.candidateId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    logHrApiError("candidate_admission_conversion.lookup_failed", error);
    throw new HrWorkflowMutationError("INTERNAL_ERROR", "Nao foi possivel validar conversao existente.", 500);
  }

  return (data?.[0] as ConversionRow | undefined) ?? null;
}

async function createOrReuseConversion(input: {
  supabase: SupabaseAdmin;
  organizationId: string;
  unitId: string;
  workflowId: string;
  candidateId: string;
  userId: string;
}) {
  const existing = await loadExistingConversion({
    supabase: input.supabase,
    workflowId: input.workflowId,
    candidateId: input.candidateId
  });

  if (existing?.status === "completed" && existing.admission_workflow_id) {
    return { conversion: existing, alreadyCompleted: true };
  }

  if (existing?.status === "processing") {
    throw new HrWorkflowMutationError("REQUEST_ALREADY_PROCESSING", "A admissao deste candidato ainda esta sendo gerada.", 409);
  }

  if (existing?.status === "failed") {
    const { data, error } = await input.supabase
      .from("hr_candidate_admission_conversions")
      .update({
        status: "processing",
        error_message: null,
        updated_by: input.userId
      })
      .eq("id", existing.id)
      .select("id, candidate_id, source_job_opening_workflow_id, admission_workflow_id, status, converted_at, converted_by, created_at")
      .single();

    if (error) {
      logHrApiError("candidate_admission_conversion.retry_failed", error);
      throw new HrWorkflowMutationError("INTERNAL_ERROR", "Nao foi possivel preparar nova tentativa de conversao.", 500);
    }

    return { conversion: data as ConversionRow, alreadyCompleted: false };
  }

  const { data, error } = await input.supabase
    .from("hr_candidate_admission_conversions")
    .insert({
      organization_id: input.organizationId,
      unit_id: input.unitId,
      source_job_opening_workflow_id: input.workflowId,
      candidate_id: input.candidateId,
      status: "processing",
      created_by: input.userId,
      updated_by: input.userId
    })
    .select("id, candidate_id, source_job_opening_workflow_id, admission_workflow_id, status, converted_at, converted_by, created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      const raced = await loadExistingConversion({
        supabase: input.supabase,
        workflowId: input.workflowId,
        candidateId: input.candidateId
      });

      if (raced?.status === "completed" && raced.admission_workflow_id) {
        return { conversion: raced, alreadyCompleted: true };
      }

      throw new HrWorkflowMutationError("REQUEST_ALREADY_PROCESSING", "A admissao deste candidato ainda esta sendo gerada.", 409);
    }

    logHrApiError("candidate_admission_conversion.create_failed", error);
    throw new HrWorkflowMutationError("INTERNAL_ERROR", "Nao foi possivel registrar a conversao.", 500);
  }

  return { conversion: data as ConversionRow, alreadyCompleted: false };
}

async function markConversionFailed(input: {
  supabase: SupabaseAdmin;
  conversionId: string;
  userId: string;
  message: string;
}) {
  await input.supabase
    .from("hr_candidate_admission_conversions")
    .update({
      status: "failed",
      error_message: input.message.slice(0, 500),
      updated_by: input.userId
    })
    .eq("id", input.conversionId);
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { context, response } = await requireHrWorkflowPermission(HR_PERMISSIONS.workflowsManage);

    if (response || !context) {
      return response;
    }

    const idempotencyKey = getRequiredWorkflowIdempotencyKey(request);
    const workflow = await loadJobOpeningWorkflow(context, params.id);
    if (!workflow) {
      return hrWorkflowApiError("WORKFLOW_NOT_FOUND", "Solicitacao de vaga nao encontrada.", 404);
    }

    const candidate = await loadCandidateForWorkflow(context, workflow.id, params.candidateId);
    if (!candidate) {
      return hrWorkflowApiError("CANDIDATE_NOT_FOUND", "Candidato nao encontrado.", 404);
    }

    if (candidate.status !== "aprovado") {
      return hrWorkflowApiError("CANDIDATE_STATUS_INVALID", "A admissao so pode ser gerada para candidato aprovado.", 409);
    }

    const existingConversion = await loadCandidateAdmissionConversion(context, workflow.id, candidate.id);
    if (existingConversion?.status === "completed" && existingConversion.admission_workflow_id) {
      const admissionProcess = await ensurePersistentAdmissionProcess({
        supabase: context.supabase,
        workflow,
        candidate,
        admissionWorkflowId: existingConversion.admission_workflow_id,
        userId: context.session.user.id
      });

      return NextResponse.json({
        data: {
          admission_workflow_id: existingConversion.admission_workflow_id,
          already_exists: true,
          admission_process_id: admissionProcess.process.id,
          admissionProcess: {
            id: admissionProcess.process.id,
            created: admissionProcess.created,
            checklistItems: admissionProcess.checklistItems.length,
            checklistCreated: admissionProcess.checklistCreated
          }
        }
      });
    }

    const templates = await loadWorkflowTemplates({
      supabase: context.supabase,
      scope: {
        isSuperAdmin: context.isSuperAdmin,
        accessibleUnitIds: context.accessibleUnitIds,
        unitId: workflow.unit_id,
        workflowType: "admission",
        isActive: true,
        includeSystem: true
      }
    });
    const stepsByTemplate = await loadWorkflowTemplateSteps({
      supabase: context.supabase,
      templateIds: templates.map((template) => template.id)
    });
    const selectedTemplate = templates.find((template) => (stepsByTemplate.get(template.id)?.length ?? 0) > 0);

    if (!selectedTemplate) {
      const message = templates.length
        ? "Template admission ativo encontrado, mas sem etapas ativas. Aplique ou revise o seed de etapas do template."
        : "Template admission ativo nao encontrado para a organizacao/unidade da vaga. Aplique a migration de seed do template admission.";
      return hrWorkflowApiError("ADMISSION_TEMPLATE_NOT_FOUND", message, 409);
    }

    const sourceMetadata = workflow.metadata as Metadata;
    const steps = (stepsByTemplate.get(selectedTemplate.id) ?? [])
      .slice()
      .sort((left, right) => Number(left.order_index) - Number(right.order_index))
      .map((step, index) => ({
        step_key: normalizeStepKey(step.step_key || `ADMISSION_STEP_${index + 1}`),
        title: step.name,
        step_order: index + 1,
        requires_approval: step.requires_approval,
        sla_minutes: step.default_sla_minutes === null ? undefined : Number(step.default_sla_minutes)
      }));

    const metadata = {
      admission_date: dateValue(sourceMetadata.requested_start_date) ?? dateValue(sourceMetadata.admission_date),
      candidate_name: textValue(candidate.full_name, 140),
      source_candidate_id: candidate.id,
      source_job_opening_workflow_id: workflow.id,
      job_position: textValue(sourceMetadata.job_position),
      department: textValue(sourceMetadata.department),
      contract_type: textValue(sourceMetadata.contract_type, 80),
      requesting_manager: textValue(sourceMetadata.manager_name ?? sourceMetadata.requesting_manager),
      notes: textValue(sourceMetadata.notes, 500)
    };

    const payload = parseCreateWorkflowPayload({
      workflow_type: "admission",
      title: `Admissao - ${candidate.full_name}`,
      description: `Admissao gerada a partir da solicitacao de vaga: ${workflow.title}`,
      employee_id: null,
      unit_id: workflow.unit_id,
      priority: "normal",
      sla_minutes: selectedTemplate.default_sla_minutes === null ? undefined : Number(selectedTemplate.default_sla_minutes),
      metadata,
      steps
    });

    const { conversion, alreadyCompleted } = await createOrReuseConversion({
      supabase: context.supabase,
      organizationId: workflow.organization_id,
      unitId: workflow.unit_id,
      workflowId: workflow.id,
      candidateId: candidate.id,
      userId: context.session.user.id
    });

    if (alreadyCompleted && conversion.admission_workflow_id) {
      const admissionProcess = await ensurePersistentAdmissionProcess({
        supabase: context.supabase,
        workflow,
        candidate,
        admissionWorkflowId: conversion.admission_workflow_id,
        userId: context.session.user.id
      });

      return NextResponse.json({
        data: {
          admission_workflow_id: conversion.admission_workflow_id,
          already_exists: true,
          admission_process_id: admissionProcess.process.id,
          admissionProcess: {
            id: admissionProcess.process.id,
            created: admissionProcess.created,
            checklistItems: admissionProcess.checklistItems.length,
            checklistCreated: admissionProcess.checklistCreated
          }
        }
      });
    }

    const rpcPayload = buildCreateWorkflowRpcPayload(payload);
    const requestHash = createWorkflowRequestHash({
      organizationId: workflow.organization_id,
      unitId: workflow.unit_id,
      payload: rpcPayload
    });
    const result = await applyCreateWorkflowRpc({
      supabase: context.supabase,
      context,
      organizationId: workflow.organization_id,
      unitId: workflow.unit_id,
      idempotencyKey,
      requestHash,
      payload: rpcPayload
    });

    if (!result.ok) {
      const mapped = mapWorkflowRpcError(result, "Nao foi possivel gerar a admissao.");
      await markConversionFailed({
        supabase: context.supabase,
        conversionId: conversion.id,
        userId: context.session.user.id,
        message: mapped.message
      });
      throw mapped;
    }

    if (!result.workflow_id) {
      throw new HrWorkflowMutationError("INTERNAL_ERROR", "A engine nao retornou o workflow de admissao.", 500);
    }

    const { error: conversionUpdateError } = await context.supabase
      .from("hr_candidate_admission_conversions")
      .update({
        admission_workflow_id: result.workflow_id,
        status: "completed",
        converted_at: new Date().toISOString(),
        converted_by: context.session.user.id,
        updated_by: context.session.user.id
      })
      .eq("id", conversion.id);

    if (conversionUpdateError) {
      logHrApiError("candidate_admission_conversion.complete_failed", conversionUpdateError);
      throw new HrWorkflowMutationError("INTERNAL_ERROR", "Admissao criada, mas nao foi possivel registrar o vinculo.", 500);
    }

    const admissionProcess = await ensurePersistentAdmissionProcess({
      supabase: context.supabase,
      workflow,
      candidate,
      admissionWorkflowId: result.workflow_id,
      userId: context.session.user.id
    });

    const auditSnapshot = await loadWorkflowAuditSnapshot({
      supabase: context.supabase,
      workflowId: result.workflow_id
    });

    if (auditSnapshot.workflow && result.idempotency?.replayed !== true) {
      await recordWorkflowAuditLog({
        context,
        request,
        action: "create_workflow",
        workflow: auditSnapshot.workflow,
        previousState: null,
        newState: {
          workflow: buildWorkflowAuditState(auditSnapshot.workflow)
        },
        metadata: {
          idempotency_key: idempotencyKey,
          idempotency_replayed: false,
          source: "candidate_conversion",
          source_candidate_id: candidate.id,
          source_job_opening_workflow_id: workflow.id
        }
      });
    }

    return NextResponse.json(
      {
        data: {
          admission_workflow_id: result.workflow_id,
          already_exists: result.idempotency?.replayed === true,
          admission_process_id: admissionProcess.process.id,
          admissionProcess: {
            id: admissionProcess.process.id,
            created: admissionProcess.created,
            checklistItems: admissionProcess.checklistItems.length,
            checklistCreated: admissionProcess.checklistCreated
          }
        }
      },
      { status: result.idempotency?.replayed ? 200 : 201 }
    );
  } catch (error) {
    if (error instanceof HrWorkflowMutationError) {
      return hrWorkflowApiError(error.code, error.message, error.status);
    }

    return handleHrWorkflowRouteError(error, "Nao foi possivel gerar a admissao.");
  }
}
