# 78 — Plano: a Recepção escreve a ocupação (check-in e check-out)

Status: **plano para revisão. Nenhum código escrito.**
Continua o [70](70-plano-estado-apartamento-tres-dimensoes.md), o [75](75-plano-dia-da-governanca.md)
e o [77](77-plano-fechamento-do-dia.md), todos aplicados e validados nos dois bancos.

Área sensível: **migration**. O Wilson aplica no Supabase; ninguém mais.

**Ordem da linha de trabalho:** `78` (modelo e rotas da Recepção) → `79` (a tela do parque) →
`71` (a tela da governanta). O levantamento com o Wilson mudou a ordem: a Recepção vem **antes**
da tela da governanta porque a governança depende dela — a fila de arrumação nasce dos
check-outs, e enquanto ninguém marca check-out a fila depende de alguém declarar de cabeça o que
aconteceu.

**Este plano não desenha tela.** Entrega o modelo, a RPC e as rotas que o 79 vai consumir.

---

## 1. O que falta, e o que está mentindo

A ocupação é a única das três dimensões sem escritor. Isso não é um vazio inerte — produz três
efeitos hoje, em produção:

**(a) A coluna está congelada, não vazia.** A 089 fez backfill de `occupancy_status` a partir do
`room_status` legado ([089:125](../../supabase/migrations/089_room_state_three_dimensions.sql#L125)).
Ela não nasceu neutra: nasceu com o retrato de um dia, e desde então nenhuma linha de código a
alterou. Todo dia que passa ela se afasta mais da realidade, e **parece plausível** — que é a
pior forma de um dado estar errado.

**(b) Uma função existente responde sempre a mesma coisa.** `suggestedServiceType`
([rooms-utils.ts:774](../../src/components/base-cadastros/rooms-utils.ts#L774)) decide entre
`checkout` e `stayover` lendo a ocupação. Ela está correta e é inútil: lê uma coluna congelada.
Esta fatia não a altera — faz ela **passar a dizer a verdade**.

**(c) A fila da governanta depende de conversa.** Sem check-out registrado, saber que o 112
desocupou às 10h só acontece se alguém contar para alguém.

E há um achado de segurança, tratado na D6: a rota de dispensa está gateada por `rooms.view`, e o
perfil de Recepção nasce com `rooms.view`.

---

## 2. Decisões

### D1 — A trava não cai: ela **estreita**. É o argumento central da fatia

A [D1 do plano 70](70-plano-estado-apartamento-tres-dimensoes.md) decidiu que
`occupancy_status` nasceria **sem escritor**, e pôs a trava `ROOMS_TRANSITION_NO_WRITER` na RPC de
propósito, para que uma chamada direta não contornasse a decisão pela porta dos fundos. A mesma
D1 previu que o escritor apareceria. **O dia chegou** — e esta fatia reverte aquela decisão
conscientemente, pelo argumento do Wilson: quem sabe quem entrou e quem saiu é a recepção, e é
assim que vai funcionar quando houver PMS. Deixar a governanta marcando ocupação seria construir
um caminho que morre depois.

Mas **derrubar a trava é a coisa errada**. O enunciado da fatia era "derrubar"; a decisão é
estreitar. A dimensão `occupancy` passa a aceitar **exatamente duas formas**, e nada mais:

| Forma | `from` → `to` | `housekeeping_effect` |
|---|---|---|
| Check-in | `vacant` → `occupied` | ausente (proibido) |
| Check-out | `occupied` → `vacant` | **obrigatório e igual a `dirty`** |

Qualquer outra chamada de ocupação continua morrendo dentro da RPC, com erro próprio.

**O resultado é mais forte que a trava de hoje, não mais fraco.** Hoje `NO_WRITER` bloqueia por
**ausência de escritor** — é uma trava sobre um vazio, e some no dia em que o vazio for
preenchido. Amanhã a RPC passa a **exigir** que "de ocupado para livre não existe" seja verdade
no banco: um check-out sem o efeito `dirty` é rejeitado pelo Postgres, não pela rota. A frase do
Wilson — *"de ocupado para livre não existe, tem que ir para sujo"* — vira **invariante**, não
convenção da camada de aplicação.

A diferença prática: hoje, se alguém escrever uma segunda rota que chame a RPC direto, a trava
some junto com a decisão que ela protegia. Depois desta fatia, essa segunda rota **não consegue**
produzir um apartamento vago e vistoriado que ninguém arrumou.

### D2 — O check-out escreve as duas dimensões pelo `housekeeping_effect` que já existe

É o ponto onde a fatia pode dar errado. O check-out precisa de `occupancy → vacant` **e**
`housekeeping → dirty` **atomicamente**: um sem o outro deixa o apartamento vago e vistoriado —
ou seja, **vendável com o quarto sujo**.

A RPC de hoje já faz exatamente isso para outra dimensão. O bloqueio escreve `blocking` e derruba
`housekeeping` no mesmo `update`, grava **duas** linhas de histórico (a segunda com
`is_automatic = true`) e aplica o efeito na tarefa do dia — tudo por um campo `housekeeping_effect`
no item do lote. O check-out tem a mesma forma; falta abrir o ramo `occupancy`.

Alternativas consideradas, com custo:

**(b) RPC nova dedicada — `rooms_apply_front_desk_event`.** Fronteira mais limpa: a Recepção
nunca veria "transição arbitrária", só dois eventos nomeados. **Descartada** porque duplicaria o
lock com ordem estável por `room_id`, a releitura sob lock, as duas travas de `occurred_at`, a
gravação do histórico e o efeito na tarefa do dia. É **segunda fonte de verdade para as mesmas
regras**, e diverge na primeira manutenção — o custo que este projeto já pagou três vezes.

**(c) Duas chamadas em sequência pela rota.** Zero custo de banco, e **não é atômico**. É
literalmente o modo de falha que a fatia existe para evitar. Descartada sem contrapartida.

**(d) `p_dimension` escalar → por item.** Resolveria o caso geral. Descartada: é mudança de tipo
em RPC exposta, e a [D8 do plano 75](75-plano-dia-da-governanca.md) já custou um PGRST203 — o
PostgREST resolve sobrecarga por **nome de argumento**, então uma chamada passaria a casar com
duas assinaturas e não executaria nenhuma.

**Adotada: (a).** Menor diff, reuso integral do maquinário, e **a assinatura não muda** — logo
não há PGRST203 e não há janela de convivência a administrar. Se algum dia a saída exigir
assinatura nova, a forma de conviver é a mesma da D8 do 75: o dado novo entra **no item jsonb**,
nunca como argumento novo.

### D3 — Os três lugares do `no_writer` mudam **juntos**, na mesma fatia

O `no_writer` não está num lugar. Está em três — quatro, contando o tipo que os une — e cada um
faz uma coisa diferente:

| Onde | O que faz | Se ficar para trás |
|---|---|---|
| [`092:462`](../../supabase/migrations/092_housekeeping_day_close.sql#L462) — a RPC | Levanta `ROOMS_TRANSITION_NO_WRITER` | **500**: a rota manda, o banco recusa |
| [`rooms-utils.ts:648`](../../src/components/base-cadastros/rooms-utils.ts#L648) — `canTransition` | Nega antes de chegar ao banco | **Botão morto**: a tela nega sozinha |
| [`transitions/route.ts:73`](../../src/app/api/base/rooms/transitions/route.ts#L73) — `denialStatusMap` | Mapeia `no_writer` → 422 | Erro sem código HTTP definido |
| [`rooms-utils.ts:526`](../../src/components/base-cadastros/rooms-utils.ts#L526) — `RoomTransitionDenialCode` | O tipo que amarra os dois acima | Nada quebra: o tipo **permanece** |

Os três mudam na mesma entrega. O `denialStatusMap` **não perde a chave**: `no_writer` deixa de
ser alcançável por `occupancy` e continua existindo como código de negação — remover a chave e
descobrir o buraco em produção é caro, e mantê-la custa uma linha.

### D4 — A Recepção **não vistoria**. É a fronteira que o plano 70 inteiro existiu para proteger

A Recepção marca ocupado, marca sujo (pelo check-out) e bloqueia. **Nunca `inspected`.**

Isso é protegido em três camadas, e não por disciplina:

1. A forma de check-out aceita `housekeeping_effect = 'dirty'` e mais nada — `inspected` não é
   um valor aceito naquele ponto.
2. O perfil `RECEPCAO` não recebe `BASE:rooms.inspect` (D5).
3. As arestas que chegam em `inspected` continuam exigindo `rooms.inspect` no `canTransition`.

"Livre", no vocabulário do Desbravador, **é o nosso `inspected`** — a vendabilidade já é o
`isRoomSellable` da 089 (vago **e** vistoriado **e** sem bloqueio **e** cadastro ativo). Quando a
governanta marca vistoriado, o apartamento fica livre. **Nenhum passo a mais, nenhuma coluna nova,
nenhum status "livre".** O check-out não devolve o apartamento para venda — devolve para a
governança.

### D5 — Perfil `RECEPCAO` próprio, e não reaproveitamento

Mesmo raciocínio da [D5 do plano 70](70-plano-estado-apartamento-tres-dimensoes.md), que criou
`LIDER_GOVERNANCA` — e que continua sendo a razão certa. O motivo **não** é vazamento lateral
(gente de outros setores já enxerga apartamentos desde a 088). É o inverso: para **receber** o
que precisa, a recepcionista teria que **ser** outra coisa e ganhar o resto junto —
`DEPARTMENT_MANAGER` traz alçada de compra até R$200 e `BASE:rooms.manage`; `SUPERVISOR` traz
`HR:documents.manage`, `HR:documents.verify` e `HR:employees.view`. Alçada financeira e documento
de colaborador para quem precisa dizer que o hóspede chegou.

Concessões — conjunto mínimo:

| Código | Recebe? | Por quê |
|---|---|---|
| `BASE:rooms.view` | **sim** | Vê o parque inteiro; é como ela trabalha |
| `BASE:rooms.occupancy` (**novo**) | **sim** | Check-in e check-out. Código novo, criado nesta fatia |
| `BASE:rooms.block` | **sim** | Bloqueio comercial é decisão de recepção |
| `BASE:rooms.housekeeping` | **não** | O ciclo de limpeza é da governança |
| `BASE:rooms.inspect` | **não** | D4. É a fronteira |
| `BASE:rooms.manage` | **não** | Cadastro de apartamento não é operação de recepção |

`BASE:rooms.occupancy` é código novo e entra em `ROOM_PERMISSIONS`, em `BASE_PERMISSIONS` e na
matriz `ROOM_PERMISSION_PROFILE_GRANTS` — os três, pelo mesmo motivo que o comentário do
[`permissions.ts:36`](../../src/lib/auth/permissions.ts#L36) registra: código divergente não
quebra o build, vira **403 silencioso em produção**.

Quem mais recebe `rooms.occupancy`: `SUPER_ADMIN` e `UNIT_DIRECTOR`, seguindo a matriz existente.
`LIDER_GOVERNANCA` **não** recebe — a governanta não marca ocupação, que é a metade recíproca da
D4.

**Confirmado pelo Wilson:** a recepcionista de plantão é sempre quem faz o check-out, inclusive de
madrugada. Não há porteiro nem gerente fazendo isso. `RECEPCAO` é perfil só.

### D6 — O gate da dispensa é **achado de segurança**, não ajuste de rota

`PATCH /api/base/rooms/tasks/[id]` é gateada por `ROOM_PERMISSIONS.view`
([route.ts:31](../../src/app/api/base/rooms/tasks/[id]/route.ts#L31)). Hoje isso **dá o resultado
certo por acidente**: ninguém com `rooms.view` além da governança e da liderança existe, então na
prática só quem deve dispensar dispensa.

O perfil `RECEPCAO` nasce com `rooms.view` — e ganharia dispensa **de graça**, no mesmo dia, sem
que ninguém tivesse decidido isso. É o mesmo formato do incidente
`DEPARTMENT_MANAGER`/`approvals.decide` que o comentário do `permissions.ts` cita: **a coisa
funciona, então ninguém olha**.

Neste caso o resultado desejado até coincide — a Recepção **deve** poder lançar dispensa com
origem `front_desk`. Mas coincidência não é decisão, e a próxima permissão a entrar pode não
coincidir. O gate passa a ser **explícito**: a rota exige `rooms.view` **e** a permissão da
operação, e a origem declarada é conferida contra quem está chamando — `front_desk` para quem tem
`rooms.occupancy`, `housekeeper` para quem tem `rooms.housekeeping`. Uma recepcionista não
registra "descoberto na porta"; ela não esteve na porta.

Com teste que **quebra se alguém alargar o gate de novo** (§7.6).

### D7 — Fronteira negativa: `reason` **não recebe dado de hóspede**. É LGPD, não estética

O check-in escreve "ocupado" sem registrar **quem**. Não existe entidade de hóspede nem de
estadia, e esta fatia **não inventa uma** — reservas vai preencher esse vazio de verdade.

O risco não é abstrato: `room_status_history.reason` é campo de texto livre e está logo ali. O
caminho mais curto para "de quem é o 112" é digitar o nome do hóspede na observação do check-in.
Isso é **dado pessoal em histórico operacional sem base legal declarada e sem prazo de descarte**
— numa tabela que não tem política de retenção, num sistema cuja dívida de LGPD (log de acesso a
dado sensível e retenção) está nas prioridades do projeto desde o começo. Um campo livre não é
lugar de dado pessoal justamente porque ninguém sabe que ele está lá para apagar depois.

A fronteira, escrita para quem constrói a próxima tela: **o campo de observação do check-in não
pede, não sugere e não aceita identificação de hóspede.** Nome, documento e telefone do hóspede
não entram nesta fatia por nenhuma porta. Quando reservas existir, o vínculo será por chave para
a entidade certa — não por texto copiado.

### D8 — Lote **permitido** nas duas formas, e isso não contradiz a trava da vistoria

A [D4 do plano 75](75-plano-dia-da-governanca.md) proibiu lote ao chegar em `inspected`, com o
argumento de que "um botão que libera vinte é um botão que libera vinte sem olhar" — a transição
carrega a afirmação **"eu olhei este quarto"**.

Check-in e check-out não carregam afirmação nenhuma sobre inspeção: carregam um **fato externo**.
Uma excursão que desocupa vinte apartamentos às 9h é um fato coletivo verdadeiro, e obrigar vinte
chamadas transformaria um lançamento correto em vinte oportunidades de erro. Lote permitido, com
a ordem estável por `room_id` que a RPC já aplica.

A assimetria é deliberada e tem regra clara: **lote é proibido quando a transição afirma um ato
individual de quem lança; permitido quando registra um fato que aconteceu no mundo.**

### D9 — Check-in em apartamento não vendável é **permitido, com observação obrigatória**

Se o 112 está `vacant + dirty` e a recepcionista faz check-in, o sistema tem duas escolhas ruins e
uma boa.

Recusar (descartada): o hóspede **está com a chave na mão**. Um sistema que recusa registrar um
fato consumado produz um apartamento marcado vago com gente dentro — pior que o problema.

Aceitar em silêncio (descartada): vender um quarto sujo vira dado invisível, e ninguém descobre
que aconteceu.

**Adotada:** a RPC aceita, e a **rota exige `reason`** quando o estado de origem não passa no
`isRoomSellable`. O fato entra, e entra com o motivo. É a mesma forma da observação obrigatória do
bloqueio comercial, pela mesma razão: exceção registrada é exceção auditável.

O check-in **não mexe na limpeza** — o hóspede acabou de entrar num quarto que estava arrumado, e
zerar `housekeeping` no check-in diria que está sujo quando não está. Um apartamento
`occupied + inspected` não é vendável (o `isRoomSellable` exige `vacant`), então não há buraco.

### D10 — O que a §14 do plano 75 fecha aqui, e o que **não** fecha

A [§14 do 75](75-plano-dia-da-governanca.md) declarou uma lacuna descoberta e escolheu
conviver com ela: a alternativa **(e)** da D2 — previsão de saída informada pela Recepção — era a
única que resolvia a necessidade das 8h, e dependia de uma fatia que não existia. Esta é a fatia.

**Fecha:** a fila deixa de depender de declaração. Hoje a governanta descobre quem saiu porque
alguém contou; depois desta fatia o apartamento aparece `dirty` no instante do check-out, com hora
real, e a fila se monta sozinha conforme o dia acontece. O `suggestedServiceType` passa a ler uma
ocupação viva, e o tipo de arrumação nasce certo em vez de ser corrigido no fecho.

**Não fecha, e digo com todas as letras:** a previsão das 8h **continua aberta**. Saber quem *vai*
sair hoje às 8h da manhã exige data de saída prevista, que exige registro de estadia, que é
exatamente a entidade que a D7 se recusa a inventar. O que esta fatia entrega é a **verdade em
tempo real**, não a previsão — a governanta às 8h ainda não sabe quem sai; ela passa a saber **no
momento em que sai**, sem depender de ninguém.

É um ganho real e é menos do que a alternativa (e) prometia. Registrar isso como "§14 resolvida"
sem a ressalva seria a mesma otimização de linguagem que o plano 75 evitou.

### D11 — O que muda quando houver reservas, e o que esta fatia não pode impedir

Não construir para reservas; não construir nada que impeça. Concretamente:

- **A RPC não ganha argumento novo.** Quando o check-out vier do PMS, o chamador muda; a forma
  não. Essa é a razão de a saída (a) valer mais que a (d).
- **`occupancy_status` continua com dois valores.** A tentação futura é acrescentar `reserved`
  como terceiro — e seria a conflação que a 089 desfez, de volta. Reserva é um fato sobre um
  **período**, não sobre o estado presente do apartamento; mora na entidade de reserva, com datas.
- **Nenhuma tabela de estadia agora.** Uma tabela nascida aqui, com as colunas que o check-in
  precisa e nenhuma das que reservas precisa, seria migrada no primeiro dia da fatia seguinte.
- **`reason` fica limpo (D7).** É o que permite a reserva ligar por chave depois, em vez de
  alguém tentar parsear nome de hóspede de texto livre.

---

## 3. Onde a decisão pode dar errado — e o que a protege

O modo de falha desta fatia tem nome: **apartamento vago e vistoriado que ninguém arrumou.** Ele
aparece se, e só se, a ocupação for para `vacant` sem que a limpeza vá para `dirty`.

| Caminho | Protegido por |
|---|---|
| Rota faz duas chamadas separadas e a segunda falha | A rota faz **uma** chamada; o efeito é do mesmo `update` |
| Chamada direta à RPC com `occupied → vacant` sem efeito | Recusada: efeito obrigatório na forma de check-out (D1) |
| Chamada direta com efeito diferente de `dirty` | Recusada: só `dirty` é aceito (D1) |
| `occupancy → vacant` a partir de `vacant` | Recusada: só as duas formas existem (D1) |
| Transação parcial | `security definer` numa função só; ou grava tudo ou levanta e desfaz |

---

## 4. Rotas

**`POST /api/base/rooms/occupancy`** — check-in e check-out. Rota nova, e **não** um ramo novo em
`/transitions`: a rota de transição é da governança e da manutenção, com o vocabulário delas.
Corpo: lista de `{ room_id, event, occurred_at?, reason? }`, com `event ∈ { check_in, check_out }`.
A rota traduz o evento nas duas formas da D1 — a Recepção nunca digita `from`/`to`/`effect`.

Erros com código próprio, no formato que o 77 estabeleceu (`detail` dizendo **qual** apartamento):

| Situação | HTTP |
|---|---|
| Sem `rooms.occupancy` | 403 |
| Check-in em apartamento já ocupado (ou check-out em vago) | 409, com o apartamento no `detail` |
| Check-in em não vendável **sem** `reason` | 422 |
| `occurred_at` futura, ou anterior à última transição do dia | 422 |

**`PATCH /api/base/rooms/tasks/[id]`** — gate explícito (D6). Sem mudança de contrato para a
governança; a origem passa a ser conferida contra quem chama.

**`GET /api/base/rooms`** — já devolve as três dimensões. Sem mudança.

---

## 5. Migration 093

**Não aplicar. O Wilson aplica.**

1. **`create or replace public.rooms_apply_transition`** — corpo **extraído da 092 por script**
   (não da 091: a 092 redefiniu a função em
   [`092:428`](../../supabase/migrations/092_housekeeping_day_close.sql#L428), e extrair da versão
   errada regrediria o fechamento do dia em silêncio). Vai **completa**: `create or replace`
   reescreve o corpo inteiro, e versionar só o trecho alterado deixa o arquivo mentindo sobre o
   que está no banco. **Assinatura idêntica** — sem PGRST203.
   - Sai o `raise ROOMS_TRANSITION_NO_WRITER` incondicional.
   - Entra a validação de forma da D1, com erros próprios:
     `ROOMS_TRANSITION_OCCUPANCY_INVALID_FORM` e `ROOMS_TRANSITION_CHECKOUT_REQUIRES_DIRTY`,
     ambos `errcode = '22023'` — nunca `40001`, pela razão do [plano 74](74-plano-errcode-stale-rpc-transicao.md).
   - O ramo `occupancy` entra no `case` da releitura sob lock e no `update`, aplicando o efeito
     pelo caminho que o `blocking` já usa (linha de histórico separada, `is_automatic = true`).
2. **Perfil `RECEPCAO`** em `access_profiles`, `is_system_default = true`, no formato de
   `on conflict do update` da 089.
3. **Permissão `BASE:rooms.occupancy`** no catálogo e concessões da D5.
4. **Sem alteração de schema**: nenhuma coluna, nenhum tipo, nenhum índice novo. `occupancy_status`
   já existe desde a 089.

**Validação pelo Wilson, antes de qualquer código de tela** — cada item com resultado esperado
explícito:

1. Check-out por RPC direta: o apartamento fica `vacant + dirty` e há **duas** linhas em
   `room_status_history`, a segunda com `is_automatic = true`.
2. `occupied → vacant` sem efeito: **erro** `ROOMS_TRANSITION_CHECKOUT_REQUIRES_DIRTY`, SQLSTATE
   `22023`, resposta em menos de 1s (o critério de "não pendura" do plano 74).
3. `occupied → vacant` com efeito `inspected`: **erro**.
4. `vacant → vacant` e `occupied → occupied`: **erro**.
5. Check-in: `occupancy` muda, `housekeeping` **não** muda, uma linha de histórico só.
6. Check-out às 2h da manhã com o dia ainda fechado: o estado muda, nenhuma tarefa é tocada, e ao
   abrir o dia às 8h o apartamento **tem** tarefa `pending` (a abertura materializa todos os
   ativos sem bloqueio — [091:312](../../supabase/migrations/091_housekeeping_day.sql#L312)).
7. Perfil `RECEPCAO` existe, tem exatamente as quatro permissões da D5, e **não** tem
   `rooms.inspect`.

**Rollback**: `create or replace` de volta à versão da 092 (transcrita no rodapé do arquivo, como
nas anteriores) e `delete` do perfil e das concessões. Sem perda de dado: a fatia não cria coluna.

---

## 6. O que NÃO entra

- **A tela.** É o 79.
- **A tela da governanta.** É o 71.
- **Entidade de hóspede ou estadia.** D7.
- **Previsão de saída.** D10 — depende de reservas.
- **`reserved` como terceiro valor de ocupação.** D11.
- **Histórico de hospedagem, folio, tarifa, PMS.** Nada disso é pré-requisito para dizer que o
  apartamento está ocupado.

---

## 7. Testes

**Puros** (`tests/unit`, sem banco — espelho das regras em `rooms-utils.ts`):

1. `canTransition` aceita as duas formas da D1 com `rooms.occupancy` e **nega as duas** sem ela.
2. `canTransition` nega `vacant → vacant`, `occupied → occupied` e check-out sem efeito `dirty`.
3. `canTransition` nega qualquer forma de ocupação que tente `inspected` como efeito (D4).
4. `isRoomSellable` **inalterado**: check-out produz `vacant + dirty`, que não é vendável;
   vendável continua exigindo `inspected`.
5. `suggestedServiceType` com ocupação viva: `occupied` → `stayover`, `vacant` → `checkout`.
6. `ROOM_PERMISSION_PROFILE_GRANTS` — allowlist **fechada** de `rooms.occupancy`: exatamente
   `SUPER_ADMIN`, `UNIT_DIRECTOR`, `RECEPCAO`; **`LIDER_GOVERNANCA` negado explicitamente**, e
   `RECEPCAO` **negado** para `rooms.inspect` e `rooms.housekeeping`.

**E2E** (`tests/e2e/rooms-transitions.e2e.spec.ts`, usuário real, sem service role):

7. **O caso que a fatia existe para impedir.** Check-out e, na sequência, leitura do apartamento:
   `vacant + dirty`, **não vendável**. Depois a governança leva até `inspected` e ele fica
   vendável — o caminho inteiro, com dois atores.
8. **A atomicidade, pela porta dos fundos.** `POST /transitions` com `dimension: "occupancy"`,
   `occupied → vacant`, sem efeito: **422** e o apartamento **inalterado** nas duas dimensões. É o
   teste que prova que a trava estreitada é mais forte que a `NO_WRITER`.
9. Recepção tentando `clean → inspected`: **403**. A fronteira da D4, pelo ator errado.
10. **O gate da dispensa (D6), com dois atores.** Recepção lança dispensa com origem `front_desk`
    e é aceita; Recepção tentando origem `housekeeper` é **recusada**. Este teste quebra se alguém
    alargar o gate de novo — que é a razão de ele existir.
11. Check-in em apartamento `dirty` sem `reason`: **422**; com `reason`: aceito, e o motivo está
    no histórico.
12. Lote de check-out (D8): três apartamentos numa chamada, os três `vacant + dirty`, três pares
    de linhas de histórico.

Como nas fatias anteriores: **alvo compatível escolhido no estado encontrado**, nunca fabricado, e
sem resíduo. A suíte não reescreve estado alheio para montar cenário.

---

## 8. Discordância registrada — o print de referência

O Desbravador lista "Limpeza", "Livre", "Manutenção" e "Ocupada" na **mesma** lista de Situação.
É exatamente a conflação que a 089 desfez: um campo único não consegue dizer "ocupado **e** sujo",
e é essa a informação que a governanta usa às 9h da manhã.

Nosso modelo tem três dimensões e mostra as três ao mesmo tempo. O print vale como referência de
**densidade e de filtro** — os filtros por checkbox são bons e melhores que o filtro atual, e o 79
os herda em **três grupos separados** (Ocupação, Limpeza, Bloqueio) em vez de uma lista só.
A conflação, não.

Registrado aqui porque a decisão é deste plano; a execução é do 79.

---

## 9. Critério de pronto

- Migration 093 escrita, **aplicada pelo Wilson** em staging e produção, e os sete itens da §5
  validados por ele com resultado observado — não deduzido do código.
- Os **três** lugares do `no_writer` alterados na mesma entrega (D3).
- `tsc --noEmit` limpo, ESLint limpo, unitários verdes.
- E2E verde nos doze casos, com a suíte de apartamentos e a geral no placar separado.
- Nenhuma tela. Se aparecer tela nesta fatia, ela está errada.

---

## 10. Branch

`feat/recepcao-check-in-out`. O plano vai em `feat/plano-recepcao`, para revisão antes do código.
