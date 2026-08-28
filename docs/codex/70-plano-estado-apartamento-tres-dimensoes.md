# 70 — Plano: estado do apartamento em três dimensões

Status: **todas as decisões fechadas. Liberado para execução.**
Revisado com a sessão de execução em 28/08/2026; quatro discordâncias dela aceitas (§11).
Continua o [68](68-plano-uh-fase2-mapa.md) e o
[`claude/MODELO_UH_DESBRAVADOR.md`](../../claude/MODELO_UH_DESBRAVADOR.md).

Área sensível: **migration**. O Wilson aplica no Supabase; ninguém mais.

---

## 1. Por que agora

`public.room_status` ([001:41](../../supabase/migrations/001_extensions_and_enums.sql)) é um
enum de **uma dimensão** com sete valores: `available, occupied, dirty, cleaning, maintenance,
blocked, inactive`.

Enquanto as telas só **liam**, a limitação era teórica. No instante em que a Governança
**escreve**, vira operação — e desfazer passa a exigir migração de dados com histórico
gravado. Hoje não há hóspede, não há reserva, o inventário está em seed e
`room_status_history` tem **zero linhas** (verificado em staging e produção, 28/08/2026).
É o momento mais barato que vai existir.

---

## 2. O furo, no seu próprio material

`RH-35B`, Matriz de Governança: *"Registrar limpeza/checklist — Camareira: **Sim**"* /
*"Validar conclusão — Camareira: **Não**"*.

A camareira termina o apartamento. Muda o estado para quê? Se põe `available`, liberou para
venda sozinha — a validação que a matriz proíbe. Se não põe nada, fica em `cleaning` para
sempre. Não há terceira saída: **falta um estado.** A regra existe; o modelo nunca a
sustentou. O próprio banco já sabia — o comentário de `room_status_history`
([011:127](../../supabase/migrations/011_shared_foundation_tables.sql)) diz que a regra de
*"somente Governanta ou Gerente Operacional pode retornar a UH para Disponível"* seria
aplicada depois.

O inverso também quebra: **apartamento ocupado também fica sujo** — às 9h é o estado de todos
eles. Com uma coluna só, marcar `cleaning` e depois `clean` faz o apartamento **deixar de
constar como ocupado**. Hoje invisível; com reservas, é vender apartamento com hóspede dentro.

---

## 3. O modelo

### 3.1 Ocupação — `occupancy_status`
`vacant` | `occupied`. Dono: a futura fatia de reservas. **Escritor hoje: ninguém.**

### 3.2 Limpeza — `housekeeping_status`

| Estado | Rótulo na tela | Significa |
| --- | --- | --- |
| `dirty` | Sujo | Precisa de arrumação |
| `cleaning` | Em limpeza | Camareira em serviço |
| `clean` | Limpo | Camareira terminou — **ainda não liberado** |
| `inspected` | **Vistoriado** | Vistoria feita — **liberado para venda** |

Rótulo é "Vistoriado", não "Inspecionado" — vocabulário do Wilson, e a regra 1 do
`MODELO_UH_DESBRAVADOR.md` já manda que o que o usuário lê vence o nome técnico. No banco fica
`inspected`.

### 3.3 Bloqueio — `blocking_status`
`none` | `maintenance` | `commercial`. Separados porque quem levanta cada um é setor
diferente. Regra 4 do `MODELO_UH_DESBRAVADOR.md`: bloqueado sai da venda, não sai do
patrimônio.

### 3.4 A regra que amarra as três
**Vendável = `vacant` + `inspected` + `none`.** Função pura, num lugar só, nunca replicada em
tela. É a substituta honesta do que `available` fingia ser.

---

## 4. Decisões — todas fechadas

### D1 — Ocupação entra agora, sem UI — **DECIDIDO**
Coluna com default `vacant`, sem escritor, **invisível em toda tela**. Não é antecipação, é
contenção: sem ela, a primeira pessoa que precisar registrar "está ocupado" enfia isso em
`housekeeping_status` e a conflação volta pela porta dos fundos. E não pode aparecer no mapa
sem escritor — mostrar 115 vagos quando 60 estão ocupados é pior que não mostrar nada.

### D2 — `room_status` antigo — **DECIDIDO**
Para de ser lido e escrito pelo app; **fica no banco** por uma release, removido numa
migration posterior. Reversível: se algo der errado em staging, o dado original está intacto.

Nota: `public.rooms` tem hoje **duas** colunas de situação — `status` (`record_status`) e
`room_status`, com `inactive` nas duas. Encerrar o `room_status` resolve a ambiguidade de
brinde: apartamento desativado passa a ser assunto exclusivo de `status`.

### D3 — Quem opera — **DECIDIDO**
**A camareira não tem login.** Quem opera é a governanta. Isso substitui a leitura literal do
`RH-35B`: a camareira registra a limpeza **no mundo real**; a governanta lança no sistema.

| Transição | Permissão exigida |
| --- | --- |
| `dirty` → `cleaning` → `clean` | `BASE:rooms.housekeeping` (**nova**) |
| `clean` → `inspected` e `cleaning` → `inspected` (§4.1) | `BASE:rooms.inspect` (**nova**) |
| `inspected` → `dirty` (reprovar na vistoria) | `BASE:rooms.inspect` |
| Bloquear / desbloquear | `BASE:rooms.block` (**já existe**, 088) |

**Não há trava por pessoa aqui — é decisão, não esquecimento.** Em Compras o projeto travou
por pessoa (quem solicita não aprova, quem seleciona não aprova, sem exceção). Aqui não,
porque a segregação existe fora do sistema: quem limpa é a camareira, quem vistoria é a
governanta — duas pessoas, sempre. Travar por pessoa exigiria uma segunda governanta logada
por turno, que não existe num hotel de 115 apartamentos: pararia a operação sem impedir
fraude nenhuma. Se um dia houver login de camareira, reavaliar.

### D5 — Perfis — **DECIDIDO: criar `LIDER_GOVERNANCA` e `LIDER_MANUTENCAO`**

`LIDER_GOVERNANCA` e `OPERACIONAL_GOVERNANCA` **não existem no banco** — são matriz de
projeto no `RH-35B`, nunca semeados. Os reais estão no cabeçalho da
[088](../../supabase/migrations/088_auth_grants_rooms.sql).

A alternativa descartada era reaproveitar perfis existentes. Ela falha, e **na direção que o
texto original deste plano não descrevia**: o problema não é o gerente de Compras enxergar
apartamentos (esse vazamento já existe e foi aceito na 088, via `rooms.block`). O problema é
que, para *receber* `inspect`, a governanta teria que **ser** um daqueles perfis:

- Como `DEPARTMENT_MANAGER` ela ganha `PURCHASES:approvals.decide.administrative` —
  **aprova compras até R$ 200** — e `BASE:rooms.manage`, que redefine o inventário.
- Como `SUPERVISOR` ela ganha `HR:documents.manage`, `HR:documents.verify` e
  `HR:employees.view` — documentos de colaborador.

Alçada financeira e acesso a RH para quem só precisa dizer que o apartamento está limpo.

Terceiro caminho considerado e rejeitado: atribuir `SUPERVISOR` e **negar** `HR:documents.*`
por override (a precedência corrigida no P0 permite). Vira manutenção por usuário — cada
governanta nova exige o mesmo conjunto de negações, e esquecer uma concede acesso a RH em
silêncio.

**"Deixa o modelo meio migrado" foi retirado como argumento.** Criar os quinze perfis
setoriais do `RH-35B` de uma vez seriam treze dead grants. O perfil nasce quando o módulo
nasce — foi o que a 088 fez com os códigos de apartamento.

Conjunto mínimo, de propósito:

| Perfil novo | Permissões |
| --- | --- |
| `LIDER_GOVERNANCA` | `BASE:rooms.view`, `BASE:rooms.block`, `BASE:rooms.housekeeping`, `BASE:rooms.inspect` |
| `LIDER_MANUTENCAO` | `BASE:rooms.view`, `BASE:rooms.block` |

Sem `rooms.manage` — coerente com o critério que a 088 já fixou (quem opera o mapa não
redefine o inventário). Sem Compras, sem RH.

Matriz completa dos códigos novos:

| Código | Perfis |
| --- | --- |
| `BASE:rooms.housekeeping` | `SUPER_ADMIN`, `UNIT_DIRECTOR`, `LIDER_GOVERNANCA` |
| `BASE:rooms.inspect` | `SUPER_ADMIN`, `UNIT_DIRECTOR`, `LIDER_GOVERNANCA` |
| `BASE:rooms.block` (existente) | + `LIDER_GOVERNANCA`, `LIDER_MANUTENCAO` |

`OPERACIONAL_GOVERNANCA` **não é criado** — camareira não tem login; seria dead grant.

### 4.1 O estado `clean` não é obrigatório
Se a governanta tiver que marcar "Limpo" em quarenta apartamentos e depois "Vistoriado" nos
mesmos quarenta, ela pula o primeiro. A tela oferece as duas rotas: `cleaning → clean` (a
camareira avisou, ela ainda não subiu) e `cleaning → inspected` numa ação só. O estado
continua no modelo, pronto para quando houver login de camareira, sem virar ritual vazio.

### 4.2 Encerramento de manutenção — **DECIDIDO**
Manutenção **pode** encerrar o próprio bloqueio, com **observação obrigatória**. O apartamento
volta para `housekeeping = dirty`, nunca para `inspected`. Sem texto, a transição não grava —
validado na rota **e** por `CHECK` no banco.

Razão operacional: quem mexeu no apartamento sujou o apartamento. Furadeira, peça trocada,
poeira. Voltar direto para a venda é entregar ao hóspede algo que ninguém olhou depois da
obra.

### 4.3 Ação em lote — **a ROTA nasce em lote; a tela é a fatia seguinte**
A governanta opera 115 apartamentos por dia. Se cada transição exigir abrir e clicar, no
terceiro dia ela volta para o papel. O padrão real é: **o normal não se digita, só a
exceção** — seleciona o andar, marca vistoriado de uma vez, registra individualmente os dois
ou três que reprovaram.

Nesta fatia entra **a rota já em lote**. A tela que a consome é o **plano 71**.

### D4 — Camareira responsável — **RETIRADO, vira o plano 72**
A proposta original (escolher a camareira na transição para `cleaning`) está descartada: seria
115 confirmações diárias de uma decisão tomada uma vez de manhã. Ela deixaria em branco, e a
coluna viraria campo órfão.

**As camareiras não recebem dispositivo** — custo que o hotel não absorve. O instrumento delas
é **folha impressa**, que não é relatório derivado: é a **materialização da escala do dia**.
O sistema guarda a escala, imprime a folha, e preenche o responsável **sozinho** ao lançar a
vistoria, derivando da escala daquela data.

Nesta fatia entra só o que a 72 precisa encontrar pronto: `housekeeping_employee_id uuid`
**nullable em `room_status_history`** — não em `rooms`, porque a pergunta é histórica e uma
coluna em `rooms` é sobrescrita no dia seguinte. Fica nulo até o plano 72.

Notas para o plano 72 não nascer torto:
- A folha sai **na ordem do corredor** — andar, ala, número. `groupRoomsByFloorAndBlock`
  (`rooms-utils.ts`) já produz essa ordem.
- Espaço para a camareira anotar à mão: ocorrência, achados e perdidos, horário. A governanta
  transcreve **só a exceção**.
- A folha cria intervalo entre o fato e o registro. Mitigar exibindo **desde quando** o
  apartamento está no estado: "Sujo há 6 horas" conta uma história que "Sujo" não conta.

---

## 5. Migration 089

Aditiva, idempotente, sem `drop`.

1. Três enums: `public.occupancy_status`, `public.housekeeping_status`,
   `public.blocking_status`.
2. Três colunas em `public.rooms`, todas `not null` com default — sem tratamento de nulo na
   aplicação.
3. **Backfill**, transcrito de `backfillRoomState()` (§6.1):

| `room_status` | occupancy | housekeeping | blocking |
| --- | --- | --- | --- |
| `available` | `vacant` | `inspected` | `none` |
| `occupied` | `occupied` | `dirty` | `none` |
| `dirty` | `vacant` | `dirty` | `none` |
| `cleaning` | `vacant` | `cleaning` | `none` |
| `maintenance` | `vacant` | `dirty` | `maintenance` |
| `blocked` | `vacant` | `dirty` | `commercial` |
| `inactive` | `vacant` | `dirty` | `none` |

Duas escolhas não óbvias: `available` vira `inspected` (é o que o valor significava —
liberado para venda), e tudo que estava bloqueado ou inativo cai em `dirty`, nunca em
`inspected`. **Ninguém volta à venda por migration.**

4. `housekeeping_employee_id uuid references public.employees(id) on delete set null`,
   **nullable, só em `room_status_history`** (D4).
5. `room_status_history`: `previous_status` e `new_status` passam de `public.room_status` para
   `text`, mais coluna `dimension` (`occupancy` | `housekeeping` | `blocking`) e um **`CHECK`
   amarrando cada `dimension` aos valores válidos daquela dimensão** — senão trocamos a
   segurança do enum por nada.
   **Verificado 28/08/2026: `select count(*)` = 0 em staging e em produção.** O `alter type`
   é gratuito, sem `using`. Se alguém reaplicar depois, reconferir — a premissa é datada.
   **RLS conferido:** as três policies (066:366-388) filtram só por `unit_id` via
   `user_has_unit_access`; nenhuma referencia as colunas de status. Trocar o tipo não toca
   política nenhuma.
6. Observação obrigatória: a coluna `reason` já existe em `room_status_history`
   ([011:105](../../supabase/migrations/011_shared_foundation_tables.sql)). Não cria coluna —
   entra `CHECK` de não-vazio quando `dimension = 'blocking'` e o destino é sair de
   `maintenance`.
7. **Dois perfis novos** em `access_profiles` (`LIDER_GOVERNANCA`, `LIDER_MANUTENCAO`) e
   **dois códigos novos** em `permissions` (`module_code='BASE'`, `action_code` =
   `rooms.housekeeping` e `rooms.inspect`), com os grants da matriz da D5.
   `on conflict do nothing` nos grants, como a 088 — reexecutar não restaura concessão que
   alguém revogou de propósito.
8. `room_status` **não é alterado nem removido** (D2).

Índices: `(unit_id, housekeeping_status)` e `(unit_id, blocking_status)` — os dois filtros da
fila de arrumação e do painel de manutenção.

---

## 6. Aplicação

| Arquivo | Mudança |
| --- | --- |
| `src/components/base-cadastros/rooms-utils.ts` | Rótulos e tons por dimensão; **funções puras** `canTransition()`, `backfillRoomState()`, `describeRoomState()`, `isRoomSellable()`. **Tipar os `Record` pela união** — hoje são `Record<string, ...>` e `ROOM_STATUS_VALUES` (`:40`) não tipa nada, então status novo não quebra o build: cai no `?? value` e aparece em inglês na tela. |
| `src/components/base-cadastros/rooms-map.tsx` | Cor pela combinação, não por campo único. |
| `src/app/api/base/rooms/route.ts` | `GET` devolve as três colunas. |
| `src/app/api/base/rooms/transitions/route.ts` | **Rota nova** — §6.2. |
| `tests/unit/` | §7. |

**Fora desta fatia:** a tela de Governança (plano 71).

### 6.1 A autorização e o backfill viram funções puras

`test:unit` roda `playwright.unit.config.ts` — runner puro, **sem banco**. Testes de rota e de
SQL não rodam ali. Então:

- `canTransition(permissions, dimension, from, to)` — decide; a rota apenas chama.
- `backfillRoomState(oldStatus)` — o mapa da §5.3; a migration transcreve o **mesmo** mapa.

Ganho: os sete testes ficam puros e de verdade. **Custo honesto, que precisa ficar escrito:**
o teste do backfill valida a tabela de referência, **não** o SQL que vai ser aplicado. A prova
do SQL é a contagem por dimensão do §8, na mão do revisor.

### 6.2 A rota de transição

**`POST /api/base/rooms/transitions`**. Corpo:
`{ roomIds: string[], dimension, toStatus, reason? }`. Um apartamento é um array de um.

**`POST`, não `PATCH`:** não é atualização de campo, é transição com regra de perfil,
validação de origem e gravação de histórico.

**Uma rota que já nasce em lote**, em vez de uma individual e outra em lote: duas seriam duas
cópias da validação de perfil e da regra de transição — exatamente onde elas divergem com o
tempo.

**Transação:** ou grava todas as transições e todas as linhas de histórico, ou nenhuma. Lote
parcialmente aplicado deixa a governanta sem saber o que gravou.

### 6.3 Dispositivo — a governanta opera de tablet

**(a) O casco do app não funciona abaixo de 1024px.** `app-sidebar.tsx:310` é
`hidden ... lg:flex` e **não existe hambúrguer nem drawer** — não há nenhum `lg:hidden` em
`src/components/layout/`. Tablet em paisagem funciona; retrato e celular ficam sem navegação.
**Fatia própria — plano 73.** Não bloqueia o desenvolvimento; bloqueia a entrega do tablet à
governanta.

**(b) A tela já está pronta para toque.** Grade `grid-cols-3` no celular subindo a 10 no
desktop (`rooms-map.tsx:103`), e o plano 68 já resolveu o `title` que não aparece em toque,
pondo o detalhe num rodapé visível.

**(c) Sem UI otimista.** Corredor e escada têm ponto morto de wi-fi. Se o `POST` falhar e a
tela já tiver pintado `Vistoriado`, a governanta segue achando que gravou e a recepção vende
um apartamento que ninguém conferiu. **Só muda de cor depois da confirmação do servidor.**
Vale para o plano 71.

**Regra de ouro:** nenhuma tela lê `housekeeping_status` cru para decidir cor, rótulo ou
vendabilidade. Tudo passa por `rooms-utils.ts`.

---

## 7. Testes — sete, todos puros

1. `canTransition`: matriz fechada de permissão × dimensão × origem → destino.
2. **Manutenção não chega a `inspected`.** Encerrar bloqueio resulta em `dirty`, sempre. Se um
   único teste desta fatia tiver que passar, é este.
3. Encerrar bloqueio de manutenção **sem observação** é rejeitado.
4. `isRoomSellable()` só verdadeiro em `vacant` + `inspected` + `none`.
5. `backfillRoomState()`: os sete valores antigos → a tripla da §5.3.
6. Atalho `cleaning → inspected` permitido; `dirty → inspected` **negado** (não se vistoria o
   que ninguém arrumou).
7. **Allowlist fechada de `rooms.inspect`:** só a lista da D5 passa; qualquer perfil fora dela
   é negado. Substitui o teste antigo "`OPERACIONAL_GOVERNANCA` recebe 403", que era vazio por
   construção — perfil inexistente passa trivialmente e continuaria passando com a permissão
   concedida a quem não devia. Este quebra se `SUPERVISOR` ganhar `inspect` por engano.

---

## 8. Critério de pronto

- `npm run test:unit` verde, com os sete acima. `npx tsc --noEmit` sem erro.
- Migration 089 aplicada em **staging e produção**, com `SELECT` de confirmação depois — o SQL
  Editor mostra "Success. No rows returned" para DDL e para DML sem `RETURNING`, visualmente
  idênticos.
- **Contagem por dimensão batendo com a contagem por `room_status` antigo**, apartamento a
  apartamento. É a prova do backfill, e é o que o teste puro não cobre.
- Conferir que `LIDER_GOVERNANCA` e `LIDER_MANUTENCAO` existem com exatamente as permissões da
  D5 — nem uma a mais.
- Via `POST /api/base/rooms/transitions`, em staging: `LIDER_GOVERNANCA` percorre o ciclo e
  usa o atalho; `SUPERVISOR` recebe 403 em `inspect`; manutenção sem observação é rejeitada e,
  com observação, o apartamento cai em `Sujo` — não em `Vistoriado`.
- Percurso na tela **não** é critério aqui: a tela é o plano 71.

---

## 9. O que NÃO entra

- Reserva, check-in, check-out, tarifa. Continua não sendo PMS.
- UI de ocupação (D1).
- **Tela de Governança — plano 71.**
- **Escala de arrumação e folha impressa — plano 72.**
- **Navegação mobile — plano 73.**
- Achados e perdidos, checklist de limpeza, chamado de manutenção — fatias próprias. Esta
  entrega **o estado**; as rotinas em cima dele vêm depois.
- Remoção do `room_status` do banco (migration seguinte, D2).

---

## 10. Branch

`feat/estado-apartamento-tres-dimensoes`

---

## 11. Discordâncias da sessão de execução — aceitas

Registradas porque mudaram o plano, e porque o mecanismo funcionou:

1. **Escopo contraditório.** O plano exigia a tela (§4.3, §6) e o prompt listava cinco
   arquivos que a excluíam. Dois planos num diff só. **Aceito:** tela vira o plano 71; §8
   deixa de exigir percurso na tela.
2. **Teste vazio por construção** (`OPERACIONAL_GOVERNANCA` recebe 403). **Aceito:**
   substituído pela allowlist fechada (§7.7).
3. **Testes que não rodam no runner puro** (matriz de perfis e backfill eram teste de rota e
   de SQL). **Aceito:** viram funções puras (§6.1), com o custo declarado.
4. **Barreira RLS em `room_status_history`.** Sinalizado em vez de assumido. **Verificado:**
   as policies filtram só por `unit_id`; sem impacto. E a afirmação "a tabela está vazia" era
   minha, sem verificação — conferida depois, zero nos dois ambientes.

A recomendação dela para a D5 (reaproveitar perfis) foi **rejeitada** por um fato que ela não
tinha: o problema não é o vazamento lateral, é a governanta *receber* alçada de compras ou
acesso a RH ao ser atribuída àqueles perfis. O texto original da D5 descrevia só a direção
errada — falha do plano, não da leitura dela.
