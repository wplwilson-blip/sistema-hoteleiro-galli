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

Os dois são **fatos do dia**, e vivem numa entidade nova: a **tarefa do dia**, com chave
`(room_id, service_date)`.

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

### D2 — O tipo de arrumação tem PADRÃO DERIVADO da ocupação, e é editável

Você me deu **50 saídas em 115** e concluiu, com razão, que nenhum padrão fixo ajuda: marcar 50
saídas custa o mesmo que marcar 65 permanências.

Mas a chegada do escritor de ocupação muda a conta. Quando a tarefa entra na fila, o tipo é
**derivado do `occupancy_status` naquele instante** — `vacant` → saída, `occupied` →
permanência — e **continua editável**. A governanta não marca 50 nem 65: ela corrige o que
estiver errado.

Não é lote nem padrão fixo. É o mesmo princípio do plano 70, §4.3, aplicado a outro eixo: **o
normal não se digita, só a exceção** — com a diferença de que aqui "o normal" é calculado a
partir de um fato que outro setor já registrou.

**Alternativa descartada: tipo obrigatório, sem padrão.** Honesta, e imune a erro da Recepção.
Custa 115 decisões por dia numa operação que tem três minutos para isso. Descartada pelo mesmo
motivo que a §4.1 do plano 70 tornou `clean` opcional: **o que custa caro demais não é
preenchido, e vira campo órfão.**

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

## 5. Migration 091

Aditiva. Nenhuma alteração em `rooms`, `room_status_history`, enums existentes ou permissões.

1. **Três enums novos:**
   - `housekeeping_service_type`: `checkout` | `stayover`
   - `housekeeping_task_outcome`: `pending` | `done` | `declined`
   - `housekeeping_decline_origin`: `front_desk` | `housekeeper`

2. **`public.housekeeping_days`** — o registro do dia (D1). `(unit_id, service_date)` único,
   `opened_at`, `opened_by`, `closed_at`, `closed_by`. **É o que distingue silêncio de zero.**

3. **`public.housekeeping_tasks`** — a tarefa do dia. `(room_id, service_date)` único.
   `service_type` (D2), `outcome` (D3), `decline_origin` + `decline_note` (nulos fora de
   `declined`), `housekeeping_employee_id` **nullable** — fica nulo até o plano 76.
   `organization_id` **not null**, vindo de `units` — a mesma coluna cuja ausência derrubaria
   toda transição na 089, e que só apareceu na aplicação.

4. **`CHECK`s que amarram o desfecho:**
   - `declined` exige `decline_origin` preenchida; qualquer outro desfecho exige nula.
   - `decline_note` não-vazia quando houver — sem string em branco fingindo justificativa.

5. **Índices:** `(unit_id, service_date)` e `(unit_id, service_date, outcome)` — as duas filas
   da tela são exatamente essas consultas.

6. **RPC de abertura do dia**, transacional: cria o `housekeeping_days` e as tarefas dos
   apartamentos elegíveis (ativos, não excluídos, `blocking_status = 'none'`) numa transação
   só. Reabrir um dia já aberto é no-op idempotente, nunca duplicação.

7. **Hora real (D5)** na `rooms_apply_transition`: parâmetro `p_occurred_at` opcional, default
   `now()`. As duas travas validadas **dentro do lock**, contra a última linha de histórico do
   apartamento. `create or replace` — mesma função, mesmo padrão da 090.

8. **Trava de lote (D4)** na mesma RPC: `to = 'inspected'` com mais de um apartamento no lote
   **aborta** com `ROOMS_TRANSITION_INSPECT_NOT_BATCHABLE`. `errcode = '22023'`, nunca `40001`
   — a lição da 090.

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
5. **Tipo derivado:** `vacant` → saída, `occupied` → permanência, e a edição manual vence o
   derivado.
6. **Dispensa encerra:** tarefa `declined` **não** conta como pendente; exige origem; origem
   fora de `declined` é rejeitada.
7. **Dia sem registro ≠ dia sem trabalho:** dia não aberto é distinguível de dia aberto com
   zero tarefas.

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

## 14. Branch

Fatia nova, branch novo — a `feat/estado-apartamento-tres-dimensoes` foi mergeada e apagada.
Sugestão: `feat/dia-da-governanca`.
