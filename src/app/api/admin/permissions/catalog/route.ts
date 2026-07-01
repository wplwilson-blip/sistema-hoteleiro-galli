import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/permissions";
import { apiError, logBaseCadastroError } from "@/lib/base-cadastros/api-helpers";

// Fase 3-A: catalogo de permissoes (READ-ONLY). Gate: ADMIN:permissions.view.
export async function GET() {
  const { context, response } = await requirePermission("ADMIN:permissions.view");

  if (response || !context) {
    return response;
  }

  try {
    const { data, error } = await context.supabase
      .from("permissions")
      .select("id, code, module_code, action_code, name, description")
      .eq("status", "active")
      .is("deleted_at", null)
      .order("module_code", { ascending: true })
      .order("action_code", { ascending: true });

    if (error) {
      logBaseCadastroError("admin_permissions.catalog_failed", error);
      return apiError("Nao foi possivel carregar o catalogo de permissoes.", 500);
    }

    return NextResponse.json({
      ok: true,
      permissions: (data ?? []).map((permission) => ({
        id: permission.id,
        code: permission.code,
        moduleCode: permission.module_code,
        actionCode: permission.action_code,
        name: permission.name,
        description: permission.description ?? ""
      }))
    });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Nao foi possivel carregar o catalogo de permissoes.", 500);
  }
}
