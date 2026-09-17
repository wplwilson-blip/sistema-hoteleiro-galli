# 71 — Plano: a tela da governanta

Status: **plano para revisão. Nenhum código escrito.**
Continua o [70](70-plano-estado-apartamento-tres-dimensoes.md), o [75](75-plano-dia-da-governanca.md),
o [77](77-plano-fechamento-do-dia.md) e o [78](78-plano-recepcao-check-in-out.md) — migrations 089
a 094 aplicadas e validadas nos dois bancos, suíte de apartamentos 44/44, casca mobile entregue.

**Ordem alterada por decisão do Wilson: `71` antes do `79`.** A ordem escrita no 78 era
`78 → 79 (tela do parque) → 71 (tela da governanta)`. O argumento que a inverte é operacional, e é
dele: a recepção **já tem o Desbravador** e faz check-in e check-out lá. A tela do 79 criaria
trabalho duplicado — marcar nos dois sistemas — até o dia em que o Galli parar de usar o
Desbravador. A governanta **não tem sistema nenhum**. O 71 é a primeira ferramenta dela.

**Esta é a primeira fatia da linha que entrega tela.** Tudo até aqui foi modelo, RPC e rota.

---

## 1. A consequência de adiar o 79 — e por que ela não impede esta tela

Sem o 79, **ninguém escreve `occupancy_status`**. A coluna continua congelada desde o backfill da
089 (§1 da 093), e `suggestedServiceType`
([rooms-utils.ts:843](../../src/components/base-cadastros/rooms-utils.ts#L843)) continua sugerindo a
partir de um retrato antigo. O perfil `RECEPCAO` existe, tem `BASE:rooms.occupancy`, e não tem por
onde entrar.

Isso **não é problema para esta tela**, e o motivo é operacional, não técnico: **a governanta
recebe a lista de saídas da recepção de manhã.** Ela chega sabendo quem saiu. A informação existe
no hotel; o que não existe é o caminho dela até o banco.

**O que isso obriga no desenho, e é a restrição central da fatia:**

> A sugestão do sistema é **palpite**, e ela tem a resposta. Mudar o tipo tem que ser **um toque**,
> não uma correção escondida atrás de um menu.

O número do Wilson dá a escala: **50 saídas em 115 apartamentos**. Se a sugestão errar em metade do
parque e mudar custar três cliques, ela abandona o sistema na primeira semana — e a fatia inteira
terá sido escrita para nada. Isso vira a **D2**, e a D2 é a decisão mais importante deste plano.

A §14 do 75 e a D10 do 78 continuam válidas e continuam abertas: **previsão de saída não existe.**
Ela sabe quem saiu porque alguém contou — só que agora o que ela sabe entra no sistema em vez de
morrer na folha.

---

## 2. A divisão proposta

Quatro fatias. A primeira não é tela.

### 71.0 — Destravar (sem tela, sem migration)

Dois achados da leitura das rotas, ambos bloqueiam a tela e **nenhum deles é de tela**. Ver D6 e
D10. São mudanças de rota e de matriz, pequenas, com teste — e precisam entrar **antes**, pelo
motivo que o 75 e o 77 já aplicaram duas vezes: defeito de gravação descoberto com a tela pronta
vira "problema de tela", e a investigação começa no lugar errado.

### 71.A — O dia e a grade

Abrir, fechar e reabrir o dia; o aviso do dia anterior em aberto; o painel do dia não aberto; a
grade por ala com as duas filas; marcar arrumado com tipo e hora real. **Entrega valor sozinha:**
com só isso ela já substitui a folha para registrar o que aconteceu.

### 71.B — A sequência de vistoria

As 50, uma a uma. Pular, reprovar, sair e voltar. Separada da 71.A porque é **outro momento do
dia** e outro modo de interação — e porque a 71.A é utilizável sem ela.

### 71.C — Dispensa, sobra e conferência

As duas origens da dispensa; a marca de sobra com "desde quando"; a lista de conferência da §8 do
75 (apartamento `vacant` cuja tarefa fechou como permanência).

**Por que 71.0 separado e não dentro da 71.A:** ele muda **permissão e matriz de transição** — as
duas coisas que este projeto trata como área sensível. Misturado com 300 linhas de componente, o
diff esconde a mudança que mais importa revisar.

**Por que a ordem A → B → C e não B primeiro:** sem a 71.A não existe fila de vistoria para
percorrer. A 71.B consome o que a 71.A produz.

---

## 3. Decisões

### D1 — A fila **não** é `outcome = 'pending'`. É união, e por isso a tela carrega duas fontes

Herdada da [D12 do 78](78-plano-recepcao-check-in-out.md) e do rodapé da 093, repetida aqui porque
é o erro mais provável de quem for construir:

> **A fila de arrumação é a união das tarefas `pending` do dia E dos apartamentos que estão
> `dirty` agora.**

O caso que quebra a consulta óbvia acontece toda semana: check-out tardio depois da arrumação de
permanência deixa a tarefa `done` e o quarto `dirty`. **Não há erro, não há log** — a linha existe,
o `outcome` está correto, a consulta roda, e o quarto simplesmente não aparece. A camareira
descobre pela hóspede reclamando.

Um apartamento `dirty` com tarefa `done` **não é dado inconsistente**: as duas coisas são
verdadeiras. O trabalho de hoje aconteceu, e há trabalho novo. **A tela mostra as duas**, e o
cartão daquele apartamento diz as duas em voz alta — *"arrumado às 9h · sujo de novo às 14h"* —
em vez de escolher uma.

**Consequência de carregamento:** a tela carrega `GET /api/base/rooms/days/current` **e**
`GET /api/base/rooms`. Não é redundância — são perguntas diferentes:

| Fonte | Responde |
| --- | --- |
| `days/current` | O que o dia registrou: tarefa, desfecho, tipo, sobra, dispensa, contagens, dias em aberto |
| `GET /rooms` | O que o parque **é agora**: as três dimensões, ala, andar, cadastro ativo |

A grade por ala precisa do parque inteiro de qualquer forma (a `days/current` só devolve
apartamentos **que têm tarefa**, porque parte de `housekeeping_tasks`). Carregar os dois resolve a
união da D1 e fecha, de quebra, uma lacuna real: **um apartamento ativo sem tarefa no dia** — criado
depois da abertura — não fica invisível. Ele aparece na grade, marcado como "sem tarefa hoje".

### D2 — O tipo são **dois botões**, não um padrão com correção. É a decisão central

O problema, com os números do Wilson: **115 apartamentos, ~50 saídas, e nenhum padrão ajuda.**
Marcar 50 saídas custa o mesmo que marcar 65 permanências. Não há ala que seja toda de saída, não
há andar que seja todo permanência, e a sugestão do sistema está errada em **metade do parque**
enquanto o 79 não existir.

**(a) Sugestão pré-selecionada + editar quando errada.** É o desenho natural, e é o errado aqui.
Custo: 1 toque quando acerta, 3 quando erra (abrir, escolher, confirmar). Com 50% de erro a média
fica em ~2 toques. **Mas o custo maior não é o clique:** um padrão pré-selecionado exige que ela
**leia** a sugestão em 115 apartamentos para decidir se corrige. São 115 atos de verificação, e o
primeiro dia cansado é o dia em que ela para de ler e passa a tocar. **Um padrão errado que ninguém
lê vira registro errado.** Descartada.

**(b) Perguntar o tipo num diálogo ao marcar arrumado.** Honesto e imune a erro. Custa um diálogo
por apartamento, 115 vezes, num tablet, andando. Descartada — é a forma mais cara de estar certo.

**(c) Definir o tipo em lote por ala, antes.** Só funciona se houver padrão. Não há (Wilson).
Descartada.

**(d) Dois botões explícitos por apartamento — "Saída" e "Permanência".** ← **decidida**

Cada célula da grade tem **dois alvos**, e ela toca o que é verdade. **Um toque, sempre**, acerte
ou erre a sugestão — e, mais importante, **nenhuma leitura de sugestão é necessária**. Ela sabe o
que aconteceu naquele quarto; toca o botão correspondente. O sistema não adivinha e não pede
confirmação de palpite.

Um toque grava as três coisas de uma vez, porque a rota já aceita as três:
`housekeeping → clean`, `service_type` daquele apartamento, `occurred_at` daquele apartamento.

**A sugestão não desaparece — ela muda de papel.** `suggestedServiceType` continua calculada e vira
**tinta fraca** num dos dois botões: uma dica visual, nunca um valor pré-selecionado e nunca um
estado que se confirma sozinho. No dia em que o 79 existir e a ocupação estiver viva, essa tinta
passa a acertar e a leitura fica barata — sem nenhuma mudança nesta tela. **O desenho que funciona
com a sugestão errada continua funcionando quando ela ficar certa; o inverso é falso.**

**O que "Permanência" faz e o que "Saída" faz são diferentes, e a tela precisa dizer isso:**
permanência **encerra** a tarefa em `clean` (a RPC grava `done`); saída deixa a tarefa `pending` e
manda o apartamento para a fila de vistoria. É a D2 do 75 funcionando, e é a razão de as duas filas
existirem.

### D3 — Lote **só onde o fato é coletivo**. A grade não lança `clean` em lote

A [D4 do 75](75-plano-dia-da-governanca.md), com o critério que a [D8 do 78](78-plano-recepcao-check-in-out.md)
depois generalizou: *lote é proibido quando a transição afirma um ato individual de quem lança;
permitido quando registra um fato que aconteceu no mundo.*

Esta tela **estreita** aquilo mais um passo, e o argumento é da D2: **o tipo não é coletivo.** O
próprio comentário da rota já diz — *"um corredor tem saídas E permanências misturadas, então um
tipo único para o lote estaria errado na metade dos quartos"*
([transitions/route.ts:56](../../src/app/api/base/rooms/transitions/route.ts#L56)).

| Ação | Lote? |
| --- | --- |
| Marcar uma ala inteira `dirty` na abertura | **sim** — fato coletivo, sem tipo |
| Marcar `cleaning` num corredor que começou | **sim** — fato coletivo, sem tipo |
| Marcar `clean` (carrega tipo) | **não** — um toque, um apartamento |
| Vistoriar | **não** — a rota recusa (`maxRoomsPerTransition`) |

**Um toque envia uma chamada.** Descartei acumular toques localmente e enviar o corredor de uma
vez: seria mais rápido na rede e criaria **estado local que parece gravado e não está**. Ela sai do
andar, o tablet dorme, e dez lançamentos somem sem erro nenhum — o mesmo modo de falha silenciosa
que esta linha de trabalho já encontrou quatro vezes. **O ganho era de rede; o risco era de dado.**

Nada de UI otimista (70, §6.3c): a célula vai para "enviando" e só muda de cor quando a resposta
volta.

### D4 — A sequência de vistoria é derivada do **servidor**, nunca de um índice

São **50 vistorias individuais por dia** e a rota recusa lote. A [§6.1 do 75](75-plano-dia-da-governanca.md)
já escreveu o formato como restrição, não sugestão: *"não é uma lista de 50 com um botão em cada
linha: é uma sequência. Abre o primeiro, vistoria, aprova ou reprova, e o próximo já está na frente
dela."*

A tela da vistoria é **um cartão por vez**, largura inteira, com: número, ala, andar, hora em que
ficou `clean` (e há quanto tempo), tipo, marca de sobra, e observação da dispensa se houver. Duas
ações primárias grandes: **Aprovar** e **Reprovar**. Depois de qualquer uma, o próximo cartão
aparece sozinho.

**O ponto que precisa ficar escrito:** a posição na sequência é **recalculada do servidor a cada
passo** — "o primeiro da fila que ainda não foi vistoriado e que eu não pulei" —, **nunca um índice
num array carregado no começo**. A [D7 do 77](77-plano-fechamento-do-dia.md) é a razão: são **três
ocupantes** da mesma função, e duas operando ao mesmo tempo é rotina de fim de semana. Um índice
aponta para o apartamento errado assim que a outra pessoa vistoriar um da lista — e ela aprova o
quarto errado sem nada indicar que aconteceu.

**Sair e voltar** cai de graça nessa escolha: não há posição a restaurar. Ela reabre a tela e o
próximo é recalculado. É a mesma propriedade que faz a sequência sobreviver ao tablet dormindo, à
troca de aba e à segunda pessoa operando.

### D5 — "Pulei este, volto depois" é **preferência de visão**, não fato

Não existe coluna para isso, e **não vamos criar uma**. Mudança de schema decidida no meio de uma
fatia de tela é exatamente como se acumulam decisões que ninguém tomou (D12 do 78, mesma frase).

| Onde guardar | Custo |
| --- | --- |
| Coluna em `housekeeping_tasks` | Migration numa fatia de tela. Descartada |
| Estado do componente | Some ao trocar de aba. Ela pula três e perde os três |
| `sessionStorage`, por dia e unidade | ← **decidida** |

Sobrevive a recarregar e a sair e voltar; morre quando o navegador fecha, e **morrer é seguro**: o
apartamento volta para a fila na ordem, e o pior caso é ela olhar de novo um quarto que já tinha
decidido adiar. A falha é para o lado certo.

**Dito explicitamente para quem construir:** pular **não grava nada** e **não é visível para as
outras duas ocupantes**. Se fosse compartilhado seria um fato operacional — "este aqui fica para
depois" — e aí precisaria de domicílio de verdade, com autor e hora. Não é o que ela pediu, e o
barato aqui é honesto porque não finge ser mais do que é.

O contador da sequência diz *"faltam 12 · 3 pulados"*. Os pulados não somem: voltam no fim da fila,
e a tela nunca deixa a fila "acabar" escondendo três.

### D6 — Reprovar antes de vistoriar: **falta a aresta `clean → cleaning`** (achado)

Seu requisito é *"reprovar volta para `cleaning`, não `dirty`"*. **A matriz não consegue fazer isso
no momento em que ela reprova.** Conferi as arestas de limpeza
([rooms-utils.ts:573-595](../../src/components/base-cadastros/rooms-utils.ts#L573-L595)):

| Aresta | Existe? | Permissão |
| --- | --- | --- |
| `clean → inspected` (aprovar) | sim | `rooms.inspect` |
| `cleaning → inspected` (atalho) | sim | `rooms.inspect` |
| `inspected → cleaning` | **sim** | `rooms.inspect` |
| `inspected → dirty` | sim | `rooms.inspect` |
| `clean → dirty` (desfazer) | sim | `rooms.housekeeping` |
| **`clean → cleaning`** | **NÃO EXISTE** | — |

O commit `5da3d44` ("reprovar na vistoria pode voltar para cleaning") resolveu a reprovação **de um
apartamento já vistoriado** — ela marcou `inspected` e depois viu o problema. Mas a fila de vistoria
é de apartamentos em **`clean`**, e é ali que ela reprova: olha o quarto, falta toalha, reprova
**antes** de liberar.

Do jeito que está, as saídas são todas ruins:

- **`clean → dirty`**: existe, e diz a coisa errada. `dirty` é refazer do zero; o comentário da
  própria matriz explica que ter só esse destino faz o custo de reprovar ficar tão alto que **a
  saída barata vira não reprovar**. É o defeito que o `5da3d44` corrigiu — reintroduzido pela porta
  da fila.
- **Aprovar e depois reprovar** (`clean → inspected → cleaning`): funciona e é **falsificação de
  histórico**. Grava que o apartamento foi vistoriado e liberado, e o `isRoomSellable` o considera
  vendável na janela entre as duas chamadas. Registrar uma aprovação que não aconteceu para poder
  reprovar é o oposto do que a vistoria significa.

**Proposta: acrescentar `{ from: "clean", to: "cleaning", permission: ROOM_PERMISSIONS.inspect }`.**

Custo real, conferido: **uma linha em `rooms-utils.ts` e os testes.** Nenhuma migration — a RPC
valida forma só para `occupancy` (as duas formas da D1 do 78); para limpeza ela confere
concorrência (`v_current is distinct from v_from`) e aplica. A allowlist de arestas vive **só** em
`canTransition`.

**Permissão `rooms.inspect`, não `rooms.housekeeping`**, e isso é decisão: reprovar é ato de quem
vistoria. Com `housekeeping` a aresta viraria também um "desfazer" para quem só registra limpeza, e
aí ela se confunde com o `clean → dirty` que já existe para isso.

**Entra na 71.0.** É mudança de matriz, e merece ser revisada sozinha.

### D7 — A hora real é **texto que já está lá**, não um lápis

A [D5 do 75](75-plano-dia-da-governanca.md) escreveu o requisito e disse por quê: *"Se o campo for
difícil de achar, ela deixa no automático e o dado se perde"* — e os primeiros meses de histórico
ficam todos concentrados no fim da tarde.

A folha traz **"112 — 10h20"**; ela lança às 11h05 informando 10h20. Isso não é exceção: é o caso
normal, porque ela **lança depois do fato, às vezes uma hora depois**, circulando com o tablet.

**Decisão: a hora é campo visível e editável dentro da própria célula, já preenchido com "agora".**
Não é ícone, não é "opções avançadas", não é um segundo passo depois de gravar. Ela sobrescreve
**antes** de tocar o tipo, e o toque envia aquela hora naquele apartamento
(`occurredAts`, o mapa que a [D8.1 do 75](75-plano-dia-da-governanca.md) criou exatamente para
isto).

**E há um segundo lugar, que é o que faz ela não ignorar o primeiro.** A grade mostra, em cada
apartamento sujo, **"Sujo há 6h"** — calculado sobre `housekeeping_changed_at`, que é o campo que
ela preencheu. O número que ela lê de manhã sai da hora que ela digitou ontem. **Quando o campo
mente, o número mente para ela mesma, no dia seguinte.** É o único incentivo que funciona sem
obrigar ninguém a nada, e é a razão de os dois estarem na mesma tela.

Na sequência de vistoria a hora aparece duas vezes: **"Limpo às 10h20 · há 45 min"** no cartão (o
que ela precisa saber para decidir), e o campo da própria vistoria, com padrão "agora" — porque a
vistoria às 11h05 aconteceu às 11h05 mesmo. Só o que veio do papel é retroativo (D5 do 75).

As duas travas da rota continuam valendo e a tela mostra a mensagem delas sem traduzir: hora futura
e hora anterior ao último lançamento do mesmo apartamento no mesmo dia
([`validateOccurredAt`](../../src/components/base-cadastros/rooms-utils.ts#L929)).

### D8 — O dia não aberto é **silêncio, não zero**

A rota já devolve `day: null` de propósito, com o comentário no ponto
([days/current/route.ts:97](../../src/app/api/base/rooms/days/current/route.ts#L97)):
*"DIA SEM REGISTRO É SILÊNCIO, NÃO ZERO."*

A tela precisa honrar isso, e a forma errada é fácil de escrever sem perceber: renderizar a grade
vazia e os contadores em `0`. **"0 pendentes" lê-se como "nada a fazer".** É a diferença entre o
sistema dizer *"ninguém abriu o dia"* e o sistema dizer *"está tudo feito"* — e a segunda frase, num
dia às 8h da manhã, é uma mentira que ela só descobre ao meio-dia.

**Decidido:** dia sem registro renderiza um **painel no lugar da grade**, não uma grade vazia:

> **O dia 17/09 ainda não foi aberto.**
> 115 apartamentos ativos entrarão na fila.
> [ Abrir o dia ]

**Sem contadores.** Ausentes, não zerados — contador é resposta, e não há resposta.

**E acima de tudo, sempre, os dias anteriores em aberto.** `stalePreviousDays` vem na mesma resposta
justamente para isso ([D3 do 77](77-plano-fechamento-do-dia.md)): *"um aviso que aparece depois é um
aviso que ela já passou por cima."* O aviso é renderizado **inclusive quando o dia de hoje está
aberto e cheio** — é o caso mais provável, porque ela abre segunda às 8h e só então lembra da
sexta. Fechar dali, com um clique, e **nunca automático**.

### D9 — 409 é **caso normal**: recarrega aquele apartamento e mostra o estado real

A [D7 do 77](77-plano-fechamento-do-dia.md) estabeleceu que duas ocupantes operando ao mesmo tempo é
rotina de fim de semana, e a [§4.1](77-plano-fechamento-do-dia.md) fez a RPC carregar **qual**
apartamento divergiu no `detail`, com `parseTransitionConflict` já pronto
([rooms-utils.ts:1111](../../src/components/base-cadastros/rooms-utils.ts#L1111)).

A tela **não** trata isso como erro: sem diálogo vermelho, sem "tente novamente", sem recarregar a
página inteira. A célula daquele apartamento se atualiza sozinha para o estado real, com uma nota
discreta — *"a gerente marcou como vistoriado às 11h04"* — e o resto da grade não se mexe.

Como a D3 manda um apartamento por chamada, **o 409 nunca custa mais que um apartamento**. É o
outro lado do custo de rede que a D3 aceitou pagar: o lote atômico protege a consistência e, quando
aborta, aborta dez. Aqui não há dez.

Na sequência de vistoria o 409 tem tratamento próprio, e é o caso que mais importa: se a outra
ocupante vistoriou o apartamento que está no cartão dela, **aprovar não pode gravar em cima**. O
cartão informa que aquele já foi resolvido, e avança para o próximo. A recomputação da D4 faz isso
acontecer sozinha.

### D10 — A dispensa `front_desk` responde **403** para a governanta hoje (achado)

Você pediu para confirmar na rota o que a dispensa com as duas origens implica. Confirmado, e
**implica um bloqueio**.

O gate por origem da [D6 do 78](78-plano-recepcao-check-in-out.md) está implementado
([tasks/[id]/route.ts:99](../../src/app/api/base/rooms/tasks/[id]/route.ts#L99)):

```
front_desk  → exige BASE:rooms.occupancy
housekeeper → exige BASE:rooms.housekeeping
```

E a matriz de concessões ([rooms-utils.ts:508](../../src/components/base-cadastros/rooms-utils.ts#L508))
dá `rooms.occupancy` a `SUPER_ADMIN`, `UNIT_DIRECTOR` e `RECEPCAO` — **e nega a
`LIDER_GOVERNANCA` explicitamente**, como metade recíproca da D4 do 78.

**Resultado: a governanta não consegue registrar a dispensa avisada pela recepção. 403.** Você disse
que ela lança as duas hoje; metade das dispensas dela bate na trava.

**Não é defeito da D6**, e o enquadramento importa: a D6 mudou o gate para ser por origem, e isso
está certo. O que aconteceu é outra coisa — **a D6 foi desenhada para dois atores, e a decisão de
ordem do Wilson (`71` antes do `79`) deixou só um.** É o custo de uma decisão de ordem, e **aparece
agora porque o levantamento foi feito**; sem ele, a governanta descobriria o 403 no primeiro dia.

**As cinco saídas, com custo, estão na [fatia 71.0](71-0-plano-destravar.md), §3** — inclusive uma
terceira via que não estava nesta análise (valor novo de origem, `front_desk_relayed`) e o fato que
muda o raciocínio: **o gate nunca protegeu presença física**, porque a governanta já registra
`housekeeper` sem ter estado na porta — quem esteve foi a camareira, que contou para ela.

Recomendada lá: **o gate de `front_desk` aceitar `rooms.occupancy` ou `rooms.housekeeping`**, com a
matriz de concessões **inalterada** e teste que prova isso.

**Entra na 71.0.** Rota e teste, sem migration.

### D11 — `declined` não responde "este apartamento foi arrumado hoje?"

`LIMITE CONHECIDO` da 094, escrito lá com destinatário nominal — *"quem for construir a tela da
governanta (plano 71) precisa saber"*:

> Uma tarefa `declined` **não** significa "ninguém entrou no quarto". Pode significar "foi
> dispensada de manhã e arrumada à tarde".

Desde a 094 o bloco (a) **pula** a tarefa dispensada em vez de sobrescrevê-la, então um apartamento
pode chegar a `inspected` com a tarefa ainda `declined`, origem e nota intactas. A contagem do dia
fecha **menor que a realidade**.

**O que a tela faz:** mostra o desfecho como desfecho — *"dispensado · avisado pela recepção"* — e
**não** deriva dele nenhuma afirmação sobre trabalho executado. Em particular:

- o contador do dia é rotulado **"tarefas por desfecho"**, nunca "serviços realizados";
- nenhum lugar da tela escreve "não arrumado" para uma tarefa `declined`;
- o cartão de um apartamento dispensado que depois chegou a `clean`/`inspected` mostra **as duas
  coisas**, pela mesma regra da D1: dois fatos verdadeiros, nenhum consertando o outro.

**O que a tela não faz:** tentar responder "foi arrumado hoje?" a partir da tarefa. A resposta está
no `room_status_history`, e **buscá-la é fatia própria** — a (A) do [plano 80](80-plano-dispensa-sobrevive.md),
`housekeeping_task_events`, que fecha este limite e o da D12 do 78 **juntos**. Construir meio
caminho aqui — uma consulta ao histórico só para esta tela — criaria a segunda fonte de verdade que
a (A) existe para evitar.

### D12 — O tipo **não é editável depois**, e o que isso custa

A [D2 do 75](75-plano-dia-da-governanca.md) diz que o tipo *"continua editável"*, e a
[§8](75-plano-dia-da-governanca.md) diz que a governanta precisa poder corrigi-lo **sem depender da
Recepção**. A §6 do 75 listou uma rota de "editar tipo".

**Ela não existe.** `service_type` é escrito em dois lugares e só: pela RPC ao chegar em `clean`
(quando a tarefa está `pending`) e ao chegar em `inspected` (forçando `checkout`). Depois que a
tarefa fecha como `done`+`stayover`, nenhuma rota a altera.

**Conferi o impacto operacional antes de propor qualquer coisa, e ele é menor do que parece.** Se
ela marcar "Permanência" por engano num apartamento de saída:

- a tarefa fecha `done`+`stayover` e o apartamento **para em `clean`**;
- ela pode marcar `clean → inspected` normalmente — a aresta não olha a tarefa;
- o apartamento **chega a `inspected` e volta a ser vendável**. A operação não trava.

O que sobra é que a tarefa continua dizendo `stayover` num serviço que foi de saída (o `update` da
RPC em `inspected` só alcança `pending` e `not_done`, desde a 094). **É erro de contagem, não
bloqueio.**

**Decisão: não criar a rota de edição nesta fatia.** Motivos, nesta ordem:

1. **O desenho da D2 é a defesa certa.** Dois botões explícitos, sem padrão pré-selecionado, erram
   muito menos do que um padrão que ela precisa ler e corrigir. Construir a correção antes de medir
   a taxa de erro é construir para um problema que o desenho existe para não ter.
2. **É a mesma família dos limites 093/094**: uma linha por apartamento por dia não representa dois
   fatos. Uma rota de edição que sobrescreve `service_type` apaga o primeiro fato — exatamente o que
   a 094 acabou de parar de fazer.
3. **A saída certa já está escrita**: plano 80, alternativa (A). Lá a correção vira **evento**, com
   hora e autor, e o histórico ganha "foi lançado stayover às 9h, corrigido para checkout às 11h" —
   que é a correção que serve para alguma coisa.

**Registrado como dívida, com o texto do 75 desatualizado:** a §6 do 75 lista uma rota que não foi
construída e a D2 promete uma edição que não existe. Vale corrigir o 75 quando a (A) chegar, em vez
de deixar dois planos prometendo algo que o código não faz.

### D13 — Onde a tela mora, e o que acontece com Cadastros > Apartamentos

Hoje o parque vive em **Cadastros > Apartamentos**
([rooms-client.tsx](../../src/components/base-cadastros/rooms-client.tsx), com a `rooms-map`), e
**Governança** é dashboard de placeholder
([governanca/page.tsx](<../../src/app/(app)/governanca/page.tsx>)).

**Decidido: tela nova em Governança. Cadastros > Apartamentos fica exatamente como está.**

São coisas diferentes e a distinção não é de organização de menu: Cadastros responde *"quais
apartamentos existem e como são"*; a tela da governanta responde *"o que precisa ser feito hoje"*.
Enfiar o dia dentro do cadastro faria a tela de cadastro depender de dia aberto — e um cadastro que
some quando ninguém abriu o dia é um cadastro quebrado.

**O que é reusado, e o que não é:** `rooms-utils.ts` inteiro (é onde as regras vivem, e duplicá-las
é como se cria a segunda fonte de verdade). `rooms-map.tsx` **não** é reusado: ele agrupa por andar
e bloco para **consulta**, e a grade desta tela agrupa por ala para **ação**, com dois botões e um
campo de hora por célula. Forçar um componente a servir os dois deixaria os dois piores. O
agrupamento em si — `groupRoomsByFloorAndBlock`
([rooms-utils.ts:172](../../src/components/base-cadastros/rooms-utils.ts#L172)) — é reusado, porque
é lógica pura e já testada.

### D14 — Container rolável próprio, e 44px de verdade

Herdado do [73, §6.1](73-plano-navegacao-mobile.md), com o nome desta tela escrito lá:

> **Toda tela nova que possa exceder a largura da viewport traz o seu próprio container rolável.**
> O `<main>` corta. **Não é erro, não é log, não é aviso: o conteúdo simplesmente não existe além da
> borda.**

O `<main>` tem `overflow-x-hidden` ([(app)/layout.tsx:30](<../../src/app/(app)/layout.tsx#L30>)). A
grade de 115 apartamentos é **o caso** que o 73 registrou. Cada faixa de ala traz o seu
`max-w-full overflow-x-auto`, como as 34 tabelas já fazem.

E a [D3 do 73](73-plano-navegacao-mobile.md) dizia que a herança aqui seria **mais dura**, e é:
*"a grade de 115 apartamentos tem alvos muito menores que um item de menu, e é onde a governanta vai
tocar o dia inteiro."* Os dois botões de tipo e as ações da vistoria são **44×44 no mínimo**, com
espaçamento que evite toque vizinho — 115 células densas com alvos colados é o desenho que produz
lançamento errado, e lançamento errado aqui custa a D12.

O `button.tsx` **não** muda (341 usos em 54 arquivos, a mesma razão do 73): o tamanho vem por
`className` nesta tela.

---

## 4. Quando o tablet das camareiras chegar

Não construir para isso. **Não construir nada que impeça** — a mesma formulação da
[§10 do 75](75-plano-dia-da-governanca.md).

A inversão é de **quem lança**, não de **o que existe**: a camareira passa a tocar os mesmos dois
botões que a governanta toca hoje, no mesmo corredor, e a fronteira `clean → inspected` continua
exatamente onde está — é ela que impede a inversão de virar autoliberação.

Quatro propriedades desta tela existem para isso, e **quebrar qualquer uma delas fecha a porta**:

1. **A visibilidade das ações vem da permissão, não de um modo.** Não existe "modo governanta". Quem
   tem `rooms.housekeeping` vê a grade; quem tem `rooms.inspect` vê a sequência de vistoria. Um
   perfil de camareira com o primeiro e sem o segundo funciona **sem uma linha de tela nova**. Um
   `if (perfil === 'LIDER_GOVERNANCA')` em qualquer lugar desta tela é o bug que só aparece daqui a
   um ano.
2. **A tela nunca assume uma pessoa.** Autoria vem de `changed_by`/`updated_by`, e a D4 recalcula a
   sequência do servidor porque já hoje são **três ocupantes** (D7 do 77). Dez camareiras é o mesmo
   problema com outro número.
3. **Nenhum estado local é autoritativo.** O único estado local é a lista de pulados (D5), e ela é
   declaradamente preferência. Dois aparelhos convergem porque a verdade está no servidor.
4. **Um toque, um apartamento, uma chamada** (D3). O dia em que vinte aparelhos lançam ao mesmo
   tempo, o 409 continua custando um apartamento.

**O que muda e não é nosso problema agora:** perfil próprio de camareira, escala e titular por ala
(**plano 76**), e quem vê o parque inteiro contra quem vê só o seu corredor. Nada disso exige mexer
no que esta fatia escreve.

---

## 5. Rotas — o que já existe, e o que falta

Levantado no código, não deduzido:

| Rota | Estado | Usada por |
| --- | --- | --- |
| `GET /api/base/rooms/days/current` | pronta, com `stalePreviousDays` e contagens | 71.A |
| `POST /api/base/rooms/days` | pronta | 71.A |
| `POST /api/base/rooms/days/[id]/close` | pronta | 71.A |
| `POST /api/base/rooms/days/[id]/reopen` | pronta | 71.A |
| `POST /api/base/rooms/transitions` | pronta, com `serviceTypes` e `occurredAts` por apartamento | 71.A, 71.B |
| `GET /api/base/rooms` | pronta | 71.A (D1) |
| `PATCH /api/base/rooms/tasks/[id]` | **gate a ajustar** (D10) | 71.C |
| *(matriz)* `clean → cleaning` | **não existe** (D6) | 71.B |

**A tela não inventa rota nenhuma.** As duas mudanças da 71.0 são de gate e de matriz — nenhuma
migration, nenhuma coluna, nenhuma assinatura de RPC. É o que permite esta fatia ser, de resto,
tela pura.

---

## 6. Testes

**Puros** (`tests/unit`, runner sem banco), porque é onde as regras desta tela podem morar sem
browser:

1. `canTransition` aceita `clean → cleaning` **com** `rooms.inspect` e **nega sem** (D6).
2. `canTransition` continua negando `dirty → inspected` e `dirty → clean` — a allowlist não
   afrouxou junto.
3. A união da fila (D1), como função pura sobre tarefas + estado do parque: tarefa `pending` entra;
   tarefa `done` com quarto `dirty` **entra**; tarefa `done` com quarto `inspected` **não** entra;
   apartamento ativo sem tarefa entra marcado.
4. Tarefa `declined` **não** é classificada como "não arrumado" (D11), e um apartamento `inspected`
   com tarefa `declined` aparece nas duas leituras sem que nenhuma sobrescreva a outra.
5. Sequência de vistoria (D4): dada a lista do servidor e o conjunto de pulados, o "próximo" é o
   primeiro não pulado; com todos pulados, a fila **reapresenta** os pulados em vez de esvaziar.
6. `ROOM_PERMISSION_PROFILE_GRANTS` — a allowlist fechada de `rooms.occupancy` **não muda** com a
   D10: `LIDER_GOVERNANCA` continua **fora**. É o teste que prova que (d) não virou (a).

**E2E** (estende `tests/e2e/rooms-transitions.e2e.spec.ts`, usuário real, sem service role):

7. **O gate da dispensa nos dois sentidos** (D10, substituindo o 7.10 do 78): `LIDER_GOVERNANCA`
   registra `front_desk` e é **aceita**; `RECEPCAO` tentando `housekeeper` é **recusada**. A segunda
   metade é a que continua protegendo.
8. **Reprovar sem falsificar** (D6): apartamento em `clean`, `clean → cleaning` aceito, e o
   `room_status_history` **não** contém `inspected` — o teste que quebra se alguém reintroduzir o
   caminho "aprova e depois reprova".
9. **Dia não aberto** (D8): sem registro do dia, a resposta traz `day: null`, e a tela renderiza o
   painel — **sem contadores em zero**.
10. **Sobrevive à segunda ocupante** (D4/D9): dois atores, o segundo vistoria o apartamento que
    estava no cartão do primeiro; a ação do primeiro responde 409 e a sequência avança em vez de
    gravar por cima.

Como nas fatias anteriores: **alvo compatível escolhido no estado encontrado**, nunca fabricado, e
sem resíduo.

---

## 7. O que NÃO entra

- **Escala, titular por ala e folha impressa** — plano 76.
- **A tela do parque / da recepção** — plano 79, adiado por decisão do Wilson (§1).
- **`housekeeping_task_events`** e a correção dos limites 093/094 — plano 80, alternativa (A).
- **Rota de edição de `service_type`** — D12, vai junto com a (A).
- **Previsão de saída** — depende de reservas (§14 do 75, D10 do 78). Continua aberta.
- **Qualquer migration.** Se aparecer migration nesta fatia, ela está errada.
- **Achados e perdidos, checklist de limpeza, chamado de manutenção.**

---

## 8. Discordância registrada

**A [D8.1 do 75](75-plano-dia-da-governanca.md) criou o mapa `occurredAts` com o argumento de que,
sem ele, "a governanta que lançar dez apartamentos de uma vez carimba os dez com a mesma hora".** A
D3 desta tela decide **não lançar dez de uma vez** — um toque, um apartamento —, e o mapa passa a
ser exercitado com um item.

**Isso parece esvaziar a D8.1, e não esvazia.** O objetivo dela era que cada apartamento carregasse
a sua hora; esta tela chega ao mesmo resultado por outro caminho, e sem criar estado local não
enviado. O mapa continua sendo **a única forma** de o objetivo ser atingido quando o lote voltar — e
ele volta no dia do tablet das camareiras, quando um aparelho lançar o corredor inteiro. Remover o
mapa por "não está sendo usado" é que seria o erro, e é por isso que esta discordância está escrita
aqui em vez de virar uma issue de limpeza.

**A tensão real, dita sem maquiagem:** a D8.1 assumiu lote e otimizou dentro dele; esta tela
escolheu não ter lote onde há tipo. São decisões de camadas diferentes que apontam para o mesmo
lugar, e quem ler só a D8.1 vai achar que a tela desperdiçou a capacidade. Não desperdiçou —
preferiu não precisar dela.

---

## 9. Critério de pronto

**71.0**
- `clean → cleaning` na matriz, com teste nos dois sentidos da permissão (D6).
- Gate da dispensa ajustado e o E2E 7.10 **reescrito**, não removido (D10).
- A allowlist de `rooms.occupancy` **inalterada**, provada por teste (§6.6).
- Nenhuma migration.

**71.A / 71.B / 71.C**
- `npx tsc --noEmit` limpo, ESLint limpo, `npm run test:unit` verde.
- Suíte de apartamentos **44/44 continua verde**, estendida com os casos da §6.
- A grade e a sequência exercitadas **num tablet real**, não só no responsivo do navegador: é onde
  os 44px e o container rolável (D14) ou funcionam ou não.
- **Uma semana de papel em paralelo**, cortada após sete dias corridos sem divergência — e **se
  houver divergência, a semana recomeça** ([§9 do 75](75-plano-dia-da-governanca.md)).
- A governanta usando sozinha, sem ninguém do lado, antes de a fatia ser declarada pronta. É o
  primeiro sistema que ela tem; se precisar de alguém explicando, está errada.

---

## 10. Branch

`feat/tela-da-governanta`. O plano vai em `docs/tela-da-governanta`, para revisão antes do código,
como nas anteriores.

---

## 11. O que eu preciso de você

1. **A divisão (§2)** — quatro fatias, com a 71.0 primeiro. Confirma?
2. **D6 — `clean → cleaning`.** Seu requisito ("reprovar volta para cleaning") **não é executável
   hoje** na fila de vistoria: a aresta não existe. Proponho acrescentá-la com `rooms.inspect`.
   Confirma, ou prefere que reprovar antes da vistoria vá para `dirty`?
3. **D10 — a dispensa.** A governanta recebe **403** hoje ao registrar a dispensa avisada pela
   recepção. Proponho o gate de `front_desk` aceitar `rooms.occupancy` **ou** `rooms.housekeeping`,
   mantendo fechado o sentido inverso. Confirma?
4. **D12 — o tipo não editável.** Recomendo **não** construir a rota de edição agora e deixá-la com
   o plano 80 (A). Se preferir a edição já, ela vira migration e sai da fatia de tela.
5. **D2 — dois botões.** É a decisão que define a tela toda. Se a sua leitura da operação for outra
   — por exemplo, que ela prefere confirmar um padrão a escolher sempre —, isso muda o desenho antes
   de eu escrever a primeira linha.
