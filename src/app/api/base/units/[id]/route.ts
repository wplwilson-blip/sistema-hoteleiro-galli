import { NextResponse } from "next/server";
import { z } from "zod";
import { unitPayloadSchema } from "@/lib/base-cadastros/schemas";
import { apiError, logBaseCadastroError, requireAuthenticatedRequest } from "@/lib/base-cadastros/api-helpers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const unitSettingsKey = "setup.initial";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const { session, response } = await requireAuthenticatedRequest();

  if (response || !session) {
    return response;
  }

  try {
    const payload = unitPayloadSchema.parse(await request.json());
    const supabase = createSupabaseAdminClient();

    const { error: unitError } = await supabase
      .from("units")
      .update({
        code: payload.code,
        name: payload.name,
        legal_name: payload.name,
        status: payload.status,
        updated_by: session.user.id
      })
      .eq("id", params.id)
      .is("deleted_at", null);

    if (unitError) {
      logBaseCadastroError("unit.update_failed", unitError);
      return apiError("Nao foi possivel atualizar a unidade.", 500);
    }

    const { error: settingsError } = await supabase.from("unit_settings").upsert(
      {
        unit_id: params.id,
        key: unitSettingsKey,
        value: {
          city: payload.city,
          state: payload.state
        },
        status: "active",
        updated_by: session.user.id
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

    return apiError("Nao foi possivel atualizar a unidade.", 500);
  }
}

