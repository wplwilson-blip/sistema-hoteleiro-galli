-- ============================================================================
-- Consulta de impacto — plano 62 (segregacao: selecionador != aprovador)
--
-- RODAR ANTES DE MERGEAR. Nao altera nada: sao tres SELECTs.
-- A decisao de ligar o guard depende do resultado da consulta (1).
--
-- Contexto: o guard novo em decision/route.ts impede que quem marcou a cotacao
-- vencedora (purchase_quotes.selected_by, migration 082) aprove a mesma compra.
-- Bloqueia SOMENTE decision = 'approved'; reprovar e devolver seguem liberados.
-- selected_by NULL (legado, sem backfill) nao bloqueia.
--
-- Coluna do decisor: purchase_requests.approval_decided_by (migration 015).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- (1) UNIVERSO EM RISCO: compras PENDENTES de aprovacao, com quem selecionou.
--
-- Nao existe "aprovador designado" no schema — o guard so' dispara se QUEM
-- decidir for quem selecionou. Entao o que da' para medir e' o universo: quais
-- compras estao pendentes e quem seria bloqueado se tentasse aprovar cada uma.
--
-- COMO LER: se a coluna `selecionou` se concentrar em uma ou duas pessoas que
-- tambem sao as que aprovam, o guard vai PARAR operacao real — e ai a decisao
-- de ligar deixa de ser tecnica. Pode exigir habilitar um segundo aprovador
-- antes do merge.
-- ----------------------------------------------------------------------------
select
  r.request_number,
  r.approval_status,
  r.approval_level,
  r.total_approved_amount,
  sel.username                             as selecionou,
  req.username                             as solicitou,
  (q.selected_by is not null
    and q.selected_by = r.requested_by)    as selecionador_e_solicitante,
  q.selected_at,
  r.created_at
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


-- ----------------------------------------------------------------------------
-- (2) COBERTURA DO GUARD: quantas vencedoras tem selecionador conhecido.
--
-- O guard so' age quando selected_by nao e' NULL. Esta consulta mede quanto do
-- estoque atual ele cobre — e quanto e' legado que passa livre por decisao.
--
-- COMO LER: `sem_selecionador` alto = o guard nasce cobrindo pouco. Isso NAO e'
-- problema: a cobertura cresce sozinha conforme novas selecoes gravam o campo.
-- E' so' para voce nao esperar um efeito imediato maior do que o real.
-- ----------------------------------------------------------------------------
select
  count(*)                                                          as vencedoras_total,
  count(*) filter (where q.selected_by is null)                     as sem_selecionador_legado,
  count(*) filter (where q.selected_by is not null)                 as com_selecionador,
  count(*) filter (where q.selected_by is not null
                     and r.approval_status = 'pending')             as com_selecionador_e_pendente
from public.purchase_quotes q
join public.purchase_requests r
  on r.id = q.purchase_request_id
 and r.deleted_at is null
where q.is_selected = true
  and q.deleted_at is null;


-- ----------------------------------------------------------------------------
-- (3) HISTORICO: aprovacoes JA' OCORRIDAS em que o aprovador foi o selecionador.
--
-- Mede o conflito que ja' passou. Restrito a approval_status = 'approved'
-- porque o guard so' bloqueia aprovacao — reprovacao pelo selecionador nunca
-- foi vetor de fraude e nao entra na conta.
--
-- COMO LER: qualquer linha aqui e' uma compra aprovada por quem escolheu o
-- fornecedor. Se vier > 0, e' achado de auditoria por si so' — nao muda o
-- plano tecnico, mas e' o argumento a favor de ligar o guard, e um dado que
-- provavelmente precisa subir para a Diretoria.
-- ----------------------------------------------------------------------------
select
  r.request_number,
  r.total_approved_amount,
  r.approval_level,
  r.approval_decided_at,
  dec.username as decidiu,
  sel.username as selecionou,
  req.username as solicitou,
  (r.approval_decided_by = r.requested_by) as decisor_e_solicitante
from public.purchase_requests r
join public.purchase_quotes q
  on q.purchase_request_id = r.id
 and q.is_selected = true
 and q.deleted_at is null
left join public.app_users dec on dec.id = r.approval_decided_by
left join public.app_users sel on sel.id = q.selected_by
left join public.app_users req on req.id = r.requested_by
where r.deleted_at is null
  and r.approval_status = 'approved'
  and q.selected_by is not null
  and r.approval_decided_by is not null
  and r.approval_decided_by = q.selected_by
order by r.approval_decided_at desc nulls last;
