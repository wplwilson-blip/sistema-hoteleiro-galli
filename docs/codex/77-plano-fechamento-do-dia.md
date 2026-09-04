# 77 — Plano: fechamento do dia, sobra e a fila legível

Status: **plano para revisão. Nenhum código escrito.**
Continua o [75](75-plano-dia-da-governanca.md), aplicado e validado nos dois bancos.

Área sensível: **migration**. O Wilson aplica no Supabase; ninguém mais.

**Ordem da linha de trabalho:** `77` → `73` (navegação mobile) → `71` (a tela). O 73 é
**portão**, não fatia seguinte: a casca do app não tem navegação abaixo de 1024px
([`app-sidebar.tsx:319`](../../src/components/layout/app-sidebar.tsx#L319) é `hidden … lg:flex`,
e não há hambúrguer nem drawer em `src/components/layout/`). Construir a tela antes produziria
algo que funciona no desktop do revisor e não na mão de quem vai usar.

**Este plano não desenha a tela.** Entrega o modelo e as rotas que ela vai consumir.

---

## 1. O que falta

O modelo do dia existe e funciona, mas **o dia não termina**. Não há como fechá-lo, e por isso:

- **A fila de hoje se mistura com a sobra de ontem.** Uma tarefa `pending` de sexta é
  indistinguível de uma tarefa `pending` de segunda — as duas dizem "ainda não foi feito", e
  nenhuma diz "o dia acabou e ficou sem fazer".
- **A tela não tem de onde ler a fila.** A API tem três rotas — `GET /rooms`,
  `POST /rooms/transitions`, `POST /rooms/days` — e **nenhuma** devolve o dia com suas tarefas.
  A tela nasceria sem fonte de dados.
- **Não existe rota de dispensa.** A D3 do plano 75 desenhou o desfecho `declined` com origem, e
  não há por onde registrá-lo.

---

## 2. Decisões

### D1 — Fechar o dia com pendência é PERMITIDO

Um sistema que proíbe encerrar é um sistema que ensina a mentir para poder fechar: a governanta
marcaria como arrumado o que não foi, só para o botão liberar.

**O número de pendentes aparece na confirmação e fica registrado no fechamento.** Fechar não é
esconder — é dizer "o dia acabou assim".

**Alternativa descartada: bloquear o fechamento com pendências.** Produz dado falso no primeiro
dia corrido, e o dado falso é permanente enquanto a pendência esquecida seria temporária.

### D2 — Ao fechar, as pendentes viram `not_done`

Valor novo no enum `housekeeping_task_outcome`.

Separa **"ficou sem arrumar e o dia fechou"** de **"está pendente porque o dia ainda está
aberto"**. Sem isso a fila de hoje se mistura com a sobra de ontem, e um quarto que ficou sem
arrumar é justamente o que a governanta quer ver no dia seguinte.

**O bicondicional da D2.1 do plano 75 continua valendo sem alteração:** `service_type` preenchido
**se e somente se** `outcome = 'done'`. `not_done` entra do lado do trabalho **não** feito, que é
o que ele é. O `CHECK` existente já cobre o valor novo — nenhuma constraint muda.

### D3 — O dia que ninguém fechou é AVISADO, nunca fechado sozinho

Se a governanta esquecer de fechar sexta, as tarefas de sexta ficariam `pending` para sempre e o
`not_done` nunca aconteceria — perdendo exatamente o dado que a D2 existe para produzir.

**(a) Abrir o dia seguinte fecha o anterior automaticamente.** Resolve sozinho.
**(b) A tela avisa "o dia 04/09 continua aberto" e ela fecha com um clique.** ← **decidido**
**(c) Não fazer nada.** Dias abertos eternos.

**Por que (b).** Fechamento automático é **mudança de estado silenciosa** — o sistema decidindo
por alguém que não ficou sabendo. Esta linha de trabalho já recusou isso três vezes, sempre pelo
mesmo motivo: no `available` que liberava para venda sozinho (plano 70), na dispensa que não
podia virar transição (75, §3), e na UI otimista que pintaria antes da confirmação (70, §6.3c).
Custa um passo e é explícito.

A **rota de leitura** devolve os dias anteriores em aberto junto com o dia corrente — é o que
permite a tela avisar sem uma segunda consulta.

### D4 — Reabrir devolve APENAS as `not_done` para `pending`

Quarto atrasado às 18h depois do fechamento das 17h acontece. Proibir reabrir faria o dado ficar
errado nos **dois** dias: o de hoje sem o trabalho, e o de amanhã com um trabalho que não é dele.

`done`, `declined` e `cancelled` ficam **intactas**.

#### Por que a assimetria com o desbloqueio é justificada

No desbloqueio (plano 75, §5.6.1) a regra é o inverso: ressuscita **só** `cancelled`, e nunca
`done` nem `declined`. Aqui ressuscitamos `not_done`. **As naturezas são diferentes, não a
regra.**

`done` e `declined` são **fatos consumados** — alguém arrumou, ou o hóspede recusou. Desbloquear
um quarto não desfaz nenhum dos dois.

`not_done` **não é fato consumado**: é o registro de que **o dia acabou antes do trabalho**.
Reabrir o dia desfaz exatamente essa premissa. Não estamos apagando um fato — estamos corrigindo
uma conclusão que deixou de valer.

### D5 — A reabertura é registrada num LOG DE EVENTOS, não em colunas

Reabrir zera `closed_at`/`closed_by`. **Isso perde que o dia chegou a ser fechado** — e é raro,
mas é o tipo de coisa que alguém vai querer saber um dia ("esse dia foi fechado às 17h e reaberto
às 18h?").

**(a) Colunas `reopened_at`/`reopened_by`/`reopen_count`.** Barato. Perde o `closed_at`
anterior, e a segunda reabertura sobrescreve a primeira.
**(b) Tabela `housekeeping_day_events`.** ← **decidido**
**(c) `system_logs` genérico.** Existe, mas vira texto: não dá para perguntar "quantos dias
foram reabertos em setembro" sem varrer string.

**Por que (b).** É a única que responde **quantas vezes, quando e por quem**, preservando cada
fechamento que houve. `housekeeping_days` continua guardando o **estado atual**
(`closed_at` nulo = aberto agora); a tabela de eventos guarda a **trilha**.

E ela absorve, de brinde, o registro que a D1 pede: **o número de pendentes no momento do
fechamento vive no evento de fechamento**. Não pode ser derivado depois — reabrir converte
`not_done` de volta em `pending`, e a contagem daquele momento seria irrecuperável.

**Custo declarado:** uma tabela a mais, e três eventos por dia no caso normal (abertura,
fechamento; reabertura é exceção).

### D6 — A sobra ACUMULA: "desde quando", não "de ontem"

A tarefa de hoje **nasce marcada como sobra** quando o mesmo apartamento ficou `not_done` no
último dia registrado. Um aviso com link seria informação que a governanta vê uma vez e esquece;
a marca na própria tarefa está lá **no momento em que ela olha aquele apartamento**.

**E a sobra precisa saber DESDE QUANDO.** Um quarto sem arrumar desde sexta que continua sem
arrumar no sábado deve **acumular, não resetar**: "sobra desde sexta" conta uma história
diferente de "sobra de ontem". É o mesmo raciocínio do `housekeeping_changed_at` — "Sujo" sozinho
não conta a história toda.

#### Como

Duas colunas em `housekeeping_tasks`:

- **`carried_over_since date`** — a data em que o apartamento ficou `not_done` **pela primeira
  vez** nesta sequência. Nulo quando não é sobra.
- **`carried_over_days integer`** — quantos dias a sequência já dura. Redundante com a data, e é
  de propósito: a tela e os relatórios perguntam "há quantos dias" com muito mais frequência do
  que "desde qual data", e derivar exigiria contar dias úteis do calendário da unidade.

**A propagação é o ponto:** ao abrir o dia, a tarefa nova copia o `carried_over_since` da tarefa
anterior **se já houver um** — e só usa a data do dia anterior quando a sequência começa ali.
Copiar a data de ontem sempre é justamente o "reset" que a decisão recusa.

**Só `not_done` carrega.** `declined` não é sobra — nada ficou por fazer, o hóspede recusou.
`cancelled` também não: o apartamento saiu de operação.

#### A ordem que quebra isso, e como fica resolvida

A governanta abre o dia de segunda às 8h e **só então** fecha o de sexta, às 8h05. As tarefas de
segunda já foram criadas — sem a marca, porque às 8h as de sexta ainda eram `pending`, não
`not_done`.

**O fechamento também aplica a marca**: ao converter `pending → not_done`, a RPC de fechamento
propaga a sobra para as tarefas **ainda abertas** de dias posteriores daquele apartamento. Sem
isso, a marca dependeria da ordem em que ela clicou — e a ordem errada é a mais provável, porque
abrir o dia é a primeira coisa que ela faz de manhã.

### D7 — "A governanta" não é uma pessoa: é uma função com três ocupantes

**Governanta, gerente operacional, e a camareira que cobre a folga.** As três fazem o serviço
inteiro — lançam arrumação, vistoriam, abrem e fecham o dia. **Todas com `LIDER_GOVERNANCA`
completo**, vistoria inclusa. O gerente operacional é hierarquia **acima** da governanta, então o
acesso não é lateral. Não há supervisora de andar.

**Isso derruba a premissa "um perfil só, a governanta" que atravessou os planos 70, 74 e 75.**

**Não muda migration nenhuma:** o perfil já existe desde a 089 e `changed_by` já é gravado em
toda transição — o histórico separa quem foi. Muda o **texto** dos planos e, principalmente, a
suposição de que existe uma única pessoa cujo turno delimita o dia.

**A consequência de desenho, e é ela que importa:** duas dessas pessoas podem estar operando ao
mesmo tempo. A trava de concorrência da 090 (`ROOMS_TRANSITION_STALE` → 409) deixa de ser cenário
teórico e passa a ser **rotina de fim de semana**. A tela precisa tratar 409 como caso normal —
recarregar e mostrar o estado real —, não como erro excepcional.

### D8 — Permissão: continua `BASE:rooms.housekeeping`

Abrir, fechar, reabrir e registrar dispensa são **o mesmo trabalho das mesmas pessoas**. Código
novo aqui separaria linhas de tabela, não pessoas — e a D7 acabou de estabelecer que as três
ocupantes têm o mesmo acesso, por decisão, não por omissão.

---

## 3. Migration 092

Aditiva. Não altera `rooms`, `room_status_history` nem as funções da 089/090.

1. **`not_done` no enum `housekeeping_task_outcome`.** `alter type … add value if not exists`.
   **Atenção operacional:** `add value` **não pode rodar dentro de bloco de transação** em
   versões antigas do Postgres. O arquivo separa esse comando e documenta o motivo.
   O `CHECK` do bicondicional **não muda** — `not_done` já cai no lado "sem tipo".

2. **`public.housekeeping_day_events`** (D5): `housekeeping_day_id` FK not null, `event`
   (`opened` | `closed` | `reopened`), `occurred_at`, `actor_id`, `pending_count` (nulo fora de
   `closed`), `note`. Índice por `(housekeeping_day_id, occurred_at)`.

3. **Duas colunas em `housekeeping_tasks`** (D6): `carried_over_since date` e
   `carried_over_days integer not null default 0`, com `CHECK` amarrando as duas —
   `carried_over_since` nulo **se e somente se** `carried_over_days = 0`. Sobra sem data seria
   sobra que não sabe desde quando, que é o defeito que a D6 existe para evitar.

4. **`housekeeping_close_day(p_day_id, p_actor_id)`** — transacional:
   converte `pending → not_done`, grava `closed_at`/`closed_by`, registra o evento `closed` com
   o `pending_count`, e propaga a sobra para dias posteriores em aberto (D6). Fechar um dia já
   fechado é **no-op idempotente**.

5. **`housekeeping_reopen_day(p_day_id, p_actor_id, p_note)`** — transacional: converte
   `not_done → pending` **e nada mais**, zera `closed_at`/`closed_by`, registra o evento
   `reopened`. Reabrir um dia aberto é no-op.

6. **`housekeeping_open_day` ganha a propagação da sobra** (D6), lendo o **último dia anterior**
   daquela unidade — não "ontem": domingo pode não ter sido aberto.

7. **`revoke`/`grant`** das três funções, como a 091. Continua valendo a lição da D8 do plano 75:
   **a assinatura da `housekeeping_open_day` NÃO muda** — a propagação entra no corpo. Mudar
   assinatura de RPC exposta é sempre quebra (PGRST203).

**VALIDACAO e ROLLBACK** no padrão da 091, com a conferência de sintaxe do plano 74 §8 executada
antes da entrega.

---

## 4. Rotas

| Rota | O que faz |
| --- | --- |
| `GET /api/base/rooms/days/current` | O dia da data operacional + tarefas + apartamento (número, ala, andar, limpeza, bloqueio) + contagens por desfecho + **dias anteriores em aberto** (D3). É a fonte única da tela. |
| `POST /api/base/rooms/days` | Abrir (já existe; ganha a sobra pelo lado da RPC). |
| `POST /api/base/rooms/days/[id]/close` | Fechar. Devolve o `pending_count` convertido. |
| `POST /api/base/rooms/days/[id]/reopen` | Reabrir, com nota opcional. |
| `PATCH /api/base/rooms/tasks/[id]` | Dispensa: `declined` + origem + observação. |

**Por que as rotas entram nesta fatia e não na tela:** é o padrão que funcionou no 75 — modelo,
rota e E2E fecham **antes** de existir interface. Um defeito de gravação descoberto com a tela
pronta vira "problema de tela", e a investigação começa no lugar errado.

---

## 5. Testes (§7)

Puros, espelhando as regras do SQL como `backfillRoomState` espelha o backfill da 089:

1. **Fechar converte `pending → not_done`** e deixa `done`, `declined` e `cancelled` intactas.
2. **Reabrir converte `not_done → pending`** e deixa as outras três intactas — a assimetria da
   D4, nos dois sentidos.
3. **O bicondicional sobrevive ao valor novo:** `not_done` exige `service_type` nulo.
4. **A sobra ACUMULA:** três dias seguidos de `not_done` mantêm o `carried_over_since` do
   primeiro e chegam a `carried_over_days = 3`. **O teste que trava o "reset"** — se alguém
   copiar a data de ontem em vez de propagar a original, ele quebra.
5. **Só `not_done` carrega:** `declined` e `cancelled` não viram sobra.
6. **`carried_over_since` nulo ⟺ `carried_over_days = 0`**, nos dois sentidos.
7. **Fechar é idempotente** e reabrir um dia aberto é no-op.

E, na suíte E2E (que hoje roda 26/26): fechar com pendência devolvendo a contagem, reabrir
trazendo só as `not_done`, e o evento registrado nos dois casos.

---

## 6. O que NÃO entra

- **A tela — plano 71.** Nenhum componente, nenhuma página.
- **Navegação mobile — plano 73**, que é portão para o 71.
- Escala e titular por ala — **plano 76**.
- Recepção com ocupação e bloqueio — fatia própria.
- Previsão de saída (a alternativa (e) da D2 do plano 75). Continua fora.

---

## 7. Discordância registrada

**A D7 contradiz um pressuposto de três planos.** O 70, o 74 e o 75 falam de "a governanta" como
se fosse uma pessoa, e várias decisões foram justificadas com isso — inclusive a recusa da trava
por pessoa no plano 70 §D3, cujo argumento era *"travar por pessoa exigiria uma segunda governanta
logada em cada turno, o que não existe num hotel de 115 apartamentos"*.

**Existe.** São três ocupantes da mesma função.

**A decisão do plano 70 continua certa**, mas o argumento precisa ser corrigido: a razão de não
travar por pessoa não é que não haja uma segunda pessoa — é que **quem limpa é a camareira e quem
vistoria é a governanta, e a camareira não tem login**. A segregação segue existindo fora do
sistema. O que muda é que a **concorrência** entre duas ocupantes deixa de ser hipótese (D7).

---

## 8. Critério de pronto

- `npx tsc --noEmit` limpo, `npm run test:unit` verde com os sete testes da §5.
- Migration 092 **escrita e não aplicada pelo Codex**, com VALIDACAO, ROLLBACK e a conferência de
  sintaxe do plano 74 §8 executada e reportada.
- Suíte E2E estendida, verde em staging — **portão para produção**.
- Aplicada pelo Wilson em staging, E2E lá, e só então produção.
- `§9` do plano 70 corrigido: escala/folha impressa é o **plano 76**, não o 72.

---

## 9. Branch

`feat/fechamento-do-dia`.
