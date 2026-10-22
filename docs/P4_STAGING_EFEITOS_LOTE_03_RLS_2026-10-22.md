# P4 — Efeitos em Staging — Lote 03 (RLS) — 2026-10-22

**Documento de evidência.** Registra a auditoria dos **efeitos reais** das 6 migrations de RLS
ausentes do ledger de staging, feita manualmente pelo responsável no SQL Editor, **somente
leitura**. Comparação automática e canônica das **251 policies**.

```text
A = todos os efeitos relevantes atribuídos à migration foram comprovados
    no estado atual de staging.
NÃO autoriza repair nesta etapa.
```

Nenhum comando de `repair` é proposto aqui.

---

## 1. Ambiente

| | |
| --- | --- |
| **Projeto** | `galli-staging` |
| **Project ref** | `jascnmgagejlvjlenduv` |
| **Natureza** | Somente `SELECT` em `pg_policies` e `pg_class`. Nenhum SQL de escrita |
| **Commit de referência do repositório** | `3b94b10` |
| **Data** | 2026-10-22 |

- Nenhum `repair`, nenhum `db push`, nenhum `migration up`.
- Nenhuma migration aplicada.
- Produção **não acessada**.
- Nenhuma CLI do Supabase, service role ou API REST.

---

## 2. Escopo do lote

| Migration | Policies | Tabelas com policy | `ENABLE RLS` próprio | Ledger de staging |
| --- | --- | --- | --- | --- |
| `066_rls_policies_non_sensitive_foundation` | 119 | 51 | — | **AUSENTE** |
| `069_rls_policies_hr_sensitive_core` | 30 | 10 | — | **AUSENTE** |
| `071_rls_policies_hr_employee_scope` | 27 | 9 | — | **AUSENTE** |
| `072_rls_policies_hr_recruitment_scope` | 21 | 7 | — | **AUSENTE** |
| `077_rls_policies_hr_workflow_admission_scope` | 23 | 8 | **8 tabelas** | **AUSENTE** |
| `078_rls_policies_hr_templates_children_system_scope` | 31 | 11 | **12 tabelas** | **AUSENTE** |
| **Total** | **251** | | **20** | |

Fonte do ledger: [`P4_LEDGER_STAGING_2026-10-19.md`](P4_LEDGER_STAGING_2026-10-19.md). **A ausência
no ledger não foi usada como evidência de efeito.**

---

## 3. Auditoria local — feita antes das consultas

### 3.1 Contagens remedidas

| Migration | `create policy` | `drop policy if exists` | `enable row level security` | FORCE / DISABLE |
| --- | --- | --- | --- | --- |
| 066 | 119 | 119 (próprios nomes) | 0 | 0 |
| 069 | 30 | 30 | 0 | 0 |
| 071 | 27 | 27 | 0 | 0 |
| 072 | 21 | 21 | 0 | 0 |
| 077 | 23 | 23 | **8** | 0 |
| 078 | 31 | 31 | **12** | 0 |

### 3.2 Unicidade

Os **251 pares `(tabela, policy)` são únicos**, e os nomes também são únicos entre tabelas.

### 3.3 Evolução posterior — nenhuma

Busca das 251 policies nas **95 migrations**, ignorando comentários:

- **cada nome aparece somente na própria migration**: nenhuma posterior faz `drop`, recria,
  redefine ou renomeia;
- **nenhuma** migration faz `alter policy`, `disable row level security`,
  `force row level security`, `drop table` ou `rename`;
- **nenhuma** migration a partir da 066 recria tabela-alvo.

**O estado final esperado é a definição original de cada migration.**

### 3.4 Nomes truncados pelo PostgreSQL (9 policies)

O PostgreSQL limita identificadores a **63 bytes** (`NAMEDATALEN`). Nove nomes declarados nos
arquivos têm 67–68 caracteres e são **gravados truncados**: o próprio PostgreSQL emite
`NOTICE: identifier ... will be truncated`.

| Migration | Tabela | Nome no arquivo (sufixo) | Nome no catálogo |
| --- | --- | --- | --- |
| 069 | `employee_termination_checklists` | `…_{select,insert,update}_by_parent_unit` (67) | `…_by_parent_` (63) |
| 071 | `employee_development_plan_items` | `…_{select,insert,update}_by_parent_unit` (67) | `…_by_parent_` (63) |
| 072 | `hr_interview_scorecard_responses` | `…_{select,insert,update}_by_parent_unit` (68) | `…_by_parent` (63) |

Os nomes truncados **continuam únicos**, porque `select`, `insert` e `update` diferem antes do corte.
**O nome truncado é o estado real do catálogo** e foi usado como esperado. Não é divergência.

> **Consequência para o código:** qualquer referência futura a essas 9 policies por nome (um
> `drop policy`, por exemplo) precisa usar o nome **truncado** ou o completo. O PostgreSQL trunca os
> dois da mesma forma. Registrado aqui para não virar surpresa.

---

## 4. Método canônico

### 4.1 Referência

- **PostgreSQL 17.11 local descartável**, com as migrations **reais**, sem alteração, aplicadas
  **em ordem de 001 a 094**. A única exceção é a `084` (§7), que não tem relação com policies: cria
  só `auth_login_attempts`, sem policy.
- Papéis `anon`, `authenticated` e `service_role` presentes. Nenhuma das 6 migrations depende de
  `auth.*`.
- O banco ficou com 254 policies: as 251 deste lote mais 3 da `087`.
- **A referência é lida do próprio `pg_policies`.** `qual` e `with_check` estão exatamente como o
  PostgreSQL os escreve sobre o schema real. **O texto bruto do arquivo nunca foi comparado com o
  catálogo.**

### 4.2 Normalização — idêntica nas duas pontas

O trecho de normalização foi **copiado literalmente** na consulta de staging:

| Campo | Normalização |
| --- | --- |
| `qual`, `with_check` | remove CR (`chr(13)`), colapsa espaços (`\s+` → um espaço), `btrim`, NULL → `'<NULL>'` |
| `roles` | array ordenado e unido por `,` |
| `permissive`, `cmd` | como o `pg_policies` devolve |
| Parênteses e casts | **intocados**: são a forma do próprio PostgreSQL nos dois lados |

### 4.3 Fingerprint

```text
md5(tablename | policyname | permissive | roles | cmd | qual | with_check)
```

Além disso, um hash de 12 caracteres **por campo** permite apontar o campo divergente na consulta de
detalhe.

### 4.4 Validação do comparador antes do uso

| Banco | Situação | Resultado do comparador |
| --- | --- | --- |
| Referência | Intacta | **251/251 conformes**, detalhe com 0 linhas, 20 tabelas `rls = t` |
| Cópia local mutilada | 1 policy removida, 1 `qual` trocado para `false`, 1 com `roles` trocadas para `anon`, RLS de uma tabela da 078 desligado | **Detectou as 4 alterações**: 1 ausente, 2 divergentes (campos `qual` e `roles`) e `rls = f` |

**Nenhum falso "conforme".** Só depois disso o comparador foi entregue para staging.

### 4.5 Pressuposto registrado

O SQL Editor de staging usa `search_path` com `public`, como a referência. Por isso funções como
`user_has_unit_access(...)` aparecem sem qualificação de schema nas duas pontas. O resultado
251/251 confirma o pressuposto.

---

## 5. Resultados

### 5.1 As 251 policies

| Migration | Esperadas | Encontradas | Conformes | Ausentes | Divergentes |
| --- | --- | --- | --- | --- | --- |
| 066 | 119 | 119 | **119** | 0 | 0 |
| 069 | 30 | 30 | **30** | 0 | 0 |
| 071 | 27 | 27 | **27** | 0 | 0 |
| 072 | 21 | 21 | **21** | 0 | 0 |
| 077 | 23 | 23 | **23** | 0 | 0 |
| 078 | 31 | 31 | **31** | 0 | 0 |
| **Total** | **251** | **251** | **251** | **0** | **0** |

`policies_ausentes = {}` e `policies_divergentes = {}` em todas as migrations. **A consulta de detalhe
não foi necessária.**

Perfil das 251, idêntico ao da referência: todas `PERMISSIVE`, para `authenticated`. São 94 SELECT,
78 INSERT, 77 UPDATE e 2 ALL (`audit_trail_no_direct_access` e `system_logs_no_direct_access`, com
`false`). **Nenhuma DELETE.**

### 5.2 RLS da 077 — 8 tabelas

| Tabela | Existe | RLS | FORCE | Policies |
| --- | --- | --- | --- | --- |
| `hr_admission_checklist_items` | ✅ | **true** | false | 3 |
| `hr_admission_processes` | ✅ | **true** | false | 3 |
| `hr_workflow_approver_delegations` | ✅ | **true** | false | 3 |
| `hr_workflow_audit_logs` | ✅ | **true** | false | 2 |
| `hr_workflow_events` | ✅ | **true** | false | 3 |
| `hr_workflow_notifications` | ✅ | **true** | false | 3 |
| `hr_workflow_steps` | ✅ | **true** | false | 3 |
| `hr_workflows` | ✅ | **true** | false | 3 |

### 5.3 RLS da 078 — 12 tabelas

| Tabela | Existe | RLS | FORCE | Policies |
| --- | --- | --- | --- | --- |
| `hr_background_jobs` | ✅ | **true** | false | 1 |
| `hr_document_rules` | ✅ | **true** | false | 3 |
| `hr_document_types` | ✅ | **true** | false | 3 |
| `hr_evaluation_template_criteria` | ✅ | **true** | false | 3 |
| `hr_evaluation_template_sections` | ✅ | **true** | false | 3 |
| `hr_evaluation_templates` | ✅ | **true** | false | 3 |
| `hr_onboarding_plan_items` | ✅ | **true** | false | 3 |
| `hr_onboarding_plans` | ✅ | **true** | false | 3 |
| `hr_trainings` | ✅ | **true** | false | 3 |
| `hr_workflow_idempotency_keys` | ✅ | **true** | false | **0**, por design |
| `hr_workflow_template_steps` | ✅ | **true** | false | 3 |
| `hr_workflow_templates` | ✅ | **true** | false | 3 |

As contagens de policies por tabela batem com a referência local nas 20 tabelas. FORCE RLS não é
executado por nenhuma das duas migrations; `false` é o esperado.

### 5.4 Contexto 066/069/071/072

Essas quatro migrations **não** habilitam RLS. A consulta de contexto opcional, sobre o RLS das
tabelas delas, não foi registrada neste lote. Ela não entra na classificação: uma mudança posterior
de `relrowsecurity` nessas tabelas seria **drift de segurança separado**, não efeito ausente delas.

---

## 6. Classificação

| Migration | Classificação | Base |
| --- | --- | --- |
| `066_rls_policies_non_sensitive_foundation` | **A — EFEITO COMPROVADO** | 119/119 policies conformes |
| `069_rls_policies_hr_sensitive_core` | **A — EFEITO COMPROVADO** | 30/30 conformes (3 com nome truncado) |
| `071_rls_policies_hr_employee_scope` | **A — EFEITO COMPROVADO** | 27/27 conformes (3 com nome truncado) |
| `072_rls_policies_hr_recruitment_scope` | **A — EFEITO COMPROVADO** | 21/21 conformes (3 com nome truncado) |
| `077_rls_policies_hr_workflow_admission_scope` | **A — EFEITO COMPROVADO** | 23/23 conformes **e** RLS nas 8 tabelas |
| `078_rls_policies_hr_templates_children_system_scope` | **A — EFEITO COMPROVADO** | 31/31 conformes **e** RLS nas 12 tabelas |

```text
066 = A
069 = A
071 = A
072 = A
077 = A
078 = A
```

### O que A significa, e o que não significa

- **Significa:** todos os efeitos relevantes atribuídos a cada migration existem em staging, com a
  **definição conferida campo a campo** por fingerprint canônico, e não por nome ou contagem.
- **NÃO autoriza `repair` nesta etapa.**
- **As 6 continuam AUSENTES do ledger de staging.**
- **Não diz nada sobre produção.**

### Estado acumulado em staging

**14 de 28 comprovadas como A:**

```text
066  068  069  071  072  073  075  076  077  078  082  085  086  088
```

**14 legadas ausentes ainda sem classificação.**

---

## 7. Achado — `084` aparentemente não executável no arquivo versionado

```text
P4-084 — INVESTIGAÇÃO DE MIGRATION VERSIONADA NÃO REPRODUZÍVEL
Estado: ABERTO. Bloqueante para a classificação e para qualquer decisão sobre a 084.
```

Encontrado durante a montagem da referência deste lote, ao aplicar as migrations em ordem:

- em `084_auth_login_attempts.sql`, num comentário de exemplo `curl … -w "%{time_total}\n"`, o `\n`
  aparece como **quebra de linha real**;
- a linha seguinte (linha 84 do arquivo) começa com `"` **fora do comentário**;
- `psql` falha com `syntax error at or near "" -X POST ""`;
- o defeito existe igual no **blob do Git** (LF). Não é efeito de CRLF na cópia de trabalho.

**Consequência aparente:** o arquivo versionado da `084` **não é executável como migration**, nem
por `psql`, nem, por consequência, por `db push`. Isso afeta:

- a auditoria de efeitos da própria `084`, porque a versão aplicada no banco é desconhecida;
- qualquer reconstrução do banco a partir das migrations (§6.4 do plano);
- qualquer decisão futura de `repair` ou aplicação envolvendo a `084`.

**Não corrigido. A migration não foi editada.** Ainda não se concluiu qual versão foi aplicada em
staging nem em produção. Isso é objeto de investigação específica (`P4-084`).

**Não afeta este lote:** a `084` só cria `auth_login_attempts`, sem policy. Por isso ela foi
pulada **apenas** na montagem do banco local de referência.

---

## 8. Limitações

- **Referência em PostgreSQL 17.11; staging roda 17.6.** O resultado 251/251 mostra que a forma de
  `pg_policies` coincidiu.
- **A consulta de contexto de RLS das tabelas da 066/069/071/072 não foi registrada.** Não afeta a
  classificação, porque essas migrations não habilitam RLS.
- **O fingerprint prova a definição, não a origem.** Não mostra quando nem como as policies foram
  criadas.
- **14 de 28.** As outras 14 ausentes **não** foram auditadas.

---

## 9. Confirmações

- Consultas **somente leitura** em staging.
- Nenhum `repair`, `db push` ou `migration up`.
- Nenhuma migration aplicada ou alterada. **A `084` não foi editada.**
- Staging não alterado. Produção **não acessada**.
- Nesta tarefa de registro **nenhuma consulta remota foi executada**. Os resultados foram fornecidos
  pelo responsável que rodou as consultas.
