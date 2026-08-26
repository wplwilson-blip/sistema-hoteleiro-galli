# 62 — Plano: quem selecionou a vencedora não aprova a compra

Status: **Fase A — plano para revisão. Nenhum código escrito.**
Sensibilidade: **ALTA** — segregação de função na aprovação. `docs/NAO_ALTERAR.md` cobre "Regra de aprovação por alçada", "Status de aprovação", "Histórico de decisões".
Continua: achado #3 (plano 50, `isPurchaseSelfApproval`) e fatia #7 (migration 082, coluna `selected_by`).
Não muda: a regra da #3, a alçada (fatia 59), o fluxo de cotação vencedora.

---

## 1. A lacuna

A decisão de aprovação hoje bloqueia **um** conflito de interesse: quem criou a solicitação não a aprova.

[decision/route.ts:149-158](../../src/app/api/purchases/approvals/[requestId]/decision/route.ts#L149-L158):

```
if (isPurchaseSelfApproval({
      requestedBy: purchaseRequest.requested_by,
      actorId: context.session.user.id,
      decision: payload.decision
    })) {
  return apiError("Você não pode aprovar uma solicitação que você mesmo criou.", 403);
}
```

O segundo conflito não é checado. Quem **escolhe o fornecedor vencedor** decide para onde o dinheiro vai — e hoje pode aprovar a própria escolha, desde que não tenha sido quem abriu a solicitação. Em Compras esse é o papel com mais poder discricionário sobre o resultado: a solicitação diz "preciso de X"; a seleção diz "compro de Y, por Z".

O dado para fechar isso **já existe e já é gravado**. A migration [082](../../supabase/migrations/082_purchase_quote_selected_by.sql) criou `purchase_quotes.selected_by` / `selected_at`, preenchidos no ato da seleção pela RPC `purchase_set_quote_selection` ([083](../../supabase/migrations/083_purchase_quote_mutation_rpcs.sql), gravação em `:186`, limpeza em `:176`/`:194`/`:375`). O comentário da própria 082 antecipa esta fatia: *"Base para a segregacao selecionador != aprovador"*.

**Ou seja: nenhuma migration nova. O enforcement é a única peça que falta.**

### 1.1 A rota já carrega a cotação vencedora — só não lê a coluna

[decision/route.ts:85-91](../../src/app/api/purchases/approvals/[requestId]/decision/route.ts#L85-L91):

```
.from("purchase_quotes")
.select("id, purchase_request_id, is_selected, total_amount")
.eq("purchase_request_id", purchaseRequest.id)
.eq("is_selected", true)
```

Não há query nova a fazer: basta acrescentar `selected_by` ao `select` existente. Custo zero de I/O — igual ao que a #3 fez ao acrescentar `requested_by` ao select da solicitação.

---

## 2. Mudança proposta

### 2.1 O predicado (irmão do `isPurchaseSelfApproval`)

Em [src/lib/purchases/approval-segregation.ts](../../src/lib/purchases/approval-segregation.ts), mesmo arquivo, mesmo estilo: puro, sem I/O, sem `server-only`, testável no runner puro.

```
export function isPurchaseSelfSelectionApproval(input: {
  selectedBy: string | null | undefined;
  actorId: string;
  decision: PurchaseApprovalDecision;
}): boolean {
  if (input.decision !== "approved") return false;
  if (!input.selectedBy) return false;
  return input.selectedBy === input.actorId;
}
```

As quatro decisões de produto da #3 são **herdadas sem exceção**, porque o raciocínio é o mesmo:

| Regra | Aplicada aqui | Por quê |
| --- | --- | --- |
| Bloqueia só `decision === "approved"` | sim | reprovar e devolver para Compras não são vetor de fraude; travar geraria atrito |
| Sem exceção para super admin | sim (ver item 4) | é controle de auditoria, não de privilégio |
| Campo nulo não bloqueia | sim | `selected_by` NULL é legado (082 não fez backfill) ou usuário removido (`on delete set null`); sem saber quem selecionou, não dá para afirmar o conflito |
| Trava só na rota | sim | a RPC de decisão tem chamador único e a migration 079 revoga `execute` de `public`/`anon`/`authenticated` |

### 2.2 O guard na rota

Logo abaixo do guard existente, mesma forma e mesmo status:

```
if (isPurchaseSelfSelectionApproval({
      selectedBy: winningQuote.selected_by,
      actorId: context.session.user.id,
      decision: payload.decision
    })) {
  return apiError("Você não pode aprovar uma compra cuja cotação vencedora você mesmo selecionou.", 403);
}
```

**Posição:** depois do `isPurchaseSelfApproval` e depois de `assertCanDecidePurchaseApprovalLevel` — a mensagem mais específica (falta de autoridade na alçada) continua vindo antes da mais genérica.

**Padrão-ouro `api-auth.ts`:** o guard entra depois de `requirePermission`, opera sobre dado carregado do banco (nunca do corpo da requisição) e devolve 403 com mensagem que explica o motivo sem vazar identidade de terceiros.

### 2.3 A herança do comentário

O bloco de comentário de `:145-151` da rota — que documenta por que a trava vive só ali e o que aconteceria com um segundo chamador da RPC — passa a cobrir os dois guards, com o alerta explícito de que **um efetivador de cron ou qualquer segundo chamador não estaria coberto por nenhum dos dois**.

---

## 3. Consulta de impacto (rodar ANTES de ligar)

Mesmo procedimento da #3: medir quantas decisões o guard bloquearia, antes de ligá-lo. Entregue como `.sql` para você rodar — **eu não aplico nada no banco**.

Arquivo: `docs/codex/62-consulta-impacto.sql` (na Fase B; o conteúdo é este).

```sql
-- (1) PENDENTES que o guard bloquearia HOJE, se o selecionador tentasse aprovar.
--     Nao ha' "aprovador designado" no schema: o guard so' dispara se QUEM decidir for
--     quem selecionou. Esta consulta lista o universo em risco, com o selecionador.
select
  r.request_number,
  r.approval_status,
  r.approval_level,
  r.total_approved_amount,
  sel.username    as selecionou,
  req.username    as solicitou,
  (q.selected_by = r.requested_by) as selecionador_e_solicitante
from public.purchase_requests r
join public.purchase_quotes q
  on q.purchase_request_id = r.id
 and q.is_selected = true
 and q.deleted_at is null
left join public.app_users sel on sel.id = q.selected_by
left join public.app_users req on req.id = r.requested_by
where r.deleted_at is null
  and r.approval_status = 'pending'
order by r.created_at desc;

-- (2) Quanto do legado tem selected_by NULL (nao bloqueia, por decisao).
select
  count(*)                                        as vencedoras_total,
  count(*) filter (where q.selected_by is null)   as sem_selecionador,
  count(*) filter (where q.selected_by is not null) as com_selecionador
from public.purchase_quotes q
join public.purchase_requests r on r.id = q.purchase_request_id and r.deleted_at is null
where q.is_selected = true and q.deleted_at is null;

-- (3) HISTORICO: decisoes ja' tomadas em que o aprovador foi o selecionador.
--     Mede o tamanho real do conflito que passou. Se vier > 0, e' achado de auditoria
--     por si so' — nao muda o plano, mas voce precisa saber antes de ligar o guard.
select
  r.request_number,
  r.approval_status,
  r.total_approved_amount,
  dec.username as decidiu,
  sel.username as selecionou
from public.purchase_requests r
join public.purchase_quotes q
  on q.purchase_request_id = r.id and q.is_selected = true and q.deleted_at is null
left join public.app_users dec on dec.id = r.approval_decided_by
left join public.app_users sel on sel.id = q.selected_by
where r.deleted_at is null
  and r.approval_status in ('approved', 'rejected')
  and q.selected_by is not null
  and r.approval_decided_by = q.selected_by
order by r.created_at desc;
```

**Ponto a confirmar na Fase B:** o nome real da coluna de quem decidiu (`approval_decided_by` na consulta 3) precisa ser conferido no schema antes de eu entregar o `.sql` — se divergir, ajusto. Não vou entregar SQL que você rode e quebre.

**Leitura do resultado:**
- consulta (1) grande + poucas pessoas na coluna `selecionou` → o guard vai travar operação real; talvez precise de um segundo aprovador habilitado antes de ligar;
- consulta (2) com muitos NULL → o guard nasce cobrindo pouco, e a cobertura cresce naturalmente conforme novas seleções gravam o campo;
- consulta (3) > 0 → houve aprovação da própria seleção; é o argumento a favor de ligar, e um dado que você vai querer levar para a Diretoria.

---

## 4. Super admin: NÃO é exceção (recomendo, e concordo com você)

Sua inclinação está certa e eu subscrevo — com o argumento explícito:

1. **Coerência com a #3.** Aquele plano registrou "SEM excecao para super admin: e' controle de auditoria, nao de privilegio", e o predicado nem conhece o conceito. Abrir exceção aqui criaria duas regras diferentes para o mesmo tipo de controle, no mesmo arquivo.
2. **A exceção destruiria o controle.** Super admin é justamente quem tem permissão para selecionar vencedora **e** para aprovar. Isentá-lo isenta exatamente o perfil que a regra existe para conter.
3. **Não trava ninguém de verdade.** O bloqueio é por *ato*, não por pessoa: o super admin continua podendo aprovar qualquer compra que ele não tenha selecionado, e continua podendo reprovar ou devolver **qualquer** uma, inclusive as que selecionou. A saída sempre existe.
4. **O predicado permanece burro de propósito.** Ele não recebe perfil nem permissões — só `selectedBy`, `actorId` e `decision`. Isso é o que o mantém testável e auditável.

**Registrado no plano como decisão pendente da sua palavra final.** Se você quiser a exceção, ela **não** entra no predicado: entraria como um `if` explícito e comentado na rota, para ficar visível na leitura e no diff. Não escondo exceção de controle dentro de função pura.

---

## 5. Testes

Arquivo: `tests/unit/approval-segregation.spec.ts` (o mesmo da #3, estendido — mesma matriz, mesmo estilo).

1. **Bloqueia:** `selectedBy === actorId` e `decision === "approved"` → `true`.
2. **Só approved:** o mesmo par com `rejected` e `returned_to_purchases` → `false` nos dois.
3. **Nulo não bloqueia:** `selectedBy` `null` e `undefined`, com qualquer decisão → `false` (o legado sem backfill da 082).
4. **Pessoa diferente:** `selectedBy !== actorId` → `false` em todas as decisões.
5. **Independência dos dois guards:** matriz de 4 combinações (é solicitante × é selecionador) × 3 decisões, provando que os predicados não interferem entre si e que aprovar exige **não ser nenhum dos dois**.
6. **Regressão da #3:** os casos existentes de `isPurchaseSelfApproval` continuam passando sem alteração.

Portões de sempre: `npm run lint`, `npm run build`, `npm run test:unit`.

**Só verificável na tela / com banco:** o 403 real chegando ao aprovador, e a mensagem exibida na tela de aprovação. Não há como cobrir no runner puro.

---

## 6. Risco e reversão

- **Direção do risco:** o guard só **impede** aprovações — nunca permite nenhuma que hoje seja negada. Não afrouxa nada.
- **Risco operacional real:** se hoje uma única pessoa seleciona e aprova (equipe pequena), o guard **para o fluxo**. É exatamente o que a consulta (1) mede. Se ela mostrar concentração numa pessoa, a decisão de ligar deixa de ser técnica e passa a ser sua — pode exigir habilitar um segundo aprovador antes.
- **Nada é recalculado:** decisões já tomadas não são revisitadas; o guard vale da ativação em diante.
- **Reversão:** remover o `if` da rota. Sem banco envolvido, rollback puramente de código.

---

## 7. Invariantes

| Invariante | Como fica |
| --- | --- |
| Não muda a #3 | `isPurchaseSelfApproval` fica intocado, teste incluso |
| Não muda a alçada | nada de `getPurchaseApprovalLevel`, snapshot ou `approval_level` |
| Sem migration | `selected_by`/`selected_at` já existem (082) e já são gravados (083) |
| Sem query nova | `selected_by` entra no `select` que a rota já faz (`:86`) |
| `docs/NAO_ALTERAR.md` | é área sensível; por isso plano antes de código, consulta de impacto antes de ligar, e a sua palavra sobre o super admin |

---

## 8. Decisões que preciso antes da Fase B

1. **Super admin sem exceção** — confirma? (recomendo sim, por coerência com a #3)
2. **Rodar a consulta de impacto antes do código, ou entregar código e consulta juntos** para você medir e só então mergear? Recomendo a segunda: o `.sql` sai junto do diff e o merge fica condicionado ao que ele mostrar.
3. **Se a consulta (3) apontar aprovações da própria seleção já ocorridas**, você quer que isso vire achado formal em `docs/codex/` (como a 58), ou fica só na conversa?
