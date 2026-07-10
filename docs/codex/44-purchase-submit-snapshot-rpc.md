# 44 — RPC transacional para envio/reenvio do dossiê formal de aprovação

Branch: `fix/purchase-submit-snapshot-rpc`

## Problema

A rota `POST /api/purchases/approvals/[requestId]/resubmit` (usada tanto para **envio
inicial** quanto para **reenvio**, distinguidos por `isResubmission`) fazia três escritas
em sequência **sem transação**:

1. cria o snapshot (`createPurchaseApprovalSnapshot`);
2. atualiza `purchase_requests`;
3. insere dois eventos em `purchase_request_events`.

Com compensação manual frágil (`deletePurchaseApprovalSnapshot`) se o update falhasse.
Isso permitia snapshot órfão e janela de corrida. O cálculo de `snapshot_number` e o
`assertNoPendingSnapshot` eram feitos em TypeScript, fora de qualquer lock — o índice único
`purchase_approval_snapshots_request_pending_unique` (migration 019) era a única rede final.

## Solução

Toda a gravação passa a acontecer em **uma transação** numa RPC, no mesmo estilo da
`079_purchase_decision_rpc.sql` (plpgsql, `security definer`, `set search_path = public`,
grant só para `service_role`, cast explícito para `public.purchase_request_status`).

### 1. `supabase/migrations/081_purchase_submit_snapshot_rpc.sql` (aditiva)

`public.purchase_submit_approval_snapshot(...)` faz, em ordem:

1. `select ... for update` da `purchase_requests` alvo → **serializa reenvios concorrentes**
   da mesma compra; se não achar → `raise exception 'PURCHASE_REQUEST_NOT_FOUND'`.
2. **Gate atômico**: se já existir snapshot `snapshot_status='pending'` e `deleted_at null`
   → `raise exception 'PURCHASE_SNAPSHOT_ALREADY_PENDING'`.
3. **`snapshot_number` calculado sob o lock**:
   `coalesce(max(snapshot_number),0)+1` para a `purchase_request_id` (não deletados).
4. `insert` do snapshot com todas as colunas do insert atual (`snapshot_status='pending'`),
   dentro de um bloco que converte `unique_violation` (23505) em
   `PURCHASE_SNAPSHOT_ALREADY_PENDING`.
5. `update` da `purchase_requests` com os mesmos campos que a rota atualizava
   (`status::public.purchase_request_status`, `approval_status='pending'`, `approval_level`,
   flags, `approval_decided_*` = null, `updated_by`).
6. `insert` dos **dois eventos** (envio/reenvio e `approval_snapshot_created`), com
   `from_status`/`to_status` com cast `::public.purchase_request_status`.
7. `return snapshot_id, snapshot_number`.

Grant de execute só para `service_role` (revoke de public/anon/authenticated), no padrão da 079.

### 2. `src/lib/purchases/approval-snapshots.ts`

- `createPurchaseApprovalSnapshot` **continua fazendo toda a leitura e montando o
  `snapshot_payload` exatamente como antes** — a montagem do payload não mudou.
- Em vez do `.insert()` direto, delega a gravação para a RPC, enviando os valores do
  snapshot + os campos de update da `purchase_requests` + os dois eventos.
- `assertNoPendingSnapshot` e `fetchNextSnapshotNumber` (cálculo do `snapshot_number` em TS)
  ficaram sem uso e foram **removidos** — a RPC faz ambos, atomicamente, sob o lock.
- A assinatura pública **continua retornando `{ id, snapshot_number }`** (mapeado de
  `snapshot_id`/`snapshot_number` da RPC). O tipo de entrada foi estendido com
  `requestUpdate` e `events` para carregar os valores calculados na rota.
- Erro da RPC mapeado por `.includes()` na mensagem: `PURCHASE_SNAPSHOT_ALREADY_PENDING`
  → 409, `PURCHASE_REQUEST_NOT_FOUND` → 404, resto → 500 (`PurchaseApprovalSnapshotError`).

### 3. `src/app/api/purchases/approvals/[requestId]/resubmit/route.ts`

- Removidos o bloco de `update` da `purchase_requests`, o `insert` dos dois eventos e a
  compensação manual `deletePurchaseApprovalSnapshot` (e seu import) — tudo isso agora
  acontece dentro de `createPurchaseApprovalSnapshot` via RPC, atômico.
- Os valores que a rota calculava (status/flags do update e `event_type`/descrições/
  `from_status` dos eventos) são **passados** para `createPurchaseApprovalSnapshot`.
- **Alçada intacta**: a rota continua calculando `approvalLevel` a partir da evidência a
  cada envio (incluindo o rebaixamento Diretoria→Gerência quando a evidência melhora) e o
  passa à RPC. A RPC não decide alçada.
- O `catch` final não devolve mais `error.message` cru: loga e responde mensagem genérica.

## Decisões de implementação (fidelidade ao plano)

- **Descrição do 2º evento** (`approval_snapshot_created`) embute o `snapshot_number`, que
  só é conhecido dentro da RPC (calculado sob o lock). Por isso, em vez de recebê-la pronta,
  a RPC recebe `p_request_number` e monta o texto idêntico ao atual:
  `Dossie formal de aprovacao #<n> criado para a compra <request_number>.`
- **Ator e timestamp consolidados**: no código atual `submitted_by`/`created_by`/`updated_by`
  do snapshot, `updated_by` do update e `created_by` dos eventos são todos o mesmo usuário;
  `submitted_at`/`created_at`/`updated_at` são o mesmo `now`. A RPC recebe um `p_submitted_by`
  e um `p_now` e os reutiliza — valores idênticos aos de hoje, sem mudança de comportamento.

## Restrições respeitadas (NAO_ALTERAR.md)

- Não alteradas colunas, enums, RLS, Auth, login, migrations existentes nem a montagem do
  `snapshot_payload`. Migration puramente aditiva. **Não aplicada no banco.**
- Assinatura pública de `createPurchaseApprovalSnapshot` preservada (`{ id, snapshot_number }`).
- Sem libs novas. `lint` e `build` passam.

## Como aplicar

Rodar `supabase/migrations/081_purchase_submit_snapshot_rpc.sql` no Supabase SQL Editor.
