# P4 — Auditoria RLS das Tabelas de Governança — 2026-10-19

**Documento de evidência.** Registra uma auditoria **somente leitura**, feita manualmente pelo
responsável no SQL Editor de **staging** e de **produção** em 2026-10-19. Não é roteiro e **não
autoriza nenhuma mudança**.

Origem do achado: §13 de
[`P4_AUDITORIA_MIGRATIONS_LEGADAS.md`](P4_AUDITORIA_MIGRATIONS_LEGADAS.md). As consultas usadas são
as do §13.1 daquele documento e as da etapa P4.2.

| | |
| --- | --- |
| **Tabelas** | `public.housekeeping_days`, `public.housekeeping_tasks`, `public.housekeeping_day_events` |
| **Migrations de origem** | `091_housekeeping_day.sql` (days, tasks), `092_housekeeping_day_close.sql` (day_events) |
| **Commit de referência** | `78f1ad6` |
| **Data da auditoria** | 2026-10-19 |
| **Natureza** | Somente leitura: catálogo e funções de privilégio. Nenhum SQL de escrita |

### O que esta auditoria foi, e o que não foi

- **Somente consultas de catálogo:** `pg_class`, `pg_policies`, `pg_roles`, a lista de privilégios
  das tabelas, `has_table_privilege` e `has_schema_privilege`.
- **Nenhuma alteração:** RLS, policies, grants, Auth, Storage e configuração da Data API ficaram
  como estavam.
- **Nenhuma migration aplicada, nenhum `repair`.**
- **Não foi teste de acesso pela API.** Nenhuma requisição com chave `anon` ou com token de usuário.
  A conclusão vem do catálogo.

---

## 1. STAGING

| | |
| --- | --- |
| **Projeto** | `galli-staging` |
| **Project ref** | `jascnmgagejlvjlenduv` |

### 1.1 Existência e RLS

| Tabela | Existe | `relkind` | `relrowsecurity` (RLS) | `relforcerowsecurity` (FORCE RLS) | Owner |
| --- | --- | --- | --- | --- | --- |
| `housekeeping_days` | sim | `r` | **true** | false | `postgres` |
| `housekeeping_tasks` | sim | `r` | **true** | false | `postgres` |
| `housekeeping_day_events` | sim | `r` | **true** | false | `postgres` |

### 1.2 Policies

```text
pg_policies para as três tabelas: 0 linhas
```

### 1.3 Papéis

| Papel | `superuser` | `bypass_rls` | `canlogin` |
| --- | --- | --- | --- |
| `anon` | false | **false** | false |
| `authenticated` | false | **false** | false |
| `service_role` | false | **true** | false |

### 1.4 Privilégios efetivos (`has_table_privilege`)

Resultado **idêntico** para as três tabelas e para os dois papéis:

| Tabela | Papel | SELECT | INSERT | UPDATE | DELETE | TRUNCATE | REFERENCES | TRIGGER |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `housekeeping_days` | `anon` | true | true | true | true | true | true | true |
| `housekeeping_days` | `authenticated` | true | true | true | true | true | true | true |
| `housekeeping_tasks` | `anon` | true | true | true | true | true | true | true |
| `housekeeping_tasks` | `authenticated` | true | true | true | true | true | true | true |
| `housekeeping_day_events` | `anon` | true | true | true | true | true | true | true |
| `housekeeping_day_events` | `authenticated` | true | true | true | true | true | true | true |

**A lista de privilégios no catálogo também mostrou `MAINTAIN` concedido** a esses papéis. É um
privilégio do PostgreSQL 17 que cobre `VACUUM`, `ANALYZE`, `CLUSTER`, `REINDEX`,
`REFRESH MATERIALIZED VIEW` e `LOCK TABLE`.

### 1.5 Schema `public`

| Papel | `USAGE` | `CREATE` |
| --- | --- | --- |
| `anon` | true | false |
| `authenticated` | true | false |

---

## 2. PRODUÇÃO

| | |
| --- | --- |
| **Projeto** | `hotel-galli-admin` |
| **Project ref** | `chnamldrlwohaudmjrez` |

### 2.1 Existência e RLS

| Tabela | Existe | `relkind` | `relrowsecurity` (RLS) | `relforcerowsecurity` (FORCE RLS) | Owner |
| --- | --- | --- | --- | --- | --- |
| `housekeeping_days` | sim | `r` | **true** | false | `postgres` |
| `housekeeping_tasks` | sim | `r` | **true** | false | `postgres` |
| `housekeeping_day_events` | sim | `r` | **true** | false | `postgres` |

### 2.2 Policies

```text
pg_policies para as três tabelas: 0 linhas
```

### 2.3 Papéis

| Papel | `superuser` | `bypass_rls` | `canlogin` |
| --- | --- | --- | --- |
| `anon` | false | **false** | false |
| `authenticated` | false | **false** | false |
| `service_role` | false | **true** | false |

### 2.4 Privilégios efetivos (`has_table_privilege`)

Resultado **idêntico** para as três tabelas e para os dois papéis:

| Tabela | Papel | SELECT | INSERT | UPDATE | DELETE | TRUNCATE | REFERENCES | TRIGGER |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `housekeeping_days` | `anon` | true | true | true | true | true | true | true |
| `housekeeping_days` | `authenticated` | true | true | true | true | true | true | true |
| `housekeeping_tasks` | `anon` | true | true | true | true | true | true | true |
| `housekeeping_tasks` | `authenticated` | true | true | true | true | true | true | true |
| `housekeeping_day_events` | `anon` | true | true | true | true | true | true | true |
| `housekeeping_day_events` | `authenticated` | true | true | true | true | true | true | true |

**A lista de privilégios no catálogo também mostrou `MAINTAIN` concedido.**

### 2.5 Schema `public`

| Papel | `USAGE` | `CREATE` |
| --- | --- | --- |
| `anon` | true | false |
| `authenticated` | true | false |

---

## 3. Classificação

### Para CRUD de linhas (SELECT, INSERT, UPDATE, DELETE)

| Ambiente | Classificação |
| --- | --- |
| **STAGING** | **SEGURO POR RLS — DEFAULT DENY** |
| **PRODUÇÃO** | **SEGURO POR RLS — DEFAULT DENY** |

**Justificativa**, válida nos dois ambientes:

- **RLS ativo** nas três tabelas (`relrowsecurity = true`).
- **0 policies.** Com RLS ativo e nenhuma policy, o PostgreSQL nega toda linha para quem está
  sujeito ao RLS. É o *default deny*.
- **`anon` e `authenticated` não têm `BYPASSRLS`** e não são superusuários. Os dois **estão
  sujeitos** ao RLS.
- **`anon` e `authenticated` não são donos das tabelas** (owner = `postgres`). Como
  `FORCE RLS = false`, só o dono escaparia do RLS, e o dono não é nenhum desses dois papéis.

Portanto os grants amplos de SELECT, INSERT, UPDATE e DELETE **existem mas não alcançam linha
nenhuma** para esses papéis. SELECT retorna vazio. UPDATE e DELETE afetam 0 linhas. INSERT é
recusado pela checagem de RLS.

### O que esta classificação NÃO diz

**Não afirma que não existe risco.** Ela cobre **CRUD de linhas**. O §4 trata do que fica fora.

---

## 4. HARDENING DE GRANTS — PENDENTE

```text
HARDENING DE GRANTS — PENDENTE
```

`anon` e `authenticated` têm, nas três tabelas, privilégios **mais amplos do que o desenho da
aplicação precisa**:

```text
SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
```

**O RLS não deve ser tratado como proteção para `TRUNCATE`, `REFERENCES`, `TRIGGER` e `MAINTAIN`
do mesmo jeito que protege SELECT, INSERT, UPDATE e DELETE.** As policies de RLS filtram **linhas**
nesses quatro comandos. Os outros privilégios operam sobre a **tabela** e não passam pelo filtro de
linha. `TRUNCATE`, em particular, **não é verificado pelo RLS**.

**O que atenua hoje, sem eliminar:**

- `anon` e `authenticated` têm `canlogin = false`. Não abrem sessão direta no banco; atuam por meio
  dos serviços do Supabase, que trocam para esses papéis.
- A Data API traduz requisições em SELECT, INSERT, UPDATE e DELETE. Esta auditoria **não verificou**
  se algum caminho da plataforma permitiria exercer os outros privilégios.

**Grant desnecessário é superfície de ataque, ainda que hoje não haja caminho conhecido para
exercê-lo.** Por isso o item fica registrado como pendente, e não como resolvido.

---

## 5. Evidência arquitetural do repositório

Conferido no commit `78f1ad6`:

| Ponto | Evidência |
| --- | --- |
| Cliente admin | `src/lib/supabase/admin.ts`: `createSupabaseAdminClient()`, arquivo marcado `server-only` |
| Chave usada | `src/lib/supabase/env.ts`: `getAdminSupabaseEnv()` exige `SUPABASE_SERVICE_ROLE_KEY` |
| Gate de autorização | `src/lib/auth/permissions.ts`: `requirePermission()` autentica a sessão, **cria o cliente admin** e checa a permissão e as unidades acessíveis antes de devolver o contexto |
| Rotas de governança | `api/base/rooms/days/current` (GET), `api/base/rooms/days/[id]/close` (POST), `api/base/rooms/days/[id]/reopen` (POST), `api/base/rooms/tasks/[id]` (PATCH). **As quatro chamam `requirePermission()` antes** de acessar `housekeeping_days` ou `housekeeping_tasks`; as de escrita checam também `userHasPermissionForUnit` |
| Acesso pelo navegador | Nenhum. Os nomes das três tabelas aparecem só nessas rotas e em tipos de `rooms-utils.ts` |

**Conclusão arquitetural:** o desenho atual é de **acesso server-side via `service_role`**, que tem
`BYPASSRLS`, depois da autorização da aplicação. **Não há acesso direto necessário por `anon` ou
`authenticated`.** É isso que torna os grants deles **desnecessários**, e não só amplos.

---

## 6. Observação: o RLS ativo não vem das migrations

O §13 de `P4_AUDITORIA_MIGRATIONS_LEGADAS.md` registrou que **nenhuma migration** habilita RLS
nessas tabelas. **Os dois bancos têm RLS ativo.** Logo, o estado atual foi produzido **fora do
arquivo de migration**. A causa não foi investigada e não é afirmada aqui: pode ter sido configuração
da plataforma, ação manual ou outro mecanismo.

**Consequência prática:** um banco reconstruído **só a partir das migrations** não teria RLS nessas
três tabelas. Nesse banco, os grants amplos voltariam a alcançar linhas. O repositório, hoje, **não
descreve** a proteção que os dois ambientes têm.

Isso **não muda** a classificação dos ambientes medidos. Mas é motivo a mais para a frente do §7
**declarar em migration** o estado que se quer, em vez de depender do que está no banco.

---

## 7. Backlog futuro — `SEC-HARDEN-HOUSEKEEPING-GRANTS`

**Frente separada. Não faz parte de P4. Nenhuma migration foi criada.**

| | |
| --- | --- |
| **Código** | `SEC-HARDEN-HOUSEKEEPING-GRANTS` |
| **Objetivo** | Avaliar a revogação explícita dos privilégios desnecessários de `anon` e `authenticated` nas três tabelas |
| **Escopo** | `housekeeping_days`, `housekeeping_tasks`, `housekeeping_day_events` |
| **A avaliar** | Revogar `TRUNCATE`, `REFERENCES`, `TRIGGER`, `MAINTAIN` e, dado o desenho só server-side do §5, também SELECT, INSERT, UPDATE e DELETE. Declarar `enable row level security` na própria migration (§6) |
| **Exige** | Migration nova, revisada antes; aplicação em staging antes de produção; **teste de regressão das rotas** de governança (abrir, fechar e reabrir o dia, atualizar tarefa, transições de quarto) |
| **Não fazer** | Corrigir manualmente pelo SQL Editor. Misturar com P4 ou com a migration seletiva de índices |
| **Verificar antes** | Se outras tabelas criadas pelo mesmo padrão têm os mesmos grants, para decidir entre correção pontual e política geral |

---

## 8. Efeito sobre P4

- O achado do §13 de `P4_AUDITORIA_MIGRATIONS_LEGADAS.md` passa a
  **CONFIRMADO SEGURO PARA CRUD DE LINHAS POR RLS/DEFAULT DENY — HARDENING DE GRANTS PENDENTE**.
- **Não bloqueia P4.** A auditoria das migrations legadas segue o próprio plano.
- **Não altera a classificação de nenhuma migration**, incluindo 091 e 092.

---

## 9. Confirmações

- Auditoria **somente leitura**, nos dois ambientes.
- Nenhum RLS, policy ou grant alterado.
- Nenhuma migration aplicada ou criada.
- Nenhum `repair`, `db push` ou `migration up`.
- Nesta tarefa de registro **nenhuma consulta remota foi executada**. Os resultados acima foram
  fornecidos pelo responsável que rodou a auditoria.
