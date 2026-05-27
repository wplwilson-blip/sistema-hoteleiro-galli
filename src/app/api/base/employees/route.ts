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

export async function GET() {
  const { response } = await requireAuthenticatedRequest();

  if (response) {
    return response;
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { data: employees, error: employeesError } = await supabase
      .from("employees")
      .select(
        "id, organization_id, unit_id, department_id, job_position_id, full_name, preferred_name, document_number, corporate_email, personal_email, phone, hire_date, termination_date, status, created_at"
      )
      .is("deleted_at", null)
      .order("full_name", { ascending: true });

    if (employeesError) {
      logBaseCadastroError("employees.list_failed", employeesError);
      return apiError("Nao foi possivel carregar os colaboradores.", 500);
    }

    const unitIds = Array.from(new Set((employees ?? []).map((employee) => employee.unit_id).filter(Boolean)));
    const departmentIds = Array.from(new Set((employees ?? []).map((employee) => employee.department_id).filter(Boolean)));
    const jobPositionIds = Array.from(new Set((employees ?? []).map((employee) => employee.job_position_id).filter(Boolean)));

    const { data: units, error: unitsError } = unitIds.length
      ? await supabase.from("units").select("id, code, name").in("id", unitIds)
      : { data: [], error: null };
    const { data: departments, error: departmentsError } = departmentIds.length
      ? await supabase.from("departments").select("id, code, name").in("id", departmentIds)
      : { data: [], error: null };
    const { data: jobPositions, error: jobPositionsError } = jobPositionIds.length
      ? await supabase.from("job_positions").select("id, code, name").in("id", jobPositionIds)
      : { data: [], error: null };

    if (unitsError) {
      logBaseCadastroError("employees.units_lookup_failed", unitsError);
      return apiError("Nao foi possivel carregar as unidades dos colaboradores.", 500);
    }

    if (departmentsError) {
      logBaseCadastroError("employees.departments_lookup_failed", departmentsError);
      return apiError("Nao foi possivel carregar os departamentos dos colaboradores.", 500);
    }

    if (jobPositionsError) {
      logBaseCadastroError("employees.job_positions_lookup_failed", jobPositionsError);
      return apiError("Nao foi possivel carregar os cargos dos colaboradores.", 500);
    }

    const unitsById = new Map((units ?? []).map((unit) => [unit.id, unit]));
    const departmentsById = new Map((departments ?? []).map((department) => [department.id, department]));
    const jobPositionsById = new Map((jobPositions ?? []).map((position) => [position.id, position]));

    return NextResponse.json({
      ok: true,
      employees: (employees ?? []).map((employee) => {
        const unit = employee.unit_id ? unitsById.get(employee.unit_id) : null;
        const department = employee.department_id ? departmentsById.get(employee.department_id) : null;
        const jobPosition = employee.job_position_id ? jobPositionsById.get(employee.job_position_id) : null;

        return {
          id: employee.id,
          organizationId: employee.organization_id,
          unitId: employee.unit_id,
          unitName: unit?.name ?? "",
          unitCode: unit?.code ?? "",
          departmentId: employee.department_id,
          departmentName: department?.name ?? "",
          departmentCode: department?.code ?? "",
          jobPositionId: employee.job_position_id,
          jobPositionName: jobPosition?.name ?? "",
          jobPositionCode: jobPosition?.code ?? "",
          fullName: employee.full_name,
          preferredName: employee.preferred_name ?? "",
          documentNumber: employee.document_number ?? "",
          corporateEmail: employee.corporate_email ?? "",
          personalEmail: employee.personal_email ?? "",
          phone: employee.phone ?? "",
          hireDate: employee.hire_date ?? "",
          terminationDate: employee.termination_date ?? "",
          status: employee.status,
          createdAt: employee.created_at
        };
      })
    });
  } catch {
    return apiError("Nao foi possivel carregar os colaboradores.", 500);
  }
}

export async function POST(request: Request) {
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
      .insert({
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
        created_by: session.user.id,
        updated_by: session.user.id
      })
      .select("id")
      .single();

    if (error) {
      logBaseCadastroError("employee.create_failed", error);
      return apiError("Nao foi possivel salvar o colaborador.", 500);
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

    return apiError(error instanceof Error ? error.message : "Nao foi possivel salvar o colaborador.", 500);
  }
}

