# P4-S1 — Hardening de Segurança da Governança

**Documento de desenho.** Define a migration de hardening das tabelas da Governança e como
testá-la. **Nada foi aplicado.** Nenhum banco foi consultado para escrever este documento.

| | |
| --- | --- |
| **Frente** | `SEC-HARDEN-HOUSEKEEPING-GRANTS`, aberta em [`P4_RLS_GOVERNANCA_2026-10-19.md`](P4_RLS_GOVERNANCA_2026-10-19.md) §7 |
| **Natureza** | **HARDENING + REPRODUTIBILIDADE DE SEGURANÇA**. Não é correção de incidente |
| **Migration** | `supabase/migrations/20261019184500_housekeeping_security_hardening.sql` |
| **Status** | Desenhada: **SIM**. Teste local: **APROVADO** ([evidência](P4_S1A_TESTE_LOCAL_HARDENING_GOVERNANCA_2026-10-19.md)). Versionada: **SIM**, blob `fa7308befcfa85e35818b9726c573f50b1970e10`. Aplicada em staging: **NÃO**. Aplicada em produção: **NÃO** |
| **Commit de referência** | `4071919` |
| **Tabelas** | `public.housekeeping_days`, `public.housekeeping_tasks`, `public.housekeeping_day_events` |

### Ponto de partida

**Os dois bancos já estão seguros para CRUD de linhas** (auditoria de 2026-10-19): RLS ativo,
0 policies, `anon`/`authenticated` sem `BYPASSRLS` e sem serem donos, ou seja, default deny. O que
esta frente resolve são outros dois problemas:

1. **Grants desnecessários.** `anon` e `authenticated` têm SELECT, INSERT, UPDATE, DELETE,
   TRUNCATE, REFERENCES, TRIGGER e MAINTAIN. `TRUNCATE` não passa pelo RLS, e REFERENCES, TRIGGER e
   MAINTAIN operam sobre a tabela, não sobre linhas.
2. **Reprodutibilidade.** Nenhuma migration habilita RLS nessas tabelas, nem concede privilégio a
   ninguém. O estado seguro dos bancos veio **de fora do repositório**. Um banco reconstruído só pelas
   migrations ficaria sem RLS, e os grants amplos alcançariam linhas.

---

## 1. Uso real das tabelas — auditado no repositório

### 1.1 Acesso direto pela aplicação

Grep das três tabelas em todo o repositório, fora de `node_modules` e `.next`:

| Arquivo | Cliente | Operação direta |
| --- | --- | --- |
| `src/app/api/base/rooms/days/current/route.ts` (GET) | `context.supabase`, ou seja **service_role** | SELECT `housekeeping_days`, SELECT `housekeeping_tasks` (com embed de `rooms`, `blocks`, `floors`) |
| `src/app/api/base/rooms/days/[id]/close/route.ts` (POST) | **service_role** | SELECT `housekeeping_days` |
| `src/app/api/base/rooms/days/[id]/reopen/route.ts` (POST) | **service_role** | SELECT `housekeeping_days` |
| `src/app/api/base/rooms/tasks/[id]/route.ts` (PATCH) | **service_role** | SELECT `housekeeping_tasks` (embed `housekeeping_days!inner`), **UPDATE** `housekeeping_tasks` |
| `tests/e2e/helpers/db.ts` | `e2eDb()`: **service_role** (`SUPABASE_SERVICE_ROLE_KEY`) | SELECT nas 3 tabelas; **UPDATE** `housekeeping_tasks` (restauração de estado de teste) |
| `src/components/base-cadastros/rooms-utils.ts` | — | Só tipos e comentários. Nenhum acesso |
| `scripts/codex/*.py`, `docs/` | — | Texto e geradores de migration. Nenhum acesso |

**Rotas que chegam às tabelas só por RPC.** Elas não citam o nome das tabelas, por isso o grep
direto não as encontra:

| Arquivo | Cliente | RPC |
| --- | --- | --- |
| `src/app/api/base/rooms/days/route.ts` (POST, **abrir o dia**) | **service_role** | `housekeeping_open_day` |
| `src/app/api/base/rooms/transitions/route.ts` (POST) | **service_role** | `rooms_apply_transition` |
| `src/app/api/base/rooms/occupancy/route.ts` (POST, recepção) | **service_role** | `rooms_apply_transition` |
| `days/current` (GET) | **service_role** | `housekeeping_service_date` |
| `days/[id]/close`, `days/[id]/reopen` (POST) | **service_role** | `housekeeping_close_day`, `housekeeping_reopen_day` |

**Nas sete rotas**, `context.supabase` vem de `requirePermission()`
(`src/lib/auth/permissions.ts:477`). Ela autentica a sessão, cria `createSupabaseAdminClient()`
(`src/lib/supabase/admin.ts`, `server-only`, `SUPABASE_SERVICE_ROLE_KEY`) e checa permissão e
unidade **antes** de devolver o cliente. As rotas de escrita checam também
`userHasPermissionForUnit`.

### 1.2 Clientes não-admin

| Cliente | Onde é usado | Toca as três tabelas? |
| --- | --- | --- |
| `createSupabaseBrowserClient()` (`src/lib/supabase/client.ts`) | **Em lugar nenhum**: só a definição | Não |
| `createSupabaseServerClient()` (`src/lib/supabase/server.ts`, chave anon + sessão) | Só rotas de auth: `login`, `logout`, `change-password`, `session.ts` | Não |
| `anon` em `tests/e2e/helpers/db.ts:423` | Só `anon.rpc(...)`, para **provar que as RPCs estão fechadas** | Não, nenhuma tabela |
| Realtime (`postgres_changes`, `.channel(`) | Não usado | Não |
| Edge functions | Não existem (`supabase/` só tem `migrations/` e `README.md`) | Não |

**Nenhum consumidor depende dos grants de `anon` ou `authenticated` nessas tabelas.**

### 1.3 RPCs que acessam as tabelas

Todas criadas em 091–094. Todas **SECURITY DEFINER** com `set search_path = public`. Nenhuma view e
nenhuma trigger sobre as três tabelas.

| Função | Última definição | Toca | `execute` |
| --- | --- | --- | --- |
| `housekeeping_open_day(uuid, date, uuid)` | 092 | insere dia e tarefas | **só `service_role`** (revogado de public, anon, authenticated) |
| `housekeeping_close_day(uuid, uuid)` | 092 | dia, tarefas, eventos | **só `service_role`** |
| `housekeeping_reopen_day(uuid, uuid, text)` | 092 | dia, tarefas, eventos | **só `service_role`** |
| `rooms_apply_transition(jsonb, text, text, uuid)` | 094 | tarefas (efeitos da transição) | **só `service_role`** |
| `housekeeping_service_date(timestamptz, uuid)` | 091 | lê `units`, não estas tabelas | **só `service_role`** |

**Consequência para o hardening:** as RPCs rodam como o **dono da função**, não como quem chama.
Revogar grants de `anon`/`authenticated` **não as afeta**. O dono da função não foi medido; vai para
o preflight (§7.3). Se for `postgres`, que é o dono das tabelas, ele tem os privilégios de dono e,
com `FORCE RLS = false`, não é filtrado pelo RLS.

> **Por isso FORCE RLS não pode ser ligado.** Com FORCE ligado e 0 policies, o dono passaria a ser
> filtrado, e as RPCs deixariam de ver e gravar linhas. A governança inteira pararia.

---

## 2. Grants necessários

### 2.1 `anon` e `authenticated`

O mesmo resultado vale para os dois papéis e para as três tabelas.

| Papel | Privilégio | Necessário? | Usado? | Revogável? | Impacto da revogação |
| --- | --- | --- | --- | --- | --- |
| anon / authenticated | SELECT | **Não** | Não. Nenhum cliente não-admin lê as tabelas | Sim | Nenhum. Hoje o RLS já devolve 0 linhas |
| anon / authenticated | INSERT | **Não** | Não | Sim | Nenhum. Hoje o RLS já recusa |
| anon / authenticated | UPDATE | **Não** | Não | Sim | Nenhum. Hoje afeta 0 linhas |
| anon / authenticated | DELETE | **Não** | Não | Sim | Nenhum. Hoje afeta 0 linhas |
| anon / authenticated | TRUNCATE | **Não** | Não | Sim | **Remove operação que o RLS não cobre** |
| anon / authenticated | REFERENCES | **Não** | Não | Sim | Nenhum: ninguém cria FK com esses papéis |
| anon / authenticated | TRIGGER | **Não** | Não | Sim | Nenhum: ninguém cria trigger com esses papéis |
| anon / authenticated | MAINTAIN | **Não** | Não | Sim, via `revoke all` | Nenhum. Ver §2.3 |
| PUBLIC | qualquer | **Não** | Não | Sim | No-op se nada foi concedido (ACL padrão do dono não concede a PUBLIC) |

**Decisão: revogar todos**, com `revoke all privileges`.

### 2.2 `service_role`

| Papel | Privilégio | Necessário? | Motivo | Ação da migration |
| --- | --- | --- | --- | --- |
| service_role | SELECT | **Sim** | As 4 rotas e o E2E leem as 3 tabelas | `grant` explícito |
| service_role | UPDATE | **Sim** | `PATCH tasks/[id]` e E2E atualizam `housekeeping_tasks` | `grant` explícito |
| service_role | INSERT | Hoje só via RPC | As inserções são feitas pelas RPCs, como dono da função | `grant` explícito (CRUD-base) |
| service_role | DELETE | Hoje não | Nenhum delete direto | `grant` explícito (CRUD-base) |
| service_role | TRUNCATE / REFERENCES / TRIGGER / MAINTAIN | Não | — | **Não tocados**: nem concedidos nem revogados |
| service_role | BYPASSRLS | Sim | Acesso às linhas com RLS ativo e sem policy | **Não alterado** |

**Por que conceder, se já funciona:** `BYPASSRLS` dispensa o RLS, **não dispensa o GRANT**.
Nenhuma migration concede privilégio de tabela a `service_role`. O acesso que funciona hoje vem de
fora do repositório, provavelmente dos privilégios padrão do schema. O grant explícito tira a
dependência desse estado externo.

**INSERT e DELETE** entram pelo CRUD-base pedido para `service_role`, não por uso direto atual. Se
a ACL atual de `service_role` for o padrão do Supabase (ALL), o grant é no-op. Se não for, ele
amplia apenas para o CRUD. **A ACL atual de `service_role` não foi medida**: é item do preflight
(§7.3). Se a revisão preferir o mínimo estrito, o grant pode ser reduzido a SELECT e UPDATE sem
afetar as rotas atuais. Essa é a única escolha aberta da migration.

### 2.3 MAINTAIN e versão do PostgreSQL

`MAINTAIN` existe a partir do **PostgreSQL 17**. ~~Staging roda 17.6~~ *(corrigido em 2026-10-23:
17.6 é a versão indicada pelo arquivo local da CLI, `supabase/.temp/postgres-version`, sem medição
atual do servidor nesta evidência)*, e a auditoria viu `MAINTAIN` no
catálogo dos dois ambientes, ou seja, os dois estão em 17+.

A migration usa `revoke all privileges` e **não nomeia** `MAINTAIN`:

- no 17+, `ALL` inclui `MAINTAIN`;
- num PostgreSQL anterior, `revoke maintain` seria **erro de sintaxe**, e `revoke all` continua
  válido.

---

## 3. Estado desejado

| Item | Estado desejado | Hoje (medido em 2026-10-19) |
| --- | --- | --- |
| RLS | **ligado**, declarado em migration | ligado, **fora** do repositório |
| FORCE RLS | **desligado** (RPCs SECURITY DEFINER) | desligado |
| Policies | **nenhuma** (backend-only, default deny) | nenhuma |
| `anon` | **nenhum** privilégio de tabela | todos |
| `authenticated` | **nenhum** privilégio de tabela | todos |
| PUBLIC | nenhum | não medido; esperado nenhum |
| `service_role` | SELECT, INSERT, UPDATE, DELETE **declarados** | não medido; presumido ALL |
| ACL das RPCs | só `service_role` (inalterado) | só `service_role` |
| Default privileges do schema | **inalterado** (decisão separada) | — |

Fluxo:

```text
SIM:   cliente → API Next.js → requirePermission → service_role → banco
NÃO:   cliente → tabela diretamente
```

### Data API

Mesmo com `public` em "Exposed schemas", a combinação

```text
RLS ativo  +  sem policies  +  sem grants diretos para anon/authenticated
```

faz a proteção **não depender** da configuração externa da Data API. Sem grant, a tabela some do
esquema que esses papéis enxergam pelo PostgREST. Se um grant voltar por engano, o RLS ainda segura
as linhas. **São duas barreiras independentes**, e nenhuma delas depende de configuração fora do
repositório.

---

## 4. A migration

**Criada:** `supabase/migrations/20261019184500_housekeeping_security_hardening.sql`.

**Por que foi seguro criar:** a auditoria do §1 não encontrou **nenhum** consumidor dos grants de
`anon`/`authenticated`. Os caminhos que existem usam `service_role` diretamente ou por RPCs SECURITY
DEFINER. A migration não remove nada de `service_role`, não mexe em ACL de função e não cria policy.

### Nome

- Formato timestamp, posterior a `20260918120033`.
- **Não reutiliza** 091–094 e **não edita** migration antiga.
- A CLI não está instalada localmente, e o `npx` a baixaria. Para não instalar nada, o nome foi dado
  manualmente **no formato do `supabase migration new`** (`YYYYMMDDHHMMSS`, UTC).

### Conteúdo executável

```sql
alter table public.housekeeping_days        enable row level security;
alter table public.housekeeping_tasks       enable row level security;
alter table public.housekeeping_day_events  enable row level security;

revoke all privileges on table public.housekeeping_days        from anon, authenticated;
revoke all privileges on table public.housekeeping_tasks       from anon, authenticated;
revoke all privileges on table public.housekeeping_day_events  from anon, authenticated;

revoke all privileges on table public.housekeeping_days        from public;
revoke all privileges on table public.housekeeping_tasks       from public;
revoke all privileges on table public.housekeeping_day_events  from public;

grant select, insert, update, delete on table public.housekeeping_days        to service_role;
grant select, insert, update, delete on table public.housekeeping_tasks       to service_role;
grant select, insert, update, delete on table public.housekeeping_day_events  to service_role;
```

O arquivo traz ainda, em comentário: a justificativa, o que **não** faz, as consultas de validação e
o rollback.

### Idempotência

| Situação de partida | Resultado |
| --- | --- |
| RLS já ligado | `enable` sem efeito, sem erro |
| RLS desligado | Liga |
| Grants amplos presentes | Revogados |
| Grants parcialmente removidos | Revoga o que restar; o resto é no-op |
| Grants já removidos | No-op |
| `service_role` já com ALL | `grant` no-op; nada é revogado dele |
| Tabela ausente (091/092 não aplicadas) | **Falha**, de propósito: a ordem está errada |

### Rollback documental

**Rollback de segurança não é "voltar ao estado anterior".** O anterior tinha grants desnecessários.

1. **Rota quebrou?** A migration não remove acesso de `service_role`. Primeiro rodar a validação (2)
   do arquivo para `service_role`. A hipótese inicial não deve ser esta migration.
2. **Apareceu consumidor legítimo de `anon`/`authenticated`?** Hoje não existe. Se aparecer,
   conceder **só o privilégio necessário**, com policy, em migration própria e revisada.
3. **Nunca desligar o RLS como rollback.** Com qualquer grant presente, isso expõe linhas.
4. **Restauração literal** (`grant all … to anon, authenticated`): está no arquivo, comentada, e
   **só com decisão explícita registrada**. Ela reabre TRUNCATE, REFERENCES, TRIGGER e MAINTAIN.

---

## 5. Teste local descartável

Mesmo modelo de [`TESTE_LOCAL_RECONCILIACAO_INDICES_2026-10-16.md`](TESTE_LOCAL_RECONCILIACAO_INDICES_2026-10-16.md):
PostgreSQL 17 local, banco descartável. **Executado em 2026-10-19 e APROVADO** nos cenários A, B e
C: [`P4_S1A_TESTE_LOCAL_HARDENING_GOVERNANCA_2026-10-19.md`](P4_S1A_TESTE_LOCAL_HARDENING_GOVERNANCA_2026-10-19.md).
O roteiro abaixo é o desenho original.

### 5.1 Preparação

1. Criar os papéis do Supabase, que não existem num PostgreSQL puro:
   `anon` e `authenticated` (`nologin`, sem `bypassrls`) e `service_role` (`nologin`, `bypassrls`).
2. Criar tabelas-pai mínimas e as três tabelas. O ideal é usar as definições de 091/092; o mínimo
   aceitável é o mesmo nome com uma coluna.
3. Simular os grants medidos: `grant all privileges on table … to anon, authenticated, service_role`.

### 5.2 Cenários de partida

| Cenário | RLS antes | Grants antes | Objetivo |
| --- | --- | --- | --- |
| **A** | ligado | amplos | Reproduz staging e produção de hoje |
| **B** | **desligado** | amplos | Reproduz um banco reconstruído só pelas migrations |
| **C** | ligado | `anon` já sem nada, `authenticated` amplo | Estado parcial |

### 5.3 Aplicar e verificar

Rodar o arquivo inteiro, em cada cenário, e conferir:

- `relrowsecurity = true` e `relforcerowsecurity = false` nas 3 tabelas;
- `anon` e `authenticated` com **todos** os `has_table_privilege` em `false`, incluindo TRUNCATE,
  REFERENCES e TRIGGER;
- ACL bruta sem `anon=`, `authenticated=` nem entrada de PUBLIC, o que confirma também `MAINTAIN`;
- `service_role` com SELECT, INSERT, UPDATE e DELETE em `true`;
- 0 policies.

### 5.4 Comportamento, com `set role`

- `set role anon; select count(*) from public.housekeeping_days;` → **erro de permissão**, não 0
  linhas.
- `set role service_role; select …; update …;` → funciona.
- Criar uma função SECURITY DEFINER de teste, com dono igual ao dono das tabelas, que faça insert,
  e chamá-la como `service_role` → **funciona**. Isso prova que as RPCs não dependem dos grants
  revogados.

### 5.5 Reaplicar

Rodar o arquivo de novo nos três cenários: **sem erro**, e todas as verificações do §5.3 com o
mesmo resultado.

---

## 6. Testes de aplicação — antes de staging e depois

### 6.1 Antes de aplicar em staging

A suíte E2E da governança, contra staging no estado atual, como **linha de base**.

### 6.2 Smoke depois de aplicar em staging

| # | Ação | Rota / caminho | Esperado |
| --- | --- | --- | --- |
| 1 | Abrir o dia da governança | `POST /api/base/rooms/days` (`housekeeping_open_day`) | 200; dia criado |
| 2 | Carregar o dia atual | `GET /api/base/rooms/days/current` | 200; dia e tarefas |
| 3 | Listar tarefas | mesma rota, embed `rooms`/`blocks`/`floors` | 200; tarefas com o apartamento |
| 4 | Registrar dispensa | `PATCH /api/base/rooms/tasks/[id]` | 200; `outcome = declined` |
| 5 | Transição de quarto com efeito na tarefa | `POST /api/base/rooms/transitions` e `POST /api/base/rooms/occupancy` (`rooms_apply_transition`) | 200; tarefa atualizada |
| 6 | Fechar o dia | `POST /api/base/rooms/days/[id]/close` | 200; evento `closed` |
| 7 | Reabrir o dia | `POST /api/base/rooms/days/[id]/reopen` | 200; evento `reopened` |
| 8 | Usuário sem permissão | qualquer das rotas | **403** (o gate continua igual) |
| 9 | Nenhuma rota com 500 inesperado | logs da aplicação | sem `42501 permission denied` |
| 10 | `anon` direto na tabela | `select` como `anon` (catálogo ou `set role` no SQL Editor) | **sem privilégio** |
| 11 | `authenticated` direto na tabela | idem | **sem privilégio** |
| 12 | Suíte E2E completa da governança | — | verde, igual à linha de base do §6.1 |

**Atenção ao sinal de regressão:** se alguma rota passar a falhar com `permission denied for table
housekeeping_*`, o grant de `service_role` não está como esperado. **Parar** e conferir a validação
(2) do arquivo. A correção **não é** devolver grant a `anon`/`authenticated`.

---

## 7. Aplicação — condições (não autorizada nesta tarefa)

### 7.1 A migration entra na mesma fila de P4

Ela é uma migration nova, ausente do ledger nos dois ambientes. **`db push` continua bloqueado pelo
`repair` das legadas** (P4). Ela **não pode** ser aplicada por `db push` antes disso, assim como a
migration de índices.

Como os bancos **já estão seguros** para CRUD de linhas, **não há urgência** que justifique aplicar
por outro caminho. Se for decidido aplicar antes de P4, por exemplo manualmente no SQL Editor, isso
exige decisão explícita própria, e a versão precisa entrar no ledger depois **por execução**, nunca
por `repair` sem efeito.

### 7.2 Ordem

```text
teste local (§5)  →  staging (§6)  →  produção
```

### 7.3 Preflight, imediatamente antes, em cada ambiente

1. Confirmar projeto e ref.
2. Confirmar commit e blob da migration.
3. As consultas do §13.1 de `P4_AUDITORIA_MIGRATIONS_LEGADAS.md` **mais `service_role`**. A ACL
   atual de `service_role` **não foi medida** em 2026-10-19.
4. **Dono das 5 RPCs** (`pg_proc.proowner`) e dono das tabelas: confirmar que as RPCs não dependem
   de grants de `anon`/`authenticated`.
5. Locks e transações abertas nas três tabelas: o `enable row level security` pede ACCESS EXCLUSIVE.

---

## 8. Impacto no P4

### 8.1 Duas migrations timestamp deliberadamente pendentes

Com esta migration, passam a existir **duas** migrations novas que **nunca entram em `repair`**:

| # | Migration | Objeto |
| --- | --- | --- |
| 1 | `20260918120033_hr_workflow_idempotency_indexes_parity.sql` | 3 índices em `hr_workflow_idempotency_keys` |
| 2 | `20261019184500_housekeeping_security_hardening.sql` | RLS e grants das 3 tabelas de governança |

As duas tocam **objetos disjuntos**. A ordem entre elas não importa para o resultado.

### 8.2 O critério pós-`repair` muda

```text
ANTES:   depois do repair, exatamente 1 migration pendente
AGORA:   depois do repair, exatamente as migrations novas deliberadamente
         não reparadas — hoje, estas 2
```

| Ambiente | Legadas | Novas | **Fila antes do `repair`** | **Pendentes depois do `repair`** |
| --- | --- | --- | --- | --- |
| Staging | 28 | **2** | **30** | **2** |
| Produção | 54 | **2** | **56** | **2** |

> **Cuidado com a coincidência.** As filas voltam a ser 30 e 56, os números errados de antes. Agora
> estão **certos**, por outro motivo: 28 + 2 e 54 + 2. Antes eram 29 + 1 e 55 + 1, com o `074`
> contado por engano.

**Qualquer resultado diferente de "exatamente estas 2" depois do `repair` é parada:**

- 1 pendente: uma das duas foi reparada por engano (R3);
- 0 pendentes: as duas foram;
- 3 ou mais: o `repair` das legadas ficou incompleto.

> **Atualização 2026-10-23 — o critério passou a 3.** A legada `084_auth_login_attempts` também fica
> **fora do `repair`** e será **aplicada de verdade** (é C nos dois ambientes; arquivo corrigido só no
> comentário). Depois do `repair` restam **pelo menos 3**: `084`, `20260918120033` e
> `20261019184500`, sempre conferidas pelo nome. O total exato é a lista fechada definida depois da
> classificação completa das legadas. As filas **não mudam** (30 / 56), porque a `084` já estava no
> backlog legado.
> Ver `PLANO_RECONCILIACAO_MIGRATIONS.md` §5(e) e `P4_084_INVESTIGACAO_PRODUCAO_2026-10-22.md`.

### 8.3 Documentos atualizados no versionamento (P4-S1B)

O critério antigo, "exatamente UMA pendente", e as contagens 94 e 29/55 foram atualizados para
**95**, **30/56** e **"exatamente as 2 migrations novas, pelo nome"** em:

- `PLANO_RECONCILIACAO_MIGRATIONS.md`: §1.1, §1.5, §2, R1, R3, R4, §5(d)(e)(g)(h)(i)(j), §8, §9 e
  §11;
- `ACOES_MANUAIS_SUPABASE.md`: AM-03 e AM-04 passo (e);
- `PREFLIGHT_PRODUCAO_RECONCILIACAO_MIGRATIONS.md`: nota de condição do §3;
- `GO_NO_GO_RECONCILIACAO_INDICES_2026-10-16.md`: P4;
- `P4_AUDITORIA_MIGRATIONS_LEGADAS.md`: §4, §5 e §14.1.

Os trechos com valor histórico receberam nota temporal em vez de serem reescritos. O `ledger` não foi
tocado.

> **Achado do versionamento:** o `db push` aplica **as duas** migrations novas na mesma execução.
> Em staging, a de índices é no-op, mas a de hardening **não é**: revoga grants. Registrado no §5(g)
> do plano.

---

## 9. Confirmações

- Nenhum acesso remoto e nenhum SQL remoto executado.
- Nenhuma migration aplicada. A nova migration está **testada localmente, versionada e não
  aplicada**.
- Nenhum `repair`, `db push` ou `migration up`.
- RLS, grants e policies remotos não foram alterados.
- Nenhuma migration antiga foi editada.
