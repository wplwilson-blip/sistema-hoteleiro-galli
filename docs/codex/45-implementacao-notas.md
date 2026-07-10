# 45 — Notas de implementação: precedência determinística de overrides (P0)

Referência: `docs/codex/45-plano-precedencia-overrides-permissao.md` (aprovado).
Escopo executado: seções 4.1, 4.2 e 7 do plano. Sem migration, sem schema, sem mudança
no gate de autorização.

## O que mudou

Diff limitado a 3 arquivos (+ o próprio plano, criado nesta rodada), conforme critério
de aceite (seção 8):

1. **`src/lib/auth/override-precedence.ts` (novo)** — função pura `resolveOverrideAccess`
   e o tipo `PermissionOverrideRow`. Sem `server-only`, sem Supabase, sem imports do Next
   (só `Set`/array). Implementa a precedência da seção 3: por-unidade > global > base;
   deny vence allow na mesma especificidade; determinístico e independente da ordem das
   linhas. Código idêntico ao da seção 4.1.

2. **`src/lib/auth/permissions.ts` (bloco substituído)** — em `applyUserPermissionOverrides`,
   o loop dependente de ordem (`for (const override of data ?? [])`) foi trocado por uma
   chamada a `resolveOverrideAccess`, seguida de reescrita in-place de `allowedUnitIds`
   (seção 4.2). Preservados: o `select` dos overrides, o tratamento de erro
   (`permission_overrides_lookup_failed`), a assinatura da função e o contrato de mutar
   `input.allowedUnitIds`. Um único import novo foi adicionado
   (`resolveOverrideAccess` de `@/lib/auth/override-precedence`). Nada mais no arquivo mudou:
   ramo super admin, `hasNetworkScope`, `hasPermission` e o estreitamento active-unit
   ficaram intactos.

3. **`tests/unit/override-precedence.spec.ts` (novo)** — usa `@playwright/test` já instalado
   como runner puro (sem browser, sem webServer: nenhuma fixture `page`/`context`). Cobre
   os 6 casos da matriz da seção 7 e, para cada caso, um teste de invariância de ordem que
   percorre **todas as permutações** do array de overrides e exige resultado idêntico
   (prova mais forte que "original e revertido") — esta é a prova direta do P0.

## Nota sobre o runner do teste (transparência)

Nenhum `testDir` das configs versionadas (`playwright.config.ts` → `tests/screenshots`;
`playwright.e2e.config.ts` → `tests/e2e`) cobre `tests/unit`. Conforme a seção 7 do plano,
**não** alterei nenhuma config do Playwright (mudança de `testDir`/`webServer` é limítrofe).
Para executar o teste puro sem tocar nas configs versionadas, usei uma config **temporária,
não comitada**, na raiz do repo (`testDir: ./tests/unit`, sem webServer/browser/globalSetup),
removida logo após rodar. O `git status` final confirma que ela não ficou no diff.

Para o revisor rodar localmente, basta uma config equivalente apontando `testDir` para
`tests/unit` — ou, se preferirem uma forma permanente, isso é uma decisão de config a
combinar (fora do escopo deste diff mínimo).

## Resultados

- **`npm run lint`** → `✔ No ESLint warnings or errors`.
- **`npm run build`** (`next build`, com type-check estrito incluindo `tests/**`) → sucesso,
  sem erros de tipo. O teste unitário e o módulo novo compilam sob `strict: true`.
- **Teste unitário** (runner puro via config temporária) → **12 passed** (6 da matriz +
  6 de invariância de ordem). Todos os casos resolvem conforme a tabela da seção 7 e o
  resultado independe da ordem/permutação dos overrides.

## Itens do critério de aceite NÃO exercidos nesta sessão

- **Screenshots de RH e Compras** (regressão de UI): exigem servidor vivo + `storageState`
  autenticado + variáveis de ambiente do Supabase, indisponíveis nesta sessão. Não foram
  executados aqui — sinalizado para o revisor rodar (`npm run screenshots:rh` /
  `npm run screenshots:compras`) no ambiente apropriado. A mudança é um refactor
  comportamento-preservador no caminho comum (sem overrides ou sem conflito), então nenhuma
  regressão de UI é esperada.

## Git

Commit + push realizados no branch de trabalho. **Sem merge** — aguardando revisão.
