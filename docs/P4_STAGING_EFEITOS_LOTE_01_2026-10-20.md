# P4 — Efeitos em Staging — Lote 01 — 2026-10-20

**Documento de evidência.** Registra a auditoria dos **efeitos reais** de 4 migrations legadas
ausentes do ledger de staging, feita manualmente pelo responsável no SQL Editor, **somente
leitura**.

```text
A classificação A significa que os efeitos atuais foram comprovados.
Ela NÃO autoriza repair nesta etapa.
```

Nenhum comando de `repair` é proposto aqui.

---

## 1. Ambiente

| | |
| --- | --- |
| **Projeto** | `galli-staging` |
| **Project ref** | `jascnmgagejlvjlenduv` |
| **Natureza** | Somente `SELECT` de catálogo. Nenhum SQL de escrita |
| **Commit de referência do repositório** | `2e73e08` |
| **Data** | 2026-10-20 |

- Nenhum `repair`, nenhum `db push`, nenhum `migration up`.
- Nenhuma migration aplicada.
- Produção **não acessada**.
- Nenhuma CLI do Supabase, service role ou API REST.

---

## 2. Escopo do lote

| Migration | Efeitos | Situação no ledger de staging |
| --- | --- | --- |
| `068_employees_unique_cpf` | 1 índice único parcial com expressão | **AUSENTE** ([`P4_LEDGER_STAGING_2026-10-19.md`](P4_LEDGER_STAGING_2026-10-19.md)) |
| `073_employee_movements_applied_marker` | 1 coluna + comentário + 1 índice parcial | **AUSENTE** |
| `075_employee_terminations_applied_marker` | 1 coluna + comentário + 1 índice parcial | **AUSENTE** |
| `085_app_users_must_change_password` | 1 coluna NOT NULL com default + comentário | **AUSENTE** |

**Por que este lote primeiro:** os efeitos são pequenos e estruturais, e servem para validar o
método antes das migrations de policy, função, backfill e alto risco (§10 de
[`P4_AUDITORIA_MIGRATIONS_LEGADAS.md`](P4_AUDITORIA_MIGRATIONS_LEGADAS.md)).

**A ausência no ledger não foi usada como evidência.** A pergunta deste lote é justamente: os
efeitos existem **mesmo sem** a entrada no ledger?

---

## 3. Auditoria local — feita antes das consultas

### 3.1 Nenhuma migration posterior altera os objetos

Busca nas 95 migrations, ignorando comentários. Cada objeto aparece **somente** na própria
migration de origem:

| Objeto | Única migration que o cita |
| --- | --- |
| `employees_org_cpf_normalized_active_unique` | 068 |
| `employee_movements.movement_applied_at` | 073 |
| `employee_movements_pending_apply_idx` | 073 |
| `employee_terminations.applied_at` | 075 |
| `employee_terminations_pending_apply_idx` | 075 |
| `app_users.must_change_password` | 085 |

Nenhum `alter table`, `drop`, `rename`, `alter index` ou `reindex` posterior sobre `employees`,
`employee_movements`, `employee_terminations` ou `app_users`. **O estado esperado é o próprio texto
de cada migration.**

### 3.2 Como o esperado foi gerado

As 4 migrations foram aplicadas **sem alteração** num banco local descartável (PostgreSQL 17.11),
sobre uma fixture mínima com as colunas de base nos tipos das migrations de origem:
`employees.organization_id uuid` e `document_number text` (003), `effective_date date` (052, 060).
As **mesmas consultas** do §4 rodaram lá e produziram a forma exata que o PostgreSQL devolve,
inclusive os MD5.

`indkey` **não** entra no critério: ele depende da posição da coluna na tabela real e diverge entre
bancos sem significar nada. A primeira chave é verificada **pelo nome**.

---

## 4. SQL de leitura usado

Cada consulta devolve **uma linha mesmo com o objeto ausente**: `existe = false` e o resto nulo.

### 068

```sql
select 'employees_org_cpf_normalized_active_unique'                as alvo,
       to_regclass('public.employees_org_cpf_normalized_active_unique') is not null as existe,
       i.indrelid::regclass                                         as tabela,
       am.amname                                                    as metodo,
       i.indisunique                                                as unico,
       i.indisvalid                                                 as valido,
       i.indisready                                                 as pronto,
       i.indislive                                                  as vivo,
       i.indnkeyatts                                                as qtd_chaves,
       i.indnatts                                                   as qtd_colunas,
       i.indkey::text                                               as indkey,
       a1.attname                                                   as primeira_chave,
       pg_get_expr(i.indexprs, i.indrelid)                          as expressoes,
       pg_get_expr(i.indpred,  i.indrelid)                          as predicado,
       pg_get_indexdef(i.indexrelid)                                as definicao,
       md5(pg_get_indexdef(i.indexrelid))                           as md5_definicao
from (select 1) x
left join pg_index     i  on i.indexrelid = to_regclass('public.employees_org_cpf_normalized_active_unique')
left join pg_class     c  on c.oid = i.indexrelid
left join pg_am        am on am.oid = c.relam
left join pg_attribute a1 on a1.attrelid = i.indrelid and a1.attnum = i.indkey[0];
```

### 073 (075 idem, trocando a tabela, a coluna `applied_at` e o índice `employee_terminations_pending_apply_idx`)

```sql
select 'employee_movements.movement_applied_at'                    as alvo_coluna,
       col.column_name is not null                                  as coluna_existe,
       col.data_type, col.udt_name, col.is_nullable, col.column_default,
       col_description(to_regclass('public.employee_movements'), col.ordinal_position::int) as comentario,
       md5(col_description(to_regclass('public.employee_movements'), col.ordinal_position::int)) as md5_comentario,
       'employee_movements_pending_apply_idx'                       as alvo_indice,
       to_regclass('public.employee_movements_pending_apply_idx') is not null as indice_existe,
       i.indrelid::regclass                                         as tabela_indice,
       am.amname                                                    as metodo,
       i.indisunique as unico, i.indisvalid as valido, i.indisready as pronto, i.indislive as vivo,
       i.indnkeyatts                                                as qtd_chaves,
       a1.attname                                                   as primeira_chave,
       pg_get_expr(i.indexprs, i.indrelid)                          as expressoes,
       pg_get_expr(i.indpred,  i.indrelid)                          as predicado,
       pg_get_indexdef(i.indexrelid)                                as definicao,
       md5(pg_get_indexdef(i.indexrelid))                           as md5_definicao
from (select 1) x
left join information_schema.columns col
       on col.table_schema = 'public' and col.table_name = 'employee_movements'
      and col.column_name = 'movement_applied_at'
left join pg_index     i  on i.indexrelid = to_regclass('public.employee_movements_pending_apply_idx')
left join pg_class     c  on c.oid = i.indexrelid
left join pg_am        am on am.oid = c.relam
left join pg_attribute a1 on a1.attrelid = i.indrelid and a1.attnum = i.indkey[0];
```

### 085 (não lê valores de usuários)

```sql
select 'app_users.must_change_password'                            as alvo_coluna,
       col.column_name is not null                                  as coluna_existe,
       col.data_type, col.udt_name, col.is_nullable, col.column_default,
       col_description(to_regclass('public.app_users'), col.ordinal_position::int)      as comentario,
       md5(col_description(to_regclass('public.app_users'), col.ordinal_position::int)) as md5_comentario
from (select 1) x
left join information_schema.columns col
       on col.table_schema = 'public' and col.table_name = 'app_users'
      and col.column_name = 'must_change_password';
```

---

## 5. Resultados × esperado

### 5.1 `068_employees_unique_cpf`

| Efeito | Esperado | Encontrado em staging | Conforme? |
| --- | --- | --- | --- |
| Índice existe | sim | `existe = true` | ✅ |
| Tabela | `employees` | `employees` | ✅ |
| Método | `btree` | `btree` | ✅ |
| Único | `true` | `true` | ✅ |
| Válido / pronto / vivo | `true / true / true` | `true / true / true` | ✅ |
| Chaves / colunas | `2 / 2` | `2 / 2` | ✅ |
| 1ª chave | `organization_id` | `organization_id` | ✅ |
| Expressão (2ª chave) | `regexp_replace(COALESCE(document_number, ''::text), '\D'::text, ''::text, 'g'::text)` | idêntica | ✅ |
| Predicado | `((deleted_at IS NULL) AND (NULLIF(regexp_replace(COALESCE(document_number, ''::text), '\D'::text, ''::text, 'g'::text), ''::text) IS NOT NULL))` | idêntico | ✅ |
| `md5_definicao` | `e2cda6438ed3a05629d7e14732a38506` | `e2cda6438ed3a05629d7e14732a38506` | ✅ |

### 5.2 `073_employee_movements_applied_marker`

| Efeito | Esperado | Encontrado em staging | Conforme? |
| --- | --- | --- | --- |
| Coluna existe | sim | `coluna_existe = true` | ✅ |
| Tipo | `timestamp with time zone` / `timestamptz` | idem | ✅ |
| Nulo | `YES` | `YES` | ✅ |
| Default | nenhum | `null` | ✅ |
| `md5_comentario` | `c903cbaeddba96ac348f685abb484ede` | `c903cbaeddba96ac348f685abb484ede` | ✅ |
| Índice existe | sim | `indice_existe = true` | ✅ |
| Tabela do índice | `employee_movements` | `employee_movements` | ✅ |
| Método / único | `btree` / `false` | `btree` / `false` | ✅ |
| Válido / pronto / vivo | `true / true / true` | `true / true / true` | ✅ |
| Chaves / 1ª chave | `1` / `effective_date` | `1` / `effective_date` | ✅ |
| Expressões | nenhuma | `null` | ✅ |
| Predicado | `(movement_applied_at IS NULL)` | idêntico | ✅ |
| `md5_definicao` | `e22ace0727ffdce133da678caace80bf` | `e22ace0727ffdce133da678caace80bf` | ✅ |

### 5.3 `075_employee_terminations_applied_marker`

| Efeito | Esperado | Encontrado em staging | Conforme? |
| --- | --- | --- | --- |
| Coluna existe | sim | `coluna_existe = true` | ✅ |
| Tipo | `timestamp with time zone` / `timestamptz` | idem | ✅ |
| Nulo | `YES` | `YES` | ✅ |
| Default | nenhum | `null` | ✅ |
| `md5_comentario` | `31903908aefdad7dab4d6fd98c01f466` | `31903908aefdad7dab4d6fd98c01f466` | ✅ |
| Índice existe | sim | `indice_existe = true` | ✅ |
| Tabela do índice | `employee_terminations` | `employee_terminations` | ✅ |
| Método / único | `btree` / `false` | `btree` / `false` | ✅ |
| Válido / pronto / vivo | `true / true / true` | `true / true / true` | ✅ |
| Chaves / 1ª chave | `1` / `effective_date` | `1` / `effective_date` | ✅ |
| Expressões | nenhuma | `null` | ✅ |
| Predicado | `(applied_at IS NULL)` | idêntico | ✅ |
| `md5_definicao` | `9d290e625fb4996effb602f462b1589a` | `9d290e625fb4996effb602f462b1589a` | ✅ |

### 5.4 `085_app_users_must_change_password`

| Efeito | Esperado | Encontrado em staging | Conforme? |
| --- | --- | --- | --- |
| Coluna existe | sim | `coluna_existe = true` | ✅ |
| Tipo | `boolean` / `bool` | idem | ✅ |
| Nulo | `NO` (NOT NULL) | `NO` | ✅ |
| Default | `false` | `false` | ✅ |
| `md5_comentario` | `92c9ad675b74e9c8a21f4d0f787753ea` | `92c9ad675b74e9c8a21f4d0f787753ea` | ✅ |

**Valores de usuários não foram consultados nem usados.** Hoje há usuários com
`must_change_password = true` legitimamente: criação de usuário e reset de senha armam a flag. Por
isso a contagem de `true` **não** serve de prova nem de contraprova da 085. A prova é estrutural.

---

## 6. Classificação

| Migration | Classificação | Base |
| --- | --- | --- |
| `068_employees_unique_cpf` | **A — EFEITO COMPROVADO** | Índice com definição idêntica (md5), único, válido, predicado completo |
| `073_employee_movements_applied_marker` | **A — EFEITO COMPROVADO** | Coluna, comentário (md5) e índice (md5) idênticos |
| `075_employee_terminations_applied_marker` | **A — EFEITO COMPROVADO** | Coluna, comentário (md5) e índice (md5) idênticos |
| `085_app_users_must_change_password` | **A — EFEITO COMPROVADO** | Coluna, tipo, NOT NULL, default e comentário (md5) idênticos |

```text
068 = A
073 = A
075 = A
085 = A
```

### O que A significa, e o que não significa

- **Significa:** todos os efeitos relevantes das 4 migrations existem hoje em staging, **com a
  definição conferida**, e não só com o nome.
- **NÃO autoriza `repair` nesta etapa.** A decisão de `repair` só vem depois da auditoria das 28
  ausentes e da revisão das dependências (§7 e §9 de `P4_AUDITORIA_MIGRATIONS_LEGADAS.md`).
- **As 4 continuam AUSENTES do ledger de staging.** Nada foi registrado.
- **Não diz nada sobre produção.**

---

## 7. Limitações

- **Comentário conferido por MD5.** O texto foi devolvido na consulta, mas a conformidade se apoia
  no hash, que é igual ao gerado pela migration aplicada localmente.
- **O esperado veio de PostgreSQL 17.11 local.** Staging roda 17.6. A forma devolvida por
  `pg_get_indexdef` e `pg_get_expr` coincidiu, inclusive no MD5, então não houve efeito de versão
  neste lote.
- **Não verifica quem criou o objeto nem quando.** Mostra que o efeito existe e é idêntico, não
  como chegou lá. Isso é coerente com o que se pede de A.
- **O lote cobre 4 de 28.** As outras 24 ausentes **não** foram auditadas.

---

## 8. Confirmações

- Consultas **somente leitura** em staging.
- Nenhum `repair`, `db push` ou `migration up`.
- Nenhuma migration aplicada ou alterada.
- Staging não alterado. Produção **não acessada**.
- Nesta tarefa de registro **nenhuma consulta remota foi executada**. Os resultados foram fornecidos
  pelo responsável que rodou as consultas.
