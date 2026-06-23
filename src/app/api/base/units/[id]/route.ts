import { NextResponse } from "next/server";
import { z } from "zod";
import { assertUnitInPermissionScope, BASE_PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { unitPayloadSchema } from "@/lib/base-cadastros/schemas";
import { apiError, logBaseCadastroError } from "@/lib/base-cadastros/api-helpers";

const unitSettingsKey = "setup.initial";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const { context, response } = await requirePermission(BASE_PERMISSIONS.unitsManage);

  if (response || !context) {
    return response;
  }

  try {
    const payload = unitPayloadSchema.parse(await request.json());
    assertUnitInPermissionScope(context, params.id);

    const { error: unitError } = await context.supabase
      .from("units")
      .update({
        code: payload.code,
        name: payload.name,
        legal_name: payload.name,
        status: payload.status,
        updated_by: context.session.user.id
      })
      .eq("id", params.id)
      .is("deleted_at", null);

    if (unitError) {
      logBaseCadastroError("unit.update_failed", unitError);
      return apiError("Nao foi possivel atualizar a unidade.", 500);
    }

    const { error: settingsError } = await context.supabase.from("unit_settings").upsert(
      {
        unit_id: params.id,
        key: unitSettingsKey,
        value: {
          city: payload.city,
          state: payload.state
        },
        status: "active",
        updated_by: context.session.user.id
      },
      { onConflict: "unit_id,key", ignoreDuplicates: false }
    );

    if (settingsError) {
      logBaseCadastroError("unit.settings_update_failed", settingsError);
      return apiError("Unidade atualizada, mas nao foi possivel registrar cidade e estado.", 500);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    }

    if (error instanceof Error && error.name === "PermissionAuthorizationError") {
      return apiError(error.message, 404);
    }

    return apiError("Nao foi possivel atualizar a unidade.", 500);
  }
}

