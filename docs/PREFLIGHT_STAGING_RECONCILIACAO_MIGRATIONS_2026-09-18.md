# Preflight — STAGING — Reconciliação de Migrations

**Documento de evidência.** Registra uma execução que aconteceu. Não é roteiro, não é plano, e não
autoriza nada.

O roteiro está em [`PLANO_RECONCILIACAO_MIGRATIONS.md`](PLANO_RECONCILIACAO_MIGRATIONS.md), §12.
O equivalente para produção está em
[`PREFLIGHT_PRODUCAO_RECONCILIACAO_MIGRATIONS.md`](PREFLIGHT_PRODUCAO_RECONCILIACAO_MIGRATIONS.md)
e **ainda não foi executado**.

---

## 1. Identificação

| | |
| --- | --- |
| **Ambiente** | staging |
| **Projeto** | `galli-staging` |
| **Project ref** | `jascnmgagejlvjlenduv` |
| **Data da execução** | 2026-09-18 |
| **Commit Git** | `a1cfbb4` (`docs-db-reconciliation-plan-and-idempotency-parity`) |
| **Migration analisada** | `20260918120033_hr_workflow_idempotency_indexes_parity.sql` |
| **MD5 da migration** | `ee9d1a11f93a9034b5c5e7e24b27ebef` *(forma CRLF, nesta máquina)* |
| **Blob Git da migration** | `74ccd8e2a2a8d322f1e1a1c423e92f86a5da13ee` — **identidade estável** |

> **Sobre o MD5, registrado porque muda a leitura de qualquer conferência futura.** O repositório
> roda com `core.autocrlf = true` e sem `.gitattributes`: o arquivo em disco tem os finais de linha
> convertidos pela plataforma, e **o MD5 varia entre máquinas sem que o conteúdo mude**. O valor
> acima é o da forma CRLF observada no Windows.
>
> **Para conferir identidade, use o blob efetivamente versionado:**
>
> ```bash
> git rev-parse HEAD:supabase/migrations/20260918120033_hr_workflow_idempotency_indexes_parity.sql
> ```
>
> Esse comando resolve um caminho **dentro da árvore do commit** — ele não lê a cópia de trabalho
> nem calcula hash sobre ela. Por isso o valor é o mesmo para qualquer pessoa que tenha o commit
> `a1cfbb4`, independentemente de o checkout ter materializado LF ou CRLF.
>
> ⚠️ **`git hash-object <arquivo-da-working-tree>` não serve como prova cross-platform**: ele parte
> dos bytes em disco e depende dos filtros e atributos em vigor. A evidência aponta para o objeto
> versionado, não para a cópia local. `git diff HEAD -- <arquivo>` vazio também vale, pela mesma
> razão: compara com o commit depois dos filtros.

### O que esta execução foi, e o que não foi

- **Somente SQL de leitura.** Nenhum `create`, `drop`, `alter`, `insert`, `update` ou `delete`.
- **A migration NÃO foi aplicada.** Ela segue versionada e não aplicada em nenhum ambiente.
- **Produção (`hotel-galli-admin` / `chnamldrlwohaudmjrez`) não foi utilizada** nesta execução.
- **Staging serviu a dois propósitos:** validar que o procedimento do §12 executa como escrito, e
  registrar o estado daquele ambiente na data observada.

> **Escopo do que este documento prova:** o estado de **`galli-staging`**, **em 2026-09-18**. Nada
> além disso. Ver §8.

---

## 2. §12.1(a) — Volume de linhas

```sql
select count(*) as linhas from public.hr_workflow_idempotency_keys;
```

**Resultado:**

```
linhas = 0
```

A tabela existe e está vazia. O `count(*)` ter respondido confirma, de passagem, a premissa do
pacote: `public.hr_workflow_idempotency_keys` está presente em staging.

---

## 3. §12.1(b) — Tamanho da relação

```sql
select pg_size_pretty(pg_total_relation_size('public.hr_workflow_idempotency_keys')) as total,
       pg_size_pretty(pg_relation_size('public.hr_workflow_idempotency_keys'))       as heap,
       pg_size_pretty(pg_indexes_size('public.hr_workflow_idempotency_keys'))        as indices;
```

**Resultado:**

```
total   = 96 kB
heap    = 0 bytes
indices = 88 kB
```

**Leitura:** `heap = 0 bytes` é coerente com `linhas = 0` — a tabela nunca recebeu dado que
justificasse alocar página. Os 88 kB de índice correspondem aos 11 índices ocupando uma página cada
(11 × 8192 bytes = 88 kB), o que bate com a telemetria de `inspect db index-stats` registrada na
§3.3 do plano.

---

## 4. §12.1(c) — Atividade de escrita, duas amostras

```sql
select now() as amostrado_em, n_tup_ins, n_tup_upd, n_tup_del, n_live_tup, n_dead_tup
from pg_stat_user_tables
where relid = 'public.hr_workflow_idempotency_keys'::regclass;
```

```sql
select stats_reset from pg_stat_database where datname = current_database();
```

### Amostra 1

```
amostrado_em = 2026-09-18 19:16:33.617852+00
n_tup_ins    = 0
n_tup_upd    = 0
n_tup_del    = 0
n_live_tup   = 0
n_dead_tup   = 0

stats_reset  = 2026-05-22 15:13:20.515541+00
```

### Amostra 2

```
amostrado_em = 2026-09-18 19:28:53.475517+00
n_tup_ins    = 0
n_tup_upd    = 0
n_tup_del    = 0
n_live_tup   = 0
n_dead_tup   = 0

stats_reset  = 2026-05-22 15:13:20.515541+00
```

### Delta

| | |
| --- | --- |
| **Intervalo** | `0:12:19.857665` — **12 min 19,86 s** (739,86 s ≈ 12,33 min) |
| **escritas_no_intervalo** | `(0−0) + (0−0) + (0−0)` = **0** |
| **taxa_por_minuto** | **0 / min** |
| **`stats_reset` mudou?** | **Não** — idêntico nas duas amostras |

**A medição é válida.** O `stats_reset` inalterado é a condição que o §12.1(c) exige; se tivesse
mudado, os contadores teriam zerado no meio e o delta seria ficção.

### Duas leituras que os números permitem, e uma que não permitem

**Permitem:** no intervalo observado, **nenhuma escrita** na tabela em staging.

**Permitem também, e é mais forte que o delta:** o `stats_reset` é de **2026-05-22**, ou seja, os
contadores acumulam **119 dias** — e estão todos em zero. **A tabela não recebeu uma única escrita
em quatro meses de staging.** Isso é coerente com o desenho (chaves de idempotência com TTL de 48h,
descartáveis), e sugere que o fluxo de workflow de RH que a alimenta praticamente não é exercitado
naquele ambiente.

**NÃO permitem** concluir nada sobre produção. Staging não tem operação real: não há recepção
lançando, não há RH rodando workflow em volume. **A carga de produção precisa ser medida em
produção**, e é por isso que o §12.1 se chama "Medições obrigatórias ANTES de produção". Os números
acima são ensaio do procedimento, **não** entrada para a decisão do §12.2.

---

## 5. §12.1(d) — Transações, bloqueios e locks

### Transações abertas

```sql
select pid, state, wait_event_type, wait_event,
       now() - xact_start as idade_transacao, left(query, 120) as consulta
from pg_stat_activity
where datname = current_database()
  and state <> 'idle'
  and xact_start is not null
order by xact_start;
```

**Resultado — uma linha, que é a própria consulta em execução:**

```
pid             = 4186079
state           = active
wait_event_type = null
wait_event      = null
idade_transacao = 00:00:00
```

`idade_transacao = 00:00:00` e `wait_event_type` nulo confirmam que a única transação ativa era a
observação em si. **Não havia transação antiga em aberto** — que é exatamente o cenário que faria o
`create index` esperar com o ShareLock pendurado.

### Bloqueios

```sql
select blocked.pid as bloqueado, blocking.pid as bloqueador,
       blocked.wait_event_type, left(blocked.query, 80) as consulta_bloqueada
from pg_stat_activity blocked
join lateral unnest(pg_blocking_pids(blocked.pid)) as b(pid) on true
join pg_stat_activity blocking on blocking.pid = b.pid;
```

**Resultado:** `0 linhas`

### Locks sobre a tabela

```sql
select l.pid, l.locktype, l.mode, l.granted, l.relation::regclass
from pg_locks l
where l.relation = 'public.hr_workflow_idempotency_keys'::regclass;
```

**Resultado:** `0 linhas`

### Conclusão de (d)

```
Nenhum bloqueio operacional identificado no momento da medição.
```

**É uma foto, não um regime.** Vale para o instante observado.

---

## 6. §12.3 ANTES — Estado dos três índices esperados

Consulta executada: o bloco do §12.3 do plano, **sem modificação**.

**Resultado: três linhas, todas com `existe = true` e `conforme = true`.**

| Índice | `existe` | `conforme` |
| --- | --- | --- |
| `public.hr_workflow_idempotency_keys_actor_idx` | `true` | **`true`** |
| `public.hr_workflow_idempotency_keys_unit_idx` | `true` | **`true`** |
| `public.hr_workflow_idempotency_keys_workflow_idx` | `true` | **`true`** |

**Todas as propriedades do veredito vieram `true`** nas três linhas:

| | | |
| --- | --- | --- |
| `tabela_ok` | `metodo_btree` | `uma_coluna_chave` |
| `uma_coluna_total` | `sem_include` | `coluna_ok` |
| `coluna_uuid` | `opclass_nome_ok` (`uuid_ops`) | `opclass_schema_ok` (`pg_catalog`) |
| `opclass_tipo_ok` (`uuid`) | `opclass_padrao` | `opclass_metodo_ok` |
| `collation_ok` (`0`) | `asc_nulls_last` (`indoption 0`) | `sem_predicado` |
| `sem_expressao` | `nao_unico` | `valido` |
| `pronto` | `vivo` | |

### Definições encontradas

```sql
CREATE INDEX hr_workflow_idempotency_keys_actor_idx
ON public.hr_workflow_idempotency_keys
USING btree (actor_user_id);

CREATE INDEX hr_workflow_idempotency_keys_unit_idx
ON public.hr_workflow_idempotency_keys
USING btree (unit_id);

CREATE INDEX hr_workflow_idempotency_keys_workflow_idx
ON public.hr_workflow_idempotency_keys
USING btree (workflow_id);
```

São **exatamente** o que a migration criaria — mesma tabela, mesma coluna, `btree`, sem predicado,
sem expressão, não únicos.

### Tabela de pré-existência

| `indice_esperado` | `coluna_alvo` | `esperado_existe` |
| --- | --- | --- |
| `hr_workflow_idempotency_keys_unit_idx` | `unit_id` | **`true`** |
| `hr_workflow_idempotency_keys_workflow_idx` | `workflow_id` | **`true`** |
| `hr_workflow_idempotency_keys_actor_idx` | `actor_user_id` | **`true`** |

### O que isso implica

1. **Os três índices já existiam** antes da migration, nesta observação de staging — coerente com a
   `023`, que os declarou e que em staging foi aplicada por inteiro.
2. **A migration seria no-op para esses objetos neste estado.** `if not exists` encontraria os três
   e não criaria nada. O efeito real de aplicá-la em staging seria **registrar a versão no ledger**,
   não criar índice.
3. **O rollback do §12.6 não pode remover esses índices** como se tivessem sido criados pela
   migration. Em staging não há nada, desta migration, para desfazer — e `drop index` ali apagaria
   objetos vindos da `023`.

> **Formulação exata do valor probatório, e ela importa:**
>
> O preflight demonstra que os índices **já existiam no momento observado**. Para qualquer operação
> destrutiva futura, deve-se considerar também a possibilidade de **alterações concorrentes entre
> medições**.

**Não trate esta tabela como prova absoluta de autoria.** Ela é a melhor evidência disponível — e o
catálogo, sozinho, não distingue um índice criado pela `023` de um criado por esta migration, porque
a definição resultante é idêntica.

---

## 7. §12.4 ANTES — Detector orientado a alvos

Consulta executada: o detector do §12.4 do plano, **sem modificação**, mantendo
`i.indexrelid is distinct from to_regclass(e.indice_esperado)`.

**Resultado:**

```
0 linhas
```

### O que isso significa — e o que não significa

**Significa:** nenhum índice **com outro nome** cujo primeiro campo-chave seja `unit_id`,
`workflow_id` ou `actor_user_id` foi detectado. É o **caso B** da tabela de aceitação, aplicado aos
três alvos: o esperado está presente e é o único que lidera por aquela coluna, portanto é excluído
pelo `IS DISTINCT FROM` e nada sobra.

De passagem, o resultado também **confirma o caso D em dados reais**: os demais índices da `023` —
`_unique_idx` (que contém `actor_user_id` na **segunda** posição), `_organization_idx`,
`_action_idx`, `_status_idx`, `_expires_at_idx`, `_status_expires_at_idx`, `_created_at_idx` e a PK
— **não apareceram**, como o critério de leading-column prevê.

**NÃO significa** garantia estrutural absoluta. O detector é deliberadamente conservador e tem
bordas declaradas (§12.4, "Limite declarado"): não pega índice cuja primeira posição é expressão, e
não decide equivalência.

**O detector cumpriu o papel de barreira preventiva nesta observação.** Zero linhas é o resultado
que permite seguir — não o que autoriza aplicar.

---

## 8. Veredito de staging

```
PREFLIGHT STAGING SEM BLOQUEIO APARENTE.
```

E, com o mesmo peso:

```
Este veredito é exclusivo do ambiente galli-staging na data observada.

Ele NÃO autoriza aplicação da migration em produção.

As medições de produção precisam ser realizadas separadamente.
```

### Por que a ressalva não é formalidade

Os dois ambientes estão em estados **diferentes** quanto a este objeto:

| | Staging (medido) | Produção (relatado, **não verificado**) |
| --- | --- | --- |
| Os três índices | **Presentes** | **Ausentes** |
| Efeito da migration | **No-op** | **Cria os três** |
| Caminho exercitado | Idempotência e parsing | **Criação — nunca testado** |
| Linhas na tabela | 0 (medido) | **Desconhecido** |
| Escrita no intervalo | 0 (medido) | **Desconhecida** |

**O caminho que staging exercitou não é o que produção vai percorrer.** Staging provou que a
migration parseia e que o `if not exists` não erra sobre índice existente. **Não provou que a
criação funciona**, porque ali não houve criação. Esse teste continua **PENDENTE** (§6 do plano,
Docker ausente).

---

## 9. Pendências que este documento não fecha

- [ ] **Medições do §12.1 em produção** — nenhuma foi feita.
- [ ] **§12.3 e §12.4 em produção** — não executados.
- [ ] **Teste do caminho de criação** em banco descartável sem os três índices (§6.1–6.3 do plano).
      Staging é no-op e **não substitui**.
- [ ] **Decisão do §12.2** (`create index` × `CONCURRENTLY`) — depende das medições de produção.
- [ ] **Janela de manutenção** — definida só depois de (a)–(d) em produção.
