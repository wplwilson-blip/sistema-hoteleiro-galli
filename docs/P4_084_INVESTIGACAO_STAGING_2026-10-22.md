# P4-084 — Investigação da Migration 084 em Staging — 2026-10-22

**Documento de evidência.** Registra a investigação **somente leitura** da migration
`084_auth_login_attempts.sql` em **staging**, feita manualmente pelo responsável no SQL Editor.
Frente aberta como `P4-084 — INVESTIGAÇÃO DE MIGRATION VERSIONADA NÃO REPRODUZÍVEL` em
[`P4_STAGING_EFEITOS_LOTE_03_RLS_2026-10-22.md`](P4_STAGING_EFEITOS_LOTE_03_RLS_2026-10-22.md) §7.

```text
084 = C — EFEITO PARCIAL (staging)
084 NÃO É CANDIDATA A REPAIR APPLIED neste momento.
```

São **dois problemas separados**:

| Problema | Situação |
| --- | --- |
| **Efeito no banco de staging** | **C — parcial**: estrutura e segurança conformes; comentários ausentes |
| **Reprodutibilidade do arquivo versionado** | **Quebrada**: o arquivo do HEAD não executa integralmente |

---

## 1. Ambiente

| | |
| --- | --- |
| **Projeto** | `galli-staging` |
| **Project ref** | `jascnmgagejlvjlenduv` |
| **Natureza** | Somente `SELECT`: catálogo, mais agregados sem dados pessoais |
| **Commit de referência do repositório** | `e0bc49a` |
| **Data** | 2026-10-22 |

- Nenhum `repair`, nenhum `db push`, nenhum `migration up`.
- Nenhuma migration aplicada. **A `084` não foi editada.**
- Produção **não acessada**.
- Nenhum teste de login nem de rate limit.
- Nenhum username, IP, `context` ou texto bruto de log foi lido.

A `084` está **ausente** do ledger de staging ([`P4_LEDGER_STAGING_2026-10-19.md`](P4_LEDGER_STAGING_2026-10-19.md)).
**A ausência no ledger não foi usada como evidência de efeito.**

---

## 2. Histórico Git da 084

| Aspecto | `d23a1ac` (blob `e111891422cb8c3acadf0779555adb6b2db93e07`) | `eb1d778` / HEAD (blob `b21b800dbedc564c9998cf9b97a2055da0459143`) |
| --- | --- | --- |
| Coluna do username | `username text not null` | `username_attempted text not null` |
| Demais colunas | `id`, `ip`, `succeeded`, `created_at` | idênticas |
| Índice de username | `auth_login_attempts_username_idx (username, created_at desc)` | mesmo nome, sobre `(username_attempted, created_at desc)` |
| Índice de IP | `(ip, created_at desc)` | idêntico |
| Comentário da tabela e de `ip` | presentes | **idênticos** aos da versão antiga |
| Comentário da coluna de username | "Username SUBMETIDO…" | "String de username SUBMETIDA… attempted…" |
| RLS / policies / grants | RLS ligado, 0 policies, `revoke all … from anon, authenticated` | idênticos |
| Sintaxe | **válida** | **defeito na linha 84**, no roteiro de validação, **depois** de todo o SQL operacional (linhas 1–62) |

**O defeito:** num comentário de exemplo `curl … -w "%{time_total}\n"`, o `\n` virou quebra de linha
real. A linha 84 começa com `"` fora do comentário, e o `psql` acusa
`syntax error at or near "" -X POST ""`. O defeito existe igual no blob do Git (LF).

**Nenhuma migration posterior** toca `auth_login_attempts`: não há rename nem migration corretiva.

### Como o arquivo do HEAD se comporta — demonstrado localmente

PostgreSQL 17.11 descartável, com o arquivo do HEAD **sem nenhuma alteração**:

| Modo de aplicação | Resultado |
| --- | --- |
| `psql` em transação única (equivale ao `db push`) | erro e rollback: **nada é criado** |
| `psql` comando a comando, sem transação | **tabela, RLS e 3 índices são criados** e depois vem o erro |
| Texto inteiro numa única chamada: envio integral **simulado com `psql -c`**, não validado no SQL Editor real | o PostgreSQL analisa a string toda antes de executar: **nada é criado** |

> **Nota de 2026-10-23.** A linha acima dizia "como o SQL Editor". O teste foi uma **simulação do
> envio integral com `psql -c`** (protocolo simples) em PostgreSQL 17.11 local. O comportamento do
> SQL Editor real **não foi validado**.

---

## 3. Dependência do código

`src/app/api/auth/login/route.ts` usa **somente** `username_attempted`, sem alternativa para
`username`, para ler o último sucesso, contar falhas e inserir a tentativa. Tudo **falha aberto**:
se leitura ou escrita quebrarem, o login prossegue e o erro vai para `system_logs`, com as ações
`auth.login.rate_limit_read_failed` e `auth.login.rate_limit_write_failed`.

```text
login funcionando  ≠  rate limit funcionando
```

---

## 4. Referências locais usadas na comparação

Geradas em PostgreSQL 17.11 descartável:

- **Versão antiga:** blob `d23a1ac`, aplicado como está.
- **Versão atual intencionada:** blob do HEAD com **uma única mudança local**, a linha 84 prefixada
  com `--` para o comentário voltar a ser comentário. O `diff` confirmou que é a única diferença, e o
  SQL executável das linhas 1–62 ficou idêntico. **O repositório não foi alterado.**

| Item | Antiga | Atual intencionada |
| --- | --- | --- |
| `auth_login_attempts_username_idx` | `2ef0f486644f52b2308d067967485aae` | **`539f5f5225a0b158d436ee180055923b`** |
| Comentário da coluna de username | `831a161702b67d8f92ebf621a675dbcb` | `1ae27b405647e9cd3e29b7a07675ea21` |
| Comentário da tabela | `7a9a8d9be82139c36d56f99fc0de7b39` | idem |
| Comentário de `ip` | `d47d0289f1f50ee3442d28c0b842513f` | idem |
| PK / índice PK / índice IP | `4c6419b3…` / `dfafcef8…` / `82f48d31…` | idem |

---

## 5. Resultados em staging × esperado

### 5.1 Estrutura

| Item | Esperado (atual intencionada) | Encontrado | Conforme? |
| --- | --- | --- | --- |
| Tabela existe | sim | sim | ✅ |
| Dono | `postgres` | `postgres` | ✅ |
| Variante | `VERSAO ATUAL (username_attempted)` | idem; `tem_username = false`, `tem_username_attempted = true` | ✅ |
| Colunas (5) | `id uuid NOT NULL DEFAULT gen_random_uuid()`, `username_attempted text NOT NULL`, `ip inet NULL`, `succeeded boolean NOT NULL DEFAULT false`, `created_at timestamptz NOT NULL DEFAULT now()` | idênticas | ✅ |

### 5.2 Constraints e índices

| Objeto | Esperado (md5) | Encontrado (md5) | Valid / ready / live | Conforme? |
| --- | --- | --- | --- | --- |
| PK `PRIMARY KEY (id)` | `4c6419b3704337bbfe50f018842a9ad3` | idem | — | ✅ |
| `auth_login_attempts_pkey` | `dfafcef89f21ee27c6572747605585ca` | idem | t / t / t | ✅ |
| `auth_login_attempts_ip_idx` `(ip, created_at DESC)` | `82f48d3135ae331bb26da074903deefa` | idem | t / t / t | ✅ |
| `auth_login_attempts_username_idx` `(username_attempted, created_at DESC)` | `539f5f5225a0b158d436ee180055923b` | idem | t / t / t | ✅ |

### 5.3 Comentários — **ausentes**

| Objeto | Esperado | Encontrado | Conforme? |
| --- | --- | --- | --- |
| Tabela | `7a9a8d9b…` | **NULL** | ❌ |
| `username_attempted` | `1ae27b40…` | **NULL** | ❌ |
| `ip` | `d47d0289…` | **NULL** | ❌ |
| Demais colunas | sem comentário | sem comentário | ✅ |
| `username` | não deve existir | não existe | ✅ |

**Os três `COMMENT` declarados pela migration estão ausentes.** Os comentários da tabela e de `ip`
são **idênticos nas duas versões** do arquivo. Portanto nenhuma das duas, executada **por inteiro**
até o fim da parte operacional, produziria este estado. Isso registra o fato; **não** determina o
procedimento histórico (§7).

### 5.4 Segurança

| Papel | Privilégios de tabela | Conforme a intenção? |
| --- | --- | --- |
| `anon` | **nenhum** | ✅ |
| `authenticated` | **nenhum** | ✅ |
| `service_role` | SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER | registrado; atende o código, que lê e insere pela `service_role` |

| Item | Esperado | Encontrado | Conforme? |
| --- | --- | --- | --- |
| RLS | `true` | `true` | ✅ |
| FORCE RLS | `false` | `false` | ✅ |
| Policies | 0 (deny-all para clientes) | 0 | ✅ |

**Segurança conforme com a intenção da migration.** A ACL da `service_role` não tem referência local
válida, porque o PostgreSQL puro não tem os privilégios padrão do Supabase. Ela foi **registrada**,
não comparada.

---

## 6. Evidência operacional (somente agregados)

### 6.1 Falhas históricas do rate limit (`system_logs`)

| Ação | Ocorrências | Primeiro | Último | Tipo de erro classificado |
| --- | --- | --- | --- | --- |
| `auth.login.rate_limit_read_failed` | 76 | `2026-08-27 17:17:35.292365+00` | `2026-08-27 17:20:36.362231+00` | `outro` |
| `auth.login.rate_limit_write_failed` | 76 | (mesmo intervalo) | (mesmo intervalo) | `outro` |

**Houve um intervalo histórico curto, de cerca de 3 minutos em 2026-08-27, em que o rate limiter
falhou aberto.** A causa exata **não** foi determinada: o padrão de classificação devolveu `outro`, e
o texto bruto da mensagem não foi lido. Nenhuma falha do freio foi registrada depois desse intervalo.

### 6.2 Uso posterior da tabela (`auth_login_attempts`)

| Total | Sucessos | Falhas | Primeira | Última |
| --- | --- | --- | --- | --- |
| 145 | 123 | 22 | `2026-08-31 12:29:59.792315+00` | `2026-09-17 18:26:52.295416+00` |

**Interpretação permitida:** há evidência de que o rate limiter **voltou a conseguir registrar
tentativas** depois do intervalo de falha de 2026-08-27.

**Limite temporal:** a última evidência operacional é de **2026-09-17**. **Não se afirma que o rate
limit funciona atualmente.** As linhas também não provam qual versão do arquivo foi aplicada.

---

## 7. Como a versão atual chegou ao banco — não concluído

O estado de staging é **compatível** com:

- execução parcial ou comando a comando do conteúdo operacional da versão atual, **sem** os
  `COMMENT`;
- aplicação de conteúdo equivalente fora do arquivo.

**Nada disso prova o procedimento histórico.** Sabe-se apenas que:

- a estrutura e os índices são os da versão **atual** (`username_attempted`), e não os da antiga;
- os `COMMENT` de **ambas** as versões estão ausentes;
- `db push` e o envio integral do arquivo **não** teriam criado nada (§2). O envio integral foi
  simulado com `psql -c`; o SQL Editor real não foi validado.

---

## 8. Classificação

```text
084 = C — EFEITO PARCIAL (staging)
```

| Efeito | Situação |
| --- | --- |
| Tabela, colunas, tipos, nulidade, defaults | ✅ conformes |
| PK e 3 índices (md5) | ✅ conformes |
| RLS, 0 policies, sem acesso para `anon` e `authenticated` | ✅ conformes |
| 3 `COMMENT` (tabela, `username_attempted`, `ip`) | ❌ **ausentes** |

**Motivo do C:** o efeito estrutural e funcional principal está conforme, mas os `COMMENT` declarados
pela migration **não existem**. A regra de A exige **todos** os efeitos relevantes.

**Separado da classificação:** o **arquivo versionado não é reproduzível**. Mesmo um A no banco não
resolveria isso.

---

## 9. Repair

```text
084 NÃO É CANDIDATA A REPAIR APPLIED neste momento.
```

Bloqueios:

1. **Classificação C** em staging.
2. **Arquivo Git não reproduzível.**
3. **Produção ainda não investigada.**
4. **Estratégia de correção ainda não decidida.**

**Restrição registrada:** uma migration timestamp posterior **não resolve sozinha**. O `db push` e
qualquer reconstrução do banco executam a `084` antes dela. Enquanto a `084` estiver pendente no
ledger ou fizer parte de uma reconstrução, o erro acontece antes de a correção ser alcançada.

---

## 10. Próximo passo

**Não executado. Apenas indicado.**

1. **Investigar a 084 em PRODUÇÃO** com as **mesmas** consultas somente leitura.
2. Só depois dos dois ambientes, decidir:
   - se a `084` pode ser corrigida no próprio arquivo, já que nunca entrou no ledger de nenhum dos
     dois ambientes medidos;
   - se outra estratégia é necessária;
   - como garantir reconstrução limpa e `db push`;
   - como tratar os `COMMENT` ausentes (C).

**A 084 não foi corrigida e não deve ser corrigida antes disso.**

---

## 11. Confirmações

- Investigação **somente leitura** em staging.
- Nenhum `repair`, `db push` ou `migration up`.
- **A `084` não foi editada.** A cópia com o comentário corrigido existiu só no ambiente local, para
  a referência.
- Staging não alterado. Produção **não acessada**.
- Nesta tarefa de registro **nenhuma consulta remota foi executada**. Os resultados foram fornecidos
  pelo responsável que rodou as consultas.
