# P4 — Auditoria das Migrations Legadas Ausentes do Ledger

**Documento de análise local.** Nenhum banco foi consultado e nenhum comando de CLI foi executado
contra staging ou produção. Tudo aqui sai da leitura dos arquivos em `supabase/migrations/` e do
histórico Git, no commit `28a8636`.

**Este documento não autoriza `repair`.** Ele define o que precisa ser provado antes de qualquer
`repair`, e como.

---

## 1. Objetivo

A aplicação da migration seletiva de índices está bloqueada pela condição **P4** de
[`GO_NO_GO_RECONCILIACAO_INDICES_2026-10-16.md`](GO_NO_GO_RECONCILIACAO_INDICES_2026-10-16.md):
`db push` só pode rodar depois de reconciliar o histórico das migrations legadas.

Este documento faz três coisas:

- Lista **cada efeito** de cada migration legada fora do ledger, lendo o SQL e não o título.
- Diz **qual evidência de banco** provaria esse efeito, e quando essa prova não existe.
- Define a **ordem e o método** da futura auditoria em staging, sem executá-la.

---

## 2. Estado atual

| | |
| --- | --- |
| Commit | `28a8636` (`main` = `origin/main`), working tree limpa |
| Migration seletiva | `20260918120033_hr_workflow_idempotency_indexes_parity.sql`, blob `ff9fa111…`, **não aplicada** |
| Veredito da migration seletiva | `GO CONDICIONADO`, com P3, P4 e P5 abertos |
| Ledger de staging | `001`–`065` registradas, **medido** em 2026-09-18 (§1.3 do plano) e **remedido em 2026-10-19** ([`P4_LEDGER_STAGING_2026-10-19.md`](P4_LEDGER_STAGING_2026-10-19.md)) |
| Ledger de produção | `001`–`039`, **relato da auditoria, NÃO medido** (§1.4 do plano) |

> **Atenção.** Todo o backlog de produção deste documento parte de um relato, não de uma medição.
> O primeiro passo da auditoria de produção é **fotografar o ledger** (§5(a) do plano). Se ele não
> terminar em `039`, as faixas abaixo mudam.

---

## 3. Regra de segurança

```text
ledger ausente   ≠  migration não aplicada
objeto parecido  ≠  efeito comprovado
```

O `repair` com status `applied` **não executa nenhum SQL de negócio**. Ele só insere uma linha
em `supabase_migrations.schema_migrations`. Ou seja:

```text
repair applied sobre efeito ausente  =  falso positivo permanente no ledger
```

**Esse é o risco central de P4.** Hoje a ausência é detectável comparando arquivo e banco. Depois
de um `repair` indevido, o ledger diz "aplicada", o próximo `db push` pula a migration, e nenhuma
ferramenta volta a apontar o buraco. Foi assim, por aplicação fora do fluxo, que a `023` ficou 9
índices abaixo do declarado por meses.

As regras que decorrem disso:

1. **Cada migration é avaliada pelos seus efeitos, um a um.** Tabela presente sem a trigger, ou
   policy presente sem o RLS, é **efeito parcial**, não "aplicada".
2. **Nome não é prova.** `create … if not exists` pula pelo nome. Índice, constraint e função
   precisam ter a **definição** conferida.
3. **A última definição vence.** Se uma migration posterior substitui uma função, policy ou
   constraint, o banco mostra a versão posterior. A anterior só pode ser provada indiretamente.
4. **Seed editável não é prova forte.** Linha de catálogo pode ter sido criada ou alterada pela UI.
5. **Ausência de efeito "opcional" não refuta.** Várias migrations criam triggers só se a função
   existir (`to_regprocedure` + `NOTICE`). Essa ausência precisa de leitura humana.

---

## 4. Inventário — medido no repositório

| Grupo | Quantidade | Faixa |
| --- | --- | --- |
| Legadas, convenção `NNN_` | **93** | `001`–`094`, sem `074` |
| Timestamp, `YYYYMMDDHHMMSS_` | **2** | `20260918120033_hr_workflow_idempotency_indexes_parity`, `20261019184500_housekeeping_security_hardening` |
| **Total** | **95** | (94 até 2026-10-19) |
| Legadas `≤ 039` | 39 | |
| Legadas `≤ 065` | 65 | |
| Legadas `040`–`094` | **54** | |
| Legadas `066`–`094` | **28** | |

`074` nunca existiu (§1.2 do plano). Os comentários de `075` e `076` confirmam que o número foi
pulado.

> **Atualização P4-S1 (2026-10-19):** com `20261019184500_housekeeping_security_hardening.sql`
> passam a ser **2** migrations timestamp e **95** arquivos no total. As 93 legadas não mudam (§14.1).

### Inventário do backlog de produção

As 54 legadas de `040` a `094`. **Linhas** é o tamanho do arquivo, comentários incluídos.

| Arquivo | Tipo | Seq. | Linhas | Observação |
| --- | --- | --- | --- | --- |
| `040_hr_job_opening_workflow_mvp` | legada | 040 | 3207 | Substitui a função-motor do workflow RH. **Editada depois** (`29954f9`, BOM) |
| `041_hr_job_candidates_interviews_mvp` | legada | 041 | 186 | |
| `042_hr_interview_scorecards_mvp` | legada | 042 | 309 | |
| `043_hr_candidate_admission_conversion_mvp` | legada | 043 | 83 | |
| `044_hr_admission_workflow_template_seed` | legada | 044 | 102 | Só seed + comment |
| `045_hr_operational_profiles` | legada | 045 | 72 | Só seed |
| `046_hr_document_rules` | legada | 046 | 119 | |
| `047_hr_onboarding_foundation` | legada | 047 | 410 | |
| `048_hr_employee_evaluations_foundation` | legada | 048 | 526 | |
| `049_hr_document_types_hotel_galli_seed` | legada | 049 | 63 | Só seed |
| `050_hr_document_types_hotel_galli_alignment` | legada | 050 | 57 | Só update de dados |
| `051_hr_functional_event_types_expansion` | legada | 051 | 79 | Sobrescrita pela 076 |
| `052_hr_employee_movements_foundation` | legada | 052 | 193 | |
| `053_hr_employee_movement_approvals` | legada | 053 | 45 | |
| `054_hr_trainings_foundation` | legada | 054 | 198 | |
| `055_hr_training_expiration_governance` | legada | 055 | 42 | |
| `056_hr_occupational_health_foundation` | legada | 056 | 193 | |
| `057_hr_occupational_expiration_governance` | legada | 057 | 23 | |
| `058_hr_conduct_records_foundation` | legada | 058 | 87 | **Editada depois** (`29954f9`) |
| `059_hr_conduct_review_governance` | legada | 059 | 53 | **Editada depois** (`29954f9`) |
| `060_hr_terminations_foundation` | legada | 060 | 153 | |
| `061_hr_employee_document_links_foundation` | legada | 061 | 160 | |
| `062_hr_admission_processes_foundation` | legada | 062 | 315 | |
| `063_hr_admission_safe_text_constraint_fix` | legada | 063 | 29 | |
| `064_auth_grants_base_purchases_attachments` | legada | 064 | 172 | No ledger de staging |
| `065_purchase_approval_decision_grants_split` | legada | 065 | 116 | No ledger de staging |
| `066_rls_policies_non_sensitive_foundation` | legada | 066 | 1125 | 119 policies |
| `067_fix_current_auth_user_id_dual_claim` | legada | 067 | 57 | |
| `068_employees_unique_cpf` | legada | 068 | 20 | |
| `069_rls_policies_hr_sensitive_core` | legada | 069 | 341 | 30 policies |
| `070_admin_permissions_catalog` | legada | 070 | 58 | |
| `071_rls_policies_hr_employee_scope` | legada | 071 | 289 | 27 policies |
| `072_rls_policies_hr_recruitment_scope` | legada | 072 | 252 | 21 policies |
| `073_employee_movements_applied_marker` | legada | 073 | 20 | |
| `075_employee_terminations_applied_marker` | legada | 075 | 21 | |
| `076_hr_functional_event_types_nr_expiration` | legada | 076 | 84 | |
| `077_rls_policies_hr_workflow_admission_scope` | legada | 077 | 216 | 23 policies |
| `078_rls_policies_hr_templates_children_system_scope` | legada | 078 | 432 | 31 policies |
| `079_purchase_decision_rpc` | legada | 079 | 196 | **Editada depois** (dia seguinte) |
| `080_purchase_quote_dossier_lock` | legada | 080 | 86 | |
| `081_purchase_submit_snapshot_rpc` | legada | 081 | 234 | |
| `082_purchase_quote_selected_by` | legada | 082 | 28 | |
| `083_purchase_quote_mutation_rpcs` | legada | 083 | 437 | **Editada depois** (mesmo dia) |
| `084_auth_login_attempts` | legada | 084 | 164 | **Editada depois** (mesmo dia, coluna renomeada) |
| `085_app_users_must_change_password` | legada | 085 | 65 | |
| `086_audit_trail_author_from_row` | legada | 086 | 304 | Substitui a função global de auditoria |
| `087_uh_room_types_and_attributes` | legada | 087 | 274 | |
| `088_auth_grants_rooms` | legada | 088 | 180 | |
| `089_room_state_three_dimensions` | legada | 089 | 804 | Backfill + enum→text |
| `090_rooms_transition_stale_errcode` | legada | 090 | 353 | |
| `091_housekeeping_day` | legada | 091 | 945 | |
| `092_housekeeping_day_close` | legada | 092 | 1005 | `alter type … add value` |
| `093_front_desk_occupancy` | legada | 093 | 922 | |
| `094_task_outcome_not_overwritten` | legada | 094 | 749 | |
| `20260918120033_hr_workflow_idempotency_indexes_parity` | **timestamp** | — | — | **FORA da auditoria de `repair`** — §14 |

---

## 5. Backlog por ambiente

```text
STAGING LEDGER — MEDIDO EM 2026-10-19
65 presentes            (001–065, contínuas)
28 legadas ausentes     (066–094, sem 074)
 2 timestamp ausentes   (20260918120033, 20261019184500)
nenhuma entrada só no ledger
65/65 nomes conferidos com o repositório
md5 de statements das 65 registrados (Apêndice A da evidência)
```

Evidência: [`P4_LEDGER_STAGING_2026-10-19.md`](P4_LEDGER_STAGING_2026-10-19.md). A fotografia
**confirma** o backlog legado de 28 e a fila de 30 em staging. **Não classifica** as 28 em A/B/C/D,
e nenhuma classificação deste documento mudou. Produção continua **não medida**.

| Ambiente | Ledger | Backlog legado | Migrations novas | **Fila antes do `repair`** | Fonte |
| --- | --- | --- | --- | --- | --- |
| **Staging** | `001`–`065` | **28** (`066`–`094`) | 2 | **30** | Ledger medido. Contagem medida neste documento |
| **Produção** | `001`–`039` | **54** (`040`–`094`) | 2 | **56** | Ledger **relatado**. Contagem medida neste documento |

**Depois do `repair` das legadas devem restar exatamente 2 pendentes, e devem ser exatamente:**

1. `20260918120033_hr_workflow_idempotency_indexes_parity.sql`
2. `20261019184500_housekeeping_security_hardening.sql`

Uma terceira migration pendente, ou o sumiço de qualquer uma das duas: **PARAR.**

> **Correção factual dos documentos atuais.** O plano, `ACOES_MANUAIS_SUPABASE.md`, o roteiro de
> preflight e o GO/NO-GO falam em **29 / 55 legadas** e **filas de 30 / 56**. **Os números estão
> errados por um:** contaram o `074`, que não existe. Medido no repositório: `066`–`094` são **28**
> arquivos e `040`–`094` são **54**. As filas reais, **naquele momento**, eram **29 / 55**.
>
> **O procedimento não mudou com essa correção.** O critério do §5(e), "exatamente UMA pendente
> depois do `repair`", continuava certo; só as contagens estavam erradas. *(Esse critério mudou
> depois, com a migration de hardening — ver a atualização abaixo.)* **Corrigido em 2026-10-19** nos quatro
> documentos (§15.1).
>
> **Atualização P4-S1 (2026-10-19).** A migration de hardening
> `20261019184500_housekeeping_security_hardening.sql` foi **escrita, testada localmente e
> versionada; não aplicada**. Com ela, são
> **duas** migrations novas deliberadamente fora do `repair`. Os números passam a ser:
>
> | Ambiente | Legadas | Novas | Fila antes do `repair` | Pendentes depois do `repair` |
> | --- | --- | --- | --- | --- |
> | Staging | 28 | 2 | **30** | **2** |
> | Produção | 54 | 2 | **56** | **2** |
>
> O critério deixa de ser "exatamente UMA pendente" e passa a ser **"exatamente as migrations
> novas deliberadamente não reparadas"**. Ver §14 e
> [`P4_S1_HARDENING_GOVERNANCA.md`](P4_S1_HARDENING_GOVERNANCA.md) §8.

### O backlog legado e as migrations novas são problemas opostos

| | Legadas (28 / 54) | Timestamp (2) |
| --- | --- | --- |
| No ledger | **não** | **não** |
| No schema | **a provar**, efeito por efeito | **não**. Os 3 índices faltam em produção; os grants da governança seguem abertos |
| Saída correta | `repair applied`, **somente com efeito comprovado** | **ser executada**, nunca `repair` |

### Recorte por ambiente

- **Staging:** auditar `066`–`094`. `040`–`065` já estão no ledger de staging e saem do escopo
  dele.
- **Produção:** auditar `040`–`094`. As de `040` a `065` **não** têm a prova de staging a seu
  favor: estar no ledger de staging só diz que **staging** recebeu a migration.

---

## 6. Matriz de efeitos

Abaixo, por migration: os efeitos, os riscos e a classe de prova. As **classes de prova** são:

| Classe | Significado |
| --- | --- |
| **DIRETA** | Todos os efeitos relevantes são verificáveis no catálogo ou nos dados atuais, por definição e não só por nome |
| **INDIRETA** | O efeito existe, mas a forma atual pode ter vindo de outra fonte, como versão posterior, UI ou inserção manual |
| **HISTÓRICA** | O estado atual não distingue "rodou" de "não rodou". Precisa de log, backup ou registro externo |
| **INCONCLUSIVA** | Sem evidência externa, não há como decidir |

Os **templates** referenciados estão no §11.

### 6.1 RH: recrutamento e admissão (040–047, 062–063)

| Mig | Efeitos | Destrutivo? | Idempotente? | Alterado depois por | Prova | Templates | Automatizável |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **040** | 4 CHECKs recriados (`hr_workflows_type_check`, `hr_workflows_employee_required_check`, `hr_workflow_templates_type_check`, `hr_workflow_delegations_workflow_type_check`) com `job_opening`. `hr_workflow_apply_action(…)` substituída: o corpo é o da 031 mais `job_opening` em **2 pontos**, conferido por diff. Revoke/grant da função. Comments. Seed `JOB_OPENING_MVP` com 6 etapas, uma por organização existente na época | Parcial: substitui a função-motor e recria CHECKs | Sim | 044 sobrescreve um comment. Nenhuma redefinição da função ou dos CHECKs | **DIRETA**: `job_opening` nos 4 `pg_get_constraintdef` e nos 2 pontos do `prosrc`. O seed é só apoio | CONSTRAINT, FUNCTION, GRANT, SEED | Sim |
| **041** | 2 tabelas (`hr_job_candidates`, `hr_candidate_interviews`), 14 índices, ~10 CHECKs, FKs. Triggers `set_updated_at_*` e `audit_*`, **condicionais**. RLS habilitado, sem policy | Não | Sim | 072 (policies). 086 troca a função de auditoria, mas o trigger continua válido | **DIRETA** | TABLE, COLUMN, INDEX, CONSTRAINT, TRIGGER, RLS | Sim |
| **042** | 4 tabelas de scorecard, 16 índices (4 UNIQUE parciais, 1 de expressão), ~18 CHECKs, triggers condicionais, RLS. **Seed:** 6 templates (`metadata.source='rh_9_2d'`) e 32 perguntas | Não | Sim | 072 e 078 (policies) | **DIRETA** no schema. O seed é apoio | TABLE, COLUMN, INDEX, CONSTRAINT, TRIGGER, SEED | Sim |
| **043** | `hr_candidate_admission_conversions`, 5 índices (2 UNIQUE parciais), CHECKs, triggers condicionais, RLS | Não | Sim | 072 | **DIRETA** | TABLE, COLUMN, INDEX, CONSTRAINT, TRIGGER | Sim |
| **044** | **Só dados:** seed `ADMISSION_MVP` (5 etapas, `metadata.source='rh_9_2e_hotfix'`), uma linha por organização existente na época. Comment em `hr_workflow_templates.workflow_type` | Não | Sim | — | **INDIRETA**: o comment com o texto da 044 é a melhor marca. Seed ausente **não** prova que não rodou, porque pode ter sido editado ou soft-deleted | SEED, OTHER (comment) | Sim, com ressalva |
| **045** | **Só dados:** 3 `access_profiles` (`HR_OPERATOR`, `HR_SUPERVISOR`, `HR_SENSITIVE_VIEWER`) e 10 `profile_permissions`. Upsert **reativa e sobrescreve** | **Sim**: desfaz revogações manuais | Sim, mas reaplicar não é neutro | Nenhuma migration. A UI de perfis (070) pode ter mudado | **INDIRETA**: catálogo editável e sem marca de origem | SEED | Parcial |
| **046** | `hr_document_rules`, 10 índices (1 UNIQUE de expressão parcial), 8 CHECKs, triggers condicionais, RLS | Não | Sim | 078 (policies e RLS defensivo) | **DIRETA** | TABLE, COLUMN, INDEX, CONSTRAINT, TRIGGER | Sim |
| **047** | 4 tabelas de onboarding, **45 índices** (2 UNIQUE parciais/expressão), **35 CHECKs**, triggers condicionais, RLS | Não | Sim | 071, 078 (policies) | **DIRETA** | TABLE, COLUMN, INDEX, CONSTRAINT, TRIGGER | Sim |
| **062** | 2 tabelas de admissão, 26 índices (3 UNIQUE parciais), 30 CHECKs, triggers condicionais, RLS | Não | Sim | **063** recria as 2 `*_text_safe_check`. 077 (policies) | **DIRETA**, exceto as 2 `text_safe_check`, que hoje refletem a 063 | TABLE, COLUMN, INDEX, CONSTRAINT, TRIGGER | Sim |
| **063** | Recria `hr_admission_processes_text_safe_check` e `hr_admission_checklist_items_text_safe_check` (regex por token, CPF, pix) | Troca constraint. Falha se houver dado violando | Sim | — | **DIRETA**: `[^[:alnum:]_]` e `pix` na definição | CONSTRAINT | Sim |

### 6.2 RH: documentos, colaborador, treinamento e SST (048–061, 068, 073, 075, 076)

| Mig | Efeitos | Destrutivo? | Idempotente? | Alterado depois por | Prova | Templates | Automatizável |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **048** | 7 tabelas de avaliação/PDI, **55 índices** (5 UNIQUE parciais/expressão), **63 CHECKs**, triggers condicionais, RLS. **Seed:** 5 permissões `HR:evaluations.*`/`development.manage` e grant ao `SUPER_ADMIN`, por upsert | Parcial (upsert reativa) | Sim | 069, 071, 078 (policies) | **DIRETA** no schema, **INDIRETA** no grant | TABLE, COLUMN, INDEX, CONSTRAINT, TRIGGER, SEED, GRANT | Sim |
| **049** | **Só dados:** 26 `hr_document_types` (`NOT EXISTS` por `upper(code)`) | Não | Sim | 050 | **INDIRETA**: as linhas podem ter sido inseridas à mão. `created_at` agrupado ajuda | SEED | Sim |
| **050** | **Só dados:** `UPDATE` condicional de `category`/`is_required` em 34 tipos | Sim (update condicional) | Sim | — | **INCONCLUSIVA**: contra a 021 e a 049 commitadas ela é no-op, e o estado final é o mesmo tendo rodado ou não | SEED (só consistência) | Parcial |
| **051** | Recria `employee_functional_events_type_check` (67 valores) | Troca constraint | Sim | **076** recria a mesma constraint | **HISTÓRICA**: o banco mostra a 076, e os valores da 051 só aparecem como subconjunto | CONSTRAINT (indireto) | Parcial |
| **052** | `employee_movements`, 11 índices, **13 FKs com nome explícito**, 9 CHECKs, triggers condicionais, RLS. Seed de 4 permissões `HR:movements.*` e grant `SUPER_ADMIN` | Parcial (upsert) | Sim | 071 (policies), 073 (coluna e índice) | **DIRETA** | TABLE, COLUMN, INDEX, CONSTRAINT, TRIGGER, SEED, GRANT | Sim |
| **053** | `employee_movement_approvals`, 4 índices, 2 CHECKs, trigger `audit_*` condicional, RLS | Não | Sim | 071 | **DIRETA** | TABLE, COLUMN, INDEX, CONSTRAINT, TRIGGER | Sim |
| **054** | `hr_trainings` e `employee_trainings`, 16 índices, 10 CHECKs, triggers condicionais, RLS. Seed de 5 permissões `HR:trainings.*` e grant `SUPER_ADMIN` | Parcial (upsert) | Sim | **055** recria `employee_trainings_status_check`. 071, 078 | **DIRETA**, exceto `employee_trainings_status_check` (reflete a 055) | TABLE, COLUMN, INDEX, CONSTRAINT, TRIGGER, SEED, GRANT | Sim |
| **055** | Recria `employee_trainings_status_check` (+`retraining_required`) e `hr_background_jobs_type_check` (+`training_expiration_scan`). `COMMENT ON CONSTRAINT` | Troca constraints | Sim | **057** recria `hr_background_jobs_type_check` | **DIRETA** na parte de trainings (valor + comment "RH-19.2"). **INDIRETA** em `hr_background_jobs` | CONSTRAINT, OTHER (comment) | Sim |
| **056** | 2 tabelas de SST (ASO, NR), 14 índices, 8 CHECKs (regex), triggers condicionais, RLS. Seed de 4 permissões `HR:occupational.*` e grant `SUPER_ADMIN` | Parcial (upsert) | Sim | 069 | **DIRETA** | TABLE, COLUMN, INDEX, CONSTRAINT, TRIGGER, SEED, GRANT | Sim |
| **057** | Recria `hr_background_jobs_type_check` (8 valores, + `occupational_expiration_scan`), com comment | Troca constraint | Sim | — | **DIRETA** | CONSTRAINT, OTHER (comment) | Sim |
| **058** | `employee_conduct_records`, 3 índices parciais, 7 CHECKs, RLS. Trigger **condicional a `public.set_updated_at()`, função que não existe em nenhuma migration**, então o esperado é **ausente**. Seed de 3 permissões (`DO NOTHING`), sem grant | Não | Sim | 059 (status_check, default), 069 | **HISTÓRICA**: ver §13 | TABLE, COLUMN, INDEX, CONSTRAINT, SEED, TRIGGER (ausência) | Parcial |
| **059** | `employee_conduct_reviews` (FK cascade), 1 índice, 2 CHECKs, RLS. Recria `employee_conduct_records_status_check`, muda default para `draft`. **`UPDATE` em massa** de status (`active`/`resolved`/`archived` → `reviewed`). Permissão `HR:conduct.review` | **Sim**: perde o status original | Sim | 069 | **HISTÓRICA**: ver §13 | TABLE, COLUMN, INDEX, CONSTRAINT, SEED, OTHER (default) | Parcial |
| **060** | `employee_terminations` e `employee_termination_checklists` (FK cascade), 4 índices, 9 CHECKs, triggers `set_updated_at` condicionais, RLS. Seed de 4 permissões `HR:terminations.*` e grant `SUPER_ADMIN` | Parcial (upsert) | Sim | 069, 075 | **DIRETA** | TABLE, COLUMN, INDEX, CONSTRAINT, TRIGGER, SEED, GRANT | Sim |
| **061** | `employee_document_links` (29 colunas), 9 índices (1 UNIQUE parcial), 9 CHECKs, trigger condicional, RLS | Não | Sim | 069 | **DIRETA** | TABLE, COLUMN, INDEX, CONSTRAINT, TRIGGER | Sim |
| **068** | Índice `employees_org_cpf_normalized_active_unique`: UNIQUE, expressão `regexp_replace`, parcial | Não. **Falha se houver CPF duplicado** | Só pelo nome | — | **DIRETA** por `indexdef` completo, não por nome | INDEX | Sim |
| **073** | `employee_movements.movement_applied_at` + índice parcial `employee_movements_pending_apply_idx` + comment "RH-E-01" | Não | Só pelo nome | — | **DIRETA** | COLUMN, INDEX, OTHER (comment) | Sim |
| **075** | `employee_terminations.applied_at` + índice parcial `employee_terminations_pending_apply_idx` + comment "RH-E-05" | Não | Sim | — | **DIRETA** | COLUMN, INDEX, OTHER (comment) | Sim |
| **076** | Recria `employee_functional_events_type_check` (+`nr_expiring`, `nr_expired`; 69 valores) | Troca constraint | Sim | — | **DIRETA**: os dois valores novos são exclusivos dela | CONSTRAINT | Sim |

### 6.3 Autenticação, permissões e auditoria (045 está em 6.1; 064, 065, 067, 070, 084, 085, 086, 088)

| Mig | Efeitos | Destrutivo? | Idempotente? | Alterado depois por | Prova | Templates | Automatizável |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **064** | **Só dados:** 15 permissões BASE/PURCHASES/ATTACHMENTS, perfil `COMPRAS`, ~95 pares em `profile_permissions`. Upsert **reativa e sobrescreve** | Leve (reativa) | Sim, **mas não na ordem**: rodar depois da 065 **reativa** `approvals.decide` | **065** desativa os grants de `PURCHASES:approvals.decide` | **DIRETA**, com ressalva: os grants de `approvals.decide` aparecem **inativos** | SEED, GRANT | Sim |
| **065** | **Só dados:** 2 permissões (`decide.administrative`, `decide.directorate`), 5 grants, **`UPDATE` soft-delete** de todo grant de `approvals.decide` | **Sim** | Sim | — | **DIRETA**: as 2 permissões existem, os 5 grants estão ativos e **nenhum** `approvals.decide` está ativo | SEED, GRANT | Sim |
| **067** | Substitui `public.current_auth_user_id()` (claim antigo e novo, regex). Comment "Substitui a versao da 009" | **Sim**: muda a identidade de **todo** o RLS | Sim | — | **DIRETA**: `prosrc` com `request.jwt.claims` e o CTE `candidato` | FUNCTION | Sim |
| **070** | **Só dados:** 3 permissões `ADMIN:*` (nomes acentuados) e 3 grants `SUPER_ADMIN` | Leve | Sim | — | **DIRETA** | SEED, GRANT | Sim |
| **084** | `auth_login_attempts` (5 colunas), 2 índices compostos, RLS sem policy (deny-all), `revoke all` de anon/authenticated | Não | **Parcial**: a 1ª versão do arquivo (`d23a1ac`) tinha a coluna `username`, renomeada para `username_attempted` em `eb1d778` no mesmo dia. `create table if not exists` **não corrige** uma tabela da 1ª versão | — | **DIRETA**: exigir `username_attempted`, **ausência** de `username`, 2 `indexdef`, `relrowsecurity`, 0 policies, `has_table_privilege` falso | TABLE, COLUMN, INDEX, POLICY (ausência), GRANT | Sim |
| **085** | `app_users.must_change_password boolean not null default false` + comment | Não | Sim | — | **DIRETA**. Indício forte: o login atual exige a coluna | COLUMN, OTHER (comment) | Sim |
| **086** | Cria `public.safe_uuid(text)` (invoker, sem `search_path`). **Substitui `public.write_audit_trail()`**, a função global de auditoria da 008 | **Sim**: troca o corpo da auditoria de todas as tabelas | Sim | — | **DIRETA**: `safe_uuid` existe e o `prosrc` contém `safe_uuid(new_json->>'created_by')` | FUNCTION, OTHER (comment) | Sim |
| **088** | **Só dados:** permissões `BASE:rooms.view/block/manage` (upsert, reativa) e 13 grants (`DO NOTHING`) | Parcial | Sim | 089, 093 acrescentam grants | **DIRETA** nas 3 permissões, **INDIRETA** nos 13 grants (UI) | SEED, GRANT | Sim |

### 6.4 RLS (066, 069, 071, 072, 077, 078)

Nenhuma migration anterior a 066 cria policy. Nenhuma posterior remove ou recria as policies destas
seis. **Cada nome de policy aparece numa única migration.** Isso torna a prova direta e
automatizável. **Todas as policies são `to authenticated`, sem `DELETE` e sem `anon`.**

| Mig | Policies | Tabelas | Padrão | Depende (backlog) | Prova | Automatizável |
| --- | --- | --- | --- | --- | --- | --- |
| **066** | **119** | 51 | `*_by_unit` (90), `units_*_by_own_unit` (3), `*_select_catalog` (10), `*_select_self` (4), `*_by_parent_unit` (6), itens `*_by_unit` (9), `approval_flows_*_scoped` (1), `audit_trail_no_direct_access` / `system_logs_no_direct_access` (`FOR ALL`, `false`) | — (001–019, 009) | **DIRETA** | Sim |
| **069** | **30** | 10 | `*_by_unit` (7 tabelas), `*_by_parent_unit` (3) | 048, 056, 058, 059, 060, 061 | **DIRETA** | Sim |
| **071** | **27** | 9 | `*_by_unit` (7), `*_by_parent_unit` (2) | 047, 048, 052, 053, 054 | **DIRETA** | Sim |
| **072** | **21** | 7 | `*_by_unit`; os templates aceitam `unit_id is null` no select | 041, 042, 043 | **DIRETA**: conferir o `qual` dos templates | Sim |
| **077** | **23** | 8 | `*_by_unit`; `audit_logs` só select/insert. RLS defensivo | 062 (+ 022, 033, 035, 038) | **DIRETA** | Sim |
| **078** | **31** | 12 | `*_by_unit` (6×3), `*_by_parent` (4×3, `criteria` com 2 níveis), `hr_background_jobs` só select. **`hr_workflow_idempotency_keys` com ZERO policies, por design** | 046, 047, 048, 054 (+ 021, 023, 037, 039) | **DIRETA** nas 31. A "zero policies" não distingue aplicada de não aplicada | Sim |

**RLS ligado não prova nenhuma destas.** O `enable row level security` vem das migrations que
criam as tabelas, e 077/078 o reaplicam de forma defensiva. A prova é a **policy**: nome, `cmd`,
`roles`, `permissive`, `qual` e `with_check`.

### 6.5 Compras (079–083)

| Mig | Efeitos | Destrutivo? | Idempotente? | Alterado depois por | Prova | Templates | Automatizável |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **079** | `purchase_apply_approval_decision(10 args)` returns table, definer, `search_path=public`. Revoke de public/anon/authenticated, grant `service_role` | Não | Sim | — | **DIRETA pelo corpo, não pelo nome**. A 1ª versão do arquivo (antes de `87c78b0`) não tinha o cast `::public.purchase_request_status` e gravava decisão incondicionalmente. Exigir `if p_decision in ('approved', 'rejected')` e o cast no `prosrc` | FUNCTION, GRANT | Sim |
| **080** | `purchase_quote_in_active_dossier(uuid)` e `enforce_purchase_quote_dossier_lock()`, ambas definer. Trigger `purchase_quote_dossier_lock` BEFORE UPDATE OR DELETE em `purchase_quotes`. **Sem revoke**: a 1ª função fica executável por PUBLIC | Não | Sim | — | **DIRETA** | FUNCTION, TRIGGER, GRANT | Sim |
| **081** | `purchase_submit_approval_snapshot(26 args)`, definer, revoke/grant | Não | Sim | — | **DIRETA** pela assinatura exata | FUNCTION, GRANT | Sim |
| **082** | `purchase_quotes.selected_by` (FK `app_users`, `on delete set null`) e `selected_at` + comments | Não | Sim, mas coluna pré-existente sem FK **não ganha** a FK | 083 depende **duramente** dela | **DIRETA**: coluna e FK com `confdeltype='n'` | COLUMN, CONSTRAINT, OTHER (comment) | Sim |
| **083** | 5 funções definer (`purchase_apply_request_patch`, `purchase_insert_request_events`, `purchase_set_quote_selection`, `purchase_save_quote_values`, `purchase_cancel_quote`), revoke/grant em loop | Não (a função apaga itens em runtime) | Sim | — | **DIRETA pelo corpo**. A 1ª versão (antes de `96abe4a`) não tinha o cast em `purchase_insert_request_events` e falha com 42804. Exigir `e.from_status::public.purchase_request_status` | FUNCTION, GRANT | Sim |

### 6.6 Quartos/UH, governança e recepção (087, 089–094)

**`rooms_apply_transition(jsonb, text, text, uuid)` é definida SEIS vezes: 089, 090, 091, 092, 093
e 094.** Hoje, se tudo rodou, o banco tem o corpo da **094**. O texto do `comment on function` muda a
cada versão e serve de impressão digital:

| Versão | Mudança no corpo | Marca no comment |
| --- | --- | --- |
| 089 | Corpo original | "(plano 70, §6.2)…" |
| 090 | errcode do STALE: 40001 → 22023 | idem 089 |
| 091 | occurred_at, trava de lote em `inspected`, efeitos na tarefa | "(planos 70 §6.2, 74 e 75)" |
| 092 | `detail` jsonb no STALE | "(…74, 75 e 77)" |
| 093 | Remove NO_WRITER, adiciona as formas de ocupação e o ramo `occupancy` | "(…77 e 78)" |
| 094 | `inspected` só sobre `outcome in ('pending','not_done')` | "(…77, 78 e 80)" |

| Mig | Efeitos | Destrutivo? | Idempotente? | Alterado depois por | Prova | Templates | Automatizável |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **087** | `room_types` (4 índices, UNIQUE `unit_id,code`, 6 CHECKs, FK), triggers condicionais, RLS com 3 policies `room_types_authenticated_*_by_unit`. `rooms` ganha 5 colunas, CHECK `rooms_climate_control_check` e 2 FKs | Não | Sim | — | **DIRETA** | TABLE, COLUMN, INDEX, CONSTRAINT, TRIGGER, POLICY | Sim |
| **089** | 3 ENUMs (`occupancy_status`, `housekeeping_status`, `blocking_status`). `rooms` ganha 4 colunas. `room_status_history`: **enum `room_status` → `text`** em 2 colunas, `dimension`, FK `housekeeping_employee_id`. 3 índices, 2 CHECKs (guarda só por `conname`). RPC v1. Perfis `LIDER_GOVERNANCA` e `LIDER_MANUTENCAO`, permissões `housekeeping`/`inspect`, 10 grants. **BACKFILL de `rooms`** (só se o histórico estiver vazio). `UPDATE` de `dimension` | **Sim**: backfill sobrescreve, troca de tipo irreversível, upserts | Parcial: o backfill roda de novo enquanto o histórico estiver vazio | 090–094 substituem a RPC | **DIRETA** em ENUM/coluna/tipo/CHECK/índice/seed/ACL. **INDIRETA** no corpo da RPC (cadeia até a 094). **HISTÓRICA** no backfill | ENUM, COLUMN, INDEX, CONSTRAINT, FUNCTION, GRANT, SEED | Parcial |
| **090** | Só a RPC (errcode 22023), revoke/grant reemitidos | Não | Sim | 091–094 | **INDIRETA**: nenhum artefato exclusivo. O `22023` e a ausência de `40001` no corpo atual vêm da cadeia | FUNCTION (texto), GRANT | Sim |
| **091** | `housekeeping_days`, `housekeeping_tasks`. 3 ENUMs. 4 índices. 7 CHECKs + 2 UNIQUE. `housekeeping_service_date` (exclusiva), `housekeeping_open_day` v1, RPC v3. **`drop function` da sobrecarga de 5 argumentos.** Revoke/grant das 3 funções. **SEM RLS, SEM policy, SEM revoke de tabela** (§13) | Pontual (drop da sobrecarga) | Sim | 092 (open_day, enum, colunas), 093/094 (RPC) | **DIRETA** em tabelas, enums, constraints, índices, `service_date`, comment do `open_day` e **ausência** da sobrecarga. **INDIRETA** nos corpos de open_day e RPC | TABLE, ENUM, CONSTRAINT, INDEX, FUNCTION, GRANT, OTHER | Sim |
| **092** | `housekeeping_day_events`, `housekeeping_tasks` + 2 colunas e 1 CHECK. **`alter type housekeeping_task_outcome add value 'not_done'`** (sem rollback, roda fora de bloco). Novo ENUM `housekeeping_day_event`. `housekeeping_close_day` e `housekeeping_reopen_day` (exclusivas), `open_day` final, RPC v4. **SEM RLS** em `housekeeping_day_events` | Não | Sim, com ressalva operacional | 093/094 (RPC) | **DIRETA** | ENUM, TABLE, COLUMN, CONSTRAINT, INDEX, FUNCTION, GRANT | Sim |
| **093** | RPC v5. Perfil `RECEPCAO`, permissão `BASE:rooms.occupancy` e 5 grants | Parcial (upsert) | Sim | 094 (RPC) | **DIRETA** em perfil, permissão e grants. **INDIRETA** na RPC (`CHECKOUT_REQUIRES_DIRTY` no corpo da 094) | SEED, GRANT, FUNCTION (texto) | Sim |
| **094** | RPC final | Não | Sim | — | **DIRETA**: `md5(prosrc)` contra o corpo do arquivo, ou filtro `not_done` no `inspected` + comment "(…77, 78 e 80)" | FUNCTION, GRANT, OTHER (comment) | Sim |

### 6.7 Resumo por classe de prova

| Classe | Migrations |
| --- | --- |
| **DIRETA** (em todos os efeitos relevantes) | 040, 041, 042, 043, 046, 047, 052, 053, 056, 057, 060, 061, 063, 065, 066, 067, 068, 069, 070, 071, 072, 073, 075, 076, 077, 078, 079\*, 080, 081, 082, 083\*, 084\*, 085, 086, 087, 091, 092, 094 |
| **DIRETA com parte indireta** | 048 (grant), 054 (1 CHECK), 055 (1 CHECK), 062 (2 CHECKs), 064 (decide inativo), 088 (grants), 093 (RPC) |
| **INDIRETA** | 044, 045, 049, 090 |
| **HISTÓRICA** em pelo menos um efeito | 051, 058, 059, 089 (backfill) |
| **INCONCLUSIVA** | 050 |

\* Prova **pelo corpo ou pela coluna exata**: o nome sozinho aceitaria a versão anterior do arquivo
(§13).

---

## 7. Dependências

Apenas dependências **dentro do backlog** (`040`–`094`). As dependências de `001`–`039` estão no
ledger de produção, segundo o relato.

| Migration | Depende de (backlog) | É dependência de |
| --- | --- | --- |
| 040 | — | 044 |
| 041 | 040 (conceito `job_opening`) | 042, 043, 062, 072 |
| 042 | 041 | 072, 078 |
| 043 | 041 | 072 |
| 044 | 040 | — |
| 045 | — | — |
| 046 | — | 078 |
| 047 | — | 071, 078 |
| 048 | — | 069, 071, 078 |
| 049 | — | 050 |
| 050 | 049 | — |
| 051 | — | 076 |
| 052 | — | 053, 071, 073 |
| 053 | 052 | 071 |
| 054 | — | 055, 071, 078 |
| 055 | 054 | 057 |
| 056 | — | 069 |
| 057 | 055 | — |
| 058 | — | 059, 069 |
| 059 | 058 | 069 |
| 060 | — | 069, 075 |
| 061 | — | 069 |
| 062 | 041 | 063, 077 |
| 063 | 062 | — |
| 064 | — | 065 |
| 065 | 064 | — |
| 066 | — | — (067 muda o comportamento dela) |
| 067 | — | **funcionalmente** todas as policies (066, 069, 071, 072, 077, 078, 087) |
| 068 | — | — |
| 069 | 048, 056, 058, 059, 060, 061 | — |
| 070 | — | — |
| 071 | 047, 048, 052, 053, 054 | — |
| 072 | 041, 042, 043 | — |
| 073 | 052 | — |
| 075 | 060 | — |
| 076 | 051 | — |
| 077 | 062 | — |
| 078 | 046, 047, 048, 054 | — |
| 079 | — | — |
| 080 | — | 083 |
| 081 | — | — |
| 082 | — | **083 (dura: 083 falha em runtime sem 082)** |
| 083 | 080, 082 | — |
| 084 | — | — |
| 085 | — | — |
| 086 | — | (os triggers `audit_*` de 041–062, 087 usam a função) |
| 087 | — | — |
| 088 | — | 089, 093 |
| 089 | 088 | 090, 091, 092, 093, 094 |
| 090 | 089 | 091 |
| 091 | 089, 090 | 092, 093, 094 |
| 092 | 091 | 093, 094 |
| 093 | 088, 089, 091, 092 | 094 |
| 094 | 091, 092, 093 | — |

### Cadeias principais

```text
Recrutamento → admissão:   040 → 041 → {042, 043} → 062 → 063 → 077 (RLS)
                                  └→ 072 (RLS)
Colaborador:               052 → 053 → 071 (RLS);  052 → 073
                           060 → 075;  {048, 056, 058→059, 060, 061} → 069 (RLS)
Treinamento/SST:           054 → 055 → 057;  051 → 076
Templates:                 {046, 047, 048, 054} → 078 (RLS)
Permissões de compras:     064 → 065       (ORDEM IMPORTA: 064 depois de 065 reativa decide)
Compras:                   {080, 082} → 083
Quartos/governança:        088 → 089 → 090 → 091 → 092 → 093 → 094   (cadeia rígida)
```

### Regra de bloqueio

**Uma migration não pode receber `repair applied` se uma dependência dela for classificada B ou C**
(§9). Exemplos:

- 069 não pode ser reparada se 058 ou 059 forem C ou D, porque as policies estariam sobre uma
  tabela de origem incerta.
- 094 comprovada **não** prova a 093 inteira. Ela prova o corpo da RPC, mas o perfil `RECEPCAO` e a
  permissão `occupancy` da 093 precisam de prova própria.

---

## 8. Grupos

| Grupo | Qtd | Migrations | Dificuldade de prova | Risco de `repair` |
| --- | --- | --- | --- | --- |
| RH recrutamento / workflow | 3 | 040–042 | Baixa: CHECKs e `prosrc` com `job_opening`, tabelas exclusivas | **Médio**: 040 é o motor do workflow inteiro |
| RH admissão / onboarding | 5 | 043, 044, 047, 062, 063 | Baixa, exceto 044 (só seed + comment) | Baixo |
| RH documentos | 4 | 046, 049, 050, 061 | Baixa (046, 061). Seeds 049/050 sem prova forte | Médio (050 inconclusiva) |
| RH colaborador (movimentação, desligamento, conduta, avaliação, vida funcional, CPF) | 10 | 048, 051, 052, 053, 058, 059, 060, 068, 073, 075 | **Alta em 051, 058, 059**. Baixa no resto | **Alto em 058/059** |
| RH treinamento | 2 | 054, 055 | Baixa | Baixo |
| RH SST | 3 | 056, 057, 076 | Baixa | Baixo |
| Auth / permissões | 8 | 045, 064, 065, 067, 070, 084, 085, 088 | Média: catálogo editável pela UI; 084 tem versão anterior | **Alto em 064/065 (ordem) e 067 (identidade do RLS)** |
| RLS | 6 | 066, 069, 071, 072, 077, 078 | Baixa: 251 policies com nome único, comparação mecânica | Médio: dependem das tabelas de 041–062 |
| Compras | 5 | 079–083 | Baixa **se** comparar o corpo. Alta se só pelo nome | Médio (079 e 083 têm versão anterior) |
| Auditoria | 1 | 086 | Baixa | Médio: função global |
| Quartos / UH | 3 | 087, 089, 090 | Média: 089 tem backfill histórico; 090 só indireta | **Alto em 089** |
| Governança | 3 | 091, 092, 094 | Baixa (catálogo) | Médio: §13, tabelas sem RLS |
| Recepção | 1 | 093 | Média: RPC indireta, seed direto | Médio |
| **Total** | **54** | | | |

---

## 9. Critérios de classificação

| Classe | Definição | Ação |
| --- | --- | --- |
| **A — EFEITO COMPROVADO** | **Todos** os efeitos relevantes existem, com a definição conferida pelo template, e nenhuma dependência é B ou C | **Candidata** a `repair applied`. Ainda exige revisão humana antes de executar |
| **B — EFEITO AUSENTE** | O efeito principal não existe | **NÃO repair.** A migration precisa ser aplicada ou tratada separadamente |
| **C — EFEITO PARCIAL** | Alguns efeitos existem, outros não ou divergem: outra definição, versão anterior do arquivo | **PARAR. NÃO repair.** Plano específico para essa migration |
| **D — INCONCLUSIVO** | O estado atual não permite decidir | **PARAR.** Buscar log, backup ou outra evidência |

### Regras de desempate

- **Prova INDIRETA leva a D, não a A**, a não ser que exista decisão humana registrada aceitando a
  evidência indireta para aquela migration, com justificativa.
- **Efeito HISTÓRICO** (backfill, update em massa) **não impede A** quando o restante da migration
  é DIRETO, desde que o efeito histórico seja **declarado** como não verificável na decisão.
  Ele não pode ser "provado" por omissão.
- **Ausência de trigger condicional** só vira C se a função da qual ela depende **existir** no
  banco. Se a função não existir, a ausência é o comportamento esperado do arquivo.
- **Seed ausente não é B** quando a migration é só de seed com `NOT EXISTS`/`DO NOTHING` e há sinal
  de edição posterior. Nesse caso é D.
- **Versão anterior do arquivo detectada** (corpo antigo em 079/083, coluna `username` em 084) é
  **C**, nunca A.

### 9.1 Classificações medidas em STAGING

| Migration | Classificação | Data | Evidência |
| --- | --- | --- | --- |
| `066_rls_policies_non_sensitive_foundation` | **A** | 2026-10-22 | [`P4_STAGING_EFEITOS_LOTE_03_RLS_2026-10-22.md`](P4_STAGING_EFEITOS_LOTE_03_RLS_2026-10-22.md) |
| `068_employees_unique_cpf` | **A** | 2026-10-20 | [`P4_STAGING_EFEITOS_LOTE_01_2026-10-20.md`](P4_STAGING_EFEITOS_LOTE_01_2026-10-20.md) |
| `069_rls_policies_hr_sensitive_core` | **A** | 2026-10-22 | Lote 03 |
| `071_rls_policies_hr_employee_scope` | **A** | 2026-10-22 | Lote 03 |
| `072_rls_policies_hr_recruitment_scope` | **A** | 2026-10-22 | Lote 03 |
| `073_employee_movements_applied_marker` | **A** | 2026-10-20 | Lote 01 |
| `075_employee_terminations_applied_marker` | **A** | 2026-10-20 | Lote 01 |
| `076_hr_functional_event_types_nr_expiration` | **A** | 2026-10-20 | [`P4_STAGING_EFEITOS_LOTE_02_2026-10-20.md`](P4_STAGING_EFEITOS_LOTE_02_2026-10-20.md) |
| `077_rls_policies_hr_workflow_admission_scope` | **A** | 2026-10-22 | Lote 03 (policies **e** RLS de 8 tabelas) |
| `078_rls_policies_hr_templates_children_system_scope` | **A** | 2026-10-22 | Lote 03 (policies **e** RLS de 12 tabelas) |
| `082_purchase_quote_selected_by` | **A** | 2026-10-20 | Lote 02 |
| `085_app_users_must_change_password` | **A** | 2026-10-20 | Lote 01 |
| `086_audit_trail_author_from_row` | **A** | 2026-10-20 | Lote 02 |
| `088_auth_grants_rooms` | **A** | 2026-10-20 | Lote 02 |

**14 de 28 comprovadas.** As outras **14** ausentes do ledger de staging continuam **não
classificadas**.

> **Método para policies (do Lote 03):** fingerprint canônico
> `md5(tabela|nome|permissive|roles|cmd|qual|with_check)`, comparando `pg_policies` com
> `pg_policies`. A referência veio de PostgreSQL 17 local com as migrations reais aplicadas em
> ordem. A normalização é idêntica nas duas pontas: sem CR, espaço colapsado, roles ordenadas, NULL
> estável. O comparador foi validado com divergências artificiais antes do uso. Nove nomes de policy
> (3 na 069, 3 na 071, 3 na 072) são **truncados a 63 bytes** pelo PostgreSQL. O nome truncado é o
> estado real e continua único.

> **ACHADO PENDENTE — `P4-084`: INVESTIGAÇÃO DE MIGRATION VERSIONADA NÃO REPRODUZÍVEL.** O arquivo
> versionado `084_auth_login_attempts.sql` aparentemente **não executa**: um `\n` num comentário de
> exemplo `curl` virou quebra de linha real, e a linha 84 começa com `"` fora do comentário (`psql`:
> erro de sintaxe; o defeito existe igual no blob do Git). **Não corrigido e não editado.**
> Bloqueante para a classificação da `084`. Ver
> [`P4_STAGING_EFEITOS_LOTE_03_RLS_2026-10-22.md`](P4_STAGING_EFEITOS_LOTE_03_RLS_2026-10-22.md) §7.

> **Método para funções (do Lote 02):** comparar o MD5 do corpo **sem `\r`**
> (`md5(replace(prosrc, chr(13), ''))`). A 086 foi aplicada em staging a partir de um arquivo com
> CRLF, e o MD5 bruto divergiria sem diferença lógica.

> **A não autoriza `repair`.** As 4 continuam **ausentes do ledger de staging**. A decisão de
> `repair` só vem depois da auditoria das 28 e da revisão das dependências (§7). Estas
> classificações valem **só para staging**: produção não foi medida.

---

## 10. Plano da auditoria em staging

**Escopo em staging: `066`–`094` (28).** `040`–`065` já estão no ledger de staging.

**Nada abaixo foi executado.** É a ordem recomendada para quando houver autorização.

### Pré-condições

1. Autorização explícita para cada leitura remota. A CLI escreve (`Initialising login role`), então
   preferir o SQL Editor com consulta de leitura pura.
2. Fotografar o ledger de staging **antes** de qualquer outra coisa e arquivar.
3. Registrar o commit e o blob de cada arquivo usado como referência.

### Ordem

| Etapa | Critério | Migrations (staging) |
| --- | --- | --- |
| 1 | Simples e fáceis de provar: uma coluna, um índice, uma constraint | 068, 073, 075, 076, 082, 085 |
| 2 | Estruturais: tabelas novas, enums, constraints | 084, 087, 091 (estrutura), 092 (estrutura) |
| 3 | Funções / RPCs, comparando corpo | 067, 079, 080, 081, 083, 086, 094 → 093 → 092 → 091 → 090 → 089 (do final para trás na cadeia) |
| 4 | RLS / policies | 066, 069, 071, 072, 077, 078, 087 (policies) |
| 5 | Seeds / dados de catálogo | 070, 088, 089 (perfis e permissões), 093 (perfil e permissão) |
| 6 | Efeitos modificados depois ou históricos | 089 (backfill, enum→text), 090 (sem artefato próprio) |

**Em produção**, a mesma ordem se aplica a `066`–`094`, **precedida** das 26 de `040`–`065`:

```text
1. simples:               057, 063
2. estruturais:           041, 042, 043, 046, 047, 048, 052, 053, 054, 056, 060, 061, 062
3. funções:               040
4. constraint recriada:   055
5. seeds:                 044, 045, 049, 064, 065
6. alto risco:            050, 051, 058, 059  → classificação D esperada; decisão humana
```

**A ordem de produção começa pelas dependências.** As policies de 069, 071, 072, 077 e 078 só
podem ser A se as tabelas de 041–062 forem A primeiro (§7).

---

## 11. Templates de prova

Todos são **leitura pura** e ficam como **modelo**: os parâmetros entre `<>` são preenchidos por
migration. **Nenhum foi executado.**

**Ao comparar texto de catálogo, normalizar.** `pg_get_constraintdef`, `pg_get_expr` e
`pg_get_indexdef` reescrevem a expressão (casts, parênteses, espaços). Comparar contra a forma que
o PostgreSQL **devolve**, obtida uma vez num banco de referência, e não contra o texto do arquivo.

### TABLE

```sql
select c.relname, c.relkind, c.relrowsecurity, c.relforcerowsecurity, obj_description(c.oid) as comment
from pg_class c
where c.oid = to_regclass('public.<tabela>');
```

### COLUMN

```sql
select column_name, data_type, udt_name, is_nullable, column_default, is_generated,
       col_description(to_regclass('public.<tabela>'), ordinal_position) as comment
from information_schema.columns
where table_schema = 'public' and table_name = '<tabela>'
order by ordinal_position;
```

Comparar **a lista inteira** de colunas, não só a presença de uma. Isso pega coluna a mais, como
`username` na 084.

### INDEX

```sql
select i.indexrelid::regclass as indice, pg_get_indexdef(i.indexrelid) as def,
       i.indisunique, i.indisvalid, i.indisready, i.indislive,
       pg_get_expr(i.indpred, i.indrelid) as predicado
from pg_index i
where i.indexrelid = to_regclass('public.<indice>');
```

Para índice de coluna única `uuid`, o modelo completo é a §12.3 do plano.

### CONSTRAINT

```sql
select conname, contype, pg_get_constraintdef(oid) as def, convalidated,
       confdeltype, obj_description(oid, 'pg_constraint') as comment
from pg_constraint
where conrelid = to_regclass('public.<tabela>') and conname = '<constraint>';
```

### FUNCTION

```sql
select p.oid::regprocedure as assinatura, l.lanname, p.prosecdef, p.provolatile,
       p.proconfig, pg_get_function_result(p.oid) as retorno,
       md5(p.prosrc) as hash_corpo, obj_description(p.oid, 'pg_proc') as comment,
       coalesce(array_to_string(p.proacl, ' | '), '(sem ACL: PUBLICO)') as acl
from pg_proc p join pg_language l on l.oid = p.prolang
where p.pronamespace = 'public'::regnamespace and p.proname = '<funcao>';
```

`md5(p.prosrc)` contra o corpo entre `$$…$$` do arquivo de **última definição**. Para versões
intermediárias, procurar **substrings exclusivas** (ver §6.6).

### TRIGGER

```sql
select t.tgname, t.tgrelid::regclass, t.tgfoid::regprocedure, t.tgenabled, t.tgtype,
       pg_get_triggerdef(t.oid) as def
from pg_trigger t
where not t.tgisinternal and t.tgrelid = to_regclass('public.<tabela>');
```

### POLICY

```sql
select tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and policyname = any (array[<lista de nomes da migration>]);
```

A lista de nomes sai do próprio arquivo. Esperado: **uma linha por nome**, com `roles` =
`{authenticated}`.

### GRANT (privilégio SQL)

```sql
select has_table_privilege('anon', 'public.<tabela>', 'select')           as anon_select,
       has_table_privilege('authenticated', 'public.<tabela>', 'select')  as auth_select,
       has_function_privilege('authenticated', '<assinatura>', 'execute') as auth_exec;
```

### SEED (catálogo de permissões)

```sql
select ap.code as perfil, p.code as permissao, pp.is_allowed, pp.status, pp.deleted_at
from public.profile_permissions pp
join public.access_profiles ap on ap.id = pp.access_profile_id
join public.permissions p on p.id = pp.permission_id
where p.code = any (array[<codigos da migration>]);
```

### ENUM

```sql
select e.enumlabel, e.enumsortorder
from pg_enum e
where e.enumtypid = to_regtype('public.<tipo>')
order by e.enumsortorder;
```

---

## 12. Migrations automatizáveis

A verificação é **automatizável** quando os efeitos esperados podem ser extraídos do arquivo e
comparados com o catálogo sem julgamento humano.

| Migration | Automatizável? | Motivo |
| --- | --- | --- |
| 041, 042, 043, 046, 047, 052, 053, 056, 060, 061, 062, 087 | **Sim** | Tabelas, colunas, índices e constraints com nomes exclusivos |
| 063, 068, 073, 075, 076, 082, 085 | **Sim** | Um efeito pontual de definição exata |
| 066, 069, 071, 072, 077, 078 | **Sim** | 251 policies com nome único; lista extraída do arquivo |
| 040, 067, 079, 080, 081, 083, 086, 094 | **Sim** | Hash ou substring exclusiva do `prosrc`, mais `proacl` |
| 084, 091, 092 | **Sim** | Estrutura + ausência esperada (coluna `username`, sobrecarga de 5 argumentos) |
| 055, 057, 064, 065, 070 | **Sim** | Constraint com comment exclusivo / matriz de permissões fechada |
| 048, 054, 088, 093 | **Sim, com revisão** | Estrutura automática. Os grants podem ter sido mudados pela UI |
| 089 | **Parcial** | Estrutura e seed sim. O backfill não |
| 090 | **Parcial** | Só por inferência na cadeia da RPC |
| 044, 045, 049 | **Parcial** | Comparação de seed automática; a interpretação, não |
| 050, 051, 058, 059 | **Não** | Só evidência externa decide |

**Cobertura:** 45 de 54 automatizáveis (4 delas com revisão de grants), 5 parciais e 4 não
automatizáveis.

**Uma automação deve gerar evidência, não decisão.** O script compara e lista divergências; a
classificação A/B/C/D continua humana.

---

## 13. Migrations de alto risco

Não podem receber `repair applied` sem evidência forte e decisão humana registrada.

### 058 e 059: arquivos reescritos depois de aplicados

- Os dois arquivos foram editados em `29954f9` (2026-06-24), semanas depois de criados.
- **Conferido no Git:** a versão original da 058 (`8fed289`) fazia `insert into
  public.permissions (code, …)`. Só que `permissions.code` é **coluna gerada** (`003`, linha 95). Ela
  também fazia `insert into public.role_permissions`, uma tabela que **nenhuma migration cria**. **A
  versão original não podia rodar como estava.** A 059 original tinha o mesmo defeito, segundo a
  análise.
- O cabeçalho atual da 058 diz que ela "espelha o estado real de produção". **O que foi executado de
  fato é desconhecido.**
- A trigger da 058 depende de `public.set_updated_at()`, **que não existe em nenhuma migration**.
- A 059 faz `UPDATE` em massa de status, sem rastro verificável.

**Classificação esperada: D**, salvo log ou backup.

### 064 → 065: ordem importa

A 064 reativa grants por upsert. A 065 desativa os grants de `PURCHASES:approvals.decide`. **Se a
064 rodar de novo depois da 065**, por `db push` sem `repair` ou fora de ordem, os grants legados de
decisão de compra **voltam a ficar ativos**. Isso atinge a regra de alçada de aprovação.

**Prova obrigatória da 065:** nenhum grant de `approvals.decide` ativo.

### 067: identidade de todo o RLS

A 067 substitui `current_auth_user_id()`. Ela é a base de `current_app_user_id()` e
`user_has_unit_access()`, usadas por **todas** as policies. Policies aplicadas com a versão antiga
da função podem bloquear tudo, quando o claim vem no formato novo. **Prova pelo corpo, não pelo
nome.**

### 079, 083, 084: versão anterior do mesmo arquivo

| Mig | Versão anterior | Como detectar |
| --- | --- | --- |
| 079 | Sem cast de enum; grava decisão incondicionalmente | `prosrc` sem `::public.purchase_request_status` ou sem `if p_decision in (…)` |
| 083 | Sem cast em `purchase_insert_request_events` (42804) | `prosrc` sem `e.from_status::public.purchase_request_status` |
| 084 | Coluna `username` em vez de `username_attempted` (**conferido no Git**: `d23a1ac`) | `information_schema.columns` |

Uma função ou tabela "existente" com o corpo antigo é **C**, e o `create … if not exists` não
corrigiria.

### 089: backfill irreversível e cadeia de seis versões

- O backfill de `rooms` só roda com `room_status_history` vazio. **Reaplicar com o histórico vazio
  sobrescreve o estado das UHs.**
- A troca `room_status` → `text` em `room_status_history` não tem volta.
- O corpo da RPC da 089 não existe mais. Ele é provado só pela cadeia até a 094.

### 050 e 051: sem efeito comprovável

- A 050 é no-op contra os arquivos commitados.
- A 051 foi inteiramente sobrescrita pela 076.

Marcar qualquer das duas como aplicada seria **aceitação**, não prova. Precisa ser dita assim na
decisão.

### Achado de segurança, fora do escopo de P4: RLS das tabelas de governança

```text
CONFIRMADO SEGURO PARA CRUD DE LINHAS POR RLS/DEFAULT DENY
HARDENING DE GRANTS PENDENTE
```

> **Atualização 2026-10-19.** Auditoria somente leitura feita em **staging e produção**. Nos dois:
> RLS ativo, 0 policies, `anon`/`authenticated` sem `BYPASSRLS` e sem serem donos, mas com todos os
> privilégios de tabela concedidos (incluindo `TRUNCATE`, `REFERENCES`, `TRIGGER` e `MAINTAIN`).
> Evidência e análise: [`P4_RLS_GOVERNANCA_2026-10-19.md`](P4_RLS_GOVERNANCA_2026-10-19.md).
> Frente futura: `SEC-HARDEN-HOUSEKEEPING-GRANTS`. **Não bloqueia P4 e não altera a classificação de
> nenhuma migration.**
>
> O texto abaixo é o registro de antes da confirmação, mantido como estava. O estado anterior era
> **PENDENTE DE CONFIRMAÇÃO REMOTA**.

**O que foi visto no repositório:** nas migrations analisadas não há
`alter table … enable row level security`, `create policy` nem `revoke` de privilégio de tabela para:

```text
public.housekeeping_days        (091)
public.housekeeping_tasks       (091)
public.housekeeping_day_events  (092)
```

As **funções** dessas migrations tiveram `execute` fechado com cuidado. Para as **tabelas**, o
repositório não registra nenhuma proteção.

**O que NÃO se conclui daqui:** que as tabelas estão publicamente acessíveis. O repositório não
mostra o banco. RLS pode ter sido habilitado fora das migrations. Os privilégios padrão do schema
podem diferir do padrão do Supabase. O schema pode estar ou não exposto pela Data API. **Nada disso
foi verificado.**

**O que precisa ser verificado**, em staging e depois em produção, com as consultas do §13.1:

- `relrowsecurity`;
- `relforcerowsecurity`;
- policies existentes;
- grants para `anon`;
- grants para `authenticated`;
- exposição do schema `public` na Data API, pela configuração do projeto ("Exposed schemas").

**Se o risco for confirmado**, a correção é uma **migration nova**, com fatia e autorização próprias.
Não faz parte de P4 e **nunca** se resolve por `repair`. **Nenhuma migration corretiva foi criada.**

### 13.1 Consultas para a confirmação remota — **SOMENTE LEITURA, NÃO EXECUTADAS**

Rodar no SQL Editor, como consulta de catálogo. **Não usar service role nem PostgREST como
substituto.** A service role ignora RLS e uma chamada pela API mostra o comportamento de **um**
papel. O que precisa ser lido é o catálogo.

**(1) RLS nas três tabelas**

```sql
select n.nspname            as schema,
       c.relname            as tabela,
       c.relrowsecurity     as rls_habilitado,
       c.relforcerowsecurity as rls_forcado
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('housekeeping_days', 'housekeeping_tasks', 'housekeeping_day_events')
order by c.relname;
```

Esperado: **3 linhas**. Se vier menos, a tabela não existe naquele banco, o que é um achado à parte.

**(2) Policies**

```sql
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('housekeeping_days', 'housekeeping_tasks', 'housekeeping_day_events')
order by tablename, policyname;
```

**(3) Grants concedidos, pelo `information_schema`**

```sql
select table_name, grantee, privilege_type, is_grantable
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('housekeeping_days', 'housekeeping_tasks', 'housekeeping_day_events')
order by table_name, grantee, privilege_type;
```

> `information_schema.role_table_grants` só mostra grants em que o usuário atual é concedente,
> receptor ou membro de um papel envolvido. Para não depender disso, a consulta (4) lê a ACL
> diretamente do catálogo.

**(4) ACL bruta da tabela, pelo catálogo**

```sql
select c.relname as tabela,
       coalesce(array_to_string(c.relacl, ' | '), '(ACL nula: privilégios padrão do dono)') as acl
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('housekeeping_days', 'housekeeping_tasks', 'housekeeping_day_events')
order by c.relname;
```

**(5) Privilégios efetivos de `anon`**

```sql
select t.tabela,
       has_table_privilege('anon', 'public.' || t.tabela, 'select') as anon_select,
       has_table_privilege('anon', 'public.' || t.tabela, 'insert') as anon_insert,
       has_table_privilege('anon', 'public.' || t.tabela, 'update') as anon_update,
       has_table_privilege('anon', 'public.' || t.tabela, 'delete') as anon_delete
from (values ('housekeeping_days'), ('housekeeping_tasks'), ('housekeeping_day_events')) as t(tabela)
order by t.tabela;
```

**(6) Privilégios efetivos de `authenticated`**

```sql
select t.tabela,
       has_table_privilege('authenticated', 'public.' || t.tabela, 'select') as auth_select,
       has_table_privilege('authenticated', 'public.' || t.tabela, 'insert') as auth_insert,
       has_table_privilege('authenticated', 'public.' || t.tabela, 'update') as auth_update,
       has_table_privilege('authenticated', 'public.' || t.tabela, 'delete') as auth_delete
from (values ('housekeeping_days'), ('housekeeping_tasks'), ('housekeeping_day_events')) as t(tabela)
order by t.tabela;
```

> As consultas (5) e (6) falham com erro se uma das tabelas não existir. Rodar a (1) primeiro.

**(7) Privilégios padrão do schema, como contexto**

```sql
select pg_get_userbyid(d.defaclrole) as dono, d.defaclobjtype as tipo,
       array_to_string(d.defaclacl, ' | ') as acl_padrao
from pg_default_acl d
join pg_namespace n on n.oid = d.defaclnamespace
where n.nspname = 'public';
```

**Como ler o resultado combinado:**

| `relrowsecurity` | Grants de `anon` / `authenticated` | Leitura |
| --- | --- | --- |
| `true` | qualquer | Sem policy: acesso negado pelo RLS para esses papéis. Conferir se é o desejado |
| `false` | nenhum | Sem exposição por esses papéis |
| `false` | **algum** | 🔴 **Exposição confirmada** se o schema estiver na Data API. Correção própria, fora de P4 |

**A exposição pela Data API não aparece no catálogo.** Ela vem da configuração do projeto e precisa
ser conferida lá, sem alterar nada.

---

## 14. Exclusão da migration timestamp

```text
20260918120033_hr_workflow_idempotency_indexes_parity.sql

NÃO REPAIR
PENDENTE PARA APLICAÇÃO REAL
```

- Ela **não entra** em nenhuma matriz de `repair`, em nenhum ambiente.
- ~~Ela é a **única** pendente esperada depois do `repair` das legadas (§5(e) do plano).~~ Desde
  P4-S1 ela é **uma das duas** pendentes esperadas. Ver abaixo.
- Seus efeitos (3 índices) **não existem** em produção e precisam ser **criados**.
- Ela não toca nenhum objeto das legadas. Só cria índices em `hr_workflow_idempotency_keys`, que a
  078 deixou sem policy de propósito.

### 14.1 Segunda migration timestamp — hardening da governança (P4-S1)

```text
20261019184500_housekeeping_security_hardening.sql

NÃO REPAIR
PENDENTE PARA APLICAÇÃO REAL

Migration desenhada:     SIM
Teste local:             APROVADO (PostgreSQL 17.11, cenários A/B/C)
Versionada:              SIM (commit db-housekeeping-security-hardening)
Aplicada em staging:     NÃO
Aplicada em produção:    NÃO
```

Evidência do teste:
[`P4_S1A_TESTE_LOCAL_HARDENING_GOVERNANCA_2026-10-19.md`](P4_S1A_TESTE_LOCAL_HARDENING_GOVERNANCA_2026-10-19.md).
Blob: `fa7308befcfa85e35818b9726c573f50b1970e10`.

- Habilita RLS de forma declarada, revoga todos os privilégios de tabela de `anon`, `authenticated`
  e PUBLIC, e concede CRUD explícito a `service_role` em `housekeeping_days`, `housekeeping_tasks` e
  `housekeeping_day_events`.
- Objetos disjuntos dos da migration de índices.
- **Também está bloqueada pelo `repair` das legadas** para entrar por `db push`.
- **Não altera a classificação de 091 nem de 092.** A auditoria delas continua sobre o que elas
  fizeram. O hardening é efeito novo, de outra migration.

**Critério pós-`repair`:** exatamente estas **duas** pendentes. 1, 0 ou 3+ é parada. Desenho e
testes: [`P4_S1_HARDENING_GOVERNANCA.md`](P4_S1_HARDENING_GOVERNANCA.md).

---

## 15. Próximo passo

**Não executado. Apenas indicado.**

### 15.1 Correções documentais — **FEITAS em 2026-10-19**

Todas as linhas abaixo foram corrigidas no mesmo commit que versionou este documento. Os trechos
corrigidos ganharam nota de correção datada. Nenhuma evidência histórica datada foi alterada:
`PREFLIGHT_STAGING_RECONCILIACAO_MIGRATIONS_2026-09-18.md` e
`PREFLIGHT_PRODUCAO_RECONCILIACAO_MIGRATIONS_2026-09-21.md` ficaram intocados nesta rodada. Também
foram corrigidas as menções ao teste descartável e às medições de produção como "pendentes" em
`ACOES_MANUAIS_SUPABASE.md` (AM-04, P5, P6) e no roteiro de preflight.

| Documento | Trecho | Problema | Gravidade |
| --- | --- | --- | --- |
| `PLANO_RECONCILIACAO_MIGRATIONS.md` §1.3, §1.5, §2, §4 (R1), §5(b)(j), §8, §9, §10 (A2/A3) | "29 legadas", "55 legadas", "fila 30 / 56" | **Contagem errada por um: 074 não existe.** O correto é 28 / 54 e 29 / 55 | **Crítica para o procedimento de `repair`** |
| `ACOES_MANUAIS_SUPABASE.md` AM-03 | Tabela "29 / 55 / 30 / 56" | Idem | **Crítica** |
| `PREFLIGHT_PRODUCAO_RECONCILIACAO_MIGRATIONS.md` §3 (nota de condição) | "55 migrations legadas", "56" | Idem | **Crítica** |
| `GO_NO_GO_RECONCILIACAO_INDICES_2026-10-16.md` P4 | "55 legadas", "56" | Idem | **Crítica** |
| `PLANO_RECONCILIACAO_MIGRATIONS.md` §3.2, linhas ~206–216 | A tabela da `023` marca `_organization_idx`, `_action_idx`, `_status`, `_expires_at`, `_created_at` como **presentes em produção** | Produção tem **2** índices (medido em 2026-09-21). §13 já corrige, mas §3.2 continua afirmando o contrário | Alta: leitura isolada engana |
| `PLANO_RECONCILIACAO_MIGRATIONS.md` §2, linhas ~137–139 | "drift conhecido de **três** índices em produção" | São **nove** | Alta |
| `PLANO_RECONCILIACAO_MIGRATIONS.md` §8 | "PENDENTE — sem acesso. Medições (a)–(e) do §12.1 em produção" | Feitas em 2026-09-21 | Média |

### 15.2 Para P4 andar

1. ~~**Corrigir as contagens** acima, num commit só de documentação.~~ **Feito em 2026-10-19.**
2. **Autorizar a fotografia do ledger** de staging e de produção. É a primeira leitura remota, e a
   de produção ainda é relato.
3. **Rodar a etapa 1 do §10 em staging** (6 migrations simples) como piloto dos templates.
4. ~~**Confirmar remotamente o achado de segurança** das tabelas de governança com as consultas do
   §13.1, separado de P4.~~ **Feito em 2026-10-19:** confirmado seguro para CRUD de linhas por
   RLS/default deny; hardening de grants pendente (`SEC-HARDEN-HOUSEKEEPING-GRANTS`). Ver
   [`P4_RLS_GOVERNANCA_2026-10-19.md`](P4_RLS_GOVERNANCA_2026-10-19.md).
5. **Decidir as D esperadas** (050, 051, 058, 059) antes de chegar a elas: buscar evidência
   externa, ou aceitar por decisão registrada.

**Nenhum comando de `repair` está escrito neste documento**, de propósito. Ele só deve aparecer
depois da classificação A com revisão humana, migration por migration.
