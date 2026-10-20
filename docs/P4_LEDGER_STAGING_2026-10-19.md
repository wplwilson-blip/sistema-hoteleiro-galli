# P4 — Fotografia do Ledger de Staging — 2026-10-19

**Documento de evidência.** Registra a leitura do ledger de migrations de **staging**, feita
manualmente pelo responsável no SQL Editor, **somente leitura**. Não é roteiro e **não autoriza
`repair`**.

As consultas usadas são as da etapa P4.4: ambiente, estrutura, listagem, contagem, faixa e
comparação com o repositório no commit `3f426c6`.

---

## 1. Ambiente

| | |
| --- | --- |
| **Projeto** | `galli-staging` |
| **Project ref** | `jascnmgagejlvjlenduv` |
| **Banco** (`current_database()`) | `postgres` |
| **Usuário** (`current_user`) | `postgres` |
| **Ledger** (`to_regclass`) | `supabase_migrations.schema_migrations` (existe) |
| **Data da coleta** | 2026-10-19 |
| **`executado_em`** (`now()`, como retornado pelo banco) | `2026-10-19 20:47:43.917171+00` |
| **Commit de referência do repositório** | `3f426c6` |

### O que esta coleta foi, e o que não foi

- **Somente consultas de leitura** sobre `supabase_migrations.schema_migrations` e
  `information_schema.columns`.
- **Nenhum `repair`**, nenhum `db push`, nenhum `migration up`. **Nenhum SQL de escrita.**
- **Nenhuma CLI do Supabase.** Ela faz "Initialising login role", que é escrita, mesmo em leitura.
- **Produção não foi acessada.**

---

## 2. Estrutura real do ledger

| Coluna | Tipo | Nulo? |
| --- | --- | --- |
| `version` | `text` | **NOT NULL** |
| `statements` | `text[]` | NULL |
| `name` | `text` | NULL |

**Não existe coluna de data de aplicação** (`applied_at` ou equivalente). Isso confirma o §7.2 do
plano: o ledger não diz **quando** cada migration foi registrada, só **quais**.

---

## 3. Contagem e faixa

| Medida | Valor |
| --- | --- |
| **Total de entradas** | **65** |
| **Menor `version`** | `001` |
| **Maior `version`** | `065` |

A listagem completa mostrou **001 a 065 presentes e contínuas**, sem lacunas.

---

## 4. Comparação com o repositório

Resumo devolvido pela consulta de comparação (full outer join entre as 95 migrations locais e o
ledger):

| Tipo | Situação | Qtd | De | Até |
| --- | --- | --- | --- | --- |
| legada | **PRESENTE** | **65** | `001` | `065` |
| legada | **AUSENTE** | **28** | `066` | `094` |
| timestamp | **AUSENTE** | **2** | `20260918120033` | `20261019184500` |
| — | **SÓ NO LEDGER** | **0** (nenhuma linha) | — | — |

### 4.1 Legadas presentes no ledger — 65

```text
001 – 065   (contínuas)
```

### 4.2 Legadas ausentes do ledger — 28

```text
066  067  068  069  070  071  072  073
075  076  077  078  079  080  081  082
083  084  085  086  087  088  089  090
091  092  093  094
```

`074` não aparece porque **não existe** no repositório (§1.2 do plano). Ele não é uma ausência.

### 4.3 Migrations timestamp — ambas AUSENTES

| Migration | No ledger de staging |
| --- | --- |
| `20260918120033_hr_workflow_idempotency_indexes_parity.sql` | **AUSENTE** |
| `20261019184500_housekeeping_security_hardening.sql` | **AUSENTE** |

É o estado esperado: as duas **nunca foram aplicadas** e **nunca devem entrar em `repair`**.

### 4.4 Entradas só no ledger — nenhuma

Nenhuma versão registrada em staging deixou de ter arquivo correspondente no repositório.

---

## 5. Conclusões

| Afirmação | Situação |
| --- | --- |
| Backlog legado de staging = **28** | ✅ **CONFIRMADO** pela fotografia |
| Fila total antes de qualquer `repair` = **30** (28 + 2) | ✅ **CONFIRMADO** |
| As 2 timestamp ausentes do ledger | ✅ **CONFIRMADO** |
| Nenhuma entrada órfã no ledger | ✅ **CONFIRMADO** |
| Ledger de staging = `001`–`065` (medido em 2026-09-18, §1.3 do plano) | ✅ **Inalterado** desde a medição anterior |

**A fotografia não contradiz nada do que estava documentado.** A hipótese de P4.4 se confirmou
integralmente.

### Critério depois de um `repair` correto das legadas

Se e quando as 28 legadas forem reparadas, **somente com efeito comprovado**, devem restar
**exatamente 2** pendentes, e devem ser **exatamente**:

1. `20260918120033_hr_workflow_idempotency_indexes_parity.sql`
2. `20261019184500_housekeeping_security_hardening.sql`

Uma terceira pendente, ou o sumiço de qualquer uma das duas: **PARAR.**

---

## 6. O que esta fotografia NÃO é

- **Não classifica** as 28 legadas ausentes em A/B/C/D. Ausência do ledger **não** prova ausência do
  efeito (§3 de `P4_AUDITORIA_MIGRATIONS_LEGADAS.md`). A classificação exige a auditoria de efeitos
  do §10 daquele documento, que **não foi feita**.
- **Não autoriza `repair`.** Nenhum comando de `repair` é proposto aqui.
- **Não diz nada sobre produção.** O ledger de produção (`001`–`039`) continua sendo **relato**,
  não medido.

### Fotografia de última hora

Esta fotografia **congela o ledger de 2026-10-19**. **Antes de qualquer `repair` em staging**, ela
deve ser **repetida imediatamente antes**, e o resultado comparado com este documento, inclusive os
`md5_statements` do Apêndice A. Qualquer diferença nas 65 entradas significa que o ledger mudou
desde esta coleta: **PARAR e investigar**.

---

## 6.1 Conferência dos nomes

```text
65/65 nomes conferidos — nenhuma divergência.
```

- **Como:** comparação mecânica (`diff`) entre `version|name` da saída da Consulta 2 e os nomes dos
  arquivos `001_*.sql` a `065_*.sql` do repositório no commit `3f426c6`. Nenhuma linha foi
  redigitada.
- **Resultado:** as 65 versões, de `001` a `065`, contínuas e sem repetição, têm `name` **idêntico**
  ao sufixo do nome do arquivo local.

> **Nome igual não prova SQL igual.** O ledger guarda o nome que a CLI derivou do arquivo **no
> momento do registro**. Um arquivo editado depois, como `040`, `058` e `059` (`29954f9`), continua
> com o mesmo nome. A comparação de **conteúdo** é outra etapa (Apêndice A).

---

## 7. Confirmações

- Coleta **somente leitura**.
- Nenhum `repair`.
- Nenhuma migration aplicada.
- Nenhuma alteração em staging.
- Produção **não acessada**.
- Nesta tarefa de registro, **nenhuma consulta remota foi executada**. Os resultados acima foram
  fornecidos pelo responsável que rodou a coleta.

---

## Apêndice A — Identidade do conteúdo armazenado no ledger

Saída da Consulta 2 da coleta de 2026-10-19 (`executado_em` = `2026-10-19 20:47:43.917171+00`),
para as 65 entradas:

```sql
select version, name,
       cardinality(statements)                    as qtd_statements,
       length(array_to_string(statements, E'\n')) as tamanho_chars,
       md5(array_to_string(statements, E'\n'))    as md5_statements
from supabase_migrations.schema_migrations
order by version;
```

**Como ler esta tabela:**

- **`md5_statements` identifica o conteúdo que está armazenado no ledger** para aquela versão: o
  array `statements`, unido por quebra de linha. É uma impressão digital para **comparação futura**:
  com uma nova fotografia, para detectar mudança no ledger, e com os arquivos do repositório, para
  detectar arquivo editado depois do registro.
- **Não prova que o SQL foi executado com sucesso.** O ledger registra o que foi **declarado** como
  aplicado. Uma entrada criada por `repair`, ou registrada fora do fluxo, teria `statements` sem que
  o efeito tenha acontecido.
- **Não substitui a auditoria A/B/C/D** dos efeitos reais do banco
  (`P4_AUDITORIA_MIGRATIONS_LEGADAS.md` §9–§11), que continua sendo etapa separada.
- **Ainda não foi comparado com os arquivos locais.** Essa comparação não fez parte desta tarefa.
  Quando for feita, precisa reproduzir **a mesma** forma de cálculo (a divisão em statements da CLI e
  a junção com `E'\n'`). Um MD5 diferente do arquivo pode vir da forma de cálculo, e não de edição.

Totais: **1.201 statements**, **965.515 caracteres** nas 65 entradas.

| version | name | qtd_statements | tamanho_chars | md5_statements |
| --- | --- | ---: | ---: | --- |
| `001` | `extensions_and_enums` | 2 | 2419 | `6d839b880511974a72daebdbf288431c` |
| `002` | `base_organization_units` | 23 | 5577 | `57505564d306e6322c1af11fe9067f6c` |
| `003` | `users_employees_permissions` | 26 | 8474 | `dc29c4a2d07cefb72bf56bd9070a9c81` |
| `004` | `operational_structure` | 29 | 6655 | `f6d0b97af17484f890b3d6600e8f19db` |
| `005` | `classification_and_workflow_base` | 17 | 4390 | `2fbc92ee49ee1d09edeae0bb78d29728` |
| `006` | `approval_flows` | 22 | 6750 | `20e278edf33984d398dca47fa5c03868` |
| `007` | `notifications_logs_audit` | 20 | 4296 | `29cac43ce7e13eec22e48ff2db17d0e3` |
| `008` | `triggers_updated_at_soft_delete_audit` | 7 | 5112 | `16889bff77623b10e8c7b0c1bfdd00af` |
| `009` | `rls_policies_base` | 40 | 3991 | `8a1c48c9a2e6efbb87a85a8af4488da2` |
| `010` | `seed_base_data` | 8 | 7078 | `eaee819bc171a48b7415549c63455781` |
| `011` | `shared_foundation_tables` | 42 | 9622 | `6ec2cf121fad1e2a7ba5a912a56f2ad2` |
| `012` | `budget_control_base` | 56 | 17117 | `ae1b3d3e4b7abfcd46b4aaea3873e2d3` |
| `013` | `purchase_module_base` | 79 | 21863 | `db7b3290c5276343860f988d3042e920` |
| `014` | `suppliers_unique_document` | 1 | 348 | `0fe0161377e038f86ef8c38fb3610df4` |
| `015` | `purchase_approvals` | 21 | 4606 | `cfbd55c14b31e2828d5a9cf178d0ff9b` |
| `016` | `purchase_approval_return_to_purchases` | 8 | 1337 | `30a7c96c6d373761b47bec41bdfe5e1e` |
| `017` | `purchase_quote_negotiations` | 24 | 6175 | `244366d29d96c6ed03f0a2cebbb893f1` |
| `018` | `fix_purchase_approval_status_default` | 4 | 624 | `5a5298825ffa0a38607fcafd4c327cfd` |
| `019` | `purchase_approval_snapshots` | 19 | 6184 | `5fed26db8276dabbefbfb4a7ff517cf5` |
| `020` | `purchase_quote_evidence` | 10 | 4688 | `df0f5b6697b415b5ab0e3e26cb7f073d` |
| `021` | `hr_secure_foundation` | 53 | 21628 | `75f285d52bb1592f0345bf3324fec8de` |
| `022` | `hr_workflows` | 60 | 21139 | `480cd34b345e0d7b85db64d37930dee2` |
| `023` | `hr_workflow_transaction_foundation` | 22 | 8545 | `c524af2f0cecfe5cc3b45258e2b0d62c` |
| `024` | `hr_workflow_idempotency_updated_at_trigger` | 5 | 1048 | `3240f1fc6228cf99067e099e0ac93350` |
| `025` | `hr_workflow_rpc_create_workflow` | 4 | 27634 | `1b4fd69a1dc4d859be6c2a7258bb9403` |
| `026` | `hr_workflow_rpc_execute_step` | 4 | 41729 | `65c44391efb55394f8bd48bbe422f919` |
| `027` | `hr_workflow_rpc_approve_step` | 4 | 54718 | `edd0398c48330d02e180e6b3bc5b04dd` |
| `028` | `hr_workflow_rpc_reject_step` | 14 | 67493 | `41963b7b35a751b12a990bb61a6976a9` |
| `029` | `hr_workflow_rpc_return_step` | 4 | 78451 | `c69e842b4df3ecd4c53ed83322eb8bf9` |
| `030` | `hr_workflow_rpc_cancel_workflow` | 4 | 87957 | `316be2834edca7d2c20acc8ee19a5675` |
| `031` | `hr_workflow_sla_foundation` | 11 | 96312 | `0df00adbf0b638b99a6953bc96f18f8e` |
| `032` | `hr_workflow_escalation_foundation` | 6 | 2443 | `2fa722463ab6f5ba8b1050684296e678` |
| `033` | `hr_workflow_notification_foundation` | 22 | 8807 | `f63d786709ab68c6ec532763c4803e01` |
| `034` | `hr_workflow_dashboard_foundation` | 2 | 7378 | `90650eafa69a9db5db36ce6509ac519c` |
| `035` | `hr_workflow_audit_foundation` | 17 | 6721 | `bd36ec05cc7247e451db1980104a4fa6` |
| `036` | `hr_workflow_analytics_foundation` | 4 | 3578 | `5a74ad476f21d206592f7effa0cfec37` |
| `037` | `hr_workflow_templates_foundation` | 16 | 7563 | `765ff3193739b6ae9d9f6cce8d393bf9` |
| `038` | `hr_workflow_delegations_foundation` | 12 | 5104 | `c89503645f22f5461558f0293a655c93` |
| `039` | `hr_background_jobs_foundation` | 11 | 5288 | `799b65c994e397c36cfd3d4546a901ae` |
| `040` | `hr_job_opening_workflow_mvp` | 14 | 98944 | `f8b7021956aa61496a94649392e3be39` |
| `041` | `hr_job_candidates_interviews_mvp` | 28 | 8048 | `98adf592fea511e1c7ec948f07e31f23` |
| `042` | `hr_interview_scorecards_mvp` | 34 | 15243 | `51d542e95d911041e931907ffaed32a6` |
| `043` | `hr_candidate_admission_conversion_mvp` | 12 | 4114 | `30e9245c5e27a55616931d6b1bf7cd9f` |
| `044` | `hr_admission_workflow_template_seed` | 2 | 3638 | `4b68b242a9df206294599d71074b6bd2` |
| `045` | `hr_operational_profiles` | 2 | 2508 | `8bbeae603ad9bb724e0e98369ff246b8` |
| `046` | `hr_document_rules` | 20 | 5836 | `fb5d82c87e51d7961f573bce97af830d` |
| `047` | `hr_onboarding_foundation` | 70 | 20441 | `b17fdcced69947f61272a846a49637a8` |
| `048` | `hr_employee_evaluations_foundation` | 87 | 29819 | `d060c17f01bba1c1b556efecb7ba5d58` |
| `049` | `hr_document_types_hotel_galli_seed` | 1 | 4484 | `35a1c2fe84894e6bba152228e64b7ad0` |
| `050` | `hr_document_types_hotel_galli_alignment` | 1 | 2459 | `719dd529b7e7b2afc8af15098055b273` |
| `051` | `hr_functional_event_types_expansion` | 2 | 2538 | `ffad643a0f14cb16ab59a430e18cdd7d` |
| `052` | `hr_employee_movements_foundation` | 24 | 9496 | `00368509e784634c38b741dad7ecd975` |
| `053` | `hr_employee_movement_approvals` | 10 | 2317 | `42157fa2081995e128bbe5b84d8545f6` |
| `054` | `hr_trainings_foundation` | 27 | 9068 | `6f6491ae7feefd52447bcf0cef1a9197` |
| `055` | `hr_training_expiration_governance` | 6 | 1354 | `c76694715277e8ca9d16690d6f2263f8` |
| `056` | `hr_occupational_health_foundation` | 24 | 8694 | `af4e2843cd72d7b788a02bba4a4509bf` |
| `057` | `hr_occupational_expiration_governance` | 3 | 875 | `151022e4b7a00b3493a70244405c498f` |
| `058` | `hr_conduct_records_foundation` | 8 | 4298 | `f5d31611ba13be6b22f20f7c9b5a8093` |
| `059` | `hr_conduct_review_governance` | 10 | 2380 | `da43fd33cefa2c2611dc095423c3bc56` |
| `060` | `hr_terminations_foundation` | 13 | 7148 | `e09934392e3a54d57d170984a036f4ec` |
| `061` | `hr_employee_document_links_foundation` | 18 | 6476 | `428964df19b27ec6bd99422841a9b667` |
| `062` | `hr_admission_processes_foundation` | 41 | 16971 | `3192bc60f696411977932de055877eb0` |
| `063` | `hr_admission_safe_text_constraint_fix` | 4 | 4801 | `a99ca480f6521eaf939305a44d208955` |
| `064` | `auth_grants_base_purchases_attachments` | 3 | 8582 | `3e9ea69f2d10407e82de245cfa7f4caa` |
| `065` | `purchase_approval_decision_grants_split` | 4 | 4141 | `3e16bcca14f67737aa29d53069267f7b` |
