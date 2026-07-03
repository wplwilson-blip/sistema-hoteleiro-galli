# Plano — rodar a suíte E2E contra o build de produção local (next build + next start)

> 2026-07-02 · Branch `feat-fase3c-editar-perfis`. **PLANO, não código.** Read-only, sem commit.
> Motivação: sob `next dev` + 4 workers batendo em rotas pesadas de compras, o dev server fica
> instável (queda de processo; `Invalid hook call` / `useContext` null no `AppSidebar` via HMR →
> `GET /compras/solicitacoes 500`), gerando falhas que **não são dos testes**. Produção local
> (`next build` + `next start`) elimina recompilação sob demanda, cold start e HMR.

---

## 1. Como a suíte sobe o servidor hoje

**Manualmente, por fora — NÃO há orquestração automática.**

- `playwright.e2e.config.ts` **não tem** bloco `webServer` (grep confirma: só existe `baseURL:
  process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000"` na **linha 39**). Ou seja, o Playwright
  **não** inicia nem derruba servidor; ele só aponta o `baseURL`.
- O `globalSetup` (`tests/e2e/global-setup.ts:12-38`) faz **apenas** o guard anti-produção do **host**
  do `PLAYWRIGHT_BASE_URL` (allowlist localhost/127.0.0.1/::1). Não sobe servidor.
- Scripts (`package.json:5-16`): `dev = next dev`, `build = next build`, `start = next start`;
  `test:e2e = playwright test --config=playwright.e2e.config.ts`. Nenhum deles sobe/gerencia o
  servidor da app.
- Fluxo real (usado nesta sessão inteira): **um** terminal roda `npm run dev` em background; **outro**
  roda `npm run test:e2e`. Toda a instabilidade vem desse `next dev`.

---

## 2. Proposta para usar produção local

**Comando:** `next build` (uma vez) → `next start` (porta 3000). `next start` serve o bundle já
compilado — sem recompilar rota por request, sem cold start, sem HMR.

**Onde configurar — recomendação: `webServer` do Playwright + um script npm dedicado.** Duas peças:

- **(a) Bloco `webServer` no `playwright.e2e.config.ts`** (proposta ilustrativa, não é o código final):
  ```ts
  webServer: {
    command: "npm run start",              // next start (serve o build existente)
    url: "http://localhost:3000/login",    // readiness real (rota pública)
    reuseExistingServer: true,             // se ja houver um next start no ar, reusa
    timeout: 120_000                       // margem para o start subir
  }
  ```
  Assim o Playwright sobe/derruba o `next start` sozinho e o `globalSetup` (guard) continua rodando.
- **(b) Script npm que garante o BUILD antes** — porque `next start` exige um build existente:
  ```json
  "test:e2e:prod": "next build && playwright test --config=playwright.e2e.config.ts --project=chromium"
  ```
  O `next build` roda 1×; o `webServer` sobe o `next start`; os testes rodam contra o build.

> Alternativa mais simples (menos recomendada): `webServer.command = "npm run build && npm run start"`.
> Fica self-contained numa única invocação, **mas rebuilda a cada execução** (lento). Preferir o script
> com build separado, que permite reusar o build entre re-execuções da suíte.
>
> Observação de coexistência: como hoje a suíte é rodada com o servidor manual, adicionar `webServer`
> com `reuseExistingServer: true` **não quebra** quem já subiu um servidor na 3000 — ele reusa. Mas
> atenção: se alguém tiver um `next dev` na 3000, o `webServer` vai **reusá-lo** (dev), não o build.
> Para validação "de verdade" contra produção, garantir que **nada** esteja na 3000 antes, ou usar
> `reuseExistingServer: false` no fluxo de validação.

**Uso de `.env.local` (staging) — ponto crítico:**
- `next build` **e** `next start` carregam `.env.local` automaticamente (Next). Então o build usa o
  **mesmo** Supabase de staging.
- ⚠️ **Risco novo, específico de build:** as variáveis `NEXT_PUBLIC_*` são **inlined em BUILD TIME**.
  Se o `next build` rodar com `.env.local` apontando para **produção**, o bundle sai **congelado** com
  a URL de produção — e aí o `next start` fala com produção **mesmo** com `PLAYWRIGHT_BASE_URL=localhost`.
  O guard atual (`global-setup.ts`) só valida o **host do alvo**, **não** o DB embutido no build — logo
  **não pega** esse caso.
- **Como garantir staging:** adicionar uma **checagem pré-build** (no script `test:e2e:prod` ou como
  passo do plano de implementação) que **aborta** se `NEXT_PUBLIC_SUPABASE_URL` do `.env.local` **não**
  for `https://jascnmgagejlvjlenduv.supabase.co` (staging). É a mesma ref que confirmamos várias vezes
  nesta sessão. Isso fecha a lacuna que o guard de host não cobre. (Detalhe de implementação a definir
  no próximo passo — pode ser um pequeno check no script ou estender o `global-setup`, mas o
  `global-setup` roda **depois** do build, então o ideal é a checagem **antes** do `next build`.)

---

## 3. Impacto nos testes — dependem de comportamento do dev server?

**Não há dependência de comportamento dev-only.** Verificado:
- Os specs asseram **status HTTP** e **mensagens de negócio** das rotas (ex.: perfis-super-admin
  asserta 422 + `"O perfil Super Administrador nao pode ser editado."`) — isso é lógica do app,
  **idêntica** em dev e prod.
- Nenhum spec depende de **overlay de erro do dev**, **HMR**, **stack trace** ou rota de debug. As
  falhas de dev que vimos (`Invalid hook call`, 500 de SSR) são justamente o que **queremos eliminar**.
- `openAuthenticated` espera `<main>` visível — mesmo comportamento em prod (na verdade mais rápido:
  sem compilar a rota).
- O **warm-up de hidratação** (correcao 2, `active-unit.ts`) continua correto e **resolve mais rápido**
  em prod (bundle já pronto → hidratação quase imediata). Nada a mudar nos specs.
- Logs `[e2e][teardown]`/console são do lado do teste — inalterados.

Conclusão: migrar para prod **não** exige tocar spec algum.

---

## 4. Trade-offs honestos

- **Custo de subida:** `next build` compila **uma vez** (esta app tem 95 rotas; o build já rodou nesta
  sessão com sucesso — ordem de ~1–2 min). Depois, `next start` sobe em segundos e é **estável**.
- **Tempo total da suíte:** no `dev`, havia picos de **compilação sob demanda no meio dos testes**
  (rotas compilando: 12–16s de espera vistas no log) + reexecuções por instabilidade. Em prod esses
  picos **somem** e cada teste roda determinístico. Trocamos "muitos custos aleatórios espalhados" por
  "um custo fixo de build no início". Para uma **suíte completa**, prod tende a ser tempo comparável ou
  menor **e** muito mais confiável.
- **Fluxo de quem roda localmente:** para **iterar em código de app**, `next dev` é melhor (reload
  instantâneo, sem rebuild). Para **validar/CI**, prod é melhor (estável, sem HMR).
- **Recomendação: manter as DUAS opções.** Conservar `test:e2e` (dev, iteração rápida) e adicionar
  `test:e2e:prod` (build+start, validação). Não remover o caminho dev. Assim, desenvolvimento fica ágil
  e a validação fica determinística.

---

## 5. Escopo da mudança — toca produto?

**Não toca produto.** A mudança fica **100% em infraestrutura de teste**:
- `playwright.e2e.config.ts` (adicionar `webServer`) — config de teste.
- `package.json` (novo script `test:e2e:prod` + checagem pré-build) — scripts.
- (Opcional) um pequeno guard de env de staging pré-build — utilitário de teste/infra.

**Nenhum** componente, rota, store, migration ou schema é alterado. Confirmado.

---

## 6. Sobre os 4 workers em produção local

**Leitura:** a instabilidade que vimos (`Invalid hook call`/`useContext` null, quedas) é **artefato de
`next dev`/HMR/compilação concorrente** — **não** ocorre em `next start`. Produção local aguenta os 4
workers **muito** melhor, porque não há compilação sob carga. Então:
- **Com prod, provavelmente não é preciso reduzir workers** por causa do servidor. `fullyParallel` já é
  `false` (`playwright.e2e.config.ts:36`) e há só ~4 specs chromium, então o paralelismo efetivo é
  modesto.
- O que o número de workers **ainda** afeta em prod: **carga no Supabase de staging** (2 fluxos de
  compras em paralelo dobram as escritas/leituras no DB) e **CPU local**. Se aparecer **429**
  (rate-limit do Supabase Auth) ou contenção de CPU, aí sim reduzir para **2** é um hedge barato.
- **Recomendação:** manter **4 workers** em prod por padrão (mais rápido) e **só** reduzir se surgir
  429/contenção. A correção de estabilidade vem do `next start`, não de mexer nos workers.

---

## Resumo para a revisão aprovar

1. Adicionar `webServer` ao `playwright.e2e.config.ts` rodando `next start` (`reuseExistingServer`,
   `timeout` generoso, `url` de readiness).
2. Adicionar script `test:e2e:prod = "next build && playwright test --config=... --project=chromium"`,
   **com checagem pré-build** que aborta se `.env.local` não for staging (`jascnmgagejlvjlenduv`) —
   fechando a lacuna do `NEXT_PUBLIC_*` inlined em build time (o guard de host não cobre isso).
3. **Manter** `test:e2e` (dev) para iteração rápida; usar `test:e2e:prod` para validação.
4. Escopo 100% em config/scripts de teste; **não** toca produto. Specs inalterados.
5. Manter 4 workers em prod; reduzir só se aparecer 429/contenção.

**Aguardando aprovação** antes de escrever o código.
