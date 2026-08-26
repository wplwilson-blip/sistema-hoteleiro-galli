// Resposta de falha do login (plano docs/codex/54, fatia 1).
//
// PURO de proposito, e sem `server-only`: e' consumido pela rota de login (server) e
// testado direto em tests/unit pelo runner puro.
//
// O ponto desta funcao e' NEGATIVO: garantir que todos os motivos ANTERIORES a' prova da
// senha colapsem na MESMA resposta. Antes disto, a rota respondia:
//   - usuario inexistente/inativo -> 401 "Usuario ou senha invalidos."
//   - usuario existente SEM VINCULO -> 403 "Acesso bloqueado. Procure o administrador."
// ...os dois ANTES de verificar a senha. Ou seja: qualquer pessoa, sem conhecer senha
// nenhuma, distinguia "esse usuario nao existe" de "esse usuario existe e esta' sem
// vinculo". Isso e' enumeracao de contas.
//
// A correcao nao e' esconder o 403 — ele continua existindo e continua informativo. E'
// so' alcancavel DEPOIS que a senha foi provada correta (ver a ordem em login/route.ts).

export const INVALID_LOGIN_MESSAGE = "Usuario ou senha invalidos.";

/**
 * Motivos de falha do login.
 *
 * Os quatro primeiros sao PRE-SENHA (ou equivalentes a credencial errada) e precisam ser
 * indistinguiveis para o cliente. Os dois ultimos so' acontecem depois de a senha ter sido
 * aceita, entao podem ser informativos sem vazar nada a quem nao tem a credencial.
 */
export type LoginFailureReason =
  | "user_not_found"
  | "user_inactive"
  | "user_lookup_failed"
  | "invalid_password"
  | "no_active_unit"
  | "no_session_context";

export type LoginFailureResponse = {
  status: number;
  message: string;
  /** Falhas de credencial recebem piso de tempo antes de responder; as demais, nao. */
  padded: boolean;
};

/** Motivos que precisam ser indistinguiveis entre si para quem esta' do outro lado. */
const CREDENTIAL_FAILURE_REASONS: LoginFailureReason[] = [
  "user_not_found",
  "user_inactive",
  "user_lookup_failed",
  "invalid_password"
];

export function isCredentialFailure(reason: LoginFailureReason): boolean {
  return CREDENTIAL_FAILURE_REASONS.includes(reason);
}

export function resolveLoginFailureResponse(reason: LoginFailureReason): LoginFailureResponse {
  if (isCredentialFailure(reason)) {
    return { status: 401, message: INVALID_LOGIN_MESSAGE, padded: true };
  }

  if (reason === "no_active_unit") {
    // So' alcancavel com a senha correta (login/route.ts chama signOut antes de responder).
    return { status: 403, message: "Acesso bloqueado. Procure o administrador do sistema.", padded: false };
  }

  return { status: 403, message: "Nao foi possivel carregar seu perfil de acesso.", padded: false };
}
