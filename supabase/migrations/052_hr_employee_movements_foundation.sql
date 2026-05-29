-- RH-18.1 - Fundacao de Movimentacoes Funcionais.
-- Cria modulo operacional de carreira do colaborador.
-- Nao integra com folha, ponto, financeiro, eSocial ou atualizacao automatica de salario.

create table if not exists public.employee_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  unit_id uuid not null,
  employee_id uuid not null,
  movement_type text not null,
  status text not null default 'draft',
  effective_date date not null,
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  rejected_at timestamptz,
  implemented_at timestamptz,
  requested_by uuid,
  approved_by uuid,
  rejected_by uuid,
  implemented_by uuid,
  old_unit_id uuid,
  new_unit_id uuid,
  old_department_id uuid,
  new_department_id uuid,
  old_job_position_id uuid,
  new_job_position_id uuid,
  old_salary numeric(12,2),
  new_salary numeric(12,2),
  reason text not null,
  notes text,
  is_sensitive boolean not null default false,
  visibility_scope text not null default 'unit',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint employee_movements_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete restrict,
  constraint employee_movements_unit_id_fkey foreign key (unit_id) references public.units(id) on delete restrict,
  constraint employee_movements_employee_id_fkey foreign key (employee_id) references public.employees(id) on delete restrict,
  constraint employee_movements_requested_by_fkey foreign key (requested_by) references public.app_users(id) on delete set null,
  constraint employee_movements_approved_by_fkey foreign key (approved_by) references public.app_users(id) on delete set null,
  constraint employee_movements_rejected_by_fkey foreign key (rejected_by) references public.app_users(id) on delete set null,
  constraint employee_movements_implemented_by_fkey foreign key (implemented_by) references public.app_users(id) on delete set null,
  constraint employee_movements_old_unit_id_fkey foreign key (old_unit_id) references public.units(id) on delete restrict,
  constraint employee_movements_new_unit_id_fkey foreign key (new_unit_id) references public.units(id) on delete restrict,
  constraint employee_movements_old_department_id_fkey foreign key (old_department_id) references public.departments(id) on delete restrict,
  constraint employee_movements_new_department_id_fkey foreign key (new_department_id) references public.departments(id) on delete restrict,
  constraint employee_movements_old_job_position_id_fkey foreign key (old_job_position_id) references public.job_positions(id) on delete restrict,
  constraint employee_movements_new_job_position_id_fkey foreign key (new_job_position_id) references public.job_positions(id) on delete restrict,
  constraint employee_movements_type_check check (
    movement_type in (
      'promotion',
      'transfer',
      'job_position_change',
      'department_change',
      'unit_change',
      'salary_change'
    )
  ),
  constraint employee_movements_status_check check (
    status in ('draft', 'pending_approval', 'approved', 'rejected', 'implemented')
  ),
  constraint employee_movements_visibility_scope_check check (
    visibility_scope in ('restricted', 'unit', 'organization')
  ),
  constraint employee_movements_reason_not_blank check (length(trim(reason)) > 0),
  constraint employee_movements_salary_non_negative_check check (
    (old_salary is null or old_salary >= 0)
    and (new_salary is null or new_salary >= 0)
  ),
  constraint employee_movements_sensitive_visibility_check check (
    is_sensitive = false or visibility_scope = 'restricted'
  ),
  constraint employee_movements_approved_audit_check check (
    status not in ('approved', 'implemented') or (approved_at is not null and approved_by is not null)
  ),
  constraint employee_movements_rejected_audit_check check (
    status <> 'rejected' or (rejected_at is not null and rejected_by is not null)
  ),
  constraint employee_movements_implemented_audit_check check (
    status <> 'implemented' or (implemented_at is not null and implemented_by is not null)
  )
);

create index if not exists employee_movements_organization_idx on public.employee_movements (organization_id);
create index if not exists employee_movements_unit_idx on public.employee_movements (unit_id);
create index if not exists employee_movements_employee_idx on public.employee_movements (employee_id);
create index if not exists employee_movements_type_idx on public.employee_movements (movement_type);
create index if not exists employee_movements_status_idx on public.employee_movements (status);
create index if not exists employee_movements_effective_date_idx on public.employee_movements (effective_date);
create index if not exists employee_movements_requested_by_idx on public.employee_movements (requested_by);
create index if not exists employee_movements_approved_by_idx on public.employee_movements (approved_by);
create index if not exists employee_movements_sensitive_idx on public.employee_movements (is_sensitive);
create index if not exists employee_movements_deleted_at_idx on public.employee_movements (deleted_at);
create index if not exists employee_movements_employee_effective_idx
  on public.employee_movements (employee_id, effective_date desc)
  where deleted_at is null;

alter table public.employee_movements enable row level security;

do $$
begin
  if to_regprocedure('public.update_updated_at_column()') is null then
    raise notice 'Funcao public.update_updated_at_column() nao encontrada. Trigger de updated_at nao foi criado para movimentacoes funcionais.';
    return;
  end if;

  drop trigger if exists set_updated_at_employee_movements on public.employee_movements;
  create trigger set_updated_at_employee_movements
    before update on public.employee_movements
    for each row execute function public.update_updated_at_column();
end;
$$;

do $$
begin
  if to_regprocedure('public.write_audit_trail()') is null then
    raise notice 'Funcao public.write_audit_trail() nao encontrada. Auditoria generica de movimentacoes funcionais devera ser adicionada em migration futura.';
    return;
  end if;

  drop trigger if exists audit_employee_movements on public.employee_movements;
  create trigger audit_employee_movements
    after insert or update or delete on public.employee_movements
    for each row execute function public.write_audit_trail();
end;
$$;

insert into public.permissions (module_code, action_code, name, description)
values
  ('HR', 'movements.view', 'Visualizar movimentacoes funcionais', 'Permite consultar movimentacoes funcionais de colaboradores conforme escopo de unidade.'),
  ('HR', 'movements.manage', 'Gerenciar movimentacoes funcionais', 'Permite criar e editar solicitacoes de movimentacao funcional de colaboradores.'),
  ('HR', 'movements.approve', 'Aprovar movimentacoes funcionais', 'Permite aprovar ou rejeitar movimentacoes funcionais de colaboradores.'),
  ('HR', 'movements.sensitive.view', 'Visualizar movimentacoes sensiveis', 'Permite consultar dados sensiveis de movimentacoes funcionais, incluindo mudancas salariais.')
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  status = 'active',
  deleted_at = null,
  deleted_by = null,
  updated_at = now();

with super_admin_profile as (
  select id
  from public.access_profiles
  where code = 'SUPER_ADMIN'
    and status = 'active'
    and deleted_at is null
  limit 1
), movement_permissions as (
  select id
  from public.permissions
  where code in (
    'HR:movements.view',
    'HR:movements.manage',
    'HR:movements.approve',
    'HR:movements.sensitive.view'
  )
    and status = 'active'
    and deleted_at is null
)
insert into public.profile_permissions (access_profile_id, permission_id, is_allowed, status)
select
  super_admin_profile.id,
  movement_permissions.id,
  true,
  'active'
from super_admin_profile
cross join movement_permissions
on conflict (access_profile_id, permission_id) do update set
  is_allowed = true,
  status = 'active',
  deleted_at = null,
  deleted_by = null,
  updated_at = now();

comment on table public.employee_movements is
  'Movimentacoes funcionais administrativas do colaborador: promocao, transferencia, cargo, departamento, unidade e mudanca salarial. Nao calcula folha nem altera salario automaticamente.';
comment on column public.employee_movements.movement_type is
  'Tipo operacional: promotion, transfer, job_position_change, department_change, unit_change ou salary_change.';
comment on column public.employee_movements.status is
  'Fluxo simples: draft, pending_approval, approved, rejected ou implemented.';
comment on column public.employee_movements.effective_date is
  'Data efetiva administrativa da movimentacao. Nao gera impacto automatico em folha ou ponto.';
comment on column public.employee_movements.old_salary is
  'Salario anterior informado para rastreabilidade sensivel. Nao integra com folha.';
comment on column public.employee_movements.new_salary is
  'Salario novo informado para rastreabilidade sensivel. Nao integra com folha.';
comment on column public.employee_movements.metadata is
  'Metadados administrativos seguros. Nao deve conter CPF, RG, dados medicos, tokens, URLs assinadas ou paths de storage.';
