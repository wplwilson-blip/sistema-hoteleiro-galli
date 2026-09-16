# 80 — Plano curto: a dispensa precisa sobreviver ao resto do dia

Status: **desenho para decisão. Nenhum código escrito, nenhuma migration.**
Defeito alcançável em **produção** a partir da fatia 78.

---

## 1. O defeito, em uma frase

Uma tarefa **dispensada** que depois chega a `inspected` derruba a RPC com **`23514`** — o bloco
(a) grava `outcome = 'done'` e **não limpa `decline_origin`**, violando o bicondicional
`housekeeping_tasks_decline_origin_iff_declined` da 091.

Caminho real, não hipotético: o hóspede dispensa a arrumação de manhã; à tarde ele faz
check-out, o quarto é arrumado e vistoriado. A vistoria responde **500**.

**É pré-existente à fatia 78** — o bloco (a) é da 091, aplicado nos dois bancos. O que a 78
mudou foi torná-lo **alcançável**: antes não havia como registrar dispensa com origem
`front_desk`, porque o gate exigia `rooms.housekeeping` para qualquer origem (D6 do plano 78).

### O irmão silencioso

O mesmo bloco (a) sobrescreve `cancelled` → `done` sem erro nenhum, porque `cancelled` não tem
coluna companheira com bicondicional. **Não derruba: apaga.** Um é 500, o outro é perda calada —
a mesma causa com dois sintomas, e o segundo é o pior de descobrir.

---

## 2. Por que não é o mesmo limite do D12 — correção a um argumento meu

Eu escrevi que limpar a `decline_origin` "apaga que a dispensa aconteceu, que é o mesmo limite
do D12". **Está errado, e no sentido que importa.**

No D12 o dado **sobrevive em outro lugar**: o check-out tardio deixa a tarefa `done` e o quarto
`dirty`, e o quarto `dirty` aparece no parque. A informação não se perde — só não está na fila.

Aqui **não sobrevive em lugar nenhum**. Dispensa **não é transição** — decisão da §3 do plano
75, porque o estado do apartamento não muda —, então ela não está em `room_status_history`. Está
só na tarefa, em três campos (`outcome`, `decline_origin`, `decline_note`) e no `completed_at`.
Sobrescrever a linha apaga o fato **de vez**.

E isso decide a fatia: **não dá para limpar a origem e seguir**, e não dá para deixar a RPC
derrubando com `23514` em produção.

### A assimetria que orienta a saída

| Fato | Onde mora | Sobrevive se a linha for sobrescrita? |
|---|---|---|
| A arrumação aconteceu | `room_status_history` (`dirty → cleaning → clean → inspected`) | **Sim** |
| A dispensa aconteceu | só em `housekeeping_tasks` | **Não** |

Entre perder um e perder o outro, a escolha não é de gosto.

---

## 3. O desenho — quatro saídas, com custo

### (A) Tabela de eventos da tarefa — `housekeeping_task_events` — **recomendada**

O mesmo padrão que a 092 já criou para os dias, pela mesma razão: `housekeeping_days` guarda o
**estado atual** (`closed_at` nulo = aberto) e `housekeeping_day_events` guarda a **trilha** —
inclusive o `pending_count` do fechamento, que não é derivável depois. Aqui é idêntico: a tarefa
guarda o desfecho atual; a trilha guarda cada fato, com hora e autor.

- Enum `housekeeping_task_event`: `declined`, `done`, `cancelled`, `not_done`, `reopened`.
- Colunas de contexto com bicondicional próprio, como `pending_iff_closed`:
  `decline_origin` preenchida **se e somente se** o evento é `declined`; `service_type`
  preenchido **se e somente se** o evento é `done`.
- O bloco (a) passa a **inserir o evento** e só então atualizar o desfecho, limpando
  `decline_origin` sem perder nada — porque o fato agora tem segundo domicílio.

**Custo:** migration nova (tabela, enum, índice, ACL), reescrita da RPC (que já vai completa a
cada fatia), a rota de dispensa passando a gravar evento, e os testes. É a maior das quatro.
**É também a única que responde "o aviso da recepção está funcionando?" depois de o dia acabar**
— hoje, uma tarefa dispensada de manhã e concluída à tarde não conta para lugar nenhum.

**O que ela destrava de quebra:** o D12 do plano 78 (check-out tardio depois da arrumação de
permanência) é o **mesmo** problema — uma linha por apartamento por dia não representa dois
fatos no mesmo dia. Com a trilha, os dois somem juntos. **Duas dívidas, uma migration.**

### (B) Afrouxar o bicondicional

Trocar por implicação simples: `outcome = 'declined' → origin not null`, sem a volta. Uma tarefa
`done` passa a poder carregar `decline_origin` como resíduo histórico.

**Custo:** migration de uma linha. **Descartada:** preserva a origem e perde a **hora** (o
`completed_at` é sobrescrito pela vistoria) e, pior, torna a coluna ambígua — `decline_origin`
numa tarefa `done` passa a significar "foi dispensada antes" ou "erro de dado", e ninguém
consegue distinguir. Troca um defeito que grita por um que sussurra.

### (C) Mais de uma tarefa por apartamento por dia

Derrubar o unique `(housekeeping_day_id, room_id)`. É a opção (ii) do D12.

**Custo:** mexe em tudo que faz `on conflict` naquela chave (abertura do dia, desbloqueio), nas
contagens do fechamento, na fila da tela e no `readTask` da suíte. **Descartada por ora:**
representa a realidade com fidelidade, mas conflata "item de trabalho" com "evento" — e é
exatamente a distinção que a (A) mantém separada, com precedente já validado no projeto.

### (D) A RPC recusa a transição

`ROOMS_TRANSITION_TASK_DECLINED`, 422, mensagem própria.

**Custo:** a recusa é **na tarefa, não na aresta** — ela olha o desfecho `declined`, não o
caminho. Refazer o ciclo (`inspected → cleaning → clean → inspected`) volta a bater na mesma
recusa, então o apartamento fica fora de venda até alguém editar a tarefa por fora. Não é
"trabalho a mais": é bloqueio.

**Mas não é este o argumento que decide.** Mesmo que houvesse contorno operacional, a escolha
continuaria sendo a da §2: entre perder o registro de um fato que tem outro domicílio e perder o
único registro de outro, não há escolha. **A assimetria é a razão; o custo operacional é só o
agravante.** Escrito assim de propósito — se a decisão se apoiasse no custo, derrubar o custo
derrubaria junto uma decisão que está certa por outro motivo.

---

## 4. A saída temporária — o que fazer **esta semana**

Seus três critérios: não derrubar com `23514`, não perder dado, não fingir que foi resolvido.

**Proposta: o bloco (a) PULA a tarefa quando o desfecho for `declined` (e `cancelled`), em vez
de sobrescrevê-la.** A transição de estado acontece normalmente; o apartamento chega a
`inspected` e volta a ser vendável; a tarefa continua `declined`, com origem, nota e hora
intactas.

Por que esta e não a (D), com o argumento verificável da §2: **a arrumação tem segundo
domicílio, a dispensa não tem.** Ao escolher qual dos dois fatos fica sem registro na linha da
tarefa, o que se perde é o que já está gravado em `room_status_history` — `dirty → cleaning →
clean → inspected`, com hora, autor e organização. Nada some do sistema.

Isso **inverte** o argumento escrito na 091 ("uma tarefa `declined` que chegue aqui vira `done`,
e está certo"). Aquele raciocínio estava certo sobre o desfecho e **não sabia** que a dispensa
não tinha outro domicílio. O comentário novo precisa dizer isso, com a data, para ninguém
"consertar" de volta.

**O que ela NÃO resolve, e precisa ficar escrito no lugar onde dói:** o dia fecha com uma tarefa
`declined` num apartamento que **foi arrumado**. A contagem de trabalho do dia fica menor que a
realidade. Não é perda de dado — é uma pergunta que a tarefa não responde, e que só a (A)
responde.

**Onde registrar para não virar parágrafo esquecido:**
- comentário no bloco (a) da RPC, no ponto exato;
- `LIMITE CONHECIDO` no rodapé da migration, ao lado do D12 — são o mesmo limite;
- teste E2E que prove os dois lados: o apartamento chega a `inspected` **e** a tarefa continua
  `declined` com a origem intacta. É o teste que trava a volta da sobrescrita.

**Custo:** uma migration de RPC (sem schema), assinatura inalterada, sem janela de deploy.

---

## 5. O que eu preciso de você

1. **(A) como destino** — confirma? Se sim, ela vira fatia própria, com o D12 junto.
2. **A temporária: pular ou recusar?** Recomendo pular, pela assimetria da §2. Se preferir
   recusar, é uma linha diferente no mesmo lugar — mas o quarto fica fora de venda.
3. **`cancelled` entra junto?** É a mesma causa e o sintoma é pior (silencioso). Recomendo sim,
   e no mesmo comentário.

Escrevo a migration depois da sua resposta, e **não aplico**.
