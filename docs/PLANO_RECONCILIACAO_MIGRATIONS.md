# Plano de Reconciliação de Migrations

Documento de análise. **Nada aqui foi executado contra staging ou produção.**
Levantado em 2026-09-18.

---

## 0. Antes de tudo: o que eu pude verificar, e o que é relato

Este documento separa **medido** de **recebido**, e a separação não é formalidade — metade das
conclusões abaixo depende de qual das duas caixas o dado está.

| Fonte | Como obtive | Confiança |
| --- | --- | --- |
| Arquivos de migration locais | `ls`, `git log` no repositório | **Medido** |
| Histórico de migrations do **staging** | `supabase migration list --linked` | **Medido** |
| Índices e volumes do **staging** | `supabase inspect db index-stats --linked`, contagens via PostgREST | **Medido** |
| Versão do Postgres | `supabase/.temp/postgres-version` → **17.6.1.127** | **Medido** |
| Histórico de migrations da **produção** | Relatado na auditoria (até `039`) | **NÃO verificado** |
| Índices ausentes em **produção** | Relatado na auditoria; **medido depois**, em 2026-09-21 | **Medido**: 2 presentes, 9 ausentes. Ver `PREFLIGHT_PRODUCAO_RECONCILIACAO_MIGRATIONS_2026-09-21.md` |
| Advisors (views, search_path, RLS, grants) | Relatados na auditoria | **NÃO verificado** |
| Contagem de 102 tabelas / 78 usadas / 11 RPCs | Relatado na auditoria | **NÃO verificado** |

### Por que produção não foi verificada

**Não há credencial de produção neste repositório**, e isso é correto. A CLI está linkada
(`supabase/.temp/linked-project.json`) exclusivamente a **`jascnmgagejlvjlenduv` = galli-staging**.
O `.env.local` aponta para o mesmo ref de staging.

E há um motivo **mais forte** para eu não ter ido atrás: ao rodar `supabase migration list --linked`
contra staging, a CLI imprimiu

```
Initialising login role...
Connecting to remote database...
```

**"Initialising login role" é escrita.** A CLI cria/ajusta um papel de login para conseguir falar
com o banco. Rodar o equivalente contra produção — mesmo para uma leitura — executaria DDL em
produção, o que a regra de não executar DDL remoto proíbe. **Então não rodei, e não recomendo
rodar** sem decisão explícita.

> **Divulgação:** esse efeito colateral já aconteceu em **staging**, por conta desta análise, antes
> de eu saber que ele existia. Foi uma leitura de histórico; o efeito colateral é da ferramenta,
> não da intenção. Registrado aqui porque a regra dizia "staging apenas para consultas de leitura",
> e um `create role` não é leitura.

### O que está indisponível neste ambiente

| Ferramenta | Estado | Consequência |
| --- | --- | --- |
| **Docker** | Ausente | `supabase db reset`, `db diff` e `migration up --local` **não rodam**. A reprodução completa em banco vazio (§6.4) fica **PENDENTE**. O teste do caminho de criação dos índices (§6.1–6.3, §16) foi **CONCLUÍDO** sem Docker, em PostgreSQL 17 local: [`TESTE_LOCAL_RECONCILIACAO_INDICES_2026-10-16.md`](TESTE_LOCAL_RECONCILIACAO_INDICES_2026-10-16.md) |
| **psql** | Ausente | Sem consulta SQL direta |
| **Supabase CLI** | Disponível via `npx` (2.117.0), linkada a staging | Leitura de histórico e telemetria de staging funcionam |
| **Acesso a produção** | Nenhum | Tudo sobre produção neste documento é relato da auditoria |

---

## 1. Estado atual

### 1.1 Inventário de arquivos — **95 no total**

Depois da inclusão das duas migrations novas:

| Grupo | Quantidade |
| --- | --- |
| Migrations **legadas**, convenção `NNN_` | **93** (`001`–`094`, sem `074`) |
| Migrations **novas**, convenção timestamp | **2**: `20260918120033_hr_workflow_idempotency_indexes_parity` e `20261019184500_housekeeping_security_hardening` |
| **Total de arquivos** | **95** |

> **Nota temporal.** Até 2026-10-19 eram **94** arquivos (93 + 1). A segunda migration timestamp,
> de hardening da governança, foi desenhada e testada localmente em 2026-10-19
> (`P4_S1_HARDENING_GOVERNANCA.md`, `P4_S1A_TESTE_LOCAL_HARDENING_GOVERNANCA_2026-10-19.md`).
> **Não foi aplicada em nenhum ambiente.**

A numeração legada não tem duplicados, e **`074` é o único número ausente**.

### 1.2 O `074` nunca existiu

```
git log --all --oneline --diff-filter=ADR --name-status -- 'supabase/migrations/074*'
→ (vazio)
```

Nenhum arquivo `074` foi jamais adicionado, renomeado ou removido em qualquer branch. **Não é um
arquivo perdido: é um número pulado na hora de criar o seguinte.**

**Não crie uma `074` retroativa.** Um arquivo novo com número antigo entraria fora de ordem em
qualquer banco que já passou de `075`, e o ganho seria cosmético. A ordenação `073 → 075` é a mesma
com ou sem ele.

### 1.3 Histórico do staging — medido

`supabase migration list --linked` devolve, para cada versão local, se há correspondente remoto:

| Faixa | `remote` | Situação |
| --- | --- | --- |
| `001` … `065` | preenchido | **Registradas** no histórico |
| `066` … `094` | **vazio** | **Ausentes** — **28** legadas (`074` não existe) |

Isso **confirma o número da auditoria**: staging registra até `065`.

> **Correção de contagem (2026-10-19).** Versões anteriores deste plano diziam **29** legadas em
> staging e **55** em produção, com filas de **30** e **56**. A conta incluía o `074`, que nunca
> existiu (§1.2). Medido no repositório: `066`–`094` são **28** arquivos e `040`–`094` são **54**.
> Ver [`P4_AUDITORIA_MIGRATIONS_LEGADAS.md`](P4_AUDITORIA_MIGRATIONS_LEGADAS.md) §4–§5.

### 1.4 Histórico da produção — relatado, não verificado

A auditoria informa que produção registra até `039`. Se correto, **54 migrations legadas**
(`040`–`094`, sem `074`) estão ausentes do histórico de produção enquanto seus efeitos estão no
schema.

### 1.5 A fila real antes do `repair` — **30 e 56, não 28 e 54**

> **28 e 54 são o backlog LEGADO — não o total da fila.**
>
> As **duas migrations novas** também estão ausentes do histórico dos dois ambientes, e por um
> motivo completamente diferente: **nunca foram aplicadas em lugar nenhum**. As legadas estão
> ausentes do histórico mas **presentes no schema**; as novas estão ausentes das duas coisas.

| Ambiente | Legadas ausentes | Novas | **Fila total antes do `repair`** |
| --- | --- | --- | --- |
| **Staging** | 28 (`066`–`094`, sem `074`) | 2 | **30** |
| **Produção** *(se o relato até `039` estiver correto)* | 54 (`040`–`094`, sem `074`) | 2 | **56** |

As duas novas, que **nunca** entram em `repair`:

1. `20260918120033_hr_workflow_idempotency_indexes_parity.sql`: 3 índices de FK em
   `hr_workflow_idempotency_keys`.
2. `20261019184500_housekeeping_security_hardening.sql`: RLS declarado e grants das 3 tabelas da
   governança.

> **Mais uma, legada, que também NÃO entra em `repair` (decisão de 2026-10-23):**
> `084_auth_login_attempts.sql`. Ela é **C** nos dois ambientes (estrutura conforme, 3 `COMMENT`
> ausentes) e está ausente dos dois ledgers. O arquivo foi corrigido **só no comentário quebrado**
> (blob `b21b800d…` → `0b7a4f11…`) e fica **pendente para aplicação real**, que completa os
> `COMMENT` e a registra no ledger. Ela **continua contada** no backlog legado (28 / 54). A fila
> não muda. Ver [`P4_084_INVESTIGACAO_PRODUCAO_2026-10-22.md`](P4_084_INVESTIGACAO_PRODUCAO_2026-10-22.md).

> **Nota temporal.** Até 2026-10-19 havia **uma** migration nova, e as filas eram **29 e 55**. Antes
> da correção de contagem de 2026-10-19 os documentos diziam 30 e 56, por contar o `074`. **Os
> números 30 e 56 de agora estão certos por outro motivo:** 28 + 2 e 54 + 2.

**A distinção decide o procedimento inteiro.** As legadas se resolvem por `repair` — declaração sem
execução, porque o efeito já está no banco. As novas **precisam ser executadas**: o efeito delas não
existe nos bancos. Tratá-las juntas marcaria uma migration nova como aplicada sem nenhum efeito, que
é o pior desfecho possível desta reconciliação — ver §5, alínea (d).

---

## 2. Diferenças por ambiente

| | Local | Staging | Produção |
| --- | --- | --- | --- |
| Arquivos | **95** (93 legadas + 2 novas) | — | — |
| Histórico registrado | — | `001`–`065` **(medido)** | `001`–`039` *(relatado)* |
| Legadas ausentes do histórico | — | **28** (`066`–`094`) | **54** *(`040`–`094`)* |
| Novas ausentes do histórico | — | **2** (nunca aplicadas) | **2** (nunca aplicadas) |
| **Fila total antes do `repair`** | — | **30** | **56** |
| Evolução funcional | — | até `094` **(medido)** | até `094` *(relatado)* |
| Índices de `hr_workflow_idempotency_keys` | 11 declarados na `023` | **11 presentes (medido)** | **2 presentes (MEDIDO 2026-09-21)** — faltam **9** |

**A assimetria é o ponto, e ela não é só de histórico.** Os ambientes possuem, segundo as
evidências disponíveis, **evolução funcional até a migration `094`** — mas **não têm schema
idêntico**: há drift **medido** de **nove índices em produção** (2 presentes dos 11 da `023`; §13),
e **outros efeitos ainda dependem da matriz de validação** do §5(b), que não foi executada.

**O resto da coluna de produção continua NÃO VERIFICADO** (§0). Só a linha de índices foi medida, em
2026-09-21. O ledger e a evolução funcional seguem como relato da auditoria. Afirmar "mesmo schema"
seria estender a uma comparação completa uma evidência que cobre um único objeto. Foi exatamente esse
tipo de extrapolação que deixou índices faltando sem ninguém notar. O relato original falava em três;
a medição achou nove.

---

## 3. Evidências

### 3.1 Migrations alteradas depois de criadas

Contagem de commits por arquivo (`git log -- <arquivo>`, **sem** `--follow` — com `--follow` o git
inventa renomeações entre arquivos de nome parecido e as contagens saem infladas em cascata):

| Arquivo | Commits | Segunda alteração | Avaliação |
| --- | --- | --- | --- |
| `040_hr_job_opening_workflow_mvp` | 2 | `29954f9` **2026-06-24** (original: 2026-05-20) | **Alterada ~5 semanas depois** |
| `058_hr_conduct_records_foundation` | 2 | `29954f9` **2026-06-24** (original: 2026-06-02) | **Alterada ~3 semanas depois** |
| `059_hr_conduct_review_governance` | 2 | `29954f9` **2026-06-24** (original: 2026-06-03) | **Alterada ~3 semanas depois** |
| `079_purchase_decision_rpc` | 2 | 2026-07-10 (original: 2026-07-09) | Dia seguinte — correção antes de aplicar |
| `083_purchase_quote_mutation_rpcs` | 2 | 2026-08-10 (mesmo dia) | Mesmo dia |
| `084_auth_login_attempts` | 2 | 2026-08-26 (mesmo dia) | Mesmo dia |
| `089`, `090`, `091`, `093` | 2 a 4 | dentro da própria fatia | Revisão antes de aplicar (cabeçalho: "NAO APLICADA PELO CODEX") |

**O achado que importa é o commit `29954f9`**, de 2026-06-24:

```
fix(migrations): remove BOM da 040 e corrige modelo obsoleto em 058/059
 040_hr_job_opening_workflow_mvp.sql   |  2 +-
 058_hr_conduct_records_foundation.sql | 22 ++++++++--------------
 059_hr_conduct_review_governance.sql  | 12 ++++--------
```

Três migrations antigas editadas semanas depois de criadas. **Se essas três já estavam aplicadas em
2026-06-24, o arquivo no repositório deixou de descrever o que está no banco** — e é esse o tipo de
divergência que a reconciliação trata como dado, não como erro a apagar.

**O que eu não sei:** se elas já estavam aplicadas naquela data. **E isso não é recuperável pelo
ledger** — ver §7.2: a tabela de histórico não guarda data de aplicação.

### 3.2 A `023` NÃO foi alterada

```
git log --format="%h %ad %s" --date=short -- supabase/migrations/023_*.sql
→ ea6639a 2026-05-15 db-rh-workflow-transaction-foundation      (UM único commit)
```

A hipótese da auditoria era "drift **ou** alteração posterior da migration". **A alteração posterior
está descartada.**

E a estrutura do arquivo descarta o aborto de transação.

**A contagem, corrigida.** A tabela tem **11 índices quando todos estão presentes**, e eles não vêm
todos do mesmo lugar:

| Origem | Quantos |
| --- | --- |
| `create index if not exists` explícitos na `023` (linhas 139–164) | **10** — sendo 1 `create unique index` |
| Índice implícito da `primary key` (`id uuid primary key`, linha 5) | **1** |
| **Total quando completos** | **11** |

*(A versão anterior deste documento dizia "os onze índices são `create index if not exists`". São
**dez**; o décimo primeiro nasce da PK e nenhum `create index` o declara.)*

Os **10 explícitos** são de nível superior, em sequência, sem bloco `do $$`:

| Linha | Índice | Produção — relato original | Produção — **medido em 2026-09-21** |
| --- | --- | --- | --- |
| 139 | `_unique_idx` | presente | **presente** |
| 147 | `_organization_idx` | presente | **AUSENTE** |
| 149 | `_unit_idx` | AUSENTE | **AUSENTE** |
| 151 | `_workflow_idx` | AUSENTE | **AUSENTE** |
| 153 | `_actor_idx` | AUSENTE | **AUSENTE** |
| 155 | `_action_idx` | presente | **AUSENTE** |
| 157–163 | `_status`, `_expires_at`, `_status_expires_at`, `_created_at` | presentes | **AUSENTES** |

> **Correção de estado (2026-10-19).** A coluna "relato original" é o que a auditoria afirmava e o que
> este plano repetia. **Está errada.** A medição de produção de 2026-09-21 achou **2 índices**: a PK
> e o `_unique_idx`. Dos 10 `create index` explícitos, **9 estão ausentes**. Estado atual:
>
> ```text
> histórico 023:                    11
> produção medida:                   2
> ausentes históricos:               9
> selecionados para restauração:     3
> deliberadamente não restaurados:   6
> ```
>
> **O raciocínio abaixo, do "bloco contíguo", foi construído sobre o relato e não vale mais.** Ele é
> mantido como registro. Com o estado medido, a premissa "índice presente imediatamente antes e
> depois" é falsa. Os índices posteriores ao `_unique_idx` faltam **todos**, e isso **não elimina**
> o aborto no meio. A análise atualizada está no §13.4.

*Texto original, mantido como registro:*

**Os três ausentes formam um bloco contíguo, com índice presente imediatamente antes e depois.**
Isso elimina:

- **aborto no meio** — perderia tudo a partir do ponto de falha; `action`, `status`, `expires_at` e
  `created_at` também faltariam. Não faltam;
- **coluna inexistente** — `create index` **erraria**, não pularia; e a auditoria registra tipos
  idênticos entre os ambientes.

**A hipótese do `if not exists` NÃO está eliminada**, e a versão anterior deste documento errou ao
dizer que estava. O raciocínio de então — *"ele só pula se o índice já existir, e aí existiria"* —
assume que **o estado de hoje descreve o estado do momento da execução**. Não descreve.

Uma relação **com o mesmo nome** poderia existir durante a execução da `023` — outro índice, uma
tabela, uma view — fazendo o `if not exists` pular a criação, e ter sido **removida depois**. O
estado atual, em que os três nomes simplesmente não existem, é **compatível** com esse caminho.

**Continua sendo hipótese não comprovada**, como as demais. O estado atual não permite descartá-la,
e nada aqui atribui a ação a uma pessoa.

**O que isso permite concluir, e só isso:** o drift foi causado por **alteração fora do fluxo oficial
de migrations**. Aplicação parcial/manual é uma **hipótese forte, mas não comprovada**. Também
permanecem possíveis:

- **remoção manual posterior** dos três índices;
- **restauração parcial** do banco a partir de backup;
- **conflito de nomes durante a criação**, deixando os três com outro nome ou não criados.

**Nenhuma dessas hipóteses atribui ação a uma pessoa**, e nenhuma deve ser tratada como estabelecida.
O que decide entre elas é log de operação, backup ou auditoria externa — nada disso está no
repositório, e **nada disso está no ledger de migrations** (§7.2).

### 3.3 Telemetria de staging (2026-09-18)

> **O que a telemetria NÃO é:** prova de que a migration corretiva funciona. Em staging os três
> índices já existem, então lá a migration é **no-op** — ver §6.1.

- **739 índices** no schema `public`; **534** marcados `unused` por `inspect db index-stats`.
  (A auditoria relatou 437 em staging. A diferença é esperada: são estatísticas **cumulativas desde
  o último reset** de `pg_stat_user_indexes`, e mudam a cada execução da suíte E2E. **Não use nenhum
  dos dois números como base para remover índice** — ver Correção 9.)
- `hr_workflow_idempotency_keys`: **0 linhas**, 11 índices, **8192 bytes cada** (uma página).

---

## 4. Riscos

| # | Risco | Gravidade | Mitigação |
| --- | --- | --- | --- |
| R1 | Rodar `db push` com o histórico atual tentaria aplicar **30 migrations em staging e 56 em produção** — 28/54 legadas que **não devem** reexecutar, mais as 2 novas | **Crítico** | Nunca rodar `db push` antes do `repair` das legadas. Sempre `--dry-run` primeiro |
| R2 | Reexecutar migrations legadas **recria objetos e pode apagar dado** (`drop`/`create` de função, backfill repetido) | **Crítico** | `repair` declara **sem executar** — é essa a saída, e só para as legadas |
| R3 | **`repair` numa migration nova** (índices ou hardening) marcaria como aplicada uma migration **nunca executada** — os índices continuariam faltando, ou os grants continuariam abertos, agora com o histórico afirmando o contrário | **Crítico** | §5(d). As 2 novas **nunca** entram em `repair`, em nenhum ambiente |
| R4 | Tratar "fila vazia depois do `repair`" como meta | **Alto** | §5(e): depois do `repair` tem de sobrar **exatamente a lista fechada de não reparadas**, pelo nome. São **pelo menos três** (`084` + as 2 timestamp); o total exato só sai da classificação completa |
| R5 | `repair` declara aplicado algo que **não está** no schema | **Alto** | Matriz de efeitos antes (§5b). `repair` é declaração, não verificação |
| R6 | Arquivo local diverge do que foi aplicado (`29954f9`) | **Médio** | Registrar a divergência; não "corrigir" o arquivo para casar |
| R7 | Produção e staging divergirem mais durante a reconciliação | **Médio** | Congelar aplicação manual até terminar |
| R8 | A CLI faz `Initialising login role` (escrita) mesmo em leitura | **Médio** | Nenhum comando de CLI contra produção sem decisão explícita |
| R9 | Criar `074` retroativa | **Baixo** | Não criar. §1.2 |

---

## 5. Procedimento — ordem obrigatória

**Nenhuma etapa foi executada. Todas exigem autorização.**

**Etapa 0 — congelar:** nenhuma aplicação manual de SQL enquanto a reconciliação corre. Um objeto
criado à mão no meio reabre o problema que o processo existe para fechar.

### (a) Fotografar o histórico

```bash
npx supabase migration list --linked --output json > evidencias/staging-historico.json
```

Produção: **precisa de decisão** (R8). A alternativa sem CLI, leitura pura, no SQL Editor:

```sql
select version, name from supabase_migrations.schema_migrations order by version;
```

**O que a fotografia preserva:** `version`, `name` e `statements` — o conteúdo do ledger e a
evidência do estado anterior ao `repair`. **Não preserva data de aplicação**, porque a tabela não
guarda uma (§7.2). A fotografia continua obrigatória: sem ela não há como provar o que o histórico
dizia antes.

### (b) Validar objeto por objeto — **somente as legadas**

**Alvo: as 28 legadas em staging / 54 em produção. A migration corretiva não entra aqui** — ela não
tem efeito no banco para validar; é justamente o que falta.

**Um objeto sentinela NÃO basta.** Conferir só "a tabela existe" carimba como concluída uma migration
que pode ter entrado pela metade — que é literalmente o que aconteceu com a `023` (§3.2): a tabela
existe, três índices não.

Para **cada** versão legada, uma linha por **efeito relevante**:

| Categoria | O que conferir |
| --- | --- |
| Tabelas | `to_regclass('public.<nome>')` não nulo |
| Colunas | nome, tipo, `not null`, default — `information_schema.columns` |
| Constraints | `pg_constraint`: PK, FK, UNIQUE e **todos os CHECK**, via `pg_get_constraintdef` |
| Índices | nome **e definição** — a `023` prova por que o nome sozinho engana |
| Funções | existência **e corpo** — `prosrc` contendo a marca da versão esperada |
| Triggers | `pg_trigger`, com função e evento corretos |
| Policies | `pg_policies`: nome, comando, `qual`, `with_check` |
| Grants | `information_schema.role_table_grants` / `role_routine_grants` |
| Enums | `pg_enum`: todos os valores, na ordem |
| Backfills | consulta de contagem que prove a transformação do dado |

**Sentinela única só com justificativa escrita**, dizendo por que aquele objeto não pode existir sem
os demais — por exemplo, quando a migration inteira é um `create or replace function` e o corpo já é
a prova.

Saída: tabela **versão → efeito → categoria → existe?**, arquivada como evidência. Versão com efeito
faltando **não** é candidata a `repair`: é achado próprio, tratado por migration nova.

### (c) `repair` — somente nas legadas comprovadas, uma por vez

```bash
npx supabase migration repair --status applied 066 --linked
```

Confirmado pelo `--help`: `migration repair [flags] [<version...>]`, com `--status applied|reverted`.

**Uma de cada vez**, conferindo a saída entre cada uma: se uma versão não tiver o efeito no schema,
você descobre nela, não no fim de um lote de 28.

### (d) **NUNCA** `repair` nas migrations novas

> **`20260918120033_hr_workflow_idempotency_indexes_parity` e
> `20261019184500_housekeeping_security_hardening` não entram em `repair`. Em nenhum ambiente, em
> nenhuma circunstância.**
>
> O argumento abaixo foi escrito para a de índices e vale igualmente para a de hardening: um
> `repair` nela declararia RLS e grants corrigidos sem ter executado nada.
>
> **Desde 2026-10-23 vale também para a legada `084_auth_login_attempts`**, classificada C nos dois
> ambientes. Um `repair` nela declararia aplicados os 3 `COMMENT` que **não existem**. Ela é
> corrigida no próprio arquivo e **aplicada de verdade**.
>
> `repair` declara aplicada uma migration **sem executá-la**. Isso está certo para as legadas, cujo
> efeito já está no banco. Para a corretiva estaria **exatamente errado**: os três índices
> continuariam ausentes em produção, e o histórico passaria a afirmar que foram criados.
>
> O resultado seria pior que o problema original — hoje a ausência é detectável comparando
> ambientes; depois de um `repair` indevido, o ledger mentiria e a próxima auditoria concluiria que
> a Correção 1 foi entregue.

### (e) `dry-run` depois do `repair`: **exatamente a lista fechada de migrations não reparadas**

```bash
npx supabase db push --dry-run --linked
```

`--dry-run` está no `--help`: *"Print the migrations that would be applied, but don't actually apply
them."*

**Três migrations são obrigatoriamente excluídas do `repair`:**

1. `084_auth_login_attempts.sql` (legada, **C**, corrigida só no comentário, aplicação real)
2. `20260918120033_hr_workflow_idempotency_indexes_parity.sql`
3. `20261019184500_housekeeping_security_hardening.sql`

**Critério:** depois do `repair` restam **pelo menos três** pendentes: estas três e mais toda legada
que não for classificada A. **O total exato ainda não está definido.** Ele só existe depois da
classificação completa das legadas e da revisão das dependências (§7 de
`P4_AUDITORIA_MIGRATIONS_LEGADAS.md`). Nesse momento ele é fixado como uma **lista fechada, por
nome, escrita antes do `repair`**. O `dry-run` tem de devolver **exatamente essa lista**.

| Resultado | Significado |
| --- | --- |
| **Exatamente a lista fechada, pelo nome** | **Correto.** Siga para (f) |
| **Falta qualquer item da lista**, em especial uma das três obrigatórias | 🔴 **PARE.** Foi marcada por engano — R3. Investigue antes de tudo |
| **Mesma contagem, nomes diferentes** | 🔴 **PARE.** Uma legada ficou fora do `repair` **e** um item da lista foi marcado |
| **Mais do que a lista** | 🔴 **PARE.** (c) ficou incompleto, ou surgiu migration inesperada. Volte, **sem** rodar `db push` sem `--dry-run` |

**A fila não deve esvaziar neste ponto.** Esvaziar aqui significa que migrations que exigem execução
foram declaradas sem ela. **Conferir pelo nome, não só pela contagem.**

O backlog legado continua **28 / 54**. As legadas candidatas a `repair` são **no máximo 27 / 53**,
porque a `084` sai. O número cai para cada legada que resultar B, C ou D.

> **Critérios superados, mantidos como histórico:** até 2026-10-19, "exatamente UMA pendente" (a de
> índices); até 2026-10-23, "exatamente 2" (as duas timestamp); em 2026-10-23, por pouco tempo,
> "exatamente 3". **Este último foi substituído no mesmo dia** pelo critério acima, porque trata como
> fechado um total que só a auditoria completa define.

### (f) Preflight dos índices — **§12.3 E §12.4, as duas**

Rodadas **ANTES** da aplicação. Qualquer uma das duas pode interromper o procedimento.

| Consulta | O que detecta ANTES | Condição de parada |
| --- | --- | --- |
| **§12.3** | Um dos três **nomes esperados** já existe com definição diferente ou estado inválido | `existe = true` **e** `conforme = false` |
| **§12.4** (detector orientado a alvos) | Já existe índice **com OUTRO nome** cujo primeiro campo-chave é uma das três colunas-alvo — potencialmente equivalente | qualquer linha devolvida |

**Por que a §12.4 também precisa vir antes, e não só depois.** A §12.3 só olha os três nomes que a
migration vai criar. Um índice **equivalente com outro nome** é invisível para ela — e é justamente
o caso em que aplicar a migration produz um **segundo índice sobre a mesma coluna**: custo de
escrita permanente, nenhum ganho de leitura, e ninguém percebe porque nada falha.

Rodar a §12.4 só depois descobriria o problema **com o índice redundante já criado**.

> **Se a §12.4 devolver qualquer linha ANTES da aplicação: PARE.**
>
> - Comparar `pg_get_indexdef` dos índices de cada grupo e **exigir decisão humana**.
> - **Não criar automaticamente** um segundo índice — ou seja, **não aplicar a migration** até a
>   decisão.
> - **Não remover nem renomear automaticamente** o índice existente. Ele pode estar em uso por
>   consultas que ninguém mapeou.
>
> A decisão pode ser: aceitar o existente e **não** criar o novo (migration ajustada em fatia
> própria), ou remover o existente (migration própria, com justificativa). **Nenhuma das duas sai
> daqui automaticamente.**

### (g) Aplicar as migrations novas em staging

```bash
npx supabase db push --linked
```

> **O `db push` aplica TODAS as pendentes, na ordem da versão.** Depois do `repair` correto, isso
> significa **todas as da lista fechada do §5(e) na mesma execução**: no mínimo a `084`, a de índices
> e a de hardening, nessa ordem. Não existe "aplicar só a de índices" por `db push` enquanto houver
> outras pendentes.
>
> **⚠️ QUESTÃO ABERTA — execução da `084` (registrada em 2026-10-23):** a `084` é **anterior** à
> última versão que estará no ledger (`094`, depois do `repair`). Pelo comportamento conhecido da CLI
> do Supabase, o `db push` **recusa** migration local anterior à última remota e pede
> `--include-all`, que está em "Nunca rodar" no §9.
>
> - **`--include-all` NÃO está autorizado.**
> - **Nenhuma alternativa de aplicação foi escolhida.**
> - **Nenhum comando remoto, inclusive `--dry-run`, deve ser executado para isso** até haver decisão
>   própria e autorizada.
>
> A confirmação do comportamento da CLI e a escolha do caminho ficam para uma etapa específica.

- **084** (`084_auth_login_attempts`): nos dois ambientes a tabela já existe na versão
  `username_attempted`. Todos os comandos dela são idempotentes (`if not exists`, `enable rls`,
  `revoke`), e o efeito líquido é **criar os 3 `COMMENT` ausentes** e registrar a versão. Testado
  localmente: `P4_084_INVESTIGACAO_PRODUCAO_2026-10-22.md` §6.

- **Índices** (`20260918120033`): em staging é **no-op** quanto aos índices, que já existem. O
  efeito real é **registrar a versão no histórico**. Prova parsing, idempotência e o caminho do
  `db push`; **não** prova a criação (§6.1).
- **Hardening** (`20261019184500`): em staging **NÃO é no-op**. Revoga os privilégios de tabela de
  `anon` e `authenticated` nas 3 tabelas da governança e declara RLS e o CRUD de `service_role`.
  Exige o preflight e o smoke de `P4_S1_HARDENING_GOVERNANCA.md` §6–§7.

### (h) Validar índices e histórico — **§12.3 e §12.4 de novo**

As **mesmas duas** consultas do preflight, agora como confirmação:

- **§12.3 DEPOIS**: os três com `conforme = true`.
- **§12.4 DEPOIS**: **zero linhas** — confirma que não há redundância. Se aparecer candidato que não
  existia no preflight, **a redundância surgiu entre o preflight e a validação posterior**: **parar e
  investigar se veio da migration ou de alteração concorrente**. Não atribuir a causa sem prova — o
  intervalo entre as duas consultas é aberto a outros atores.
- A versão `20260918120033_...` aparece no ledger.
- **Hardening:** a validação (1)–(4) do próprio arquivo `20261019184500_...` e o smoke da aplicação
  (`P4_S1_HARDENING_GOVERNANCA.md` §6). A versão `20261019184500_...` aparece no ledger.

### (i) `dry-run` final: **zero pendentes**

```bash
npx supabase db push --dry-run --linked
```

**Agora sim zero.** Este é o único ponto do procedimento em que "zero pendentes" é o resultado
correto — porque as **duas** migrations novas foram **executadas**, não declaradas.

### (j) Repetir a sequência autorizada em produção

Mesma sequência (a)→(i), com dois agravantes: sem CLI (R8) e com decisão explícita a cada passo. São
**54 legadas** a validar e reparar, não 28 — e a fila parte de **56** (54 + as 2 novas).

**Na etapa (g), o formato depende da decisão de §12.2:**

| Decisão | Como aplicar em produção |
| --- | --- |
| **`create index` normal** | Aplicar a migration normalmente. Ela cria os três índices e registra a versão |
| **`CONCURRENTLY`** | Criar os três **manualmente, fora de transação**, um de cada vez; **validar por §12.3 e executar o detector orientado a alvos do §12.4**; **e só então aplicar a migration**, que será **no-op** e servirá para **registrar a versão no histórico** |

No segundo caso a migration continua sendo **aplicada** — não pulada, não reparada. É o `db push`
que põe a versão no ledger, e é assim que o histórico fica verdadeiro sem ninguém declarar algo que
não aconteceu.

---

## 6. Teste em banco vazio

> **Estado em 2026-10-16:**
>
> ```text
> TESTE DESCARTÁVEL (caminho de criação dos índices, §6.1–6.3 e §16): CONCLUÍDO COM SUCESSO
> REPRODUÇÃO COMPLETA 001 → atual (§6.4):                              PENDENTE
> ```
>
> Evidência: [`TESTE_LOCAL_RECONCILIACAO_INDICES_2026-10-16.md`](TESTE_LOCAL_RECONCILIACAO_INDICES_2026-10-16.md).
> O texto abaixo foi mantido como estava quando o teste ainda não tinha rodado.

### 6.1 O que staging NÃO prova

Aplicar a migration corretiva em staging **não testa a criação dos índices**. Lá os três já existem
(medido, §3.3), então a migration é **no-op** quanto ao efeito.

O que um no-op bem-sucedido prova:

- o arquivo **parseia** — SQL válido;
- a **idempotência** funciona — `if not exists` não erra sobre índice existente;
- o **`db push` registra a versão** no histórico.

O que **não** prova:

- que os índices são **criados** corretamente onde faltam;
- que a definição resultante é a esperada;
- quanto tempo a criação leva, nem o custo de lock.

**Não trate a passagem em staging como aprovação do caminho de criação.** Confundir as duas foi o que
deixou a `023` com três índices faltando por meses sem ninguém notar.

### 6.2 O que testaria de verdade

Um **banco descartável** — local efêmero ou branch de preview — **sem os três índices**, onde a
migration precise de fato criá-los.

### 6.3 Por que está pendente

**Docker está ausente.** `supabase db reset`, `db diff` e `migration up --local` não rodam.

```bash
# NÃO EXECUTADO — exige Docker
npx supabase init          # cria supabase/config.toml (hoje NÃO existe)
npx supabase start
npx supabase db reset
```

**Status original: PENDENTE.** Não é "aprovado com ressalva" nem "coberto por staging".

**Atualização 2026-10-16:** o teste do caminho de criação foi feito **sem Docker**, em PostgreSQL 17
local descartável. O estado estrutural de produção (2 índices) foi reproduzido à mão. **CONCLUÍDO COM
SUCESSO.** Ver
[`TESTE_LOCAL_RECONCILIACAO_INDICES_2026-10-16.md`](TESTE_LOCAL_RECONCILIACAO_INDICES_2026-10-16.md).
Staging continua **não** servindo de substituto. Não foi usado para isso.

### 6.4 A sequência completa, separadamente

O mesmo `db reset` responde a outra pergunta: **a sequência `001 → atual` ainda é reproduzível num
banco limpo?** A suspeita é que não, por `29954f9` (§3.1).

Fazer numa **cópia** do repositório: `supabase init` cria `config.toml` e `db reset` derruba o banco
local. **Registrar o resultado inclusive se falhar** — e, se falhar, **em qual versão e com qual
SQLSTATE**. Esse número é a entrada da decisão do §7.1.

---

## 7. Depois do `repair`: seguir em frente, sem baseline nova

**A estratégia padrão, depois de o `repair` estar correto, é continuar com migrations novas.** Sem
baseline adicional, sem `db pull`, sem arquivo de schema completo.

> **Correção de uma recomendação anterior.** Uma versão anterior deste documento propunha
> `supabase db pull` como "baseline definitiva". **Está retirada.** Uma migration de schema completo
> convivendo com as 93 legadas cria duas descrições concorrentes do mesmo banco, e "qual das duas
> vale?" não teria resposta.

A partir dali cada mudança nasce de migration nova aplicada pelo fluxo oficial. **É a regra de
operação — não a ferramenta — que impede o drift de voltar:** nada de SQL Editor para criar objeto.

### 7.1 Se a reprodução em banco vazio falhar

Aí existe um problema que `repair` não resolve: **o repositório não reconstrói mais o banco do
zero.** Vira **decisão arquitetural separada**, com fatia própria, fora da reconciliação:

| Opção | O que é |
| --- | --- |
| **Baseline** | Um schema consolidado vira o novo ponto de partida; as legadas saem do caminho de execução |
| **Squash** | As 93 viram uma só — **apaga a trilha de decisões**; as `089`–`094` são planos versionados com argumento e rollback no próprio arquivo |
| **Arquivo histórico** | As legadas vão para pasta de histórico, fora do caminho de execução, preservadas para leitura |

**Não misturar uma migration de schema completo com as 93 legadas** no mesmo diretório de execução.

### 7.2 O ledger não guarda data de aplicação

> **Correção factual de uma versão anterior deste documento.** Eu havia escrito que o `repair`
> "carimba as migrations com a data de hoje", que "sobrescreve datas originais" e que
> `--status reverted` "não restaura a data anterior". **As três afirmações estão erradas**, e pelo
> mesmo motivo: **não existe data nessa tabela para carimbar, sobrescrever ou restaurar.**

A tabela padrão `supabase_migrations.schema_migrations` guarda **`version`, `name` e `statements`**.
**Não há coluna `applied_at`.**

O que decorre disso:

| Afirmação | Correto |
| --- | --- |
| Datas históricas reais | **Já não estão disponíveis no ledger** — nunca estiveram |
| `repair --status applied` | **Insere ou atualiza** o registro de histórico daquela versão |
| `repair --status reverted` | **Remove** o registro daquela versão |
| Recuperar a data real de aplicação | Só por **logs, backups ou auditoria externa** — fora do ledger |

**Consequência para §3.1:** a pergunta "as `058`/`059` já estavam aplicadas em 2026-06-24?" **não se
responde consultando o histórico**. Se a resposta importar, virá de log de operação ou backup — e,
não havendo, a divergência fica registrada como desconhecida, não como resolvida.

**Consequência para a fotografia (§5a):** ela continua obrigatória, mas pelo que de fato preserva —
`version`, `name`, `statements` e a evidência do estado do ledger **antes** do `repair`. Não é
preservação de data, porque não há data.

---

## 8. Validações obrigatórias

- [ ] Histórico dos dois ambientes fotografado **antes** de qualquer `repair` — §5(a).
- [ ] **Matriz versão → efeito → categoria → existe?** completa para as **legadas** — §5(b) —,
      cobrindo tabelas, colunas, constraints, índices, funções **e corpo**, triggers, policies,
      grants, enums e backfills. Sentinela única só **com justificativa escrita**.
- [ ] Nenhuma versão legada declarada como aplicada sem **todos** os efeitos confirmados.
- [ ] **`repair` executado SOMENTE em migrations legadas classificadas A** — nunca em
      `084_auth_login_attempts`, `20260918120033_...` ou `20261019184500_...` (R3).
- [ ] `db push --dry-run` depois do `repair`: **exatamente a lista fechada de não reparadas**,
      conferida pelo nome. Ela contém **no mínimo** as três obrigatórias (`084_auth_login_attempts`,
      `20260918120033_hr_workflow_idempotency_indexes_parity` e
      `20261019184500_housekeeping_security_hardening`) — §5(e).
      **Zero aqui é condição de parada**, não sucesso.
- [ ] Preflight **§12.3 ANTES** da aplicação: nenhum dos três nomes com `existe = true` e
      `conforme = false`.
- [ ] **Resultado do preflight §12.3 ARQUIVADO**, com a coluna `esperado_existe` por índice. **É a
      única prova de autoria** e a condição para o rollback do §12.6 ser executável. Sem ela, o
      rollback fica bloqueado (§12.6.3) — e o catálogo **não** permite reconstruir essa informação
      depois: um índice criado por esta migration e um criado pela `023` têm definição idêntica.
- [ ] Preflight **§12.4 ANTES** da aplicação — **detector orientado a alvos, não a grupos**: zero
      linhas. Qualquer linha para o procedimento e exige comparação de `pg_get_indexdef` + decisão
      humana — **sem criar, remover ou renomear nada automaticamente**.
- [ ] Os quatro **casos de aceitação** (A–D) do §12.4 conferidos contra a consulta, se ela for
      alterada.
- [ ] Migration aplicada em staging por `db push` — §5(g).
- [ ] **§12.3 DEPOIS** da aplicação: os três `conforme = true`.
- [ ] **§12.4 DEPOIS** da aplicação: zero linhas — e, em especial, nenhum candidato que não
      existisse no preflight. Se houver, **parar e investigar a origem**, sem atribuir causa.
- [ ] `db push --dry-run` final: **zero pendentes** — §5(i). Só aqui zero é o esperado.
- [ ] Mesma sequência completa em produção — §5(j), partindo de **56**.
- [ ] `git status --short --untracked-files=all` limpo de arquivos de migration não intencionais.
- [ ] Suíte E2E verde **depois** da reconciliação (o `repair` não deveria mexer em nada — é por isso
      que serve como controle).

**Pendências que NÃO podem ser marcadas como concluídas neste ambiente:**

- [x] **CONCLUÍDO COM SUCESSO — 2026-10-16.** Teste do caminho de criação dos índices em banco
      descartável sem os três (§6.1–6.3, §16), em PostgreSQL 17 local. Staging **não** foi usado como
      substituto. Evidência:
      [`TESTE_LOCAL_RECONCILIACAO_INDICES_2026-10-16.md`](TESTE_LOCAL_RECONCILIACAO_INDICES_2026-10-16.md).
- [ ] **PENDENTE — Docker ausente.** Reprodução da sequência completa em banco vazio (§6.4).
- [x] **CONCLUÍDO — 2026-09-21.** Medições (a)–(d) do §12.1 em produção, mais §12.3 e §12.4. Ver
      [`PREFLIGHT_PRODUCAO_RECONCILIACAO_MIGRATIONS_2026-09-21.md`](PREFLIGHT_PRODUCAO_RECONCILIACAO_MIGRATIONS_2026-09-21.md).
      A janela (e) continua **não fixada** (P3). **Isto não dispensa o preflight de última hora**,
      imediatamente antes de qualquer aplicação.
- [ ] **PENDENTE — bloqueado em código.** AM-01 (senhas vazadas) — ver `docs/ACOES_MANUAIS_SUPABASE.md`.

---

## 9. Comandos sugeridos — **não executados**

Todos conferidos com `--help` da CLI 2.117.0, nenhum rodado contra produção.

```bash
# (a) LEITURA
npx supabase migration list --linked
npx supabase migration list --linked --output json

# (c) REPAIR — SOMENTE versões LEGADAS, uma por vez
npx supabase migration repair --status applied <versao-legada> --linked

# (e) e (i) CONFERENCIA SEM APLICAR
npx supabase db push --dry-run --linked
#   depois do repair  -> esperado: EXATAMENTE a lista fechada (pelo nome), que
#                        contem NO MINIMO estas tres:
#                        084_auth_login_attempts
#                        20260918120033_hr_workflow_idempotency_indexes_parity
#                        20261019184500_housekeeping_security_hardening
#   depois de aplicar -> esperado: 0 pendentes

# (g) APLICAR as 2 novas (o db push aplica as duas na mesma execucao)
npx supabase db push --linked

# 6. BANCO VAZIO (exige Docker)
npx supabase init && npx supabase start && npx supabase db reset
```

**Nunca rodar:**

```bash
# R1: tentaria aplicar 30 (staging) / 56 (producao) -- inclusive as legadas,
#     que NAO devem reexecutar
npx supabase db push --linked          # ANTES do repair das legadas

# pior: ignora o historico por completo
npx supabase db push --include-all

# R3: marcaria como aplicada uma migration NUNCA executada
npx supabase migration repair --status applied 20260918120033_hr_workflow_idempotency_indexes_parity --linked
#     e o mesmo vale para 20261019184500_housekeeping_security_hardening
#     e para a legada 084_auth_login_attempts (C, aplicacao real):
#     NUNCA em repair, em nenhum ambiente

# 7.1: apaga a trilha de decisoes
npx supabase migration squash
```

---

## 10. Pontos que dependem de autorização humana

| # | Ponto | Por quê |
| --- | --- | --- |
| A1 | **Qualquer comando de CLI contra produção** | A CLI escreve ("Initialising login role") mesmo para ler — R8 |
| A2 | `migration repair` nas **28 legadas** de staging | Altera o histórico |
| A3 | `migration repair` nas **54 legadas** de produção | Idem |
| A4 | Aceitar que as datas reais de aplicação **não são recuperáveis pelo ledger** | §7.2 |
| A5 | Decidir se `058`/`059` estavam aplicadas em 2026-06-24 | Só log/backup responde — §7.2 |
| A6 | Rodar `supabase init` | Cria `config.toml`, que hoje não existe |
| A7 | Convenção de nome das migrations novas | §11 |
| A8 | Aplicar a migration corretiva | Exige as medições do §12.1 |
| A9 | Escolher `create index` ou `CONCURRENTLY` | Sai das medições, não de regra fixa — §12.2 |
| A10 | Definir a janela de manutenção | §12.1(e) |
| A11 | Disponibilizar Docker (ou branch descartável) | **Teste de criação dos índices: resolvido em 2026-10-16** com PostgreSQL 17 local, sem Docker ([evidência](TESTE_LOCAL_RECONCILIACAO_INDICES_2026-10-16.md)). Continua necessário só para a reprodução completa do §6.4 |

---

## 11. Conflito de convenção

O comando oficial `supabase migration new` gera nome em **timestamp**:

```
supabase/migrations/20260918120033_hr_workflow_idempotency_indexes_parity.sql
```

O repositório usava `NNN_nome.sql` nas 93 legadas, e o `migration list` lê o prefixo como versão
(`{"local":"001","remote":"001"}`).

**Decisão aplicada:** a migration da Correção 1 foi criada pelo comando oficial
(`npx supabase migration new hr_workflow_idempotency_indexes_parity`). A versão manual `095_...` foi
**removida**.

**Consequência registrada:** o repositório passa a ter **duas convenções convivendo** — 93 arquivos
`NNN_` e **2** em timestamp, **95 no total** (eram 1 e 94 até 2026-10-19).

> **Exceção registrada (2026-10-19).** A segunda migration timestamp,
> `20261019184500_housekeeping_security_hardening.sql`, **não** saiu do `migration new`. A CLI não
> estava instalada localmente, e o `npx` a baixaria. O nome foi dado à mão **no mesmo formato**
> (`YYYYMMDDHHMMSS`, UTC), e é posterior a `20260918120033`. Funciona (o timestamp ordena depois de `094`), mas a
leitura visual do diretório fica mista. Padronizar as legadas exigiria renomear arquivos já
aplicados, o que **quebraria o casamento com o histórico remoto** — não se faz. A convivência é o
custo aceito, e daqui para frente **toda migration nova sai do `migration new`**.

---

## 12. Runbook — migration de restauração dos três índices de FK

Arquivo: `supabase/migrations/20260918120033_hr_workflow_idempotency_indexes_parity.sql`.
**Escrita e não aplicada.** A migration não autoriza aplicação por si só; este runbook é a condição.

> **O nome do arquivo diz `indexes_parity` e está impreciso.** Mantido de propósito — ele já é citado
> por documentos de evidência datados, e reescrever referência histórica para ajustar rótulo custaria
> mais que a impressão. **Esta migration não entrega paridade com a `023`:** ela restaura **3** dos
> **9** índices históricos ausentes. Ver **§13 e §14**.

### 12.1 Medições obrigatórias ANTES de produção

**CONCLUÍDO — (a) a (d), mais §12.3 e §12.4, medidos em produção em 2026-09-21.** Ver
[`PREFLIGHT_PRODUCAO_RECONCILIACAO_MIGRATIONS_2026-09-21.md`](PREFLIGHT_PRODUCAO_RECONCILIACAO_MIGRATIONS_2026-09-21.md):
11 linhas, 80 kB no total, 0 escritas em 3h02min, sem locks, sem bloqueios. A janela (e) ainda não
foi fixada.

**A medição arquivada não autoriza aplicação.** As mesmas consultas precisam ser **repetidas
imediatamente antes** de qualquer aplicação, como preflight de última hora. Todas são leitura pura,
executáveis no SQL Editor sem criar papel.

**(a) Volume de linhas**

```sql
select count(*) as linhas from public.hr_workflow_idempotency_keys;
```

**(b) Tamanho total da relação, com índices**

```sql
select pg_size_pretty(pg_total_relation_size('public.hr_workflow_idempotency_keys')) as total,
       pg_size_pretty(pg_relation_size('public.hr_workflow_idempotency_keys'))       as heap,
       pg_size_pretty(pg_indexes_size('public.hr_workflow_idempotency_keys'))        as indices;
```

**(c) Atividade de escrita — DUAS AMOSTRAS, com delta**

`create index` sem `concurrently` toma ShareLock e **bloqueia INSERT, UPDATE e DELETE** (não bloqueia
SELECT). O que importa é se há escrita **acontecendo agora**.

> **Correção de uma versão anterior deste documento.** Eu havia sugerido **uma única** consulta a
> `pg_stat_user_tables`. **Isso não mostra atividade atual:** `n_tup_ins`, `n_tup_upd` e `n_tup_del`
> são **contadores cumulativos desde o último reset de estatísticas**. Uma leitura isolada diz quanta
> escrita a tabela recebeu na vida inteira — não se está recebendo escrita agora. Uma tabela parada
> há seis meses e uma em uso intenso podem exibir o mesmo número.

**Amostra 1**, anotando o horário:

```sql
select now() as amostrado_em, n_tup_ins, n_tup_upd, n_tup_del, n_live_tup, n_dead_tup
from pg_stat_user_tables
where relid = 'public.hr_workflow_idempotency_keys'::regclass;
```

**Aguardar um intervalo definido e registrado** — sugestão: **10 minutos**, dentro da faixa de uso
real, nunca de madrugada, porque medir no vale responde à pergunta errada. **Amostra 2**: a mesma
consulta.

**Delta:**

```
escritas_no_intervalo = (ins2 - ins1) + (upd2 - upd1) + (del2 - del1)
taxa_por_minuto       = escritas_no_intervalo / minutos_do_intervalo
```

Registrar as duas amostras, o intervalo e o delta. **Se `stats_reset` mudar entre as amostras, a
medição é inválida** — os contadores zeraram:

```sql
select stats_reset from pg_stat_database where datname = current_database();
```

**(d) Transações abertas e espera por lock** — complemento obrigatório de (c). Uma transação antiga
em aberto faz o `create index` esperar por ela, com o ShareLock pendurado enquanto isso:

```sql
select pid, state, wait_event_type, wait_event,
       now() - xact_start as idade_transacao, left(query, 120) as consulta
from pg_stat_activity
where datname = current_database()
  and state <> 'idle'
  and xact_start is not null
order by xact_start;

select blocked.pid as bloqueado, blocking.pid as bloqueador,
       blocked.wait_event_type, left(blocked.query, 80) as consulta_bloqueada
from pg_stat_activity blocked
join lateral unnest(pg_blocking_pids(blocked.pid)) as b(pid) on true
join pg_stat_activity blocking on blocking.pid = b.pid;

select l.pid, l.locktype, l.mode, l.granted, l.relation::regclass
from pg_locks l
where l.relation = 'public.hr_workflow_idempotency_keys'::regclass;
```

**(e) Janela de manutenção** — definida **depois** de (a)–(d), não antes. Precisa dizer: horário,
duração máxima tolerada e quem aborta se estourar. O pico conhecido é troca de turno (6h–8h e
14h–16h); a janela não deve cair aí.

### 12.2 A decisão `create index` × `CONCURRENTLY` sai das medições

**Não há corte numérico fixo, e não invente um.** Um limiar arbitrário substitui a medição por um
palpite com cara de regra.

| Sinal de (a)–(d) | Aponta para |
| --- | --- |
| Poucas linhas, **delta de escrita ≈ 0**, sem transação antiga, janela disponível | `create index` normal |
| Volume alto, **delta de escrita > 0**, transação longa aberta, ou sem janela | `CONCURRENTLY` |

**Restrição técnica que decide o formato:** `create index concurrently` **não roda dentro de bloco de
transação** — falha com `25001`. O executor de migrations envolve cada arquivo numa transação, então
**se a decisão for `CONCURRENTLY`, os comandos não vão neste arquivo**: rodam manualmente, fora de
transação, um de cada vez; em seguida **validar por §12.3 e executar o detector orientado a alvos do
§12.4**; e **só então a migration é aplicada** — no-op por `if not exists`, servindo para registrar a
versão no histórico (§5j).

Um `CONCURRENTLY` interrompido deixa índice **inválido**, que exige `drop index` antes de tentar de
novo — o preflight de §12.3 detecta isso.

**Não afirme "sem janela" antes de (a)–(d).** A frase só é defensável depois das medições.

### 12.3 Verificação dos índices — **ANTES e DEPOIS da aplicação**

Roda **duas vezes**, com papéis diferentes:

| Momento | Papel |
| --- | --- |
| **ANTES** (§5f, preflight) | **Condição de parada.** Se algum nome esperado já existir com definição diferente ou estado inválido, o procedimento para |
| **DEPOIS** (§5h) | Confirmação de que os três nasceram corretos |

**A verificação é programática.** `pg_get_indexdef` continua na saída **apenas como apoio para
leitura humana** — a decisão não depende de inspeção visual. Cada propriedade vira coluna booleana,
e `conforme` só é `true` quando **todas** conferem.

**As três colunas são `uuid`** (`unit_id`, `workflow_id`, `actor_user_id` — declaradas na `023`,
linhas 7 a 9), e é isso que fixa os três valores esperados que a versão anterior não conferia:

| Propriedade | Esperado | Por quê |
| --- | --- | --- |
| **Operator class** | `uuid_ops`, **de `pg_catalog`**, com `opcintype = uuid`, `opcdefault = true` e `opcmethod` igual ao método encontrado | O **nome sozinho não identifica** uma opclass: `uuid_ops` pode existir em outro schema, para outro tipo ou para outro método de acesso. Conferir só `opcname` deixaria passar uma opclass homônima — o mesmo erro de confiar no nome do índice que a `023` já demonstrou |
| **Collation** | `0` (nenhuma) | `uuid` **não é tipo colacionável**; `indcollation` tem de ser `InvalidOid`. Collation não nula aqui indica índice sobre outra coisa |
| **`indoption`** | `0` | Bit 0 = `DESC`, bit 1 = `NULLS FIRST`. Zero é **ASC + NULLS LAST**, o padrão que a `023` declara ao não especificar ordenação |

```sql
with esperados(indice, coluna) as (
  values ('public.hr_workflow_idempotency_keys_unit_idx',     'unit_id'),
         ('public.hr_workflow_idempotency_keys_workflow_idx', 'workflow_id'),
         ('public.hr_workflow_idempotency_keys_actor_idx',    'actor_user_id')
)
select e.indice,
       to_regclass(e.indice) is not null                                  as existe,
       i.indrelid = to_regclass('public.hr_workflow_idempotency_keys')    as tabela_ok,
       am.amname  = 'btree'                                               as metodo_btree,
       i.indnkeyatts = 1                                                  as uma_coluna_chave,
       i.indnatts    = 1                                                  as uma_coluna_total,
       i.indnatts    = i.indnkeyatts                                      as sem_include,
       a.attname  = e.coluna                                              as coluna_ok,
       a.atttypid = 'uuid'::regtype                                       as coluna_uuid,
       oc.opcname      = 'uuid_ops'                                       as opclass_nome_ok,
       oc.opcnamespace = 'pg_catalog'::regnamespace                       as opclass_schema_ok,
       oc.opcintype    = 'uuid'::regtype                                  as opclass_tipo_ok,
       oc.opcdefault                                                      as opclass_padrao,
       oc.opcmethod    = am.oid                                           as opclass_metodo_ok,
       i.indcollation[0] = 0                                              as collation_ok,
       i.indoption[0]    = 0                                              as asc_nulls_last,
       i.indpred   is null                                                as sem_predicado,
       i.indexprs  is null                                                as sem_expressao,
       i.indisunique = false                                              as nao_unico,
       i.indisvalid                                                       as valido,
       i.indisready                                                       as pronto,
       i.indislive                                                        as vivo,
       -- APOIO PARA LEITURA HUMANA -- NAO participa do veredito:
       pg_get_indexdef(i.indexrelid)                                      as definicao_para_leitura,
       oc.opcname                                                         as opclass_encontrada,
       oc.opcnamespace::regnamespace                                      as opclass_schema_encontrado,
       oc.opcintype::regtype                                              as opclass_tipo_encontrado,
       am.amname                                                          as metodo_encontrado,
       i.indcollation[0]                                                  as collation_encontrada,
       i.indoption[0]                                                     as indoption_encontrado,
       -- VEREDITO PROGRAMATICO: so' true quando TODAS as propriedades conferem.
       coalesce(
         i.indrelid = to_regclass('public.hr_workflow_idempotency_keys')
         and am.amname  = 'btree'
         and i.indnkeyatts = 1
         and i.indnatts    = 1
         and i.indnatts    = i.indnkeyatts
         and a.attname  = e.coluna
         and a.atttypid = 'uuid'::regtype
         and oc.opcname      = 'uuid_ops'
         and oc.opcnamespace = 'pg_catalog'::regnamespace
         and oc.opcintype    = 'uuid'::regtype
         and oc.opcdefault
         and oc.opcmethod    = am.oid
         and i.indcollation[0] = 0
         and i.indoption[0]    = 0
         and i.indpred  is null
         and i.indexprs is null
         and i.indisunique = false
         and i.indisvalid and i.indisready and i.indislive,
       false)                                                             as conforme
from esperados e
left join pg_index     i  on i.indexrelid = to_regclass(e.indice)
left join pg_class     c  on c.oid = i.indexrelid
left join pg_am        am on am.oid = c.relam
left join pg_attribute a  on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
left join pg_opclass   oc on oc.oid = i.indclass[0]
order by e.indice;
```

**Leitura do resultado:**

| Momento | `existe` | `conforme` | Ação |
| --- | --- | --- | --- |
| ANTES | `false` | — | **Normal.** É o que a migration vai criar |
| ANTES | `true` | `true` | Já existe correto. A migration será no-op para ele |
| **ANTES** | **`true`** | **`false`** | 🔴 **PARE** |
| DEPOIS | `true` | `true` | ✅ Correto |
| **DEPOIS** | qualquer outro | — | 🔴 **PARE** |

> **CONDIÇÃO DE PARADA.** Um índice com o **nome esperado** mas `conforme = false` **interrompe o
> procedimento**. Basta uma propriedade divergir: outra tabela, outra coluna, coluna que não é
> `uuid`, método diferente de `btree`, `indnkeyatts`/`indnatts` diferentes de 1, `INCLUDE`,
> **opclass que não seja o `uuid_ops` padrão de `pg_catalog` para `uuid` no mesmo método**,
> **collation não nula**, **`indoption` diferente de 0**
> (`DESC` ou `NULLS FIRST`), predicado, expressão, único, ou
> `indisvalid`/`indisready`/`indislive` falso.
>
> **Não remova nada automaticamente e não rode a migration.** `if not exists` só olha o **nome**:
> ela passaria por cima em silêncio, deixando um índice errado ou inválido marcado como resolvido, e
> o histórico registraria a versão como aplicada. Isso é achado próprio, com decisão humana.

### 12.4 Detector de redundância orientado a alvos — **ANTES e DEPOIS da aplicação**

Roda **duas vezes**, como a §12.3, e com papéis diferentes:

| Momento | Papel |
| --- | --- |
| **ANTES** (§5f, preflight) | **Condição de parada.** Qualquer linha interrompe o procedimento **antes** de a migration rodar |
| **DEPOIS** (§5h) | Confirmação de que não há redundância |

Se o ambiente já tiver índice sobre a coluna-alvo com **outro nome**, esta migration criaria um
segundo índice equivalente — custo de escrita permanente, sem ganho de leitura, e **sem nada
falhar**. A §12.3 não pega esse caso: ela só olha os três nomes esperados.

#### O detector anterior estava errado — e falhava no caso principal

> **Correção de uma versão anterior deste documento.** O detector era a consulta agrupada do §12.5,
> terminada em `having count(*) > 1`. **Ela não serve como preflight**, e falha exatamente no cenário
> mais provável:
>
> - índice esperado **ausente** (é o que a migration vem criar);
> - **exatamente um** índice equivalente com outro nome.
>
> Nesse caso o grupo tem `count(*) = 1`, o `having` não dispara, e **o preflight devolve zero linhas
> — dando sinal verde para criar a redundância.** O agrupamento só enxerga duplicidade **já
> consumada**; o preflight precisa enxergar a duplicidade **prestes a acontecer**.

A consulta abaixo é orientada **aos três alvos**, não a grupos, e **não depende de `count(*)`.**

```sql
with esperados(indice_esperado, coluna_alvo) as (
  values ('public.hr_workflow_idempotency_keys_unit_idx',     'unit_id'),
         ('public.hr_workflow_idempotency_keys_workflow_idx', 'workflow_id'),
         ('public.hr_workflow_idempotency_keys_actor_idx',    'actor_user_id')
)
select e.indice_esperado,
       e.coluna_alvo,
       to_regclass(e.indice_esperado) is not null    as esperado_existe,
       i.indexrelid::regclass::text                  as indice_candidato,
       -- forma do candidato, para a analise humana
       pg_get_indexdef(i.indexrelid)                 as definicao,
       am.amname                                     as metodo,
       i.indnkeyatts                                 as colunas_chave,
       i.indnatts                                    as colunas_totais,
       i.indkey::text                                as indkey,
       oc.opcname                                    as opclass,
       i.indcollation[0]                             as collation_primeira,
       i.indoption[0]                                as indoption_primeira,
       i.indisunique                                 as unico,
       pg_get_expr(i.indpred,  i.indrelid)           as predicado,
       pg_get_expr(i.indexprs, i.indrelid)           as expressao,
       i.indisvalid,
       i.indisready,
       i.indislive
from esperados e
join pg_index     i  on i.indrelid = to_regclass('public.hr_workflow_idempotency_keys')
join pg_class     c  on c.oid = i.indexrelid
join pg_am        am on am.oid = c.relam
join pg_attribute a  on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
left join pg_opclass oc on oc.oid = i.indclass[0]
-- CANDIDATO: primeiro campo-chave e' a coluna-alvo. Deliberadamente AMPLO -- um indice
-- composto que COMECA pela coluna-alvo ja' atende consultas por ela, e portanto torna o
-- indice de coluna unica redundante na pratica.
where a.attname = e.coluna_alvo
-- E' OUTRO indice, e nao o esperado. `IS DISTINCT FROM` e' OBRIGATORIO: quando o esperado
-- esta' AUSENTE, `to_regclass` devolve NULL, e `<>` com NULL resulta NULL -- a linha seria
-- descartada pelo WHERE e o caso principal passaria batido. Era esse o defeito.
  and i.indexrelid is distinct from to_regclass(e.indice_esperado)
order by e.indice_esperado, indice_candidato;
```

**Esperado: zero linhas.**

#### Casos de aceitação do detector

Documentados para que qualquer alteração futura na consulta possa ser conferida contra eles:

| # | Cenário | Resultado exigido |
| --- | --- | --- |
| **A** | Esperado **ausente** + **um** equivalente com outro nome | **1 linha** — é o caso que o detector antigo perdia |
| **B** | Esperado **presente e correto**, nenhum outro sobre a coluna | **0 linhas** |
| **C** | Esperado **presente** + outro potencialmente equivalente | **1 linha** — devolve o outro, não o esperado |
| **D** | Somente índices sem relação com as três colunas-alvo | **0 linhas** |

**Por que D dá zero com os índices reais da `023`:** `_unique_idx` (começa por `organization_id`),
`_organization_idx`, `_action_idx`, `_status_idx`, `_expires_at_idx`, `_status_expires_at_idx`,
`_created_at_idx` e a PK (`id`) — **nenhum** tem `unit_id`, `workflow_id` ou `actor_user_id` como
**primeiro** campo-chave. O `_unique_idx` contém `actor_user_id`, mas na **segunda** posição, e por
isso não é candidato: um índice `(organization_id, actor_user_id, …)` não serve consultas que
filtram só por `actor_user_id`.

#### Limite declarado do detector

O critério é **primeiro campo-chave igual à coluna-alvo**. Isso é deliberadamente **amplo** — pega
índices compostos que lideram pela coluna — e, como todo critério, tem bordas:

- **não pega** índice cuja primeira posição é uma **expressão** sobre a coluna (ali `indkey[0] = 0`,
  e o join por `attnum` não casa);
- **não decide equivalência**: um candidato com predicado parcial, opclass diferente ou `DESC` pode
  **não** tornar o novo índice redundante.

**Por isso nenhuma linha é veredito.** O detector diz *"existe algo que pode colidir com este alvo"*;
quem decide é pessoa, comparando `pg_get_indexdef`.

#### O que fazer com o resultado

**No preflight (ANTES), qualquer linha é condição de parada:**

- **não aplicar a migration** — ela criaria o segundo índice;
- **não remover nem renomear** o índice existente automaticamente: ele pode estar em uso por
  consultas que ninguém mapeou;
- comparar `pg_get_indexdef` do candidato com o que a migration criaria e **decidir com pessoa**;
- a decisão pode ser aceitar o existente (e ajustar a migration em fatia própria) ou remover o
  existente (migration própria, com justificativa). **Nenhuma das duas sai daqui automaticamente.**

**Na confirmação (DEPOIS), zero linhas é o esperado.** Um candidato que não existia no preflight
significa que **a redundância surgiu entre o preflight e a validação posterior** — **parar e
investigar se veio da migration ou de alteração concorrente**, sem atribuir a causa sem prova.

### 12.5 Auditoria geral de duplicidade — **não é o preflight**

A consulta agrupada abaixo responde a outra pergunta: *"há, nesta tabela, grupos de índices com a
mesma forma?"*. Serve como **auditoria geral posterior** — varredura ampla, não ligada aos três
alvos.

> **Não use como detector de preflight.** Ela só dispara com `count(*) > 1`, ou seja, **duplicidade
> já consumada**. O cenário A da tabela acima passa batido por ela.

```sql
select i.indrelid::regclass                                       as tabela,
       am.amname                                                  as metodo,
       i.indnkeyatts                                              as colunas_chave,
       i.indnatts                                                 as colunas_totais,
       i.indkey::text                                             as colunas,
       i.indclass::text                                           as opclasses,
       i.indcollation::text                                       as collations,
       i.indoption::text                                          as ordenacao,
       i.indisunique                                              as unico,
       coalesce(pg_get_expr(i.indpred,  i.indrelid), '')           as predicado,
       coalesce(pg_get_expr(i.indexprs, i.indrelid), '')           as expressao,
       count(*)                                                   as quantos,
       array_agg(i.indexrelid::regclass::text order by i.indexrelid::regclass::text) as indices
from pg_index i
join pg_class c  on c.oid = i.indexrelid
join pg_am    am on am.oid = c.relam
where i.indrelid = to_regclass('public.hr_workflow_idempotency_keys')
group by 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11
having count(*) > 1;
```

**Esperado: zero linhas.** O agrupamento cobre as propriedades acima, mas **não é equivalência
completa** — `reloptions`, predicados logicamente equivalentes escritos de formas diferentes e
tablespace não entram. Cada linha exige comparação de `pg_get_indexdef` e decisão humana; remover
excedente é **migration própria**, nunca automático.

### 12.6 Rollback — condicionado à autoria, nunca ao nome

> **Correção de uma versão anterior deste documento.** O rollback era três `drop index if exists`
> incondicionais, com uma frase em prosa pedindo para não rodar onde os índices viessem da `023`.
> **Nome não é prova de autoria**, e uma frase não é uma trava: seguir o documento em **staging** —
> onde os três **já existem** e a migration é no-op — **apagaria índices que esta migration não
> criou**, deixando o ambiente pior do que antes de começar.

**O rollback só pode derrubar índice que ESTA migration criou.** A prova de autoria não está no
nome nem no catálogo: está no **registro do preflight**.

#### 12.6.1 A evidência de autoria vem do preflight, e precisa ter sido guardada

A execução de **§12.3 ANTES** da aplicação (etapa (f)) devolve, por índice, a coluna
`esperado_existe`. É ela — e só ela — que distingue os dois casos:

| `esperado_existe` no preflight | Quem criou o índice | Rollback |
| --- | --- | --- |
| `false` | **Esta migration** | Pode derrubar |
| `true` | Já existia antes (`023`, ou outro caminho) | 🔴 **NÃO derrubar** |

**Se o preflight não foi guardado, a autoria é desconhecida.** Nesse caso o rollback **não é
executável**: veja 12.6.3.

#### 12.6.2 Rollback, um índice por vez, só onde a autoria for desta migration

Rodar **apenas** as linhas correspondentes aos índices cujo preflight registrou
`esperado_existe = false`:

```sql
-- SO' para o indice cujo preflight (§12.3 ANTES) registrou esperado_existe = false.
-- Conferir o registro do preflight ANTES de descomentar cada linha.
-- drop index if exists public.hr_workflow_idempotency_keys_unit_idx;
-- drop index if exists public.hr_workflow_idempotency_keys_workflow_idx;
-- drop index if exists public.hr_workflow_idempotency_keys_actor_idx;
```

**As três linhas vêm comentadas de propósito.** Descomentar é o gesto que exige olhar o registro do
preflight; um bloco pronto para colar inteiro é o que produz o acidente que esta seção existe para
impedir.

**Conferência de sanidade antes de derrubar** — confirma que o índice existe e mostra a definição,
para o operador comparar com o que o preflight registrou:

```sql
select to_regclass('public.hr_workflow_idempotency_keys_unit_idx')     as unit_idx,
       to_regclass('public.hr_workflow_idempotency_keys_workflow_idx') as workflow_idx,
       to_regclass('public.hr_workflow_idempotency_keys_actor_idx')    as actor_idx;
```

#### 12.6.3 Dúvida de autoria: **PARAR E INVESTIGAR**

Se o registro do preflight **não existir, estiver incompleto ou for contraditório** — por exemplo,
`esperado_existe = false` no preflight mas o índice tem `create` anterior à janela da operação —
**o rollback não roda.** Não há como distinguir, pelo catálogo, um índice criado por esta migration
de um criado pela `023`: a definição resultante é **idêntica**.

Caminhos de investigação, antes de qualquer `drop`: o registro do preflight arquivado (§8), o log de
operação de quem aplicou, e a comparação com o outro ambiente. **Nenhum deles sai deste documento
automaticamente.**

#### 12.6.4 O que o rollback não desfaz

- **Não há perda de dado**: índice é estrutura derivada, reconstruível a partir da `023` ou desta
  migration.
- **Não remove a versão do ledger.** Derrubados os índices, a versão continua registrada como
  aplicada e o estado real deixa de corresponder — a situação que esta reconciliação existe para
  evitar. Nesse caso, e só nesse, `migration repair --status reverted <versao>` é a forma de
  **remover o registro** (§7.2).
- **Em staging o rollback não tem caso de uso.** Lá a migration é no-op quanto aos índices: ela não
  cria nada, logo não há nada que ela tenha criado para desfazer.

---

## 13. Decisão sobre os nove índices históricos ausentes de `hr_workflow_idempotency_keys`

> **Esta seção reescreve o objeto da Correção 1.** Ela nasceu de um achado do preflight de produção
> de 2026-09-21: a caracterização original do drift — "faltam 3 índices" — estava **errada por um
> fator de três**.

### 13.1 O achado que reabriu a reconciliação

| | |
| --- | --- |
| **Estado histórico da `023`** | **11 índices** (1 da primary key + 10 por `create index`) |
| **Estado medido em produção** (2026-09-21) | **2 índices** — `_pkey` e `_unique_idx` |
| **Ausentes** | **9** |
| **Restaurados nesta correção** | **3** — `unit_idx`, `workflow_idx`, `actor_idx` |
| **Deliberadamente não restaurados** | **6** |

**Como o achado apareceu:** a aritmética do tamanho não fechava. Staging tinha 11 índices, 0 linhas,
88 kB — 8 kB por índice, exato. Produção reportou **32 kB** com 11 linhas, quando 8 índices populados
exigiriam **≥ 128 kB**. A consulta que verificou devolveu 2.

**Nenhum dos quatro documentos do pacote teria revelado isso** — todos repetiam o número relatado
pela auditoria original.

### 13.2 O objetivo mudou de nome

Este plano **não** entrega paridade com a `023`, e não deve dizer que entrega:

```
OBJETIVO: reconciliação seletiva dos índices atualmente justificados —
          restauração dos três índices de FK selecionados.

NÃO É: paridade completa com a migration 023.
```

Aplicada a correção, produção terá **5 dos 11** índices da `023`. Os outros 6 seguem ausentes **por
decisão registrada**, não por omissão.

### 13.3 O que sustenta cada decisão — o levantamento de uso

Auditoria local do repositório (sem acesso remoto). **Todo acesso à tabela**:

| Origem | Operação | Predicado |
| --- | --- | --- |
| `src/lib/hr/workflow-mutations.ts:795` | `SELECT` | `organization_id` + `actor_user_id` + `action` + `idempotency_key` |
| 8 RPCs (`025`–`031`, `040`) | `SELECT … for update` | **idêntico** |
| idem | `INSERT` | linha completa |
| idem | `UPDATE` | **`where id = …`** (primary key) |
| `024` | trigger `before update` | `updated_at` |

**Nenhuma consulta filtra isoladamente por `unit_id`, `workflow_id`, `actor_user_id`, `action`,
`status`, `expires_at` ou `created_at`.**

É por isso que produção funciona hoje com dois índices: **os dois que ela tem são exatamente os dois
que o código usa** — o `unique_idx` para toda leitura, a PK para toda escrita.

### 13.4 Nenhuma remoção foi intencional

`grep` por `drop index`, `alter index` e `rename index` nas 94 migrations *(eram 94 na data do grep;
a 95ª, `20261019184500_housekeeping_security_hardening`, não contém nenhum dos três)*: as únicas ocorrências são
**blocos de rollback comentados** nas migrations `084`, `087` e `089`, e **nenhuma menciona esta
tabela**. Os nove nomes aparecem só na `023`.

**Isso é evidência de drift, não prova de desnecessidade.** Ninguém decidiu remover — eles nunca
chegaram lá. Nove de dez `create index` ausentes, com o primeiro (`_unique_idx`) presente, reforça a
hipótese de aplicação parcial já registrada na §3.2, agora em escala maior.

---

## 14. Matriz de decisão dos nove índices ausentes

### 14.1 Os três RESTAURADOS

| Índice | Definição | Existia na `023` | Produção atual | Uso atual | Cobertura/redundância | Decisão | Justificativa | Reavaliar quando |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `_unit_idx` | `(unit_id)` | ✔ | **ausente** | Nenhuma consulta | **Não coberto** — nenhum índice tem `unit_id` como leading column | **RESTAURAR** | FK para `units` (`on delete restrict`); checagem de integridade latente | — |
| `_workflow_idx` | `(workflow_id)` | ✔ | **ausente** | Selecionado, nunca filtrado | **Não coberto** | **RESTAURAR** | FK para `hr_workflows` (`on delete restrict`) | — |
| `_actor_idx` | `(actor_user_id)` | ✔ | **ausente** | Nunca isolado | **Não coberto** — `actor_user_id` está na **2ª posição** do `unique_idx`, e composto não substitui filtro isolado | **RESTAURAR** | FK para `app_users` (`on delete restrict`) | — |

> **Ressalva honesta sobre a força deste motivo.** A aplicação usa **soft delete** (`deleted_at`) para
> usuários, unidades e organizações — não há `.delete()` físico em nenhum deles. As checagens de FK
> `restrict` **praticamente não disparam hoje**. A justificativa é de **integridade latente e paridade
> estrutural de FK**, não de performance atual. Dito assim para ninguém futuro achar que havia
> medição de ganho por trás.

### 14.2 Os seis DELIBERADAMENTE NÃO RESTAURADOS

| Índice | Definição | Existia na `023` | Produção atual | Uso atual | Cobertura/redundância | Decisão | Justificativa | Reavaliar quando |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `_organization_idx` | `(organization_id)` | ✔ | ausente | Nenhuma consulta isolada | **REDUNDANTE** — o `unique_idx` **começa** por `organization_id` | **NÃO RESTAURAR — REDUNDANTE** | Por regra de prefixo de btree, o composto atende filtro isolado por `organization_id` | Se o `unique_idx` for alterado ou removido |
| `_action_idx` | `(action)` | ✔ | ausente | Sempre junto com org + actor + key | **NÃO é redundante por cobertura** — ver 14.3 | **NÃO RESTAURAR — SEM USO ATUAL** | Ausência de consultas isoladas por `action`; cardinalidade baixa (CHECK limita os valores); tabela pequena; nenhum consumidor operacional | Se surgir consulta isolada, relatório ou filtro por `action` |
| `_status_idx` | `(status)` | ✔ | ausente | Selecionado, nunca filtrado | Baixa seletividade (`processing`, `completed`, `failed`) | **NÃO RESTAURAR — SEM USO ATUAL** | Nenhum filtro atual por `status`; cardinalidade baixa; sem evidência operacional | Se existirem filas, cleanup ou filtros por `status` |
| `_expires_at_idx` | `(expires_at)` | ✔ | ausente | **Nunca lido** | — | **NÃO RESTAURAR — CLEANUP AUSENTE** | `expires_at` é escrito e nunca consultado; não existe job que consuma o campo | **Antes** de implementar retenção/TTL real (§15) |
| `_status_expires_at_idx` | `(status, expires_at)` | ✔ | ausente | **Nunca lido** | Lidera por `status` | **NÃO RESTAURAR — CLEANUP AUSENTE** | Não existe consulta por `status + expires_at`; não existe cleanup | Junto com a eventual implementação do cleanup |
| `_created_at_idx` | `(created_at)` | ✔ | ausente | Nunca filtrado nem ordenado | — | **NÃO RESTAURAR — SEM USO ATUAL** | Nenhuma consulta filtra ou ordena por `created_at` | Se surgirem relatórios ou auditorias por data de criação |

### 14.3 `action_idx` NÃO é redundante por cobertura — correção de um erro de análise

> **Correção de uma versão anterior desta análise.** O `action_idx` foi classificado como
> "REDUNDANTE — 3ª posição do `unique_idx`". **Está errado, e o erro é de mecânica de índice.**

O `unique_idx` é:

```
(organization_id, actor_user_id, action, idempotency_key)
```

Um btree composto só serve filtros que usam um **prefixo** das colunas. Para um filtro **isolado por
`action`** não existe prefixo utilizável — `action` está na terceira posição, e o planejador não
consegue usar o índice para isso.

A análise anterior conflacionou duas coisas distintas:

| Afirmação | Verdade |
| --- | --- |
| *"`action` sempre aparece junto com as outras três colunas"* | **Verdadeira** — e é o motivo real da decisão |
| *"o `unique_idx` cobre `action`"* | **Falsa** — não há prefixo para filtro isolado |

**A decisão de não restaurar se apoia em ausência de uso, não em cobertura.** Se amanhã aparecer uma
consulta que filtre só por `action`, **nenhum índice existente vai atendê-la**, e o
`_action_idx` volta à mesa.

**O mesmo raciocínio, aplicado ao `organization_idx`, dá o resultado oposto** — e por isso a
classificação dele é diferente: `organization_id` **é** a primeira coluna, o prefixo existe, e a
cobertura é real.

### 14.4 `status_expires_at_idx` — o que ele atenderia e o que não atenderia

Registrado porque a distinção decide a reavaliação futura:

```
(status, expires_at) ATENDE   filtro que COMEÇA por status
                              -- ex.: where status = 'completed' and expires_at < now()

(status, expires_at) NÃO ATENDE   filtro isolado por expires_at
                                  -- ex.: where expires_at < now()
```

**Um cleanup que varra por vencimento sem filtrar status precisaria de `_expires_at_idx`, não deste
composto.** Quando o cleanup for desenhado (§15), é a forma da consulta dele que decide qual dos dois
— ou se os dois — fazem sentido. **Não criar por antecipação.**

---

## 15. Dívida separada — TTL/cleanup não implementado

```
TTL/cleanup de hr_workflow_idempotency_keys NÃO está implementado.
```

**Não é para resolver nesta correção.** Registrado aqui para não virar descoberta futura.

O estado medido no repositório:

- **`expires_at` existe** — `not null default (now() + interval '48 hours')`, com CHECK
  `expires_at > created_at`;
- **a retenção conceitual é de 48h**, declarada no schema da `023`;
- **nenhum job ou cleanup atual remove registros expirados** — não há `delete from
  hr_workflow_idempotency_keys` em migration, RPC, rota, job ou teste;
- os tipos de job existentes (`sla_scan`, `escalation_scan`, `notification_dispatch`,
  `audit_cleanup`, `analytics_refresh`, `dashboard_refresh`, `training_expiration_scan`,
  `occupational_expiration_scan`) **não tocam esta tabela**.

**Consequência:** o TTL está declarado no schema e não é aplicado em lugar nenhum. A tabela cresce
sem poda — devagar (11 linhas em produção), mas sem mecanismo.

**Os índices relacionados a `expires_at` devem ser reavaliados quando esse consumidor for
implementado** — e não antes. Criar índice para um consumidor que não existe é custo de escrita sem
leitura, que é o defeito que a §14 recusa nos outros cinco casos.

**Não criar job. Não criar cron. Não criar índice por antecipação.**

---

---

## 16. Teste em banco descartável — cenário atualizado após o achado

```text
TESTE DESCARTÁVEL: CONCLUÍDO COM SUCESSO — 2026-10-16
```

Executado em PostgreSQL 17 local descartável (`hotel_galli_migration_test`), sem Docker. Evidência:
[`TESTE_LOCAL_RECONCILIACAO_INDICES_2026-10-16.md`](TESTE_LOCAL_RECONCILIACAO_INDICES_2026-10-16.md).

| Passo | Resultado |
| --- | --- |
| Estado inicial | 2 índices (`_pkey`, `_unique_idx`) |
| 1. Aplicar | **5 índices**, os esperados |
| 2. §12.3 | Os três com `existe = true`, `conforme = true` |
| 3. §12.4 | **0 linhas** |
| 4. Reaplicar | No-op. Total continua **5** |
| 5. Seis não restaurados | **Ausentes.** A listagem final tem só os 5 nomes esperados |
| 6. Rollback | **Não exercitado** neste teste. Continua regido pelo §12.6 |

*Texto original desta seção, mantido como registro:* ~~Continua BLOQUEANTE. Não executar agora.
Docker indisponível (§6.3).~~

O cenário mudou com o achado da §13: não é mais "aplicar em banco vazio", porque **nenhum ambiente
real tem o estado de partida relevante** — staging tem 11 índices, produção tem 2 mas é produção.

### Estado inicial exigido

```
- tabela com a estrutura atual de public.hr_workflow_idempotency_keys;
- 11 linhas de teste, ou massa mínima equivalente;
- APENAS dois índices:
    hr_workflow_idempotency_keys_pkey
    hr_workflow_idempotency_keys_unique_idx
```

### Sequência

1. **Aplicar a migration corretiva.**

   **Resultado esperado: 5 índices no total.**

   ```
   hr_workflow_idempotency_keys_pkey
   hr_workflow_idempotency_keys_unique_idx
   hr_workflow_idempotency_keys_unit_idx
   hr_workflow_idempotency_keys_workflow_idx
   hr_workflow_idempotency_keys_actor_idx
   ```

2. **§12.3** → os **três restaurados** com `conforme = true`.

3. **§12.4** → **0 concorrentes inesperados**.

4. **Reaplicar a migration** → **no-op / idempotente**, sem erro e sem índice novo.

5. **Confirmar que os seis deliberadamente não restaurados continuam ausentes:**

   ```
   organization_idx · action_idx · status_idx
   expires_at_idx · status_expires_at_idx · created_at_idx
   ```

   **Este passo é tão importante quanto o 1.** Ele prova que a migration faz **exatamente** o que a
   §14 decidiu — nem menos, nem mais. Uma migration que restaurasse os nove passaria nos passos 1 a
   4 e falharia aqui, e é justamente essa a diferença entre o pacote atual e o que ele era antes da
   §13.

6. **Rollback**, quando aplicável (§12.6): derrubar só os índices cujo preflight registrou
   `esperado_existe = false`, e confirmar que a tabela volta a **2 índices**.

**Nenhum ambiente real serve como substituto.** Staging tem 11 e produção é o alvo que se quer
proteger.
