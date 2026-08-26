import { expect, test } from "@playwright/test";

import {
  DEFAULT_LOGIN_RATE_LIMITS,
  LOGIN_RATE_LIMIT_WINDOW_MINUTES,
  buildThrottleMessage,
  resolveClientIp,
  shouldThrottle
} from "../../src/lib/auth/login-rate-limit";

// Runner puro. Cobre o achado #4, fatia 2 (plano docs/codex/54): rate limit do login.
//
// Limiares aprovados: 10 falhas / 15 min por username, 30 falhas / 15 min por IP.
// Backoff com 429, NUNCA lockout duro -- lockout seria vetor de DoS (bastaria errar a
// senha de alguem de proposito para tranca-la fora do sistema).

const { maxFailuresByUser, maxFailuresByIp } = DEFAULT_LOGIN_RATE_LIMITS;

test("limiares aprovados: 10 por username, 30 por IP, janela de 15 min", () => {
  expect(maxFailuresByUser).toBe(10);
  expect(maxFailuresByIp).toBe(30);
  expect(DEFAULT_LOGIN_RATE_LIMITS.windowMinutes).toBe(15);
  expect(LOGIN_RATE_LIMIT_WINDOW_MINUTES).toBe(15);
});

// ------------------------------------------------------------------ limite por username

test("username: abaixo do limiar nao freia", () => {
  for (let failures = 0; failures < maxFailuresByUser; failures++) {
    const decision = shouldThrottle({ failuresByUser: failures });

    expect(decision.throttled, `falhas=${failures}`).toBe(false);
    expect(decision.retryAfterSeconds, `falhas=${failures}`).toBe(0);
    expect(decision.triggeredBy, `falhas=${failures}`).toBeNull();
  }
});

test("username: no limiar exato ja' freia", () => {
  const decision = shouldThrottle({ failuresByUser: maxFailuresByUser });

  expect(decision.throttled).toBe(true);
  expect(decision.triggeredBy).toBe("user");
  expect(decision.retryAfterSeconds).toBeGreaterThan(0);
});

// ------------------------------------------------------------------ limite por IP

test("IP: abaixo do limiar nao freia, no limiar freia", () => {
  expect(shouldThrottle({ failuresByUser: 0, failuresByIp: maxFailuresByIp - 1 }).throttled).toBe(false);

  const decision = shouldThrottle({ failuresByUser: 0, failuresByIp: maxFailuresByIp });
  expect(decision.throttled).toBe(true);
  expect(decision.triggeredBy).toBe("ip");
});

test("IP ausente (sem x-forwarded-for): vale somente o limite por username", () => {
  // Nem bloqueia todo mundo, nem libera geral: cai para a chave que sustenta a protecao.
  expect(shouldThrottle({ failuresByUser: 0, failuresByIp: undefined }).throttled).toBe(false);
  expect(shouldThrottle({ failuresByUser: 999, failuresByIp: undefined }).throttled).toBe(true);
});

test("as duas chaves estouradas: o username tem precedencia no motivo", () => {
  const decision = shouldThrottle({ failuresByUser: maxFailuresByUser, failuresByIp: maxFailuresByIp });

  expect(decision.throttled).toBe(true);
  expect(decision.triggeredBy).toBe("user");
});

// ------------------------------------------------------------------ backoff

test("backoff cresce com as falhas e respeita o teto da janela", () => {
  const primeiro = shouldThrottle({ failuresByUser: maxFailuresByUser }).retryAfterSeconds;
  const segundo = shouldThrottle({ failuresByUser: maxFailuresByUser + 1 }).retryAfterSeconds;
  const terceiro = shouldThrottle({ failuresByUser: maxFailuresByUser + 2 }).retryAfterSeconds;

  expect(primeiro).toBe(30);
  expect(segundo).toBe(60);
  expect(terceiro).toBe(120);
  expect(segundo).toBeGreaterThan(primeiro);
  expect(terceiro).toBeGreaterThan(segundo);
});

test("backoff nunca passa da janela — a conta NUNCA fica trancada", () => {
  const teto = LOGIN_RATE_LIMIT_WINDOW_MINUTES * 60;

  // Um ataque sustentado passa facilmente de mil tentativas: o valor tem de continuar
  // finito e limitado, senao o "backoff" vira lockout na pratica.
  for (const failures of [50, 500, 5_000, 1_000_000]) {
    const decision = shouldThrottle({ failuresByUser: failures });

    expect(decision.retryAfterSeconds, `falhas=${failures}`).toBeLessThanOrEqual(teto);
    expect(Number.isFinite(decision.retryAfterSeconds), `falhas=${failures}`).toBe(true);
  }
});

// ------------------------------------------------------------------ sucesso zera

test("sucesso zera: contagem volta a zero -> nao freia mesmo apos muitas falhas antigas", () => {
  // A rota implementa isto contando so' as falhas POSTERIORES ao ultimo sucesso. Aqui a
  // tabela-verdade so' confirma o efeito: contagem zerada => passa.
  expect(shouldThrottle({ failuresByUser: 0, failuresByIp: 0 }).throttled).toBe(false);

  // E uma falha depois do sucesso recomeca a contagem do zero, longe do limiar.
  expect(shouldThrottle({ failuresByUser: 1 }).throttled).toBe(false);
});

test("contagens negativas (dado corrompido) sao tratadas como zero", () => {
  expect(shouldThrottle({ failuresByUser: -5, failuresByIp: -20 }).throttled).toBe(false);
});

// ------------------------------------------------------------------ mensagem e IP

test("a mensagem do 429 nao diz nada sobre a conta", () => {
  const mensagem = buildThrottleMessage(120).toLowerCase();

  expect(mensagem).toContain("muitas tentativas");

  // Se o 429 citasse a conta, o proprio freio viraria a pista que a fatia 1 removeu.
  for (const palavra of ["usuario", "conta", "senha", "bloqueado", "existe"]) {
    expect(mensagem, palavra).not.toContain(palavra);
  }
});

test("a mensagem arredonda para cima e nunca diz '0 minutos'", () => {
  expect(buildThrottleMessage(30)).toContain("1 minuto");
  expect(buildThrottleMessage(1)).toContain("1 minuto");
  expect(buildThrottleMessage(120)).toContain("2 minutos");
  expect(buildThrottleMessage(0)).toContain("1 minuto");
});

test("resolveClientIp: primeiro valor de x-forwarded-for, sem espacos", () => {
  expect(resolveClientIp("203.0.113.7")).toBe("203.0.113.7");
  expect(resolveClientIp("203.0.113.7, 70.41.3.18, 150.172.238.178")).toBe("203.0.113.7");
  expect(resolveClientIp("  203.0.113.7  , 70.41.3.18")).toBe("203.0.113.7");
});

test("resolveClientIp: ausente ou vazio -> undefined (so' o limite por username vale)", () => {
  expect(resolveClientIp(null)).toBeUndefined();
  expect(resolveClientIp(undefined)).toBeUndefined();
  expect(resolveClientIp("")).toBeUndefined();
  expect(resolveClientIp("   ")).toBeUndefined();
  expect(resolveClientIp(",")).toBeUndefined();
});

test("resolveClientIp: valor que NAO e' IP -> undefined (fecha o bypass do rate limit)", () => {
  // Sem esta validacao ha' BYPASS: a coluna ip e' `inet`, entao uma string que nao seja IP
  // faz o insert e a consulta estourarem no Postgres, o limitador cai no fail-open e a
  // tentativa nao e' contada. Bastaria mandar `x-forwarded-for: garbage` em toda
  // requisicao para nunca ser freado -- inclusive pelo limite por username, porque a falha
  // derruba a gravacao inteira.
  expect(resolveClientIp("garbage")).toBeUndefined();
  expect(resolveClientIp("999.999.999.999")).toBeUndefined();
  expect(resolveClientIp("203.0.113.7; DROP")).toBeUndefined();
  expect(resolveClientIp("203.0.113")).toBeUndefined();
  expect(resolveClientIp("<script>alert(1)</script>")).toBeUndefined();

  // Invalido na PRIMEIRA posicao nao "cai" para o proximo da lista: o primeiro valor e' o
  // unico que interessa, e um invalido ali significa header nao confiavel.
  expect(resolveClientIp("garbage, 203.0.113.7")).toBeUndefined();
});

test("resolveClientIp: IPv6 valido e' aceito", () => {
  expect(resolveClientIp("2001:db8::1")).toBe("2001:db8::1");
  expect(resolveClientIp("  2001:db8::1  , 70.41.3.18")).toBe("2001:db8::1");
  expect(resolveClientIp("::1")).toBe("::1");
});
