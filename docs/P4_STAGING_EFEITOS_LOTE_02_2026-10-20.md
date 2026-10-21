# P4 — Efeitos em Staging — Lote 02 — 2026-10-20

**Documento de evidência.** Registra a auditoria dos **efeitos reais** de 4 migrations legadas
ausentes do ledger de staging, feita manualmente pelo responsável no SQL Editor, **somente
leitura**. Mesmo método do [Lote 01](P4_STAGING_EFEITOS_LOTE_01_2026-10-20.md).

```text
A = efeito atual comprovado.
NÃO autoriza repair nesta etapa.
```

Nenhum comando de `repair` é proposto aqui.

---

## 1. Ambiente

| | |
| --- | --- |
| **Projeto** | `galli-staging` |
| **Project ref** | `jascnmgagejlvjlenduv` |
| **Natureza** | Somente `SELECT` de catálogo e de linhas de catálogo de permissões. Nenhum SQL de escrita |
| **Commit de referência do repositório** | `0fe3a0f` |
| **Data** | 2026-10-20 |

- Nenhum `repair`, nenhum `db push`, nenhum `migration up`.
- Nenhuma migration aplicada.
- Produção **não acessada**.
- Nenhuma CLI do Supabase, service role ou API REST.

---

## 2. Escopo do lote

| Migration | Efeitos | Ledger de staging |
| --- | --- | --- |
| `076_hr_functional_event_types_nr_expiration` | CHECK `employee_functional_events_type_check` recriado com `nr_expiring` e `nr_expired` | **AUSENTE** |
| `082_purchase_quote_selected_by` | Colunas `selected_by` (com FK) e `selected_at` em `purchase_quotes`, mais comentários | **AUSENTE** |
| `086_audit_trail_author_from_row` | Função nova `safe_uuid(text)` e novo corpo de `write_audit_trail()`, mais comentários | **AUSENTE** |
| `088_auth_grants_rooms` | 3 permissões `BASE:rooms.*` e 13 concessões a perfis | **AUSENTE** |

Fonte do ledger: [`P4_LEDGER_STAGING_2026-10-19.md`](P4_LEDGER_STAGING_2026-10-19.md). **A ausência
no ledger não foi usada como evidência de efeito.**

---

## 3. Auditoria local — feita antes das consultas

Busca nas 95 migrations, ignorando comentários.

| Mig | Migrations posteriores alteram? | Estado final esperado |
| --- | --- | --- |
| **076** | **Não.** A constraint é tocada só por 021, 051 e 076, e a 076 é a última | O CHECK da 076: 69 valores |
| **082** | **Não na estrutura.** A 083 só **escreve** valores nas colunas, dentro das RPCs | As colunas, a FK e os comentários da 082 |
| **086** | **Não.** Nenhuma posterior redefine `safe_uuid` ou `write_audit_trail`; a 087 só cria triggers que usam a função | Os corpos da 086 |
| **088** | **Só amplia, para outros perfis.** A 089 concede view/block a `LIDER_GOVERNANCA` e `LIDER_MANUTENCAO`; a 093, a `RECEPCAO`. **Nenhuma migration apaga ou altera** `profile_permissions` | As 3 permissões com os textos da 088 e as 13 concessões originais |

### Como o esperado foi gerado

076, 082 e 086 foram aplicadas **sem alteração** em bancos locais descartáveis (PostgreSQL 17.11),
sobre uma fixture mínima com os tipos das migrations de origem. As **mesmas consultas** do §4
rodaram lá. Para a 088, o esperado são os literais do próprio arquivo, com o MD5 das descrições
calculado localmente.

---

## 4. SQL de leitura usado

As quatro consultas estão integralmente no relatório da etapa P4.5B. Em resumo:

| Mig | Fonte | Campos de prova |
| --- | --- | --- |
| 076 | `pg_constraint` | `existe`, `contype`, `convalidated`, quantidade com o nome, `nr_expiring`/`nr_expired`, quantidade de valores, `pg_get_constraintdef`, `md5_definicao` |
| 082 | `information_schema.columns` + `pg_constraint` + `pg_attribute` | tipo, nulidade, default, `md5_comentario` das 2 colunas; FK: nome, validada, origem→destino, `confdeltype`, `confupdtype`, colunas, `md5_definicao` |
| 086 | `pg_proc` + `pg_language` | `to_regprocedure`, sobrecargas, retorno, linguagem, `prosecdef`, `provolatile`, `proconfig`, `md5_prosrc_sem_cr`, `md5_functiondef_sem_cr`, `corpo_tem_cr`, `md5_comentario` |
| 088 | `permissions`, `access_profiles`, `profile_permissions` | Bloco A (catálogo) e Bloco C (as 13 concessões: situação, `created_by` nulo, `deleted_at`, `deleted_by`) |

---

## 5. Resultados × esperado

### 5.1 `076_hr_functional_event_types_nr_expiration`

| Efeito | Esperado | Encontrado | Conforme? |
| --- | --- | --- | --- |
| Constraint existe | sim | sim | ✅ |
| Tipo | `c` (CHECK) | CHECK | ✅ |
| Validada | `true` | `true` | ✅ |
| Constraints com esse nome | 1 | 1 | ✅ |
| Contém `nr_expiring` / `nr_expired` | sim / sim | sim / sim | ✅ |
| Quantidade de valores | 69 | 69 | ✅ |
| `md5_definicao` | `0db72233bb8268086c88139c1b548e07` | `0db72233bb8268086c88139c1b548e07` | ✅ |

### 5.2 `082_purchase_quote_selected_by`

| Efeito | Esperado | Encontrado | Conforme? |
| --- | --- | --- | --- |
| `selected_by` existe | sim | sim | ✅ |
| `selected_by` tipo / nulo / default | `uuid` / `YES` / nenhum | `uuid` / nullable / sem default | ✅ |
| `selected_by` `md5_comentario` | `4d50ea06ac088f042fa052a2c63d166a` | idem | ✅ |
| FK nome | `purchase_quotes_selected_by_fkey` | idem | ✅ |
| FK validada | `true` | `true` | ✅ |
| FK origem → destino | `purchase_quotes.selected_by` → `app_users.id` | idem | ✅ |
| FK ON DELETE / ON UPDATE | `n` (SET NULL) / `a` (NO ACTION) | SET NULL / NO ACTION | ✅ |
| FK colunas | 1 | 1 | ✅ |
| `fk_md5_definicao` | `983664a201281646bf7a5cb6c8873958` | idem | ✅ |
| `selected_at` existe | sim | sim | ✅ |
| `selected_at` tipo / nulo / default | `timestamptz` / `YES` / nenhum | idem | ✅ |
| `selected_at` `md5_comentario` | `96fcb7963ec5c4eb601d41cd32a893b2` | idem | ✅ |

**Conteúdo das cotações não foi consultado nem usado.**

### 5.3 `086_audit_trail_author_from_row`

| Efeito | Esperado | Encontrado | Conforme? |
| --- | --- | --- | --- |
| `safe_uuid(text)` existe / sobrecargas | sim / 1 | sim / 1 | ✅ |
| `safe_uuid` retorno / linguagem | `uuid` / `plpgsql` | idem | ✅ |
| `safe_uuid` definer / volatilidade | `false` / `i` (immutable) | idem | ✅ |
| `safe_uuid` `md5_prosrc_sem_cr` | `ec8b0fd512f5c78ae316ac315eab1d3c` | idem | ✅ |
| `safe_uuid` `md5_functiondef_sem_cr` | `9665ee7dbde5627081af1e251a1d2ba1` | idem | ✅ |
| `safe_uuid` `md5_comentario` | `9087b50c63ee10807471fe4ba441ce6d` | idem | ✅ |
| `write_audit_trail()` existe / sobrecargas | sim / 1 | sim / 1 | ✅ |
| `write_audit_trail` retorno / linguagem | `trigger` / `plpgsql` | idem | ✅ |
| `write_audit_trail` definer / volatilidade | **`true`** / `v` | idem | ✅ |
| `write_audit_trail` config | `{search_path=public}` | idem | ✅ |
| `write_audit_trail` `md5_prosrc_sem_cr` | `ffad2428e1dd2a4796f5d5280ce9c6e4` | idem | ✅ |
| `write_audit_trail` `md5_functiondef_sem_cr` | `a1d3507a010a668626e6a5a919a08092` | idem | ✅ |
| `write_audit_trail` `md5_comentario` | `e5937721e56fabd0de2aea64e12c4a4e` | idem | ✅ |

Se a 086 **não** tivesse sido aplicada, `safe_uuid` não existiria e `write_audit_trail` estaria na
versão da 008 (`md5_prosrc_sem_cr = 8a600f3863d48acb63e7f36b29431963`). Não é o caso.

### 5.4 `088_auth_grants_rooms`

**Catálogo (Bloco A):**

| Permissão | `name` esperado | `md5(description)` esperado | Status / `deleted_at` | Conforme? |
| --- | --- | --- | --- | --- |
| `BASE:rooms.block` | Bloquear apartamentos | `69f4cf9db926384675a8f4ef9e1cc43b` | `active` / null | ✅ |
| `BASE:rooms.manage` | Gerenciar apartamentos | `5a28e0acf5fc4e395ae6c2b467e0d807` | `active` / null | ✅ |
| `BASE:rooms.view` | Ver apartamentos | `2675904cf9020e98396b256f4c2a2995` | `active` / null | ✅ |

**As 13 concessões originais (Bloco C):** todas presentes, com `situacao = ATIVA`,
`created_by_nulo = true`, `deleted_at = null` e `deleted_by = null`.

| Permissão | Perfis | Situação |
| --- | --- | --- |
| `BASE:rooms.view` | SUPER_ADMIN, NETWORK_MANAGER, UNIT_DIRECTOR, DEPARTMENT_MANAGER, SUPERVISOR, AUDIT | 6 / 6 ATIVAS ✅ |
| `BASE:rooms.block` | SUPER_ADMIN, UNIT_DIRECTOR, DEPARTMENT_MANAGER, SUPERVISOR | 4 / 4 ATIVAS ✅ |
| `BASE:rooms.manage` | SUPER_ADMIN, UNIT_DIRECTOR, DEPARTMENT_MANAGER | 3 / 3 ATIVAS ✅ |

---

## 6. Peculiaridade da 086: finais de linha (CRLF × LF)

`prosrc` guarda o corpo da função **literalmente, com os finais de linha**. O repositório roda com
`core.autocrlf = true`. A cópia de trabalho no Windows tem **CRLF**, e o blob do Git tem **LF**.
Conforme o arquivo foi colado, o mesmo SQL lógico produz MD5 bruto diferente.

| Variante | `safe_uuid` `md5_prosrc` | `write_audit_trail` `md5_prosrc` |
| --- | --- | --- |
| LF (blob do Git) | `ec8b0fd5…` | `ffad2428…` |
| CRLF (cópia de trabalho Windows) | `6239d46d…` | `209a3add…` |
| **Sem `\r` (critério usado)** | **`ec8b0fd5…`** | **`ffad2428…`** |

**O critério foi normalizado:** `md5(replace(prosrc, chr(13), ''))` dá **o mesmo valor** nas duas
variantes, o que foi conferido localmente nos dois bancos de referência. Em staging,
`corpo_tem_cr = true` nas duas funções: a 086 foi aplicada **a partir de um arquivo com CRLF**.
**Isso não é divergência lógica.** O corpo, sem `\r`, é idêntico ao da migration.

> **Consequência para lotes futuros com funções** (079, 080, 081, 083, 089–094): usar sempre o MD5
> **sem `\r`** como critério e gerar a referência das duas formas. Comparar o MD5 bruto produziria
> falsos C.

Os demais objetos deste lote (CHECK, FK, comentários de uma linha) **não** dependem de final de
linha: as duas variantes deram o mesmo MD5 na referência local.

---

## 7. Interpretação histórica dos grants da 088

A 088 usa `on conflict do nothing` justamente para **não restaurar** uma revogação deliberada. Por
isso a regra combinada para esta migration era: **concessão ausente que possa ter sido revogada
depois = D, não C automático.**

Evidências usadas para interpretar as linhas:

| Fato | Fonte |
| --- | --- |
| Revogação pela aplicação é **soft delete**: `status = 'inactive'`, `deleted_at`, `deleted_by` | `src/app/api/admin/permissions/profiles/route.ts` (revogar) |
| A aplicação **não** faz `delete` físico em `profile_permissions` | Mesmo arquivo: sem `.delete()` |
| Concessão pela UI grava `created_by = ator` | Mesmo arquivo (conceder, insert) |
| A 088 insere **sem** `created_by` | `088_auth_grants_rooms.sql`, bloco B |
| Nenhuma migration posterior apaga ou altera essas linhas | Auditoria local, §3 |

**Resultado:** as 13 estão **ATIVAS**, com `created_by` nulo e sem `deleted_at` ou `deleted_by`. É
exatamente o padrão de linha inserida pela 088 e nunca revogada. **Não houve nenhum caso de
ausência nem de revogação**, então a regra do D não precisou ser aplicada.

Linhas extras para `LIDER_GOVERNANCA`, `LIDER_MANUTENCAO` ou `RECEPCAO`, vindas da 089/093, **não
seriam desvio** da 088. Os blocos B (todas as linhas) e D (perfis ausentes) **não foram rodados**:
não eram necessários para classificar, porque os 13 efeitos originais foram comprovados um a um.

---

## 8. Classificação

| Migration | Classificação | Base |
| --- | --- | --- |
| `076_hr_functional_event_types_nr_expiration` | **A — EFEITO COMPROVADO** | CHECK com definição idêntica (md5), validado, 69 valores |
| `082_purchase_quote_selected_by` | **A — EFEITO COMPROVADO** | 2 colunas, 2 comentários e FK idênticos (md5), ON DELETE SET NULL |
| `086_audit_trail_author_from_row` | **A — EFEITO COMPROVADO** | 2 funções com corpo, definição e comentário idênticos (md5 sem `\r`), atributos conformes |
| `088_auth_grants_rooms` | **A — EFEITO COMPROVADO** | 3 permissões conformes e as 13 concessões ATIVAS, com assinatura de inserção por migration |

```text
076 = A
082 = A
086 = A
088 = A
```

### O que A significa, e o que não significa

- **Significa:** os efeitos atuais destas 4 migrations existem em staging e foram conferidos por
  definição, não só por nome.
- **NÃO autoriza `repair` nesta etapa.**
- **As 4 continuam AUSENTES do ledger de staging.**
- **Não diz nada sobre produção.**

### Estado acumulado em staging

| Migration | Classificação | Lote |
| --- | --- | --- |
| 068 | A | 01 |
| 073 | A | 01 |
| 075 | A | 01 |
| 076 | A | **02** |
| 082 | A | **02** |
| 085 | A | 01 |
| 086 | A | **02** |
| 088 | A | **02** |

**8 de 28 comprovadas. 20 legadas ausentes ainda sem classificação.**

---

## 9. Limitações

- **`created_by` nulo é compatível com a 088, mas não exclusivo dela.** Um `insert` manual por SQL
  também deixaria `created_by` nulo. A classificação se apoia no conjunto: as 13 exatas, os textos
  do catálogo idênticos, nenhuma revogação e nenhuma migration posterior tocando as linhas.
- **Blocos B e D da 088 não rodados.** Linhas além das 13 e perfis ausentes não foram listados.
  Não afetam a classificação, porque os 13 efeitos foram provados diretamente.
- **O esperado veio de PostgreSQL 17.11 local.** Staging roda 17.6. Os MD5 coincidiram, então não
  houve efeito de versão.
- **Não mostra quando nem por quem** os objetos foram criados. Só que existem e são idênticos.
- **8 de 28.** As outras 20 ausentes **não** foram auditadas.

---

## 10. Confirmações

- Consultas **somente leitura** em staging.
- Nenhum `repair`, `db push` ou `migration up`.
- Nenhuma migration aplicada ou alterada.
- Staging não alterado. Produção **não acessada**.
- Nesta tarefa de registro **nenhuma consulta remota foi executada**. Os resultados foram fornecidos
  pelo responsável que rodou as consultas.
