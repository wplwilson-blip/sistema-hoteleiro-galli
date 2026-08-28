# 70 — Plano: estado do apartamento em três dimensões

Status: **plano para revisão. Nenhum código escrito. Tem decisões que dependem do Wilson (§4).**
Bloqueia a tela de Governança com escrita de status — que estava em construção e foi
interrompida para isto.
Continua o [68](68-plano-uh-fase2-mapa.md) (mapa read-only) e o
[`claude/MODELO_UH_DESBRAVADOR.md`](../../claude/MODELO_UH_DESBRAVADOR.md).

Área sensível: **migration**. Plano antes de código, por `NAO_ALTERAR.md`. O Wilson aplica
no Supabase; ninguém mais.

---

## 1. Por que agora, e por que não daqui a um mês

O `public.room_status` (migration [001:41](../../supabase/migrations/001_extensions_and_enums.sql))
é um enum de **uma dimensão** com sete valores:
`available, occupied, dirty, cleaning, maintenance, blocked, inactive`.

Enquanto as telas só **liam** esse campo, a limitação era teórica. No instante em que a tela
de Governança **escreve**, ela vira operação — e o custo de desfazer passa a incluir migração
de dados com histórico já gravado em `room_status_history`.

Hoje o custo é praticamente zero: não há hóspede, não há reserva, e o inventário de 115
apartamentos ainda está em seed. **Este é o momento mais barato que vai existir.** Não é
perfeccionismo; é a diferença entre uma migration aditiva agora e uma migration de dados com
histórico sujo depois.

---

## 2. O argumento que fecha a questão está no seu próprio material

`RH-35B_MATRIZ_PAPEIS_PERMISSOES_MENU.md`, Matriz de Governança:

| Ação | Líder Governança | Camareira / Serviços gerais | Gerência Operacional |
| --- | --- | --- | --- |
| Registrar limpeza/checklist | Sim | **Sim** | Consulta |
| Validar conclusão | Sim | **Não** | Sim |

A regra já está decidida: **a camareira registra a limpeza; ela não valida a conclusão.**
Só a liderança valida.

Agora tente executar isso com o enum de hoje. A camareira termina o apartamento. Ela precisa
mudar o estado para quê?

- Se muda para `available`, ela **liberou o apartamento para venda sozinha** — exatamente a
  "validação de conclusão" que a matriz proíbe.
- Se não muda nada, o apartamento fica em `cleaning` para sempre e a liderança não tem como
  saber que a fila dela acabou.

Não existe terceira saída. **Falta um estado.** A regra de negócio já foi escrita; o modelo
de dados nunca a sustentou. E o próprio banco já sabia disso — o comentário de
`room_status_history` ([011:127](../../supabase/migrations/011_shared_foundation_tables.sql))
diz que a regra de *"somente Governanta ou Gerente Operacional pode retornar a UH para
Disponível"* seria aplicada depois. A intenção está registrada; o estado que a sustenta, não.

O segundo problema é o inverso: **um apartamento ocupado também fica sujo.** Às 9h da manhã
é o estado de todos eles — é a fila de arrumação de rotina, a maior do dia. Com uma coluna
só, a camareira marca `cleaning` e depois `limpo`, e o apartamento **deixa de constar como
ocupado**. Enquanto não há reservas isso é invisível. No dia em que houver, é o caminho
direto para vender apartamento com hóspede dentro.

---

## 3. O modelo: três dimensões independentes

Um apartamento real tem três estados **ao mesmo tempo**, e nenhum deles substitui o outro.

### 3.1 Ocupação — `occupancy_status`
`vacant` | `occupied`

Quem é dono: a fatia de reservas/recepção, que **ainda não existe**.
Quem escreve hoje: **ninguém**.

### 3.2 Limpeza — `housekeeping_status`
`dirty` → `cleaning` → `clean` → `inspected`

Este é o ciclo que a Governança opera, e é onde entra o estado que falta hoje:

| Estado | Rótulo na tela | Significa | Quem registra |
| --- | --- | --- | --- |
| `dirty` | Sujo | Precisa de arrumação | Governanta / Gerência Operacional |
| `cleaning` | Em limpeza | Camareira em serviço no apartamento | Governanta / Gerência Operacional |
| `clean` | Limpo | Camareira avisou que terminou — **ainda não liberado** | Governanta / Gerência Operacional |
| `inspected` | **Vistoriado** | Vistoria feita — **liberado para venda** | Governanta / Gerência Operacional |

Rótulo é "Vistoriado", não "Inspecionado" — vocabulário do Wilson, e o
`MODELO_UH_DESBRAVADOR.md` (regra 1) já estabeleceu que o que o usuário lê manda sobre o
nome técnico. No banco fica `inspected`, como o resto dos enums.

A fronteira `clean` → `inspected` é a linha da matriz do RH-35B. É por ela que Governança
existe como setor separado da camareira: alguém confere antes do hóspede entrar.

### 3.3 Bloqueio — `blocking_status`
`none` | `maintenance` | `commercial`

`maintenance` é chamado técnico; `commercial` é bloqueio de diretoria (reforma, uso interno,
hóspede de cortesia). Separados porque quem levanta cada um é setor diferente, e porque a
regra 4 do `MODELO_UH_DESBRAVADOR.md` já manda: *"Bloqueado continua no inventário."* Some da
venda, não some do patrimônio.

### 3.4 A regra que amarra as três

**Um apartamento está vendável quando:** `occupancy = vacant` **e**
`housekeeping = inspected` **e** `blocking = none`.

Uma função pura, num lugar só, e nunca replicada em tela. É a substituta honesta do que hoje
`available` finge ser.

---

## 4. Decisões que dependem de você

### D1 — Coluna de ocupação — **DECIDIDO (Wilson): entra agora, sem UI**

- **(a) Entra, sem UI e sem escritor.** Fica com default `vacant`, documentada como
  propriedade da futura fatia de reservas, e **não aparece em tela nenhuma**.
- **(b) Não entra.** Fica para a fatia de reservas criar.

**Recomendo (a).** O motivo não é antecipação — é contenção. Sem a coluna de ocupação, a
primeira pessoa que precisar registrar "está ocupado" vai enfiar isso em
`housekeeping_status`, e a conflação que estamos removendo volta pela porta dos fundos em
três meses. A coluna existir é o que torna esse atalho impossível.

E ela **não pode aparecer no mapa** enquanto não tiver escritor: um mapa mostrando 115
apartamentos vagos quando 60 estão ocupados é pior que não mostrar ocupação nenhuma. Campo no
banco, ausente na tela. (Sim, isso é um campo órfão — a mesma crítica que fiz ao
`overbooking_limit`. A diferença é que este tem dono declarado e data; o outro não tinha.)

### D2 — `room_status` antigo — **DECIDIDO (Wilson): para de ser lido, fica no banco uma release**

- **(a) Fica e vira a dimensão de ocupação.** Migration menor, mas os valores `dirty`,
  `cleaning` e `available` continuam existindo no enum sem significado. Ambiguidade
  permanente.
- **(b) Para de ser lido e escrito pelo app, mas continua no banco por uma release.**
  Removido numa migration posterior, depois de confirmado em produção.
- **(c) Removido junto.**

**Recomendo (b).** É reversível. Se algo der errado em staging, o dado antigo ainda está lá
intacto. Custa uma migration extra depois, e vale.

Ponto relacionado que precisa ficar dito: `public.rooms` tem **duas** colunas de situação
hoje — `status` (`record_status`, para ativo/inativo do cadastro) e `room_status` (com
`inactive` também dentro). Essa duplicação já existe e já confunde. Encerrar o `room_status`
resolve a ambiguidade de brinde: apartamento desativado passa a ser assunto exclusivo de
`status`.

### D3 — Transições por perfil — **DECIDIDO (Wilson)**

**A camareira não tem login.** Quem opera o sistema é a governanta. Isso substitui a leitura
literal do RH-35B (*"Registrar limpeza/checklist — Camareira: Sim"*): a camareira registra a
limpeza **no mundo real**, e a governanta lança no sistema.

| Transição | Permissão exigida |
| --- | --- |
| `dirty` → `cleaning` → `clean` | `BASE:rooms.housekeeping` (**novo**) |
| `clean` → `inspected`, `cleaning` → `inspected` (atalho §4.1) | `BASE:rooms.inspect` (**novo**) |
| `inspected` → `dirty` (reprovar na vistoria) | `BASE:rooms.inspect` |
| Bloquear / desbloquear (manutenção e comercial) | `BASE:rooms.block` (**já existe**, migration 088) |

⚠️ **A permissão é por CÓDIGO, não por nome de perfil** — ver D5. O mapa código → perfil
depende de uma decisão pendente.

#### Por que NÃO há trava por pessoa aqui — e isso é decisão, não esquecimento

Em Compras o projeto travou por pessoa: quem solicita não aprova, quem seleciona não aprova,
sem exceção nem para super admin. Aqui **não**, e o motivo precisa ficar registrado para
ninguém "consertar" isto depois achando que passou batido.

A segregação existe, só que fora do sistema: quem limpa é a camareira, quem vistoria é a
governanta — duas pessoas, sempre. A governanta não aprova o próprio trabalho; ela registra
dois fatos que aconteceram no corredor. Travar por pessoa exigiria uma segunda governanta
logada em cada turno, o que não existe num hotel de 115 apartamentos. Seria uma trava que
para a operação sem impedir fraude nenhuma.

Se um dia a camareira ganhar login, a trava por pessoa passa a fazer sentido e **deve** ser
reavaliada. Até lá, é gate de perfil.

### D5 — Quais perfis recebem os códigos novos — **BLOQUEANTE, precisa de você**

Achado na revisão do prompt de execução, antes de qualquer código: **`LIDER_GOVERNANCA` e
`OPERACIONAL_GOVERNANCA` não existem no banco.** São matriz de projeto no `RH-35B`, nunca
semeados. Os perfis reais estão listados no cabeçalho da migration
[088](../../supabase/migrations/088_auth_grants_rooms.sql): `SUPER_ADMIN`, `NETWORK_MANAGER`,
`UNIT_DIRECTOR`, `DEPARTMENT_MANAGER`, `SUPERVISOR`, `FINANCE`, `AUDIT`, `EMPLOYEE`,
`EXTERNAL_TECHNICIAN`, mais os `HR_*` (045) e `COMPRAS` (064).

Conceder a um perfil inexistente produz **dead grant** — permissão criada, ninguém recebe,
ninguém percebe. É literalmente o incidente `DEPARTMENT_MANAGER` / `approvals.decide` que já
custou uma correção neste projeto.

**(a) Usar os perfis que existem.** Governanta → `DEPARTMENT_MANAGER` (é a gerente do
departamento de Governança) ou `SUPERVISOR`; gerência operacional → `UNIT_DIRECTOR`. Zero
perfil novo, migration pequena.
Fraqueza honesta: `DEPARTMENT_MANAGER` é genérico. O gerente de Compras tem o mesmo perfil e
receberia `rooms.inspect` junto. `profile_permissions` não sabe filtrar por departamento.

**(b) Criar `LIDER_GOVERNANCA` e `OPERACIONAL_GOVERNANCA` na 089**, alinhando o banco ao
`RH-35B`.
Fraqueza honesta: o `RH-35B` tem ~15 perfis setoriais. Criar dois agora deixa o modelo meio
migrado, e cada fatia futura vai criar mais dois. Isso pede uma fatia própria de perfis
setoriais, não um puxadinho aqui.

**Recomendo (a) para esta fatia**, com a fraqueza registrada, **e uma fatia própria depois**
para os perfis setoriais do `RH-35B` como um todo. Motivo: esta fatia é sobre estado de
apartamento; virar também a fatia que redesenha o modelo de perfis do sistema é dois planos
num diff só, e nenhum dos dois sai bem revisado.

Mas é decisão sua — é organograma do hotel, não arquitetura.

### 4.1 O estado `clean` não pode ser obrigatório

Consequência direta da decisão acima. Se a governanta tiver que marcar "Limpo" em quarenta
apartamentos e depois "Vistoriado" nos mesmos quarenta, ela pula o primeiro — e passa a
existir um estado que o sistema pede e ninguém preenche, que é pior que não ter o estado.

Então: `clean` fica **disponível**, não obrigatório. A tela oferece as duas rotas —
`cleaning → clean` (a camareira avisou que terminou, a governanta ainda não subiu) e
`cleaning → inspected` numa ação só. O estado continua no modelo, pronto para quando houver
login de camareira, sem virar ritual vazio agora.

### 4.2 Encerramento de manutenção — **DECIDIDO (Wilson)**

Manutenção **pode** encerrar o próprio bloqueio, com **observação obrigatória** de fim de
manutenção. O apartamento volta para `housekeeping = dirty`, nunca para `inspected`. A
liberação para venda continua exclusiva da governanta ou da gerência operacional.

A observação é campo obrigatório de verdade: sem texto, a transição não grava. Mesmo padrão
da justificativa no cancelamento tardio de rescisão no RH — anexada, nunca sobrescrevendo.

Razão operacional: quem mexeu no apartamento sujou o apartamento. Furadeira, peça trocada,
poeira. Voltar direto para a venda é entregar ao hóspede um apartamento que ninguém olhou
depois da obra.

### 4.3 Ação em lote é requisito, não conforto

A governanta opera 115 apartamentos por dia. Se cada transição exigir abrir o apartamento e
clicar, no terceiro dia ela volta para o papel e o sistema morre — e um sistema abandonado
de governança é pior que nenhum, porque a recepção passa a confiar num dado que ninguém
alimenta.

O padrão real da operação é: **o normal não se digita, só a exceção.** Selecionar um andar ou
uma ala inteira, marcar `inspected` de uma vez, e registrar individualmente só os dois ou
três que reprovaram ou têm ocorrência.

Consequência para a tela: **seleção múltipla e ação em lote fazem parte desta fatia**, não da
próxima. Muda o desenho da tela, não só o modelo de dados.

### D4 — Camareira responsável — **RETIRADO, vira o plano 71**

A proposta original (escolher a camareira no momento da transição para `cleaning`) está
**descartada**. Motivo: a governanta decide a distribuição **uma vez**, de manhã, ao dividir
os andares. Pedir de novo, apartamento por apartamento, seria 115 confirmações diárias de uma
decisão já tomada — ela deixaria em branco, e a coluna viraria campo órfão.

**Decisão do Wilson:** as camareiras **não recebem dispositivo** — celular ou computador para
toda a equipe é custo que o hotel não absorve. O instrumento delas é uma **folha impressa**.

Isso reposiciona o problema. A folha não é relatório derivado do sistema: ela é a
**materialização da escala de arrumação do dia**. O sistema guarda a escala, imprime a folha,
e preenche o responsável **sozinho** quando a governanta lança a vistoria — derivando da
escala daquela data. Zero clique a mais, e "quem arrumou o 305 no dia 12" passa a ter
resposta.

Escala + impressão é **fatia própria — plano 71.** Nesta fatia entra só o que a fatia 71 vai
precisar encontrar pronto: `housekeeping_employee_id uuid` **nullable** em
`room_status_history` (não em `rooms` — a pergunta é histórica, e uma coluna em `rooms` é
sobrescrita no dia seguinte). Fica nulo até o plano 71 existir.

Notas operacionais já levantadas, para o plano 71 não nascer torto:
- A folha sai **na ordem do corredor** — andar, ala, número. `groupRoomsByFloorAndBlock`
  (`rooms-utils.ts`) já produz essa ordem; a impressão reaproveita.
- A folha precisa de espaço para a camareira anotar à mão: ocorrência, achados e perdidos,
  horário. A governanta transcreve **só a exceção**, nunca a folha inteira.

---

## 5. Migration

Número: **089**. Aditiva, idempotente, sem `drop` de nada.

1. Três enums novos: `public.occupancy_status`, `public.housekeeping_status`,
   `public.blocking_status`.
2. Três colunas em `public.rooms`, todas `not null` com default — nenhum tratamento de nulo
   na aplicação.
3. **Backfill** a partir do `room_status` atual, na mesma migration:

| `room_status` | → occupancy | → housekeeping | → blocking |
| --- | --- | --- | --- |
| `available` | `vacant` | `inspected` | `none` |
| `occupied` | `occupied` | `dirty` | `none` |
| `dirty` | `vacant` | `dirty` | `none` |
| `cleaning` | `vacant` | `cleaning` | `none` |
| `maintenance` | `vacant` | `dirty` | `maintenance` |
| `blocked` | `vacant` | `dirty` | `commercial` |
| `inactive` | `vacant` | `dirty` | `none` |

Duas escolhas do mapa que não são óbvias e precisam ficar registradas: `available` vira
`inspected` (é o que o valor significava na prática — liberado para venda), e tudo que estava
bloqueado ou inativo cai em `dirty`, nunca em `inspected`. **Ninguém volta à venda por
migration.** Um apartamento que estava em manutenção precisa de arrumação e inspeção de
gente antes de receber hóspede — não de um `UPDATE`.

4. `housekeeping_employee_id uuid references public.employees(id) on delete set null`
   **nullable, só em `room_status_history`** — não em `rooms` (D4). Fica nulo até o plano 71.
5. Observação obrigatória no encerramento de manutenção: a coluna `reason` já existe em
   `room_status_history` ([011:105](../../supabase/migrations/011_shared_foundation_tables.sql)).
   Não cria coluna nova — a obrigatoriedade é validada na rota, e o `CHECK` de não-vazio
   entra na migration para a regra viver também no banco.
6. `room_status_history`: `previous_status` e `new_status` são hoje do tipo
   `public.room_status`. Passam a `text`, mais uma coluna `dimension` (`occupancy`,
   `housekeeping`, `blocking`). Uma linha por transição de dimensão. A tabela está vazia —
   a mudança de tipo é gratuita agora e cara depois.
7. **Dois códigos de permissão novos**, no padrão da 088 (`module_code='BASE'`, `code`
   gerado): `rooms.housekeeping` e `rooms.inspect`. Concessão aos perfis conforme D5.
   `on conflict do nothing` nos grants, como a 088 — reexecutar não restaura concessão que
   alguém revogou de propósito.
8. `room_status` **não é alterado nem removido** (decisão D2b).

Índices: `(unit_id, housekeeping_status)` e `(unit_id, blocking_status)` — são os dois
filtros da fila de arrumação e do painel de manutenção.

---

## 6. Aplicação

| Arquivo | Mudança |
| --- | --- |
| `src/components/base-cadastros/rooms-utils.ts` | Rótulos e tons por dimensão; `describeRoomState()` e `isRoomSellable()` como funções puras. **Tipar os `Record` pela união** (hoje são `Record<string, ...>`, e por isso status novo não quebra o build — cai no `?? value` e aparece em inglês na tela). |
| `src/components/base-cadastros/rooms-map.tsx` | Cor pela combinação, não por campo único. |
| `src/app/api/base/rooms/route.ts` | `GET` devolve as três colunas. |
| `src/app/api/base/rooms/transitions/route.ts` | **Rota nova.** `POST` de transição — ver §6.2. |
| Tela de Governança | O que você estava construindo, agora sobre três campos — **com seleção múltipla e ação em lote** (§4.3). |

### 6.2 A rota de transição: uma só, nativamente em lote

Caminho: **`POST /api/base/rooms/transitions`**.

Corpo: `{ roomIds: string[], dimension, toStatus, reason? }`. Um apartamento é um array de um.

Duas escolhas com motivo:

**`POST`, não `PATCH`.** Não é atualização de campo: é transição com regra de perfil, validação
de origem e gravação de histórico. `POST` numa coleção de transições é honesto sobre isso.

**Uma rota que já nasce em lote, em vez de uma individual e outra em lote.** A ação em lote é
requisito (§4.3), e duas rotas significariam duas cópias da validação de perfil e da regra de
transição — que é exatamente onde elas divergem com o tempo. Uma só, sempre recebendo lista.

Transação: ou grava todas as transições do lote e todas as linhas de histórico, ou nenhuma.
Lote parcialmente aplicado deixa a governanta sem saber o que gravou.

### 6.1 Dispositivo — a governanta opera de tablet

**Decisão do Wilson:** a governanta terá celular ou tablet (as camareiras, não — §D4).

Duas consequências, e uma delas é um achado que precisa de fatia própria:

**(a) O casco do app não funciona abaixo de 1024px.** `app-sidebar.tsx:310` é
`hidden ... lg:flex` e **não existe hambúrguer, drawer ou substituto** — verificado, não há
nenhum `lg:hidden` em `src/components/layout/`. Tablet em paisagem funciona; tablet em
retrato e celular ficam sem navegação. **Fatia própria (plano 72), fora deste plano** —
misturar navegação com modelo de dados torna o diff irrevisável. Não bloqueia o
desenvolvimento (testa-se no desktop); bloqueia a entrega do tablet à governanta.

**(b) A tela em si já está pronta para toque.** A grade do mapa é `grid-cols-3` no celular
subindo a 10 no desktop (`rooms-map.tsx:103`), e o plano 68 já resolveu o `title` que não
aparece em toque, pondo o detalhe num rodapé visível. Mantém-se.

**(c) Sem UI otimista nesta tela.** Corredor e escada têm ponto morto de wi-fi. Se o `PATCH`
falhar e a tela já tiver pintado `Vistoriado`, a governanta segue achando que gravou e a
recepção vende um apartamento que ninguém conferiu. **O apartamento só muda de cor depois da
confirmação do servidor.** Erro de rede mostra falha explícita e mantém o estado anterior.
Mais lento, e é o certo.

**Regra de ouro da fatia:** nenhuma tela lê `housekeeping_status` cru para decidir cor,
rótulo ou vendabilidade. Tudo passa por `rooms-utils.ts`. É o que já está certo hoje para
`roomStatusLabel`/`roomStatusTone` — mantém-se o mesmo princípio, agora com três eixos.

---

## 7. Testes

1. Matriz de transição: cada par (perfil × transição) permitido e proibido, com 403 no
   proibido.
2. **Manutenção não consegue levar a `inspected`.** Encerrar o bloqueio resulta em `dirty`,
   sempre. Se um único teste desta fatia tiver que passar, é este — é o que impede
   apartamento recém-consertado de ir direto para a venda.
3. Encerrar bloqueio de manutenção **sem observação** é rejeitado (rota e `CHECK`).
4. `isRoomSellable()` só verdadeiro na combinação exata `vacant` + `inspected` + `none`.
5. Backfill: para cada um dos sete valores antigos, a tripla resultante é a da tabela §5.
6. Atalho `cleaning → inspected` permitido; `dirty → inspected` **negado** (não se vistoria o
   que ninguém arrumou).
7. `OPERACIONAL_GOVERNANCA` recebe 403 em toda transição desta fatia.

---

## 8. Critério de pronto

- Migration 089 aplicada em **staging e produção**, com `SELECT` de confirmação depois — o
  SQL Editor mostra "Success. No rows returned" tanto para DDL quanto para DML sem
  `RETURNING`, e os dois casos são visualmente idênticos.
- Contagem por dimensão batendo com a contagem por `room_status` antigo, apartamento a
  apartamento. É a prova do backfill.
- Em staging, com **líder de governança**: percorre o ciclo completo, usa o atalho
  `Em limpeza → Vistoriado`, e consegue reprovar um apartamento já vistoriado.
- Em staging, com **manutenção**: bloqueia, tenta encerrar sem observação (rejeitado),
  encerra com observação, e o apartamento aparece em `Sujo` — não em `Vistoriado`.
- Nenhum apartamento fica vendável sem alguém ter passado por `inspected` na tela.

---

## 9. O que NÃO entra

- Reserva, check-in, check-out, tarifa. Continua não sendo PMS.
- UI de ocupação (D1a: coluna sim, tela não).
- Escala de arrumação, folha impressa e camareira responsável — **plano 71** (§D4).
- Achados e perdidos, checklist de limpeza, chamado de manutenção — cada um é fatia própria.
  Esta fatia entrega **o estado**; as rotinas em cima dele vêm depois.
- Remoção do `room_status` do banco (fica para a migration seguinte, D2b).

---

## 10. Branch

`feat/estado-apartamento-tres-dimensoes`

**Fechadas:** D1, D2, D4, encerramento de manutenção, dispositivo, e a forma da rota (§6.2).
**Pendente e bloqueante: D5** — quais perfis reais recebem `rooms.housekeeping` e
`rooms.inspect`. Sem isso a migration 089 concede permissão a perfil que não existe.

Depois desta fatia:
- **Plano 71** — escala de arrumação e folha impressa.
- **Plano 72** — navegação mobile (§6.1a), antes de o tablet chegar à governanta.
