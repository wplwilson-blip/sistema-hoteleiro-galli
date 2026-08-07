// Stub de `server-only` para o runner puro de tests/unit.
// O pacote real nao existe em node_modules: o Next o resolve internamente durante o build.
// Sem este stub, importar qualquer modulo com `import "server-only"` (ex.: permissions.ts)
// quebra com MODULE_NOT_FOUND no runner. Mapeado em tests/unit/tsconfig.json — o build de
// producao NAO usa este mapeamento, entao a protecao real do `server-only` fica intacta.
export {};
