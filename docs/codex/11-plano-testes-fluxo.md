# Plano — Sprint de testes de fluxo E2E (Playwright): Compras & RH com foco em Unidade Ativa

> **Documento de planejamento. Sem código de teste ainda.** Testes rodam contra **STAGING**
> (nunca produção). Decisões do dono já fixadas: (a) fluxo **completo incluindo ESCRITA**
> (criar/aprovar); (b) cada teste **cria e limpa os próprios dados**.

---

## 1. Inventário da infra de teste atual (o que reusar)

Verificado no repo:

- **Playwright** `@playwright/test` **1.59.1** instalado. Config em `playwright.config.ts` (raiz):
  - `testDir: "./tests/screenshots"`, `timeout: 60_000`, `fullyParallel: false`, reporter `list`.
  - `use.baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000"`.
  - `screenshot: "only-on-failure"`, projeto único `chromium`.
- **Scripts npm:** `screenshots:auth` (login manual headed), `screenshots:rh`, `screenshots:compras`,
  `screenshots:ui`.
- **Login (reusar):** `tests/screenshots/auth.manual.spec.ts` abre `/login`, espera o usuário logar
  **manualmente** (headed, até 180s) e salva o `storageState` em **`playwright/.auth/user.json`**
  (gitignored). Inclui `normalizeStoredCookieValues` (corrige cookies URL-encoded).
- **Specs (reusar padrões):** `compras.spec.ts`/`rh.spec.ts` usam `test.use({ storageState })`,
  `beforeAll` que exige a sessão salva, e helpers robustos: `assertAuthenticatedRoute`,
  `waitForStyledApp` (espera CSS/fonts/“Carregando” sumir), `isLoginUrl`. Hoje só capturam
  screenshots — **não criam dados nem afirmam fluxo**.
- **Como aponta para staging:** o app local (`next dev`) usa `.env.local` → **Supabase de
  STAGING**. O Playwright bate em `PLAYWRIGHT_BASE_URL` (default `localhost:3000`). Logo, E2E =
  **Next local contra DB de staging**. ⚠️ **Nunca** apontar `PLAYWRIGHT_BASE_URL` para um deploy
  de produção.

**Reusável imediatamente:** config base, padrão de `storageState`, `waitForStyledApp`,
`assertAuthenticatedRoute`, `normalizeStoredCookieValues`. **Falta criar:** helpers de
login programático, criação/limpeza de dados, troca de unidade, geração de CPF, e os specs de fluxo.

> 🚩 **Login para E2E de escrita:** o login atual é **manual/headed** (bom para screenshots, ruim
> para CI/repetição). Para a sprint, proponho um **helper de login programático** que faz POST em
> `/api/auth/login` (username+senha do usuário de teste, vindos de env) e injeta os cookies no
> contexto — reaproveitando o fluxo real de auth, sem UI. Mantém `screenshots:auth` como está.
> Confirmar a abordagem.

---

## 2. Estratégia de dados (os 2 problemas conhecidos)

### 2.1 SOFT-DELETE (não apaga de verdade)
`deleted_at` marca exclusão; "limpar o que criou" via UI **não remove a linha**. Sem cuidado, o
staging acumula lixo e (pior) colide em chaves únicas. Opções avaliadas:

| Abordagem | Prós | Contras |
|---|---|---|
| **A. Marcador + soft-delete via app, aceitar acúmulo** | simples; usa só a app | acumula linhas; pode colidir em índices únicos parciais (ex.: CPF é `where deleted_at is null`, então soft-deletado **não** colide — ajuda) |
| **B. Marcador + script de EXPURGO (hard-delete) staging-only** | staging limpo de verdade | precisa de script com `service_role` (fora da app); risco se mal-guardado |
| **C. Sem marcador, dados 100% únicos por execução** | zero colisão | acúmulo infinito; difícil auditar/limpar |

**Recomendação:** **A + B combinados**:
- **Todo dado de teste leva um marcador identificável** no nome/título: prefixo **`[E2E]`** +
  sufixo único por execução (ver 2.2). Ex.: colaborador `"[E2E] Fulano 1718900000-ab12"`.
- Cada teste, no teardown, faz o **soft-delete pela própria app** (DELETE/inativar) — mantém o
  fluxo realista e tira o item das listas.
- **Expurgo real opcional** (`scripts/e2e-purge.ts`, **fora** de `src/`, rodável sob demanda):
  hard-delete das linhas com marcador `[E2E]`, **com guardas** (aborta se a URL não for o ref de
  staging `jascnmgagejlvjlenduv`; nunca roda sozinho no CI sem flag explícita). Mantém o staging
  enxuto sem poluir produção nem a app.
- **Nota técnica que ajuda:** o índice único de CPF é **parcial** (`where deleted_at is null`),
  então um colaborador **soft-deletado libera o CPF** — reduz colisão mesmo sem hard-delete.

> 🚩 **Decisão sua:** aprovar o **script de expurgo hard-delete (B)** com `service_role`
> staging-only, ou ficar só no **soft-delete + marcador (A)** e aceitar acúmulo? O hard-delete
> toca o banco diretamente (área sensível) — **não decido sozinho.**

### 2.2 CPF ÚNICO POR ORGANIZAÇÃO
Colaborador tem CPF único por organização (índice parcial, migration 068). Dados fixos colidem
entre execuções. **Proposta:** **gerar CPF válido e único por execução**:
- Helper `generateValidCpf(seed)` que produz os 9 primeiros dígitos a partir de um seed único
  (timestamp + contador/uuid curto) e **calcula os 2 dígitos verificadores** pelo **mesmo
  algoritmo já existente** (`isValidCpf` em `src/lib/base-cadastros/schemas.ts`) — o helper de
  teste pode até **importar `isValidCpf`** para auto-conferir o CPF gerado antes de usar.
- Demais identificadores (username, nome, número de solicitação livre) também recebem o sufixo
  único da execução (ex.: `Date.now()`-derivado + random curto).

### 2.3 PRÉ-REQUISITO MULTIUNIDADE
Os testes de unidade ativa exigem **≥ 2 unidades** e **um usuário com acesso a ambas**.
Estado atual do staging (verificado em sprints anteriores): unidades **GALLI PRAIA** e
**Hotel Galli**; `wilson.admin` tem acesso às duas, **mas é SUPER_ADMIN** (vê tudo via
`getAllActiveUnitIds`) — bom para testar **troca**, fraco para provar **estreitamento** (super
admin sempre enxerga todas as unidades acessíveis = todas).

**Proposta:**
- **Usar as 2 unidades já existentes** no staging (não criar unidades no teste).
- Definir **dois usuários de teste** (via env, sem hardcode de senha no repo):
  - `E2E_ADMIN` — super admin (já existe: `wilson.admin`) para fluxos de **escrita/aprovação**.
  - `E2E_MULTI` — **usuário NÃO-super com acesso às 2 unidades** + permissões necessárias
    (compras/RH view+manage), para provar o **escopo por unidade ativa** de verdade.
- O `E2E_MULTI` provavelmente **não existe** hoje. Opções: (i) criar uma vez via UI/seed manual no
  staging e guardar credenciais em env; (ii) um setup global do Playwright criar via API admin.

> 🚩 **Decisão sua:** posso **criar o usuário `E2E_MULTI`** (não-super, 2 unidades) no staging
> (seed único) **ou** você prefere fornecer credenciais de um usuário já existente que sirva?
> Sem isso, os testes de estreitamento por unidade ativa ficam limitados ao super admin.

---

## 3. Fluxos a cobrir (âncora, não exaustivo)

### 3.1 COMPRAS — fluxo completo com escrita
1. (setup) garantir um **fornecedor `[E2E]`** na unidade ativa (criar se não houver).
2. Criar **solicitação** de compra `[E2E]` na **unidade A** (valor **≤ R$ 200** → alçada Gerência).
3. Criar **cotação** vencedora (com evidência mínima válida) e **selecionar vencedora**.
4. **Enviar para aprovação** → status “Aguardando aprovação da Gerência Administrativa”.
5. **Aprovar** (com usuário/perfil de alçada adequado) → status “Compra aprovada”.
6. **Variante de alçada:** repetir com valor **> R$ 200** → exige **Diretoria Geral**; afirmar que
   a alçada subiu (status/branch correto) e que aprovar exige o vínculo de diretor.
- **Asserções de unidade ativa:** a **lista de solicitações/cotações reflete a unidade ativa**;
  ao trocar para a **unidade B**, a solicitação `[E2E]` da A **some** da lista; **Aprovações
  permanece aggregate** (mostra a solicitação independentemente da unidade ativa).

### 3.2 RH — admissão + uma ação de fluxo + transferência
1. Criar/admitir **colaborador `[E2E]`** (CPF válido único — 2.2) na **unidade A**.
2. Uma ação de fluxo: **avaliação** (criar via template) **ou** **movimentação** (escolher 1).
3. **Caso de TRANSFERÊNCIA entre hotéis:** criar **movimentação** com **destino na unidade B** —
   afirmar que o **seletor de unidade/depto de destino oferece a unidade B** (valida o **opt-out
   `?scope=aggregate`** das opções de destino), e que a movimentação é criada.
- **Asserções de unidade ativa:** a **lista de colaboradores/movimentações reflete a unidade
  ativa**; o colaborador `[E2E]` da A **não aparece** com a unidade B ativa; **consolidados/
  relatórios de RH continuam mostrando** (aggregate).

### 3.3 UNIDADE ATIVA (transversal)
- Trocar a unidade no **header** (`ActiveUnitSwitcher`) e afirmar que **a lista muda** (refetch).
- Afirmar o **invariante B-misto**: um item operacional de outra unidade **some da lista
  operacional** mas **continua no consolidado/aprovação** (rede).
- Afirmar **persistência**: após `reload`, a unidade ativa escolhida permanece (cookie).
- Afirmar **exceção de rede**: fornecedor corporativo (`unit_id` nulo) / item de rede continua
  visível ao trocar de unidade (onde aplicável e com usuário adequado).

---

## 4. Asserções (afirmar resultado, não só navegar)

Cada fluxo **afirma estado**, não “clicou sem erro”:
- **Status mudou:** badge/título esperado após cada transição (ex.: “Compra aprovada”).
- **Apareceu/sumiu da lista certa:** `expect(locator).toBeVisible()` / `.toHaveCount(0)` filtrando
  pelo marcador `[E2E]` + sufixo único da execução (evita falso positivo com dado de outra run).
- **Unidade ativa:** após trocar a unidade, afirmar presença na lista da unidade dona e **ausência**
  na outra; e **presença** no consolidado/aprovação (aggregate).
- **Alçada:** afirmar o nível exigido conforme o valor (≤200 Gerência / >200 Diretoria).
- Preferir **locators por papel/label/placeholder** (como os specs atuais já fazem) e **âncoras de
  texto únicas** (o sufixo da execução), reduzindo flakiness.

---

## 5. Estrutura proposta

- **Specs:** `tests/e2e/` (separado de `tests/screenshots/`). Naming por fluxo:
  `compras-fluxo.e2e.spec.ts`, `rh-admissao-movimentacao.e2e.spec.ts`,
  `unidade-ativa.e2e.spec.ts`.
- **Helpers compartilhados:** `tests/e2e/helpers/`:
  - `auth.ts` — login programático (POST `/api/auth/login`) + storageState por usuário (`E2E_ADMIN`,
    `E2E_MULTI`); reusa `normalizeStoredCookieValues`.
  - `data.ts` — criação via UI (ou via API quando estável) de fornecedor/solicitação/colaborador
    `[E2E]`; geração de sufixo único e **`generateValidCpf`** (usa `isValidCpf`).
  - `active-unit.ts` — `switchActiveUnit(page, unitName)` (usa o `<select aria-label="Trocar unidade ativa">`)
    e helpers de asserção “consta/não consta na lista”.
  - `cleanup.ts` — teardown por teste (soft-delete via app); registro dos IDs criados.
- **Config:** `playwright.config.ts` ganha (ou um 2º config) `testDir` cobrindo `tests/e2e`
  **sem** quebrar `screenshots`. Possível: `testMatch`/projetos separados, ou
  `--config`/`--testDir` no script.
- **Script npm:** `test:e2e` → `playwright test tests/e2e --project=chromium`
  (e `test:e2e:headed` para depurar). `PLAYWRIGHT_BASE_URL` aponta para o `next dev` local
  (staging DB). **Guard recomendado:** o setup global **aborta** se detectar URL/host de produção.

---

## 6. Ordem de implementação (sub-tarefas revisáveis)

Cada item é uma branch/diff próprio, com aceite:

- **T1 — Infra + helpers (sem fluxo):** `tests/e2e/` + `auth.ts` (login programático 2 usuários) +
  `data.ts` (sufixo único + `generateValidCpf`) + `active-unit.ts` + script `test:e2e` + guard
  anti-produção. **Aceite:** um spec mínimo loga como `E2E_ADMIN` e `E2E_MULTI`, abre uma página
  autenticada e afirma estar logado; `test:e2e` roda verde contra staging local.
- **T2 — Compras (1 fluxo completo):** solicitação ≤R$200 → cotação → vencedora → enviar → aprovar,
  com asserções de status + unidade ativa (lista escopada vs aprovações aggregate). **Aceite:**
  fluxo cria, transita e **afirma** “Compra aprovada”; teardown soft-deleta; sem resíduo visível.
- **T3 — Compras alçada Diretoria:** variante >R$200 afirmando exigência de Diretoria. **Aceite:**
  asserção da alçada correta.
- **T4 — RH (admissão + 1 ação):** admitir colaborador `[E2E]` (CPF único) + avaliação **ou**
  movimentação simples na unidade. **Aceite:** colaborador criado aparece na lista da unidade;
  ação concluída e afirmada; teardown.
- **T5 — RH transferência entre hotéis:** movimentação com destino na unidade B (valida opt-out de
  destino agregado). **Aceite:** destino B disponível e movimentação criada/afirmada.
- **T6 — Unidade ativa transversal:** troca no header + invariante B-misto (some da lista, fica no
  consolidado) + persistência por reload. **Aceite:** asserções de presença/ausência corretas com
  `E2E_MULTI`.
- **T7 (opcional) — Expurgo:** `scripts/e2e-purge.ts` staging-only (se aprovado em 2.1/B).
  **Aceite:** remove só linhas `[E2E]`, com guardas; dry-run por padrão.

Dependência: **T1 primeiro**; T2–T6 independentes após T1; T6 depende de `E2E_MULTI` (2.3).

## 7. Riscos e o que NÃO automatizar agora

- **Produção:** risco máximo. Mitigação: guard no setup global (aborta se host ≠ staging local);
  `PLAYWRIGHT_BASE_URL` nunca aponta para deploy; segredos só em env local, fora do repo.
- **Isolamento entre execuções:** garantido por marcador `[E2E]` + sufixo único; asserções
  filtram pelo sufixo da run (não por texto genérico).
- **Acúmulo no staging (soft-delete):** mitigado por marcador + expurgo opcional (2.1).
- **Flakiness E2E:** reusar `waitForStyledApp`; preferir asserções de estado a `waitForTimeout`;
  `fullyParallel: false` (ou serial nos fluxos com escrita) para evitar corrida de dados.
- **Tempo de execução:** fluxos de escrita são lentos; manter o conjunto enxuto (1 fluxo por
  família + transversal). Rodar headed só para depurar.
- **Dependência de dados de catálogo:** templates de avaliação / perfis / alçada precisam existir
  no staging; T4/T2 devem **garantir pré-requisitos** ou pular com aviso se ausentes (relatar).
- **NÃO automatizar agora:** Recepção/Manutenção/Governança/A&B (placeholders), e-mails/notificações,
  upload real de arquivos grandes, e cenários de permissão exaustivos (deixar para teste manual).

## 8. Decisões pendentes (resumo para aprovação)

1. **Login programático** via `/api/auth/login` para E2E (mantendo `screenshots:auth` manual)?
2. **Estratégia de limpeza:** soft-delete + marcador (A) **ou** A + **script de expurgo hard-delete
   staging-only** (B)? (B toca o banco diretamente.)
3. **Usuário `E2E_MULTI`** (não-super, 2 unidades): posso **criar no staging** (seed) ou você
   fornece credenciais de um existente?
