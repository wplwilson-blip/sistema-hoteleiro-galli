# Mapa do resíduo E2E de compras (para planejar limpeza + namespacing)

> 2026-07-02 · Branch `feat-fase3c-editar-perfis`. **100% READ-ONLY**: nada foi alterado
> (código/migration/config/teste/banco). Este documento **apenas mapeia**. **Não** contém SQL de
> DELETE nem proposta de limpeza — isso vem depois, com sua revisão.
>
> Fontes lidas: `tests/e2e/helpers/purchases-flow.ts`, `tests/e2e/compras-*.e2e.spec.ts`,
> rotas em `src/app/api/purchases/**` e `src/app/api/base/suppliers`, migrations `008`, `011`, `013`,
> `014`, `015`, `019`, `020`.

---

## 1. O que a suíte cria (entidade → tabela → como)

Ordem do fluxo (`createPurchaseAwaitingApproval` em `purchases-flow.ts` + cópia inline no T2
`compras-fluxo.e2e.spec.ts`; o T3 `compras-diretoria.e2e.spec.ts` reusa o helper):

| # | Entidade | Tabela real | Como é criada (rota) |
|---|----------|-------------|----------------------|
| 1 | Fornecedor | `public.suppliers` | `POST /api/base/suppliers` (diálogo "Novo fornecedor"). `purchases-flow.ts:120-127` |
| 2 | Solicitação (cabeçalho) | `public.purchase_requests` | `POST /api/purchases/requests` → `requests/route.ts:546` insert. `purchases-flow.ts:102` |
| 3 | Itens da solicitação | `public.purchase_request_items` | mesmo POST (itens aninhados) → `requests/route.ts:618` insert |
| 4 | Eventos operacionais | `public.purchase_request_events` | inseridos no create (`requests/route.ts:455`), no início da cotação, no resubmit (`resubmit/route.ts:201`) e na decisão (`decision/route.ts:57`) |
| 5 | Cotação | `public.purchase_quotes` | `POST /api/purchases/requests/[id]/quotes` → `[id]/quotes/route.ts:396` insert. `purchases-flow.ts:133` |
| 6 | Itens da cotação | `public.purchase_quote_items` | mesmo POST → `[id]/quotes/route.ts:456` insert |
| 7 | Anexo (evidência) | `public.attachments` | `POST /api/attachments` (upload do fixture `evidencia.pdf`). `purchases-flow.ts:139` |
| 8 | Snapshot/dossiê formal | `public.purchase_approval_snapshots` | `POST /api/purchases/approvals/[requestId]/resubmit` ("enviar para aprovação"). `purchases-flow.ts:152` |
| 9 | Decisão de aprovação | `public.purchase_approval_decisions` | `POST /api/purchases/approvals/[requestId]/decision` → `decision/route.ts:174` insert. **Só no T2** (aprova); no **T3** a decisão volta **403** e **nenhuma** linha é criada |

**Colunas de evidência da cotação** (origem/tipo evidência do T2/T3) **não** são tabela nova: são
**colunas** em `purchase_quotes` (`migration 020`: `quote_source_type`, `evidence_type`,
`requires_attachment`, `has_formal_evidence`, ...). Nada a limpar à parte.

**NÃO criadas pela suíte** (0 linhas [E2E]): `purchase_quote_negotiations` (não há passo de
negociação), `purchase_receipts` / `purchase_receipt_items` (não há recebimento). Existem no schema,
mas fora do resíduo.

---

## 2. Marcador "[E2E]" por tabela

Só **duas** tabelas carregam o marcador `[E2E]` numa coluna própria; todo o resto se liga ao resíduo
**apenas por FK / entity_id** a partir delas.

| Tabela | Marcador próprio? |
|--------|-------------------|
| `suppliers` | **Tem marcador** em `name` (`"[E2E] Fornecedor <suffix>"`, via `e2eLabel`). O `document_number` também carrega "E2E" (normalizado — ver §6). |
| `purchase_requests` | **Tem marcador** em `title` (`"[E2E] Compra <suffix>"`) e em `justification` (`"[E2E] justificativa <suffix>"`). `description` só tem o `<suffix>`. |
| `purchase_request_items` | **Só por FK** para `purchase_requests` (`item_description` = `"Item <suffix>"`, sem `[E2E]`). |
| `purchase_request_events` | **Só por FK** para `purchase_requests`. |
| `purchase_quotes` | **Só por FK** para `purchase_requests` (+ `suppliers`). `quote_number` é auto-gerado, sem marcador. |
| `purchase_quote_items` | **Só por FK** para `purchase_quotes` / `purchase_request_items`. |
| `attachments` | **Só por `entity_id` polimórfico** (aponta para a cotação/solicitação; **não** é FK real — `entity_id uuid` sem constraint, `migration 011:39`). `file_name` = `"evidencia.pdf"`, sem `[E2E]`. |
| `purchase_approval_snapshots` | **Só por FK** para `purchase_requests`. O texto `[E2E]` existe **dentro** do `snapshot_payload` (jsonb), mas **não** há coluna dedicada. |
| `purchase_approval_decisions` | **Só por FK** para `purchase_requests` / `purchase_quotes`. |

**Consequência para a estratégia:** limpeza **por-marcador-em-cada-tabela é inviável** (7 das 9
tabelas não têm marcador). O caminho correto é **grafo de FK a partir das raízes marcadas**
(`suppliers` por `name LIKE '[E2E]%'` e `purchase_requests` por `title LIKE '[E2E]%'`), descendo às
filhas por FK e aos anexos por `entity_id`.

---

## 3. Grafo de FK e ordem de exclusão (folha → raiz)

Todas as FKs da cadeia de compras são **`ON DELETE RESTRICT`** (definidas em `migration 013`, exceto
decisões em `015` e snapshots em `019`), então um DELETE físico **precisa** ir da folha para a raiz.

**Quem referencia quem** (coluna → tabela-pai, ação):
- `purchase_request_items.purchase_request_id → purchase_requests` **RESTRICT** (`013:108`)
- `purchase_quotes.purchase_request_id → purchase_requests` **RESTRICT** (`013:136`)
- `purchase_quotes.supplier_id → suppliers` **RESTRICT** (`013:137`)
- `purchase_quote_items.purchase_quote_id → purchase_quotes` **RESTRICT** (`013:173`)
- `purchase_quote_items.purchase_request_item_id → purchase_request_items` **RESTRICT** (`013:174`)
- `purchase_request_events.purchase_request_id → purchase_requests` **RESTRICT** (`013:240`)
- `purchase_approval_snapshots.purchase_request_id → purchase_requests` **RESTRICT** (`019:8`);
  `selected_quote_id → purchase_quotes` **SET NULL** (`019:9`); `selected_supplier_id → suppliers`
  **SET NULL** (`019:10`)
- `purchase_approval_decisions.purchase_request_id → purchase_requests` **RESTRICT** (`015:41`);
  `purchase_quote_id → purchase_quotes` **SET NULL** (`015:42`)
- `attachments` → **sem FK** para as tabelas de compras (liga por `entity_id` polimórfico).

**Ordem de exclusão correta (folha → raiz):**
1. `attachments` (por `entity_id` no conjunto de ids de cotação/solicitação) — sem FK, pode ser 1º.
2. `purchase_approval_decisions` (por `purchase_request_id`).
3. `purchase_approval_snapshots` (por `purchase_request_id`). *(as refs a quote/supplier são SET NULL,
   não bloqueiam; só precisa vir antes de `purchase_requests`.)*
4. `purchase_quote_items` (por `purchase_quote_id`) — antes de `purchase_quotes` **e** de
   `purchase_request_items` (referencia ambos).
5. `purchase_quotes` (por `purchase_request_id`) — antes de `purchase_requests` **e** de `suppliers`.
6. `purchase_request_events` (por `purchase_request_id`) — antes de `purchase_requests`.
7. `purchase_request_items` (por `purchase_request_id`) — antes de `purchase_requests` (e depois de
   `purchase_quote_items`, que as referencia).
8. `purchase_requests` (raiz da cadeia operacional).
9. `suppliers` (só depois que todas as `purchase_quotes` que as referenciam sumiram — RESTRICT).

> Nota: `purchase_requests.approval_request_id → approval_requests` é **SET NULL** e o fluxo da suíte
> **não** cria `approval_requests` (o resubmit só faz UPDATE em `purchase_requests` + insere evento +
> cria snapshot) — logo não entra na ordem.

---

## 4. Pontos sensíveis (o que um DELETE físico dispararia)

Função de auditoria: `public.write_audit_trail()` (`migration 008:32`) — roda **AFTER INSERT OR
UPDATE OR DELETE**. Num **DELETE físico** ela grava uma linha em `public.audit_trail` com
`action='delete'` e `old_value = to_jsonb(old)` (a linha inteira). **Não bloqueia**: tem
`exception when others → return` (`008:98-105`), então falha de auditoria nunca impede o delete.

| Tabela | (a) trigger de auditoria? | (b) soft-delete? | (c) dossiê formal? | DELETE físico dispara… |
|--------|---------------------------|------------------|--------------------|------------------------|
| `suppliers` | **Sim** (`011:191-206`) | tem `deleted_at` (soft manual pelo app) | não | grava `audit_trail` action=delete; não bloqueia |
| `attachments` | **Sim** (`011:191-206`) | tem `deleted_at` | não | idem |
| `purchase_requests` | **Sim** (`013:334-349`) | tem `deleted_at` | não | idem |
| `purchase_request_items` | **Sim** (`013`) | tem `deleted_at` | não | idem |
| `purchase_quotes` | **Sim** (`013`) | tem `deleted_at` | não | idem |
| `purchase_quote_items` | **Sim** (`013`) | tem `deleted_at` | não | idem |
| `purchase_approval_snapshots` | **Sim** (`019:88-97`) | tem `deleted_at` | **SIM — dossiê formal** | grava `audit_trail` com o `snapshot_payload` inteiro em `old_value`; remove o registro formal congelado (perda real do dossiê, aceitável só p/ dado [E2E]) |
| `purchase_request_events` | **Não** (fora do loop de `013`) | **não tem** `deleted_at` (append-only) | não | **nada** de trigger; delete direto |
| `purchase_approval_decisions` | **Não** (nenhum trigger em `015`) | **não tem** `deleted_at` (append-only) | histórico formal de decisão | **nada** de trigger; delete direto (apaga histórico de decisão) |

**Importante:** não existe trigger `BEFORE DELETE` que "converta" delete em soft-delete. O soft-delete
do app é feito **manualmente** por `UPDATE ... SET deleted_at=now()`. Um DELETE físico é um delete
real — apenas **também** escreve `audit_trail` (nas 7 tabelas com trigger). Ou seja: nenhum caminho
**impede** o DELETE; o efeito colateral é só a linha de auditoria (e, no snapshot/decisão, a perda do
registro formal — esperado para dados de teste).

---

## 5. Volume atual (só leitura — NÃO executei)

A suíte E2E **não tem** acesso ao banco (só HTTP). Para contar sem escrever nada, seria preciso rodar
`SELECT`s de contagem via um cliente com credencial (service_role / SQL console do Supabase de
staging). **Não executei** — deixo os SELECTs prontos para você decidir:

```sql
-- Raízes marcadas:
select count(*) from public.suppliers where name like '[E2E]%';
select count(*) from public.purchase_requests where title like '[E2E]%';

-- Filhas por FK (a partir das solicitações [E2E]):
with r as (select id from public.purchase_requests where title like '[E2E]%')
select
  (select count(*) from public.purchase_request_items i where i.purchase_request_id in (select id from r)) as itens,
  (select count(*) from public.purchase_request_events e where e.purchase_request_id in (select id from r)) as eventos,
  (select count(*) from public.purchase_quotes q where q.purchase_request_id in (select id from r)) as cotacoes,
  (select count(*) from public.purchase_quote_items qi
     where qi.purchase_quote_id in (select id from public.purchase_quotes where purchase_request_id in (select id from r))) as itens_cotacao,
  (select count(*) from public.purchase_approval_snapshots s where s.purchase_request_id in (select id from r)) as snapshots,
  (select count(*) from public.purchase_approval_decisions d where d.purchase_request_id in (select id from r)) as decisoes;

-- Anexos por entity_id (ids das cotações/solicitações [E2E]):
select count(*) from public.attachments
 where entity_id in (
   select id from public.purchase_quotes where purchase_request_id in (select id from public.purchase_requests where title like '[E2E]%')
   union
   select id from public.purchase_requests where title like '[E2E]%'
 );
```

> Observação: contar `suppliers`/`purchase_requests` **com e sem** `deleted_at is null` — o índice
> único de fornecedor só considera `deleted_at is null` (§6), então o que bloqueia novas rodadas são
> os residuais **ativos**.

---

## 6. Namespacing — onde o documento colide (só diagnóstico)

**Ponto exato:** `tests/e2e/helpers/purchases-flow.ts:124`:

```ts
await supplierDialog.getByTestId("fornecedor-documento").fill(`E2E-${suffix}`);
```
(e a **cópia inline** do T2 em `tests/e2e/compras-fluxo.e2e.spec.ts:121`, idêntica.)
`suffix = runSuffix()` = `` `${Date.now().toString(36)}-${rand4}` `` (`helpers/data.ts:14-18`), e o
tipo de documento é **"Outro" (OTHER)**.

**Por que colide entre rodadas:** o índice único de fornecedor
(`migration 014:1-8`, `suppliers_org_document_type_normalized_active_unique`) normaliza o documento
**removendo tudo que não é dígito** (`regexp_replace(document_number, '\D', '', 'g')`), sobre
`(organization_id, document_type, dígitos)` e **só** `where deleted_at is null`. O valor
`E2E-<suffix>` reduz-se a uma sequência **curta e de baixa entropia** de dígitos — ex.: o 409 real
mostrou o fornecedor residual `"[E2E] Fornecedor mr3jm22a-cdgs"` com `document_number` normalizado
**`"2322"`** (dígitos de `E2E-mr3jm22a-cdgs`). Como os fornecedores [E2E] **nunca sofrem
hard-delete** (residual acumula), assim que uma nova run gera um `suffix` cujos **dígitos** coincidem
com os de um residual ativo, o insert bate no índice único → Postgres `23505` → a rota responde
**HTTP 409** ("Ja existe um fornecedor cadastrado com este CNPJ/CPF") → `withApi` lança e o teste
quebra (`purchases-flow.ts:29`).

**O que o namespacing precisaria tocar** (NÃO corrigido aqui — só apontado): a geração do **documento**
nessa(s) linha(s), de modo que os **dígitos normalizados** sejam únicos por run (documento numérico
longo/entropia alta em vez de `E2E-<suffix>`). A razão social (`name`, via `e2eLabel`) não é o
problema — o conflito é exclusivamente sobre os **dígitos do documento**. Uma limpeza dos residuais
[E2E] (§3) removeria o acúmulo atual, mas **sem** o namespacing o mesmo colapso volta com runs
suficientes.

---

## Síntese

- Limpeza deve ser por **grafo de FK a partir de `suppliers`+`purchase_requests` [E2E]**, na ordem
  folha→raiz da §3 (9 tabelas + `attachments` por `entity_id`).
- DELETE físico é seguro do ponto de vista de constraint se a ordem for respeitada; o único efeito
  colateral é `audit_trail` (7 tabelas) e a perda dos registros formais de snapshot/decisão — aceitável
  para dado [E2E].
- O 409 que quebra a suíte é o índice único de fornecedor sobre **dígitos** do documento
  (`migration 014`) + residual nunca hard-deletado; o namespacing precisa tornar esses dígitos únicos
  por run em `purchases-flow.ts:124` (e na cópia `compras-fluxo.e2e.spec.ts:121`).

**Aguardando revisão** antes de qualquer SQL de limpeza ou mudança no helper.
