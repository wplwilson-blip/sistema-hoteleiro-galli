# 46 — Plano: ligar o teste unitário à tooling (runner permanente para `tests/unit`)

> Follow-up do doc 45. Área **não sensível** (tooling/config de teste — não é Auth, RLS,
> migration, schema nem helper de permissão). Ainda assim segue o rito: plano → Codex →
> revisão → merge. Sem novas dependências. Sem tocar na lógica da correção do 45.

## 1. Contexto

O doc 45 adicionou `tests/unit/override-precedence.spec.ts` e proibiu alterar os configs
versionados do Playwright. Resultado: o teste **passa** (12/12, comprovado), mas **nenhum
config comitado o executa** — só rodou via config temporária não comitada. Ele é
type-checked no `build` (o `tsconfig` inclui `tests/**`), mas não é **executado** por
nenhum comando do repo. É um detector de fumaça instalado e sem energia.

Os dois configs atuais têm `testDir` próprio e não cobrem `tests/unit`:
- `playwright.config.ts` → `./tests/screenshots` (sem webServer)
- `playwright.e2e.config.ts` → `./tests/e2e` (com globalSetup/auth/webServer)

## 2. Objetivo

Dar um jeito **permanente e sem dependência nova** de rodar os testes unitários puros de
`tests/unit`, sem alterar os dois configs existentes e sem subir browser/servidor.

## 3. Mudança proposta

### 3.1 Novo config dedicado (arquivo novo, não mexe nos existentes)

`playwright.unit.config.ts` na raiz do repo:

```ts
import { defineConfig } from "@playwright/test";

// Runner puro para tests/unit: sem webServer, sem browser (nenhum teste usa `page`),
// sem globalSetup. Isolado dos configs de screenshots e e2e (cada um com seu testDir).
export default defineConfig({
  testDir: "./tests/unit",
  fullyParallel: true,
  reporter: "list"
});
```

### 3.2 Script no `package.json`

Adicionar (perto dos scripts de teste/screenshot já existentes), **sem remover nada**:

```json
"test:unit": "playwright test --config=playwright.unit.config.ts"
```

Rodar passa a ser: `npm run test:unit`.

### 3.3 (Opcional, se trivial) Reforçar a matriz do teste

Se for direto, adicionar ao `tests/unit/override-precedence.spec.ts` **um** caso a mais:
`allow` e `deny` por-unidade na **mesma** unidade → `deny` vence (ex.: linked `{A,B}`,
base `{A,B}`, overrides `[u(A,true), u(A,false)]`, esperado `{B}`), com a mesma
invariância de ordem. Não é bloqueante; só fecha a última combinação de precedência.

## 4. Restrições

- **NÃO** alterar `playwright.config.ts` nem `playwright.e2e.config.ts`.
- **NÃO** tocar na lógica do 45 (`override-precedence.ts`, `permissions.ts`).
- **Sem novas dependências.** Playwright já está instalado.
- Fazer no **mesmo branch** da correção — `fix/permission-override-precedence-p0` — para o
  P0 e seu teste executável entrarem juntos no merge. Commit + push, **sem merge**.

## 5. Fora de escopo (parar e sinalizar se encostar)

- Wiring em CI (GitHub Actions) — decisão separada.
- Migrar para `vitest` — decisão separada (devDependency nova).
- Qualquer mudança na lógica de autorização.

## 6. Critério de aceite

- `npm run test:unit` → todos os testes de `tests/unit` passam, **sem** browser e **sem**
  webServer, em segundos.
- `playwright.config.ts` e `playwright.e2e.config.ts` **inalterados** (conferir `git diff`).
- `npm run lint` e `npm run build` continuam passando.
- Diff limitado a: `playwright.unit.config.ts` (novo), `package.json` (+1 linha de script)
  e, se feito o opcional, `tests/unit/override-precedence.spec.ts`.
