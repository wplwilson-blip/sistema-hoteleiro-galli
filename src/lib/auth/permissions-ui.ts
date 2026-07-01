// Helpers PUROS e CLIENT-SAFE de visibilidade por permissao (Fase 1/2).
// NAO importa "server-only" nem toca em backend — apenas avalia a lista de codigos efetivos
// (store.permissions / SessionContext.permissions). Sentinela "*" (super admin) => true.
// A validacao real continua server-side (requirePermission). Ver docs/codex/17 e /18.

/** true se o usuario pode a acao `code` (ou e' super admin "*"). */
export function canDo(permissions: string[], code: string): boolean {
  return permissions.includes("*") || permissions.includes(code);
}

/** true se o usuario tem QUALQUER um dos `codes` (ou e' super admin "*"). */
export function canAny(permissions: string[], codes: string[]): boolean {
  return permissions.includes("*") || codes.some((code) => permissions.includes(code));
}
