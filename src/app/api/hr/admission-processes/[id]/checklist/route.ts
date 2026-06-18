import { NextResponse } from "next/server";
import { z } from "zod";

import { listAdmissionChecklistItems, loadAdmissionProcessById } from "@/lib/hr/admission-processes";
import { handleHrRouteError, HR_PERMISSIONS, hrApiError, requireHrPermission } from "@/lib/hr/api-auth";
import { hrIdParamSchema } from "@/lib/hr/schemas";

export const dynamic = "force-dynamic";

interface AdmissionChecklistRouteParams {
  params: {
    id: string;
  };
}

export async function GET(_request: Request, { params }: AdmissionChecklistRouteParams) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.workflowsView);

  if (response || !context) {
    return response;
  }

  try {
    const { id } = hrIdParamSchema.parse(params);
    const process = await loadAdmissionProcessById(context, id);

    if (!process) {
      return hrApiError("Processo admissional nao encontrado.", 404);
    }

    const checklist = await listAdmissionChecklistItems(context, id);

    return NextResponse.json({
      ok: true,
      data: checklist
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return hrApiError(error.errors[0]?.message ?? "Identificador invalido.", 422);
    }

    return handleHrRouteError(error, "Nao foi possivel carregar o checklist admissional.");
  }
}
