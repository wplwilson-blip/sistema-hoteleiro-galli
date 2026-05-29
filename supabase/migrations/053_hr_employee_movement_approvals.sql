-- RH-18.2 - Aprovacao e governanca de movimentacoes funcionais.
-- Cria historico formal de decisoes sem integrar com folha, ponto, financeiro ou eSocial.

create table if not exists public.employee_movement_approvals (
  id uuid primary key default gen_random_uuid(),
  movement_id uuid not null references public.employee_movements(id) on delete restrict,
  action text not null,
  comments text,
  actor_user_id uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint employee_movement_approvals_action_check check (
    action in ('submitted', 'approved', 'rejected', 'implemented')
  ),
  constraint employee_movement_approvals_comments_length_check check (
    comments is null or length(trim(comments)) <= 3000
  )
);

create index if not exists employee_movement_approvals_movement_idx on public.employee_movement_approvals (movement_id);
create index if not exists employee_movement_approvals_action_idx on public.employee_movement_approvals (action);
create index if not exists employee_movement_approvals_actor_idx on public.employee_movement_approvals (actor_user_id);
create index if not exists employee_movement_approvals_created_at_idx on public.employee_movement_approvals (created_at);

alter table public.employee_movement_approvals enable row level security;

do $$
begin
  if to_regprocedure('public.write_audit_trail()') is null then
    raise notice 'Funcao public.write_audit_trail() nao encontrada. Auditoria generica de aprovacoes de movimentacao devera ser adicionada em migration futura.';
    return;
  end if;

  drop trigger if exists audit_employee_movement_approvals on public.employee_movement_approvals;
  create trigger audit_employee_movement_approvals
    after insert or update or delete on public.employee_movement_approvals
    for each row execute function public.write_audit_trail();
end;
$$;

comment on table public.employee_movement_approvals is
  'Historico formal de governanca de movimentacoes funcionais: envio, aprovacao, rejeicao e efetivacao.';
comment on column public.employee_movement_approvals.action is
  'Acao registrada: submitted, approved, rejected ou implemented.';
comment on column public.employee_movement_approvals.comments is
  'Comentario administrativo da decisao. Rejeicao exige motivo pela API.';
