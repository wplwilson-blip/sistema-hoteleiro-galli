import { NextResponse } from "next/server";
import { z } from "zod";
import { ATTACHMENTS_BUCKET, createSignedAttachmentUrl, sanitizeFileName, type AttachmentRow } from "@/lib/attachments/api";
import { HR_PERMISSIONS, logHrApiError } from "@/lib/hr/api-auth";
import { loadCandidateForWorkflow, loadJobOpeningWorkflow } from "@/lib/hr/candidate-data";
import { handleHrWorkflowRouteError, hrWorkflowApiError, requireHrWorkflowPermission } from "@/lib/hr/workflow-auth";

export const dynamic = "force-dynamic";

const RESUME_MODULE = "hr";
const RESUME_ENTITY_TYPE = "hr_job_candidate_resume";
const MAX_RESUME_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_RESUME_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;
const ALLOWED_RESUME_EXTENSIONS = ["pdf", "jpg", "jpeg", "png"] as const;
const attachmentSelect =
  "id, organization_id, unit_id, module, entity_type, entity_id, file_name, file_path, file_mime_type, file_size_bytes, storage_bucket, description, is_sensitive, visibility_scope, uploaded_by, status, created_at, updated_at";

type RouteParams = {
  params: {
    id: string;
    candidateId: string;
  };
};

function extensionOf(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

function validateResumeFile(file: File) {
  if (!file.size) return "Arquivo invalido.";
  if (file.size > MAX_RESUME_SIZE_BYTES) return "Arquivo excede o limite de 5 MB.";

  const extension = extensionOf(file.name);
  if (!ALLOWED_RESUME_EXTENSIONS.includes(extension as (typeof ALLOWED_RESUME_EXTENSIONS)[number])) {
    return "Tipo de arquivo nao permitido. Envie PDF, JPG, JPEG ou PNG.";
  }

  if (file.type && !ALLOWED_RESUME_MIME_TYPES.includes(file.type as (typeof ALLOWED_RESUME_MIME_TYPES)[number])) {
    return "Tipo de arquivo nao permitido. Envie PDF, JPG, JPEG ou PNG.";
  }

  return "";
}

function buildResumePath(input: { organizationId: string; unitId: string; candidateId: string; fileName: string }) {
  return `hr/${input.organizationId}/${input.unitId}/candidates/${input.candidateId}/resume/${Date.now()}-${sanitizeFileName(input.fileName)}`;
}

async function loadActiveResume(context: Awaited<ReturnType<typeof requireHrWorkflowPermission>>["context"], candidateId: string) {
  if (!context) return null;

  const { data, error } = await context.supabase
    .from("attachments")
    .select(attachmentSelect)
    .eq("module", RESUME_MODULE)
    .eq("entity_type", RESUME_ENTITY_TYPE)
    .eq("entity_id", candidateId)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    logHrApiError("candidate_resume.lookup_failed", error);
    throw new Error("Nao foi possivel carregar o curriculo.");
  }

  return ((data ?? []) as AttachmentRow[])[0] ?? null;
}

async function mapResume(context: NonNullable<Awaited<ReturnType<typeof requireHrWorkflowPermission>>["context"]>, attachment: AttachmentRow | null) {
  if (!attachment) return null;

  const signedUrl = await createSignedAttachmentUrl(context.supabase, attachment.storage_bucket ?? ATTACHMENTS_BUCKET, attachment.file_path);

  return {
    id: attachment.id,
    fileName: attachment.file_name,
    fileMimeType: attachment.file_mime_type,
    fileSizeBytes: Number(attachment.file_size_bytes),
    uploadedAt: attachment.created_at,
    signedUrl
  };
}

async function loadCandidateContext(permission: typeof HR_PERMISSIONS.workflowsView | typeof HR_PERMISSIONS.workflowsManage, params: RouteParams["params"]) {
  const { context, response } = await requireHrWorkflowPermission(permission);

  if (response || !context) {
    return { context: null, response, workflow: null, candidate: null };
  }

  const workflow = await loadJobOpeningWorkflow(context, params.id);
  if (!workflow) {
    return {
      context: null,
      response: hrWorkflowApiError("WORKFLOW_NOT_FOUND", "Solicitacao de vaga nao encontrada.", 404),
      workflow: null,
      candidate: null
    };
  }

  const candidate = await loadCandidateForWorkflow(context, workflow.id, params.candidateId);
  if (!candidate) {
    return {
      context: null,
      response: hrWorkflowApiError("CANDIDATE_NOT_FOUND", "Candidato nao encontrado.", 404),
      workflow: null,
      candidate: null
    };
  }

  return { context, response: null, workflow, candidate };
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { context, response, candidate } = await loadCandidateContext(HR_PERMISSIONS.workflowsView, params);

    if (response || !context || !candidate) {
      return response;
    }

    const resume = await loadActiveResume(context, candidate.id);
    return NextResponse.json({ data: await mapResume(context, resume) });
  } catch (error) {
    return handleHrWorkflowRouteError(error, "Nao foi possivel carregar o curriculo.");
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { context, response, workflow, candidate } = await loadCandidateContext(HR_PERMISSIONS.workflowsManage, params);

    if (response || !context || !workflow || !candidate) {
      return response;
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return hrWorkflowApiError("INVALID_PAYLOAD", "Selecione um curriculo para enviar.", 422);
    }

    const validationMessage = validateResumeFile(file);
    if (validationMessage) {
      return hrWorkflowApiError("INVALID_FILE", validationMessage, 422);
    }

    const filePath = buildResumePath({
      organizationId: workflow.organization_id,
      unitId: workflow.unit_id,
      candidateId: candidate.id,
      fileName: file.name
    });
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await context.supabase.storage.from(ATTACHMENTS_BUCKET).upload(filePath, fileBuffer, {
      contentType: file.type || "application/octet-stream",
      upsert: false
    });

    if (uploadError) {
      logHrApiError("candidate_resume.upload_failed", uploadError);
      return hrWorkflowApiError("INTERNAL_ERROR", "Nao foi possivel enviar o curriculo. Verifique o bucket privado attachments.", 500);
    }

    const { data, error } = await context.supabase
      .from("attachments")
      .insert({
        organization_id: workflow.organization_id,
        unit_id: workflow.unit_id,
        module: RESUME_MODULE,
        entity_type: RESUME_ENTITY_TYPE,
        entity_id: candidate.id,
        attachment_type_id: null,
        file_name: file.name,
        file_path: filePath,
        file_mime_type: file.type || "application/octet-stream",
        file_size_bytes: file.size,
        storage_bucket: ATTACHMENTS_BUCKET,
        description: "Curriculo simples do candidato",
        is_sensitive: true,
        visibility_scope: "restricted",
        uploaded_by: context.session.user.id,
        status: "active",
        created_by: context.session.user.id,
        updated_by: context.session.user.id
      })
      .select(attachmentSelect)
      .single();

    if (error) {
      logHrApiError("candidate_resume.create_failed", error);
      await context.supabase.storage.from(ATTACHMENTS_BUCKET).remove([filePath]);
      return hrWorkflowApiError("INTERNAL_ERROR", "Nao foi possivel registrar o curriculo.", 500);
    }

    const archiveResult = await context.supabase
      .from("attachments")
      .update({
        status: "archived",
        deleted_at: new Date().toISOString(),
        deleted_by: context.session.user.id,
        updated_by: context.session.user.id
      })
      .eq("module", RESUME_MODULE)
      .eq("entity_type", RESUME_ENTITY_TYPE)
      .eq("entity_id", candidate.id)
      .eq("status", "active")
      .is("deleted_at", null)
      .neq("id", (data as AttachmentRow).id);

    if (archiveResult.error) {
      logHrApiError("candidate_resume.archive_previous_failed", archiveResult.error);
    }

    return NextResponse.json({ data: await mapResume(context, data as AttachmentRow) }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return hrWorkflowApiError("INVALID_PAYLOAD", error.errors[0]?.message ?? "Payload invalido.", 422);
    }

    return handleHrWorkflowRouteError(error, "Nao foi possivel enviar o curriculo.");
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const { context, response, candidate } = await loadCandidateContext(HR_PERMISSIONS.workflowsManage, params);

    if (response || !context || !candidate) {
      return response;
    }

    const resume = await loadActiveResume(context, candidate.id);
    if (!resume) {
      return NextResponse.json({ ok: true, message: "Curriculo ja estava removido." });
    }

    const { error } = await context.supabase
      .from("attachments")
      .update({
        status: "inactive",
        deleted_at: new Date().toISOString(),
        deleted_by: context.session.user.id,
        updated_by: context.session.user.id
      })
      .eq("id", resume.id);

    if (error) {
      logHrApiError("candidate_resume.delete_failed", error);
      return hrWorkflowApiError("INTERNAL_ERROR", "Nao foi possivel remover o curriculo.", 500);
    }

    const removeResult = await context.supabase.storage.from(resume.storage_bucket ?? ATTACHMENTS_BUCKET).remove([resume.file_path]);
    if (removeResult.error) {
      logHrApiError("candidate_resume.storage_remove_failed", removeResult.error);
    }

    return NextResponse.json({ ok: true, message: "Curriculo removido com sucesso." });
  } catch (error) {
    return handleHrWorkflowRouteError(error, "Nao foi possivel remover o curriculo.");
  }
}
