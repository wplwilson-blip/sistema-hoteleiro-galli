# Preflight — PRODUÇÃO — Reconciliação de Migrations

> ## 🔴 ESTE DOCUMENTO É ROTEIRO, NÃO EVIDÊNCIA
>
> **Nada aqui foi executado.** Todos os campos de resultado estão em branco de propósito.
>
> Quando for executado, os resultados devem ser preenchidos e o documento renomeado com a data,
> como foi feito com
> [`PREFLIGHT_STAGING_RECONCILIACAO_MIGRATIONS_2026-09-18.md`](PREFLIGHT_STAGING_RECONCILIACAO_MIGRATIONS_2026-09-18.md).

---

## 🔴 TRAVA VISUAL — antes de qualquer SQL

```
PRODUÇÃO

Projeto:     hotel-galli-admin
Project ref: chnamldrlwohaudmjrez
```

Antes de abrir o SQL Editor, confirmar **as duas coisas**:

- [ ] O **nome** do projeto no seletor é `hotel-galli-admin`
- [ ] O **project ref na URL** é `chnamldrlwohaudmjrez`

> **Se não corresponder exatamente:**
>
> ```
> PARAR.
> NÃO EXECUTAR SQL.
> ```

**Conferir o ref na barra de endereço, não só o nome.** Os nomes se parecem; os refs não. E a conta
usada aqui **enxerga os dois projetos** — o que separa staging de produção é a seleção, não a
permissão.

O outro ambiente, para contraste:

```
STAGING (NÃO é este documento)
Projeto:     galli-staging
Project ref: jascnmgagejlvjlenduv
```

---

## 1. Produção NÃO herda nada de staging

O preflight de staging foi executado em 2026-09-18 e está arquivado. **Nenhum resultado dele vale
aqui.** Tudo abaixo precisa ser medido de novo, em produção.

**Não reutilizar de staging:**

| Item | Por quê |
| --- | --- |
| Quantidade de linhas | Staging tinha 0. Produção tem operação real |
| Tamanho da relação | Deriva do volume |
| Taxa de escrita | Staging: 0 escritas em 119 dias. **Diz nada sobre produção** |
| Atividade / transações | Foto de outro ambiente, outro momento |
| Locks | Idem |
| **Existência dos índices** | **Em staging os três existem; em produção o relato é que faltam.** É a diferença central |
| **Conformidade dos índices** | Precisa ser medida onde existir |
| Resultado do §12.4 | Depende do conjunto de índices daquele banco |

> **A diferença que mais importa:** em staging a migration é **no-op**; em produção ela **cria três
> índices**. O caminho de criação **nunca foi exercitado** — nem em staging (onde não há o que
> criar), nem em banco descartável (§6 do plano, pendente por Docker ausente).

---

## 2. Ordem do preflight

Executar **nesta ordem**, sem pular etapa:

1. Confirmar visualmente produção (trava acima)
2. Registrar data/hora, operador, commit e **identidade da migration pelo blob versionado** (§3)
3. **§12.1(a)** — volume
4. **§12.1(b)** — tamanho
5. **§12.1(c)** — atividade, **duas amostras**
6. Validar `stats_reset` entre as amostras
7. **§12.1(d)** — transações, bloqueios e locks
8. Definir a **janela de manutenção**, com base nas medições 3–7
9. **§12.3 ANTES**
10. Arquivar `esperado_existe` dos três índices (§7)
11. **§12.4 ANTES**
12. **PARAR**
13. Devolver os resultados para análise

**A aplicação da migration NÃO faz parte desta sequência.** O preflight termina no passo 12.

---

## 3. Identificação — preencher antes de começar

```
Ambiente:            produção
Projeto:             hotel-galli-admin
Project ref:         chnamldrlwohaudmjrez
Confirmação visual:  [ ] nome conferido   [ ] ref conferido na URL
Data/hora início:
Data/hora fim:
Operador:
Commit Git:          a1cfbb4
Migration:           20260918120033_hr_workflow_idempotency_indexes_parity.sql
Blob Git (identidade): 74ccd8e2a2a8d322f1e1a1c423e92f86a5da13ee
MD5 nesta máquina:   ee9d1a11f93a9034b5c5e7e24b27ebef
```

### Como conferir a identidade da migration — **use o blob, não o MD5**

```bash
git rev-parse HEAD:supabase/migrations/20260918120033_hr_workflow_idempotency_indexes_parity.sql
```

**Esperado:** `74ccd8e2a2a8d322f1e1a1c423e92f86a5da13ee`. Se divergir, **parar**: o objeto analisado
não é o que foi revisado.

> **Por que não o MD5.** Este repositório roda com `core.autocrlf = true` e **sem `.gitattributes`**.
> O arquivo em disco tem finais de linha convertidos pela plataforma, então **o MD5 muda de máquina
> para máquina** sem que o conteúdo mude. O valor `ee9d1a11f93a9034b5c5e7e24b27ebef` é o da forma
> **CRLF**, observada no Windows; num checkout Linux (LF) ele tende a ser outro.
>
> **Um MD5 diferente ali não prova adulteração — e isso importa nos dois sentidos:** ele produziria
> uma **falsa parada** em quem clonou noutra plataforma, e é fraco como prova de integridade.
>
> **O que `git rev-parse HEAD:<caminho>` devolve, com precisão:** o identificador do **blob
> efetivamente versionado no commit** — o objeto que está no repositório. O comando **não lê nem
> calcula hash da árvore de trabalho**; ele resolve um caminho dentro da árvore do commit. Por isso
> o valor é o mesmo para qualquer pessoa que tenha o commit `a1cfbb4`, **independentemente de o
> checkout dela ter materializado LF ou CRLF**.
>
> ⚠️ **Não use `git hash-object <arquivo-da-working-tree>` como prova cross-platform.** Esse comando
> parte dos bytes em disco e depende dos filtros e atributos em vigor (`core.autocrlf`,
> `.gitattributes`); o resultado pode divergir entre ambientes sem que o objeto versionado tenha
> mudado. A evidência de integridade do pacote aponta para o **objeto versionado**, não para a cópia
> de trabalho.
>
> Serve também, e pelo mesmo motivo, `git status` limpo + `git diff HEAD -- <arquivo>` vazio: as
> duas coisas comparam a árvore de trabalho com o commit **após os filtros**, afirmando identidade
> de conteúdo sem depender de finais de linha.

---

## 4. §12.1 — Medições

Blocos idênticos aos do §12.1 do
[`PLANO_RECONCILIACAO_MIGRATIONS.md`](PLANO_RECONCILIACAO_MIGRATIONS.md). **Não modificar, não
simplificar, não criar versão nova.**

### (a) Volume de linhas

```sql
select count(*) as linhas from public.hr_workflow_idempotency_keys;
```

```
RESULTADO:
```

**Parar se:** a tabela não existir (`relation does not exist`) — a premissa do pacote caiu.

### (b) Tamanho da relação

```sql
select pg_size_pretty(pg_total_relation_size('public.hr_workflow_idempotency_keys')) as total,
       pg_size_pretty(pg_relation_size('public.hr_workflow_idempotency_keys'))       as heap,
       pg_size_pretty(pg_indexes_size('public.hr_workflow_idempotency_keys'))        as indices;
```

```
RESULTADO:
```

### (c) Atividade de escrita — DUAS amostras

```sql
select now() as amostrado_em, n_tup_ins, n_tup_upd, n_tup_del, n_live_tup, n_dead_tup
from pg_stat_user_tables
where relid = 'public.hr_workflow_idempotency_keys'::regclass;
```

Controle de validade, rodado **junto com cada amostra**:

```sql
select stats_reset from pg_stat_database where datname = current_database();
```

**Amostra 1** — anotar o horário:

```
amostrado_em =
n_tup_ins    =
n_tup_upd    =
n_tup_del    =
n_live_tup   =
n_dead_tup   =
stats_reset  =
```

**Aguardar o intervalo definido — sugestão: 10 minutos — dentro da faixa de uso real.** Nunca de
madrugada: medir no vale responde à pergunta errada.

**Amostra 2** — a mesma consulta:

```
amostrado_em =
n_tup_ins    =
n_tup_upd    =
n_tup_del    =
n_live_tup   =
n_dead_tup   =
stats_reset  =
```

**Delta:**

```
intervalo real (min)  =
escritas_no_intervalo = (ins2 - ins1) + (upd2 - upd1) + (del2 - del1) =
taxa_por_minuto       =
stats_reset mudou?    ( ) não    ( ) SIM
```

> **Parar se `stats_reset` mudou entre as amostras.** Os contadores zeraram no meio; o delta é
> ficção. Refazer a medição.

**Ao ler o resultado:** os contadores são **cumulativos desde o `stats_reset`**, não instantâneos.
Anote também **há quanto tempo** o reset ocorreu — um zero acumulado em três dias diz muito menos
que um zero acumulado em quatro meses.

### (d) Transações, bloqueios e locks

```sql
select pid, state, wait_event_type, wait_event,
       now() - xact_start as idade_transacao, left(query, 120) as consulta
from pg_stat_activity
where datname = current_database()
  and state <> 'idle'
  and xact_start is not null
order by xact_start;
```

```
RESULTADO:
```

```sql
select blocked.pid as bloqueado, blocking.pid as bloqueador,
       blocked.wait_event_type, left(blocked.query, 80) as consulta_bloqueada
from pg_stat_activity blocked
join lateral unnest(pg_blocking_pids(blocked.pid)) as b(pid) on true
join pg_stat_activity blocking on blocking.pid = b.pid;
```

```
RESULTADO:
```

```sql
select l.pid, l.locktype, l.mode, l.granted, l.relation::regclass
from pg_locks l
where l.relation = 'public.hr_workflow_idempotency_keys'::regclass;
```

```
RESULTADO:
```

**Parar se:** houver transação antiga relevante em aberto, ou bloqueio já existente sobre a tabela.
Uma transação antiga faz o `create index` esperar por ela — com o ShareLock pendurado enquanto isso.

### (e) Janela de manutenção — **definir depois de (a)–(d)**

Não é consulta. Preencher com base nas medições:

```
Horário:
Duração máxima tolerada:
Quem aborta se estourar:
```

Pico conhecido da operação: **troca de turno, 6h–8h e 14h–16h**. A janela não deve cair aí.

> **Não afirmar "sem janela" antes de (a)–(d).** A frase só é defensável depois das medições.

---

## 5. §12.3 ANTES — Estado dos três índices

Executar o bloco do **§12.3 do plano**, sem modificação. Ele está reproduzido lá por inteiro; não
copie de memória nem simplifique.

```
SAÍDA INTEGRAL (3 linhas, TODAS as colunas — não resumir):
```

### Como ler — **produção NÃO tem estado esperado**

**Não assuma que `existe = true` é o esperado.** Em staging era, porque lá os três vieram da `023`.
Em produção o relato da auditoria é que **faltam**. Mas relato não é medição: **o estado precisa ser
medido**.

Os três desfechos possíveis, por índice:

| Leitura | Significado | Ação |
| --- | --- | --- |
| `existe = false` | O objeto está ausente. **Pode ser o estado esperado** para o que a migration vem criar | **Seguir para o §12.4.** Registrar `esperado_existe = false` |
| `existe = true` **e** `conforme = true` | O índice já existe e corresponde **exatamente** à definição esperada | Seguir. Registrar `esperado_existe = true` |
| `existe = true` **e** `conforme != true` | O nome existe, mas o objeto **não é** o esperado | 🔴 **PARAR** |

> **Quando `existe = false`, o `conforme` vem `false` — e isso NÃO é divergência.** Sem índice, os
> `left join` produzem NULL, a cadeia booleana vira NULL e o `coalesce` devolve `false`. Significa
> apenas "não há índice para comparar". **A condição de parada é a combinação `existe = true` e
> `conforme != true`**, nunca o `conforme` isolado.

> ### 🔴 Se `existe = true` e `conforme != true`
>
> ```
> PARAR.
> NÃO APLICAR MIGRATION.
> NÃO REMOVER.
> NÃO RENOMEAR.
> INVESTIGAR.
> ```
>
> `if not exists` só olha o **nome**. Rodar a migration passaria por cima em silêncio, deixando um
> índice errado ou inválido marcado como resolvido — e o histórico registraria a versão como
> aplicada.

---

## 6. §12.4 ANTES — Detector orientado a alvos

Executar o bloco do **§12.4 do plano**, sem modificação, mantendo obrigatoriamente:

```sql
i.indexrelid is distinct from to_regclass(e.indice_esperado)
```

> **Não substituir por `<>`.** Quando o índice esperado está ausente — o caso mais provável em
> produção — `to_regclass` devolve `NULL`, `<>` com `NULL` resulta `NULL`, o `WHERE` descarta a
> linha e **o detector devolve vazio quando deveria acusar**. Era esse o defeito da versão anterior.

```
SAÍDA INTEGRAL (se vazio, escrever "0 linhas"):
```

### Como ler

**Zero linhas significa apenas:**

```
Nenhum concorrente por leading-column detectado pelo detector.
```

**Não é autorização automática para aplicar.** O detector é conservador e tem bordas declaradas
(§12.4 do plano): não pega índice cuja primeira posição é expressão, e não decide equivalência.

> ### 🔴 Qualquer linha devolvida
>
> ```
> PARAR.
>
> NÃO aplicar migration.
> NÃO criar índice adicional.
> NÃO remover índice existente.
> NÃO renomear índice.
> ```
>
> Copiar a saída integral e devolver para análise. A decisão é humana, comparando
> `pg_get_indexdef` do candidato com o que a migration criaria.

---

## 7. Registro de `esperado_existe` — obrigatório para rollback

Preencher a partir da saída do §12.3:

| `indice_esperado` | `coluna_alvo` | `esperado_existe` |
| --- | --- | --- |
| `hr_workflow_idempotency_keys_unit_idx` | `unit_id` | |
| `hr_workflow_idempotency_keys_workflow_idx` | `workflow_id` | |
| `hr_workflow_idempotency_keys_actor_idx` | `actor_user_id` | |

### O que cada valor autoriza

| Valor | Significado | Efeito no rollback (§12.6) |
| --- | --- | --- |
| **`true`** | O índice **já existia** no momento do preflight | **Bloqueia** atribuí-lo à migration. **Não pode ser derrubado** pelo rollback |
| **`false`** | O índice **estava ausente** no momento do preflight | Demonstra ausência naquele instante — é a condição para o rollback poder derrubá-lo |

**Alterações concorrentes ainda precisam ser consideradas.** O preflight fotografa um instante; se
outro operador criar o índice entre o preflight e a aplicação, `esperado_existe = false` deixa de
descrever quem criou. Na dúvida: **parar e investigar**, nunca derrubar.

> **Sem este registro arquivado, o rollback destrutivo fica bloqueado** (§12.6.3 do plano). E a
> informação **não é recuperável depois**: um índice criado por esta migration e um criado pela
> `023` têm **definição idêntica** no catálogo.

---

## 8. 🔴 Condições de parada

| # | Condição | Ação |
| --- | --- | --- |
| **1** | Projeto ou ref incorreto no painel | **PARAR. Não executar SQL** |
| **2** | `public.hr_workflow_idempotency_keys` não existe | PARAR |
| **3** | `stats_reset` mudou entre as amostras de (c) | PARAR. Medição inválida, refazer |
| **4** | Transação antiga relevante em aberto | PARAR |
| **5** | Bloqueio já existente sobre a tabela | PARAR |
| **6** | §12.3 com `existe = true` **e** `conforme != true` | PARAR |
| **7** | §12.4 retornando **qualquer** linha | PARAR |
| **8** | Resultado inconclusivo ou ambíguo | PARAR |
| **9** | Warning ou erro relevante do SQL Editor | PARAR e devolver a mensagem |
| **10** | Divergência entre o estado real e o que o plano descreve | PARAR |

Em **qualquer uma**:

```
PARAR E DEVOLVER RESULTADOS.
```

E, em todos os casos: **não corrigir automaticamente, não remover objeto, não renomear objeto.**

### Proibido nesta rodada

```
db push · migration repair · migration up · drop index · create index
alter table · insert · update · delete · truncate
Auth settings · RLS · Storage · deploy
```

---

## 9. Decisão ao final

**Mesmo no caminho verde**, o preflight termina assim:

```
PREFLIGHT DE PRODUÇÃO SEM BLOQUEIO APARENTE.

NÃO APLICAR MIGRATION AINDA.

DEVOLVER AS EVIDÊNCIAS PARA REVISÃO E DECISÃO EXPLÍCITA.
```

E no caminho de parada:

```
PREFLIGHT DE PRODUÇÃO BLOQUEADO.

NÃO APLICAR MIGRATION.

DEVOLVER A SAÍDA COMPLETA PARA INVESTIGAÇÃO.
```

**Um preflight limpo não é autorização.** Ele remove obstáculos conhecidos; a decisão de aplicar
continua sendo de quem responde pelo banco, e depende também do que ainda está pendente: o teste do
caminho de criação em banco descartável (§6 do plano) e a decisão do §12.2.

---

## 10. O que devolver

```
[ ] 1.  Confirmação visual: hotel-galli-admin / chnamldrlwohaudmjrez
[ ] 2.  Data/hora de início e fim, operador
[ ] 3.  §12.1(a) — volume
[ ] 4.  §12.1(b) — tamanho
[ ] 5.  §12.1(c) — as duas amostras com horários e stats_reset, intervalo real, delta
[ ] 6.  §12.1(d) — as três saídas integrais
[ ] 7.  §12.1(e) — janela definida (horário, duração máxima, quem aborta)
[ ] 8.  §12.3 ANTES — saída integral, 3 linhas, TODAS as colunas
[ ] 9.  Tabela esperado_existe — 3 linhas preenchidas
[ ] 10. §12.4 ANTES — saída integral, ou "0 linhas" explicitamente
[ ] 11. Qualquer warning ou erro do SQL Editor
[ ] 12. Confirmação de que nenhum SQL além dos blocos de leitura foi executado
```

**Não resumir nenhuma saída.** A saída bruta é o registro; um resumo perde exatamente a coluna que
vai importar depois.
