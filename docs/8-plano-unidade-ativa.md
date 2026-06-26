# Plano — Unidade ativa com escopo de dados (abordagem B-MISTO)

> **STATUS:** abordagem A (perfil derivado no cliente, backend intacto, dados sempre em
> visão UNIÃO) foi **REJEITADA**. Este documento a substitui pela **abordagem B-MISTO**.
> **Decisão B-MISTO:** o escopo de dados passa a **seguir a unidade ativa**, validado
> **server-side**. "Misto" = nem toda rota estreita: rotas de **OPERAÇÃO** escopam pela
> unidade ativa; rotas de **REDE (consolidadas)** mantêm a visão união.
> **Área SENSÍVEL** (coração da autorização + helpers de sessão — `NAO_ALTERAR.md`).
> NÃO tocar em `auth.getUser()`, login, `auth_email`, Supabase Auth. A unidade ativa é
> camada **ACIMA** da autenticação. Plano → revisão → código, sem exceção.

---

## 0. Achados da revisão de código (base factual)

- `getAccessibleUnitIdsForPermission` (permissions.ts) hoje **sempre** retorna a UNIÃO das
  unidades acessíveis. Super admin → `getAllActiveUnitIds` (todas as unidades ativas).
- `requirePermission` chama esse helper e devolve `accessibleUnitIds` (união) no `context`.
- `session.ts > getSessionContextByAuthUserId`: `activeUnit = units[0]` e `profile = firstLink`
  (1º vínculo por `created_at asc`). `units[]` é montado **só dos links** do usuário — inclusive
  para super admin (trava o seletor do super admin numa unidade só).
- **`login/route.ts` NÃO grava cookie de unidade.** Ele grava os cookies de **auth do Supabase**
  (via `server.ts`) e registra `unit_id` em `system_logs`. ⇒ **Não há cookie de unidade ativa
  para reusar; será criado um novo** (ponto 2).
- **`(app_user_id, unit_id)` NÃO é único** em `user_unit_links`. A unique é
  `user_unit_links_unique_scope (app_user_id, unit_id, department_id, access_profile_id)`
  (migration 003). ⇒ um usuário pode ter **mais de um perfil ativo na mesma unidade**;
  `firstLink` descarta os demais silenciosamente (ponto 3).
- `base-cadastros/api-helpers.ts:37` (`requireSuperAdminRequest`) lê `session.profile.code` →
  o perfil resolvido no servidor precisa ser coerente; **derivar perfil no cliente quebraria
  essa coerência** (por isso B-misto resolve o perfil no servidor).
- Cookies do app (server.ts) usam: `httpOnly: true`, `sameSite: "lax"`, `secure` só em produção,
  `path: "/"`, `maxAge: 7 dias`. Este é o padrão a espelhar no cookie de unidade ativa.
- 25 rotas consomem `requirePermission` (algumas + `assertUnitInPermissionScope`). Tabela na §9.

---

## 1. Ponto 1 — Dois modos em `getAccessibleUnitIdsForPermission`

Sem duplicar lógica. O cálculo da UNIÃO (links + overrides + super admin) **permanece igual**.
Adiciona-se um **filtro final opcional** que estreita o resultado para a unidade ativa.

- Nova opção em `PermissionAuthorizationOptions`:
  `scope?: "aggregate" | "active-unit"` (default **"aggregate"** → comportamento atual).
- Em `getAccessibleUnitIdsForPermission`:
  1. calcula `allowedUnitIds` (união) exatamente como hoje (inclui o caminho super admin);
  2. se `scope === "active-unit"`: `accessibleUnitIds = uniao ∩ [activeUnitId]`
     (o `activeUnitId` validado vem do `session.activeUnit.id`, já resolvido server-side — §3);
- **Quem decide o modo é a ROTA**, explicitamente, passando `{ scope: "active-unit" }`.
  Rotas que não passam nada continuam em `aggregate` (nenhuma regressão).
- `requirePermission(permissionCode, { scope })` apenas repassa a opção ao helper. Sem
  duplicação: o estreitamento é um único `intersect` no fim do cálculo já existente.
- **Super admin em `active-unit`** → `[activeUnitId]` (não todas). Em `aggregate` → todas
  (inalterado).

### 1.1 — 403 vs. lista vazia (leitura unit-scoped)

No modo `active-unit` para **LISTAS**, NÃO responder sempre 403. Distinguir dois casos, sem
afrouxar segurança (nos dois a pessoa não vê dado; muda só a resposta):

- usuário **não tem a permissão em unidade nenhuma** (`hasPermission` na UNIÃO = `false`)
  → **403** (igual a hoje);
- usuário **tem a permissão em alguma unidade**, mas a **unidade ativa não está na união**
  (interseção vazia) → **lista vazia (200)**, não 403.

**Como o helper expõe a distinção (sem duplicar):** `getAccessibleUnitIdsForPermission`
passa a retornar, além de `accessibleUnitIds` (já estreitado quando `active-unit`), os campos
`hasPermission` (calculado SEMPRE sobre a UNIÃO — "tem permissão em ao menos uma unidade?") e
`hasPermissionInScope` (`accessibleUnitIds.length > 0`). `requirePermission`:
- se `hasPermission === false` → **403** (como hoje, em qualquer modo);
- se `hasPermission === true` mas `hasPermissionInScope === false` (interseção vazia) → **não
  bloqueia**: devolve `context` com `accessibleUnitIds = []`. A **rota de lista** então roda a
  query com `in("unit_id", [])` e retorna naturalmente **lista vazia (200)**.
- **Registro único / escrita (aggregate):** nada muda — seguem 403/404 como hoje.

> **Importante:** este modo afeta **leitura/listagem**. A validação de **escrita** (ponto 5)
> permanece em `aggregate` para não afrouxar nada.

---

## 2. Ponto 2 — Cookie de unidade ativa (validado server-side) + endpoint de troca

**Não existe cookie de unidade hoje** ⇒ criar um novo (não há concorrente a reusar).

- **Nome:** `active_unit_id`.
- **Flags (espelhando `server.ts`):** `httpOnly: true`, `sameSite: "lax"`, `secure` só em
  produção, `path: "/"`, `maxAge: 7 dias`. `httpOnly` é seguro porque o **cliente não precisa
  ler** o cookie — o servidor resolve a unidade ativa e a devolve no `SessionContext`.
- **Cookie cru nunca é fonte de verdade:** a cada request, `session.ts` lê o `active_unit_id`
  e **valida** contra os `user_unit_links` ativos reais (§3). Inválido/removido → fallback.
- **Endpoint de troca:** `POST /api/auth/active-unit` (route handler, pode gravar cookie):
  - body `{ unitId }`;
  - valida que o usuário tem `user_unit_links` **ativo** naquela unidade (super admin: que a
    unidade existe e está ativa);
  - se não tiver vínculo → **403** (e não grava cookie);
  - se válido → grava `active_unit_id` e retorna o `SessionContext` recalculado
    (`activeUnit` + `profile` novos). Helpers de cookie ficam em `src/lib/auth/active-unit.ts`
    (`getActiveUnitCookie`, `setActiveUnitCookie`, reusando o padrão de `server.ts`).
- **Login (DECIDIDO):** **não alterar** `login/route.ts` (área sensível). Quando não há cookie
  ainda, o fallback de `session.ts` usa `units[0]` (idêntico ao de hoje). O cookie passa a
  existir quando o usuário troca de unidade pela 1ª vez. (A alternativa de gravar o cookie no
  login foi **descartada** na revisão.)

---

## 3. Ponto 3 — Perfil ativo resolvido NO SERVIDOR + fallback + múltiplos perfis

Em `getSessionContextByAuthUserId`:

- Ler `active_unit_id` (cookie) e procurar entre os `links` ativos do usuário a unidade
  correspondente. **Resolução:**
  - cookie presente **e** há link ativo naquela unidade → `activeUnit` = essa unidade e
    `profile` = perfil **daquele** vínculo;
  - cookie ausente / inválido / vínculo removido → **fallback seguro**: `activeUnit = units[0]`,
    `profile = firstLink` (comportamento atual, sem erro).
- **Múltiplos perfis na mesma unidade (DECIDIDO)** (porque `(app_user_id, unit_id)` não é
  único): hoje o `firstLink` descarta em silêncio. Regra determinística aprovada:
  - **precedência por privilégio**: `SUPER_ADMIN` > demais; empate → `created_at asc` (estável,
    igual à ordenação atual). Assim a troca de unidade é previsível e nunca "sorteia" perfil.
  - **Limitação conhecida (dívida documentada):** o `profile` **não controla acesso a dado** —
    `permissions.ts` une as permissões de **TODOS** os perfis ativos do usuário na unidade.
    Logo a regra é praticamente **cosmética / de menu**. PORÉM, quando existir o **menu filtrado
    por `access_profile` (RH-35C)**, um usuário com 2 perfis **não-super** na mesma unidade verá
    o menu de **apenas um** (o mais antigo), podendo **esconder módulos** do outro perfil.
    Registrar como **dívida conhecida a tratar no RH-35C**.
- **Sem derivação no cliente:** `profile` continua sendo um campo único no `SessionContext`,
  resolvido no servidor — mantém coerência com `requireSuperAdminRequest` (`session.profile.code`).

---

## 4. Ponto 4 — `units[]` do super admin = todas as unidades ativas

Hoje `units[]` (session.ts) é montado só dos links → super admin fica preso a 1 unidade no seletor.

- Em `getSessionContextByAuthUserId`, detectar super admin (mesma checagem usada na autorização:
  perfil `SUPER_ADMIN` em link ativo) e, nesse caso, montar `units[]` a partir de
  **todas as unidades ativas** (equivalente a `getAllActiveUnitIds`), para o super admin poder
  escolher qualquer uma. `unitProfiles` do super admin → `SUPER_ADMIN` em todas.
- `activeUnit` do super admin resolve contra essa lista completa (cookie validado: a unidade
  precisa existir e estar ativa). Fallback → `units[0]` dessa lista completa.
- **Não altera autorização**: `permissions.ts` para super admin já usa `getAllActiveUnitIds`;
  isto apenas alinha o `SessionContext` ao que a autorização já enxerga.

---

## 5. Ponto 5 — Escrita: herda a unidade ativa, sem afrouxar validação

- **Validação server-side de escrita permanece em `aggregate`** (inalterada). As rotas de escrita
  seguem usando `assertUnitInPermissionScope(context, payload.unitId)` / `validateUnitScope`
  contra a **UNIÃO** — ninguém perde a capacidade de escrever onde já podia, e nada é afrouxado.
- **Default da escrita = unidade ativa** (camada de UI/cliente): formulários pré-selecionam
  `payload.unitId = activeUnit.id` (resolve o problema original: cadastro caía em `units[0]`).
- **Trocar a unidade de destino exige escopo explícito**: o usuário muda o campo de unidade no
  formulário (envio consciente de outro `payload.unitId`); o servidor valida normalmente contra
  a união. Ou seja: B-misto estreita **leitura/listagem**; **escrita** mantém validação ampla +
  default na unidade ativa.
- Consequência prática por arquivo: em rotas com `GET` **e** `POST/PATCH` (ex.: departments),
  o **handler GET** passa `{ scope: "active-unit" }`; o **handler de escrita** **não** passa
  scope (continua `aggregate`).

---

## 6. Ponto 6 — Store (Zustand) + invalidação de queries

`src/store/app-store.ts` hoje é MOCK (Marina Costa, unidades hardcoded) e `setActiveUnit` só
troca local, sem persistir nem trocar perfil.

- **Persistência = cookie server-validated** (não localStorage). Em B-misto a fonte de verdade é
  o cookie `active_unit_id`; no reload, o `layout` chama `getCurrentSessionContext()` que lê o
  cookie e devolve `activeUnit`/`profile` corretos. **Descarta-se a ideia de localStorage da
  abordagem A** (seria uma segunda fonte de verdade divergente do servidor).
- `setActiveUnit(unitId)` passa a:
  1. chamar `POST /api/auth/active-unit` (servidor valida o vínculo e regrava o cookie);
  2. em caso de **403**, não troca nada (mostra erro);
  3. em caso de sucesso, aplicar no store o `SessionContext` retornado (`activeUnit` + `profile`);
  4. **invalidar/refetch** as queries do TanStack com escopo de unidade (senão a tela mostra
     dados da unidade anterior). Para isso, as `queryKey` das telas unit-scoped passam a incluir
     `activeUnit.id` (ex.: `["base","departments", activeUnitId]`), garantindo refetch na troca.
- **Limpeza do mock** entra **na Leva 1** (estado inicial neutro/vazio, sobrescrito por
  `setSessionContext`) — é dependência natural de mexer no store agora.

---

## 7. Ponto 7 — Classificação das rotas

> **REVALIDAÇÃO (Leva 2 — recontagem por inventário completo):** existem **128** `route.ts`
> em `src/app/api`. A tabela original cobria só as **25** que usam `requirePermission`
> (base/compras/attachments) — essas **25 continuam idênticas** (nenhuma adicionada/removida;
> modos inalterados). **PORÉM faltava uma família inteira:** **~100 rotas de RH** em
> `src/app/api/hr/**` que escopam por unidade via **helpers paralelos**
> (`src/lib/hr/api-auth.ts` → `requireHrPermission`/`getHrAccessibleUnitIds`/`assertUnitInHrScope`
> e `src/lib/hr/workflow-auth.ts` → `requireHrWorkflowPermission`/`assertWorkflowUnitScope`).
> **Achado-chave:** esses wrappers **delegam ao mesmo núcleo** (`getAccessibleUnitIdsForPermission`
> / `requirePermission` / `assertUnitInPermissionScope`, via `hrPermissionOptions`). Logo, o modo
> `scope` (§1) é **herdado** pelo RH — basta os wrappers **encaminharem** a opção `scope`. A
> classificação do RH (por família) está na **§7.1**.

**PRINCÍPIO (revisão):** **Listas → unit-scoped.** **Busca de registro único por ID → AGGREGATE**,
com o **check per-record** da unidade do registro contra a UNIÃO
(`accessibleUnitIds.includes(registro.unit_id)`). A segurança do acesso por ID vem do **check
por registro**, não do estreitamento por unidade ativa — assim um link/registro legítimo de
outra unidade abre normalmente (sem 404 espúrio), e o que protege é a verificação de que o
registro pertence a uma unidade da união do usuário.

Defaults aplicados (seus): Operação (LISTAS) = unit-scoped; Aprovações de rede (lista) =
aggregate; decisão/resubmit mantêm check **per-unit do request específico** (aggregate, sem
estreitar); Cadastros (LISTAS) = unit-scoped, com **exceção de fornecedor corporativo
(`unit_id` nulo) sempre visível**. Casos especiais marcados 🚩.

| # | Rota (arquivo) | Método(s) | Permissão | Modo | Observação |
|---|---|---|---|---|---|
| 1 | base/units/route.ts | GET, POST | units.view/manage | 🚩 **aggregate** | A entidade É a unidade; registro/seletor/forms precisam de todas. |
| 2 | base/units/[id]/route.ts | PATCH | units.manage | **aggregate** | Gerencia unidade específica; já usa `assertUnitInPermissionScope(params.id)`. |
| 3 | base/departments/route.ts | GET (lista) / POST | departments.view/manage | GET **unit-scoped** / POST aggregate(escrita) | Lista por hotel. |
| 4 | base/departments/[id]/route.ts | PATCH | departments.manage | aggregate(escrita) | Escrita valida `payload.unitId` na união. |
| 5 | base/job-positions/route.ts | GET (lista) / POST | job_positions.view/manage | GET **unit-scoped** / POST aggregate | |
| 6 | base/job-positions/[id]/route.ts | PATCH | job_positions.manage | aggregate(escrita) | |
| 7 | base/employees/route.ts | GET (lista) / POST | employees.view/manage | GET **unit-scoped** / POST aggregate | |
| 8 | base/employees/[id]/route.ts | PATCH | employees.manage | aggregate(escrita) | |
| 9 | base/suppliers/route.ts | GET (lista) / POST | suppliers.view/manage | GET **unit-scoped** (+corporativo) / POST aggregate | **Exceção:** `unit_id` nulo (corporativo) continua visível (gated por `isSuperAdmin`, não por accessibleUnitIds — preservar). |
| 10 | base/suppliers/[id]/route.ts | GET (registro único) / PATCH | suppliers.view/manage | GET **aggregate + check per-record** / PATCH aggregate | **(Correção)** registro único por ID → aggregate; valida `registro.unit_id ∈ união` (preservando a exceção corporativa `unit_id` nulo já existente). |
| 11 | base/users/route.ts | GET, POST | users.view/manage | 🚩 **aggregate** | Usuários são globais (super-admin only); não são dado de 1 unidade. |
| 12 | base/users/[id]/route.ts | PATCH, DELETE | users.manage | 🚩 **aggregate** | Idem. |
| 13 | base/users/[id]/reset-password/route.ts | POST | users.manage | 🚩 **aggregate** | Idem. |
| 14 | purchases/requests/route.ts | GET (lista) / POST | requests.view/manage | GET **unit-scoped** / POST aggregate | Operação (lista). |
| 15 | purchases/requests/[id]/route.ts | GET (registro único) / PATCH | requests.view/manage | GET **aggregate + check per-record** / PATCH aggregate | **(Correção)** registro único por ID → aggregate; valida `request.unit_id ∈ união`. **Caveat de 404 em deep-link deixa de existir.** |
| 16 | purchases/requests/[id]/quotes/route.ts | POST | quotes.manage | aggregate(escrita) | |
| 17 | purchases/requests/[id]/quotes/[quoteId]/route.ts | PATCH, DELETE | quotes.manage | aggregate(escrita) | |
| 18 | purchases/requests/[id]/quotes/[quoteId]/negotiations/route.ts | POST | quotes.manage | aggregate(escrita) | |
| 19 | purchases/quotes/route.ts | GET (lista) | quotes.view | **unit-scoped** | Operação (lista). |
| 20 | purchases/documentation-dashboard/route.ts | GET (lista) | documentation.view | **unit-scoped** | Operação (lista). |
| 21 | purchases/approvals/route.ts | GET (lista) | approvals.view | **aggregate** | Lista de rede (consolidada). |
| 22 | purchases/approvals/[requestId]/decision/route.ts | POST | approvals.view | **aggregate** | **Mantém** o check per-unit já existente (`accessibleUnitIds.includes(request.unit_id)`). |
| 23 | purchases/approvals/[requestId]/resubmit/route.ts | POST | approvals.submit | **aggregate** | Idem (check per-unit do request específico). |
| 24 | attachments/route.ts | GET (busca por entidade) / POST | purchases.view/manage | GET **aggregate** / POST aggregate(escrita) | **(Correção)** GET é busca por entidade (`module=purchases`, `entity_type`, `entity_id`); o escopo vem da **acessibilidade da ENTIDADE-PAI** (quote/request), não da unidade ativa. Estreitar esconderia anexo de registro legitimamente aberto. Na Leva 2, confirmar que o GET valida acesso via entidade-pai e não some com anexos legítimos. |
| 25 | attachments/[id]/route.ts | DELETE | purchases.manage | aggregate(escrita) | Operação por id. |

🚩 **Casos especiais (já DECIDIDOS — ver §11):** #1–2 units = aggregate; #11–13 users = aggregate.
Não há mais itens "a confirmar": #15 e #24 viraram **aggregate** pela Correção 1 (registro único /
busca por entidade), e o caveat de 404 foi removido.

### 7.1 — Família RH (~100 rotas, ausente da tabela original)

Padrões observados no código (amostra ampla):
- **Listas** (GET coleção) filtram `.in("unit_id", context.accessibleUnitIds)` → candidatas a **unit-scoped**.
- **Registro único / ações por id** ([id], approve/submit/etc.) usam `assertCanAccessHrEmployee` /
  `assertUnitInHrScope` / redação por unidade do registro → **aggregate + check per-record**.
- **Consolidados/dashboards/relatórios** aceitam `unitId` opcional e validam `∈ acessíveis`,
  senão agregam sobre todas as acessíveis → **aggregate** (o cliente já passa `unit_id=activeUnit`
  nessas telas; o servidor permanece consolidável p/ gestor de rede).
- **Escrita** (POST/PATCH/DELETE) → **aggregate** + `assertUnitInHrScope`/`assertWorkflowUnitScope` (inalterado).
- **Exceção rede/global (`unit_id` nulo)**: algumas listas incluem registros globais
  (`or(unit_id.is.null,…)` ou `!row.unit_id || …`) — **preservar** ao estreitar (análogo ao fornecedor corporativo).
- **Redação sensível**: a 2ª chamada `getHrAccessibleUnitIds(*SensitiveView)` usada para redigir
  campos sensíveis por linha **permanece AGGREGATE** (é capacidade por-registro, não filtro de lista) —
  **não** estreitar essa chamada.

Classificação por família (representativa; a migração detalhada vai por família na §9):

| Família RH | Rotas (exemplos) | Modo |
|---|---|---|
| Colaboradores (lista) | `hr/employees` GET | **unit-scoped** |
| Colaborador (registro/sub-recursos) | `hr/employees/[id]` e `[id]/{documents,conduct,occupational,nr-certifications,terminations,trainings,onboarding,history,document-links}` | **aggregate + check per-record** (`assertCanAccessHrEmployee`) |
| Conduta (lista / id+ações) | `hr/conduct` GET ↔ `hr/conduct/[id]`,`/submit`,`/approve`,`/reject`,`/cancel` | lista **unit-scoped**; id/ações **aggregate+check**; POST aggregate |
| Saúde ocupacional | `hr/occupational-records` GET ↔ `[id]`,`process-expirations` | lista **unit-scoped**; resto **aggregate(+check/escrita)** |
| NR/SST | `hr/nr-certifications` GET ↔ `[id]` | lista **unit-scoped**; id **aggregate** |
| Avaliações | `hr/employee-evaluations` GET ↔ `[id]`,`[id]/scores`; `evaluation-templates*` | lista **unit-scoped**; id/scores **aggregate+check**; **templates 🚩** (ver nota) |
| Avaliações (relatórios) | `hr/employee-evaluations/reports` | **aggregate** (consolidado) |
| Planos de desenvolvimento | `hr/development-plans` GET ↔ `[id]`,`[id]/items*` | lista **unit-scoped**; id/items **aggregate+check** |
| Movimentações | `hr/movements` GET ↔ `[id]`,`/submit`,`/approve`,`/reject`,`/implement` | lista **unit-scoped**; id/ações **aggregate+check** |
| Desligamentos | `hr/terminations` GET ↔ `[id]`,`/checklist*`,`/submit`,`/approve`,`/cancel`,`/implement` | lista **unit-scoped**; id/ações **aggregate+check** |
| Treinamentos | `hr/trainings` GET ↔ `[id]`,`assignments`,`process-expirations` | lista **unit-scoped (+`unit_id` nulo rede)**; resto **aggregate** |
| Onboarding | `hr/onboarding-plans*`, `hr/employees/[id]/onboarding*`, `hr/onboarding-dashboard*` | planos lista **unit-scoped (+nulo)**; dashboards **aggregate** |
| Documentos (regras/tipos/pendências) | `hr/document-rules` (lista **+nulo**), `hr/document-types` (catálogo → **aggregate**), `hr/document-pendencies*` (**aggregate**), `hr/contextual-documents` (🚩) | ver células |
| Admissão | `hr/admission-processes` GET ↔ `[id]`,`[id]/checklist*` | lista **unit-scoped**; id/checklist **aggregate+check** 🚩 |
| Workflows/Recrutamento (`workflow-auth.ts`) | `hr/workflows` GET ↔ `hr/workflows/[id]/**` (candidates, interviews, scorecards, approve, execute, etc.) | lista **unit-scoped**; id/sub-recursos **aggregate + `assertWorkflowUnitScope`** 🚩 |
| Consolidados / dashboards / auditoria | `hr/consolidated-reports`, `hr/executive-dashboard`, `hr/analytics`, `hr/dashboard`, `hr/audit`, `hr/pending-center` | **aggregate** (rede; `unitId` opcional já validado) |

🚩 **A confirmar com você (não decidi):**
1. **`evaluation-templates*`** e **`document-rules`/`document-types`**: catálogos de configuração —
   podem ter `unit_id` próprio **ou** ser globais. Proposta: catálogo global → **aggregate**;
   se tiver `unit_id`, lista **unit-scoped (+nulo)**. Confirmar caso a caso na migração da família.
2. **`hr/contextual-documents`**: busca por contexto/entidade (provável **aggregate**, como attachments) — confirmar.
3. **Admissão e Workflows/Recrutamento**: famílias grandes com máquina de estado; proponho
   **lista unit-scoped + id/ações aggregate+check**, mas por serem fluxos de rede sensíveis,
   confirmar se a **lista** deve seguir a unidade ativa ou permanecer consolidada (aggregate).
4. **`hr/workflows`** usa um **3º wrapper** (`workflow-auth.ts`) que também precisa **encaminhar `scope`**.

---

## 8. Leva 1 — Núcleo (sem mudar o que o usuário vê)

Tudo permanece em modo **UNIÃO** (todas as rotas em `aggregate`). Nenhuma listagem muda. Só
prepara a fundação: cookie validado, perfil ativo no servidor, `units[]` do super admin e store.

**Arquivos tocados:**
- `src/lib/auth/active-unit.ts` **(novo)** — nome do cookie + `getActiveUnitCookie` /
  `setActiveUnitCookie` (espelha `cookieOptions` de `server.ts`).
- `src/app/api/auth/active-unit/route.ts` **(novo)** — `POST` valida vínculo, grava cookie,
  retorna `SessionContext`; 403 sem vínculo.
- `src/lib/auth/session.ts` — resolver `activeUnit` + `profile` do cookie validado (fallback
  `units[0]`/`firstLink`); `units[]` do super admin = todas ativas; regra determinística de
  múltiplos perfis. **Sem tocar** `getCurrentSessionContext`/`auth.getUser`.
- `src/store/app-store.ts` — remover mock; `setActiveUnit` chama o endpoint e reflete o
  `SessionContext` retornado; estado inicial neutro.
- `src/lib/auth/types.ts` — só se necessário (ex.: tipar retorno do endpoint); sem novos campos
  obrigatórios.
- **NÃO** tocar `permissions.ts` nesta leva (segue 100% aggregate).
- **NÃO** tocar `login/route.ts` (fallback cobre "sem cookie").

**Footguns de implementação (itens OBRIGATÓRIOS da Leva 1):**
1. **Remover o mock do `app-store.ts` deixa o estado inicial vazio.** Garantir que **nada
   renderize `activeUnit.id` antes da hidratação** — usar guard (ex.: `activeUnit?` /
   render condicional) **ou** semear o store sincronamente pelos props do SSR
   (`SessionContext` do `layout`/`AppProviders`) no 1º paint. **Sem flash/erro** na primeira
   renderização. (Hoje o mock mascara isso; ao removê-lo, qualquer acesso direto a
   `activeUnit.id` no 1º render quebraria.)
2. **`units[]` do super admin cresce** de "unidades com link" para "todas as ativas".
   Verificar que **nenhum componente** hoje itera `session.units` de modo que isso mude algo
   visível para o super admin (ex.: contadores, listas, dashboards baseados em
   `session.units`). Se mudar, a afirmação "Leva 1 não muda nada visível" ganha **ressalva**
   explícita para o super admin (e o item deve ser tratado/aceito antes de fechar a Leva 1).

**Critério de aceite (Leva 1):**
- `build` e `lint` passam.
- Comportamento **idêntico** ao atual para todos os usuários (tudo em união) — **com a ressalva
  do footgun 2** caso algum componente reflita `session.units` do super admin.
- Super admin passa a ter `units[]` completa no `SessionContext` (sem seletor ainda — Parte 3).
- **Sem flash/erro no 1º paint** após remover o mock (footgun 1).
- Trocar unidade via endpoint grava cookie, valida vínculo (403 quando indevido) e o
  `SessionContext` reflete `activeUnit`/`profile` corretos. Reload mantém a escolha (cookie).
- `auth.getUser`/login/`auth_email` intactos.

---

## 9. Leva 2 — B-misto de fato (estreitar leitura por família)

Introduz os dois modos e migra **uma família por vez**, com invalidação de query no cliente.
**Migra-se só os GET de LISTA para `active-unit`**; **GET de registro único / busca por
entidade ficam `aggregate` com check per-record** (Correção 1 da revisão).

> **CONDIÇÃO DE SEQUENCIAMENTO (regra do plano):** a **Parte 3** (indicador de unidade ativa
> no header + troca) — que está **fora deste plano** — deve entrar **JUNTO COM ou ANTES** da
> Leva 2. A **Leva 1 pode ir sozinha** (nada muda visualmente). A **Leva 2 NÃO pode ir antes
> da Parte 3**: senão o usuário passa a ver só os dados de uma unidade **sem saber qual é nem
> como trocar**.

### 9.1 — Mudança no núcleo (compartilhada com o RH)

- `src/lib/auth/permissions.ts` — `scope?: "aggregate" | "active-unit"` em
  `PermissionAuthorizationOptions`; estreitamento por interseção `união ∩ [activeUnitId]`.
- **`hasPermission` continua calculado sobre a UNIÃO** (é o que dispara o 403 em
  `requirePermission`); adiciona-se `hasPermissionInScope = accessibleUnitIds.length > 0`
  (após estreitar). Isso garante o §1.1: usuário **com** permissão mas **fora** da unidade ativa
  **não** leva 403 no `requirePermission` — recebe `context.accessibleUnitIds = []` e a rota de
  lista devolve **vazio (200)**. Sem permissão na união → 403 como hoje.
- **`requirePermission` repassa `scope`.** Default ausente = `aggregate` (zero regressão).
- **Wrappers de RH encaminham `scope`** (mudança fina, sem duplicar):
  `requireHrPermission(code, { scope })`, `getHrAccessibleUnitIds(..., { scope })` e
  `requireHrWorkflowPermission(code, { scope })` passam `scope` para dentro de `hrPermissionOptions`.
  **A 2ª chamada de redação sensível (`*SensitiveView`) NÃO recebe `scope`** (continua aggregate).

### 9.2 — Guard de "lista vazia" hoje (a tratar no §1.1)

Rotas de lista que já têm guard por `accessibleUnitIds.length` (mapeadas no código):
`base/departments`, `base/employees`, `base/job-positions`, `base/suppliers`, `base/units`,
`hr/employees`, `hr/trainings`, `hr/workflows`, `purchases/documentation-dashboard`,
`purchases/quotes`, `purchases/requests`.
- **Boa notícia:** hoje essas rotas, quando `!isSuperAdmin && !accessibleUnitIds.length`,
  **já retornam lista vazia (200)** — não 403. Com o estreitamento + `hasPermission` na união,
  o caso "tem permissão mas não na unidade ativa" cai **exatamente** nesse guard → **vazio (200)**,
  sem novo código de erro. Cada rota dessas só precisa: (a) receber `scope:"active-unit"` (lista),
  (b) confirmar que o filtro `.in("unit_id", accessibleUnitIds)` usa o conjunto **já estreitado**.
- **Atenção (preservar global/nulo):** `base/suppliers` (corporativo), `hr/trainings`,
  `hr/onboarding-plans`, `hr/document-rules` incluem `unit_id IS NULL` (rede). O estreitamento
  **não pode** derrubar esses registros globais — manter o ramo `unit_id.is.null` no filtro.

### 9.3 — Ordem das famílias e o que migra

**Família 1 — Cadastros (base/*):** GET de LISTA de departments, job-positions, employees,
suppliers → `active-unit`. `suppliers/[id]` e demais `[id]`/escrita → **aggregate**. Preservar
corporativo (`unit_id` nulo). units/users → **aggregate** (não migram).

**Família 2 — Compras (purchases/*):** GET de LISTA de requests, quotes,
documentation-dashboard → `active-unit`. `requests/[id]` GET → **aggregate + check per-record**.
Escrita e aprovações (lista/decisão/resubmit) → **aggregate**. attachments → **aggregate**.

**Família 3 — RH (hr/*):** migrar **só os GET de LISTA** para `active-unit`, por sub-família,
na ordem: employees → conduct → occupational-records → nr-certifications → employee-evaluations →
movements → terminations → development-plans → trainings(+nulo) → onboarding-plans(+nulo) →
document-rules(+nulo). **Mantêm `aggregate`:** todos os `[id]`/sub-recursos/ações
(`assertCanAccessHrEmployee`/`assertUnitInHrScope`), escrita, e os **consolidados/dashboards/
relatórios/auditoria** (`consolidated-reports`, `executive-dashboard`, `analytics`, `dashboard`,
`audit`, `pending-center`, `onboarding-dashboard`, `document-pendencies`). **🚩 Confirmar antes:**
evaluation-templates / document-rules / document-types (catálogo vs unit), contextual-documents,
admission-processes e workflows/recrutamento (lista unit-scoped vs consolidada) — ver §7.1.

**Cliente (por família):** as `queryKey` das telas de **lista** unit-scoped passam a incluir
`activeUnit.id`; ao trocar a unidade, o `store.setActiveUnit` (que já reflete o novo
`SessionContext`) dispara **invalidate/refetch** dessas queries. Telas que hoje filtram por um
`<select>` manual de unidade (ex.: conduct, terminations, occupational) passam a usar a unidade
ativa como filtro padrão; telas de dashboard que já passam `unit_id=activeUnit` (operational/
management/evaluation-templates) só precisam manter o `activeUnit.id` na `queryKey`.

**Critério de aceite — geral (Leva 2):**
- A **Parte 3** está no ar (sequenciamento) — ✅ já em main.
- `hasPermission` na união (403 só sem permissão em lugar nenhum); fora da unidade ativa → **vazio 200** (§1.1).
- Registro único / entidade abrem registros legítimos de qualquer unidade da união (check per-record; sem 404 espúrio).
- Escrita validada na união (sem afrouxar); aprovações/consolidados permanecem **aggregate** (gestor de rede mantém visão).
- Super admin troca livremente; **unidade única** não percebe diferença; global/`unit_id` nulo preservado.
- `build` e `lint` passam.

**Critério de aceite — por família (repetir a cada migração):**
- A lista da família passa a refletir **só** a unidade ativa; trocar a unidade **troca** os dados
  (invalidação/refetch), sem vazar a unidade anterior.
- `[id]`/ações/escrita da família **inalterados** (aggregate + check); consolidados da família inalterados.
- Exceções global/nulo da família preservadas; redação sensível inalterada (aggregate).
- Smoke test logado (app usa service_role → não quebra): a tela da família carrega e troca de unidade sem erro.

---

## 10. Restrições (NAO_ALTERAR) reafirmadas

- NÃO tocar `auth.getUser()`, `signInWithPassword`, `auth_email`, Supabase Auth, setup inicial.
- A autorização NÃO passa a depender do cookie cru: a unidade ativa é **validada** contra
  `user_unit_links` a cada request; a checagem de permissão por perfil/override continua igual.
- Estreitar é só **leitura**; escrita mantém validação ampla. Aprovações de rede não estreitam.
- Sem libs novas (cookie nativo do Next; TanStack já presente).

## 11. Decisões (RESOLVIDAS na revisão)

1. **Cookie no login — DECIDIDO:** manter `login/route.ts` **intacto**. O fallback de
   `session.ts` cobre "sem cookie" (usa `units[0]`). A alternativa de gravar no login foi
   **descartada**.
2. **Múltiplos perfis na mesma unidade — DECIDIDO:** precedência `SUPER_ADMIN` > demais, empate
   por `created_at asc`.
   - **Dívida conhecida (a tratar no RH-35C):** o `profile` **não** controla acesso a dado
     (`permissions.ts` une as permissões de **todos** os perfis ativos do usuário na unidade),
     então a regra é praticamente **cosmética / de menu**. Quando existir o **menu filtrado por
     `access_profile` (RH-35C)**, um usuário com 2 perfis **não-super** na mesma unidade verá o
     menu de **apenas um** (o mais antigo) e pode ter módulos do outro perfil escondidos.
3. **Modos 🚩 — DECIDIDOS:** `units` = **aggregate**; `users` = **aggregate**;
   `attachments` GET = **aggregate** (busca por entidade — Correção 1); `requests/[id]` GET =
   **aggregate + check per-record** (Correção 1 — o **404 em deep-link deixa de existir**).

> **Não há mais decisões pendentes neste plano.**
