-- Sprint 2 - Seeds genericos do Modulo Base.
-- Nao cria hotel, organizacao, unidade ou dado operacional real.

insert into public.access_profiles (code, name, description, is_system_default)
values
  ('SUPER_ADMIN', 'Super Admin', 'Acesso administrativo completo ao sistema.', true),
  ('NETWORK_MANAGER', 'Gestor de Rede', 'Gestao corporativa multiunidade.', true),
  ('UNIT_DIRECTOR', 'Diretor de Unidade', 'Direcao da unidade ativa.', true),
  ('DEPARTMENT_MANAGER', 'Gerente Departamental', 'Gestao de departamento.', true),
  ('SUPERVISOR', 'Supervisor', 'Supervisao operacional.', true),
  ('EMPLOYEE', 'Colaborador', 'Acesso operacional basico.', true),
  ('FINANCE', 'Financeiro', 'Perfil para rotinas administrativas de pagamento e aprovacao.', true),
  ('AUDIT', 'Auditoria', 'Perfil de leitura e verificacao de evidencias.', true),
  ('EXTERNAL_TECHNICIAN', 'Técnico Externo', 'Acesso restrito para prestadores tecnicos.', true)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  is_system_default = excluded.is_system_default,
  updated_at = now();

insert into public.departments (code, name, description, is_system_default)
values
  ('RH', 'RH', 'Recursos Humanos.', true),
  ('FIN', 'FIN', 'Financeiro administrativo.', true),
  ('CPR', 'CPR', 'Compras.', true),
  ('MNT', 'MNT', 'Manutenção.', true),
  ('GOV', 'GOV', 'Governança.', true),
  ('ANB', 'A&B', 'Alimentos e Bebidas.', true),
  ('ADM', 'ADM', 'Administrativo Geral.', true),
  ('DIR', 'DIR', 'Diretoria.', true)
on conflict (code) where is_system_default = true and organization_id is null and unit_id is null do update set
  name = excluded.name,
  description = excluded.description,
  is_system_default = excluded.is_system_default,
  updated_at = now();

insert into public.permissions (module_code, action_code, name, description)
values
  ('BASE', 'dashboard.view', 'Visualizar dashboard', 'Permite visualizar o dashboard inicial.'),
  ('BASE', 'users.view', 'Visualizar usuários', 'Permite consultar usuários.'),
  ('BASE', 'users.manage', 'Gerenciar usuários', 'Permite criar e manter usuários.'),
  ('BASE', 'employees.view', 'Visualizar colaboradores', 'Permite consultar colaboradores.'),
  ('BASE', 'employees.manage', 'Gerenciar colaboradores', 'Permite criar e manter colaboradores.'),
  ('BASE', 'units.view', 'Visualizar unidades', 'Permite consultar unidades.'),
  ('BASE', 'units.manage', 'Gerenciar unidades', 'Permite manter unidades.'),
  ('BASE', 'departments.manage', 'Gerenciar departamentos', 'Permite manter departamentos e cargos.'),
  ('BASE', 'permissions.manage', 'Gerenciar permissões', 'Permite manter perfis e permissões.'),
  ('BASE', 'audit.view', 'Visualizar auditoria', 'Permite consultar trilhas de auditoria.'),
  ('BASE', 'settings.manage', 'Gerenciar configurações', 'Permite alterar configurações globais e por unidade.')
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  updated_at = now();

insert into public.profile_permissions (access_profile_id, permission_id, is_allowed)
select ap.id, p.id, true
from public.access_profiles ap
cross join public.permissions p
where ap.code = 'SUPER_ADMIN'
on conflict (access_profile_id, permission_id) do update set
  is_allowed = excluded.is_allowed,
  updated_at = now();

insert into public.system_statuses (module_code, entity_type, code, name, description, sequence_order, is_initial, is_final)
values
  ('BASE', 'record', 'draft', 'Rascunho', 'Registro ainda em elaboração.', 10, true, false),
  ('BASE', 'record', 'active', 'Ativo', 'Registro ativo para uso.', 20, false, false),
  ('BASE', 'record', 'inactive', 'Inativo', 'Registro inativo sem exclusão física.', 30, false, true),
  ('BASE', 'approval', 'pending', 'Pendente', 'Aguardando aprovação.', 10, true, false),
  ('BASE', 'approval', 'approved', 'Aprovado', 'Fluxo aprovado.', 20, false, true),
  ('BASE', 'approval', 'rejected', 'Rejeitado', 'Fluxo rejeitado com justificativa.', 30, false, true),
  ('BASE', 'notification', 'queued', 'Na fila', 'Notificação aguardando envio.', 10, true, false),
  ('BASE', 'notification', 'read', 'Lida', 'Notificação lida pelo usuário.', 20, false, true)
on conflict (module_code, entity_type, code) do update set
  name = excluded.name,
  description = excluded.description,
  sequence_order = excluded.sequence_order,
  is_initial = excluded.is_initial,
  is_final = excluded.is_final,
  updated_at = now();

insert into public.operational_categories (module_code, code, name, description)
values
  ('BASE', 'GENERAL', 'Geral', 'Categoria administrativa geral.'),
  ('BASE', 'DOCUMENTS', 'Documentos', 'Documentos e evidências.'),
  ('MNT', 'CORRECTIVE', 'Corretiva', 'Classificação futura para manutenção corretiva.'),
  ('MNT', 'PREVENTIVE', 'Preventiva', 'Classificação futura para manutenção preventiva.'),
  ('GOV', 'ROOM_INSPECTION', 'Inspeção de UH', 'Classificação futura para governança.'),
  ('ANB', 'SUPPLIES', 'Insumos', 'Classificação futura para A&B.'),
  ('ADM', 'ADMINISTRATIVE', 'Administrativo', 'Demandas administrativas gerais.')
on conflict (module_code, code) do update set
  name = excluded.name,
  description = excluded.description,
  updated_at = now();

insert into public.attachment_types (
  module_code,
  code,
  name,
  description,
  is_required,
  requires_expiration_date,
  allowed_mime_types,
  max_file_size_mb
)
values
  ('BASE', 'DOCUMENT', 'Documento', 'Documento geral em PDF ou imagem.', false, false, array['application/pdf', 'image/png', 'image/jpeg'], 10),
  ('BASE', 'EVIDENCE', 'Evidência', 'Evidência visual ou documental.', false, false, array['application/pdf', 'image/png', 'image/jpeg'], 10),
  ('BASE', 'CERTIFICATE', 'Certificado', 'Certificado com validade opcional.', false, true, array['application/pdf', 'image/png', 'image/jpeg'], 10),
  ('BASE', 'INVOICE', 'Nota fiscal', 'Anexo fiscal para solicitações futuras.', false, false, array['application/pdf', 'image/png', 'image/jpeg'], 10)
on conflict (module_code, code) do update set
  name = excluded.name,
  description = excluded.description,
  is_required = excluded.is_required,
  requires_expiration_date = excluded.requires_expiration_date,
  allowed_mime_types = excluded.allowed_mime_types,
  max_file_size_mb = excluded.max_file_size_mb,
  updated_at = now();

insert into public.notification_rules (module_code, event_code, channel, title_template, body_template)
values
  ('BASE', 'approval_pending', 'in_app', 'Aprovação pendente', 'Existe uma aprovação aguardando sua análise.'),
  ('BASE', 'request_updated', 'in_app', 'Solicitação atualizada', 'Uma solicitação vinculada a você foi atualizada.'),
  ('BASE', 'evidence_required', 'in_app', 'Evidência necessária', 'Uma evidência precisa ser anexada para concluir a etapa.')
on conflict (module_code, event_code, channel) do update set
  title_template = excluded.title_template,
  body_template = excluded.body_template,
  updated_at = now();
