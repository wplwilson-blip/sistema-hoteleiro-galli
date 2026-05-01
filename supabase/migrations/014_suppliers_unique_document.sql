create unique index if not exists suppliers_org_document_type_normalized_active_unique
  on public.suppliers (
    organization_id,
    document_type,
    (regexp_replace(coalesce(document_number, ''), '\D', '', 'g'))
  )
  where deleted_at is null
    and nullif(regexp_replace(coalesce(document_number, ''), '\D', '', 'g'), '') is not null;
