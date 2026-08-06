# Plano — #7: mutação de valores de cotação não-transacional

**Área SENSÍVEL** (migration/RPC). Só plano.
Branch previsto: `refactor/purchase-quote-values-rpc`.

---

## 0. Evidência reconferida

`src/app/api/purchases/requests/[id]/quotes/[quoteId]/route.ts` (1037 linhas):

- `restoreQuoteSelectionState` — **`:470-502`** (confere com a auditoria). Reverte
  `purchase_requests` (`:477-490`) e depois itera `existingQuotes` fazendo um `update` por
  cotação (`:492-501`). É um rollback **manual, não atômico, e ele próprio sem rollback**:
  se falhar no meio do `for`, o estado fica parcialmente revertido e ninguém sabe.
- **PATCH, caminho de valores** (`:504` em diante):
  - `:775` — `update` em `purchase_quotes` (valores, evidência, status).
  - `:782` — `delete` de **todos** os `purchase_quote_items`.
  - `:786-802` — rollback manual do `update` se o delete falhar (confere com a auditoria).
  - `:806-820` — `insert` dos itens novos.
  - `:822-843` — rollback manual: desfaz o `update` **e** re-insere os itens antigos via
    `buildRestoredQuoteRows` (`:841`).
  - `:845-864+` — só então atualiza `purchase_requests` (totais, flags de aprovação, nível).
- `:952-1005` — DELETE com o mesmo padrão: `:959` marca a cotação, `:982` e `:1004` desfazem
  manualmente em caso de falha posterior.

**A janela real:** entre `:782` (itens apagados) e `:820` (itens reinseridos) a cotação
existe **sem itens**, com `total_amount` já atualizado. Entre `:820` e `:861` a cotação tem
valores novos mas `purchase_requests.total_approved_amount` ainda tem o valor **antigo** —
e é esse campo que governa `approval_required`, `approval_level` e, portanto, **quem tem
alçada para aprovar** (`decision/route.ts:75`, `:102`).

**Nenhum dos rollbacks cobre queda de processo.** Serverless: timeout de função, OOM,
deploy no meio do request, cliente desconectando. O resultado é uma solicitação com
`total_approved_amount` divergente da cotação vencedora — ou seja, **compra aprovável na
alçada errada**, silenciosamente. Não é só consistência: é um bypass de alçada por
acidente.

**Precedente no próprio repo (o padrão a seguir):**
- `supabase/migrations/079_purchase_decision_rpc.sql` → `purchase_apply_approval_decision`
  (decisão inteira em uma RPC).
- `docs/codex/44-purchase-submit-snapshot-rpc.md` → mesmo movimento para o snapshot.
- `docs/codex/41-purchase-decision-rpc.md` → o plano que originou a 079.

Este achado é literalmente "aplicar 41/44 ao terceiro caminho de escrita".

---

## 1. Escopo desta fatia

**Dentro:** o caminho de **valores** do PATCH (`:755-880` aprox.) — update da cotação,
substituição dos itens, e recálculo em `purchase_requests`.

**Fora (fatias futuras, se você quiser):**
- o caminho de **seleção/deseleção** (`:541-680`), que usa `restoreQuoteSelectionState`;
- o **DELETE** (`:952-1005`).

Motivo do recorte: os três compartilham a doença, mas o caminho de valores é o único que
mexe em `total_approved_amount` **e** nos itens na mesma requisição — maior superfície e
maior consequência. Uma RPC por vez, com o teste de equivalência de cada uma.

---

## 2. Entregáveis

| Item | Natureza |
|---|---|
| `supabase/migrations/0NN_purchase_quote_values_rpc.sql` | **novo, você aplica** |
| `src/app/api/purchases/requests/[id]/quotes/[quoteId]/route.ts` | substitui o bloco `:775-880` por 1 chamada de RPC |
| `tests/unit/` | teste do mapeamento payload→parâmetros e da tradução de erros |

---

## 3. Diff conceitual

### 3.1 RPC

```sql
create or replace function public.purchase_save_quote_values(
  p_request_id      uuid,
  p_quote_id        uuid,
  p_quote_update    jsonb,   -- corpo ja montado pela rota (quoteUpdateBody)
  p_items           jsonb,   -- array de itens novos, ja validado/calculado pela rota
  p_request_update  jsonb,   -- flags/totais quando a cotacao e a vencedora; null caso contrario
  p_actor_id        uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote purchase_quotes%rowtype;
begin
  -- 1) trava a cotacao (evita corrida com selecao/decisao concorrente)
  select * into v_quote
  from purchase_quotes
  where id = p_quote_id and purchase_request_id = p_request_id and deleted_at is null
  for update;

  if not found then raise exception 'PURCHASE_QUOTE_NOT_FOUND'; end if;

  -- 2) update dos valores da cotacao
  update purchase_quotes set ... from jsonb_populate_record ... where id = p_quote_id;

  -- 3) substituicao dos itens (delete + insert) — mesma transacao
  delete from purchase_quote_items where purchase_quote_id = p_quote_id;
  insert into purchase_quote_items (...) select ... from jsonb_to_recordset(p_items) ...;

  -- 4) recalculo em purchase_requests, quando aplicavel
  if p_request_update is not null then
    update purchase_requests set ... where id = p_request_id;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;
```

**Princípio de desenho:** a RPC é um **envelope transacional**, não uma reimplementação de
regra de negócio. Todo o cálculo (`sumPurchaseQuoteItems`, `calculateWinningQuoteApprovalFlags`,
`getPurchaseApprovalLevel`, `getReviewApprovalStatusUpdate`, `getReviewDecisionResetFields`,
`mapQuoteEvidenceUpdate`) **permanece em TypeScript** e chega pronto via `jsonb`. Isso mantém
a lógica em um só lugar e torna a migration revisável — mesma escolha da 079.

### 3.2 Rota

```ts
- const { error: updateError } = await supabase.from("purchase_quotes").update(quoteUpdateBody)…
- …delete…  // :782
- …rollback manual…  // :786-802
- …insert…  // :806
- …rollback manual…  // :822-843
- …update purchase_requests…  // :848

+ const { error: rpcError } = await supabase.rpc("purchase_save_quote_values", {
+   p_request_id: requestRow.id,
+   p_quote_id: quoteRow.id,
+   p_quote_update: quoteUpdateBody,
+   p_items: itemsPayload,
+   p_request_update: quoteRow.is_selected ? requestUpdateBody : null,
+   p_actor_id: context.session.user.id
+ });
+ if (rpcError) { /* traducao de sentinelas, espelhando decision/route.ts:157-168 */ }
```

Resultado: `restoreQuoteSelectionState` deixa de ser chamada neste caminho (continua viva
para o caminho de seleção, fora do escopo) e ~70 linhas de rollback manual saem do arquivo.

---

## 4. Casos de borda

1. **Falha no meio da RPC** → `raise` aborta a transação inteira. Zero estado parcial.
   **É o bug corrigido.**
2. **Queda de processo entre a chamada e a resposta** → a transação foi commitada no banco
   ou não; nunca no meio. O cliente pode não ver a resposta, mas o estado é consistente.
3. **Cotação não vencedora** → `p_request_update` nulo, `purchase_requests` não é tocada.
   Espelha o `if (quoteRow.is_selected)` de `:847`.
4. **Cotação sem itens** (`p_items` array vazio) → delete roda, insert não. Precisa
   confirmar se o schema/validação atual permite; se `purchaseQuotePatchSchema` exige ao
   menos um item, o caso não ocorre — **a confirmar na Fase B antes de escrever o SQL**.
5. **Corrida com a decisão de aprovação** → o `for update` da linha da cotação serializa
   contra outra escrita na mesma cotação. Não serializa contra `purchase_requests`; se
   isso for necessário, acrescenta-se um `for update` na solicitação — decisão a tomar ao
   escrever o SQL, com o custo de contenção em mente.
6. **`security definer`** → a RPC roda como owner. Aceitável e coerente com a 079, já que
   o app inteiro usa service_role. **A autorização continua sendo feita na rota**
   (`requirePermission(quotesManage)` em `:505` + `accessibleUnitIds.includes(unit_id)` em
   `:517`) — a RPC não é um bypass novo, é o mesmo nível de confiança já existente.
7. **Triggers de auditoria/soft-delete** nas tabelas envolvidas → passam a rodar dentro da
   mesma transação. Precisam ser inventariados antes de escrever o SQL (podem depender de
   `updated_by`, que a RPC deve setar igual à rota).

---

## 5. Teste

O teste real desta fatia é de **equivalência**, e é o ponto delicado: não há como testar
transação em `tests/unit/` puro. Plano:

- **Unitário (obrigatório):** extrair a montagem de `quoteUpdateBody`, `itemsPayload` e
  `requestUpdateBody` para funções puras; testar que os objetos produzidos são
  **byte-a-byte iguais** aos que a rota monta hoje (snapshot dos campos). Isso garante que
  a RPC recebe exatamente o que o código atual escreveria.
- **Manual/staging (a combinar com você):** roteiro de verificação — salvar valores de
  cotação vencedora e conferir `purchase_requests.total_approved_amount`,
  `approval_level`, `approval_required` antes/depois; e um teste de falha induzida
  (item com FK inválida) confirmando que **nada** foi persistido.

---

## 6. Critério de aceite

- [ ] lint / build / test:unit passam.
- [ ] `.sql` entregue, **não aplicado**.
- [ ] Payloads produzidos idênticos aos atuais (teste de snapshot).
- [ ] Nenhum rollback manual restante no caminho de valores.
- [ ] Caminhos de seleção e DELETE **inalterados** nesta fatia.

---

## 7. O que NÃO muda

- Toda a regra de negócio em TS: `sumPurchaseQuoteItems`,
  `calculateWinningQuoteApprovalFlags`, `getPurchaseApprovalLevel`,
  `getReviewApprovalStatusUpdate`, `getReviewDecisionResetFields`, `mapQuoteEvidenceUpdate`,
  `isReturnedToPurchases`.
- `restoreQuoteSelectionState` — **permanece no arquivo**, usada pelo caminho de seleção.
- Gate de permissão e checagem de unidade (`:505`, `:517`).
- `purchase_apply_approval_decision` (079) — não é tocada.
- Schema das tabelas: nenhuma coluna nova.
