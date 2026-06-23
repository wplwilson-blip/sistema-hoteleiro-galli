import { NextResponse } from "next/server";
import { z } from "zod";
import { BASE_PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { unitPayloadSchema } from "@/lib/base-cadastros/schemas";
import {
  apiError,
  getInitialOrganizationId,
  logBaseCadastroError
} from "@/lib/base-cadastros/api-helpers";

const unitSettingsKey = "setup.initial";

export async function GET() {
  const { context, response } = await requirePermission(BASE_PERMISSIONS.unitsView);

  if (response || !context) {
    return response;
  }

  try {
    if (!context.isSuperAdmin && !context.accessibleUnitIds.length) {
      return NextResponse.json({ ok: true, units: [] });
    }

    let unitsQuery = context.supabase
      .from("units")
      .select("id, organization_id, code, name, status, created_at")
      .is("deleted_at", null)
      .order("name", { ascending: true });

    if (!context.isSuperAdmin) {
      unitsQuery = unitsQuery.in("id", context.accessibleUnitIds);
    }

    const { data: units, error: unitsError } = await unitsQuery;

    if (unitsError) {
      logBaseCadastroError("units.list_failed", unitsError);
      return apiError("Nao foi possivel carregar as unidades.", 500);
    }

    const unitIds = units?.map((unit) => unit.id) ?? [];
    const { data: settings, error: settingsError } = unitIds.length
      ? await context.supabase.from("unit_settings").select("unit_id, value").in("unit_id", unitIds).eq("key", unitSettingsKey).is("deleted_at", null)
      : { data: [], error: null };

    if (settingsError) {
      logBaseCadastroError("units.settings_list_failed", settingsError);
      return apiError("Nao foi possivel carregar as configuracoes das unidades.", 500);
    }

    const settingsByUnit = new Map((settings ?? []).map((setting) => [setting.unit_id, setting.value as Record<string, unknown>]));

    return NextResponse.json({
      ok: true,
      units: (units ?? []).map((unit) => {
        const value = settingsByUnit.get(unit.id) ?? {};

        return {
          id: unit.id,
          organizationId: unit.organization_id,
          code: unit.code,
          name: unit.name,
          city: typeof value.city === "string" ? value.city : "",
          state: typeof value.state === "string" ? value.state : "",
          status: unit.status,
          createdAt: unit.created_at
        };
      })
    });
  } catch {
    return apiError("Nao foi possivel carregar as unidades.", 500);
  }
}

export async function POST(request: Request) {
  const { context, response } = await requirePermission(BASE_PERMISSIONS.unitsManage);

  if (response || !context) {
    return response;
  }

  try {
    if (!context.isSuperAdmin) {
      return apiError("Voce nao tem permissao para criar unidades.", 403);
    }

    const payload = unitPayloadSchema.parse(await request.json());
    const organizationId = await getInitialOrganizationId(context.supabase);

    const { data: units, error: unitError } = await context.supabase
      .from("units")
      .upsert(
        {
          organization_id: organizationId,
          code: payload.code,
          name: payload.name,
          legal_name: payload.name,
          timezone: "America/Sao_Paulo",
          status: payload.status,
          updated_by: context.session.user.id,
          deleted_at: null,
          deleted_by: null
        },
        { onConflict: "organization_id,code", ignoreDuplicates: false }
      )
      .select("id")
      .limit(1);

    if (unitError || !units?.[0]) {
      if (unitError) {
        logBaseCadastroError("unit.upsert_failed", unitError);
      }

      return apiError("Nao foi possivel salvar a unidade.", 500);
    }

    const { error: settingsError } = await context.supabase.from("unit_settings").upsert(
      {
        unit_id: units[0].id,
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
      logBaseCadastroError("unit.settings_upsert_failed", settingsError);
      return apiError("Unidade salva, mas nao foi possivel registrar cidade e estado.", 500);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    }

    return apiError(error instanceof Error ? error.message : "Nao foi possivel salvar a unidade.", 500);
  }
}

