# Plano — Fase 1: menu lateral filtrado por permissão

> **Plano. Sem código ainda.** Aprovar antes de implementar. Área sensível (autorização/sessão).
> Nesta fase o **backend de autorização NÃO muda** (requirePermission/policies intactos) — apenas
> **EXPOMOS** ao front a lista de permissões que o backend já sabe calcular. Sem libs novas.
> (Referência do projeto: `docs/codex/16-projeto-permissoes.md` — ainda não versionado no repo.)

## 0. Situação confirmada

- `src/components/layout/app-sidebar.tsx`: `menuGroups` é estático e **renderizado inteiro para todos**.
- As **páginas** em `src/app/(app)/**` **NÃO** chamam `requirePermission` (grep sem resultados). O gate
  de permissão está nas **APIs** (`/api/**`). Logo, a permissão "exigida" por um item de menu é a do
  **endpoint primário** que a tela consome. O `(app)/layout.tsx` só gate de **sessão** (login).
- `SessionContext` (`src/lib/auth/types.ts`) expõe `user/profile/units/activeUnit` — **não** as
  permissões. Resolução de permissão hoje é **por código** (`permissions.ts`).

## 1. Levantamento rota-por-rota (item de menu → permissão exigida)

Baseado no `requirePermission`/`requireHrPermission` do **GET** do endpoint primário de cada tela
(verificado, não assumido). `view` = permissão de leitura da tela.

### 1.1 Cadastros (BASE)
| Item | Rota | Permissão exigida (GET) |
|---|---|---|
| Dashboard | `/cadastros` | — (landing de módulo, sem API gated → **visível a todos**) |
| Unidades | `/cadastros/unidades` | `BASE:units.view` |
| Departamentos | `/cadastros/departamentos` | `BASE:departments.view` |
| Cargos | `/cadastros/cargos` | `BASE:job_positions.view` |
| Colaboradores | `/cadastros/colaboradores` | `BASE:employees.view` |
| Usuários internos | `/cadastros/usuarios` | `BASE:users.view` |
| Fornecedores | `/cadastros/fornecedores` | `BASE:suppliers.view` |

### 1.2 Compras (PURCHASES)
| Item | Rota | Permissão exigida (GET) |
|---|---|---|
| Dashboard | `/compras` | — (landing → **visível a todos**) |
| Solicitações | `/compras/solicitacoes` | `PURCHASES:requests.view` |
| Cotações | `/compras/cotacoes` | `PURCHASES:quotes.view` |
| Aprovações | `/compras/aprovacoes` | `PURCHASES:approvals.view` |
| Pendências Documentais | `/compras/pendencias-documentais` | `PURCHASES:documentation.view` |

> **Correção importante ao exemplo do enunciado:** VER a tela de Aprovações exige
> **`PURCHASES:approvals.view`** (GET `/api/purchases/approvals`), **não** `decide.administrative`/
> `decide.directorate`. As `decide.*` gateiam a **ação** de decidir (POST `/decision`), não a
> visualização. Por isso o item de menu usa `approvals.view` (verificado — era o motivo de "não
> assumir"). Se o desejo for esconder Aprovações de quem só vê mas não decide, aí sim seria
> `requiredAnyOf: [decide.administrative, decide.directorate]` — **decisão sua** (recomendo `approvals.view`,
> coerente com o que a tela realmente carrega).

### 1.3 RH (HR)
| Item | Rota | Permissão exigida | Obs. |
|---|---|---|---|
| Painel RH | `/rh` | — (landing → visível) | |
| Fila RH | `/rh/inbox` | `HR:workflows.view` | |
| Dashboard (recrutamento) | `/rh/recrutamento` | — (landing → visível) ou `HR:workflows.view` | recrutamento é baseado em workflows |
| Vagas | `/rh/vagas` | `HR:workflows.view` | |
| Admissões | `/rh/admissoes` | `HR:workflows.view` | `/api/hr/admission-processes` |
| Documentos RH | `/rh/pendencias-documentais` | `HR:documents.view` | |
| Onboarding | `/rh/onboarding` | `HR:employees.view` | `/api/hr/onboarding-dashboard` |
| Colaboradores | `/rh/employees` | `HR:employees.view` | |
| Avaliações | `/rh/gestao/avaliacoes` | `HR:evaluations.view` | |
| Plano de Desenvolvimento (PDI) | `/rh/employees?tab=development` | `HR:employees.view` | mesma página de Colaboradores (dados do PDI também usam `HR:evaluations.view`) |
| Treinamentos | `/rh/gestao/treinamentos` | `HR:trainings.view` | |
| Movimentações | `/rh/gestao/movimentacoes` | `HR:movements.view` | GET por id usa `movements.view`; **confirmar o GET da lista** na implementação |
| Saúde Ocupacional | `/rh/gestao/saude-ocupacional` | `HR:occupational.view` | |
| Conduta | `/rh/gestao/conduta` | `HR:conduct.view` | |
| Desligamentos | `/rh/gestao/desligamentos` | `HR:terminations.view` | |
| Dashboard Executivo | `/rh/dashboard-executivo` | `HR:employees.view` | `/api/hr/executive-dashboard` (dado gated) |
| Relatórios RH | `/rh/relatorios` | `requiredAnyOf: [HR:employees.view, HR:evaluations.view]` | consolidated-reports usa employees.view; evaluations/reports usa evaluations.view |
| Gestão RH | `/rh/gestao` | — (landing → visível) | |

### 1.4 Módulos placeholder (sem API/permissão específica)
`Recepção` (`/recepcao`), `Manutenção` (`/manutencao`), `Governança` (`/governanca`), `A&B` (`/ab`),
`Contas a Pagar` (`/contas-a-pagar`), `Administrativo`→Dashboard (`/administrativo`), `Minha Operação`
(`/minha-operacao`), e o footer `Relatórios` (`/relatorios`) → **sem permissão específica → visíveis a
todos** (decisão: itens sem permissão permanecem visíveis). Quando esses módulos ganharem telas reais/
gated, entram no mapeamento.

### 1.5 Seções (headers "GESTÃO RH", etc.)
São rótulos (`type: "section"`), não links. Renderizam-se apenas se houver **ao menos um item visível
depois** delas (ver §3), para não sobrar cabeçalho órfão.

## 2. Como expor as permissões no SessionContext (abordagem A)

### 2.1 O que o backend já tem (reaproveitar, não duplicar)
`permissions.ts` já resolve permissão **por código** com estas tabelas:
- `permissions (id, code)`
- `user_unit_links` (vínculos ativos do usuário) → `access_profile_id`
- `profile_permissions (access_profile_id, permission_id)` (grants por perfil)
- `user_permission_overrides (permission_id, ...)` (overrides por usuário — grant/deny)
- super admin via `access_profiles.code === SUPER_ADMIN_PROFILE_CODE`

### 2.2 Nova função (aditiva, read-only): `getEffectivePermissionCodes`
Em `permissions.ts` (ou `session.ts`), uma resolução **única** por carregamento de sessão:
- **Super admin** → retorna o sentinela **`["*"]`** (significa "todas"). Evita listar o catálogo inteiro
  e mantém o "vê tudo".
- **Demais** → uma query que retorna os **códigos DISTINCT** concedidos:
  - perfis ativos do usuário: `getActiveUserUnitLinks` → `access_profile_id` (reuso do existente);
  - `permissions.code` via join `profile_permissions` (`permission_id`) para esses perfis;
  - aplicar `user_permission_overrides` com **a MESMA semântica** do resolver por-código (somar grants,
    remover denies) — para a lista exposta bater exatamente com o que `requirePermission` autorizaria.
- Retorno: `string[]` de códigos (ex.: `["BASE:units.view", "PURCHASES:requests.view", ...]`).

### 2.3 Escopo (união entre unidades) — coerente e suficiente para o menu
O menu é um filtro **grosso de visibilidade**: se o usuário tem `requests.view` em **qualquer** unidade
acessível, vê o item "Solicitações"; o **servidor continua** estreitando os dados por unidade ativa
(scope active-unit). Portanto expomos a **união** dos códigos efetivos (independente de unidade) — uma
resolução só, sem N chamadas. (Multi-tenant/perfis-por-empresa: contemplado no desenho; **não** tocamos
`organization_id` nesta fase.)

### 2.4 Onde anexar
`SessionContext` (`types.ts`) ganha `permissions: string[]`. `getSessionContextByAuthUserId` /
`getCurrentSessionContext` (`session.ts`) — que já resolvem `profile`/`units` — chamam
`getEffectivePermissionCodes` **uma vez** e anexam. Sem endpoint dedicado (abordagem A), reaproveitável
pela Fase 2. Custo: **+1 query** por load de sessão (barata; indexável por `access_profile_id`).

## 3. Como o menu filtra (`app-sidebar.tsx`)

- `SidebarLink` ganha campos opcionais: `requiredPermission?: string` e `requiredAnyOf?: string[]`
  (sem ambos ⇒ visível a todos).
- Uma função pura `canSee(perms: string[], item)`:
  - `perms.includes("*")` (super admin) → `true`;
  - `requiredPermission` → `perms.includes(requiredPermission)`;
  - `requiredAnyOf` → `requiredAnyOf.some((p) => perms.includes(p))`;
  - nenhum requisito → `true`.
- As permissões vêm do `SessionContext` já disponível no client (via `AppProviders`/`useAppStore` ou
  props do layout — confirmar a fonte no client na implementação; a store já recebe o SessionContext).
- Render:
  - `mainItems`/`footerItems`/itens de grupo → filtrados por `canSee`.
  - **Grupos sem nenhum item visível são ocultados** (não renderizar o cabeçalho do grupo).
  - **Seções (`type: "section"`)** só aparecem se houver item visível subsequente dentro do grupo
    (evita cabeçalho órfão).
- Mapear os `requiredPermission`/`requiredAnyOf` nos itens conforme a tabela da §1.

## 4. Garantias

- **Aditivo:** só acrescenta `permissions` ao SessionContext e campos opcionais + filtro na sidebar.
- **Nenhuma mudança no backend de segurança/schema/RLS** — só **expomos** o que já é calculado
  (`profile_permissions`/overrides). `requirePermission`/policies **intactos**.
- **Esconder ≠ segurança:** o gate server-side permanece. Se o usuário digitar a URL de uma tela que
  não pode acessar, a **API** (não a página) barra com 403 — o menu só melhora UX escondendo o que ele
  não usa. (As páginas hoje não gateiam; isso **não** é regressão — o dado sempre vem da API gated.)
- **Super admin** vê tudo (sentinela `"*"`).

## 5. Fora de escopo (Fase 1)
- Não implementar multi-tenant/perfis-por-empresa (só desenho).
- Não gatear as **páginas** (server components) — Fase 2 pode adicionar gate de página/uso das
  permissões no client para além do menu. A lista `permissions` já fica pronta para isso.

## 6. Aceite (após código aprovado)
- Menu esconde itens sem permissão; grupos/seções vazios somem; super admin vê tudo; itens sem
  permissão específica (dashboards de módulo, placeholders) seguem visíveis.
- `tsc`/`eslint`/`build` verdes. Validação server-side inalterada (E2E T2/T3 seguem verdes).

## 7. Pontos para sua decisão
1. **Aprovações**: `PURCHASES:approvals.view` (recomendado) vs `requiredAnyOf(decide.*)`.
2. Confirmar **fonte das permissões no client** da sidebar (SessionContext via store/props) — a store já
   recebe o contexto; confirmo no código.
3. Mapear **Relatórios RH** como `requiredAnyOf(employees.view, evaluations.view)` (proposto) ou um só.
