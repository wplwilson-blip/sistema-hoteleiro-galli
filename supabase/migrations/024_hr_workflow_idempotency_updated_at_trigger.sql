-- RH-6C.3 - Correcao versionada do trigger updated_at da idempotencia.
-- A migration 023 ja foi aplicada; esta migration corrige apenas o trigger ausente.

create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.hr_workflow_idempotency_keys') is null then
    raise exception 'Tabela public.hr_workflow_idempotency_keys nao encontrada. Aplique a migration 023 antes da 024.';
  end if;
end;
$$;

drop trigger if exists set_updated_at_hr_workflow_idempotency_keys
  on public.hr_workflow_idempotency_keys;

create trigger set_updated_at_hr_workflow_idempotency_keys
  before update on public.hr_workflow_idempotency_keys
  for each row
  execute function public.update_updated_at_column();

comment on trigger set_updated_at_hr_workflow_idempotency_keys
  on public.hr_workflow_idempotency_keys is
  'Atualiza updated_at automaticamente em updates da tabela de idempotencia dos workflows de RH.';
