# Preflight — PRODUÇÃO — Reconciliação de Migrations — 2026-09-21

**Documento de evidência.** Registra uma execução que aconteceu. Não é roteiro e **não autoriza
aplicação**.

O roteiro está em
[`PREFLIGHT_PRODUCAO_RECONCILIACAO_MIGRATIONS.md`](PREFLIGHT_PRODUCAO_RECONCILIACAO_MIGRATIONS.md).
O equivalente de staging está em
[`PREFLIGHT_STAGING_RECONCILIACAO_MIGRATIONS_2026-09-18.md`](PREFLIGHT_STAGING_RECONCILIACAO_MIGRATIONS_2026-09-18.md).

---

## 1. Identificação

| | |
| --- | --- |
| **Ambiente** | **produção** |
| **Projeto** | `hotel-galli-admin` |
| **Project ref** | `chnamldrlwohaudmjrez` |
| **Data da execução** | 2026-09-21 |
| **Commit Git de referência** | `b3bb080` (`docs-supabase-preflight-staging-and-production`) |
| **Migration analisada** | `20260918120033_hr_workflow_idempotency_indexes_parity.sql` |
| **Blob Git da migration** | `74ccd8e2a2a8d322f1e1a1c423e92f86a5da13ee` |

### O que esta execução foi, e o que não foi

- **Somente SQL de leitura.** Nenhum `create`, `drop`, `alter`, `insert`, `update`, `delete` ou
  `truncate`.
- **A migration NÃO foi aplicada.** Segue versionada e não aplicada em nenhum ambiente.
- **Nenhum SQL de escrita foi executado**, em nenhum momento.
- Nenhum `db push`, `migration repair`, `migration up`, alteração de Auth, RLS ou Storage.

---

## 2. §12.1(a) — Volume de linhas

```sql
select count(*) as linhas from public.hr_workflow_idempotency_keys;
```

**Resultado:**

```
linhas = 11
```

A tabela existe e **tem dado** — diferente de staging, onde estava vazia.

---

## 3. §12.1(b) — Tamanho da relação

```sql
select pg_size_pretty(pg_total_relation_size('public.hr_workflow_idempotency_keys')) as total,
       pg_size_pretty(pg_relation_size('public.hr_workflow_idempotency_keys'))       as heap,
       pg_size_pretty(pg_indexes_size('public.hr_workflow_idempotency_keys'))        as indices;
```

**Resultado:**

```
total   = 80 kB
heap    = 16 kB
indices = 32 kB
```

**A relação é pequena em termos absolutos.** 16 kB de heap para 11 linhas é coerente: duas páginas.

> **Sobre os 32 kB de índice, ver a Observação O-2 (§9).** A conta não fechava, foi verificada, e o
> resultado é **achado confirmado**: produção tem **2 índices**, não 8. 2 × 16 kB = 32 kB.

---

## 4. §12.1(c) — Atividade de escrita

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
amostrado_em = 2026-09-21 15:15:31.88229+00
n_tup_ins    = 9
n_tup_upd    = 9
n_tup_del    = 0
n_live_tup   = 9
n_dead_tup   = 4
stats_reset  = NULL
```

### Amostra intermediária

```
amostrado_em = 2026-09-21 15:21:44.08595+00
n_tup_ins    = 9
n_tup_upd    = 9
n_tup_del    = 0
n_live_tup   = 9
n_dead_tup   = 4
stats_reset  = NULL
```

### Amostra final

```
amostrado_em = 2026-09-21 18:18:09.557341+00
n_tup_ins    = 9
n_tup_upd    = 9
n_tup_del    = 0
n_live_tup   = 9
n_dead_tup   = 4
stats_reset  = NULL
```

### Deltas

| Intervalo | Duração |
| --- | --- |
| Amostra 1 → intermediária | `0:06:12.203660` |
| Intermediária → final | `2:56:25.471391` |
| **Amostra 1 → final** | **`3:02:37.675051`** — ≈ 3h 02min 38s (10 957,7 s) |

| | |
| --- | --- |
| **delta de inserts** | `9 − 9` = **0** |
| **delta de updates** | `9 − 9` = **0** |
| **delta de deletes** | `0 − 0` = **0** |
| **delta total observado** | **0** |
| **taxa observada** | **≈ 0 / min** |
| **`stats_reset`** | **permaneceu `NULL`** nas três amostras |

**A medição é válida pelo critério do §12.1(c):** o `stats_reset` não mudou entre as amostras. Se
tivesse mudado, os contadores teriam zerado no meio e o delta seria ficção.

### O que estes números permitem concluir — e o que não permitem

**Permitem, e é o que importa para a decisão de lock:** durante **mais de três horas** de observação
em produção, **nenhuma escrita** foi registrada nesta tabela. É a janela relevante para o ShareLock
de um `create index`.

**A tabela já teve atividade histórica.** `n_tup_ins = 9`, `n_tup_upd = 9` e `n_dead_tup = 4` são
rastros de uso: alguém inseriu e atualizou linhas em algum momento. **Não extrapolar para "sem
uso"** — a leitura correta é "sem escrita *na janela observada*", não "tabela inativa".

**`pg_stat_user_tables` não é contagem exata em tempo real.** `n_live_tup` e `n_dead_tup` são
**estimativas**, atualizadas por `VACUUM`/`ANALYZE`, e ficam defasadas entre execuções.

**Por isso `count(*) = 11` e `n_live_tup = 9` NÃO são, por si, divergência operacional.** São dois
instrumentos diferentes: um conta linha por linha no instante da consulta; o outro é uma estimativa
mantida pelo coletor de estatísticas. Divergirem é o comportamento normal dos dois.

> **Há, porém, uma segunda comparação que é de outra natureza — ver Observação O-1 (§9).**
> `n_tup_ins` **não** é estimativa: é contador exato de tuplas inseridas. A relação entre ele e o
> `count(*)` merece atenção separada.

### Sobre `stats_reset = NULL`

Em staging o `stats_reset` tinha data (`2026-05-22`), o que permitiu dizer **por quanto tempo** os
contadores acumulavam — 119 dias. **Em produção ele é `NULL`**, então essa janela é desconhecida.

Isso **não invalida o delta** (os três instantes foram medidos sob o mesmo regime), mas **enfraquece
qualquer leitura histórica**: não se sabe desde quando os 9 inserts acumulam.

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

**Resultado:** apenas a própria consulta em execução.

```
state           = active
idade_transacao = 00:00:00
```

**Nenhuma transação antiga relevante** — que é o cenário que faria o `create index` esperar com o
ShareLock pendurado.

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

**É uma foto, não um regime.** Vale para o instante observado, e é por isso que o §12 exige preflight
curto imediatamente antes de qualquer aplicação (ver §12 deste documento).

---

## 6. §12.3 ANTES — Estado dos índices esperados

Consulta executada: o bloco do §12.3 do plano, **sem modificação**.

**Resultado — os três ausentes:**

| Índice | `existe` | `conforme` |
| --- | --- | --- |
| `public.hr_workflow_idempotency_keys_actor_idx` | **`false`** | `false` |
| `public.hr_workflow_idempotency_keys_unit_idx` | **`false`** | `false` |
| `public.hr_workflow_idempotency_keys_workflow_idx` | **`false`** | `false` |

### Leitura correta — `conforme = false` aqui NÃO é divergência

**`conforme = false` é o resultado esperado quando `existe = false`.** Sem índice, os `left join` da
consulta produzem NULL, a cadeia booleana vira NULL, e o `coalesce(..., false)` devolve `false`.
Significa **"não há objeto para comparar"** — não "o objeto está errado".

**Não é divergência estrutural.** É o estado que a migration existe para mudar.

> **A condição de parada do §12.3 é a combinação `existe = true` E `conforme != true`.** Ela **não
> ocorreu**: nenhum dos três nomes existe. O `conforme` isolado nunca foi critério.

Isso **confirma em medição** o que a auditoria havia relatado sem verificação: os três índices
declarados na `023` (linhas 149–154) **não estão presentes em produção**.

### Tabela de pré-existência — registro para rollback

| `indice_esperado` | `coluna_alvo` | `esperado_existe` |
| --- | --- | --- |
| `hr_workflow_idempotency_keys_unit_idx` | `unit_id` | **`false`** |
| `hr_workflow_idempotency_keys_workflow_idx` | `workflow_id` | **`false`** |
| `hr_workflow_idempotency_keys_actor_idx` | `actor_user_id` | **`false`** |

> Isso demonstra que os três índices esperados **não existiam no momento do preflight observado**.
> **Não é prova absoluta de autoria futura**; alterações concorrentes entre preflight e aplicação
> devem continuar sendo consideradas.

**Consequência para o §12.6 do plano:** com `esperado_existe = false` nos três, o rollback
**passaria** a ser executável para eles — **se e somente se** a aplicação ocorrer sem alteração
concorrente no intervalo. É por isso que o preflight de última hora (§12) é obrigatório: ele
reconfirma a ausência imediatamente antes, encurtando a janela em que uma criação por terceiro
passaria despercebida.

---

## 7. §12.4 ANTES — Detector de redundância orientado a alvos

Consulta executada: o detector do §12.4 do plano, **sem modificação**, mantendo
`i.indexrelid is distinct from to_regclass(e.indice_esperado)`.

**Resultado:**

```
0 linhas
```

### Leitura

**Significa:** nenhum índice **com outro nome** cujo primeiro campo-chave seja `unit_id`,
`workflow_id` ou `actor_user_id` foi detectado.

**Este é o caso A do detector**, e é onde a versão anterior falhava: com os três esperados
**ausentes**, `to_regclass` devolve `NULL`, e só o `IS DISTINCT FROM` faz a comparação sobreviver.
Um `<>` teria descartado as linhas e devolvido vazio **pelo motivo errado** — vazio por bug, não
vazio por ausência de concorrente. Aqui o vazio é legítimo.

**NÃO significa** garantia absoluta da estrutura. O detector é conservador e tem bordas declaradas
(§12.4 do plano): não pega índice cuja primeira posição é expressão, e não decide equivalência.

**Não autoriza aplicação automática.**

---

## 8. Veredito de produção

```
PREFLIGHT DE PRODUÇÃO SEM BLOQUEIO APARENTE.
```

```
A MIGRATION NÃO FOI APLICADA.
ESTE RESULTADO NÃO É AUTORIZAÇÃO AUTOMÁTICA PARA EXECUÇÃO.
```

**"Sem bloqueio aparente" é ausência de impedimento conhecido, não presença de autorização.** As
observações do §9 e as pendências do §10 continuam abertas.

---

## 9. Observações que as medições levantaram — **exigem verificação**

Nenhuma das duas impede o preflight de ser considerado limpo pelos critérios do §12. **As duas
precisam ser resolvidas antes de um GO sem qualificação**, e as duas custam uma consulta cada.

### O-1 — `n_tup_ins = 9` com `count(*) = 11` e `n_tup_del = 0`

**A conta não fecha, e este par não se explica por estimativa.**

Diferente de `n_live_tup`, o `n_tup_ins` **não é estimativa**: é contador exato de tuplas inseridas.
Com `n_tup_del = 0`:

```
9 inseridas − 0 deletadas = 9 linhas esperadas
count(*) exato            = 11 linhas
```

**Onze linhas presentes, nove inserções contabilizadas.** A leitura mais provável é que **os
contadores não cobrem toda a história da tabela** — estatísticas reinicializadas em algum ponto sem
registro de reset (restauração de backup, upgrade, recuperação de crash). Isso é **coerente com
`stats_reset = NULL`**: não há data de reset registrada, e não se sabe desde quando os contadores
acumulam.

**O que isso muda, e o que não muda:**

- **Não muda a decisão de lock.** O delta de 0 em 3h02min foi medido com os três instantes sob o
  mesmo regime de contadores. Essa comparação continua válida.
- **Muda o peso de qualquer afirmação histórica.** Não se pode dizer "a tabela recebeu 9 inserções
  na vida" nem estimar frequência de uso a partir desses números. Os contadores são
  **demonstravelmente incompletos**.

**Não é bloqueante.** É uma ressalva de interpretação, registrada para que ninguém use `n_tup_ins`
como base de decisão futura.

### O-2 — **ACHADO CONFIRMADO: produção tem 2 índices, não 8**

> **Esta observação era hipótese aritmética quando este documento foi escrito. Foi verificada por
> consulta de leitura, e o resultado confirmou a suspeita — com margem maior do que a estimada.**

```
ACHADO CONFIRMADO:
produção possui exatamente 2 índices;
a migration 023 declarava 11;
9 índices históricos estão ausentes.
```

**Os dois encontrados em produção:**

| Índice | Tamanho | Propriedades | Colunas |
| --- | --- | --- | --- |
| `hr_workflow_idempotency_keys_pkey` | 16 kB | PRIMARY, UNIQUE, VALID, READY, LIVE | `(id)` |
| `hr_workflow_idempotency_keys_unique_idx` | 16 kB | UNIQUE, VALID, READY, LIVE | `(organization_id, actor_user_id, action, idempotency_key)` |

**Os nove ausentes:**

```
hr_workflow_idempotency_keys_organization_idx        (organization_id)
hr_workflow_idempotency_keys_unit_idx                (unit_id)
hr_workflow_idempotency_keys_workflow_idx            (workflow_id)
hr_workflow_idempotency_keys_actor_idx               (actor_user_id)
hr_workflow_idempotency_keys_action_idx              (action)
hr_workflow_idempotency_keys_status_idx              (status)
hr_workflow_idempotency_keys_expires_at_idx          (expires_at)
hr_workflow_idempotency_keys_status_expires_at_idx   (status, expires_at)
hr_workflow_idempotency_keys_created_at_idx          (created_at)
```

### Como a aritmética levou até aqui

A conta registrada na versão original desta observação:

| | |
| --- | --- |
| Staging | 11 índices, **0 linhas**, **88 kB** → 8 kB cada (só metapágina) — fecha exato |
| Produção | **11 linhas**, **32 kB** = 4 páginas no total |

Um btree **com dados** ocupa no mínimo metapágina + raiz = 2 páginas = 16 kB. Oito índices exigiriam
**≥ 128 kB**; observado **32 kB** — espaço para cerca de **dois**.

**Dois é exatamente o que a consulta encontrou.** 2 × 16 kB = 32 kB, fechando a conta.

### O que o achado muda

**O drift é três vezes maior do que a auditoria original caracterizou.** Ela relatou "três chaves
estrangeiras sem índice"; o estado real é **nove índices históricos ausentes**.

**Nenhum dos quatro documentos do pacote teria revelado isso** — todos repetiam o número relatado,
sem medição. Foi a aritmética do tamanho, e não a leitura dos documentos, que abriu a questão.

**A decisão sobre os nove está registrada no §13 e §14 do
[`PLANO_RECONCILIACAO_MIGRATIONS.md`](PLANO_RECONCILIACAO_MIGRATIONS.md):** três restaurados
(as FKs não cobertas), seis deliberadamente não restaurados, cada um com justificativa e critério de
reavaliação.

---

## 10. Comparação staging × produção

| Item | Staging (2026-09-18) | Produção (2026-09-21) | Observação |
| --- | --- | --- | --- |
| `linhas` | **0** | **11** | Produção tem dado; staging não |
| `total` | 96 kB | 80 kB | Produção menor no total apesar de ter dado |
| `heap` | 0 bytes | **16 kB** | Coerente com 11 linhas |
| `indices` | **88 kB** | **32 kB** | **Ver O-2** — produção tem bem menos índice |
| Atividade observada | 0 escritas em 12min20s | 0 escritas em **3h02min38s** | Produção observada por janela muito maior |
| `stats_reset` | `2026-05-22` (119 dias) | **`NULL`** | Em produção não se sabe desde quando acumula |
| Transações antigas | nenhuma | nenhuma | Igual |
| Bloqueios | 0 | 0 | Igual |
| Locks na tabela | 0 | 0 | Igual |
| `actor_idx` existe | **`true`** | **`false`** | **Diferença central** |
| `unit_idx` existe | **`true`** | **`false`** | **Diferença central** |
| `workflow_idx` existe | **`true`** | **`false`** | **Diferença central** |
| §12.4 concorrentes | 0 linhas | 0 linhas | Igual — mas **por motivos diferentes** |

### As diferenças que decidem

**Staging já tinha os três índices; produção não tem nenhum dos três.** Isso é a confirmação medida
do drift que a auditoria relatou.

**Em staging a migration seria no-op** para esses objetos — `if not exists` encontraria os três e não
criaria nada. O efeito real ali seria registrar a versão no ledger.

**Produção é o ambiente onde a migration criaria os objetos**, se autorizada. É o único lugar onde o
`create index` de fato roda.

**Staging não serve para provar o caminho de criação.** Ele exercitou parsing, idempotência e o
caminho do `db push` — **nunca a criação**, porque lá não havia o que criar. Essa lacuna continua
aberta (§11).

**Nota sobre o §12.4 dar zero nos dois:** o resultado é o mesmo, a mecânica não. Em staging o zero
veio do **caso B** (o esperado existe e é o único que lidera pela coluna, sendo excluído). Em
produção veio do **caso A** (o esperado não existe, `to_regclass` é `NULL`, e só o
`IS DISTINCT FROM` mantém a comparação viva). **Produção foi o primeiro ambiente a exercitar de
verdade o caminho onde o detector antigo falhava.**

---

## 11. Teste em banco descartável — **BLOQUEIO ABERTO**

```
BLOQUEIO ABERTO:
teste do caminho de criação em banco descartável ainda não executado.
```

**Motivo conhecido:** Docker indisponível no ambiente anterior.

**Não está dispensado.** Não foi suprido por staging (no-op) nem por produção (não aplicada).

### O que está em aberto, em uma frase

**O `create index` desta migration nunca foi executado em lugar nenhum.** O que foi validado é que o
arquivo parseia, que é idempotente sobre índice existente, e que o `db push` o registraria. A criação
em si é caminho não exercitado.

### Alternativas — avaliadas conceitualmente, **nenhuma executada**

#### Opção 1 — Docker / Supabase local (**preferida**)

Banco local descartável, no estado sem os três índices:

```
estado sem índices → aplicar migration → validar §12.3 → validar §12.4
```

**Vantagem:** exercita exatamente o caminho que produção percorreria, sem tocar em ambiente real.
Custo zero de risco. **Exige Docker disponível.**

#### Opção 2 — Projeto Supabase descartável dedicado

**Somente se autorizado futuramente.** Projeto novo, criado para isto, destruído depois.

> **Não usar staging nem produção como substituto.** Staging não tem o estado necessário (lá os três
> existem) e produção é o ambiente que se quer proteger.

**Custo:** criação de projeto, e a superfície de um ambiente remoto a mais. Exige autorização
explícita.

#### Opção 3 — Não executar

O GO permanece **condicionado a risco residual documentado e decisão explícita humana**. O risco
residual é objetivamente pequeno — três `create index if not exists` de coluna única sobre uma tabela
de 11 linhas —, mas **"pequeno" não é "medido"**, e a distinção é a razão de o pacote inteiro existir.

> **Não escolho entre as três.** A decisão é de quem responde pelo banco e envolve disponibilidade de
> ferramenta e apetite de risco — nenhum dos dois é meu para arbitrar.

---

## 12. Janela operacional

### O que os dados de produção sustentam

- Tabela pequena: **11 linhas**
- `heap` **16 kB**, `indices` **32 kB**
- **Nenhuma escrita observada por mais de 3 horas**
- **Nenhum lock** sobre a tabela
- **Nenhum bloqueio** e nenhuma transação antiga

**Com esses números, a construção dos três índices tende a ser praticamente instantânea, e a janela
de ShareLock, desprezível.**

### O que os dados NÃO sustentam

> **Risco não é zero, e não se deve concluir que seja.**

- A medição é **uma foto**: três instantes ao longo de uma tarde, não um regime contínuo.
- Os contadores são **demonstravelmente incompletos** (O-1) — não descrevem o padrão de uso.
- `stats_reset = NULL` impede saber desde quando os contadores acumulam.
- Uma transação longa ou uma rajada de escrita **podem aparecer entre a medição e a aplicação**.
- A contagem de índices **foi verificada (O-2)** e revelou drift de **nove** índices, não três — o
  que mudou o objeto da correção e derrubou o veredito anterior.

### Recomendação operacional

```
Preferir janela de menor uso.
Evitar troca de turno e horários críticos da operação.
Executar preflight curto imediatamente antes de qualquer aplicação.
```

Picos conhecidos desta operação: **troca de turno, 6h–8h e 14h–16h**. A janela não deve cair aí.

### Preflight de última hora — obrigatório, imediatamente antes

Não substitui o preflight arquivado: **encurta a janela** entre observação e ação.

1. **§12.3** de novo — os três ainda `existe = false`?
2. **§12.4** de novo — ainda zero linhas?
3. **Locks e transações** de novo — §12.1(d)
4. **Contagem de índices da tabela** — reconfirmar os **2** medidos em 2026-09-21 (§9). Não é mais
   descoberta, é **reconfirmação**: se vierem mais ou menos que 2, algo mudou desde a medição
5. **Identidade da migration** — `git rev-parse HEAD:<caminho>` = `74ccd8e2a2a8d322f1e1a1c423e92f86a5da13ee`

### Critérios de aborto

Qualquer um destes **interrompe**, antes ou durante:

```
- aparecer lock inesperado;
- aparecer transação antiga;
- surgir escrita ativa relevante;
- §12.3 mudar desde o preflight arquivado;
- §12.4 passar a retornar linha;
- migration/blob divergente;
- branch/commit divergente;
- ambiente incorreto;
- erro ou warning não previsto.
```

Em qualquer um: **PARAR. Não corrigir automaticamente. Não remover nem renomear objeto. Investigar.**

---

## 13. Matriz de decisão GO / NO-GO

| Critério | Estado | Bloqueante? | Observação |
| --- | --- | --- | --- |
| Staging validado | ✅ Executado e arquivado (2026-09-18) | Não | Sem bloqueio; **no-op**, não prova criação |
| Produção §12.1 | ✅ Medido | Não | Tabela pequena, 0 escritas em 3h02min, sem locks |
| Produção §12.3 | ✅ Medido | Não | Três ausentes; `conforme = false` **esperado** |
| Produção §12.4 | ✅ Medido — 0 linhas | Não | Caso A exercitado de verdade |
| Migration versionada | ✅ `b3bb080` | Não | Não aplicada. **Cabeçalho corrigido**: 3 de 9, não paridade |
| Blob conferido | ✅ `74ccd8e2…` | Não | Identidade estável, independente de LF/CRLF |
| Rollback condicionado a preflight | ✅ `esperado_existe = false` nos três | Não | Registro arquivado — §12.6 fica executável |
| **Teste em banco descartável** | 🔴 **NÃO EXECUTADO** | **SIM** | Docker indisponível. Caminho de criação nunca exercitado |
| **O-2 — contagem de índices** | ✅ **VERIFICADO** — produção tem **2**, faltam **9** | **Resolvido** | Gerou o `NO-GO`. Decisão sobre os nove: §13/§14 do plano |
| O-1 — contadores incompletos | 🟡 Registrado | Não | Não afeta o lock; afeta leitura histórica |
| Janela operacional | 🟡 Recomendada, não fixada | Não | Falta definir horário, duração e quem aborta |
| Plano de rollback | ✅ §12.6, condicionado à autoria | Não | Comandos comentados; parada se autoria desconhecida |
| Git limpo | ✅ `main` = `origin/main` = `b3bb080` | Não | Árvore limpa |

### Veredito — **REVISADO APÓS O ACHADO O-2**

```
NO-GO — o plano original de reconciliação estava baseado em uma
        caracterização incompleta do drift.
```

> **O NO-GO não decorre de falha dos três índices propostos.** Decorre da necessidade de corrigir o
> escopo documental e registrar decisão explícita sobre os seis índices históricos adicionais.
>
> **Os três `CREATE INDEX` da migration permanecem tecnicamente corretos e inalterados.** O que
> estava errado era o que a migration e os documentos **afirmavam ter feito**: "paridade" com a
> `023`, quando o resultado seria 5 de 11.
>
> **Após esta revisão documental, haverá nova decisão GO/NO-GO.**

### O veredito anterior, e por que caiu

Este documento registrava `GO CONDICIONADO`, com dois itens bloqueantes: o teste em banco descartável
e a conta em aberto do O-2. **O segundo foi resolvido — e o resultado derrubou o veredito**, porque
mostrou que o objeto da reconciliação estava mal caracterizado.

O raciocínio do `GO CONDICIONADO` continua válido para o que ele media: o banco está quieto, a tabela
é pequena, o rollback ficou executável. **Nada disso era falso.** O que faltava era saber que a
migration fechava três de nove buracos enquanto o pacote dizia que fechava três de três.

### O que sustenta o `NO-GO`

**Não é o estado do banco.** As três consultas de preflight passaram, o ambiente está quieto, a
tabela é pequena, o rollback ficou executável e a identidade da migration confere. Isso continua
verdadeiro.

**É o escopo.** Dois itens seguem bloqueantes:

1. **O escopo documental estava incorreto (O-2, resolvido).** A migration e o pacote afirmavam
   paridade com a `023`; o resultado real seria **5 de 11**. Aplicar sem corrigir isso produziria
   **falsa sensação de reconciliação completa** — seis índices ausentes sem registro de que foram
   avaliados. **A correção documental foi feita; falta nova decisão sobre o pacote corrigido.**
2. **O teste em banco descartável não foi executado.** O caminho de criação — o único que produção
   vai percorrer — nunca rodou. Chamar isso de `GO` seria tratar "não encontramos problema" como
   "verificamos que funciona", e são coisas diferentes.

**Esta tarefa não autoriza aplicação.** Após a revisão documental registrada no §13/§14 do plano,
**haverá nova decisão GO/NO-GO**, sobre o pacote com o escopo já corrigido.

---

## 14. Próximo passo

**Não executado. Apenas indicado.**

**~~Prioridade 1 — resolver O-2.~~ ✅ FEITO.** A consulta foi executada e devolveu **2 índices**.
O drift é de **nove**, não de três. A Correção 1 foi reaberta, o escopo documental foi corrigido
(§13/§14 do plano), e o veredito deste documento passou a **`NO-GO`**.

**Prioridade 1 (nova) — decidir sobre o teste em banco descartável.** Opção 1 (Docker), 2 (projeto
descartável autorizado) ou 3 (aceitar risco residual, registrado explicitamente). **Não é decisão
técnica isolada:** envolve disponibilidade de ferramenta e apetite de risco.

**Prioridade 3 — fixar a janela**, com horário, duração máxima tolerada e quem aborta se estourar.

**Se houver decisão futura de aplicar**, ela exige o **preflight de última hora** do §12 imediatamente
antes: §12.3, §12.4, locks/transações, a contagem de índices do O-2, e a conferência do blob. E o
resultado dele também precisa ser arquivado — é ele, e não este documento, que vai sustentar o
rollback caso algo precise ser desfeito.
