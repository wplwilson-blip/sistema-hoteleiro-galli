# P4-S1A — Teste Local da Migration de Hardening da Governança — 2026-10-19

**Documento de evidência.** Registra um teste que aconteceu, num banco local descartável. Não é
roteiro e **não autoriza aplicação** em staging ou produção.

| | |
| --- | --- |
| **Migration testada** | `supabase/migrations/20261019184500_housekeeping_security_hardening.sql`, **sem nenhuma edição** |
| **Desenho** | [`P4_S1_HARDENING_GOVERNANCA.md`](P4_S1_HARDENING_GOVERNANCA.md) |
| **Commit de referência** | `4071919` (a migration ainda não está versionada) |
| **Identidade do arquivo testado** | `git hash-object` = `fa7308befcfa85e35818b9726c573f50b1970e10`. Deve ser o blob depois do commit; se divergir, o arquivo mudou depois do teste |
| **Motor** | **PostgreSQL 17.11** local (`x86_64-windows`) |
| **Instância** | **Cluster descartável novo** (`initdb`), porta 54329, só `localhost`, autenticação `trust` local. A instância local que já existia **não foi usada** |
| **Bancos** | `hotel_galli_housekeeping_security_test` (A), `hotel_galli_housekeeping_security_rls_off` (B), `hotel_galli_housekeeping_security_partial` (C) |
| **Sistema** | Windows |
| **Data** | 2026-10-19 |
| **Resultado** | **TODOS OS CENÁRIOS PASSARAM.** As 6 aplicações (3 cenários × aplicar e reaplicar) terminaram com `exit 0` |

Nenhuma senha foi criada ou registrada. Ao final o cluster foi parado.

---

## 1. Montagem

### 1.1 Papéis

| Papel | `superuser` | `bypassrls` | `login` | Papel no teste |
| --- | --- | --- | --- | --- |
| `anon` | f | f | f | Cliente anônimo do Supabase |
| `authenticated` | f | f | f | Cliente logado do Supabase |
| `service_role` | f | **t** | f | Servidor da aplicação |
| `app_owner` | **f** | **f** | t | **Dono** das tabelas e da função de teste |

**Por que um dono não superusuário e sem `BYPASSRLS`.** Superusuário ignora RLS. Se as tabelas
fossem do `postgres` local, que é superusuário, a função `SECURITY DEFINER` passaria pelo motivo
errado. Com `app_owner` sem nenhum atributo especial, a função só funciona **por rodar como dono da
tabela sem FORCE RLS**. Esse é exatamente o mecanismo que se quer provar.

### 1.2 Fixture (igual nos três bancos)

- `housekeeping_days` (id uuid, unit_id, service_date, note): **2 linhas**.
- `housekeeping_tasks` (id, FK para days, outcome): **3 linhas**.
- `housekeeping_day_events` (id, FK para days, event): **1 linha**.
- Ids gerados por `gen_random_uuid()`, **sem sequence**. Assim um INSERT de cliente falha pelo
  RLS ou pelo grant da tabela, e não por falta de privilégio em sequence.
- Função `public.test_definer_insert_event(uuid, text)`: `SECURITY DEFINER`,
  `set search_path = public`, dono `app_owner`, insere em `housekeeping_day_events`. `execute`
  revogado de PUBLIC e concedido **só a `service_role`**. É o mesmo padrão das RPCs da governança.

### 1.3 Como a migration foi aplicada

```text
psql -U app_owner -d <banco> -v ON_ERROR_STOP=1 -1 -e -f <migration>
```

- **Conectado como o dono das tabelas**, como o executor de migrations do Supabase faz.
- `-1`: **transação única**, como o executor.
- `ON_ERROR_STOP=1`: para no primeiro erro.
- O arquivo foi lido **direto do repositório**, sem cópia e sem edição.

Os testes de comportamento rodaram como superusuário com `set local role <papel>`, **cada operação
dentro de uma transação desfeita por `rollback`**. Nenhum dado da fixture foi alterado entre etapas:
a contagem real ficou **2 / 3 / 1** do início ao fim.

---

## 2. Cenário A — estado atual de staging e produção

Estado simulado: **RLS ligado nas 3**, 0 policies, `grant all` para `anon`, `authenticated` e
`service_role`. Reproduz o medido em 2026-10-19.

### 2.1 Antes

**Catálogo:**

```text
relname                 | rls | force_rls | dono
housekeeping_day_events | t   | f         | app_owner
housekeeping_days       | t   | f         | app_owner
housekeeping_tasks      | t   | f         | app_owner
policies = 0

relname                 | papel         | s i u d t r g m     (select insert update delete truncate references trigger maintain)
(as 3 tabelas)          | anon          | t t t t t t t t
(as 3 tabelas)          | authenticated | t t t t t t t t
(as 3 tabelas)          | service_role  | t t t t t t t t

ACL: app_owner=arwdDxtm | anon=arwdDxtm | authenticated=arwdDxtm | service_role=arwdDxtm   (nas 3)
```

**Comportamento de `anon`** (`authenticated` teve resultado **idêntico**):

| Operação | Resultado | Quem bloqueou |
| --- | --- | --- |
| `SELECT count(*)` em days | **0 linhas** (existem 2) | **RLS** (default deny, sem erro) |
| `INSERT` em days | `ERROR 42501: new row violates row-level security policy for table "housekeeping_days"` | **RLS** |
| `UPDATE` em tasks | `UPDATE 0` | **RLS** (nenhuma linha visível) |
| `DELETE` em day_events | `DELETE 0` | **RLS** |
| `TRUNCATE` em day_events | **`TRUNCATE TABLE` — EXECUTOU** (desfeito por rollback) | **Ninguém bloqueou** |
| `EXECUTE` da função definer | `ERROR 42501: permission denied for function` | ACL da função |

> **O achado que justifica o hardening, reproduzido.** Com RLS ligado e grants amplos, `anon` e
> `authenticated` **não conseguem ver** nenhuma linha, mas **conseguem apagar todas** com
> `TRUNCATE`. O RLS não se aplica a `TRUNCATE`. Isto é o comportamento do PostgreSQL num banco
> local. **Não foi testado em staging ou produção**, nem por qualquer caminho de API.

**`service_role`:** SELECT nas 3 (2 / 3 / 1) e INSERT, UPDATE e DELETE nas 3: **OK**.
**Função definer** chamada como `service_role`: **inseriu** (1 evento visível ao superusuário).

### 2.2 Aplicação

```text
alter table … enable row level security;     ALTER TABLE  (×3)
revoke all … from anon, authenticated;        REVOKE       (×3)
revoke all … from public;                     REVOKE       (×3)
grant select, insert, update, delete … to service_role;   GRANT (×3)
MIGRATION_EXIT=0
```

### 2.3 Depois

**Catálogo:**

```text
rls = t, force_rls = f nas 3          policies = 0

(as 3 tabelas) | anon          | f f f f f f f f
(as 3 tabelas) | authenticated | f f f f f f f f
(as 3 tabelas) | service_role  | t t t t t t t t

ACL: app_owner=arwdDxtm/app_owner | service_role=arwdDxtm/app_owner   (nas 3)
```

A ACL bruta **não tem mais** entrada de `anon`, `authenticated` nem de PUBLIC. O `m` (MAINTAIN)
também saiu, sem a migration nomeá-lo: o `revoke all` o cobriu.

**Comportamento de `anon` e `authenticated`**, idêntico para os dois:

| Operação | Resultado | Quem bloqueou |
| --- | --- | --- |
| SELECT | `ERROR 42501: permission denied for table housekeeping_days` | **grant** |
| INSERT | `ERROR 42501: permission denied for table housekeeping_days` | **grant** |
| UPDATE | `ERROR 42501: permission denied for table housekeeping_tasks` | **grant** |
| DELETE | `ERROR 42501: permission denied for table housekeeping_day_events` | **grant** |
| TRUNCATE | `ERROR 42501: permission denied for table housekeeping_day_events` | **grant** |
| EXECUTE da função | `ERROR 42501: permission denied for function` | ACL da função (inalterada) |

**O bloqueio mudou de camada.** Antes vinha do RLS (resultado vazio, ou violação de policy). Agora
vem da **falta de privilégio**, antes de o RLS ser consultado. Os dois erros têm o mesmo SQLSTATE
`42501`. A diferença está na mensagem e na origem: `ExecWithCheckOptions` (RLS) versus
`aclcheck_error` (grant).

**`service_role`:** SELECT, INSERT, UPDATE e DELETE nas 3: **OK**.

**Função `SECURITY DEFINER` como `service_role`: INSERIU. Item bloqueante: PASSOU.** Ficou provado
que `enable row level security` **sem FORCE** é compatível com função definer cujo dono é o dono da
tabela, mesmo com esse dono **sem `BYPASSRLS`** e **sem superusuário**.

### 2.4 Reaplicação

Mesmo arquivo, de novo: **`MIGRATION_EXIT=0`**, os mesmos 12 comandos sem erro. Catálogo depois:
**idêntico** ao do §2.3, sem nenhuma entrada a mais ou a menos na ACL. `anon` e `authenticated`
continuaram com `permission denied`. `service_role` continuou com CRUD, e a função definer continuou
inserindo. **Reaplicação = no-op estrutural.**

---

## 3. Cenário B — RLS desligado (banco reconstruído só pelas migrations)

Estado simulado: **RLS desligado nas 3**, 0 policies, `grant all` para os três papéis. É o que um
banco teria se fosse montado **só** pelas migrations 091/092, sem o RLS que hoje existe fora do
repositório.

### 3.1 Antes: exposição real, no banco local

| Papel | SELECT days | INSERT days | UPDATE tasks | DELETE events | TRUNCATE events |
| --- | --- | --- | --- | --- | --- |
| `anon` | **2 linhas visíveis** | `INSERT 0 1` | **`UPDATE 3`** | **`DELETE 1`** | executou |
| `authenticated` | **2 linhas visíveis** | `INSERT 0 1` | **`UPDATE 3`** | **`DELETE 1`** | executou |

Tudo foi desfeito com rollback. **Isso confirma o risco de reprodutibilidade registrado em
`P4_RLS_GOVERNANCA_2026-10-19.md` §6:** sem o RLS que hoje vem de fora do repositório, os grants
amplos dão leitura e escrita total aos clientes.

### 3.2 Depois

```text
rls = t (era f), force_rls = f nas 3          policies = 0
anon          | f f f f f f f f   (nas 3)
authenticated | f f f f f f f f   (nas 3)
service_role  | t t t t t t t t   (nas 3)
ACL: app_owner=arwdDxtm | service_role=arwdDxtm   (nas 3)
```

- `anon` e `authenticated`: `permission denied` em SELECT, INSERT, UPDATE, DELETE e TRUNCATE.
- `service_role`: CRUD OK nas 3. Função definer: **inseriu**.
- **Reaplicação:** `MIGRATION_EXIT=0`, catálogo idêntico.

**A migration leva um banco sem RLS ao estado desejado.** A reprodutibilidade está provada.

---

## 4. Cenário C — grants parciais

Estado simulado, diferente por tabela:

| Tabela | RLS antes | `anon` antes | `authenticated` antes | `service_role` antes |
| --- | --- | --- | --- | --- |
| `housekeeping_days` | t | nada | **só SELECT** | **só SELECT** |
| `housekeeping_tasks` | t | nada | nada | **nada** (ACL nula) |
| `housekeeping_day_events` | **f** | nada | SELECT, INSERT | **só TRUNCATE e TRIGGER** |

ACL antes:

```text
housekeeping_day_events | app_owner=arwdDxtm/app_owner | authenticated=ar/app_owner | service_role=Dt/app_owner
housekeeping_days       | app_owner=arwdDxtm/app_owner | authenticated=r/app_owner  | service_role=r/app_owner
housekeeping_tasks      | (nula)
```

### 4.1 Aplicação

`MIGRATION_EXIT=0`. Os `revoke` sobre papéis sem grant e o `revoke from public` **não deram erro**.

### 4.2 Depois

```text
rls = t nas 3 (day_events era f)          policies = 0

housekeeping_day_events | anon          | f f f f f f f f
housekeeping_day_events | authenticated | f f f f f f f f
housekeeping_day_events | service_role  | t t t t t f t f
housekeeping_days       | anon / authenticated | f f f f f f f f
housekeeping_days       | service_role  | t t t t f f f f
housekeeping_tasks      | anon / authenticated | f f f f f f f f
housekeeping_tasks      | service_role  | t t t t f f f f

housekeeping_day_events | app_owner=arwdDxtm/app_owner | service_role=arwdDt/app_owner
housekeeping_days       | app_owner=arwdDxtm/app_owner | service_role=arwd/app_owner
housekeeping_tasks      | app_owner=arwdDxtm/app_owner | service_role=arwd/app_owner
```

**O que aconteceu com `service_role`, exatamente:**

| Tabela | Antes | Depois | Efeito da migration |
| --- | --- | --- | --- |
| `housekeeping_days` | `r` (SELECT) | `arwd` | **Ganhou** INSERT, UPDATE, DELETE |
| `housekeeping_tasks` | nada | `arwd` | **Ganhou** CRUD completo, partindo do zero |
| `housekeeping_day_events` | `Dt` (TRUNCATE, TRIGGER) | `arwdDt` | **Ganhou** CRUD; **manteve** TRUNCATE e TRIGGER |

**Isto é o comportamento desenhado:** a migration **garante** o CRUD de `service_role` e **não
revoga nada** dele. Privilégios extras que `service_role` já tivesse continuam. Em staging e produção
o esperado é ALL, como no cenário A, e então não muda nada para `service_role`.

- `anon` e `authenticated`: `permission denied` em todas as operações, nas 3.
- `service_role`: CRUD OK nas 3. Função definer: **inseriu**.
- **Reaplicação:** `MIGRATION_EXIT=0`, catálogo idêntico ao §4.2.

**Estado final convergente** para `anon`, `authenticated`, RLS e policies, partindo de estados
diferentes por tabela.

---

## 5. Resumo

| Verificação | A (atual) | B (RLS off) | C (parcial) |
| --- | --- | --- | --- |
| Aplicação sem erro | ✅ | ✅ | ✅ |
| RLS = true, FORCE = false nas 3 | ✅ | ✅ (era false) | ✅ (day_events era false) |
| 0 policies | ✅ | ✅ | ✅ |
| `anon` sem nenhum privilégio de tabela, MAINTAIN incluído | ✅ | ✅ | ✅ |
| `authenticated` sem nenhum privilégio de tabela | ✅ | ✅ | ✅ |
| ACL sem `anon=`, `authenticated=` ou PUBLIC | ✅ | ✅ | ✅ |
| `service_role` com SELECT, INSERT, UPDATE, DELETE | ✅ | ✅ | ✅ |
| `service_role` CRUD real (comportamento) | ✅ | ✅ | ✅ |
| **Função SECURITY DEFINER inserindo como `service_role`** | ✅ | ✅ | ✅ |
| Reaplicação sem erro e sem mudança | ✅ | ✅ | ✅ |

**Nenhum cenário revelou problema. A migration não foi alterada.**

---

## 6. Diferenças em relação ao Supabase real

| Aspecto | Teste local | Supabase |
| --- | --- | --- |
| Stack | Só PostgreSQL 17.11 | PostgreSQL 17.6 + PostgREST, Auth, Realtime, Storage, GraphQL |
| Dono das tabelas | `app_owner`: sem superusuário, **sem `BYPASSRLS`** | `postgres` (atributos não medidos na auditoria) |
| Papéis | Criados à mão, com os atributos medidos em 2026-10-19 | Papéis da plataforma, com associações entre eles |
| Privilégios padrão do schema | Não reproduzidos | Concedem a `anon`, `authenticated` e `service_role` em tabelas novas |
| Schema das tabelas | Fixture mínima: colunas e FKs simplificadas, sem CHECKs, enums ou índices de 091/092 | Schema completo |
| RPCs | Uma função de teste no **mesmo padrão** | As 5 RPCs reais (091–094) |
| Executor | `psql -1` como dono | `supabase db push` |
| Acesso de cliente | `set role`, direto no banco | Requisições HTTP pela Data API |

**Por que o dono sem `BYPASSRLS` torna o teste mais exigente, e não menos.** Se o `postgres` do
Supabase tiver `BYPASSRLS`, as RPCs passam com folga ainda maior. O teste mostrou que elas passam
mesmo **sem** esse atributo.

---

## 7. Limitações

- **Não testou as RPCs reais.** A função de teste segue o mesmo padrão, mas não é nenhuma das 5.
  As RPCs reais ficam para o smoke de staging (`P4_S1_HARDENING_GOVERNANCA.md` §6).
- **Não testou a aplicação Next.js** nem as rotas. Fica para o smoke de staging.
- **Não testou acesso pela Data API.** A prova de cliente foi por `set role`, no banco.
- **`revoke … from public` foi exercido só como no-op.** Nenhum cenário concedia algo a PUBLIC
  antes. Ficou provado que não dá erro; a remoção de um grant real de PUBLIC não foi exercida.
- **Não mediu o dono das RPCs nem a ACL de `service_role` em staging e produção.** Continuam itens
  do preflight (`P4_S1_HARDENING_GOVERNANCA.md` §7.3).
- **Não mediu lock nem tempo.** As tabelas da fixture são minúsculas.
- **Não foi usado staging nem produção. Nada remoto foi alterado.**

---

## 8. Reprodução

Os scripts ficaram fora do repositório, no scratchpad da sessão: `00_cluster.sql`,
`01_fixture.sql`, `02a/b/c_state_*.sql`, `10_catalog.sql`, `20_clients.sql`, `30_service.sql` e
`run.sh`. A estrutura deles está descrita nos §1–§4. Para reproduzir:

1. `initdb` de um cluster novo e descartável, com o PostgreSQL 17.
2. Criar os 4 papéis do §1.1 e 3 bancos com dono `app_owner`.
3. Fixture do §1.2 em cada banco, como `app_owner`.
4. Estado de partida de cada cenário (§2, §3, §4), como `app_owner`.
5. Aplicar a migration como no §1.3, duas vezes por banco, conferindo catálogo e comportamento
   antes, depois e depois da reaplicação.
