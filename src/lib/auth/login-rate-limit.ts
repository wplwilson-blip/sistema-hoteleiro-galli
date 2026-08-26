// Rate limit do login (#4, plano docs/codex/54, fatia 2).
//
// PURO e sem `server-only`: a decisao vive aqui, isolada do I/O, para ser testada no
// runner puro. A leitura/escrita das tentativas fica na rota, que e' quem tem o cliente.
//
// DECISOES TRAVADAS (aprovadas pelo Wilson):
//   - backoff com 429, NUNCA lockout duro. A conta jamais fica trancada: passada a janela
//     ela volta sozinha. Lockout seria um vetor de DoS — bastaria errar a senha de alguem
//     de proposito para trancar essa pessoa fora do sistema;
//   - a contagem e' pela STRING submetida, exista o usuario ou nao. Contar so' os
//     existentes faria o 429 virar oraculo de enumeracao ("esse nome nunca throttla");
//   - o limite por IP e' SECUNDARIO: x-forwarded-for e' reescrito pelo proxy na Vercel,
//     mas fora dele e' um header arbitrario. Quem sustenta a protecao e' o limite por
//     username;
//   - fail-open na rota: se a leitura ou a escrita falhar, o login PROSSEGUE. Um bug no
//     freio nao pode trancar a recepcao do hotel.

export const LOGIN_RATE_LIMIT_WINDOW_MINUTES = 15;

export type LoginRateLimits = {
  /** Falhas do MESMO username na janela antes de comecar a frear. */
  maxFailuresByUser: number;
  /** Falhas do MESMO IP na janela — freia password spraying entre varias contas. */
  maxFailuresByIp: number;
  windowMinutes: number;
};

export const DEFAULT_LOGIN_RATE_LIMITS: LoginRateLimits = {
  maxFailuresByUser: 10,
  maxFailuresByIp: 30,
  windowMinutes: LOGIN_RATE_LIMIT_WINDOW_MINUTES
};

export type LoginThrottleDecision = {
  throttled: boolean;
  /** Segundos para o header Retry-After. 0 quando nao ha' throttle. */
  retryAfterSeconds: number;
  /** Qual chave estourou — para o log do servidor. NAO vai para o cliente. */
  triggeredBy: "user" | "ip" | null;
};

const BASE_BACKOFF_SECONDS = 30;
/** Teto do backoff: a janela inteira. Passado esse tempo a contagem expira sozinha. */
const MAX_BACKOFF_SECONDS = LOGIN_RATE_LIMIT_WINDOW_MINUTES * 60;

/**
 * Backoff crescente: 30s dobrando a cada falha acima do limiar, com teto na janela.
 * O expoente e' limitado antes da potenciacao para nao produzir Infinity com contagens
 * altas (um ataque sustentado facilmente passa de 1000 tentativas).
 */
function backoffSeconds(failures: number, limit: number): number {
  const excess = Math.max(0, failures - limit);
  const cappedExcess = Math.min(excess, 20);
  const seconds = BASE_BACKOFF_SECONDS * Math.pow(2, cappedExcess);

  return Math.min(seconds, MAX_BACKOFF_SECONDS);
}

/**
 * Decide se a tentativa deve ser freada, a partir das falhas ja' contadas na janela.
 *
 * Recebe as contagens prontas de proposito: quem le' o banco e' a rota, e assim esta
 * funcao e' uma tabela-verdade testavel sem rede.
 *
 * `failuresByIp` undefined = nao ha' IP confiavel (x-forwarded-for ausente). Nesse caso
 * vale somente o limite por username, em vez de bloquear todo mundo ou liberar geral.
 */
export function shouldThrottle(input: {
  failuresByUser: number;
  failuresByIp?: number;
  limits?: LoginRateLimits;
}): LoginThrottleDecision {
  const limits = input.limits ?? DEFAULT_LOGIN_RATE_LIMITS;
  const failuresByUser = Math.max(0, input.failuresByUser);
  const failuresByIp = input.failuresByIp === undefined ? undefined : Math.max(0, input.failuresByIp);

  // O limite por username vem primeiro: e' o principal, e da' a mensagem mais precisa no
  // log do servidor quando as duas chaves estouram ao mesmo tempo.
  if (failuresByUser >= limits.maxFailuresByUser) {
    return {
      throttled: true,
      retryAfterSeconds: backoffSeconds(failuresByUser, limits.maxFailuresByUser),
      triggeredBy: "user"
    };
  }

  if (failuresByIp !== undefined && failuresByIp >= limits.maxFailuresByIp) {
    return {
      throttled: true,
      retryAfterSeconds: backoffSeconds(failuresByIp, limits.maxFailuresByIp),
      triggeredBy: "ip"
    };
  }

  return { throttled: false, retryAfterSeconds: 0, triggeredBy: null };
}

/**
 * Mensagem do 429. Generica de proposito: nao diz nada sobre a conta, senao o proprio
 * freio viraria a pista que a fatia 1 acabou de remover.
 */
export function buildThrottleMessage(retryAfterSeconds: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));

  return `Muitas tentativas. Tente novamente em ${minutes} ${minutes === 1 ? "minuto" : "minutos"}.`;
}

/**
 * Primeiro valor de x-forwarded-for. Devolve undefined quando o header esta' ausente ou
 * vazio — e' o sinal para a rota aplicar somente o limite por username.
 */
export function resolveClientIp(forwardedFor: string | null | undefined): string | undefined {
  const first = forwardedFor?.split(",")[0]?.trim();

  return first ? first : undefined;
}
