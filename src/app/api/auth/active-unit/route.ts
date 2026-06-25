import { NextResponse } from "next/server";
import { z } from "zod";
import { appUserHasSuperAdminLink, getCurrentSessionContext } from "@/lib/auth/session";
import { setActiveUnitCookie } from "@/lib/auth/active-unit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({
  unitId: z.string().uuid("Unidade invalida.")
});

function errorResponse(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

export async function POST(request: Request) {
  // Apenas LE a autenticacao (nao toca login/auth.getUser/auth_email).
  const session = await getCurrentSessionContext();

  if (!session) {
    return errorResponse("Sessao expirada. Entre novamente.", 401);
  }

  let unitId: string;

  try {
    unitId = bodySchema.parse(await request.json()).unitId;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(error.errors[0]?.message ?? "Dados invalidos.", 422);
    }
    return errorResponse("Dados invalidos.", 422);
  }

  const supabase = createSupabaseAdminClient();

  // Validacao do vinculo: o usuario tem vinculo ATIVO (perfil ativo) nesta unidade?
  const { data: link, error: linkError } = await supabase
    .from("user_unit_links")
    .select("id, access_profiles!inner(status, deleted_at)")
    .eq("app_user_id", session.user.id)
    .eq("unit_id", unitId)
    .eq("status", "active")
    .is("deleted_at", null)
    .eq("access_profiles.status", "active")
    .is("access_profiles.deleted_at", null)
    .limit(1);

  if (linkError) {
    return errorResponse("Nao foi possivel validar a unidade.", 500);
  }

  let allowed = Boolean(link?.length);

  // Super admin: pode escolher qualquer unidade ATIVA, mesmo sem vinculo direto.
  if (!allowed && (await appUserHasSuperAdminLink(supabase, session.user.id))) {
    const { data: unit, error: unitError } = await supabase
      .from("units")
      .select("id")
      .eq("id", unitId)
      .eq("status", "active")
      .is("deleted_at", null)
      .limit(1);

    if (unitError) {
      return errorResponse("Nao foi possivel validar a unidade.", 500);
    }

    allowed = Boolean(unit?.length);
  }

  if (!allowed) {
    // Sem vinculo (e nao super) -> nao grava cookie.
    return errorResponse("Voce nao tem acesso a esta unidade.", 403);
  }

  // Grava o cookie e recalcula o SessionContext (activeUnit + profile da nova unidade).
  setActiveUnitCookie(unitId);
  const updated = await getCurrentSessionContext();

  if (!updated) {
    return errorResponse("Nao foi possivel atualizar a unidade ativa.", 500);
  }

  return NextResponse.json({ ok: true, user: updated });
}
