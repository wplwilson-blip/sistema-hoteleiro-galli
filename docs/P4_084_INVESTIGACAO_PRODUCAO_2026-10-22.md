# P4-084 — Investigação da Migration 084 em Produção, Decisão e Correção — 2026-10-22

**Documento de evidência e de decisão.** Registra:

1. a investigação **somente leitura** da `084_auth_login_attempts.sql` em **produção**, feita
   manualmente pelo responsável no SQL Editor (§1–§4);
2. a **estratégia decidida** para a `084` (§5);
3. a **correção do arquivo**, restrita ao comentário quebrado, e os **testes locais** (§6–§8).

Continuação de [`P4_084_INVESTIGACAO_STAGING_2026-10-22.md`](P4_084_INVESTIGACAO_STAGING_2026-10-22.md).

```text
084 produção = C — EFEITO PARCIAL
084 staging  = C — EFEITO PARCIAL
084 NUNCA entra em repair. Fica PENDENTE PARA APLICAÇÃO REAL.
Arquivo corrigido SÓ no comentário quebrado. SQL operacional idêntico.
Nada foi aplicado remotamente.
```

---

## 1. Ambiente de produção

| | |
| --- | --- |
| **Projeto** | `hotel-galli-admin` |
| **Project ref** | `chnamldrlwohaudmjrez` |
| **Natureza** | Somente `SELECT`: catálogo, mais agregados sem dados pessoais |
| **Commit de referência do repositório** | `afb3dd6` |

- Nenhum `repair`, `db push` ou `migration up`.
- Nenhum SQL de escrita.
- Nenhum teste de login nem de rate limit.
- Nenhum username, IP, `context` ou texto bruto de log foi lido.

---

## 2. Resultados em produção × esperado

O esperado é a versão atual intencionada, com as referências de
[`P4_084_INVESTIGACAO_STAGING_2026-10-22.md`](P4_084_INVESTIGACAO_STAGING_2026-10-22.md) §4.

### 2.1 Estrutura

| Item | Esperado | Encontrado | Conforme? |
| --- | --- | --- | --- |
| Tabela existe / dono | sim / `postgres` | sim / `postgres` | ✅ |
| Variante | `VERSAO ATUAL (username_attempted)` | idem; `username` ausente | ✅ |
| Colunas | `id uuid NOT NULL DEFAULT gen_random_uuid()`, `username_attempted text NOT NULL`, `ip inet NULL`, `succeeded boolean NOT NULL DEFAULT false`, `created_at timestamptz NOT NULL DEFAULT now()` | idênticas | ✅ |

### 2.2 Constraints e índices

| Objeto | md5 esperado | md5 encontrado | Valid / ready / live | Conforme? |
| --- | --- | --- | --- | --- |
| PK `PRIMARY KEY (id)` | `4c6419b3704337bbfe50f018842a9ad3` | idem | — | ✅ |
| `auth_login_attempts_pkey` | `dfafcef89f21ee27c6572747605585ca` | idem | t / t / t | ✅ |
| `auth_login_attempts_ip_idx` | `82f48d3135ae331bb26da074903deefa` | idem | t / t / t | ✅ |
| `auth_login_attempts_username_idx` `(username_attempted, created_at DESC)` | `539f5f5225a0b158d436ee180055923b` | idem | t / t / t | ✅ |

### 2.3 Comentários — **ausentes**

| Objeto | Esperado | Encontrado | Conforme? |
| --- | --- | --- | --- |
| Tabela | `7a9a8d9b…` | **NULL** | ❌ |
| `username_attempted` | `1ae27b40…` | **NULL** | ❌ |
| `ip` | `d47d0289…` | **NULL** | ❌ |

### 2.4 Segurança

| Item | Esperado | Encontrado | Conforme? |
| --- | --- | --- | --- |
| RLS / FORCE / policies | `true` / `false` / 0 | idem | ✅ |
| `anon` | nenhum privilégio | todos `false` | ✅ |
| `authenticated` | nenhum privilégio | todos `false` | ✅ |
| `service_role` | (registrado, não comparado) | SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER = `true` | atende o código |

### 2.5 Evidência operacional (agregados)

| Medida | Resultado |
| --- | --- |
| `system_logs`: `auth.login.rate_limit_read_failed` / `_write_failed` | **0 linhas** |
| `auth_login_attempts`: total / sucessos / falhas | 4 / 4 / 0 |
| Primeira / última tentativa registrada | `2026-08-27 10:29:15.32454+00` / `2026-09-17 20:27:14.534544+00` |

**Leitura permitida:**

- os logs **atualmente disponíveis** não contêm falhas do freio. Isso **não** prova que nunca houve
  falha;
- a tabela **recebeu gravações** entre 2026-08-27 e 2026-09-17;
- isso **não** prova throttling nem funcionamento atual.

### 2.6 Ledger de produção

```sql
select version, name from supabase_migrations.schema_migrations where version = '084';
```

**0 linhas: a `084` está AUSENTE do ledger de produção.**

---

## 3. Classificação de produção

```text
084 = C — EFEITO PARCIAL (produção)
```

Estrutura, índices, RLS e grants conformes; os 3 `COMMENT` declarados pela migration estão
**ausentes**. É a mesma classificação de staging.

---

## 4. Conclusão dos dois ambientes

| Ambiente | Ledger `084` | Estrutura | Índices | Segurança | Comentários | Classificação |
| --- | --- | --- | --- | --- | --- | --- |
| Staging | **AUSENTE** | conforme | conforme | conforme | **ausentes** | **C** |
| Produção | **AUSENTE** | conforme | conforme | conforme | **ausentes** | **C** |

**Como o SQL chegou aos bancos não é inferido.** O estado dos dois é **compatível** com aplicação
parcial, ou de conteúdo equivalente, **fora do ledger**. O arquivo inteiro, por `db push` ou pelo SQL
Editor, não teria criado nada (staging §2).

---

## 5. Decisão de estratégia

```text
CORRIGIR A REPRODUTIBILIDADE DA PRÓPRIA 084
+
DEIXAR A 084 PENDENTE PARA APLICAÇÃO REAL FUTURA
```

**A `084` NÃO recebe `repair applied`.** Justificativa:

- **Nenhum ledger a registra:** nem o de staging, nem o de produção. Editar o arquivo não reescreve
  nenhum histórico registrado;
- o **arquivo atual não executa integralmente**: falha em transação única e no envio integral do
  texto, este **simulado com `psql -c`**, não validado no SQL Editor real (nota de 2026-10-23);
- **uma migration posterior não resolve o problema de ordem**, porque `db push` e reconstrução
  executam a `084` antes dela;
- os objetos principais da `084` usam `create … if not exists` e comandos idempotentes
  (`enable row level security`, `revoke`, `comment on`). Uma aplicação real da versão corrigida
  sobre o estado atual dos bancos **completa os 3 `COMMENT`** e **registra a versão** no ledger, sem
  tocar no resto (§7.2);
- um `repair` declararia aplicados `COMMENT` que **não existem**, o mesmo defeito que a auditoria
  existe para evitar.

### Motivo excepcional para editar uma migration legada

```text
A migration 084 não consta como aplicada no ledger de staging
nem no ledger de produção.

A alteração corrige apenas um defeito sintático que impede sua
execução transacional; não muda o SQL operacional pretendido.
```

A regra geral, "não editar migration já aplicada", existe para que o arquivo continue descrevendo o
que o ledger diz ter sido executado. Aqui **nenhum ledger diz isso**: a `084` nunca foi registrada
como aplicada em lugar nenhum.

---

## 6. A correção

### 6.1 Diff exato

```diff
@@ -80,8 +80,7 @@ revoke all on table public.auth_login_attempts from anon, authenticated;
 --
 --    Exemplo de coleta (bash, ajuste URL/credenciais):
 --      for i in $(seq 1 30); do
---        curl -s -o /dev/null -w "%{time_total}
-" -X POST "$BASE_URL/api/auth/login" --          -H "Content-Type: application/json" --          -d '{"username":"<usuario_real>","password":"<senha_correta>"}'
+--        curl -s -o /dev/null -w "%{time_total}\n" -X POST "$BASE_URL/api/auth/login" --          -H "Content-Type: application/json" --          -d '{"username":"<usuario_real>","password":"<senha_correta>"}'
 --      done | sort -n | awk '{a[NR]=$1} END {print "p95:", a[int(NR*0.95)]}'
```

As duas linhas viraram uma. O `\n` voltou a ser **dois caracteres literais** (`\` e `n`), que é a
intenção do exemplo `curl`. O restante da linha foi preservado como estava: as sequências
`--          -H` provavelmente também são continuações de linha achatadas, mas **não foram
reinterpretadas**, para manter a mudança mínima. Tudo segue dentro de comentário.

### 6.2 Identidade

| | Blob |
| --- | --- |
| **Antes** (quebrado; `eb1d778` / `afb3dd6`) | `b21b800dbedc564c9998cf9b97a2055da0459143` |
| **Depois** (corrigido) | `0b7a4f11e9bd7f7a6b77576be78ae75beb617599` |
| Versão inicial, só referência (`d23a1ac`) | `e111891422cb8c3acadf0779555adb6b2db93e07` |

O arquivo passou de 164 para 163 linhas.

### 6.3 Prova de que só o comentário mudou

| Verificação | Resultado |
| --- | --- |
| `git diff` | 1 hunk: só as linhas 83–84 do roteiro comentado |
| Linhas 1–62 (todo o SQL operacional) antes × depois, byte a byte | **IDÊNTICAS** |
| SQL sem comentários, antes × depois | única diferença: **some** a linha órfã `" -X POST "$BASE_URL/api/auth/login"` |
| Linhas fora de comentário depois da 62, no arquivo novo | **0** |
| Bytes no ponto corrigido | `}` `\` `n` `"`: dois caracteres literais, não quebra de linha |

---

## 7. Testes locais (PostgreSQL 17.11 descartável)

### 7.1 Cenário limpo (banco sem a tabela)

| Modo | Exit | Tabela / colunas / índices | Estrutura (md5) | RLS / policies / ACL | Comentários (md5) |
| --- | --- | --- | --- | --- | --- |
| Cópia de trabalho (CRLF), transação única, como `db push` | **0** | sim / 5 / 3 | `364e7385…` | `true` / 0 / só o dono | `7a9a8d9b…`, `1ae27b40…`, `d47d0289…` ✅ |
| Blob LF, transação única | **0** | idem | `364e7385…` | idem | idem ✅ |
| Arquivo inteiro numa string: envio integral **simulado com `psql -c`**, não validado no SQL Editor real | **0** | idem | `364e7385…` | idem | idem ✅ |

Índice de username: `539f5f52…`, igual ao de staging e produção. `anon` e `authenticated` sem
nenhum privilégio. **O arquivo corrigido executa nos três modos**, inclusive nos dois que falhavam
antes.

### 7.2 Cenário igual aos bancos (bloqueante)

Fixture reproduzindo staging e produção: tabela existente na versão `username_attempted`, 3 índices,
RLS ligado, 0 policies, `anon` e `authenticated` sem grants, `service_role` com todos os privilégios,
**sem os 3 `COMMENT`**. Depois, a `084` corrigida em transação única:

| Item | Antes | Depois | Mudou? |
| --- | --- | --- | --- |
| Exit | — | **0** | — |
| Estrutura (md5: colunas, índices, constraints) | `364e7385…` | `364e7385…` | **não** |
| Segurança | `rls=true force=false policies=0 acl=postgres=arwdDxtm/postgres\|service_role=arwdDxtm/postgres` | idem | **não** |
| PK / pkey / ip_idx / username_idx (md5) | `4c6419b3…` / `dfafcef8…` / `82f48d31…` / `539f5f52…` | idem | **não** |
| Grants | `anon` e `authenticated` sem nada; `service_role` com tudo | idem | **não** |
| Comentário da tabela | **NULL** | `7a9a8d9b…` | **sim** ✅ |
| Comentário de `username_attempted` | **NULL** | `1ae27b40…` | **sim** ✅ |
| Comentário de `ip` | **NULL** | `d47d0289…` | **sim** ✅ |

**Só os 3 `COMMENT` mudaram.** Nenhuma duplicação, nenhuma alteração de estrutura, índices ou
segurança.

**Com dados:** a mesma fixture com 50 linhas, e a `084` corrigida aplicada por cima. Resultado: **50
linhas antes e depois, com md5 do conteúdo idêntico** (`380dc185…`). Nenhuma linha alterada ou
perdida.

### 7.3 Reaplicação

A `084` corrigida aplicada de novo sobre o resultado do §7.2: **exit 0, snapshot completo idêntico**,
inclusive comentários. **Idempotente.**

### 7.4 Limitações dos testes

- ~~PostgreSQL 17.11 local; staging e produção rodam 17.6.~~ **Corrigido em 2026-10-23: a frase
  riscada não tinha evidência.**
  - Os testes locais rodaram em **PostgreSQL 17.11** (`PostgreSQL 17.11 on x86_64-windows,
    compiled by msvc-19.44.35228, 64-bit`).
  - **A versão do servidor de produção não foi medida.**
  - O "17.6" de staging consta **apenas** no arquivo local da CLI (`supabase/.temp/postgres-version`
    → `17.6.1.127`, §0 do plano). **Não equivale a uma medição atual do servidor.**
- Os privilégios padrão do Supabase não existem no PostgreSQL puro. A ACL da `service_role` foi
  simulada com `grant all`.
- **Não foi testado o `db push` real nem a ordem dele com o ledger** (§8.1).

---

## 8. Impacto no P4

### 8.1 Critério pós-`repair`: **3 pendentes**

> **⚠️ Critério superado (2026-10-23).** O texto desta seção é o registro de quando foi escrito. Ele
> foi **substituído** por: três migrations são **obrigatoriamente excluídas** do `repair` (estas
> três); isso significa **pelo menos três** pendentes; o **total exato** só é definido depois da
> classificação completa das legadas e da revisão das dependências, como lista fechada por nome. A
> execução da `084` é **questão aberta**: `--include-all` **não autorizado**, nenhuma alternativa
> escolhida e nenhum comando remoto, inclusive `--dry-run`. Ver `PLANO_RECONCILIACAO_MIGRATIONS.md`
> §5(e) e §5(g).

Depois do `repair` das legadas **elegíveis**, devem restar **exatamente 3**, pelo nome:

1. `084_auth_login_attempts.sql`
2. `20260918120033_hr_workflow_idempotency_indexes_parity.sql`
3. `20261019184500_housekeeping_security_hardening.sql`

| Ambiente | Backlog legado | Novas | Fila antes do `repair` | Legadas candidatas a `repair` | Pendentes depois do `repair` |
| --- | --- | --- | --- | --- | --- |
| Staging | 28 (inclui a `084`) | 2 | **30** | **no máximo 27** | **3** (mínimo) |
| Produção | 54 (inclui a `084`) | 2 | **56** | **no máximo 53** | **3** (mínimo) |

"No máximo" porque outras legadas que resultarem B, C ou D também saem do `repair`. A lista fechada
das deliberadamente não reparadas tem de estar escrita **antes** do `repair`.

> **⚠️ Restrição de execução a resolver (não decidida aqui).** A `084` é **anterior** à última versão
> que estará no ledger depois do `repair` (`094`). Pelo comportamento conhecido da CLI do Supabase, o
> `db push` **recusa** migration local anterior à última remota e exige `--include-all`. Essa flag
> está em "Nunca rodar" no plano, porque antes do `repair` ela aplicaria as legadas. Antes de qualquer
> aplicação: confirmar com `--help` e `--dry-run`, e decidir explicitamente (`--include-all` somente
> depois do `repair` completo e de um `--dry-run` com exatamente as 3, ou outra ordem). Registrado no
> §5(g) do plano.

### 8.2 Documentos atualizados

- `PLANO_RECONCILIACAO_MIGRATIONS.md`: §1.5, R4, §5(d), §5(e), §5(g), §8 e §9;
- `ACOES_MANUAIS_SUPABASE.md`: AM-03 e AM-04 passo (e);
- `PREFLIGHT_PRODUCAO_RECONCILIACAO_MIGRATIONS.md`: nota de condição;
- `GO_NO_GO_RECONCILIACAO_INDICES_2026-10-16.md`: P4;
- `P4_AUDITORIA_MIGRATIONS_LEGADAS.md`: §5, §9.1 e §14.2 (novo);
- `P4_S1_HARDENING_GOVERNANCA.md`: nota no §8.2.

---

## 9. Confirmações

- Investigação de produção **somente leitura**, executada pelo responsável. Nesta tarefa **nenhuma
  consulta remota foi executada**.
- Nenhum `repair`, `db push` ou `migration up`.
- **Nada aplicado em staging nem em produção.** A `084` corrigida foi só **versionada**.
- O SQL operacional da `084` **não mudou**.
- Nenhuma migration timestamp foi criada para "corrigir depois".
