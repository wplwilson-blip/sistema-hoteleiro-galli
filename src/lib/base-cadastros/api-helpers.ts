import { NextResponse } from "next/server";
import { getCurrentSessionContext, SUPER_ADMIN_PROFILE_CODE } from "@/lib/auth/session";
import { isPasswordChangeRequired, PASSWORD_CHANGE_REQUIRED_MESSAGE } from "@/lib/auth/password-guard";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type SupabaseAdmin = ReturnType<typeof createSupabaseAdminClient>;

export function apiError(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

export function logBaseCadastroError(stage: string, error: { name?: string; message?: string; code?: string }) {
  console.error(`[base_cadastros.${stage}]`, {
    name: error.name ?? "PostgrestError",
    message: error.message ?? "unknown",
    code: error.code
  });
}

export async function requireAuthenticatedRequest() {
  const session = await getCurrentSessionContext();

  if (!session) {
    return { session: null, response: apiError("Sessao expirada. Entre novamente.", 401) };
  }

  // #5: senha temporaria (definida por admin) ainda nao trocada -> nenhuma rota de negocio
  // responde. Este e' o afunil por onde passam 128 das 136 rotas da API: requirePermission
  // (direto), requireHrPermission (via requirePermission) e requireHrWorkflowPermission.
  //
  // A rota POST /api/auth/change-password NAO passa por aqui DE PROPOSITO -- ela usa
  // getCurrentSessionContext direto. E' a saida: trava-la deixaria o usuario sem como
  // destravar. O mesmo vale para logout, login e as rotas de cron (ver docs/codex/67, §4).
  //
  // `session: null` no retorno, mesmo shape do 401 acima: todos os chamadores tratam
  // `response || !session` como "pare aqui". Devolver a sessao junto abriria a chance de
  // alguem usar o contexto ignorando o response.
  if (isPasswordChangeRequired(session)) {
    return { session: null, response: apiError(PASSWORD_CHANGE_REQUIRED_MESSAGE, 403) };
  }

  // TODO Sprint 4C: aplicar matriz granular de permissoes por modulo, unidade e acao.
  return { session, response: null };
}

export async function requireSuperAdminRequest() {
  const { session, response } = await requireAuthenticatedRequest();

  if (response || !session) {
    return { session, response };
  }

  if (session.profile.code !== SUPER_ADMIN_PROFILE_CODE) {
    return { session, response: apiError("Você não tem permissão para gerenciar usuários internos.", 403) };
  }

  return { session, response: null };
}

export async function getInitialOrganizationId(supabase: SupabaseAdmin) {
  const { data, error } = await supabase
    .from("organizations")
    .select("id")
    .eq("status", "active")
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) {
    logBaseCadastroError("organization.lookup_failed", error);
    throw new Error("Nao foi possivel localizar a organizacao inicial.");
  }

  const organization = data?.[0];

  if (!organization) {
    throw new Error("Organizacao inicial nao encontrada. Conclua o setup inicial antes de cadastrar unidades.");
  }

  return organization.id as string;
}

export async function getUnitOrganizationId(supabase: SupabaseAdmin, unitId: string) {
  const { data, error } = await supabase.from("units").select("organization_id").eq("id", unitId).is("deleted_at", null).limit(1);

  if (error) {
    logBaseCadastroError("unit.organization_lookup_failed", error);
    throw new Error("Nao foi possivel localizar a unidade informada.");
  }

  const unit = data?.[0];

  if (!unit) {
    throw new Error("Unidade nao encontrada.");
  }

  return unit.organization_id as string;
}
