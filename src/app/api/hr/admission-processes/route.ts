import { NextResponse } from "next/server";
import { z } from "zod";
import {
  listAdmissionProcesses,
  loadAdmissionProcessByCandidate,
  loadAdmissionProcessByEmployee,
  loadAdmissionProcessByWorkflow
} from "@/lib/hr/admission-processes";
import { handleHrRouteError, HR_PERMISSIONS, hrApiError, requireHrPermission } from "@/lib/hr/api-auth";
import { hrAdmissionProcessesQuerySchema, parseSearchParams } from "@/lib/hr/schemas";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.workflowsView);

  if (response || !context) {
    return response;
  }

  try {
    const query = parseSearchParams(request, hrAdmissionProcessesQuerySchema);

    if (query.workflowId) {
      const process = await loadAdmissionProcessByWorkflow(context, query.workflowId);
      return NextResponse.json({ ok: true, data: { process } });
    }

    if (query.candidateId) {
      const process = await loadAdmissionProcessByCandidate(context, query.candidateId);
      return NextResponse.json({ ok: true, data: { process } });
    }

    if (query.employeeId) {
      const process = await loadAdmissionProcessByEmployee(context, query.employeeId);
      return NextResponse.json({ ok: true, data: { process } });
    }

    const { data, pagination } = await listAdmissionProcesses(context, {
      jobOpeningWorkflowId: query.jobOpeningWorkflowId,
      status: query.status,
      page: query.page,
      pageSize: query.pageSize
    });

    return NextResponse.json({
      ok: true,
      data,
      pagination
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    }

    return handleHrRouteError(error, "Nao foi possivel carregar processos admissionais.");
  }
}
