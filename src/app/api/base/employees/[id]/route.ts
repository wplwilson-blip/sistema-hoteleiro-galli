import { NextResponse } from "next/server";
import { z } from "zod";
import { BASE_PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { employeePayloadSchema } from "@/lib/base-cadastros/schemas";
import {
  apiError,
  getUnitOrganizationId,
  logBaseCadastroError,
} from "@/lib/base-cadastros/api-helpers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ensureAutomaticEmployeeDocumentDossier } from "@/lib/hr/employee-document-dossier-auto";
import { ensureAutomaticEmployeeOnboarding } from "@/lib/hr/employee-onboarding-auto";

async function validateEmployeeRelationsForUnit(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  input: { unitId: string; departmentId?: string; jobPositionId?: string }
) {
  if (input.departmentId) {
    const { data, error } = await supabase
      .from("departments")
      .select("id")
      .eq("id", input.departmentId)
      .eq("unit_id", input.unitId)
      .is("deleted_at", null)
      .limit(1);

    if (error) {
      logBaseCadastroError("employee.department_lookup_failed", error);
      throw new Error("Nao foi possivel validar o departamento do colaborador.");
    }

    if (!data?.[0]) {
      throw new Error("Departamento nao encontrado para a unidade selecionada.");
    }
  }

  if (input.jobPositionId) {
    const { data, error } = await supabase
      .from("job_positions")
      .select("id")
      .eq("id", input.jobPositionId)
      .eq("unit_id", input.unitId)
      .is("deleted_at", null)
      .limit(1);

    if (error) {
      logBaseCadastroError("employee.job_position_lookup_failed", error);
      throw new Error("Nao foi possivel validar o cargo do colaborador.");
    }

    if (!data?.[0]) {
      throw new Error("Cargo nao encontrado para a unidade selecionada.");
    }
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const { context, response } = await requirePermission(BASE_PERMISSIONS.employeesManage);

  if (response || !context) {
    return response;
  }

  try {
    if (!context.isSuperAdmin) {
      return apiError("Voce nao tem permissao para editar colaboradores.", 403);
    }

    const payload = employeePayloadSchema.parse(await request.json());
    const supabase = context.supabase;
    const organizationId = await getUnitOrganizationId(supabase, payload.unitId);
    await validateEmployeeRelationsForUnit(supabase, {
      unitId: payload.unitId,
      departmentId: payload.departmentId,
      jobPositionId: payload.jobPositionId
    });

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
        updated_by: context.session.user.id
      })
      .eq("id", params.id)
      .is("deleted_at", null)
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505" && error.message?.includes("employees_org_cpf_normalized_active_unique")) {
        return apiError("Ja existe um colaborador com este CPF nesta organizacao.", 409);
      }

      logBaseCadastroError("employee.update_failed", error);
      return apiError("Nao foi possivel atualizar o colaborador.", 500);
    }

    if (data?.id && payload.status === "active") {
      try {
        await ensureAutomaticEmployeeOnboarding(supabase, data.id as string, context.session.user.id);
      } catch (onboardingError) {
        logBaseCadastroError(
          "employee.auto_onboarding_failed",
          onboardingError instanceof Error ? onboardingError : { message: "Falha desconhecida ao gerar onboarding automatico." }
        );
      }

      try {
        await ensureAutomaticEmployeeDocumentDossier(supabase, data.id as string, context.session.user.id);
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

