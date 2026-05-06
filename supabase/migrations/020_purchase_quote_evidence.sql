-- AUDIT-COTACOES-1-B - Origem e evidencia da cotacao.
-- Fortalece a auditoria de cotacoes sem exigir que toda proposta tenha PDF formal.

alter table public.purchase_quotes
  add column if not exists quote_source_type text,
  add column if not exists evidence_type text,
  add column if not exists evidence_confidence text,
  add column if not exists source_contact_name text,
  add column if not exists source_contact_channel text,
  add column if not exists source_reference text,
  add column if not exists source_url text,
  add column if not exists source_notes text,
  add column if not exists evidence_missing_reason text,
  add column if not exists requires_attachment boolean not null default false,
  add column if not exists requires_justification boolean not null default false,
  add column if not exists has_formal_evidence boolean not null default true,
  add column if not exists is_verbal_quote boolean not null default false,
  add column if not exists is_emergency_quote boolean not null default false,
  add column if not exists emergency_reason text,
  add column if not exists regularization_required boolean not null default false,
  add column if not exists regularization_deadline date;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'purchase_quotes_source_type_check'
      and conrelid = 'public.purchase_quotes'::regclass
  ) then
    alter table public.purchase_quotes
      add constraint purchase_quotes_source_type_check
      check (
        quote_source_type is null
        or quote_source_type in (
          'formal_proposal',
          'email',
          'whatsapp',
          'phone_call',
          'in_person',
          'website_catalog',
          'recurring_supplier',
          'emergency',
          'other'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'purchase_quotes_evidence_type_check'
      and conrelid = 'public.purchase_quotes'::regclass
  ) then
    alter table public.purchase_quotes
      add constraint purchase_quotes_evidence_type_check
      check (
        evidence_type is null
        or evidence_type in (
          'attached_file',
          'email_copy',
          'whatsapp_screenshot',
          'call_note',
          'in_person_note',
          'catalog_link',
          'none',
          'other'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'purchase_quotes_evidence_confidence_check'
      and conrelid = 'public.purchase_quotes'::regclass
  ) then
    alter table public.purchase_quotes
      add constraint purchase_quotes_evidence_confidence_check
      check (
        evidence_confidence is null
        or evidence_confidence in ('high', 'medium', 'low', 'critical')
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'purchase_quotes_source_contact_channel_check'
      and conrelid = 'public.purchase_quotes'::regclass
  ) then
    alter table public.purchase_quotes
      add constraint purchase_quotes_source_contact_channel_check
      check (
        source_contact_channel is null
        or source_contact_channel in ('email', 'whatsapp', 'phone', 'in_person', 'website', 'other')
      );
  end if;
end;
$$;

comment on column public.purchase_quotes.quote_source_type is
  'Origem/canal da cotacao: proposta formal, email, WhatsApp, ligacao, presencial, catalogo/site, fornecedor recorrente, emergencia ou outro.';
comment on column public.purchase_quotes.evidence_type is
  'Tipo de evidencia que sustenta a cotacao: anexo, copia de email, print de WhatsApp, nota de ligacao, nota presencial, link de catalogo, nenhuma ou outra.';
comment on column public.purchase_quotes.evidence_confidence is
  'Nivel de confiabilidade da evidencia: high, medium, low ou critical.';
comment on column public.purchase_quotes.evidence_missing_reason is
  'Justificativa obrigatoria na aplicacao quando nao houver evidencia formal.';
comment on column public.purchase_quotes.requires_attachment is
  'Flag de auditoria indicando que a cotacao deveria possuir anexo complementar.';
comment on column public.purchase_quotes.requires_justification is
  'Flag de auditoria indicando necessidade de justificativa por fragilidade da evidencia.';
comment on column public.purchase_quotes.has_formal_evidence is
  'Indica se a cotacao possui evidencia formal suficiente no momento do registro.';
comment on column public.purchase_quotes.regularization_required is
  'Indica necessidade de regularizacao documental posterior.';
