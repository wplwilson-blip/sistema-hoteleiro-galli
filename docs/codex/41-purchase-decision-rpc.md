# 41 — RPC transacional da decisão de aprovação de compra

Branch: `fix/purchase-decision-rpc`

## Problema

A rota `POST /api/purchases/approvals/[requestId]/decision` registrava a decisão de
aprovação de compra com **quatro escritas separadas e sem transação**:

1. `insert` em `purchase_approval_decisions`
2. `update` em `purchase_requests`
3. `update` do snapshot pendente (via `updatePendingPurchaseApprovalSnapshotDecision`)
4. `insert` em `purchase_request_events`

O único compare-and-swap real (o update do snapshot com `.eq("snapshot_status","pending")`)
era a **última** escrita. Em concorrência ou falha parcial isso permitia: linha
fantasma/duplicada em `purchase_approval_decisions`, inconsistência permanente entre a
compra e o dossiê, e o insert do evento falhando depois da decisão já cometida (500 tardio).

## O que foi feito

### 1. `supabase/migrations/079_purchase_decision_rpc.sql` (novo, aditivo)

Função `public.purchase_apply_approval_decision(...)` (`plpgsql`, `security definer`,
`set search_path = public`) que faz as quatro escritas em **uma transação**, na ordem:

1. `select ... for update` da `purchase_requests` (lock da linha) + guarda
   `PURCHASE_ALREADY_DECIDED` se já `approved`/`rejected`.
2. **CAS do snapshot como PRIMEIRA escrita**: `update purchase_approval_snapshots`
   com `snapshot_status = 'pending'` no `where`, retornando `id` e `approval_level`.
   Se nada casar → `PURCHASE_SNAPSHOT_NOT_PENDING`.
3. `insert` em `purchase_approval_decisions` usando o `approval_level` **derivado do
   próprio snapshot** (nunca de parâmetro).
4. `update` em `purchase_requests`.
5. `insert` em `purchase_request_events`.

Erros sinalizados via `raise exception` com mensagens exatas:
`PURCHASE_REQUEST_NOT_FOUND`, `PURCHASE_ALREADY_DECIDED`, `PURCHASE_SNAPSHOT_NOT_PENDING`.

Grant de execute segue o mesmo padrão das migrations 025–030: `revoke ... from public`,
`do $$` com revoke de `anon`/`authenticated` e grant para `service_role`, mais `comment on function`.

### 2. `src/app/api/purchases/approvals/[requestId]/decision/route.ts`

- **Preservado intacto** todo o bloco de autorização/validação: lookup da solicitação,
  checagem de unidade acessível, `assertPendingPurchaseApprovalSnapshot` (que lê o
  `approval_level` para a checagem de autoridade) e `assertCanDecidePurchaseApprovalLevel`.
  A autorização **continua na rota**; a RPC não faz autorização.
- As quatro escritas foram **substituídas por uma única chamada**
  `supabase.rpc("purchase_apply_approval_decision", { ... })`. Não passamos `approval_level`
  — a RPC deriva do snapshot.
- Mapeamento de erro da RPC por correspondência exata da mensagem:
  `PURCHASE_REQUEST_NOT_FOUND` → 404; `PURCHASE_ALREADY_DECIDED` e
  `PURCHASE_SNAPSHOT_NOT_PENDING` → 409; qualquer outro → 500 genérico (nunca devolvendo
  `error.message` cru ao cliente).
- Removido o helper `insertPurchaseRequestEvent` (sem uso), o type alias `SupabaseAdmin`,
  o import `createSupabaseAdminClient`, o import `updatePendingPurchaseApprovalSnapshotDecision`
  e a const `decisionReason` (todos sem uso após a troca).

## Verificação de colunas

Os nomes de coluna do corpo aprovado foram conferidos contra a rota atual e contra
`updatePendingPurchaseApprovalSnapshotDecision`/`assertPendingPurchaseApprovalSnapshot`
em `src/lib/purchases/approval-snapshots.ts`. **Nenhuma divergência de nome de coluna** foi
encontrada — `snapshot_status`, `decision`, `decision_reason`, `decided_by`, `decided_at`,
`updated_by`, `updated_at`, `approval_level` no snapshot; `organization_id`, `unit_id`,
`purchase_request_id`, `purchase_quote_id`, `approval_level`, `decision`, `justification`,
`decided_by`, `decided_at` na decisão; e as colunas de `purchase_requests` /
`purchase_request_events` batem com o código real.

## Desvio único em relação ao corpo aprovado (correção de correção)

No `returning` do CAS, o corpo aprovado usava `returning id, approval_level`. Como a
função declara a coluna de saída (`returns table (..., approval_level text)`), `approval_level`
é também uma variável OUT em escopo. Com o padrão do PostgreSQL
(`plpgsql.variable_conflict = error`), a referência não qualificada seria **ambígua** e a
função falharia em runtime. Corrigido qualificando a coluna:
`returning id, purchase_approval_snapshots.approval_level into v_snap, v_level`.
Semântica idêntica; sem isso a RPC não executaria.

## Restrições respeitadas

- Não alteradas Auth, login, RLS, helpers de sessão nem migrations existentes.
- Regra de negócio, alçada, enums e colunas inalterados. A função é puramente aditiva.
- A migration **não foi aplicada** no banco — apenas o arquivo `.sql` foi criado.
- Sem dependências novas. Comportamento para quem já tem permissão permanece idêntico.
- Fora deste escopo (mojibake, limite de justificativa, outros arquivos) nada foi tocado.

## Como aplicar

Rodar o conteúdo de `supabase/migrations/079_purchase_decision_rpc.sql` no Supabase
SQL Editor.
