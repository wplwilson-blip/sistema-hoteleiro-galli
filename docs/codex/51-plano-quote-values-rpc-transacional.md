# Plano — #7: mutação de cotação não-transacional (+ coluna `selected_by`)

**Área SENSÍVEL**: caminho do dinheiro **e** migration. Só plano — nenhum código de
produção, nenhuma migration aplicada.
Branch previsto: `refactor/purchase-quote-mutations-rpc`.

> **Revisão 2** — a versão anterior deste doc escopava apenas o caminho de *valores* do
> PATCH e deixava seleção e DELETE como "fatias futuras". A leitura completa do arquivo
> mostrou que **os quatro caminhos** têm a mesma janela, e que a de seleção é a **mais
> perigosa** — não a de valores. Escopo revisado abaixo, com o inventário linha a linha.

---

## 0. Evidência reconferida (arquivo inteiro, `main` = `f544c47`)

`src/app/api/purchases/requests/[id]/quotes/[quoteId]/route.ts` — 1037 linhas, **quatro**
caminhos de mutação, não um:

| # | Caminho | Linhas | Escritas em sequência | Rollback manual |
|---|---|---|---|---|
| 1 | `PATCH action=unselect` | 534-601 | quote → request → evento | `:574-578`, `:593-596` |
| 2 | `PATCH action=select` | 603-683 | quotes(N) → quote → request → evento | `restoreQuoteSelectionState` ×4 (`:628`, `:641`, `:662`, `:678`) |
| 3 | `PATCH action=save` | 685-899 | (request status) → quote → **delete** itens → insert itens → request → evento | `:786-802`, `:822-843`, `:863-885` |
| 4 | `DELETE` | 917-1037 | quote → itens → request → evento | `:982`, `:1004-1005` |

`restoreQuoteSelectionState` (`:470-502`) é ele próprio não-atômico: um `update` na
`purchase_requests` seguido de **um `update` por cotação** num `for` (`:492-501`). Se
falhar no meio do laço, o "rollback" fica pela metade e ninguém fica sabendo.

### 0.1 A janela crítica, por caminho

**O caminho de SELEÇÃO é o pior** — e a versão 1 deste doc não o cobria.

Entre `:632-643` (a cotação vira vencedora) e `:645-658` (a `purchase_requests` recebe
`total_approved_amount` e `approval_level` novos) existe uma janela em que a solicitação
tem **cotação vencedora nova com valor e alçada antigos**. A cadeia até o dano:

`purchase_requests.total_approved_amount` → `getPurchaseApprovalLevel`
([api.ts:117](../../src/lib/purchases/api.ts#L117), corte em R$200) → `approval_level`
gravado → o dossiê formal é montado a partir da linha da solicitação → a rota de decisão
usa **o nível do snapshot** ([decision/route.ts:113-114](../../src/app/api/purchases/approvals/[requestId]/decision/route.ts#L113))
→ `assertCanDecidePurchaseApprovalLevel`.

Ou seja: uma cotação de R$5.000 selecionada, processo morto antes do `:645`, solicitação
ainda dizendo R$100 → `administrative_management` → **um `DEPARTMENT_MANAGER` aprova uma
compra que exigiria Diretoria**. Não é "inconsistência de dados": é **desvio de alçada**,
no mesmo módulo em que a fatia #3 acabou de fechar a autoaprovação.

**Caminho de valores** (`save`): duas janelas. Entre `:782` (delete dos itens, **hard
delete**) e `:806` (insert dos novos) a cotação existe **sem itens** com `total_amount`
já novo; entre `:806` e `:848` a solicitação tem total defasado (mesma cadeia acima).

**`unselect` e `DELETE`**: janela em que a cotação deixou de ser vencedora mas a
solicitação ainda tem `total_approved_amount > 0` e `approval_required = true`. Menos
grave — a rota de decisão exige cotação vencedora (`:98`) e devolveria 409 —, mas a
solicitação fica num estado que nenhuma tela sabe representar.

**Nenhum dos rollbacks cobre queda de processo.** Serverless: timeout, OOM, deploy no
meio do request, instância reciclada. E o rollback de `select` é ele mesmo não-atômico.

**Precedente no repo:** [079](../../supabase/migrations/079_purchase_decision_rpc.sql)
(decisão) e [081](../../supabase/migrations/081_purchase_submit_snapshot_rpc.sql)
(dossiê) já fizeram exatamente este movimento, com `FOR UPDATE` na `purchase_requests` e
cálculo mantido na aplicação. Esta fatia aplica o mesmo padrão ao terceiro e último
bloco de escrita do módulo.

---

## 1. Escopo: os quatro caminhos, em três RPCs

Cobrir só "valores" deixaria de fora justamente a pior janela. Proposta:

| RPC | Cobre | Por quê agrupado |
|---|---|---|
| `purchase_save_quote_values` | caminho 3 (`save`) | maior superfície: valores + troca de itens + totais |
| `purchase_set_quote_selection` | caminhos 1 e 2 (`unselect`/`select`) | mesma forma (quotes + request + evento); diferem só no estado alvo, resolvido por um parâmetro |
| `purchase_cancel_quote` | caminho 4 (`DELETE`) | soft-delete de cotação + itens + reset condicional |

**Princípio de desenho (o mesmo da 079/081):** a RPC é **envelope transacional**, não
reimplementação de regra. Todo o cálculo continua em TypeScript e chega pronto via
`jsonb`. Nada de `getPurchaseApprovalLevel`, `calculateWinningQuoteApprovalFlags`,
`sumPurchaseQuoteItems` ou `mapQuoteEvidenceUpdate` migra para SQL.

### 1.1 Assinaturas

```sql
create or replace function public.purchase_save_quote_values(
  p_request_id       uuid,
  p_quote_id         uuid,
  p_quote_update     jsonb,   -- quoteUpdateBody, montado na rota (:757-773)
  p_items            jsonb,   -- array dos itens novos, ja calculados
  p_request_update   jsonb,   -- totais/flags quando a cotacao e' a vencedora; null se nao
  p_start_quotation  boolean, -- auto-start submitted/under_review -> quotation (:697-717)
  p_events           jsonb,   -- eventos a inserir, em ordem (quotation_started, quote_updated)
  p_actor_id         uuid
) returns jsonb

create or replace function public.purchase_set_quote_selection(
  p_request_id     uuid,
  p_quote_id       uuid,
  p_select         boolean, -- true = select, false = unselect
  p_request_update jsonb,
  p_event          jsonb,
  p_actor_id       uuid
) returns jsonb

create or replace function public.purchase_cancel_quote(
  p_request_id     uuid,
  p_quote_id       uuid,
  p_request_update jsonb,   -- null quando a cotacao nao era a vencedora
  p_event          jsonb,
  p_actor_id       uuid
) returns jsonb
```

Todas seguem o mesmo esqueleto:

```sql
-- 1) lock: serializa mutacoes concorrentes na mesma solicitacao (padrao da 081)
select * into v_request from purchase_requests
 where id = p_request_id and deleted_at is null for update;
if not found then raise exception 'PURCHASE_REQUEST_NOT_FOUND'; end if;

select * into v_quote from purchase_quotes
 where id = p_quote_id and purchase_request_id = p_request_id and deleted_at is null
 for update;
if not found then raise exception 'PURCHASE_QUOTE_NOT_FOUND'; end if;

-- 2..n) as escritas do caminho, na MESMA ordem de hoje
-- ultima) insert dos eventos
```

Sentinelas em string, traduzidas na rota — convenção já usada na 079
(`PURCHASE_REQUEST_NOT_FOUND`, `PURCHASE_ALREADY_DECIDED`).

### 1.2 Como a rota passa a chamar

O que **permanece na rota, antes** da RPC (nenhuma dessas checagens entra em SQL):

- `requirePermission(PURCHASES_PERMISSIONS.quotesManage)` (`:505`, `:918`);
- `accessibleUnitIds.includes(requestRow.unit_id)` (`:517`, `:928`);
- `getPurchaseQuotationMutationBlockMessage` (`:521-530`, `:932-941`);
- `assertQuoteIsNotInFormalDossier` (`:535`, `:604`, `:690`, `:945`);
- validações de status (`:537`, `:606`, `:610`, `:686`, `:718`, `:947`);
- validação/mapeamento dos itens (`:727-752`), `fetchSupplier` (`:754`), cálculo de
  `totalAmount`, flags e nível.

O que **sai**: os blocos de rollback manual (`:574-578`, `:593-596`, `:628`, `:641`,
`:662`, `:678`, `:786-802`, `:822-843`, `:863-885`, `:982`, `:1004-1005`) e a função
`restoreQuoteSelectionState` (`:470-502`) **inteira** — ela só é usada por esses blocos,
vira código morto e é removida. Junto sai `buildRestoredQuoteRows`, usada só no rollback
(`:841`, `:866`).

Estimativa: **~150 linhas a menos** na rota.

### 1.3 Eventos dentro da transação — mudança de semântica a decidir

Hoje o evento é inserido **depois** das escritas e, se falhar, dispara rollback manual
(`:592-598`, `:677-680`). No caminho `save` (`:888`) e no `DELETE` (`:1010`) o evento é
inserido **sem** rollback: se falhar, a mutação já está feita e o `catch` devolve 500 —
estado gravado, evento perdido.

Colocando o evento dentro da RPC, uma falha ao inserir o evento **desfaz a mutação
inteira**. É mais correto (a trilha passa a ser garantida), mas é **mudança de
comportamento**: hoje `save` e `DELETE` sobrevivem a um evento com problema.

**Recomendo incluir os eventos na transação.** A trilha de auditoria de uma compra não
deveria ser best-effort, e o modo de falha (nada acontece, usuário repete) é melhor que
o atual (mutação sem trilha). Mas é decisão sua — registrado explicitamente.

---

## 2. Migrations (você aplica; eu não aplico)

Duas, idempotentes, **nesta ordem**:

### `082_purchase_quote_selected_by.sql`
```sql
alter table public.purchase_quotes
  add column if not exists selected_by uuid references public.app_users(id) on delete set null,
  add column if not exists selected_at timestamptz;

comment on column public.purchase_quotes.selected_by is
  'Quem marcou esta cotacao como vencedora, gravado no ATO da selecao. NULL = legado ou nao selecionada. Base para segregacao selecionador != aprovador.';
```

- `add column if not exists` → reaplicável.
- `on delete set null` → mesmo padrão de `purchase_requests.requested_by`
  ([013:54](../../supabase/migrations/013_purchase_module_base.sql#L54)).
- **Sem backfill.** Legado fica `NULL`; `updated_by` **não** serve como origem (é mutável
  e reflete qualquer edição posterior — foi exatamente por isso que a #3 adiou o tema).
- **Sem índice.** O uso previsto é ler `selected_by` da cotação já carregada por `id`;
  nenhuma consulta filtra por selecionador. Índice seria peso sem leitor.

### `083_purchase_quote_mutation_rpcs.sql`
As três funções da §1.1 + grants no padrão da
[079:122-170](../../supabase/migrations/079_purchase_decision_rpc.sql#L122):

```sql
revoke execute on function public.<fn>(...) from public;
-- e, se o role existir, de anon e authenticated
grant execute on function public.<fn>(...) to service_role;
```

`create or replace function` → reaplicável. Precisa vir **depois** da 082, porque
`purchase_set_quote_selection` grava `selected_by`.

**Verificação obrigatória antes de escrever o SQL:** inventariar triggers em
`purchase_quotes`, `purchase_quote_items`, `purchase_requests` e `purchase_request_events`
(auditoria / soft-delete). Elas passam a rodar dentro da mesma transação; se alguma
depende de `updated_by`, a RPC precisa setá-lo igual à rota faz hoje.

---

## 3. `selected_by`: onde grava — e a recomendação sobre enforçar

### 3.1 Onde é gravado

Dentro de `purchase_set_quote_selection`, no **ato** da seleção:

- `p_select = true` → na cotação alvo: `selected_by = p_actor_id`, `selected_at = now()`;
  nas demais cotações da solicitação (que são desmarcadas): `selected_by = null`,
  `selected_at = null`;
- `p_select = false` (unselect) → `selected_by = null`, `selected_at = null`.

E em `purchase_cancel_quote`, quando a cotação cancelada era a vencedora: idem, `null`.

**Consequência de desenho:** `selected_by` reflete sempre o **ato de seleção vigente**,
nunca um histórico. Se Ana seleciona, Bruno desmarca e Ana seleciona de novo,
`selected_by = Ana`. É o que a segregação precisa — quem colocou a cotação vencedora que
está sendo aprovada agora. O histórico completo já vive em `purchase_request_events`.

### 3.2 Recomendação: **criar e gravar agora, enforçar em fatia curta seguinte**

Enforçar nesta fatia é tecnicamente fácil (espelhar a #3: adicionar `selected_by` ao
SELECT da cotação vencedora em [decision/route.ts:85](../../src/app/api/purchases/approvals/[requestId]/decision/route.ts#L85)
e estender o predicado). Mesmo assim, **recomendo separar**, por três motivos:

1. **A trava nasceria inerte e depois "acordaria".** Toda cotação já selecionada hoje tem
   `selected_by = NULL` → não bloqueia (mesma regra da #3 para `requested_by` nulo). O
   bloqueio só começa a valer para seleções feitas **após** a migration. Junto na mesma
   release, isso vira um comportamento que muda sozinho com o tempo, sem novo deploy —
   difícil de explicar a um usuário e difícil de correlacionar a um incidente.
2. **Não dá para medir o impacto antes.** A #3 só foi liberada porque você mediu as
   autoaprovações em produção. Para o selecionador **não existe dado**: a coluna não
   existe. Enforçar agora seria fazer exatamente o que evitamos na #3 — soltar uma trava
   no caminho do dinheiro sem saber quantas operações ela quebra. Com a coluna gravando
   por algumas semanas, a mesma consulta de impacto passa a ser possível.
3. **Duas mudanças de risco na mesma release.** Esta fatia já reescreve os quatro
   caminhos de escrita de cotação e aplica duas migrations. Somar uma trava de
   autorização no fluxo de aprovação amplia o raio de um eventual rollback.

**Proposta:** #7 entrega atomicidade + coluna + gravação. A fatia seguinte (curta,
sem migration) entrega o enforcement, depois de você olhar a consulta:

```sql
select count(*) from public.purchase_quotes q
  join public.purchase_requests r on r.id = q.purchase_request_id
 where q.is_selected and q.deleted_at is null and q.selected_by is not null
   and r.approval_decided_by = q.selected_by;
```

Ponto para você decidir junto: quando enforçarmos, o bloqueio deve ser **só `approved`**
(coerente com a #3) e **sem exceção para super admin** — presumo que sim, mas registro.

---

## 4. O que muda e o que NÃO muda

### Muda
- Cada um dos quatro caminhos passa a ser **uma transação**. Falha no meio → nada
  persiste. Fim do estado parcial e do desvio de alçada por janela.
- `restoreQuoteSelectionState` e `buildRestoredQuoteRows` **deixam de existir**.
- Eventos passam a ser transacionais (§1.3 — decisão sua).
- `purchase_quotes` ganha `selected_by`/`selected_at`, gravadas na seleção.
- Concorrência: `FOR UPDATE` na solicitação serializa mutações simultâneas na mesma
  compra. Hoje duas seleções concorrentes podem intercalar.

### NÃO muda (âncoras)
- **Alçada**: `getPurchaseApprovalLevel`, `calculateWinningQuoteApprovalFlags`,
  `assertCanDecidePurchaseApprovalLevel` — intocados. A RPC recebe os valores prontos.
- **Dossiê/snapshot**: `assertQuoteIsNotInFormalDossier` continua em TS, **antes** da
  RPC; migrations 079, 080 e 081 não são editadas; a rota de decisão não é tocada.
- **Gates**: `requirePermission(quotesManage)` e a checagem de `accessibleUnitIds`
  permanecem onde estão. As RPCs são `security definer` como a 079 — mesmo nível de
  confiança já existente, não um bypass novo.
- **Bloqueio de mutação**: `getPurchaseQuotationMutationBlockMessage` inalterado.
- **Contrato HTTP**: mesmos status e **mesmas mensagens** de erro; as sentinelas da RPC
  são traduzidas para as strings de hoje, uma a uma.
- **Regra de negócio em TS**: `sumPurchaseQuoteItems`, `roundMoney`,
  `getReviewApprovalStatusUpdate`, `getReviewDecisionResetFields`, `isReturnedToPurchases`,
  `mapQuoteEvidenceUpdate`, `classifyPurchaseQuoteEvidence` — nenhuma migra para SQL.
- **Schema**: nenhuma coluna nova além de `selected_by`/`selected_at`.

---

## 5. Testes

**Unitários** (runner puro): extrair a montagem de `quoteUpdateBody`, `itemsPayload`,
`requestUpdateBody` e `eventPayload` para funções puras e provar que os objetos são
**idênticos** aos que a rota monta hoje (snapshot campo a campo). É o que garante que a
RPC recebe exatamente o que o código atual escreveria. Mais: idempotência do mapeamento
(mesma entrada → mesma saída) e o predicado de "cotação é a vencedora?" que decide se
`p_request_update` vai preenchido ou nulo.

**E2E staging — prova de atomicidade.** O ponto central. Com falha **induzida no meio da
transação**: passar em `p_items` um item com `purchase_request_item_id` inexistente
(viola FK) no meio do array. Esperado: a RPC aborta e, **depois** da chamada, a cotação
mantém `total_amount`, itens e a `purchase_requests` mantém `total_approved_amount` e
`approval_level` **exatamente** como antes. O mesmo roteiro rodado contra o código de
`main` deve deixar estado parcial — provando que a fatia conserta algo real, no padrão
das fatias #1 e #3.

Mais: os quatro caminhos no caminho feliz; seleção gravando `selected_by`; unselect e
cancelamento limpando; e seleção concorrente (duas chamadas simultâneas) terminando em
estado único e coerente.

---

## 6. Critério de aceite

- [ ] `npm run lint`, `build`, `test:unit` verdes.
- [ ] Dois `.sql` entregues, **não aplicados**, idempotentes, com grants no padrão 079.
- [ ] Inventário de triggers feito antes do SQL final.
- [ ] Payloads produzidos idênticos aos atuais (teste de snapshot).
- [ ] Nenhum rollback manual restante no arquivo; `restoreQuoteSelectionState` removida.
- [ ] Atomicidade provada por falha induzida, com o contraste contra `main`.
- [ ] Mensagens e status HTTP inalterados.
- [ ] Rota de decisão e migrations 079/080/081 fora do diff.

---

## 7. Pendências registradas

- **Enforcement de `selected_by`** (segregação selecionador ≠ aprovador): fatia curta
  seguinte, após medir impacto (§3.2).
- **Mojibake** em mensagens deste arquivo e de `decision/route.ts` (9 ocorrências lá):
  dívida conhecida, não corrigida aqui.
