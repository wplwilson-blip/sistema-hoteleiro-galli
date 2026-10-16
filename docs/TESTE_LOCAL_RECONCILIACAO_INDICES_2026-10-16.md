# Teste Local — Reconciliação de Índices — 2026-10-16

**Documento de evidência.** Registra um teste que aconteceu. Não é roteiro e **não autoriza
aplicação** em nenhum ambiente.

O cenário exigido está no §16 de
[`PLANO_RECONCILIACAO_MIGRATIONS.md`](PLANO_RECONCILIACAO_MIGRATIONS.md). O bloqueio que este teste
resolve estava registrado no §11 de
[`PREFLIGHT_PRODUCAO_RECONCILIACAO_MIGRATIONS_2026-09-21.md`](PREFLIGHT_PRODUCAO_RECONCILIACAO_MIGRATIONS_2026-09-21.md).

---

## 1. Identificação

| | |
| --- | --- |
| **Ambiente** | PostgreSQL 17 local descartável |
| **Banco** | `hotel_galli_migration_test` |
| **Sistema operacional** | Windows |
| **Objetivo** | Reproduzir o estado estrutural de produção e validar a migration seletiva |
| **Migration** | `20260918120033_hr_workflow_idempotency_indexes_parity.sql` |
| **Commit de referência** | `b29055b` |
| **Blob Git da migration em `b29055b`** | `ff9fa1115504cee3096a689cef5b1c8b04512703` |
| **Data do registro** | 2026-10-16 |

Nenhuma senha ou segredo local é registrado aqui.

### O que esta execução foi, e o que não foi

- **Execução manual**, em banco local criado só para isto.
- **Nenhum acesso remoto.** Staging e produção não foram tocados.
- **A migration não foi aplicada em nenhum ambiente real.**

---

## 2. Estado inicial reproduzido

Foram criadas quatro **tabelas-pai mínimas**, apenas para satisfazer as chaves estrangeiras:

```text
public.organizations
public.units
public.hr_workflows
public.app_users
```

Em seguida, `public.hr_workflow_idempotency_keys` foi criada com o `CREATE TABLE` da migration
histórica `023_hr_workflow_transaction_foundation.sql`.

Antes da migration corretiva, o estado estrutural foi **reduzido para reproduzir produção**
(medido em 2026-09-21, §9 do preflight de produção):

```text
hr_workflow_idempotency_keys_pkey
hr_workflow_idempotency_keys_unique_idx
```

**Total inicial: 2 índices.**

---

## 3. Validação prévia

- `select gen_random_uuid();` funcionou no PostgreSQL local.
- A tabela principal foi criada com sucesso.

---

## 4. Aplicação dos três índices selecionados

Executados:

```sql
create index if not exists hr_workflow_idempotency_keys_unit_idx
  on public.hr_workflow_idempotency_keys (unit_id);

create index if not exists hr_workflow_idempotency_keys_workflow_idx
  on public.hr_workflow_idempotency_keys (workflow_id);

create index if not exists hr_workflow_idempotency_keys_actor_idx
  on public.hr_workflow_idempotency_keys (actor_user_id);
```

Esses três comandos são **exatamente as linhas executáveis** da migration em `b29055b` (linhas
62–69). O restante do arquivo é comentário.

**Resultado estrutural após aplicação: 5 índices totais.**

```text
hr_workflow_idempotency_keys_actor_idx
hr_workflow_idempotency_keys_pkey
hr_workflow_idempotency_keys_unique_idx
hr_workflow_idempotency_keys_unit_idx
hr_workflow_idempotency_keys_workflow_idx
```

---

## 5. §12.3 no banco local

A consulta §12.3 do plano foi executada. Para os **três** índices:

```text
existe   = true
conforme = true
```

Todas as propriedades estruturais conferiram:

- tabela correta;
- método `btree`;
- uma coluna-chave;
- uma coluna total;
- sem `INCLUDE`;
- coluna correta;
- tipo `uuid`;
- opclass `uuid_ops`;
- schema da opclass `pg_catalog`;
- tipo da opclass `uuid`;
- opclass padrão;
- método da opclass compatível;
- collation `0`;
- `indoption` `0`;
- sem predicado;
- sem expressão;
- não único;
- `indisvalid`;
- `indisready`;
- `indislive`.

---

## 6. §12.4 no banco local

**Resultado: 0 linhas.**

Leitura correta:

```text
nenhum índice concorrente por leading-column foi detectado
após a criação dos três índices selecionados.
```

Isto é o **caso B** dos casos de aceitação do §12.4: o esperado existe e é o único que lidera pela
coluna-alvo. **Não prova equivalência completa do catálogo.** O detector olha só índices cujo
primeiro campo-chave é uma das três colunas-alvo.

---

## 7. Reaplicação / idempotência

Os três `CREATE INDEX IF NOT EXISTS` foram **executados de novo**.

A listagem final continuou com **exatamente 5 índices**, sem duplicidade:

```text
hr_workflow_idempotency_keys_actor_idx
hr_workflow_idempotency_keys_pkey
hr_workflow_idempotency_keys_unique_idx
hr_workflow_idempotency_keys_unit_idx
hr_workflow_idempotency_keys_workflow_idx
```

```text
A reaplicação é no-op estrutural para os três índices selecionados.
```

**Consequência para o §16, passo 5, do plano:** a listagem final tem exatamente os 5 nomes acima.
Logo os seis deliberadamente não restaurados (`organization_idx`, `action_idx`, `status_idx`,
`expires_at_idx`, `status_expires_at_idx`, `created_at_idx`) **continuaram ausentes**. A migration
cria exatamente o que a §14 decidiu, nada a mais e nada a menos.

---

## 8. Limites do teste

O que este teste **é**:

- validação da **criação**, da **estrutura** (§12.3), da **detecção de concorrentes** (§12.4) e da
  **idempotência** dos três índices, partindo do mesmo estado estrutural de produção (2 índices);
- o objeto testado é **só PostgreSQL**: `create index` sobre uma tabela. Por isso um PostgreSQL 17
  puro serve para o que se quer provar.

O que este teste **não é**:

- **não foi remoto.** Foi local, em banco descartável;
- **não reproduziu a stack Supabase inteira.** Ficaram de fora Auth, Storage, Realtime e PostgREST.
  Isso não afeta este caso, porque nenhum desses componentes participa de `create index`;
- **não usou o executor de migrations.** Os comandos rodaram direto no banco: sem `db push`, sem a
  transação que o executor põe em volta do arquivo, sem registro no ledger
  `supabase_migrations.schema_migrations`. O que foi validado é o SQL da migration, não o caminho
  do `db push`. Esse caminho já tinha sido exercitado em staging como no-op;
- **não mediu carga.** Esta evidência não registra massa de dados nem tempo de construção. Em
  produção são 11 linhas, e o custo de lock já tinha sido avaliado no §12 do preflight;
- **não exercitou o rollback** do §12.6 (§16, passo 6, do plano);
- **staging não substituiu o caminho de criação.** Lá os três índices já existem;
- **produção não foi alterada.**

O teste fecha uma lacuna específica: **o `create index` desta migration nunca tinha rodado num
banco onde os índices faltavam.** Agora rodou, e o resultado conferiu. Ele não prova mais do que
isso.
