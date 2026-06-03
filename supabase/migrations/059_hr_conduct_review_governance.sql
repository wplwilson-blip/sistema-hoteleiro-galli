-- RH-21.2 - Revisao, evidencias e governanca de Conduta.
-- Cria trilha formal de revisao e evolui status de conduta sem alterar Auth, login ou outros modulos.

update public.employee_conduct_records
set status = case
  when status in ('active', 'resolved', 'archived') then 'reviewed'
  else status
end
where status in ('active', 'resolved', 'archived');

alter table public.employee_conduct_records
  alter column status set default 'draft';

alter table public.employee_conduct_records
  drop constraint if exists employee_conduct_records_status_check;

alter table public.employee_conduct_records
  add constraint employee_conduct_records_status_check check (
    status in ('draft', 'pending_review', 'reviewed', 'rejected', 'cancelled')
  );

create table if not exists public.employee_conduct_reviews (
  id uuid primary key default gen_random_uuid(),
  conduct_record_id uuid not null references public.employee_conduct_records(id) on delete cascade,
  action text not null,
  comments text,
  actor_user_id uuid,
  created_at timestamptz not null default now(),
  constraint employee_conduct_reviews_action_check check (
    action in ('submitted', 'approved', 'rejected', 'cancelled')
  ),
  constraint employee_conduct_reviews_comments_safe_check check (
    comments is null or comments !~* '(cpf|rg|ctps|pis|cid|diagnostico|diagnóstico|laudo|medical|medico|médico|file_path|storage_path|signed_url|token|senha|password|auth_email)'
  )
);

create index if not exists employee_conduct_reviews_record_idx
  on public.employee_conduct_reviews (conduct_record_id, created_at);

alter table public.employee_conduct_reviews enable row level security;

insert into public.permissions (code, description)
values
  ('HR:conduct.review', 'Revisar, aprovar e rejeitar registros de conduta')
on conflict (code) do nothing;

insert into public.role_permissions (role, permission_code)
select 'SUPER_ADMIN', permission.code
from public.permissions permission
where permission.code = 'HR:conduct.review'
on conflict (role, permission_code) do nothing;

comment on table public.employee_conduct_reviews is
  'Historico formal de revisao de registros de conduta e ocorrencias para RH-21.2.';

comment on constraint employee_conduct_records_status_check on public.employee_conduct_records is
  'Workflow formal de conduta: rascunho, revisao, revisado, rejeitado ou cancelado.';
