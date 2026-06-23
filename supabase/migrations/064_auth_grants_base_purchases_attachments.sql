-- Autorizacao granular para Base, Compras e Attachments.
-- Seed/grants apenas: nao altera Auth, login, auth_email, RLS, policies ou schema operacional.
-- Nao vincula usuarios ao perfil COMPRAS; a atribuicao sera feita pela gestao de usuarios.

insert into public.permissions (module_code, action_code, name, description)
values
  ('BASE', 'departments.view', 'Visualizar departamentos', 'Permite consultar departamentos no escopo permitido.'),
  ('BASE', 'job_positions.view', 'Visualizar cargos', 'Permite consultar cargos no escopo permitido.'),
  ('BASE', 'job_positions.manage', 'Gerenciar cargos', 'Permite criar e manter cargos no escopo permitido.'),
  ('BASE', 'suppliers.view', 'Visualizar fornecedores', 'Permite consultar fornecedores no escopo permitido.'),
  ('BASE', 'suppliers.manage', 'Gerenciar fornecedores', 'Permite criar e manter fornecedores no escopo permitido.'),
  ('PURCHASES', 'requests.view', 'Visualizar solicitacoes de compra', 'Permite consultar solicitacoes de compra no escopo permitido.'),
  ('PURCHASES', 'requests.manage', 'Gerenciar solicitacoes de compra', 'Permite criar, editar, enviar ou cancelar solicitacoes de compra no escopo permitido.'),
  ('PURCHASES', 'quotes.view', 'Visualizar cotacoes', 'Permite consultar cotacoes no escopo permitido.'),
  ('PURCHASES', 'quotes.manage', 'Gerenciar cotacoes', 'Permite iniciar, criar, editar, selecionar, excluir e negociar cotacoes no escopo permitido.'),
  ('PURCHASES', 'approvals.view', 'Visualizar aprovacoes de compras', 'Permite consultar fila e dossies de aprovacao de compras no escopo permitido.'),
  ('PURCHASES', 'approvals.submit', 'Enviar compras para aprovacao', 'Permite enviar ou reenviar compra para aprovacao no escopo permitido.'),
  ('PURCHASES', 'approvals.decide', 'Decidir aprovacoes de compras', 'Permite aprovar, reprovar ou devolver compras respeitando as alcadas existentes.'),
  ('PURCHASES', 'documentation.view', 'Visualizar documentacao de compras', 'Permite consultar o painel documental de cotacoes no escopo permitido.'),
  ('ATTACHMENTS', 'purchases.view', 'Visualizar anexos de compras', 'Permite consultar anexos de compras no escopo permitido.'),
  ('ATTACHMENTS', 'purchases.manage', 'Gerenciar anexos de compras', 'Permite enviar ou remover anexos de compras no escopo permitido.')
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  status = 'active',
  deleted_at = null,
  deleted_by = null,
  updated_at = now();

insert into public.access_profiles (code, name, description, is_system_default, status)
values
  (
    'COMPRAS',
    'Compras',
    'Perfil operacional dedicado para compras, cotacoes, fornecedores e anexos de compras.',
    true,
    'active'
  )
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  is_system_default = excluded.is_system_default,
  status = 'active',
  deleted_at = null,
  deleted_by = null,
  updated_at = now();

with profile_permission_matrix(profile_code, permission_code) as (
  values
    -- Super Admin: recebe todas as permissoes novas desta migration.
    ('SUPER_ADMIN', 'BASE:departments.view'),
    ('SUPER_ADMIN', 'BASE:job_positions.view'),
    ('SUPER_ADMIN', 'BASE:job_positions.manage'),
    ('SUPER_ADMIN', 'BASE:suppliers.view'),
    ('SUPER_ADMIN', 'BASE:suppliers.manage'),
    ('SUPER_ADMIN', 'PURCHASES:requests.view'),
    ('SUPER_ADMIN', 'PURCHASES:requests.manage'),
    ('SUPER_ADMIN', 'PURCHASES:quotes.view'),
    ('SUPER_ADMIN', 'PURCHASES:quotes.manage'),
    ('SUPER_ADMIN', 'PURCHASES:approvals.view'),
    ('SUPER_ADMIN', 'PURCHASES:approvals.submit'),
    ('SUPER_ADMIN', 'PURCHASES:approvals.decide'),
    ('SUPER_ADMIN', 'PURCHASES:documentation.view'),
    ('SUPER_ADMIN', 'ATTACHMENTS:purchases.view'),
    ('SUPER_ADMIN', 'ATTACHMENTS:purchases.manage'),

    -- Gestao de rede: consulta e aprovacao corporativa conforme escopo.
    ('NETWORK_MANAGER', 'BASE:units.view'),
    ('NETWORK_MANAGER', 'BASE:departments.view'),
    ('NETWORK_MANAGER', 'BASE:job_positions.view'),
    ('NETWORK_MANAGER', 'BASE:employees.view'),
    ('NETWORK_MANAGER', 'BASE:suppliers.view'),
    ('NETWORK_MANAGER', 'PURCHASES:requests.view'),
    ('NETWORK_MANAGER', 'PURCHASES:quotes.view'),
    ('NETWORK_MANAGER', 'PURCHASES:approvals.view'),
    ('NETWORK_MANAGER', 'PURCHASES:approvals.decide'),
    ('NETWORK_MANAGER', 'PURCHASES:documentation.view'),
    ('NETWORK_MANAGER', 'ATTACHMENTS:purchases.view'),

    -- Diretoria da unidade: consulta e decisao de aprovacao no escopo da unidade.
    ('UNIT_DIRECTOR', 'BASE:units.view'),
    ('UNIT_DIRECTOR', 'BASE:departments.view'),
    ('UNIT_DIRECTOR', 'BASE:job_positions.view'),
    ('UNIT_DIRECTOR', 'BASE:employees.view'),
    ('UNIT_DIRECTOR', 'BASE:suppliers.view'),
    ('UNIT_DIRECTOR', 'PURCHASES:requests.view'),
    ('UNIT_DIRECTOR', 'PURCHASES:quotes.view'),
    ('UNIT_DIRECTOR', 'PURCHASES:approvals.view'),
    ('UNIT_DIRECTOR', 'PURCHASES:approvals.decide'),
    ('UNIT_DIRECTOR', 'PURCHASES:documentation.view'),
    ('UNIT_DIRECTOR', 'ATTACHMENTS:purchases.view'),

    -- Compras: perfil operacional dedicado. Nao decide aprovacoes.
    ('COMPRAS', 'PURCHASES:requests.view'),
    ('COMPRAS', 'PURCHASES:requests.manage'),
    ('COMPRAS', 'PURCHASES:quotes.view'),
    ('COMPRAS', 'PURCHASES:quotes.manage'),
    ('COMPRAS', 'PURCHASES:approvals.view'),
    ('COMPRAS', 'PURCHASES:approvals.submit'),
    ('COMPRAS', 'PURCHASES:documentation.view'),
    ('COMPRAS', 'BASE:suppliers.view'),
    ('COMPRAS', 'BASE:suppliers.manage'),
    ('COMPRAS', 'ATTACHMENTS:purchases.view'),
    ('COMPRAS', 'ATTACHMENTS:purchases.manage'),

    -- Gerencia departamental: pode solicitar e consultar, sem PURCHASES:approvals.decide nesta etapa.
    ('DEPARTMENT_MANAGER', 'BASE:departments.view'),
    ('DEPARTMENT_MANAGER', 'BASE:job_positions.view'),
    ('DEPARTMENT_MANAGER', 'BASE:employees.view'),
    ('DEPARTMENT_MANAGER', 'BASE:suppliers.view'),
    ('DEPARTMENT_MANAGER', 'PURCHASES:requests.view'),
    ('DEPARTMENT_MANAGER', 'PURCHASES:requests.manage'),
    ('DEPARTMENT_MANAGER', 'PURCHASES:quotes.view'),
    ('DEPARTMENT_MANAGER', 'PURCHASES:approvals.view'),
    ('DEPARTMENT_MANAGER', 'PURCHASES:documentation.view'),
    ('DEPARTMENT_MANAGER', 'ATTACHMENTS:purchases.view'),

    -- Supervisao: solicitacao operacional e consulta basica.
    ('SUPERVISOR', 'BASE:departments.view'),
    ('SUPERVISOR', 'BASE:job_positions.view'),
    ('SUPERVISOR', 'BASE:employees.view'),
    ('SUPERVISOR', 'BASE:suppliers.view'),
    ('SUPERVISOR', 'PURCHASES:requests.view'),
    ('SUPERVISOR', 'PURCHASES:requests.manage'),
    ('SUPERVISOR', 'PURCHASES:quotes.view'),
    ('SUPERVISOR', 'ATTACHMENTS:purchases.view'),

    -- Financeiro: consulta administrativa/documental, sem decisao de aprovacao por padrao.
    ('FINANCE', 'BASE:suppliers.view'),
    ('FINANCE', 'PURCHASES:requests.view'),
    ('FINANCE', 'PURCHASES:quotes.view'),
    ('FINANCE', 'PURCHASES:approvals.view'),
    ('FINANCE', 'PURCHASES:documentation.view'),
    ('FINANCE', 'ATTACHMENTS:purchases.view'),

    -- Auditoria: leitura para rastreabilidade.
    ('AUDIT', 'BASE:units.view'),
    ('AUDIT', 'BASE:departments.view'),
    ('AUDIT', 'BASE:job_positions.view'),
    ('AUDIT', 'BASE:employees.view'),
    ('AUDIT', 'BASE:suppliers.view'),
    ('AUDIT', 'PURCHASES:requests.view'),
    ('AUDIT', 'PURCHASES:quotes.view'),
    ('AUDIT', 'PURCHASES:approvals.view'),
    ('AUDIT', 'PURCHASES:documentation.view'),
    ('AUDIT', 'ATTACHMENTS:purchases.view'),

    -- Colaborador: solicitacao propria no escopo operacional.
    ('EMPLOYEE', 'PURCHASES:requests.view'),
    ('EMPLOYEE', 'PURCHASES:requests.manage')
)
insert into public.profile_permissions (access_profile_id, permission_id, is_allowed, status)
select
  access_profile.id,
  permission.id,
  true,
  'active'
from profile_permission_matrix matrix
join public.access_profiles access_profile
  on access_profile.code = matrix.profile_code
 and access_profile.status = 'active'
 and access_profile.deleted_at is null
join public.permissions permission
  on permission.code = matrix.permission_code
 and permission.status = 'active'
 and permission.deleted_at is null
on conflict (access_profile_id, permission_id) do update set
  is_allowed = true,
  status = 'active',
  deleted_at = null,
  deleted_by = null,
  updated_at = now();
