import { NextResponse } from "next/server";
import { z } from "zod";
import { employeePayloadSchema } from "@/lib/base-cadastros/schemas";
import {
  apiError,
  getUnitOrganizationId,
  logBaseCadastroError,
  requireAuthenticatedRequest
} from "@/lib/base-cadastros/api-helpers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ensureAutomaticEmployeeDocumentDossier } from "@/lib/hr/employee-document-dossier-auto";
import { ensureAutomaticEmployeeOnboarding } from "@/lib/hr/employee-onboarding-auto";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const { session, response } = await requireAuthenticatedRequest();

  if (response || !session) {
    return response;
  }

  try {
    const payload = employeePayloadSchema.parse(await request.json());
    const supabase = createSupabaseAdminClient();
    const organizationId = await getUnitOrganizationId(supabase, payload.unitId);

    const { data, error } = await supabase
      .from("employees")
      .update({
        organization_id: organizationId,
        unit_id: payload.unitId,
        department_id: payload.departmentId ?? null,
        job_position_id: payload.jobPositionId ?? null,
        full_name: payload.fullName,
        preferred_name: payload.preferredName || null,
        document_number: payload.documentNumber || null,
        corporate_email: payload.corporateEmail || null,
        personal_email: payload.personalEmail || null,
        phone: payload.phone || null,
        hire_date: payload.hireDate || null,
        termination_date: payload.terminationDate || null,
        status: payload.status,
        updated_by: session.user.id
      })
      .eq("id", params.id)
      .is("deleted_at", null)
      .select("id")
      .single();

    if (error) {
      logBaseCadastroError("employee.update_failed", error);
      return apiError("Nao foi possivel atualizar o colaborador.", 500);
    }

    if (data?.id && payload.status === "active") {
      try {
        await ensureAutomaticEmployeeOnboarding(supabase, data.id as string, session.user.id);
      } catch (onboardingError) {
        logBaseCadastroError(
          "employee.auto_onboarding_failed",
          onboardingError instanceof Error ? onboardingError : { message: "Falha desconhecida ao gerar onboarding automatico." }
        );
      }

      try {
        await ensureAutomaticEmployeeDocumentDossier(supabase, data.id as string, session.user.id);
      } catch (documentDossierError) {
        logBaseCadastroError(
          "employee.auto_document_dossier_failed",
          documentDossierError instanceof Error ? documentDossierError : { message: "Falha desconhecida ao gerar dossie documental automatico." }
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    }

    return apiError(error instanceof Error ? error.message : "Nao foi possivel atualizar o colaborador.", 500);
  }
}

