// Trava de senha temporaria (#5, plano docs/codex/67).
//
// PURO e sem `server-only`: e' consumido pelo afunil de autenticacao (server) e testado
// direto em tests/unit pelo runner puro.
//
// O C7 entregou a tela de troca com um gate de RENDERIZACAO: com a flag armada, o app nao
// e' montado. Mas a sessao e' valida e nenhuma rota checava a flag -- quem chamasse a API
// direto continuava sendo atendido. Este predicado e' o que transforma aquilo em trava de
// verdade.

/**
 * A sessao esta' travada por senha temporaria ainda nao trocada?
 *
 * Sessao nula/ausente devolve false de proposito: quem nao tem sessao e' problema do 401,
 * nao deste guard. Misturar os dois faria uma requisicao sem sessao responder "troque sua
 * senha", que nao ajuda ninguem.
 */
export function isPasswordChangeRequired(
  session: { mustChangePassword?: boolean | null } | null | undefined
): boolean {
  return Boolean(session?.mustChangePassword);
}

/** Mensagem unica da trava — usada no afunil e nas rotas que nao passam por ele. */
export const PASSWORD_CHANGE_REQUIRED_MESSAGE = "Troque sua senha temporaria antes de continuar.";
