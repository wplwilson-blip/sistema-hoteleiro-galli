# 71.0 — Plano: destravar, antes da tela

Status: **implementado.** Branch `feat/destravar-vistoria-e-dispensa`, **sem migration**.
`tsc` limpo, ESLint limpo, unitários 214/214, suíte de apartamentos **46/46** (44 + 2).
Primeira das quatro fatias do [71](71-plano-tela-da-governanta.md). **Não é tela.**

Duas mudanças pequenas, as duas em área sensível: **uma aresta da matriz de transição** e **um gate
de permissão**. Entram sozinhas, e antes da tela, porque é o diff que mais importa revisar e o que
mais facilmente se esconde no meio de um componente.

**Sem migration.** Nenhuma coluna, nenhum enum, nenhuma assinatura de RPC, nenhuma concessão nova.
Se aparecer migration nesta fatia, ela está errada.

---

## 1. Os dois achados

Nenhum dos dois é defeito de tela, e nenhum dos dois foi introduzido agora. **Os dois estavam lá e
só ficaram alcançáveis quando o levantamento com o Wilson descreveu a operação real.**

**(a) A governanta não consegue reprovar na vistoria sem mentir ou sem punir.** De `clean` só saem
`inspected` ([576](../../src/components/base-cadastros/rooms-utils.ts#L576)) e `dirty`
([595](../../src/components/base-cadastros/rooms-utils.ts#L595)). A fila de vistoria é de
apartamentos em `clean`, e é ali que ela reprova.

**(b) A governanta recebe 403 ao registrar a dispensa avisada pela recepção.** O gate por origem
exige `rooms.occupancy` para `front_desk` ([99](../../src/app/api/base/rooms/tasks/%5Bid%5D/route.ts#L99)),
e `LIDER_GOVERNANCA` não a tem — por decisão explícita da D5 do 78.

---

## 2. D1 — A aresta `clean → cleaning`

### O erro de especificação, registrado

O requisito era *"reprovar volta para `cleaning`, não `dirty`"*, e a implementação do `5da3d44`
entregou `inspected → cleaning`. **É outro caso.** O requisito não dizia **de onde** ela reprova, e
a leitura natural — reprovar o que já foi vistoriado — é a que foi escrita.

A operação é a outra: a fila de vistoria é de apartamentos em `clean`; ela olha o quarto, falta
toalha, e reprova **antes** de liberar. O `inspected → cleaning` continua certo e continua útil (ela
liberou e depois viu o problema), mas não é o caminho que a fila usa.

### Por que as duas saídas de hoje são ruins

**`clean → dirty`.** Existe, e é a que importa: `dirty` é **refazer do zero**. O comentário da
própria matriz já tinha escrito o mecanismo, para o outro caso:

> *"ter só o segundo obrigava a tratar toda reprovação como serviço inteiro — e o custo de reprovar
> ficava tão alto que a saída barata era não reprovar."*

O efeito é o que interessa e é de incentivo, não de ergonomia: **a governanta aprova o que não devia
porque reprovar custa uma arrumação inteira.** Um sistema que torna a coisa certa cara ensina a
coisa errada — e ensina calado, porque nada no dado registra "aprovei para não punir a camareira".

**`clean → inspected → cleaning`.** Funciona, e falsifica histórico. Grava em
`room_status_history` uma vistoria aprovada que não aconteceu, com hora e autor. E abre uma janela
real: entre as duas chamadas o apartamento é `vacant + inspected`, que o `isRoomSellable`
([372](../../src/components/base-cadastros/rooms-utils.ts#L372)) considera **vendável**. Registrar
uma aprovação inexistente para poder reprovar é o oposto do que a vistoria significa.

### A mudança

```
{ from: "clean", to: "cleaning", permission: ROOM_PERMISSIONS.inspect }
```

Uma linha em `HOUSEKEEPING_RULES`
([rooms-utils.ts:573](../../src/components/base-cadastros/rooms-utils.ts#L573)).

**Nenhuma migration — conferido no banco, e confirmado pela suíte.** Você pediu para eu parar e
avisar se houvesse migration. **Não há**, por três fatos verificados:

1. A allowlist de arestas vive **só** em `canTransition`
   ([rooms-utils.ts:573](../../src/components/base-cadastros/rooms-utils.ts#L573)).
2. A RPC valida **forma** apenas para `occupancy` (as duas formas da D1 do 78, em
   [094:149-200](../../supabase/migrations/094_task_outcome_not_overwritten.sql#L149)); para
   `housekeeping` ela confere concorrência (`v_current is distinct from v_from`) e aplica.
3. O único CHECK que toca transição — `room_status_history_dimension_values_check`
   ([089:199](../../supabase/migrations/089_room_state_three_dimensions.sql#L199)) — valida que o
   **valor pertence à dimensão**, nunca qual aresta é válida. `previous_status = 'clean'` e
   `new_status = 'cleaning'` já estão no conjunto permitido desde a 089.

A prova final é de execução, não de leitura: o E2E 71.0.1 grava a transição **no Supabase de
staging** e lê a linha de histórico de volta. Se houvesse constraint, ele teria falhado.

**`rooms.inspect`, e não `rooms.housekeeping`.** Reprovar é ato de quem vistoria. Com `housekeeping`
a aresta viraria um segundo "desfazer" e colidiria com o `clean → dirty` que já existe para isso —
duas arestas para o mesmo gesto, com significados diferentes, é como se ensina a escolher a errada.

### O achado que apareceu ao escrever o teste

**Havia um teste afirmando exatamente o contrário da aresta nova**, e ele não estava no
levantamento — apareceu quando fui escrever o caso novo:

```
// Voltam para `dirty`, NUNCA para `cleaning`: reabrir uma limpeza que nao aconteceu
// seria inventar um fato.
expect(canTransition(GOVERNANTA, "housekeeping", "clean", "cleaning").allowed).toBe(false);
```

**O argumento dele está certo e continua válido** — só que é sobre **outro ato**. Ele protege o
*desfazer*: quem clicou "Limpo" por engano não pode mandar o apartamento para `cleaning`, porque
isso inventaria uma limpeza que não aconteceu. Para essa pessoa o destino continua sendo `dirty`.

A asserção usava `GOVERNANTA`, que tem limpeza **e** vistoria — ou seja, **afirmava duas coisas de
uma vez** e só uma delas era a que ela queria proteger.

**Ela foi estreitada, não apagada:** passou a usar `[ROOM_PERMISSIONS.housekeeping]`. O que ela
protege continua intacto e agora está dito com precisão. **É a permissão que separa os dois atos
sobre a mesma aresta** — e é por isso que a D1 escolheu `rooms.inspect`: sem essa separação, a
aresta nova teria mesmo derrubado a regra antiga.

Registrado porque apagar a asserção teria sido o caminho fácil, e teria removido uma proteção real
sem ninguém notar.

### O que a aresta nova NÃO muda

- **A tarefa do dia não é tocada.** O bloco (d) da RPC só age ao chegar em `clean`; o bloco (a), ao
  chegar em `inspected`. `clean → cleaning` não passa por nenhum dos dois: a tarefa continua
  `pending`, sem tipo, e **está certo** — o trabalho não acabou. O bicondicional da D2.1 do 75
  continua valendo sem exceção.
- **A contagem do dia não infla.** Reprovar não produz desfecho; o apartamento volta para a fila.
- **`isRoomSellable` não muda.** `cleaning` nunca foi vendável.
- **A trava de lote não muda.** `maxRoomsPerTransition` só limita `inspected`. Reprovar em lote fica
  **permitido** pela matriz — e a tela não o oferece (D3 do 71), porque reprovar carrega a mesma
  afirmação individual que aprovar. A trava certa para isso é de tela, não de rota: um lote de
  reprovação é um fato coletivo improvável, e fechá-lo na rota exigiria estender
  `maxRoomsPerTransition` sem caso de uso real. **Registrado como decisão consciente, não omissão.**

---

## 3. D2 — O gate da dispensa `front_desk`

### Como registrar o achado (correção de enquadramento)

**Não é defeito da D6 do 78.** A D6 mudou o gate para ser **por origem**, e a decisão está certa: a
origem não pode ser rótulo que qualquer um preenche, porque ela existe para responder *"o aviso da
recepção está funcionando?"* (D3 do 75).

O que aconteceu é outra coisa: **a D6 foi desenhada para um mundo com dois atores, e a decisão de
ordem do Wilson — `71` antes do `79` — deixou só um.** O custo não é da decisão de ordem estar
errada; é o custo de qualquer decisão de ordem, e **ele aparece agora porque o levantamento foi
feito**. Sem o levantamento, a governanta descobriria o 403 no primeiro dia de uso.

É a segunda vez que esta rota produz achado, e a ironia é real: a D6 nasceu de uma correção de
leitura que o próprio 78 registrou como lição de método — *"conferir a mesma linha não é conferência
independente"*. Desta vez o caminho foi percorrido inteiro, e o que apareceu foi a premissa.

### O fato que muda a análise

Reli o gate inteiro. O argumento que o sustenta está escrito no comentário, em uma frase:

> *"Uma recepcionista não registra 'descoberto na porta': ela não esteve na porta."*

**Está certo. E a recíproca, que o comentário assume, é falsa hoje — em produção.**

A governanta **também não esteve na porta** quando registra `housekeeper`. Quem esteve foi a
camareira, que contou para ela. A [D6 do 75](75-plano-dia-da-governanca.md) diz isso com todas as
letras ao justificar por que não criava permissão nova: *"hoje ela avisa e a governanta lança"*. A
camareira não tem sistema — é a premissa da linha de trabalho inteira.

Ou seja: **o gate nunca protegeu quem presenciou o fato.** Ele protege **de qual setor veio a
informação** — e é exatamente isso que `decline_origin` diz. A permissão está sendo usada para
garantir um atributo que o campo já declara, e o atributo que ela de fato garante (presença física)
já não vale para a origem que ela libera.

Isso reposiciona a pergunta. Não é *"quanto podemos afrouxar até a tela funcionar?"*. É:

> **O que, exatamente, alguém pode afirmar falsamente depois da mudança — e isso já era possível
> antes?**

### As saídas, com custo

**(a) `LIDER_GOVERNANCA` ganha `rooms.occupancy`.**
Resolve, e desfaz a D4 do 78 inteira: ela passa a poder fazer check-in e check-out. *"Cada setor
escreve numa dimensão só"* era a fronteira que o plano 70 existiu para proteger, e três camadas a
sustentam. Derrubar uma decisão para contornar outra, pelo preço de uma dispensa. **Descartada.**

**(b) Código novo `BASE:rooms.decline.front_desk`.**
Granularidade que não separa pessoas, só linhas de tabela — o *dead grant* que a
[D6 do 75](75-plano-dia-da-governanca.md) recusou pelo nome, e que este projeto já pagou uma vez
(`DEPARTMENT_MANAGER`/`approvals.decide`). Migration, matriz, e um código a manter para sempre.
**Descartada.**

**(c) Ela registra tudo como `housekeeper` até o 79 chegar.**
A saída honesta que você ofereceu, e ela é **pior do que parece**. Não é "perda de informação": é
**informação falsa**, e que engana na direção ruim. A contagem de `front_desk` vai a **zero**, e
zero lê-se como *"a recepção nunca avisa"* — que é precisamente a conclusão oposta à verdade, na
pergunta que o campo foi criado para responder. E o dado **persiste depois do 79**: qualquer série
histórica que cruze a fronteira vai mostrar uma inversão brusca que não aconteceu na operação.

**É a mesma família do `occupancy_status` congelado que a §1 da 093 descreve:** dado que **parece
plausível** e está errado. A §1 do 78 nomeou isso como *"a pior forma de um dado estar errado"* — e
esta linha de trabalho já a encontrou duas vezes antes (a ocupação congelada e o
`has_formal_evidence` com default `true`, AC-03). Seria a terceira. **Descartada — e é a pior das
cinco.**

**(d) O gate de `front_desk` aceita `rooms.occupancy` OU `rooms.housekeeping`.** ← **recomendada**

**(e) Valor novo de origem: `front_desk_relayed`.** ← a terceira saída, e ela é real

Três valores, três fatos distintos, **nenhuma ambiguidade**:

| Origem | Significa | Exige |
|---|---|---|
| `front_desk` | a recepção registrou o próprio aviso | `rooms.occupancy` |
| `front_desk_relayed` | a governança transcreveu o aviso da recepção | `rooms.housekeeping` |
| `housekeeper` | descoberto na porta | `rooms.housekeeping` |

Cada valor é gateado por uma permissão que o ator **realmente tem**, ninguém afirma o papel do
outro, e o gate volta a ser sobre presença — que é o que ele tentava ser.

**Custo, e é ele que a derruba:** migration (`alter type ... add value`), e **valor de enum não se
remove**. `front_desk_relayed` fica no schema para sempre — inclusive depois do 79, quando a
distinção perde a urgência. Some-se: a rota, a tela, os rótulos, os testes e os relatórios passam a
tratar três casos onde a pergunta de negócio tem dois.

**E o que ela compra não é a pergunta que o campo existe para responder.** *"O aviso da recepção
está funcionando?"* se responde contando `front_desk` — e a resposta é **a mesma** com ou sem o
relay, porque o aviso aconteceu nos dois casos. A (e) resolve uma ambiguidade sobre **quem digitou**,
que o `updated_by` já registra, ao preço de um valor permanente no enum.

Fica registrada como a saída **mais precisa**, e recomendo a (d) mesmo assim — porque precisão que
custa schema permanente para responder uma pergunta que ninguém faz é dívida, não rigor. **Se o 79
demorar mais do que o previsto, ou se em seis meses a distinção virar pergunta real, a (e) continua
disponível e aditiva.**

### Por que a (d) não reabre a auto-declaração

Sua preocupação é a certa, e merece resposta direta em vez de concessão. **O que fica possível
depois da mudança, e o que não fica:**

| Afirmação | Hoje | Depois da (d) |
|---|---|---|
| `RECEPCAO` declara `housekeeper` ("estive na porta") | bloqueado | **continua bloqueado** |
| Governança declara `housekeeper` sem ter estado na porta | **já é possível, e acontece todo dia** | igual |
| Governança declara `front_desk` ("a recepção avisou") | bloqueado — **e é o 403** | permitido |
| `RECEPCAO` declara `front_desk` (aviso próprio) | permitido | igual |

**A formulação que fecha, e que está escrita no comentário da rota** — porque é **argumento
permanente, não concessão temporária**, e ninguém deve "fechar de volta" quando o 79 chegar:

> **Informação viaja da recepção para a governança por desenho.**
> **Presença física não viaja.**

**A única linha que muda é a terceira**, e ela não é uma afirmação sobre onde a governanta esteve: é
ela transcrevendo de onde a informação veio. É o mesmo ato que ela já pratica na linha dois — com a
diferença de que a linha dois nunca foi barrada.

**O que continua fechado é o que precisava ficar fechado:** a afirmação de presença física no lugar
de outro setor. Essa é a que ninguém pode fazer pelos outros, e ela permanece intacta nos dois
sentidos que importam.

**E o que garante a leitura depois:** o par `(decline_origin, updated_by)` é auto-descritivo.
`front_desk` lançada por `RECEPCAO` é a recepção registrando o próprio aviso; `front_desk` lançada
por `LIDER_GOVERNANCA` é a governança transcrevendo. A informação que a (e) compraria com um valor
de enum **já está na linha**, em duas colunas que sempre estiveram lá.

**A honestidade da ressalva:** o `updated_by` guarda a pessoa, não o perfil dela **na época**. Se
alguém mudar de perfil, a leitura histórica fica ambígua. É pequeno — são três ocupantes numa
função — e é o preço exato que separa a (d) da (e). Fica escrito aqui para não ser descoberto como
surpresa.

### A mudança

Em [tasks/[id]/route.ts:99](../../src/app/api/base/rooms/tasks/%5Bid%5D/route.ts#L99), o gate
deixa de ser uma permissão e passa a ser um conjunto:

```
front_desk  → rooms.occupancy OU rooms.housekeeping
housekeeper → rooms.housekeeping
```

Com o comentário **reescrito no ponto** — não acrescentado ao lado. O comentário atual afirma a
premissa que este plano derruba (*"uma recepcionista não registra 'descoberto na porta'"*, como se a
recíproca valesse), e deixá-lo lá faria o próximo leitor "consertar" a assimetria de volta. O texto
novo diz: a assimetria é deliberada, informação viaja da recepção para a governança por desenho,
presença física não viaja, e a (e) é a saída se a distinção virar pergunta.

**Nada mais muda.** A matriz de concessões continua idêntica — `LIDER_GOVERNANCA` **fora** de
`rooms.occupancy` —, e isso é o que separa a (d) da (a). Há teste para isso (§4.4).

---

## 4. Testes — o que foi escrito e o resultado

**Unitários** (`tests/unit/room-state-three-dimensions.spec.ts`, runner puro) — **214/214 verdes**:

| Caso | O que prova |
| --- | --- |
| **71.0.1** | `clean → cleaning` aceito com `rooms.inspect`; **negado** com só `rooms.housekeeping` e sem permissão. As duas arestas de reprovação coexistem; o desfazer continua existindo |
| **71.0.2** | A allowlist não trouxe vizinha de carona: `dirty → inspected`, `dirty → clean`, `inspected → clean`, `cleaning → cleaning` e `clean → clean` seguem negados. Reprovar **não carrega efeito** em outra dimensão e **não exige observação** |
| **71.0.3** | Reprovar em lote fica **permitido** pela rota (decisão consciente), e a trava de `inspected` continua em 1 pelos **dois** caminhos |
| **6** (existente) | **Estreitado, não apagado** — ver o achado da §2 |
| **78.6** (existente) | **`ROOM_PERMISSION_PROFILE_GRANTS` inalterada.** Ganhou comentário dizendo que agora também é ele que **quebra se alguém "resolver" o 403 pela matriz** em vez do gate |

**E2E** (`tests/e2e/rooms-transitions.e2e.spec.ts`, usuário real, sem service role, contra staging)
— **suíte de apartamentos 46/46** (as 44 anteriores intactas + 2):

| Caso | O que prova |
| --- | --- |
| **78.10/71.0** (reescrito) | `RECEPCAO` → `housekeeper`: **403** (o sentido que continua fechado). `RECEPCAO` → `front_desk`: **200** (sem regressão para o ator do 79). `LIDER_GOVERNANCA` → `front_desk`: **200** — era o 403 de ontem |
| **71.0.1** | `clean → cleaning` aceito, e o `room_status_history` **não contém `inspected`**. É o caso que quebra se alguém reintroduzir "aprova e depois reprova" |
| **71.0.2** | Depois de reprovar, a tarefa continua `pending`, `service_type` **nulo**, `completed_at` nulo |

**Duas notas de execução, porque as duas foram correções minhas durante a escrita:**

- O 78.10 precisou de um `resetTaskToPending` no meio. A rota recusa dispensar tarefa que já tem
  desfecho (422), então provar os dois atores na mesma tarefa sem o reset **mediria a trava errada
  e passaria por acidente**.
- O 71.0.2 pulou na primeira rodada. Causa: o 71.0.1 restaura o apartamento **passando por
  `inspected`**, o que fecha a tarefa do dia — e o alvo do 71.0.2 era o mesmo quarto. Corrigido
  escolhendo alvo com tarefa **pendente**, varrendo a lista. Registrado porque o sintoma era um
  `skip` silencioso: o caso não falhou, **simplesmente não rodou**.

Como nas fatias anteriores: **alvo compatível escolhido no estado encontrado**, nunca fabricado, e
cada caso desfaz o próprio rastro.

---

## 5. O que NÃO entra

- **Tela.** Nenhum componente, nenhuma página. É a 71.A.
- **Migration.** Nem para a aresta (a matriz vive no TS), nem para o gate (só a rota muda).
- **`front_desk_relayed`** — saída (e), registrada e não construída.
- **Rota de edição de `service_type`** — D12 do 71, vai com a (A) do plano 80.
- **Trava de lote para reprovação** — §2, decisão consciente: a tela não oferece, a rota não impede.
- **Qualquer mudança em `ROOM_PERMISSION_PROFILE_GRANTS`.**

---

## 6. Critério de pronto — resultado

- [x] `npx tsc --noEmit` **limpo**.
- [x] `npm run lint` — **sem warnings nem erros**.
- [x] `npm run test:unit` — **214 passed**.
- [x] Suíte de apartamentos — **46 passed** (44 + 2), placar separado da geral.
- [x] Comentário do gate **reescrito no ponto**, com a assimetria, a formulação que fecha, a
      ressalva do `updated_by`, a (e) registrada e o aviso de não resolver pela matriz.
- [x] Comentário da matriz registrando o erro de especificação e que as **duas** arestas existem
      para casos diferentes.
- [x] **Diff de duas mudanças de comportamento**, mais testes. Nenhum componente, nenhuma página,
      **nenhuma migration**.

---

## 7. Branch

`feat/destravar-vistoria-e-dispensa`. O plano vai em `docs/tela-da-governanta`, junto com o 71.

---

## 8. O que eu preciso de você

1. **A saída (d)** para o gate — com o argumento da §3: o gate nunca protegeu presença, porque a
   governanta já registra `housekeeper` sem ter estado na porta. Confirma?
2. **A (e) fica registrada e não construída?** É a mais precisa e custa um valor de enum permanente.
   Recomendo registrar. Se preferir construí-la agora, a fatia ganha migration e deixa de ser
   rota + matriz.
3. **A (c) eu descartei como a pior**, e não como "aceitável com perda" — porque a contagem de
   `front_desk` em zero afirma o oposto da verdade na única pergunta que o campo responde. Se a sua
   leitura for outra, é o ponto a discutir antes de eu escrever a linha.
