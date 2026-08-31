# 74 — Plano: corrigir o `errcode` do `ROOMS_TRANSITION_STALE`

Status: **plano para revisão. Nenhum código escrito.**
Corrige um defeito **em produção**, introduzido pela migration
[089](../../supabase/migrations/089_room_state_three_dimensions.sql) e encontrado pela suíte
E2E do plano [70](70-plano-estado-apartamento-tres-dimensoes.md) (caso 16a).

Área sensível: **migration**. O Wilson aplica nos dois bancos; ninguém mais.

> Numeração: 71, 72 e 73 já estão reservados por nome no plano 70 (tela de Governança,
> escala/folha impressa, navegação mobile). Este plano é o 74 para não colidir com eles.

---

## 1. O sintoma

**A requisição pendura até o timeout em vez de devolver 409, com a conexão presa em transação
abortada até o servidor recolher.** A tradução para 409 em
[`transitions/route.ts:182`](../../src/app/api/base/rooms/transitions/route.ts#L182) está
correta e **nunca chega a rodar, porque a resposta não volta**.

O que isso é na operação: duas governantas no mesmo apartamento ao mesmo tempo — uma manhã de
arrumação com duas pessoas no mesmo andar — e a pessoa fica olhando para uma tela travada.
Clica de novo, a segunda requisição também pendura. Ninguém vê a mensagem de "recarregue e
tente novamente", que existe e está certa.

### 1.1 O que este plano NÃO afirma

A primeira leitura foi de que isso seria **vazamento acumulativo de conexão do pool**. A
medição não sustenta: conferido depois, não havia nenhuma conexão em
`idle in transaction (aborted)` acumulada — o servidor recolhe sozinho. Fica registrado para o
plano não guardar um susto errado, e para ninguém dimensionar a urgência pelo motivo errado. A
urgência é a tela travada na mão da governanta, não o banco ficando sem conexão.

---

## 2. A evidência

### 2.1 Os quatro controles

Os quatro caminhos de exceção da `rooms_apply_transition`, chamados direto por service role.
Três respondem; um trava. A **única** variável que os distingue é o `errcode`:

| Caminho | `errcode` | Resposta |
| --- | --- | --- |
| `ROOMS_TRANSITION_EMPTY_BATCH` | `22023` | **313 ms** |
| `ROOMS_TRANSITION_NO_WRITER` | `22023` | **210 ms** |
| `ROOMS_TRANSITION_ROOM_NOT_FOUND` | `22023` | **159 ms** |
| `ROOMS_TRANSITION_STALE` | **`40001`** | **trava** — sem resposta em 25 s (o teste estourou em 60 s) |

Reproduzido fora do Playwright, com chamada direta à RPC e um `from` divergente do estado real
do apartamento.

### 2.2 `pg_stat_activity` durante o travamento

```
pid 2266592 | idle in transaction (aborted) | wait_event_type: null
query: WITH pgrst_source AS (SELECT pgrst_call...
```

`wait_event_type` **nulo** derruba a hipótese concorrente de que o próprio teste estivesse
segurando lock no apartamento: **não há espera por lock**. A exceção dispara, a transação
aborta, e a resposta simplesmente não volta ao cliente.

---

## 3. Por que `40001` estava errado desde a origem

`40001` é `serialization_failure`. É o código que **o Postgres levanta quando ele detecta
conflito de serialização** — o motor percebeu que duas transações não podem ser ordenadas e
abortou uma.

Não é o que acontece aqui. Aqui é a **aplicação** comparando um valor lido com um relido sob o
lock e concluindo divergência: **concorrência otimista de nível de negócio, não do motor**. O
Postgres nunca detectou conflito nenhum; quem detectou fomos nós.

A consequência é geral, e é o ponto: **qualquer camada que trate `40001` como transitório vai
agir errado — e estará certa em agir assim.** Repetir uma transação que o motor abortou por
serialização é exatamente o comportamento correto de um cliente; é para isso que o código
existe. O PostgREST faz isso, e faria qualquer pool ou driver bem escrito. O defeito não é da
camada que repete: é nosso, por ter usado um código reservado para outra coisa.

Escolhi `40001` na revisão da 089 por parecer semanticamente certo — "é concorrência, não
falha". É precisamente essa aparência que torna o erro difícil de ver em revisão de código, e
por isso ele passou.

---

## 4. A correção

`errcode = '22023'` no `ROOMS_TRANSITION_STALE`, igual às outras três exceções da função.
`22023` é `invalid_parameter_value` — nenhuma camada o trata como transitório, e é o que as
outras três já usam.

**Nenhuma mudança em TypeScript.** A rota casa por MENSAGEM
(`rpcError.message.includes("ROOMS_TRANSITION_STALE")`), não por código, então o 409 volta a
funcionar sozinho assim que a resposta passar a chegar. Isso não foi sorte de desenho, mas
vale registrar que foi o que evitou uma segunda fatia.

---

## 5. Migration 090

Número: **090**. Só a função; nenhuma tabela, coluna, tipo, policy ou grant de perfil.

1. **Cabeçalho com a premissa:** a 089 já está aplicada em **staging (`jascnmgagejlvjlenduv`)**
   e em **produção (`chnamldrlwohaudmjrez`)**, e a 090 assume isso. Ela não recria coluna, tipo
   nem permissão — só substitui o corpo da função.
2. **`create or replace` da `rooms_apply_transition` INTEIRA**, idêntica à versão corrigida da
   089, com **uma única diferença**: `errcode = '22023'` no `ROOMS_TRANSITION_STALE`. Nada
   mais. A função vai inteira, e não em pedaço, porque `create or replace` substitui o corpo
   todo — versionar só o trecho alterado deixaria o arquivo mentindo sobre o que está no banco.
3. **Repetir os `revoke` e o `grant` no fim.** `create or replace` **não** reseta ACL, então
   eles são tecnicamente redundantes aqui — mas são baratos e tornam a migration
   **auto-curativa**: aplicada num banco onde alguém tenha reaberto a função, ela fecha de
   novo. É a mesma trava que o caso 20 da suíte E2E protege pelo lado do teste.

### 5.1 O que a 090 NÃO faz

- Não toca em `rooms`, `room_status_history`, enums, índices, `CHECK` ou perfis.
- Não repete o backfill. A guarda do backfill da 089
  (`not exists (select 1 from room_status_history)`) já está permanentemente desligada em
  staging — a suíte E2E gravou histórico. Isso é esperado e está registrado no plano 70.
- Não cria migration de dados. Nenhuma linha de `room_status_history` gravada até aqui está
  errada: o defeito impedia gravação, nunca produziu gravação torta.

**Decorrência operacional, e é o que importa na hora de aplicar: a 090 pode ser aplicada com o
app no ar, sem janela de manutenção.** Ela não altera schema, não altera dado, e a assinatura
da função não muda — nenhuma requisição em voo quebra. É o oposto da 089, que exigia ordem
estrita entre banco e deploy (reverter o app antes de dropar as colunas).

---

## 6. Seção VALIDACAO (dentro do arquivo, para rodar após aplicar)

1. **A ACL continua fechada** — a consulta de `proacl` da 089, esperando `service_role=X` e
   nada de `anon=X`, `authenticated=X`, ou `=X/` sem papel antes do igual.
2. **O STALE agora responde**, em tempo comparável aos outros três caminhos: chamar a RPC com
   um `from` divergente e conferir que volta `22023 ROOMS_TRANSITION_STALE` na casa das
   centenas de milissegundos — e não que pendura.
3. **Nada foi gravado** por essa chamada recusada: contagem de `room_status_history` do
   apartamento igual antes e depois.

---

## 7. Seção ROLLBACK

`create or replace` de volta para `errcode = '40001'`, com a advertência explícita de que
**isso reintroduz o travamento descrito na §1** — a requisição volta a pendurar até o timeout
em vez de devolver 409. O rollback existe por completude do padrão, não porque seja desejável.

---

## 8. Conferência de sintaxe antes de entregar

Obrigatória, e pelo motivo concreto: foi assim que a 089 quebrou na mão do Wilson (uma quebra
de linha real dentro de `E'...'` num comentário fez a linha seguinte virar SQL solto, e o
arquivo inteiro falhou com 42601).

- Nenhuma linha executável depois do último `grant`.
- `$$` balanceados.
- Nenhuma quebra de linha real dentro de literal em comentário.

---

## 9. Depois de aplicada

- **O caso 20 da suíte E2E roda de novo, obrigatoriamente.** É exatamente o cenário que ele
  protege: um `create or replace` distraído reabrindo a função. Esta migration é um
  `create or replace`.
- **Casos 16a e 17 passam a rodar de verdade.** O 16a hoje estoura o timeout; o 17 falha por
  dano colateral (a requisição de restauração do 16a, morto pelo timeout, chega no meio dele).
  Nenhum dos dois precisa de mudança no teste.

---

## 10. Fora desta migration, mas na mesma entrega

**Caso 18 — correção no teste, já autorizada.** É defeito do teste, não do produto: o output
provou as duas linhas, mesmo `changed_at`, `previous_status: "inspected"` real e não null. Usei
`new Date()` do cliente como fronteira contra o `now()` do banco — relógio de cliente como
corte nunca funciona. Correção: tirar o corte do próprio banco (`select now()` antes do setup)
ou filtrar por dimensão e valores esperados. **A asserção que importa continua sendo as duas
linhas com `previous_status` real.**

**Caso 17 — nada a fazer.** Resolve sozinho quando o 16a parar de travar.

**Dívida registrada, não corrigida nesta fatia.** A rota casa o erro por
`includes("ROOMS_TRANSITION_STALE")`, e não por `rpcError.code` — funciona por acidente, não
por desenho. Mudar isso junto com a correção do `errcode` aumentaria superfície sem
necessidade. Para a dívida não morrer num parágrafo que ninguém relê, ela está registrada
também em [`docs/NAO_ALTERAR.md`](../NAO_ALTERAR.md), seção Banco e APIs: se a rota passar a
casar por código, o `errcode` da RPC vira **contrato** entre os dois lados.

---

## 11. Critério de pronto

- Migration 090 escrita, com VALIDACAO e ROLLBACK, e **não aplicada pelo Codex**.
- Conferência de sintaxe da §8 feita e reportada.
- Aplicada pelo Wilson em staging e produção, com a §6 rodada nos dois.
- Suíte E2E do plano 70 **17 de 17**, incluindo o caso 20 reexecutado depois da aplicação.
- `npx tsc --noEmit` limpo e `npm run test:unit` verde (187) — nenhum dos dois é afetado, e é
  isso que se espera confirmar.
- Nenhum resíduo em staging.

---

## 12. Branch

`feat/estado-apartamento-tres-dimensoes` — mesma fatia. O defeito nasceu nela e é corrigido
nela, antes do merge.
