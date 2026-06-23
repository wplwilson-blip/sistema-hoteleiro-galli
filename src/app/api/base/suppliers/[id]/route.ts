import { NextResponse } from "next/server";
import { z } from "zod";
import { assertUnitInPermissionScope, BASE_PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { supplierPayloadSchema } from "@/lib/base-cadastros/schemas";
import { apiError, getInitialOrganizationId, getUnitOrganizationId, logBaseCadastroError } from "@/lib/base-cadastros/api-helpers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type SupplierRow = {
  id: string;
  organization_id: string;
  unit_id: string | null;
  name: string;
  trade_name: string | null;
  document_type: string;
  document_number: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  contact_name: string | null;
  address_json: unknown;
  bank_data_json: unknown;
  category: string | null;
  notes: string | null;
  status: "active" | "inactive" | "archived";
  created_at: string;
  updated_at: string;
};

type UnitRow = {
  id: string;
  code: string;
  name: string;
};

function normalizeDocumentNumber(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  return value.replace(/\D/g, "");
}

function mapSupplier(row: SupplierRow, unit?: UnitRow | null) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    unitId: row.unit_id ?? "",
    unitCode: unit?.code ?? "",
    unitName: unit?.name ?? "",
    name: row.name,
    tradeName: row.trade_name ?? "",
    documentType: row.document_type,
    documentNumber: row.document_number ?? "",
    email: row.email ?? "",
    phone: row.phone ?? "",
    whatsapp: row.whatsapp ?? "",
    contactName: row.contact_name ?? "",
    addressJson: row.address_json,
    bankDataJson: row.bank_data_json,
    category: row.category ?? "",
    notes: row.notes ?? "",
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function serializeSupplier(row: SupplierRow) {
  return {
    id: row.id,
    name: row.name,
    trade_name: row.trade_name ?? "",
    document_type: row.document_type,
    document_number: row.document_number ?? "",
    email: row.email ?? "",
    phone: row.phone ?? "",
    whatsapp: row.whatsapp ?? "",
    contact_name: row.contact_name ?? "",
    category: row.category ?? "",
    status: row.status,
    unit_id: row.unit_id ?? ""
  };
}

function assertCanAccessSupplier(context: NonNullable<Awaited<ReturnType<typeof requirePermission>>["context"]>, unitId: string | null) {
  if (!unitId) {
    if (!context.isSuperAdmin) {
      throw new Error("Fornecedor nao encontrado.");
    }
    return;
  }

  assertUnitInPermissionScope(context, unitId);
}

async function validateDuplicateDocument(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  organizationId: string,
  documentType: string,
  documentNumber: string | undefined,
  currentSupplierId: string
) {
  const normalizedDocument = normalizeDocumentNumber(documentNumber);

  if (!normalizedDocument) {
    return;
  }

  const { data, error } = await supabase
    .from("suppliers")
    .select(
      "id, organization_id, unit_id, name, trade_name, document_type, document_number, email, phone, whatsapp, contact_name, address_json, bank_data_json, category, notes, status, created_at, updated_at"
    )
    .eq("organization_id", organizationId)
    .eq("document_type", documentType)
    .is("deleted_at", null);

  if (error) {
    logBaseCadastroError("suppliers.document_lookup_failed", error);
    throw new Error("Nao foi possivel validar o documento do fornecedor.");
  }

  return ((data ?? []) as SupplierRow[]).find((supplier) => {
    if (supplier.id === currentSupplierId) {
      return false;
    }

    return normalizeDocumentNumber(supplier.document_number) === normalizedDocument;
  });
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const { context, response } = await requirePermission(BASE_PERMISSIONS.suppliersView);

  if (response || !context) {
    return response;
  }

  try {
    const supabase = context.supabase;
    const organizationId = await getInitialOrganizationId(supabase);

    const { data: supplier, error: supplierError } = await supabase
      .from("suppliers")
      .select(
        "id, organization_id, unit_id, name, trade_name, document_type, document_number, email, phone, whatsapp, contact_name, address_json, bank_data_json, category, notes, status, created_at, updated_at"
      )
      .eq("id", params.id)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .limit(1);

    if (supplierError) {
      logBaseCadastroError("suppliers.detail_failed", supplierError);
      return apiError("Nao foi possivel carregar o fornecedor.", 500);
    }

    const currentSupplier = supplier?.[0] as SupplierRow | undefined;

    if (!currentSupplier) {
      return apiError("Fornecedor nao encontrado.", 404);
    }

    try {
      assertCanAccessSupplier(context, currentSupplier.unit_id);
    } catch {
      return apiError("Fornecedor nao encontrado.", 404);
    }

    const { data: unit, error: unitError } = currentSupplier.unit_id
      ? await supabase.from("units").select("id, code, name").eq("id", currentSupplier.unit_id).limit(1)
      : { data: [], error: null };

    if (unitError) {
      logBaseCadastroError("suppliers.detail_unit_failed", unitError);
      return apiError("Nao foi possivel carregar a unidade do fornecedor.", 500);
    }

    return NextResponse.json({
      ok: true,
      supplier: mapSupplier(currentSupplier, unit?.[0] ?? null)
    });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Nao foi possivel carregar o fornecedor.", 500);
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const { context, response } = await requirePermission(BASE_PERMISSIONS.suppliersManage);

  if (response || !context) {
    return response;
  }

  try {
    const payload = supplierPayloadSchema.parse(await request.json());
    const supabase = context.supabase;

    if (payload.unitId) {
      assertUnitInPermissionScope(context, payload.unitId);
    } else if (!context.isSuperAdmin) {
      return apiError("Nao e possivel mover fornecedor para cadastro global sem permissao de super admin.", 403);
    }

    const { data: currentSupplier, error: currentSupplierError } = await supabase
      .from("suppliers")
      .select("id, organization_id, unit_id, address_json, bank_data_json")
      .eq("id", params.id)
      .is("deleted_at", null)
      .limit(1);

    if (currentSupplierError) {
      logBaseCadastroError("suppliers.update_detail_lookup_failed", currentSupplierError);
      return apiError("Nao foi possivel carregar o fornecedor.", 500);
    }

    const existingSupplier = currentSupplier?.[0] as Pick<SupplierRow, "id" | "organization_id" | "unit_id" | "address_json" | "bank_data_json"> | undefined;

    if (!existingSupplier) {
      return apiError("Fornecedor nao encontrado.", 404);
    }

    try {
      assertCanAccessSupplier(context, existingSupplier.unit_id);
    } catch {
      return apiError("Fornecedor nao encontrado.", 404);
    }

    const organizationId = payload.unitId ? await getUnitOrganizationId(supabase, payload.unitId) : existingSupplier.organization_id;
    const duplicateSupplier = await validateDuplicateDocument(supabase, organizationId, payload.documentType, payload.documentNumber, params.id);

    if (duplicateSupplier) {
      return NextResponse.json(
        {
          ok: false,
          message: "Ja existe um fornecedor cadastrado com este CNPJ/CPF.",
          supplier: serializeSupplier(duplicateSupplier)
        },
        { status: 409 }
      );
    }

    const { data: updatedSupplier, error } = await supabase
      .from("suppliers")
      .update({
        organization_id: organizationId,
        unit_id: payload.unitId ?? null,
        name: payload.name,
        trade_name: payload.tradeName ?? null,
        document_type: payload.documentType,
        document_number: normalizeDocumentNumber(payload.documentNumber) || null,
        email: payload.email ?? null,
        phone: payload.phone ?? null,
        whatsapp: payload.whatsapp ?? null,
        contact_name: payload.contactName ?? null,
        address_json: existingSupplier?.address_json ?? null,
        bank_data_json: existingSupplier?.bank_data_json ?? null,
        category: payload.category ?? null,
        notes: payload.notes ?? null,
        status: payload.status,
        updated_by: context.session.user.id
      })
      .eq("id", params.id)
      .is("deleted_at", null)
      .select(
        "id, organization_id, unit_id, name, trade_name, document_type, document_number, email, phone, whatsapp, contact_name, address_json, bank_data_json, category, notes, status, created_at, updated_at"
      )
      .single();

    if (error) {
      logBaseCadastroError("suppliers.update_failed", error);
      if (error.code === "23505") {
        return apiError("Ja existe um fornecedor cadastrado com este CNPJ/CPF.", 409);
      }
      return apiError("Nao foi possivel atualizar o fornecedor.", 500);
    }

    return NextResponse.json({ ok: true, supplier: serializeSupplier(updatedSupplier as SupplierRow) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    }

    return apiError(error instanceof Error ? error.message : "Nao foi possivel atualizar o fornecedor.", 500);
  }
}
