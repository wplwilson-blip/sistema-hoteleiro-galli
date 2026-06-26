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

export async function GET() {
  const { context, response } = await requirePermission(BASE_PERMISSIONS.employeesView, { scope: "active-unit" });

  if (response || !context) {
    return response;
  }

  try {
    if (!context.isSuperAdmin && !context.accessibleUnitIds.length) {
      return NextResponse.json({ ok: true, employees: [] });
    }

    let employeesQuery = context.supabase
      .from("employees")
      .select(
        "id, organization_id, unit_id, department_id, job_position_id, full_name, preferred_name, document_number, corporate_email, personal_email, phone, hire_date, termination_date, status, created_at"
      )
      .is("deleted_at", null)
      .order("full_name", { ascending: true });

    // active-unit: accessibleUnitIds ja vem estreitado (inclui super admin = [unidade ativa]).
    employeesQuery = employeesQuery.in("unit_id", context.accessibleUnitIds);

    const { data: employees, error: employeesError } = await employeesQuery;

    if (employeesError) {
      logBaseCadastroError("employees.list_failed", employeesError);
      return apiError("Nao foi possivel carregar os colaboradores.", 500);
    }

    const unitIds = Array.from(new Set((employees ?? []).map((employee) => employee.unit_id).filter(Boolean)));
    const departmentIds = Array.from(new Set((employees ?? []).map((employee) => employee.department_id).filter(Boolean)));
    const jobPositionIds = Array.from(new Set((employees ?? []).map((employee) => employee.job_position_id).filter(Boolean)));

    const { data: units, error: unitsError } = unitIds.length
      ? await context.supabase.from("units").select("id, code, name").in("id", unitIds)
      : { data: [], error: null };
    const { data: departments, error: departmentsError } = departmentIds.length
      ? await context.supabase.from("departments").select("id, code, name").in("id", departmentIds)
      : { data: [], error: null };
    const { data: jobPositions, error: jobPositionsError } = jobPositionIds.length
      ? await context.supabase.from("job_positions").select("id, code, name").in("id", jobPositionIds)
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
  const { context, response } = await requirePermission(BASE_PERMISSIONS.employeesManage);

  if (response || !context) {
    return response;
  }

  try {
    if (!context.isSuperAdmin) {
      return apiError("Voce nao tem permissao para criar colaboradores.", 403);
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
        created_by: context.session.user.id,
        updated_by: context.session.user.id
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505" && error.message?.includes("employees_org_cpf_normalized_active_unique")) {
        return apiError("Ja existe um colaborador com este CPF nesta organizacao.", 409);
      }

      logBaseCadastroError("employee.create_failed", error);
      return apiError("Nao foi possivel salvar o colaborador.", 500);
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

    return apiError(error instanceof Error ? error.message : "Nao foi possivel salvar o colaborador.", 500);
  }
}

