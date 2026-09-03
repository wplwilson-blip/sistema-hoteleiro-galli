import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Cliente de SERVICE ROLE para a suite E2E.
//
// POR QUE EXISTE: cinco assercoes do plano 70 nao sao alcancaveis por HTTP --
//   - o historico gravado (room_status_history: organization_id, dimension, previous_status);
//   - rooms.housekeeping_changed_at;
//   - marcar um apartamento como `inactive` (nao ha rota que edite rooms.status);
//   - forcar um `from` obsoleto na RPC (a rota calcula o `from` sozinho, nunca o recebe);
//   - a ACL da propria RPC (provada pelo comportamento, como `anon` -- ver o final do arquivo).
// Todo o RESTO da suite passa pela API do app, como as demais specs. Este helper e' a
// excecao, nao o caminho padrao: se der para afirmar via HTTP, afirme via HTTP.
//
// TRES REGRAS, e elas nao sao decorativas:
//
//   1. A chave NUNCA e' logada -- nem em erro, nem em debug. Nao ha console.log do client,
//      da config ou do valor. As mensagens de erro abaixo citam o NOME da variavel, jamais
//      o conteudo. `service role` ignora RLS: um vazamento em log de CI e' acesso total ao
//      banco.
//   2. GUARD PROPRIO de staging, independente do global-setup. O guard de host so olha
//      PLAYWRIGHT_BASE_URL (o alvo HTTP); este cliente fala com o banco DIRETO e nao passa
//      por ele. Sem esta trava, um .env.local apontando para producao faria a suite
//      ESCREVER em producao com o alvo HTTP ainda em localhost.
//   3. `.env.e2e` esta no .gitignore (regra exata, para `.env.e2e.example` continuar
//      versionado).

/** Unico projeto Supabase que esta suite pode tocar. Espelha scripts/assert-staging-env.mjs. */
const STAGING_REF = "jascnmgagejlvjlenduv";
const PRODUCTION_REF = "chnamldrlwohaudmjrez";

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value || !value.trim()) {
    // Cita o NOME, nunca o valor.
    throw new Error(
      `[e2e][db] Variavel de ambiente ausente: ${name}. ` +
        "Defina-a em .env.e2e.local (gitignored). Veja .env.e2e.example."
    );
  }

  return value.trim();
}

/**
 * Aborta se a URL nao for o Supabase de STAGING.
 *
 * Falha FECHADA: qualquer coisa que nao seja exatamente o ref de staging -- producao, um
 * projeto desconhecido ou uma URL malformada -- para a suite.
 */
function assertStagingUrl(url: string): void {
  let ref: string;

  try {
    ref = new URL(url).hostname.split(".")[0];
  } catch {
    throw new Error("[e2e][db] ABORTADO: NEXT_PUBLIC_SUPABASE_URL invalida.");
  }

  if (ref === PRODUCTION_REF) {
    throw new Error(
      `[e2e][db] ABORTADO: NEXT_PUBLIC_SUPABASE_URL aponta para PRODUCAO (ref ${ref}). ` +
        "A suite E2E nunca escreve em producao."
    );
  }

  if (ref !== STAGING_REF) {
    throw new Error(
      `[e2e][db] ABORTADO: ref "${ref}" nao e' o staging esperado (${STAGING_REF}).`
    );
  }
}

let cached: SupabaseClient | null = null;

/** Cliente de service role, ja' com o guard de staging aplicado. Memoizado por processo. */
export function e2eDb(): SupabaseClient {
  if (cached) {
    return cached;
  }

  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  assertStagingUrl(url);

  cached = createClient(url, requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  return cached;
}

// ---------------------------------------------------------------- leituras de apoio

export type RoomStateRow = {
  id: string;
  unit_id: string;
  room_number: string;
  status: string;
  housekeeping_status: string;
  blocking_status: string;
  occupancy_status: string;
  housekeeping_changed_at: string;
};

const ROOM_STATE_COLUMNS =
  "id, unit_id, room_number, status, housekeeping_status, blocking_status, occupancy_status, housekeeping_changed_at";

/** Estado atual de um apartamento, direto do banco. */
export async function readRoom(roomId: string): Promise<RoomStateRow> {
  const { data, error } = await e2eDb().from("rooms").select(ROOM_STATE_COLUMNS).eq("id", roomId).single();

  if (error) {
    throw new Error(`[e2e][db] Falha ao ler o apartamento ${roomId}: ${error.message}`);
  }

  return data as RoomStateRow;
}

/**
 * Apartamentos ATIVOS de uma unidade, em ordem estavel de numero.
 *
 * Ordem estavel importa: os casos escolhem "os N primeiros", e uma ordem que variasse entre
 * rodadas tornaria uma falha impossivel de reproduzir.
 */
export async function listActiveRooms(unitId: string, limit: number): Promise<RoomStateRow[]> {
  const { data, error } = await e2eDb()
    .from("rooms")
    .select(ROOM_STATE_COLUMNS)
    .eq("unit_id", unitId)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("room_number", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`[e2e][db] Falha ao listar apartamentos da unidade ${unitId}: ${error.message}`);
  }

  return (data ?? []) as RoomStateRow[];
}

export type HistoryRow = {
  id: string;
  organization_id: string | null;
  unit_id: string;
  room_id: string;
  dimension: string;
  previous_status: string | null;
  new_status: string;
  reason: string | null;
  is_automatic: boolean;
  changed_at: string;
};

/**
 * TODAS as linhas de historico de um apartamento, mais antigas primeiro.
 *
 * NAO ha corte por tempo, e e' deliberado. A versao anterior recebia um `sinceIso` vindo de
 * `new Date()` na maquina do teste e comparava com `changed_at`, que e' `now()` no BANCO --
 * dois relogios diferentes. Linhas gravadas ANTES do corte apareciam depois dele, e o caso 18
 * reprovou por contar 3 linhas onde esperava 2 (a terceira era o proprio setup do teste).
 *
 * Relogio de cliente como fronteira nunca funciona. Quem chama tira um retrato ANTES
 * (`snapshotHistoryIds`) e usa `newHistoryRows` para pegar so' o que apareceu depois --
 * comparacao por IDENTIDADE, que nao depende de relogio nenhum.
 */
export async function readHistory(roomId: string): Promise<HistoryRow[]> {
  const { data, error } = await e2eDb()
    .from("room_status_history")
    .select("id, organization_id, unit_id, room_id, dimension, previous_status, new_status, reason, is_automatic, changed_at")
    .eq("room_id", roomId)
    .order("changed_at", { ascending: true });

  if (error) {
    throw new Error(`[e2e][db] Falha ao ler o historico do apartamento ${roomId}: ${error.message}`);
  }

  return (data ?? []) as HistoryRow[];
}

/** Retrato dos ids de historico ja existentes, para servir de linha de base. */
export async function snapshotHistoryIds(roomId: string): Promise<Set<string>> {
  return new Set((await readHistory(roomId)).map((row) => row.id));
}

/** As linhas que apareceram depois do retrato, na ordem em que foram gravadas. */
export async function newHistoryRows(roomId: string, baseline: Set<string>): Promise<HistoryRow[]> {
  return (await readHistory(roomId)).filter((row) => !baseline.has(row.id));
}

/** Total de linhas de historico de um apartamento. Usado para provar que NADA foi gravado. */
export async function countHistory(roomId: string): Promise<number> {
  const { count, error } = await e2eDb()
    .from("room_status_history")
    .select("id", { count: "exact", head: true })
    .eq("room_id", roomId);

  if (error) {
    throw new Error(`[e2e][db] Falha ao contar o historico do apartamento ${roomId}: ${error.message}`);
  }

  return count ?? 0;
}

// ---------------------------------------------------------------- escritas de apoio

/**
 * Marca o cadastro do apartamento como ativo/inativo.
 *
 * Existe porque NAO ha rota que edite `rooms.status` -- o caso 12 (apartamento inativo nao
 * transita) so' e' montavel por aqui. Sempre em par com a restauracao no `finally`.
 */
export async function setRoomRecordStatus(roomId: string, status: "active" | "inactive"): Promise<void> {
  const { error } = await e2eDb().from("rooms").update({ status }).eq("id", roomId);

  if (error) {
    throw new Error(`[e2e][db] Falha ao setar status=${status} no apartamento ${roomId}: ${error.message}`);
  }
}

/** Resolve o id de uma unidade pelo codigo (nunca por uuid literal: staging != producao). */
export async function findUnitIdByCode(code: string): Promise<string> {
  const { data, error } = await e2eDb()
    .from("units")
    .select("id")
    .eq("code", code)
    .is("deleted_at", null)
    .limit(1);

  if (error) {
    throw new Error(`[e2e][db] Falha ao resolver a unidade ${code}: ${error.message}`);
  }

  const unit = data?.[0] as { id: string } | undefined;

  if (!unit) {
    throw new Error(`[e2e][db] Unidade ${code} nao encontrada no staging.`);
  }

  return unit.id;
}

/**
 * Chama a RPC rooms_apply_transition DIRETO, sem passar pela rota.
 *
 * Unico uso legitimo: o caso 16a, que precisa de um `from` que a rota jamais produziria.
 * Para qualquer outra coisa, use a rota -- e' ela que esta sob teste.
 */
export async function callTransitionRpc(params: {
  transitions: Array<{ room_id: string; from: string; to: string; housekeeping_effect: string | null }>;
  dimension: string;
  reason?: string | null;
  actorId?: string | null;
}): Promise<{ data: unknown; error: { message: string } | null }> {
  const { data, error } = await e2eDb().rpc("rooms_apply_transition", {
    p_transitions: params.transitions,
    p_dimension: params.dimension,
    p_reason: params.reason ?? null,
    p_actor_id: params.actorId ?? null
  });

  return { data, error: error ? { message: error.message } : null };
}

// ---------------------------------------------------------------- o dia da governanca (091)

export type HousekeepingTaskRow = {
  id: string;
  housekeeping_day_id: string;
  room_id: string;
  service_type: string | null;
  outcome: string;
  decline_origin: string | null;
  completed_at: string | null;
};

/** O dia ABERTO da unidade, se houver. Nulo quando ninguem abriu -- silencio, nao zero. */
export async function findOpenDay(unitId: string): Promise<{ id: string; service_date: string } | null> {
  const { data, error } = await e2eDb()
    .from("housekeeping_days")
    .select("id, service_date")
    .eq("unit_id", unitId)
    .is("closed_at", null)
    .order("service_date", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(`[e2e][db] Falha ao localizar o dia aberto da unidade ${unitId}: ${error.message}`);
  }

  return (data?.[0] as { id: string; service_date: string } | undefined) ?? null;
}

export async function readTask(dayId: string, roomId: string): Promise<HousekeepingTaskRow> {
  const { data, error } = await e2eDb()
    .from("housekeeping_tasks")
    .select("id, housekeeping_day_id, room_id, service_type, outcome, decline_origin, completed_at")
    .eq("housekeeping_day_id", dayId)
    .eq("room_id", roomId)
    .single();

  if (error) {
    throw new Error(`[e2e][db] Falha ao ler a tarefa do apartamento ${roomId}: ${error.message}`);
  }

  return data as HousekeepingTaskRow;
}

/**
 * Devolve a tarefa ao estado inicial do dia.
 *
 * Escrita por service role, e e' a UNICA da suite -- nao ha rota que reabra tarefa, e nem
 * deveria haver: reabrir trabalho concluido nao e' operacao de governanca. E' limpeza de
 * teste, no mesmo espirito da restauracao de estado dos apartamentos.
 */
export async function resetTaskToPending(taskId: string): Promise<void> {
  const { error } = await e2eDb()
    .from("housekeeping_tasks")
    .update({ outcome: "pending", service_type: null, decline_origin: null, completed_at: null })
    .eq("id", taskId);

  if (error) {
    throw new Error(`[e2e][db] Falha ao restaurar a tarefa ${taskId}: ${error.message}`);
  }
}

/**
 * Resultado do probe do caso 20. NAO e' booleano de proposito: "nao deu certo" e "deu o erro
 * ERRADO" sao coisas diferentes, e achatar as duas num `blocked: boolean` deixaria passar
 * exatamente o cenario que o caso existe para pegar.
 *
 *   permission_denied -> CORRETO. O Postgres recusou no `execute`, ANTES de o corpo rodar.
 *   executed          -> A TRAVA ESTA ABERTA. A chamada atravessou o execute e chegou na
 *                        validacao de argumentos da funcao. Reprova.
 *   not_exposed       -> A funcao nao esta no schema cache do PostgREST para este papel.
 *                        Tambem e' "fechada", mas por outro mecanismo -- nao afirma nada
 *                        sobre a ACL, entao NAO conta como aprovacao.
 *   unexpected        -> Qualquer outra coisa. Reprova, com o erro cru no detalhe.
 */
export type RpcAnonProbe = {
  outcome: "permission_denied" | "executed" | "not_exposed" | "unexpected";
  detail: string;
};

/**
 * Caso 20 -- a RPC continua FECHADA para quem nao e' service_role.
 *
 * DESVIO DECLARADO da especificacao: o pedido era ler `pg_proc.proacl`. Nao da': `pg_proc`
 * vive em `pg_catalog`, que o PostgREST nao expoe, e criar uma funcao de leitura seria
 * mexer em migration -- fora do escopo desta tarefa.
 *
 * A prova aqui e' COMPORTAMENTAL, e cobre exatamente as tres regressoes pedidas. `anon` e'
 * um ROLE do Postgres: se a funcao voltar a ter `execute` para PUBLIC, para `anon` ou para
 * `authenticated`, esta chamada passa da barreira de permissao -- e o teste falha.
 *
 * O payload e' um lote VAZIO de proposito, e e' o que torna o probe DIAGNOSTICO em vez de
 * so' negativo: se a permissao estiver indevidamente aberta, a execucao chega ao corpo e
 * levanta ROOMS_TRANSITION_EMPTY_BATCH -- sem escrever nada. Receber esse erro NAO e'
 * sucesso: e' a prova de que a trava caiu. O esperado e' erro de PERMISSAO, antes de
 * qualquer validacao de argumento.
 */
export async function probeRpcAsAnon(fn: string, args: Record<string, unknown>): Promise<RpcAnonProbe> {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  assertStagingUrl(url);

  const anon = createClient(url, requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { error } = await anon.rpc(fn, args);

  if (!error) {
    return { outcome: "executed", detail: "a RPC respondeu SEM erro para o papel anon" };
  }

  const message = error.message ?? "";
  const code = (error as { code?: string }).code ?? "";
  const detail = `${code} ${message}`.trim();

  // O corpo da funcao rodou -> o `execute` foi concedido a alguem que nao devia te-lo.
  if (message.includes("ROOMS_TRANSITION_") || message.includes("HOUSEKEEPING_")) {
    return { outcome: "executed", detail };
  }

  // 42501 = insufficient_privilege. E' o resultado correto.
  if (code === "42501" || /permission denied/i.test(message)) {
    return { outcome: "permission_denied", detail };
  }

  // PGRST202: a funcao nao foi encontrada no schema cache para este papel.
  if (code === "PGRST202" || /could not find the function/i.test(message)) {
    return { outcome: "not_exposed", detail };
  }

  return { outcome: "unexpected", detail };
}

/**
 * Caso 20: a RPC de transicao continua fechada para `anon`.
 *
 * Assinatura UNICA de quatro argumentos. A 091 chegou a criar uma sobrecarga de cinco, e o
 * PostgREST passou a recusar TODA chamada com PGRST203 -- ver o plano 75, D8. O drop no passo
 * 7 da 091 desfaz isso; se este probe voltar a devolver PGRST203, a sobrecarga ressuscitou.
 */
export function probeTransitionRpcAsAnon(): Promise<RpcAnonProbe> {
  return probeRpcAsAnon("rooms_apply_transition", {
    p_transitions: [],
    p_dimension: "housekeeping",
    p_reason: null,
    p_actor_id: null
  });
}

