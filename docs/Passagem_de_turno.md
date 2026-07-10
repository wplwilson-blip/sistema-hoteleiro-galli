# STATUS DO PROJETO — Passagem de turno

> Este arquivo é o "livro de passagem de turno": diz onde cada frente parou e a fila
> priorizada. O código real está no repositório (fonte da verdade); este arquivo diz
> ONDE OLHAR e O QUE JÁ FOI DECIDIDO. Manter curto e atualizado ao fim de cada entrega.

_Última atualização: [preencher data]_

---

## FECHADO (em `main`, aplicado nas duas pontas quando há migration)

- **RLS Fatia 1** — policies de unidade para RH ligado a empregado (migration 071, 27 policies).
- **RLS Fatia 2** — policies de unidade para recrutamento (migration 072, 21 policies).
- **RH-E-01** — efetivação de movimentação (transferência/promoção/depto) na data efetiva
  (migration 073 + `apply-due-movements.ts` + endpoint + GitHub Actions `hr-cron.yml`).
- **RH-E-05** — efetivação de desligamento na data efetiva + janela de cancelamento com
  justificativa (migration 075 + `apply-due-terminations.ts` + endpoint unificado
  `/api/hr/apply-due` que roda desligamento→movimentação).
- **CORE Fatia 1** — `requireCronAuth` (auth de máquina em tempo constante), aplicado nos
  dois efetivadores (`src/lib/cron/require-cron-auth.ts`).

## EM VOO (não fechado)

- **CORE Fatia 2 — runner/registry:** plano `docs/codex/28-plano-core-fatia2-runner.md`
  gerado pelo Code, **aguardando revisão**. Escopo aprovado: refatorar os 2 handlers
  (`processTrainingExpirationGovernance`, `processOccupationalExpirationGovernance`) para
  `(supabase, unitId, actorUserId)`, removendo `assertUnitInHrScope` interno; garantir
  escopo na rota manual; variante "system" de create/claim; runner `run-due-jobs.ts` com
  registry de 2 entradas; endpoint `/api/cron/run-jobs` protegido por `requireCronAuth`.
  **Risco a revisar:** provar que a rota manual NÃO perde escopo ao mover a checagem para
  fora do handler.

## FILA PRIORIZADA (meses até go-live → priorizar fundação e dependência)

1. **CORE Fatia 2** (runner/registry) — em voo, acima.
2. **CORE Fatia 3** — rename `hr_background_jobs → background_jobs` (migração de
   dependências, número 074 reservado). Ver `docs/codex/25`.
3. **RLS Fatia 3** (infra de workflow) + **Camada 2** (gate sensível no banco; absorve
   RH-D-01: admission/onboarding com PII sem gate). Fecha a dívida #2.
4. **RH-E-06** — automatizar vencimentos ASO/treinamento (depende da CORE Fatia 2).
5. **RH-E-07** — pendências documentais incluir inativo (compliance: não perder rescisão).
6. **RH-E-08** — isolamento da suíte E2E `apply-due` (flakiness por contaminação).
7. **Dívida técnica original restante:** #3 LGPD, #4 unidade ativa explícita,
   #5 middleware/rate limit, #6 refatorar componentes gigantes.
8. **RH-C-01** — roteiro de vaga travado no staging (config/dado, não RLS).
9. **Higiene git** — 4 branches de plano órfãos + confirmar docs soltos commitados.

## BLOQUEADOR DE GO-LIVE (fazer antes de qualquer dado real)

- **Trocar o `CRON_SECRET`** — o valor atual foi exposto em conversa. Regenerar (forte,
  aleatório, ≠ do `.env.e2e.local`) e atualizar em DOIS lugares: Vercel (env var Production)
  e GitHub (repository secret). O `hr-cron.yml` lê do secret.

## DÍVIDA DE PRODUTO (fora da fila técnica)

Tudo acima é back-office/infraestrutura. Os módulos operacionais (recepção, governança,
manutenção, A&B) ainda são placeholder — é o que aproxima do PMS (norte de longo prazo).
Decisão consciente em algum momento: continuar blindando back-office vs. começar a operação.

## LEMBRETES DE MÉTODO

- Rito de banco: migration → staging (validar) → produção (validar) → commit. Nunca as
  duas pontas divergem.
- Área sensível (auth, RLS, migration, trigger, transição de fluxo) = plano antes do código.
- Efetivadores rodam via service_role (RLS é defesa em profundidade, não o gate vivo hoje).
- Refs Supabase: staging `jascnmgagejlvjlenduv` / produção `chnamldrlwohaudmjrez`.

## RPC 079 — Decisão de aprovação de compra (transacional) — CONCLUÍDO

- Rota POST /api/purchases/approvals/[requestId]/decision agora usa uma única
  RPC transacional: public.purchase_apply_approval_decision (migration 079).
- Resolve: decisão fantasma/duplicada em purchase_approval_decisions e
  inconsistência compra↔dossiê sob concorrência ou falha parcial.
- Detalhes: CAS do snapshot (pending→decidido) como primeira escrita + lock
  FOR UPDATE na purchase_requests; approval_level derivado do próprio snapshot;
  autorização permanece 100% na rota. Erros mapeados via .includes()
  (PURCHASE_REQUEST_NOT_FOUND=404, ALREADY_DECIDED/SNAPSHOT_NOT_PENDING=409).
- Dois bugs pegos no smoke de staging e corrigidos na própria 079:
  1. cast text→enum faltando (status/from_status/to_status são
     purchase_request_status) → adicionado ::public.purchase_request_status.
  2. devolver (returned_to_purchases) violava o check da purchase_approval_decisions
     → insert de decisão passou a ocorrer só para approved/rejected.
- Branch: fix/purchase-decision-rpc (commit 87c78b0).
- Migration 079 APLICADA em staging E produção (create or replace).
- Smoke OK em staging (aprovar=1 decisão/rejected; devolver=0 decisão/quotation/
  returned_to_purchases; guard de dupla-decisão confirmado) e produção.
- PENDENTE: git merge --no-ff da branch para a main (ainda não mergeado).

## BUG ABERTO — Cotações não reexibe compra devolvida

- Ao devolver uma compra para Compras, o banco grava certo (status=quotation,
  snapshot=returned_to_purchases), mas a compra não reaparece na tela de Cotações.
- Suspeita: filtro de status da listagem de Cotações não considera compras que
  voltaram para quotation via devolução.
- NÃO relacionado à RPC 079. Investigar a query da tela de Cotações.
- Prioridade: depois do trigger de imutabilidade de cotação.

## Auditoria de Compras — 3 frentes CONCLUÍDAS e em produção

### 1. RPC 079 — decisão de aprovação transacional (main: 9364f6a)
- POST /api/purchases/approvals/[requestId]/decision agora usa a RPC única
  public.purchase_apply_approval_decision (migration 079).
- Resolve decisão fantasma/duplicada em purchase_approval_decisions e
  inconsistência compra↔dossiê sob concorrência ou falha parcial.
- CAS do snapshot como primeira escrita + lock FOR UPDATE na purchase_requests;
  approval_level derivado do snapshot; autorização permanece na rota; erros via
  .includes() (404/409/500).
- 2 bugs pegos no smoke e corrigidos na própria 079: cast text→enum
  (::public.purchase_request_status) e devolução (returned_to_purchases) só não
  gera linha de decisão formal (insert condicional a approved/rejected).
- Aplicada em staging e produção. Smoke OK nos dois.

### 2. Trigger 080 — imutabilidade de cotação em dossiê (main: 71a978b)
- Migration 080: função purchase_quote_in_active_dossier + trigger
  purchase_quote_dossier_lock (before update/delete) → PURCHASE_QUOTE_LOCKED_IN_DOSSIER.
- "Dossiê ativo" = snapshot_status in (pending, approved, rejected) e deleted_at null.
  returned_to_purchases e superseded NÃO travam (libera revisão após devolução).
- Detecta por selected_quote_id e pelo snapshot_payload (jsonb_path_exists).
- Fecha o buraco do bulk-clear do "selecionar nova vencedora" que mexia na
  vencedora anterior congelada. Trava de aplicação (assertQuoteIsNotInFormalDossier)
  permanece como 1ª linha de defesa.
- Aplicada em staging e produção. Smoke OK nos dois (update barrado, JSONPath provado).

### 3. Escopo de unidade em Aprovações (main: 31bf2de) — PURO CÓDIGO, sem migration
- permissions.ts: estreitamento active-unit passa a respeitar visão de rede —
  NÃO estreita para Super Admin nem NETWORK_MANAGER (hasNetworkScope reusa os links
  já carregados, sem query nova). hasPermission continua sobre a UNIÃO (autorização
  intacta). Nova constante NETWORK_MANAGER_PROFILE_CODE em session.ts.
- approvals/route.ts (listagem GET) passa a usar scope active-unit, alinhando
  Aprovações a Cotações/Solicitações/Documentation.
- Corrige a armadilha: decisor devolvia vendo a rede toda e a compra "sumia" da
  Cotações (que é por unidade ativa). Agora coerente.
- Smoke OK: Super Admin vê tudo; perfil de unidade vê só a ativa (troca no seletor).

## Esclarecido (NÃO era bug)
- Compra devolvida "sumindo" de Cotações era escopo de unidade (a compra era de
  outra unidade que não a ativa). Levou ao fix nº3. Não havia bug de filtro/cache.

## Pendências de higiene
- docs/codex/34-investigacao-lider-ve-nr.md: ainda untracked — decidir commit ou remoção.
- Senha temporária do macos.wilson (usada em teste): redefinir de volta.