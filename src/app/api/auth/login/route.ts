import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionContextByAuthUserId } from "@/lib/auth/session";
import { loginSchema } from "@/lib/auth/schemas";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  resolveLoginFailureResponse,
  type LoginFailureReason
} from "@/lib/auth/login-response";
import {
  DEFAULT_LOGIN_RATE_LIMITS,
  buildThrottleMessage,
  resolveClientIp,
  shouldThrottle
} from "@/lib/auth/login-rate-limit";

// E-mail SENTINELA do round-trip de equalizacao (plano docs/codex/54, fatia 1).
//
// `.invalid` e' um TLD reservado pela RFC 2606: nao existe, nao e' registravel e nao
// resolve. Nenhuma conta do Supabase Auth pode ter este endereco, entao o
// signInWithPassword com ele SEMPRE falha — nao ha' caminho em que este e-mail autentique.
const SENTINEL_AUTH_EMAIL = "no-reply+nonexistent-login-probe@sistema-hoteleiro.invalid";

// Piso de tempo das respostas de falha de CREDENCIAL — BACKSTOP, nao o mecanismo.
//
// Quem fecha o oraculo de timing e' o round-trip sentinela (ver `probeSentinelAuth`): os
// dois caminhos, conta existente e conta inexistente, passam pela MESMA chamada de rede ao
// Supabase Auth. Os tempos ficam iguais POR CONSTRUCAO, nao porque uma constante os
// mascara. Essa distincao importa: um piso fixo abaixo do custo real deixaria o oraculo
// aberto, e sob pico de latencia do Auth qualquer piso fixo reabriria.
//
// MEDIDO em staging (com a migration 084 aplicada e o piso rebaixado para nao mascarar o
// resultado), comparando os dois caminhos que um enumerador consegue produzir — ambos 401:
//   B = usuario inexistente   |   C = usuario real com senha errada
//   n = 50 por serie, em duas rodadas com a ORDEM das series invertida entre elas.
//
//   mediana B-C ........ +39 ms sobre uma base de ~1,4 s  (2,8%)
//   media   B-C ........ +40 ms, a 1,22 erro-padrao de zero  -> indistinguivel de zero
//   p95     B-C ........ TROCOU DE SINAL entre as rodadas (+216 ms / -117 ms)
//
// Sinal que inverte quando so' a ordem muda e' ruido de rede, nao vies sistematico. Antes
// desta fatia os dois caminhos custavam ordens de grandeza diferentes (um pulava o
// round-trip ao Auth inteiro); agora custam o mesmo dentro do ruido.
//
// 300 ms e' BAIXO DE PROPOSITO. So' cobre jitter residual. Um piso alto nao compraria
// seguranca nenhuma — o sentinela ja' igualou os caminhos — e puniria toda falha de
// credencial LEGITIMA (o hospede da recepcao que errou a senha) mantendo a invocacao
// aberta a' toa. Na Vercel, servidor e Supabase ficam proximos, entao o custo real e' bem
// menor que os ~1,4 s medidos daqui, e o piso passa a agir com mais frequencia: mais um
// motivo para ele ser leve.
const LOGIN_MIN_RESPONSE_MS = 300;

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

/**
 * Conta as falhas na janela e registra a tentativa.
 *
 * TUDO AQUI FALHA ABERTO. Se a leitura ou a escrita quebrar — tabela ainda nao aplicada,
 * banco indisponivel, permissao errada — o login PROSSEGUE e o erro vai para o log. Um bug
 * no freio nao pode trancar a recepcao do hotel. Efeito colateral bom: a ordem de deploy
 * fica tolerante, o codigo pode subir antes da migration 084.
 */
async function countRecentFailures(input: { username: string; ip?: string }) {
  const admin = createSupabaseAdminClient();
  const since = new Date(Date.now() - DEFAULT_LOGIN_RATE_LIMITS.windowMinutes * 60_000).toISOString();

  try {
    // "Sucesso zera o contador" (decisao aprovada): as falhas contadas sao apenas as
    // POSTERIORES ao ultimo login bem-sucedido daquele username. Sem este passo, contar
    // `succeeded = false` na janela deixaria falhas antigas punindo quem ja' provou a senha
    // no meio do caminho -- o contador nunca zeraria de fato, so' expiraria com a janela.
    const { data: lastSuccess, error: lastSuccessError } = await admin
      .from("auth_login_attempts")
      .select("created_at")
      .eq("username_attempted", input.username)
      .eq("succeeded", true)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1);

    if (lastSuccessError) {
      throw lastSuccessError;
    }

    const userSince = lastSuccess?.[0]?.created_at ?? since;

    const { count: userCount, error: userError } = await admin
      .from("auth_login_attempts")
      .select("id", { count: "exact", head: true })
      .eq("username_attempted", input.username)
      .eq("succeeded", false)
      .gte("created_at", userSince);

    if (userError) {
      throw userError;
    }

    // O contador por IP NAO zera no sucesso, de proposito: num ataque de spraying o
    // atacante acerta uma conta e continuaria varrendo as demais do mesmo IP. Ali o sinal
    // que interessa e' o volume de falhas na janela, independente de acertos no meio.
    let ipCount: number | undefined;

    if (input.ip) {
      const { count, error: ipError } = await admin
        .from("auth_login_attempts")
        .select("id", { count: "exact", head: true })
        .eq("ip", input.ip)
        .eq("succeeded", false)
        .gte("created_at", since);

      if (ipError) {
        throw ipError;
      }

      ipCount = count ?? 0;
    }

    return { failuresByUser: userCount ?? 0, failuresByIp: ipCount, degraded: false };
  } catch (error) {
    await writeAuthLog({
      level: "error",
      action: "auth.login.rate_limit_read_failed",
      message: `Falha ao ler o rate limit do login; seguindo sem freio. ${error instanceof Error ? error.message : "erro desconhecido"}`,
      username: input.username
    });

    // Fail-open: sem contagem confiavel, nao freia.
    return { failuresByUser: 0, failuresByIp: undefined, degraded: true };
  }
}

async function recordLoginAttempt(input: { username: string; ip?: string; succeeded: boolean }) {
  const admin = createSupabaseAdminClient();

  try {
    const { error } = await admin.from("auth_login_attempts").insert({
      username_attempted: input.username,
      ip: input.ip ?? null,
      succeeded: input.succeeded
    });

    if (error) {
      throw error;
    }
  } catch (error) {
    await writeAuthLog({
      level: "error",
      action: "auth.login.rate_limit_write_failed",
      message: `Falha ao registrar a tentativa de login. ${error instanceof Error ? error.message : "erro desconhecido"}`,
      username: input.username
    });
  }
}

async function padUntilFloor(startedAt: number) {
  const elapsed = Date.now() - startedAt;
  const remaining = LOGIN_MIN_RESPONSE_MS - elapsed;

  if (remaining > 0) {
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }
}

/**
 * Round-trip de equalizacao para o caminho "usuario nao existe / esta inativo".
 *
 * Antes disto, esse caminho respondia 401 SEM NUNCA chamar o Supabase Auth: custava 1
 * query, contra 1 query + uma chamada de rede no caminho do usuario existente. Diferenca
 * de ordem de grandeza, cronometravel do cliente — um oraculo de enumeracao que nenhum
 * piso de tempo fixo fecha de verdade (basta a latencia do Auth passar do piso num pico).
 *
 * Aqui o trabalho e' igualado por construcao: os dois caminhos fazem a MESMA chamada. O
 * GoTrue ja' executa hash dummy para e-mail inexistente, entao o custo do lado dele e'
 * equivalente ao de uma senha errada em conta real.
 *
 * O resultado e' DESCARTADO de proposito: esta chamada nao decide nada, so' gasta o mesmo
 * tempo. Nunca pode autenticar — ver SENTINEL_AUTH_EMAIL.
 *
 * Usa um cliente PROPRIO, e nao o do fluxo real, para nao haver qualquer chance de mexer
 * no estado de cookies/sessao da requisicao legitima.
 */
async function probeSentinelAuth() {
  try {
    const probeClient = createSupabaseServerClient();
    await probeClient.auth.signInWithPassword({
      email: SENTINEL_AUTH_EMAIL,
      password: "senha-invalida-de-equalizacao"
    });
  } catch {
    // Ignorado de proposito: o probe nunca deve alterar o resultado do login. Se a rede
    // falhar aqui, o piso de tempo cobre o que der.
  }
}

async function writeAuthLog(input: {
  level?: "info" | "warning" | "error";
  action: string;
  message: string;
  appUserId?: string;
  unitId?: string;
  username?: string;
}) {
  const supabase = createSupabaseAdminClient();

  await supabase.from("system_logs").insert({
    level: input.level ?? "info",
    action: input.action,
    module_code: "BASE",
    entity_type: "auth",
    app_user_id: input.appUserId,
    unit_id: input.unitId,
    message: input.message,
    context: input.username ? { username: input.username } : {}
  });
}

export async function POST(request: Request) {
  // Marcado no inicio do handler: o piso e' medido sobre o tempo TOTAL da requisicao, nao
  // sobre um trecho — senao a diferenca entre os caminhos reaparece.
  const startedAt = Date.now();

  try {
    const payload = loginSchema.parse(await request.json());
    const admin = createSupabaseAdminClient();
    const clientIp = resolveClientIp(request.headers.get("x-forwarded-for"));

    // FREIO ANTES DE TUDO: acima do limiar nem se toca no Supabase Auth. A contagem e' pela
    // string submetida, exista o usuario ou nao — senao o 429 diria quais nomes existem.
    const failures = await countRecentFailures({ username: payload.username, ip: clientIp });
    const throttle = shouldThrottle({
      failuresByUser: failures.failuresByUser,
      failuresByIp: failures.failuresByIp
    });

    if (throttle.throttled) {
      await writeAuthLog({
        level: "warning",
        action: "auth.login.throttled",
        message: `Login freado por excesso de tentativas (chave: ${throttle.triggeredBy}).`,
        username: payload.username
      });

      // Sem piso de tempo: o 429 responde na hora. Acolchoar so' manteria a invocacao
      // aberta a custo do atacante -- e este caminho nao revela existencia de conta.
      return NextResponse.json(
        { ok: false, message: buildThrottleMessage(throttle.retryAfterSeconds) },
        { status: 429, headers: { "Retry-After": String(throttle.retryAfterSeconds) } }
      );
    }

    // Falha de credencial: responde sempre igual, sempre depois do piso. A trilha em
    // system_logs continua distinguindo os motivos — a uniformidade e' so' para o cliente.
    const credentialFailure = async (reason: LoginFailureReason, appUserId?: string) => {
      const resolved = resolveLoginFailureResponse(reason);

      await writeAuthLog({
        level: "warning",
        action: "auth.login.failed",
        message: "Falha de login.",
        appUserId,
        username: payload.username
      });

      await recordLoginAttempt({ username: payload.username, ip: clientIp, succeeded: false });
      await padUntilFloor(startedAt);
      return errorResponse(resolved.message, resolved.status);
    };

    const { data: appUser, error: userError } = await admin
      .from("app_users")
      .select("id, auth_user_id, username, auth_email, display_name, status")
      .eq("username", payload.username)
      .is("deleted_at", null)
      .maybeSingle();

    // Os tres caminhos abaixo nao chegam a verificar senha de conta real. Cada um paga o
    // round-trip sentinela ANTES de responder, para custar o mesmo que o caminho que
    // verifica. A linha em auth_login_attempts e' inserida igual (dentro de
    // credentialFailure): o sentinela conta como tentativa como qualquer outra, senao o
    // rate limit teria um buraco justamente nos usernames inexistentes.
    if (userError) {
      await probeSentinelAuth();
      return credentialFailure("user_lookup_failed");
    }

    if (!appUser) {
      await probeSentinelAuth();
      return credentialFailure("user_not_found");
    }

    if (appUser.status !== "active") {
      await probeSentinelAuth();
      return credentialFailure("user_inactive", appUser.id);
    }

    // A SENHA E' VERIFICADA AQUI, antes de qualquer resposta que distinga este usuario dos
    // demais. A checagem de vinculo ativo, que antes vinha nesta posicao, desceu para
    // depois — era ela que revelava "este usuario existe" a quem nao tinha a senha.
    const serverClient = createSupabaseServerClient();
    const { data: authData, error: authError } = await serverClient.auth.signInWithPassword({
      email: appUser.auth_email,
      password: payload.password
    });

    if (authError || !authData.user) {
      return credentialFailure("invalid_password", appUser.id);
    }

    const { data: activeLinks, error: activeLinksError } = await admin
      .from("user_unit_links")
      .select("id")
      .eq("app_user_id", appUser.id)
      .eq("status", "active")
      .is("deleted_at", null)
      .limit(1);

    if (activeLinksError || !activeLinks?.length) {
      // A senha ja' foi aceita neste ponto, entao os cookies de sessao JA' FORAM emitidos.
      // Sem este signOut, um usuario sem vinculo sairia do login com sessao valida — o
      // efeito colateral que a reordenacao cria e que precisa ser fechado aqui.
      await serverClient.auth.signOut();

      const resolved = resolveLoginFailureResponse("no_active_unit");

      await writeAuthLog({
        level: "warning",
        action: "auth.login.failed_no_unit",
        message: "Login bloqueado por ausencia de vinculo ativo.",
        appUserId: appUser.id,
        username: payload.username
      });

      // Sem piso: quem chegou aqui provou a senha, e o tempo nao lhe informa nada novo.
      return errorResponse(resolved.message, resolved.status);
    }

    const sessionContext = await getSessionContextByAuthUserId(authData.user.id);

    if (!sessionContext) {
      await serverClient.auth.signOut();

      const resolved = resolveLoginFailureResponse("no_session_context");
      return errorResponse(resolved.message, resolved.status);
    }

    // Sucesso: registra a linha com succeeded = true. E' ela que ZERA o contador daquele
    // username -- countRecentFailures passa a contar apenas as falhas posteriores a ela.
    await recordLoginAttempt({ username: payload.username, ip: clientIp, succeeded: true });
    await admin.from("app_users").update({ last_login_at: new Date().toISOString(), updated_by: appUser.id }).eq("id", appUser.id);
    await writeAuthLog({
      action: "auth.login.success",
      message: "Login realizado com sucesso.",
      appUserId: appUser.id,
      unitId: sessionContext.activeUnit.id,
      username: payload.username
    });

    return NextResponse.json({ ok: true, user: sessionContext });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(error.errors[0]?.message ?? "Dados invalidos.", 422);
    }

    await writeAuthLog({
      level: "error",
      action: "auth.login.error",
      message: "Erro inesperado no login."
    });

    return errorResponse("Nao foi possivel realizar login agora.", 500);
  }
}
