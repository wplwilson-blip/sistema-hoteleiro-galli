import "server-only";

import type { SessionContext } from "@/lib/auth/types";
import { resolveOverrideAccess } from "@/lib/auth/override-precedence";
import { NETWORK_MANAGER_PROFILE_CODE, SUPER_ADMIN_PROFILE_CODE } from "@/lib/auth/session";
import { apiError, logBaseCadastroError, requireAuthenticatedRequest, type SupabaseAdmin } from "@/lib/base-cadastros/api-helpers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type PermissionRequestContext<TPermissionCode extends string = string> = {
  session: SessionContext;
  supabase: SupabaseAdmin;
  requiredPermission: TPermissionCode;
  accessibleUnitIds: string[];
  isSuperAdmin: boolean;
  hasPermissionInScope: boolean;
};

export const BASE_PERMISSIONS = {
  unitsView: "BASE:units.view",
  unitsManage: "BASE:units.manage",
  departmentsView: "BASE:departments.view",
  departmentsManage: "BASE:departments.manage",
  jobPositionsView: "BASE:job_positions.view",
  jobPositionsManage: "BASE:job_positions.manage",
  employeesView: "BASE:employees.view",
  employeesManage: "BASE:employees.manage",
  suppliersView: "BASE:suppliers.view",
  suppliersManage: "BASE:suppliers.manage",
  usersView: "BASE:users.view",
  usersManage: "BASE:users.manage",
  // Apartamentos (UHs) — semeadas na migration 088. `roomsView` e' a unica consumida na
  // Fase 1 (lista read-only); as outras duas ja' ficam definidas para as fases seguintes.
  roomsView: "BASE:rooms.view",
  roomsBlock: "BASE:rooms.block",
  roomsManage: "BASE:rooms.manage"
} as const;

export const PURCHASES_PERMISSIONS = {
  requestsView: "PURCHASES:requests.view",
  requestsManage: "PURCHASES:requests.manage",
  quotesView: "PURCHASES:quotes.view",
  quotesManage: "PURCHASES:quotes.manage",
  approvalsView: "PURCHASES:approvals.view",
  approvalsSubmit: "PURCHASES:approvals.submit",
  approvalsDecide: "PURCHASES:approvals.decide",
  approvalsDecideAdministrative: "PURCHASES:approvals.decide.administrative",
  approvalsDecideDirectorate: "PURCHASES:approvals.decide.directorate",
  documentationView: "PURCHASES:documentation.view"
} as const;

export const ATTACHMENTS_PERMISSIONS = {
  purchasesView: "ATTACHMENTS:purchases.view",
  purchasesManage: "ATTACHMENTS:purchases.manage"
} as const;

export type PermissionAccessResult = {
  isSuperAdmin: boolean;
  accessibleUnitIds: string[];
  hasPermission: boolean;
  hasPermissionInScope: boolean;
};

export type PermissionAuthorizationOptions = {
  validationErrorMessage?: string;
  unitValidationErrorMessage?: string;
  forbiddenMessage?: string;
  notFoundMessage?: string;
  logError?: (stage: string, error: { name?: string; message?: string; code?: string }) => void;
  // Leva 2 (B-misto): "aggregate" (padrao) = UNIAO de unidades acessiveis;
  // "active-unit" = UNIAO ∩ [unidade ativa]. So afeta o conjunto retornado (leitura);
  // hasPermission continua calculado sobre a UNIAO (gateia o 403).
  scope?: "aggregate" | "active-unit";
};

export class PermissionAuthorizationError extends Error {
  status: number;

  constructor(message: string, status = 403) {
    super(message);
    this.name = "PermissionAuthorizationError";
    this.status = status;
  }
}

const defaultValidationErrorMessage = "Nao foi possivel validar as permissoes.";
const defaultUnitValidationErrorMessage = "Nao foi possivel validar as unidades permitidas.";
const defaultForbiddenMessage = "Voce nao tem permissao para acessar este recurso.";
const defaultNotFoundMessage = "Recurso nao encontrado.";

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter(Boolean))) as string[];
}

function logPermissionError(
  options: PermissionAuthorizationOptions | undefined,
  stage: string,
  error: { name?: string; message?: string; code?: string }
) {
  if (options?.logError) {
    options.logError(stage, error);
    return;
  }

  logBaseCadastroError(`permissions.${stage}`, error);
}

// ===========================================================================================
// Memoizacao por-request das folhas INVARIANTES do resolver (achado #9 / plano 53, Fatia A).
//
// Tres leituras nao dependem do CODE de permissao — so' do usuario, ou de nada:
// super-admin-por-perfil, links ativos e lista de unidades ativas. Num GET de detalhe de
// colaborador o resolver roda 18x com codes diferentes, repetindo essas leituras 18x.
//
// ESCOPO DO CACHE — a parte que importa para seguranca:
// a chave e' a IDENTIDADE do objeto SessionContext, num WeakMap. Nao ha chave enumeravel
// (nada de userId): para ler uma entrada e' preciso ja possuir aquele objeto exato.
// getCurrentSessionContext monta um SessionContext NOVO a cada request, entao dois requests
// — mesmo do mesmo usuario — tem objetos distintos e entradas distintas. Um request nunca
// alcanca o cache de outro. Sendo WeakMap, a entrada e' coletada quando o request termina:
// sem TTL, sem rotina de expiracao e, portanto, sem bug de expiracao.
//
// Descartados: `unstable_cache` (persiste entre requests — seria o vazamento), Map global
// por userId (sobrevive ao request e mantem permissao ja revogada) e `cache()` do React
// (nao exportado na resolucao padrao do react 18.3.1 deste projeto).
//
// As folhas que variam com o code (getPermissionId, getProfileAllowedIds,
// applyUserPermissionOverrides) NAO entram aqui — e' a Fatia B (batch).
// ===========================================================================================

type PermissionLeafError = { name?: string; message?: string; code?: string };

// Resultado discriminado: o fetcher memoizado NAO loga e NAO lanca. Quem tem `options`
// aplica a politica de erro, preservando mensagem e prefixo de log de cada modulo (HR e BASE
// podem coexistir no mesmo request com mensagens diferentes). Alem disso, o cache guarda
// valores — nunca uma promise rejeitada.
type PermissionLeafResult<T> = { ok: true; value: T } | { ok: false; error: PermissionLeafError };

type UserUnitLinkRow = Awaited<ReturnType<typeof fetchActiveUserUnitLinks>> extends PermissionLeafResult<infer T>
  ? T
  : never;

type SessionLeafCache = {
  superAdminProfile?: Promise<PermissionLeafResult<boolean>>;
  activeUnitLinks?: Promise<PermissionLeafResult<UserUnitLinkRow>>;
  allActiveUnitIds?: Promise<PermissionLeafResult<string[]>>;
};

const sessionLeafCache = new WeakMap<SessionContext, SessionLeafCache>();

function getSessionLeafCache(session: SessionContext): SessionLeafCache {
  const existing = sessionLeafCache.get(session);

  if (existing) {
    return existing;
  }

  const created: SessionLeafCache = {};
  sessionLeafCache.set(session, created);
  return created;
}

// So' SUCESSO fica cacheado: uma falha transitoria nao pode contaminar as 18 resolucoes do
// request, e a proxima chamada volta a consultar — semantica identica a de hoje.
async function memoizeSessionLeaf<K extends keyof SessionLeafCache>(
  cache: SessionLeafCache,
  key: K,
  fetcher: () => NonNullable<SessionLeafCache[K]>
): Promise<Awaited<NonNullable<SessionLeafCache[K]>>> {
  const cached = cache[key];

  if (cached) {
    return (await cached) as Awaited<NonNullable<SessionLeafCache[K]>>;
  }

  const pending = fetcher();
  cache[key] = pending;

  const result = (await pending) as Awaited<NonNullable<SessionLeafCache[K]>>;

  if (!result.ok) {
    delete cache[key];
  }

  return result;
}

async function fetchActiveSuperAdminProfile(
  supabase: SupabaseAdmin,
  userId: string
): Promise<PermissionLeafResult<boolean>> {
  const { data, error } = await supabase
    .from("user_unit_links")
    .select("id, access_profiles!inner(code)")
    .eq("app_user_id", userId)
    .eq("status", "active")
    .is("deleted_at", null)
    .eq("access_profiles.code", SUPER_ADMIN_PROFILE_CODE)
    .eq("access_profiles.status", "active")
    .is("access_profiles.deleted_at", null)
    .limit(1);

  if (error) {
    return { ok: false, error };
  }

  return { ok: true, value: Boolean(data?.length) };
}

async function userHasActiveSuperAdminProfile(
  supabase: SupabaseAdmin,
  session: SessionContext,
  options?: PermissionAuthorizationOptions
) {
  const result = await memoizeSessionLeaf(getSessionLeafCache(session), "superAdminProfile", () =>
    fetchActiveSuperAdminProfile(supabase, session.user.id)
  );

  if (!result.ok) {
    logPermissionError(options, "super_admin_profile_lookup_failed", result.error);
    throw new PermissionAuthorizationError(options?.validationErrorMessage ?? defaultValidationErrorMessage, 500);
  }

  return result.value;
}

async function fetchAllActiveUnitIds(supabase: SupabaseAdmin): Promise<PermissionLeafResult<string[]>> {
  const { data, error } = await supabase.from("units").select("id").eq("status", "active").is("deleted_at", null);

  if (error) {
    return { ok: false, error };
  }

  return { ok: true, value: unique((data ?? []).map((unit) => unit.id)) };
}

async function getAllActiveUnitIds(
  supabase: SupabaseAdmin,
  session: SessionContext,
  options?: PermissionAuthorizationOptions
) {
  const result = await memoizeSessionLeaf(getSessionLeafCache(session), "allActiveUnitIds", () =>
    fetchAllActiveUnitIds(supabase)
  );

  if (!result.ok) {
    logPermissionError(options, "units_list_failed", result.error);
    throw new PermissionAuthorizationError(options?.unitValidationErrorMessage ?? defaultUnitValidationErrorMessage, 500);
  }

  return result.value;
}

async function getPermissionId(
  supabase: SupabaseAdmin,
  permissionCode: string,
  options?: PermissionAuthorizationOptions
) {
  const { data, error } = await supabase
    .from("permissions")
    .select("id")
    .eq("code", permissionCode)
    .eq("status", "active")
    .is("deleted_at", null)
    .limit(1);

  if (error) {
    logPermissionError(options, "permission_lookup_failed", error);
    throw new PermissionAuthorizationError(options?.validationErrorMessage ?? defaultValidationErrorMessage, 500);
  }

  return data?.[0]?.id as string | undefined;
}

async function fetchActiveUserUnitLinks(supabase: SupabaseAdmin, userId: string) {
  const { data, error } = await supabase
    .from("user_unit_links")
    .select("unit_id, access_profile_id, units!inner(id, status), access_profiles!inner(id, status, code)")
    .eq("app_user_id", userId)
    .eq("status", "active")
    .is("deleted_at", null)
    .eq("units.status", "active")
    .is("units.deleted_at", null)
    .eq("access_profiles.status", "active")
    .is("access_profiles.deleted_at", null);

  if (error) {
    return { ok: false as const, error };
  }

  return { ok: true as const, value: data ?? [] };
}

async function getActiveUserUnitLinks(
  supabase: SupabaseAdmin,
  session: SessionContext,
  options?: PermissionAuthorizationOptions
) {
  const result = await memoizeSessionLeaf(getSessionLeafCache(session), "activeUnitLinks", () =>
    fetchActiveUserUnitLinks(supabase, session.user.id)
  );

  if (!result.ok) {
    logPermissionError(options, "user_unit_links_lookup_failed", result.error);
    throw new PermissionAuthorizationError(options?.unitValidationErrorMessage ?? defaultUnitValidationErrorMessage, 500);
  }

  return result.value;
}

async function getProfileAllowedIds(
  supabase: SupabaseAdmin,
  profileIds: string[],
  permissionId: string,
  options?: PermissionAuthorizationOptions
) {
  if (!profileIds.length) {
    return new Set<string>();
  }

  const { data, error } = await supabase
    .from("profile_permissions")
    .select("access_profile_id")
    .in("access_profile_id", profileIds)
    .eq("permission_id", permissionId)
    .eq("is_allowed", true)
    .eq("status", "active")
    .is("deleted_at", null);

  if (error) {
    logPermissionError(options, "profile_permissions_lookup_failed", error);
    throw new PermissionAuthorizationError(options?.validationErrorMessage ?? defaultValidationErrorMessage, 500);
  }

  return new Set(unique((data ?? []).map((permission) => permission.access_profile_id)));
}

async function applyUserPermissionOverrides(input: {
  supabase: SupabaseAdmin;
  userId: string;
  permissionId: string;
  linkedUnitIds: Set<string>;
  allowedUnitIds: Set<string>;
  options?: PermissionAuthorizationOptions;
}) {
  const { data, error } = await input.supabase
    .from("user_permission_overrides")
    .select("unit_id, is_allowed")
    .eq("app_user_id", input.userId)
    .eq("permission_id", input.permissionId)
    .eq("status", "active")
    .is("deleted_at", null);

  if (error) {
    logPermissionError(input.options, "permission_overrides_lookup_failed", error);
    throw new PermissionAuthorizationError(input.options?.validationErrorMessage ?? defaultValidationErrorMessage, 500);
  }

  const resolved = resolveOverrideAccess(input.allowedUnitIds, input.linkedUnitIds, data ?? []);
  input.allowedUnitIds.clear();
  resolved.forEach((unitId) => input.allowedUnitIds.add(unitId));
}

export async function getAccessibleUnitIdsForPermission(
  supabase: SupabaseAdmin,
  session: SessionContext,
  permissionCode: string,
  options?: PermissionAuthorizationOptions
): Promise<PermissionAccessResult> {
  const isSuperAdmin =
    session.profile.code === SUPER_ADMIN_PROFILE_CODE ||
    (await userHasActiveSuperAdminProfile(supabase, session, options));

  // 1) UNIAO das unidades acessiveis (exatamente como antes).
  let unionUnitIds: string[];
  let hasPermission: boolean;
  // Visao de rede: NETWORK_MANAGER ve a rede toda e NAO deve ser estreitado para a
  // unidade ativa. Super admin ja e coberto por !isSuperAdmin. No ramo super admin os
  // links nao sao carregados; a flag permanece false (irrelevante, super admin ve tudo).
  let hasNetworkScope = false;

  if (isSuperAdmin) {
    unionUnitIds = await getAllActiveUnitIds(supabase, session, options);
    hasPermission = true;
  } else {
    const permissionId = await getPermissionId(supabase, permissionCode, options);
    if (!permissionId) {
      // MISCONFIGURACAO, nao negacao. Os codes chegam aqui como constantes do proprio
      // codigo (HR_PERMISSIONS, BASE_PERMISSIONS, ...) ou literais em requirePermission:
      // devem SEMPRE existir e estar ativos no catalogo. `undefined` = bug de seed,
      // migration ou digitacao — nunca estado valido. Devolver 403 aqui esconderia esse
      // bug atras de uma resposta que parece regra de negocio, e a equipe inteira ficaria
      // sem acesso sem nenhum sinal. Falha alto e observavel.
      logPermissionError(options, "permission_code_not_found", {
        name: "PermissionMisconfiguration",
        message: `Permission code ausente no catalogo: ${permissionCode}`,
        code: permissionCode
      });
      throw new PermissionAuthorizationError(options?.validationErrorMessage ?? defaultValidationErrorMessage, 500);
    }

    const links = await getActiveUserUnitLinks(supabase, session, options);
    // Mesma fonte e padrao do SUPER_ADMIN (link.access_profiles.code): reusa os links
    // ja carregados, sem query nova.
    hasNetworkScope = links.some(
      (link) => (link as any).access_profiles?.code === NETWORK_MANAGER_PROFILE_CODE
    );
    const linkedUnitIds = new Set(unique(links.map((link) => link.unit_id)));
    const profileIds = unique(links.map((link) => link.access_profile_id));
    const allowedProfileIds = await getProfileAllowedIds(supabase, profileIds, permissionId, options);
    const allowedUnitIds = new Set(
      unique(links.filter((link) => allowedProfileIds.has(link.access_profile_id)).map((link) => link.unit_id))
    );

    await applyUserPermissionOverrides({
      supabase,
      userId: session.user.id,
      permissionId,
      linkedUnitIds,
      allowedUnitIds,
      options
    });

    unionUnitIds = Array.from(allowedUnitIds);
    hasPermission = allowedUnitIds.size > 0;
  }

  // 2) Estreitamento opcional para a unidade ativa (Leva 2 / B-misto).
  //    Default ausente = aggregate (uniao). hasPermission permanece sobre a UNIAO.
  //    NAO estreita para quem tem visao de rede (super admin ou NETWORK_MANAGER).
  const applyActiveUnitNarrowing =
    options?.scope === "active-unit" && !isSuperAdmin && !hasNetworkScope;
  const accessibleUnitIds = applyActiveUnitNarrowing
    ? unionUnitIds.filter((unitId) => unitId === session.activeUnit?.id)
    : unionUnitIds;

  return {
    isSuperAdmin,
    accessibleUnitIds,
    hasPermission,
    hasPermissionInScope: accessibleUnitIds.length > 0
  };
}

export async function userHasPermissionForUnit(
  supabase: SupabaseAdmin,
  session: SessionContext,
  permissionCode: string,
  unitId: string | null | undefined,
  options?: PermissionAuthorizationOptions
) {
  const access = await getAccessibleUnitIdsForPermission(supabase, session, permissionCode, options);

  if (!access.hasPermission) {
    return false;
  }

  if (access.isSuperAdmin) {
    return true;
  }

  return Boolean(unitId && access.accessibleUnitIds.includes(unitId));
}

export async function requirePermission<TPermissionCode extends string = string>(
  permissionCode: TPermissionCode,
  options?: PermissionAuthorizationOptions
) {
  const { session, response } = await requireAuthenticatedRequest();

  if (response || !session) {
    return { context: null, response };
  }

  const supabase = createSupabaseAdminClient();

  let access: PermissionAccessResult;

  try {
    access = await getAccessibleUnitIdsForPermission(supabase, session, permissionCode, options);
  } catch (error) {
    // Falha de infraestrutura ou misconfiguracao (status >= 500) vira RESPOSTA, no mesmo
    // formato ja usado para 401/403 acima. Sem isto a excecao escapa do handler — o gate e'
    // chamado FORA do try/catch das rotas — e o Next devolve 500 com corpo generico,
    // quebrando o contrato { ok, message } que o cliente espera. A mensagem segue generica:
    // o code so' aparece no log.
    if (error instanceof PermissionAuthorizationError && error.status >= 500) {
      return { context: null, response: apiError(error.message, error.status) };
    }

    throw error;
  }

  if (!access.hasPermission) {
    return {
      context: null,
      response: apiError(options?.forbiddenMessage ?? defaultForbiddenMessage, 403)
    };
  }

  return {
    context: {
      session,
      supabase,
      requiredPermission: permissionCode,
      accessibleUnitIds: access.accessibleUnitIds,
      isSuperAdmin: access.isSuperAdmin,
      hasPermissionInScope: access.hasPermissionInScope
    } satisfies PermissionRequestContext<TPermissionCode>,
    response: null
  };
}

export function assertUnitInPermissionScope(
  context: PermissionRequestContext,
  unitId: string | null | undefined,
  options?: PermissionAuthorizationOptions
) {
  if (context.isSuperAdmin) {
    return;
  }

  if (!unitId || !context.accessibleUnitIds.includes(unitId)) {
    throw new PermissionAuthorizationError(options?.notFoundMessage ?? defaultNotFoundMessage, 404);
  }
}
