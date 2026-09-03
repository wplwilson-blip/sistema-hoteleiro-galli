# 75 — Plano: o dia da governança

Status: **plano para revisão. Nenhum código escrito.**
Primeira fatia de escrita da Governança. Continua os planos
[70](70-plano-estado-apartamento-tres-dimensoes.md) e [74](74-plano-errcode-stale-rpc-transicao.md),
ambos fechados e aplicados nos dois bancos.

Área sensível: **migration**. O Wilson aplica no Supabase; ninguém mais.

**Fatia seguinte:** [71] a tela da governanta, que consome este modelo. Depois, [76] escala e
titular por ala, e a fatia da Recepção (ocupação e bloqueio). **Este plano não desenha
nenhuma delas** — só o modelo e as regras que elas herdam.

---

## 1. O que falta, e por que agora

As três dimensões existem e a rota de transição funciona, mas **não há tela de escrita**: mapa
e lista são leitura pura. O que falta para a Governança operar não é interface — é um conceito
que o modelo ainda não tem.

**Um apartamento não "é" permanência. Ele tem uma arrumação de permanência hoje, e outra coisa
amanhã.** Hoje o sistema sabe o estado do apartamento (`housekeeping_status`) e o histórico das
mudanças (`room_status_history`), mas não sabe nada sobre **o dia de trabalho**: quais
apartamentos entram na fila, que tipo de arrumação cada um precisa, quais foram dispensados e
por quem.

Sem isso, a governanta seria obrigada a "vistoriar" dezenas de permanências por dia que nunca
precisaram de vistoria — e abandonaria o sistema em duas semanas.

---

## 2. Os dois tipos de arrumação — o achado central

| Tipo | Ciclo | Estado terminal | Tem vistoria? |
| --- | --- | --- | --- |
| **Saída** (hóspede foi embora) | `dirty → cleaning → clean → inspected` | `inspected` | **Sim** |
| **Permanência** (hóspede continua) | `dirty → cleaning → clean` | `clean` | **Não** |

A permanência **para em `clean` e é isso**. Não há vistoria porque **não há o que liberar para
venda: o apartamento já está ocupado**. Exigir `inspected` numa permanência seria pedir à
governanta que liberasse para venda um quarto com hóspede dentro — a conflação que o plano 70
existiu para desfazer, voltando pela porta da tela.

Esta é a única regra desta fatia que muda o significado de um estado já em produção: `clean`
deixa de ser "meio do caminho" e passa a ser **terminal legítimo** para metade do trabalho do
dia.

---

## 3. Onde as coisas vivem — e onde NÃO vivem

**Nada de tipo de arrumação, dispensa ou hora informada em `public.rooms`.** E, igualmente
importante: **nada disso em `public.room_status_history`.**

- `rooms` guarda o que o apartamento **é agora**. "Hoje é permanência" não é uma propriedade do
  apartamento; é uma propriedade do dia. Coluna em `rooms` seria sobrescrita amanhã e
  responderia apenas "qual foi o último tipo", que não é pergunta que alguém faz.
- `room_status_history` registra **transição de estado**. "O 112 foi dispensado" não é
  transição — o estado dele não mudou, é justamente o ponto. Enfiar lá obrigaria a inventar uma
  linha de histórico para um fato que não moveu nada.

Os dois são **fatos do dia**, e vivem numa entidade nova: a **tarefa do dia**, chaveada por
`(dia, apartamento)` — com FK para o registro do dia, nunca por data solta (§5.3).

---

## 4. Decisões

### D1 — O dia é aberto EXPLICITAMENTE, mesmo com a Recepção escrevendo ocupação

A Recepção passa a marcar `occupied`/`vacant` (fatia própria) — primeiro escritor de
`occupancy_status`, que a D1 do plano 70 previu que existiria um dia. Isso levanta a pergunta:
**a ocupação basta para montar a fila, dispensando o ato de abrir o dia?**

**(a) A ocupação basta.** A fila é derivada em tempo real: quarto `vacant` precisa de arrumação
de saída, `occupied` precisa de permanência. Zero cliques, zero tabela de dia.
**(b) O dia é aberto explicitamente, e a ocupação alimenta a fila.** ← **decidido**

**Por que (b).** A ocupação responde **depois do fato**, e a governanta precisa da lista
**antes**. Os check-outs acontecem espalhados pela manhã; ela distribui o trabalho às 8h,
quando a maioria ainda não saiu. Uma fila derivada de ocupação estaria vazia exatamente na hora
em que ela precisa dela cheia.

E há a razão que (a) não tem como cobrir: **dia sem registro é silêncio, não zero.** Numa fila
derivada, um domingo em que ninguém abriu o sistema é indistinguível de um domingo em que nada
precisou ser arrumado. Os dois aparecem como lista vazia. O registro do dia é o que separa "não
sabemos" de "não havia trabalho" — e essa diferença é a única coisa que impede o histórico de
mentir por omissão.

**O custo de (b), declarado:** um ato a mais por dia, e uma tabela a mais. Aceito.

### D2 — O tipo de arrumação é decidido no FECHO da limpeza, não na abertura do dia

**A versão anterior deste plano estava errada, e o defeito era de lógica.** Ela dizia que o
tipo seria derivado do `occupancy_status` "quando a tarefa entra na fila" — e a tarefa entra na
fila quando o dia é aberto, às 8h. Ou seja: derivava no exato instante em que a **D1 acabou de
argumentar que a ocupação não sabe de nada**. Às 8h os 50 que vão sair ainda estão `occupied`,
então os 50 nasceriam como permanência, e a governanta corrigiria exatamente 50 — a alternativa
que a própria D2 dizia estar descartando, com uma tabela a mais.

E a consequência era pior que o clique. **Permanência para em `clean`, sem vistoria.** Um
apartamento de saída tipado como permanência não entra na fila de vistoria: fica limpo, não
vistoriado, e **ninguém percebe que falta, porque o sistema acha que aquilo acabou**.
Apartamento que não chega em `inspected` não vende.

#### O que a governanta precisa às 8h — e por que não é o tipo

Às 8h ela precisa da **lista** e da **distribuição**: quem arruma qual corredor. Para isso o
tipo é irrelevante.

O tipo só importa **num único momento**: quando a limpeza termina e é preciso decidir se o
apartamento **para em `clean`** ou **segue para `inspected`**. Isso acontece no fim do serviço,
não no começo do dia.

Saber às 8h **quem vai sair hoje** seria genuinamente útil para planejar — mas isso **não é
ocupação**: é previsão de saída, informação que a Recepção tem e que **não existe em lugar
nenhum deste sistema**. Ver a alternativa (e) e a §14.

#### Alternativas

**(a) Derivar na criação da tarefa, às 8h.** Era a proposta anterior. **Errada**, pelo motivo
acima: deriva quando a fonte não sabe, e erra nos 50 casos que mais importam.

**(b) Não armazenar o tipo; derivar na leitura, sempre.** A fila calcula o tipo ao vivo a partir
da ocupação atual. Custo: **o tipo nunca é estável**. Uma permanência arrumada às 9h vira saída
às 11h quando o hóspede sai, e o registro de ontem muda conforme o hotel de hoje. Mata o valor
de auditoria: não dá para responder "o que fizemos ontem". Descartada.

**(c) Armazenar, e re-derivar por evento quando a ocupação mudar.** A tarefa nasce permanência;
quando a Recepção marca `vacant`, a tarefa **pendente** daquele quarto vira saída sozinha.
Custo real, e é grande: um quarto já arrumado como permanência às 9h que faz check-out às 11h
precisa de uma **segunda tarefa no mesmo dia** — o que quebra a unicidade `(dia, apartamento)` e
transforma a tarefa do dia numa lista de serviços por quarto. Custo 2: a fila muda debaixo dela
enquanto distribui o trabalho. Descartada nesta fatia — é a evolução natural quando houver
previsão de saída, não a partida.

**(d) Campo obrigatório na abertura, sem padrão nenhum.** Honesta e imune a erro da Recepção.
Custa **115 decisões por dia** — pior que os 50 que se queria evitar, e todas tomadas no pior
momento, antes de qualquer informação. Descartada.

**(e) Derivar da previsão de saída informada pela Recepção.** É a resposta **certa** para a
necessidade das 8h: a Recepção sabe quem sai hoje e informa. O tipo nasceria correto, e a
governanta planejaria a manhã de verdade. **Custo: depende de um conceito que não existe e de
uma fatia que ainda não foi escrita** — ver §14, porque isso é decisão de ordem, não de
modelagem.

**(f) Decidir no FECHO da limpeza, com padrão derivado NAQUELE instante.** ← **decidido**

#### Como (f) funciona

A tarefa **nasce sem tipo**. O tipo passa a ser **exigido na transição para `clean`** — e só
nela. Naquele momento:

- a ocupação **já é informativa**: é meio da manhã, o hóspede que ia sair já saiu, e a Recepção
  já marcou `vacant`;
- e, mais importante, **quem está registrando acabou de ver o quarto**. Roupa no armário ou
  quarto vazio é a informação mais confiável que existe, e ela está disponível exatamente ali.

O padrão vem da ocupação **no instante do fecho** (`vacant` → saída, `occupied` → permanência) e
**continua editável**. Um clique, no momento em que a decisão é natural, e não 50 correções
cegas às 8h.

**Isso não acrescenta passo ao fluxo.** Marcar `clean` já é uma ação que ela faz; o tipo entra
como parte dessa ação, não como uma segunda.

#### O que (f) NÃO resolve, dito claramente

**A necessidade de planejamento das 8h continua descoberta.** Nesta fatia, a governanta
distribui o trabalho como distribui hoje — pelo papel e pelo que a Recepção lhe conta. **O
sistema 75 registra o que aconteceu; ele não planeja a manhã.** Planejar vira possível com (e),
na fatia da Recepção.

Dizer isso é melhor que forçar um derivado que erra em 50 casos.

#### A rede de segurança que (f) permite

Como a Recepção escreve ocupação, um apartamento **`vacant` cuja tarefa foi encerrada como
permanência** é uma inconsistência **detectável**: alguém saiu e o quarto não foi vistoriado.

Isso vira uma lista de conferência **da própria governanta**, na tela dela — não é alarme entre
setores (§8 recusa isso, e continua recusando). É ela conferindo o próprio trabalho, com um
dado que o sistema já tem.

#### D2.1 — Quando uma tarefa termina SEM tipo, e por quê

A regra "o tipo é exigido no fecho" fechava **uma** aresta e deixava a irmã aberta. O atalho
`cleaning → inspected` (§4.1 do plano 70) **não passa por `clean`** — do jeito que estava, ele
encerraria a tarefa com `service_type` nulo, e "quantas saídas fizemos ontem" ficaria com buraco
justo nos apartamentos que a governanta despachou mais rápido.

**A regra completa, e ela é um bicondicional:**

> **`service_type` é preenchido se e somente se `outcome = 'done'`.**
> Trabalho feito sempre tem tipo. Trabalho não feito nunca tem.

| Desfecho | `service_type` | Por quê |
| --- | --- | --- |
| `done` | **obrigatório** | Alguém arrumou o quarto. O tipo descreve **o serviço executado**. |
| `pending` | **nulo** | Ainda não foi feito. Tipar agora seria adivinhar. |
| `declined` | **nulo** | Dispensa: **nada foi feito**. Ver abaixo. |
| `cancelled` | **nulo** | O apartamento saiu de operação. Nada foi feito. |

**Um `CHECK` amarra o bicondicional**, nos dois sentidos — `done` sem tipo é rejeitado, e tipo
com qualquer outro desfecho também. Não é convenção da aplicação: é o banco.

##### O atalho: chegar em `inspected` É saída, por definição

Permanência **para em `clean`** (§2). Logo, **um apartamento que chega em `inspected` é
necessariamente uma saída** — não há outro caminho.

Então a transição para `inspected` **define `service_type = 'checkout'`**, sempre:

- vindo do atalho `cleaning → inspected`, onde o tipo ainda era nulo, ele passa a `checkout`;
- vindo de `clean → inspected`, onde o tipo já era `checkout`, nada muda;
- e vindo de `clean → inspected` num tarefa que estava tipada `stayover`, **corrige para
  `checkout`**.

Esse terceiro caso merece ser dito em voz alta, porque é uma sobrescrita de fato registrado.
Ele acontece quando o hóspede saiu **depois** de a arrumação de permanência ter sido feita —
situação real e frequente. A vistoria é o ato **posterior e mais informado**: ela é feita com a
governanta dentro do quarto, sabendo que ele está vazio. **O ato mais bem informado vence**, e a
correção não é silenciosa: a transição fica em `room_status_history` com hora e autor.

##### Dispensa não tem tipo — e isso é decisão, não omissão

Seria tentador gravar `stayover` numa dispensa, já que dispensa só acontece com hóspede dentro.
**Não gravamos**, e o motivo é o mesmo da separação `declined` / `cancelled`: `service_type`
descreve **serviço executado**, e numa dispensa não houve serviço.

Gravar `stayover` faria o relatório do mês contar como permanência realizada um quarto que
**ninguém entrou**. A contagem certa continua disponível sem isso: saídas são
`done + checkout`, permanências são `done + stayover`, dispensas são `declined`. Nada se perde,
e nada é inflado.

##### Limitação declarada: segundo serviço no mesmo dia

Um quarto arrumado como permanência às 9h cujo hóspede sai às 11h recebe uma segunda arrumação
— mas a tarefa é **uma por dia**. O modelo absorve isso pelo caminho descrito acima (a vistoria
retipa para `checkout`), e o `room_status_history` guarda **todas** as transições dos dois
serviços.

**O que se perde:** a contagem do mês vê aquele quarto uma vez, não duas. É o custo da
alternativa (c) ter sido descartada, e ele fica registrado aqui em vez de aparecer como surpresa
num relatório. Resolvido quando houver previsão de saída (§14).

### D3 — A dispensa ENCERRA a tarefa, não a deixa pendente

Boa parte das permanências o hóspede não quer que arrumem. Chega por dois caminhos: a Recepção
avisa antes, ou a camareira descobre na porta. **Os dois são registrados, com a origem.**

O apartamento continua `occupied`, a limpeza **não muda**, ele sai da fila do dia e volta amanhã
normalmente. Quando o hóspede sair, é arrumação de saída como qualquer outra — sem tratamento
especial por ter ficado dias sem ninguém entrar.

**Desfecho `dispensada`, dia encerrado.** Não é pendência.

**Alternativa descartada: dispensada conta como não concluída.** O número que a governanta olha
no fim do dia é "o que ficou por fazer", e apartamento dispensado não é isso. Se contasse como
pendência, ela terminaria todo dia com vinte vermelhos que não são problema nenhum — e em duas
semanas pararia de olhar o número. **Indicador que sempre acusa é indicador que ninguém lê.**

### D4 — Chegar em `inspected` NÃO aceita lote

A rota nasceu em lote (plano 70, §6.2) e continua certa nisso. Mas **vistoria é individual por
natureza**: a informação que `clean → inspected` carrega é *"eu olhei este quarto"*, e um botão
que libera vinte de uma vez é um botão que libera vinte sem olhar.

**A trava é sobre chegar em `inspected`, não sobre uma aresta.** Vale para `clean → inspected`
**e para `cleaning → inspected`** (o atalho da §4.1). Fechar só a primeira seria pior que não
fechar nenhuma: a governanta descobre o desvio em uma semana e passa a usar o atalho justamente
para liberar em lote — e aí o atalho, que existe para poupar clique, vira a porta dos fundos da
vistoria.

O lote **continua** para tudo que é fato coletivo: marcar uma ala inteira como `dirty` ao abrir
o dia, marcar `cleaning` quando a camareira começa o corredor, bloquear um andar. Esses são
fatos sobre muitos quartos ao mesmo tempo. Vistoria não é.

**Por que entra aqui e não como correção imediata:** a trava da matriz (`inspected → cleaning`,
já corrigida) é comportamento **errado** hoje. Esta é comportamento **certo** que precisa ficar
mais estreito, e ninguém consegue usá-la errado porque não existe tela. Sem urgência, e
pertence ao plano que desenha a vistoria.

### D5 — Hora real por transição, padrão agora, retroativa com trava

A camareira anota "112 — 10h20" na folha; a governanta lança às 11h05 informando 10h20.
`housekeeping_changed_at` guarda **a hora do fato, não a da digitação**.

A hora é **por transição**, e o **padrão é agora**. A folha diz quando a camareira terminou —
isso é a chegada em `clean`. A vistoria às 11h05 aconteceu às 11h05 mesmo; só o que veio do
papel é retroativo.

**Duas travas, ambas no banco e na rota:**
1. **Não pode ser futura.**
2. **Não pode ser anterior à transição anterior do mesmo apartamento no mesmo dia.**

Sem elas o histórico aceita "arrumado às 10h20, sujo às 14h" numa ordem que não aconteceu, e a
linha do tempo do apartamento vira ficção. Como o "Sujo há 6 horas" é calculado sobre esse
campo, ficção aqui vira número errado na tela da governanta.

**Se o campo for difícil de achar, ela deixa no automático e o dado se perde.** Isso é
requisito de tela (plano 71), registrado aqui porque é a razão de o campo existir: sem uso
real, os primeiros meses de histórico ficam todos concentrados no fim da tarde.

### D6 — Permissão: reaproveita `BASE:rooms.housekeeping`

Abrir o dia, editar o tipo e registrar dispensa são **o mesmo trabalho da mesma pessoa** que já
registra limpeza. Nenhum código novo.

**Alternativa descartada: `BASE:rooms.day.manage` novo.** Mais granular, e defensável. Mas cada
código novo é mais uma linha de matriz para manter e mais uma chance de *dead grant* — o
incidente `DEPARTMENT_MANAGER`/`approvals.decide` que este projeto já pagou uma vez. Granularidade
que não separa **pessoas diferentes** só separa linhas de tabela.

Se um dia a Recepção precisar registrar dispensa direto (hoje ela avisa e a governanta lança),
aí sim aparece um ator diferente e o código próprio se justifica. **Não é agora.**

---

### D7 — A data operacional é calculada no fuso da UNIDADE, nunca no do servidor

**Defeito encontrado na revisão da 091, antes de aplicar.** O servidor do Supabase roda em
**UTC** (`show timezone` confirmou). Três pontos da migration convertiam instante em data com o
fuso do servidor: o `current_date` da abertura do dia, a comparação `changed_at::date =
v_at::date` da trava de ordem, e a busca do `housekeeping_days` pela data da transição.

São Paulo é UTC−3. **Às 21h00 no hotel já são 00h00 UTC**, e a data vira amanhã.

**O que isso quebraria, e não é borda.** A governanta encerra uma manutenção às 21h30, ou
vistoria um quarto que atrasou. A RPC procura o `housekeeping_days` de **amanhã**, não acha,
`v_day_id` fica nulo e **o bloco inteiro dos efeitos na tarefa é pulado em silêncio**: o quarto
sai de bloqueio e a tarefa não ressuscita, o `inspected` não tipa como saída, o `clean` não
fecha a permanência. Nenhum erro — só o dado que não chega, **todo dia depois das 21h**. É
exatamente o modo de falha que a §5.7 descreve para a sobrecarga antiga, e governança de hotel
trabalha depois das 21h: turndown, atraso, manutenção noturna.

A trava de ordem tem o problema irmão: 20h50 e 21h10 caem em "dias" diferentes (23h50 e 00h10
UTC), então a segunda transição não é conferida contra a primeira — a trava se desliga
justamente no fim do dia, que é quando o lançamento retroativo é mais provável.

**A informação certa já existia e ninguém lia.** `units.timezone` existe desde a migration
**002**, `not null default 'America/Sao_Paulo'`, e nunca foi lida por função nenhuma — só
escrita, com valor fixo, em duas rotas. **É o mesmo padrão do `organization_id` da 089: a coluna
estava lá, e o código não olhou.** Vale registrar como padrão, não como coincidência: as duas
vezes, o dado necessário já existia no schema e a função nova o ignorou.

**Fica por unidade, e não numa constante**, porque é o que o SaaS vai precisar no primeiro hotel
fora do fuso de Brasília.

**Uma função só — `housekeeping_service_date(instante, unidade)`** — e não `at time zone`
repetido nos três lugares. Três cópias divergem na primeira manutenção; e a função única é o que
torna barata a dívida abaixo.

#### D7.1 — Corte do dia às 6h: dívida registrada, não construída

O dia do hotel não termina necessariamente à meia-noite: em muitas operações a governança conta
das 6h às 6h.

**Avaliei e recomendo NÃO construir agora**, por um motivo concreto: o corte só muda alguma
coisa para trabalho lançado **depois da meia-noite local**. O turndown do Galli termina por
volta das 22h, e entre 21h e 23h59 a data local já é a correta com a D7. **O corte resolveria
um problema que esta operação não tem** — e um enum de conveniência para um caso hipotético é
exatamente o tipo de campo que o plano 70 aprendeu a recusar.

**Custo de acrescentar depois: baixo, e ficou baixo de propósito.** Uma coluna em `units`
(`housekeeping_day_cutoff`, default `00:00`) e **uma linha** dentro de
`housekeeping_service_date` — porque o cálculo está centralizado. Nenhum dos três chamadores
muda.

**O que ficaria mais caro depois, e é o alerta honesto:** `service_date` deixaria de ser data de
calendário e passaria a ser data *operacional*. Relatórios já escritos contra a tabela
mudariam de significado sem mudar de forma. Se isso for entrar algum dia, é melhor que seja
**antes** de existir relatório — e não depois.

---

### D8 — Sobrecarga de função NÃO é utilizável através do PostgREST

**Regra geral deste projeto, não observação sobre esta migration.**

A primeira versão da 091 acrescentava `p_occurred_at timestamptz default null` à assinatura da
`rooms_apply_transition`, criando uma **sobrecarga**: a de 4 argumentos (090) e a de 5
conviviam. O raciocínio era sobre Postgres, onde sobrecarga com default de fato resolve, e o
plano afirmava que o app antigo continuaria funcionando durante a janela do deploy.

**Não continua.** O PostgREST resolve função por **nome de argumento**, e uma chamada com os
quatro casa com as **duas** assinaturas:

```
PGRST203 Could not choose the best candidate function between:
  public.rooms_apply_transition(p_transitions, p_dimension, p_reason, p_actor_id),
  public.rooms_apply_transition(p_transitions, p_dimension, p_reason, p_actor_id, p_occurred_at)
```

A chamada **não executa** — nem uma, nem outra. Descoberto pela suíte E2E depois de a versão com
sobrecarga já estar aplicada em staging: **toda transição pelo app passou a devolver PGRST203**,
e só não incomodou porque ainda não há tela.

**A consequência que vale para toda RPC futura: mudança de assinatura em função exposta pelo
PostgREST é sempre quebra, nunca compatibilidade.** Não existe "acrescentar parâmetro opcional"
— existe substituir a função, com janela, ou não mexer na assinatura.

**O que fazemos em vez disso:** parâmetro novo entra **dentro do payload jsonb** que a função já
recebe, ao lado de `service_type`. Campo desconhecido é ignorado por quem não o lê, então o
banco novo funciona com o app antigo e o app novo com o banco antigo — compatibilidade nos dois
sentidos, que é o que a sobrecarga prometia e não entregava.

**E, neste caso, é também a modelagem certa** — não um contorno. A folha tem uma hora **por
apartamento**: "112 às 10h20, 113 às 10h45". Com hora por chamada, a governanta teria que lançar
um apartamento por vez para preservar a hora real, **anulando o lote exatamente no caso em que
ele mais serve**: ela passa o corredor com a folha na mão e lança dez de uma vez, cada um com a
sua. Um lote gerando linhas de histórico com horas diferentes é o comportamento certo — os fatos
aconteceram em horas diferentes.

**Como isso passou por duas revisões:** a premissa estava escrita em português no cabeçalho da
migration ("o app antigo continua funcionando pela sobrecarga") e é verdadeira *sobre o
Postgres*. Ler SQL não revela o comportamento do PostgREST. **Só a chamada real pega** — é a
mesma lição do `organization_id` da 089 e do `errcode` da 090, agora pela terceira vez.

---

## 5. Migration 091

Aditiva. Nenhuma alteração em `rooms`, `room_status_history`, enums existentes ou permissões.

1. **Três enums novos:**
   - `housekeeping_service_type`: `checkout` | `stayover`
   - `housekeeping_task_outcome`: `pending` | `done` | `declined`
   - `housekeeping_decline_origin`: `front_desk` | `housekeeper`

2. **`public.housekeeping_days`** — o registro do dia (D1). `(unit_id, service_date)` único,
   `opened_at`, `opened_by`, `closed_at`, `closed_by`. **É o que distingue silêncio de zero.**

3. **`public.housekeeping_tasks`** — a tarefa do dia.
   **`housekeeping_day_id` NOT NULL, com FK para `housekeeping_days`**, e único
   `(housekeeping_day_id, room_id)`. A versão anterior chaveava por `(room_id, service_date)`,
   com o vínculo ao dia apenas implícito via `room → unit` — o que permitia **tarefa existir sem
   dia**, exatamente o estado que a D1 diz ser impossível. A FK fecha isso no banco, e não na
   boa vontade da aplicação.
   `service_type` **NULLABLE** (D2: preenchido no fecho, não na abertura), `outcome` (D3),
   `decline_origin` + `decline_note` (nulos fora de `declined`), `housekeeping_employee_id`
   **nullable** — fica nulo até o plano 76. `organization_id` **not null**, vindo de `units` — a
   mesma coluna cuja ausência derrubaria toda transição na 089, e que só apareceu na aplicação.

4. **`CHECK`s que amarram o desfecho:**
   - `declined` exige `decline_origin` preenchida; qualquer outro desfecho exige nula.
   - `decline_note` não-vazia quando houver — sem string em branco fingindo justificativa.
   - **O bicondicional da D2.1**: `service_type` preenchido **se e somente se**
     `outcome = 'done'`. Os dois sentidos no mesmo `CHECK` — `done` sem tipo é rejeitado, e
     tipo em `pending`, `declined` ou `cancelled` também. Trabalho feito sempre tem tipo;
     trabalho não feito nunca tem.

5. **Índices:** `(unit_id, service_date)` e `(unit_id, service_date, outcome)` — as duas filas
   da tela são exatamente essas consultas.

6. **RPC de abertura do dia**, transacional: cria o `housekeeping_days` e as tarefas dos
   apartamentos elegíveis (ativos, não excluídos, `blocking_status = 'none'`) numa transação
   só. Reabrir um dia já aberto é no-op idempotente, nunca duplicação.

   **6.1 — Apartamento que SAI de bloqueio depois do dia aberto ganha tarefa.** A abertura
   filtra `blocking_status = 'none'`, mas encerrar manutenção derruba o apartamento para
   `dirty` (plano 70, §4.2): ele passa a precisar de arrumação e não teria tarefa naquele dia —
   **sumiria da fila justamente quando voltou a precisar de trabalho**. A
   `rooms_apply_transition` passa a criar a tarefa pendente quando `dimension = 'blocking'`,
   `to = 'none'` e existe dia aberto sem tarefa para aquele apartamento. Mesma transação do
   desbloqueio, como o efeito colateral de limpeza que já vive lá.

   **6.2 — O caso simétrico: apartamento BLOQUEADO com tarefa pendente.** Ele ficaria em "falta
   arrumar" para sempre, porque ninguém vai arrumar um quarto em obra. `outcome` ganha o valor
   **`cancelled`**, aplicado ao bloquear, **distinto de `declined`** — dispensa é decisão do
   hóspede, cancelamento é o apartamento ter saído de operação. Achatar os dois faria o
   relatório do mês dizer que o hóspede dispensou arrumação num quarto que estava em obra.
   *(Decidido pelo Wilson; a alternativa de deixar pendente e filtrar na tela foi recusada
   porque joga para a tela a responsabilidade de esconder um dado que o modelo sabe estar
   errado — e a primeira consulta fora da tela volta a mostrar.)*

7. **Hora real (D5)** na `rooms_apply_transition`: parâmetro `p_occurred_at` opcional, default
   `now()`. As duas travas validadas **dentro do lock**, contra a última linha de histórico do
   apartamento. `create or replace` — mesma função, mesmo padrão da 090.

   **`p_occurred_at` alimenta OS DOIS campos:** `room_status_history.changed_at` **e**
   `rooms.housekeeping_changed_at`. A versão anterior falava só do histórico — e se o histórico
   fosse retroativo enquanto o `housekeeping_changed_at` continuasse em `now()`, o **"Sujo há 6
   horas" mentiria**, que é precisamente a razão de aquela coluna existir. O relógio da limpeza
   só reinicia quando a limpeza muda (regra já na 089), agora com a hora do **fato**.

8. **Trava de lote (D4)** na mesma RPC: `to = 'inspected'` com mais de um apartamento no lote
   **aborta** com `ROOMS_TRANSITION_INSPECT_NOT_BATCHABLE`. `errcode = '22023'`, nunca `40001`
   — a lição da 090.

9. **Chegar em `inspected` define `service_type = 'checkout'`** na tarefa do dia (D2.1), na
   mesma transação da transição. É o que fecha o atalho `cleaning → inspected` sem exigir um
   passo a mais da governanta.

**`revoke`/`grant` repetidos** ao fim, como a 090: `create or replace` não reseta ACL, mas a
migration fica auto-curativa.

---

## 6. Aplicação

| Arquivo | Mudança |
| --- | --- |
| `rooms-utils.ts` | `terminalStatusFor(serviceType)`, `isTaskComplete()`, `canBatchTransition()`, `validateOccurredAt()` — puras. |
| `src/app/api/base/rooms/transitions/route.ts` | Aceita `occurredAt`; recusa lote em `inspected` antes de chamar a RPC. |
| Rotas novas de dia e tarefa | Abrir o dia, editar tipo, registrar dispensa. |
| `tests/unit/` | §7. |
| `tests/e2e/` | Estende a suíte do plano 70. |

**Fora desta fatia:** a tela (plano 71), a escala (76), a Recepção (fatia própria).

### 6.1 O que a tela herda pronto — restrição de desenho, não sugestão

**São 50 vistorias individuais por dia.** Isso não é uma lista de 50 com um botão em cada linha:
é uma **sequência**. Abre o primeiro, vistoria, aprova ou reprova, e o próximo já está na frente
dela. A governanta está circulando com o tablet — **a tela tem que acompanhar o passo dela pelo
corredor, não obrigá-la a caçar linha em lista.**

**Duas filas separadas**, porque são momentos diferentes do dia: "falta arrumar" e "limpo
aguardando vistoria". É exatamente por isso que `clean` e `inspected` são estados distintos
desde a 089.

---

## 7. Testes — todos puros, no runner sem banco

1. **Estado terminal por tipo:** saída completa em `inspected`; permanência completa em
   `clean`; permanência **não** exige `inspected`.
2. **Lote não chega em `inspected`:** `clean → inspected` e `cleaning → inspected` recusados
   com mais de um apartamento; aceitos com exatamente um. As **duas** arestas — fechar só uma
   é o furo que a D4 descreve.
3. **Lote continua permitido** em `dirty`, `cleaning`, `clean` e nas transições de bloqueio.
4. **Hora retroativa:** futura recusada; anterior à transição anterior do mesmo apartamento no
   mesmo dia recusada; ausente vira agora.
5. **Tipo no fecho (D2):** tarefa nasce **sem tipo**; o padrão sugerido no fecho vem da
   ocupação **daquele instante** (`vacant` → saída, `occupied` → permanência) e a edição manual
   vence o derivado. **A abertura do dia não define tipo nenhum** — é o teste que trava a volta
   do defeito da D2 anterior.
5b. **O bicondicional (D2.1):** `done` exige tipo; `pending`, `declined` e `cancelled` exigem
   tipo **nulo**. Os dois sentidos.
5c. **O atalho tipa sozinho (D2.1):** `cleaning → inspected` deixa a tarefa `done` +
   `checkout` sem passo extra; `clean → inspected` numa tarefa `stayover` **corrige** para
   `checkout`.
6. **Dispensa encerra:** tarefa `declined` **não** conta como pendente; exige origem; origem
   fora de `declined` é rejeitada.
7. **Dia sem registro ≠ dia sem trabalho:** dia não aberto é distinguível de dia aberto com
   zero tarefas.
8. **Tarefa não existe sem dia:** a FK recusa órfã (§5.3), e desbloquear com dia aberto cria a
   tarefa que faltava (§5.6.1).
9. **Hora retroativa alimenta os dois campos** (§5.7): histórico e `housekeeping_changed_at`
   recebem o mesmo instante informado.
10. **Data operacional no fuso da unidade (D7):** um instante às 23h00 de São Paulo pertence ao
    dia de **hoje**, não ao de amanhã; e 20h50 e 21h10 são o **mesmo** dia operacional — é o que
    faz a trava de ordem continuar conferindo depois das 21h.

---

## 8. Risco operacional — a dependência entre Recepção e Governança

**Não é nota de rodapé. É a única dependência entre setores que este modelo cria, e ela é
real.**

Com a Recepção escrevendo ocupação, **erro de um setor vira trabalho perdido do outro**: se a
Recepção esquece de marcar uma saída, o apartamento continua `occupied`, a tarefa nasce como
permanência, e a governanta arruma um quarto vazio como se tivesse hóspede — sem vistoria, e
portanto **sem liberar para venda**.

**Por que funciona mesmo assim, e por que isso não é otimismo:** a Recepção tem incentivo
próprio e imediato. Ela precisa do quarto para vender, e um quarto que não chega a `inspected`
não pode ser vendido. **O erro dela custa a ela, no mesmo dia.** É um acoplamento que se
auto-corrige, e é por isso que hotel inteiro funciona assim.

**O que isso exige do desenho, e entra no plano 71:** a governanta precisa conseguir corrigir o
tipo **sem depender da Recepção** — é a razão de a D2 manter o campo editável em vez de
somente derivado. O sistema não deve travar esperando outro setor consertar o que ele registrou
errado.

**O que NÃO fazemos:** alarme, bloqueio ou fluxo de aprovação entre setores. Seria construir
processo para um erro que a operação já corrige sozinha, e o custo apareceria todo dia enquanto
o benefício apareceria raramente.

---

## 9. Papel em paralelo — com prazo e critério de corte

**Uma semana.** Cortado após **sete dias corridos sem divergência** entre folha e sistema. **Se
houver divergência, a semana recomeça** — não "quase lá", recomeça.

Prazo e critério estão escritos aqui de propósito: **papel paralelo sem prazo vira permanente,
e aí ninguém confia em nenhum dos dois.** A folha continua existindo depois disso, mas como
instrumento da camareira (plano 76), não como conferência do sistema.

---

## 10. Quando o tablet das camareiras chegar

Não construir para isso agora. **Não construir nada que impeça.**

A inversão é de **quem lança**, não de **o que existe**: a camareira passa a preencher os mesmos
campos que a governanta preenche hoje, e a fronteira `clean → inspected` continua exatamente
onde está — é ela que impede a inversão de virar autoliberação.

O que travaria o futuro seria amarrar autoria ao perfil da governanta. **Não faremos isso:** a
tarefa registra *quem* fez a transição, e nada no modelo pressupõe que seja sempre a mesma
pessoa.

---

## 11. O que NÃO entra

- Tela (**71**), escala e titular por ala (**76**), Recepção com ocupação e bloqueio (**fatia
  própria**).
- Reserva, tarifa, check-in/check-out como entidades. **Continua não sendo PMS.**
- Achados e perdidos, checklist de limpeza, chamado de manutenção.
- Qualquer coluna de tipo de arrumação ou dispensa em `rooms` ou `room_status_history` (§3).

---

## 12. Discordância registrada

**A §4.3 do plano 70 disse que ação em lote é requisito, não conforto** — e a rota nasceu em
lote por causa disso, com o argumento de que 115 apartamentos com clique individual fazem a
governanta voltar para o papel.

A D4 deste plano **estreita** aquela decisão: vistoria não é lote. As duas convivem, mas a
tensão precisa ficar escrita, porque quem ler só o plano 70 vai achar que a trava é regressão.

**Não é.** O que a §4.3 protegia era o custo de registrar **fatos coletivos** — uma ala inteira
que ficou suja, um corredor que começou a ser arrumado. Isso continua em lote. O que ela não
previu é que **um dos estados carrega uma afirmação individual**: `inspected` significa "eu
olhei". Lote e vistoria são incompatíveis por natureza, e descobrir isso exigiu conhecer a
operação — não dava para deduzir do modelo.

---

## 13. Critério de pronto

- `npx tsc --noEmit` limpo, `npm run test:unit` verde com os sete testes da §7.
- Migration 091 **escrita e não aplicada pelo Codex**, com VALIDACAO e ROLLBACK, e a
  conferência de sintaxe do plano 74 §8 executada e reportada.
- Suíte E2E do plano 70 continua verde, estendida com a trava de lote e a hora retroativa.
- Aplicada pelo Wilson em staging, E2E verde lá, e só então produção.
- Nenhum resíduo em staging.

---

## 14. Uma consequência de ordem — decisão do Wilson

A alternativa **(e)** da D2 (previsão de saída informada pela Recepção) é a única que resolve a
necessidade das 8h: saber quem sai hoje **antes** de distribuir o trabalho. Ela é melhor que a
solução adotada, e não foi escolhida por um motivo só — **depende de um conceito que a fatia da
Recepção ainda não tem**.

Isso abre uma decisão que não é minha:

**(i) Seguir com 75 como está.** A governanta registra o que aconteceu e continua planejando a
manhã pelo papel, como faz hoje. A previsão de saída entra depois, na fatia da Recepção, e o
tipo passa a nascer certo — evolução aditiva, sem retrabalho do modelo.

**(ii) Trazer a fatia da Recepção para antes do 75.** O tipo nasce correto desde o primeiro dia
e a governanta ganha planejamento junto com registro. Custo: a Governança fica **mais tempo sem
tela nenhuma**, e a Recepção passa a ser a primeira a receber uma tela de escrita — invertendo
a prioridade que motivou toda esta linha de trabalho.

**Recomendo (i)**, pelo mesmo argumento que definiu a ordem `75 → 71 → 76`: o risco maior não é
retrabalho, é seguir escrevendo planos sem nunca ter visto a governanta usar nada. E a evolução
para (e) é aditiva — a tarefa já tem `service_type` nullable, e passar a preenchê-lo na abertura
a partir de uma previsão não muda nada do que este plano decide.

---

## 15. Branch

Fatia nova, branch novo — a `feat/estado-apartamento-tres-dimensoes` foi mergeada e apagada.
Sugestão: `feat/dia-da-governanca`.
