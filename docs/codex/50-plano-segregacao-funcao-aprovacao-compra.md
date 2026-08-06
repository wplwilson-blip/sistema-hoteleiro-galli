# Plano — #3: aprovação de compra sem segregação de função (autoaprovação)

**Área SENSÍVEL** (autorização + RPC/migration). Só plano.
Branch previsto: `fix/purchase-approval-segregation-of-duties`.

---

## 0. Evidência reconferida

**Rota** — `src/app/api/purchases/approvals/[requestId]/decision/route.ts`:

- `:57-59` — o SELECT em `purchase_requests` traz
  `id, organization_id, unit_id, status, request_number, total_approved_amount,
  approval_required, approval_status, approval_level`.
  **Confirmado: `requested_by` e `created_by` NÃO são selecionados.**
- `:83-89` — SELECT da cotação vencedora traz
  `id, purchase_request_id, is_selected, total_amount`. Sem `updated_by`/`created_by`,
  isto é, sem quem *selecionou* a cotação.
- `:124-137` — `assertCanDecidePurchaseApprovalLevel` valida **nível de alçada**
  (administrativa vs diretoria) — não identidade.
- `:139-155` — chama a RPC com `p_decided_by: context.session.user.id`. Nenhuma comparação
  com o solicitante em nenhum ponto do handler.

**Banco** — `supabase/migrations/079_purchase_decision_rpc.sql`:

- `p_decided_by uuid` (`:12`), usado em `:48`, `:50`, `:82`, `:92`, `:94`, `:115`.
- **Confirmado: a RPC não lê `requested_by` e não faz nenhuma comparação de identidade.**
  Não há trava de segregação no banco.

**Coluna existente** — `supabase/migrations/013_purchase_module_base.sql:54`:
`requested_by uuid references public.app_users(id) on delete set null`, com índice em `:284`.
A coluna existe e é o alvo natural da comparação.

**Conclusão:** a autoaprovação é possível hoje ponta a ponta. Quem tem
`PURCHASES:approvals.decide*` e criou a solicitação pode aprová-la sozinho, dentro da
alçada dele.

---

## 1. Decisões que preciso de você

**(a) Super admin é exceção?**
Recomendação: **não**. Segregação de função é controle contábil/de auditoria, não de
privilégio — um super admin que se autoaprova é exatamente o cenário que o controle existe
para impedir. Se você quiser a exceção (ex.: operação de unidade única com um só usuário),
ela deve ser **explícita e auditada** (evento com `metadata.self_approval_override: true`),
nunca silenciosa.

**(b) O bloqueio vale só para o solicitante, ou também para quem selecionou a cotação?**
O enunciado do achado inclui "selecionador". A coluna que identifica quem selecionou é
`purchase_quotes.updated_by` da cotação com `is_selected=true` — que é **mutável** e pode
refletir uma edição posterior qualquer, não o ato de selecionar. Não é fonte confiável.
Recomendação: **fatia 1 bloqueia apenas `requested_by`** (fonte estável, indexada). Se
quiser incluir o selecionador, precisamos primeiro de um campo dedicado
(`selected_by`/`selected_at` em `purchase_quotes`, gravado no ato da seleção) — isso é
**migration + mudança na rota de cotações** e vira fatia própria, encadeada com o #7 (que já
vai mexer nessa rota).

**(c) A trava vive na rota, na RPC, ou nas duas?**
Recomendação: **nas duas**. A RPC é a única barreira real (service_role ignora RLS; qualquer
caller da RPC passa). A rota dá a mensagem de erro boa (409/403 legível). Padrão já usado
no projeto: a RPC valida invariantes (`PURCHASE_ALREADY_DECIDED`,
`PURCHASE_SNAPSHOT_NOT_PENDING`) e a rota traduz (`:157-168`).

---

## 2. Arquivos afetados

| Arquivo | Mudança |
|---|---|
| `src/app/api/purchases/approvals/[requestId]/decision/route.ts` `:57-59` | acrescentar `requested_by, created_by` ao SELECT |
| idem, após `:81` | novo guard de segregação, antes da checagem de alçada |
| idem `:157-168` | traduzir novo código de erro da RPC |
| `supabase/migrations/0NN_purchase_decision_self_approval_guard.sql` (**novo, você aplica**) | trava na RPC |
| `tests/unit/` | teste do predicado |

---

## 3. Diff conceitual

### 3.1 Rota

```ts
// tipo PurchaseRequestRow
+ requested_by: string | null;
+ created_by: string | null;

// :57-59
- .select("id, organization_id, unit_id, status, request_number, total_approved_amount, approval_required, approval_status, approval_level")
+ .select("id, organization_id, unit_id, status, request_number, total_approved_amount, approval_required, approval_status, approval_level, requested_by, created_by")

// apos :81 (ja validado que ha decisao pendente), antes da alcada:
+ // Segregacao de funcao: quem pede nao decide. Sem excecao para super admin (decisao (a)).
+ if (isSelfApproval(purchaseRequest, context.session.user.id)) {
+   return apiError(
+     "Voce nao pode decidir uma compra que voce mesmo solicitou. Encaminhe a outro aprovador.",
+     403
+   );
+ }
```

com o predicado puro:

```ts
export function isSelfApproval(
  request: { requested_by: string | null; created_by: string | null },
  actorId: string
) {
  return request.requested_by === actorId || request.created_by === actorId;
}
```

Incluir `created_by` além de `requested_by` cobre o caso de `requested_by` nulo
(`on delete set null`, ou registro legado) em que `created_by` ainda identifica o autor.

### 3.2 RPC (migration nova — **entregue como `.sql`, aplicada por você**)

Dentro de `purchase_apply_approval_decision`, após carregar a solicitação e antes de
qualquer `update`:

```sql
if v_request.requested_by is not null and v_request.requested_by = p_decided_by then
  raise exception 'PURCHASE_SELF_APPROVAL_FORBIDDEN';
end if;

if v_request.created_by is not null and v_request.created_by = p_decided_by then
  raise exception 'PURCHASE_SELF_APPROVAL_FORBIDDEN';
end if;
```

seguindo a convenção de sentinelas em string já usada (`PURCHASE_REQUEST_NOT_FOUND`,
`PURCHASE_ALREADY_DECIDED`) e traduzida na rota:

```ts
+ if (rpcError.message.includes("PURCHASE_SELF_APPROVAL_FORBIDDEN")) {
+   return apiError("Voce nao pode decidir uma compra que voce mesmo solicitou.", 403);
+ }
```

A migration é um `create or replace function` da RPC inteira, partindo do texto exato de
`079_purchase_decision_rpc.sql` com o bloco inserido — nada mais alterado.

---

## 4. Casos de borda

1. **Solicitante ≠ decisor** → inalterado.
2. **Solicitante = decisor** → 403 na rota; se alguém chamar a RPC direto, exceção no banco.
3. **`requested_by` nulo (usuário deletado)** → `created_by` cobre; se ambos nulos, **não
   bloqueia** (não há a quem atribuir). Registrado: é uma brecha residual aceita — bloquear
   sem saber quem pediu impediria decisões legítimas de registros legados.
4. **Solicitação criada por um usuário e "reassumida" por outro** → o campo é `requested_by`
   original; a trava segue o autor formal. Correto para auditoria.
5. **Devolução para Compras (`returned_to_purchases`)** → **também bloqueada**. Devolver a
   própria solicitação é menos grave, mas é o mesmo ato de decisão e usa a mesma RPC.
   Se você quiser liberar só esse caso, diga — é um `if` a mais.
6. **Solicitações já decididas antes do fix** → não são reprocessadas; a trava só afeta
   decisões novas.
7. **Backfill:** nenhum. A migration não altera dados.

---

## 5. Verificação prévia obrigatória (Fase B, antes do fix)

Consulta de impacto, para você rodar/eu preparar: quantas aprovações **já registradas** têm
`approval_decided_by = requested_by`. Se o número for alto, isso é (i) um achado de
auditoria por si só e (ii) sinal de que alguma unidade opera com um único usuário — o que
muda a decisão (a).

---

## 6. Critério de aceite

- [ ] lint / build / test:unit passam.
- [ ] Teste do predicado cobre casos 1-3 e falharia sem o fix.
- [ ] `.sql` entregue, **não aplicado**.
- [ ] Rota e RPC concordam na semântica.

---

## 7. O que NÃO muda

- `assertCanDecidePurchaseApprovalLevel` e a lógica de alçada — intocados.
- `assertPendingPurchaseApprovalSnapshot` e o dossiê formal — intocados.
- Ordem das validações existentes (`approval_required`, já-decidida, cotação vencedora)
  preservada; o guard novo entra **depois** delas para não mudar códigos de erro atuais.
- Estrutura de tabelas: nenhuma coluna nova nesta fatia.
- `permissions.ts`, `hr/api-auth.ts` — não tocados.
