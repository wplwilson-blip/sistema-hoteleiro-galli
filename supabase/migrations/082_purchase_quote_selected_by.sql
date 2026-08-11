-- Compras - Coluna dedicada para QUEM selecionou a cotacao vencedora.
--
-- Motivacao (auditoria, achado #3 -> deferido para #7): a segregacao de funcao precisa
-- saber quem marcou a cotacao como vencedora. `updated_by` NAO serve: e' mutavel e passa a
-- refletir qualquer edicao posterior da cotacao, nao o ato de selecionar.
--
-- `selected_by` e' gravada no ATO da selecao (RPC purchase_set_quote_selection, migration
-- 083) e limpa ao desmarcar/cancelar. Reflete sempre a selecao VIGENTE, nunca historico —
-- o historico completo vive em purchase_request_events.
--
-- SEM backfill: cotacoes ja selecionadas ficam com selected_by NULL (legado). O enforcement
-- da segregacao (fatia seguinte) tratara NULL como "nao bloqueia", mesma regra que a #3
-- adotou para requested_by nulo.
--
-- SEM indice: o uso previsto e' ler selected_by de uma cotacao ja carregada por id; nenhuma
-- consulta filtra por selecionador.
--
-- Idempotente: `add column if not exists` permite reaplicar.

alter table public.purchase_quotes
  add column if not exists selected_by uuid references public.app_users(id) on delete set null,
  add column if not exists selected_at timestamptz;

comment on column public.purchase_quotes.selected_by is
  'Quem marcou esta cotacao como vencedora, gravado no ATO da selecao (RPC purchase_set_quote_selection). NULL = legado ou cotacao nao selecionada. Base para a segregacao selecionador != aprovador. NAO usar updated_by para isso: e mutavel.';

comment on column public.purchase_quotes.selected_at is
  'Quando a cotacao foi marcada como vencedora. Limpa junto com selected_by ao desmarcar ou cancelar.';
