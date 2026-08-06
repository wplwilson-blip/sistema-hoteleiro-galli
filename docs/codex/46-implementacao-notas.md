# 46 — Notas de implementação: runner permanente para `tests/unit`

Referência: `docs/codex/46-plano-wire-teste-unitario.md`. Área não sensível (tooling de
teste). Executado no mesmo branch da correção P0 (`fix/permission-override-precedence-p0`),
para o P0 e seu teste executável entrarem juntos no merge.

## O que mudou

1. **`playwright.unit.config.ts` (novo)** — config dedicada com `testDir: ./tests/unit`,
   `fullyParallel: true`, `reporter: "list"`. Sem webServer, sem browser, sem globalSetup.
   Conteúdo exato da seção 3.1. Isolada das duas configs existentes (cada uma com seu
   próprio `testDir`).

2. **`package.json` (+1 linha)** — script `"test:unit": "playwright test --config=playwright.unit.config.ts"`,
   adicionado entre `screenshots:ui` e `test:e2e`. Nada removido nem alterado.

3. **`tests/unit/override-precedence.spec.ts` (opcional 3.3)** — adicionado o caso "allow e
   deny na mesma unidade → deny vence" (linked `{A,B}`, base `{A,B}`, overrides
   `[u(A,true), u(A,false)]`, esperado `{B}`), coberto pela mesma matriz + invariância de
   ordem. Fecha a última combinação de precedência.

## O que NÃO foi tocado (conforme restrições)

- `playwright.config.ts` e `playwright.e2e.config.ts` — inalterados (confirmado por
  `git diff --stat`, saída vazia).
- `src/lib/auth/override-precedence.ts` e `src/lib/auth/permissions.ts` — não aparecem no
  `git status` desta rodada.
- Sem novas dependências (Playwright já instalado).

## Resultados

- **`npm run test:unit`** → **14 passed** (7 casos da matriz + 7 de invariância de ordem),
  em ~5s, sem browser e sem webServer.
- **`npm run lint`** → `✔ No ESLint warnings or errors`.
- **`npm run build`** → `✓ Compiled successfully`, `✓ Generating static pages (95/95)`,
  exit 0.
- **`git diff --stat -- playwright.config.ts playwright.e2e.config.ts`** → vazio (configs
  existentes intactos).

## Fora de escopo (não encostado)

- Wiring em CI (GitHub Actions).
- Migração para `vitest`.
- Qualquer mudança na lógica de autorização.

## Git

Commit + push no branch `fix/permission-override-precedence-p0`. **Sem merge** — aguardando
revisão.
