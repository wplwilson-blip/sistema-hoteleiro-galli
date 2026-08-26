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

// Piso de tempo das respostas de falha de CREDENCIAL (plano docs/codex/54, fatia 1).
//
// Sem ele, "usuario nao existe" custa 1 query e "senha errada" custa 1 query + o
// round-trip do Supabase Auth — diferenca de ordem de grandeza, mensuravel do cliente.
// E' um oraculo de timing: da' para enumerar contas cronometrando as respostas.
//
// O `await` de timer no Node nao ocupa CPU nem thread; o custo e' manter a invocacao
// aberta. Por isso o piso vale SO' para falha de credencial: o 429 do rate limit, o 422 de
// payload invalido e o sucesso respondem na hora (nenhum deles revela existencia de conta).
const CREDENTIAL_FAILURE_FLOOR_MS = 400;

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
      .eq("username", input.username)
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
      .eq("username", input.username)
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
      username: input.username,
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
  const remaining = CREDENTIAL_FAILURE_FLOOR_MS - elapsed;

  if (remaining > 0) {
    await new Promise((resolve) => setTimeout(resolve, remaining));
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

    if (userError) {
      return credentialFailure("user_lookup_failed");
    }

    if (!appUser) {
      return credentialFailure("user_not_found");
    }

    if (appUser.status !== "active") {
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
