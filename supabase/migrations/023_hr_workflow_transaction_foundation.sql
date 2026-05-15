-- RH-6C - Fundacao transacional minima para a workflow engine de RH.
-- Esta migration nao implementa endpoints nem a RPC da engine.

create table if not exists public.hr_workflow_idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  unit_id uuid not null references public.units(id) on delete restrict,
  workflow_id uuid references public.hr_workflows(id) on delete restrict,
  actor_user_id uuid not null references public.app_users(id) on delete restrict,
  action text not null,
  idempotency_key text not null,
  request_hash text not null,
  status text not null default 'processing',
  response_snapshot jsonb,
  error_snapshot jsonb,
  expires_at timestamptz not null default (now() + interval '48 hours'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hr_workflow_idempotency_keys_action_check check (
    action in (
      'create_workflow',
      'execute_step',
      'approve_step',
      'return_step',
      'cancel_workflow'
    )
  ),
  constraint hr_workflow_idempotency_keys_workflow_required_check check (
    action = 'create_workflow'
    or workflow_id is not null
  ),
  constraint hr_workflow_idempotency_keys_key_not_blank check (
    btrim(idempotency_key) <> ''
    and length(btrim(idempotency_key)) <= 160
  ),
  constraint hr_workflow_idempotency_keys_request_hash_check check (
    request_hash ~ '^[a-f0-9]{64}$'
  ),
  constraint hr_workflow_idempotency_keys_status_check check (
    status in ('processing', 'completed', 'failed')
  ),
  constraint hr_workflow_idempotency_keys_response_object_check check (
    response_snapshot is null
    or jsonb_typeof(response_snapshot) = 'object'
  ),
  constraint hr_workflow_idempotency_keys_error_object_check check (
    error_snapshot is null
    or jsonb_typeof(error_snapshot) = 'object'
  ),
  constraint hr_workflow_idempotency_keys_snapshot_status_check check (
    (
      status = 'processing'
      and response_snapshot is null
      and error_snapshot is null
    )
    or (
      status = 'completed'
      and response_snapshot is not null
      and error_snapshot is null
    )
    or (
      status = 'failed'
      and response_snapshot is null
      and error_snapshot is not null
    )
  ),
  constraint hr_workflow_idempotency_keys_expires_after_created_check check (
    expires_at > created_at
  ),
  constraint hr_workflow_idempotency_keys_snapshot_lgpd_check check (
    lower(
      coalesce(response_snapshot::text, '')
      || ' '
      || coalesce(error_snapshot::text, '')
    ) not like '%file_path%'
    and lower(
      coalesce(response_snapshot::text, '')
      || ' '
      || coalesce(error_snapshot::text, '')
    ) not like '%signed_url%'
    and lower(
      coalesce(response_snapshot::text, '')
      || ' '
      || coalesce(error_snapshot::text, '')
    ) not like '%signedurl%'
    and lower(
      coalesce(response_snapshot::text, '')
      || ' '
      || coalesce(error_snapshot::text, '')
    ) not like '%storage_path%'
    and lower(
      coalesce(response_snapshot::text, '')
      || ' '
      || coalesce(error_snapshot::text, '')
    ) not like '%createsignedurl%'
    and lower(
      coalesce(response_snapshot::text, '')
      || ' '
      || coalesce(error_snapshot::text, '')
    ) not like '%download_url%'
    and lower(
      coalesce(response_snapshot::text, '')
      || ' '
      || coalesce(error_snapshot::text, '')
    ) not like '%public_url%'
    and lower(
      coalesce(response_snapshot::text, '')
      || ' '
      || coalesce(error_snapshot::text, '')
    ) not like '%document_number%'
    and lower(
      coalesce(response_snapshot::text, '')
      || ' '
      || coalesce(error_snapshot::text, '')
    ) not like '%salary%'
    and lower(
      coalesce(response_snapshot::text, '')
      || ' '
      || coalesce(error_snapshot::text, '')
    ) not like '%medical%'
    and (
      coalesce(response_snapshot::text, '')
      || ' '
      || coalesce(error_snapshot::text, '')
    ) !~* '(^|[^a-z0-9_])cpf([^a-z0-9_]|$)'
    and (
      coalesce(response_snapshot::text, '')
      || ' '
      || coalesce(error_snapshot::text, '')
    ) !~* '(^|[^a-z0-9_])rg([^a-z0-9_]|$)'
    and (
      coalesce(response_snapshot::text, '')
      || ' '
      || coalesce(error_snapshot::text, '')
    ) !~* '(^|[^a-z0-9_])cid([^a-z0-9_]|$)'
  )
);

create unique index if not exists hr_workflow_idempotency_keys_unique_idx
  on public.hr_workflow_idempotency_keys (
    organization_id,
    actor_user_id,
    action,
    idempotency_key
  );

create index if not exists hr_workflow_idempotency_keys_organization_idx
  on public.hr_workflow_idempotency_keys (organization_id);
create index if not exists hr_workflow_idempotency_keys_unit_idx
  on public.hr_workflow_idempotency_keys (unit_id);
create index if not exists hr_workflow_idempotency_keys_workflow_idx
  on public.hr_workflow_idempotency_keys (workflow_id);
create index if not exists hr_workflow_idempotency_keys_actor_idx
  on public.hr_workflow_idempotency_keys (actor_user_id);
create index if not exists hr_workflow_idempotency_keys_action_idx
  on public.hr_workflow_idempotency_keys (action);
create index if not exists hr_workflow_idempotency_keys_status_idx
  on public.hr_workflow_idempotency_keys (status);
create index if not exists hr_workflow_idempotency_keys_expires_at_idx
  on public.hr_workflow_idempotency_keys (expires_at);
create index if not exists hr_workflow_idempotency_keys_status_expires_at_idx
  on public.hr_workflow_idempotency_keys (status, expires_at);
create index if not exists hr_workflow_idempotency_keys_created_at_idx
  on public.hr_workflow_idempotency_keys (created_at);

alter table public.hr_workflow_idempotency_keys enable row level security;

-- Nao adicionar write_audit_trail() nesta tabela: snapshots copiados como
-- old/new completos aumentariam a superficie LGPD da idempotencia.
do $$
begin
  if to_regprocedure('public.update_updated_at_column()') is null then
    raise notice 'Funcao public.update_updated_at_column() nao encontrada. Trigger de updated_at nao foi criado para idempotencia de workflows de RH.';
    return;
  end if;

  drop trigger if exists set_updated_at_hr_workflow_idempotency_keys on public.hr_workflow_idempotency_keys;
  create trigger set_updated_at_hr_workflow_idempotency_keys
    before update on public.hr_workflow_idempotency_keys
    for each row execute function public.update_updated_at_column();
end;
$$;

comment on table public.hr_workflow_idempotency_keys is
  'Controle persistido de idempotencia para mutacoes futuras da workflow engine de RH. Usado para duplo clique, retry HTTP e replay seguro.';
comment on column public.hr_workflow_idempotency_keys.workflow_id is
  'Workflow associado a acao idempotente. Pode ser nulo durante create_workflow antes da criacao efetiva do workflow.';
comment on column public.hr_workflow_idempotency_keys.action is
  'Acao mutavel controlada: create_workflow, execute_step, approve_step, return_step ou cancel_workflow.';
comment on column public.hr_workflow_idempotency_keys.idempotency_key is
  'Chave opaca enviada pelo cliente para tornar retries da mesma acao seguros.';
comment on column public.hr_workflow_idempotency_keys.request_hash is
  'Hash SHA-256 canonico do payload validado pelo backend. Mesma chave com hash diferente deve ser tratada como conflito.';
comment on column public.hr_workflow_idempotency_keys.status is
  'Estado do processamento idempotente: processing, completed ou failed. failed e tecnico e so deve ser usado quando a engine preservar a idempotencia sem persistir mutacao parcial de negocio.';
comment on column public.hr_workflow_idempotency_keys.response_snapshot is
  'Snapshot tecnico minimo de sucesso. Nao deve conter metadata sensivel, file_path, signed_url, storage_path ou payload bruto.';
comment on column public.hr_workflow_idempotency_keys.error_snapshot is
  'Snapshot tecnico minimo e redigido de erro. Dados de negocio devem sofrer rollback total; nao armazenar payload sensivel, file_path, signed_url, storage_path ou dados pessoais brutos.';
comment on column public.hr_workflow_idempotency_keys.expires_at is
  'Prazo de retencao da chave idempotente. Cleanup futuro deve remover registros expirados sem cron nesta migration.';
