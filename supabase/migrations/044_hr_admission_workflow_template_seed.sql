-- RH-9.2E Hotfix - Seed de template admission.
-- Cria template operacional minimo para admissao administrativa.
-- Nao cria employee, salario, folha, ponto, beneficios, documentos automaticos ou engine paralela.

with inserted_templates as (
  insert into public.hr_workflow_templates (
    organization_id,
    unit_id,
    workflow_type,
    code,
    name,
    description,
    is_active,
    is_system,
    default_sla_minutes,
    default_escalation_enabled,
    default_escalation_max_level,
    default_notification_enabled,
    metadata
  )
  select
    organization.id,
    null,
    'admission',
    'ADMISSION_MVP',
    'Admissao administrativa MVP',
    'Template operacional minimo para abertura de processo de admissao sem criar colaborador automaticamente.',
    true,
    true,
    4320,
    true,
    2,
    false,
    '{"source":"rh_9_2e_hotfix","mvp":true}'::jsonb
  from public.organizations organization
  where organization.deleted_at is null
    and not exists (
      select 1
      from public.hr_workflow_templates existing
      where existing.organization_id = organization.id
        and existing.unit_id is null
        and existing.workflow_type = 'admission'
        and upper(existing.code) = 'ADMISSION_MVP'
        and existing.deleted_at is null
    )
  returning id
), target_templates as (
  select id
  from inserted_templates
  union
  select template.id
  from public.hr_workflow_templates template
  where template.workflow_type = 'admission'
    and upper(template.code) = 'ADMISSION_MVP'
    and template.deleted_at is null
)
insert into public.hr_workflow_template_steps (
  template_id,
  step_key,
  name,
  description,
  step_type,
  order_index,
  is_required,
  default_assigned_role,
  default_sla_minutes,
  requires_approval,
  default_notification_enabled,
  metadata
)
select
  template.id,
  step.step_key,
  step.name,
  step.description,
  step.step_type,
  step.order_index,
  true,
  step.default_assigned_role,
  step.default_sla_minutes,
  step.requires_approval,
  false,
  step.metadata
from target_templates template
cross join (
  values
    ('ADMISSION_CREATED', 'Admissao aberta', 'Registro inicial da admissao administrativa gerada pelo RH.', 'task', 1, 'HR', 1440, false, '{"stage":"created"}'::jsonb),
    ('ADMISSION_DATA_REVIEW', 'Conferencia de dados', 'Conferencia humana dos dados basicos antes do cadastro funcional.', 'review', 2, 'HR', 1440, false, '{"stage":"data_review"}'::jsonb),
    ('ADMISSION_DOCUMENTS_GUIDANCE', 'Orientacao documental', 'Orientar coleta de documentos fora desta sprint, sem upload automatico.', 'task', 3, 'HR', 1440, false, '{"stage":"documents_guidance"}'::jsonb),
    ('ADMISSION_MANAGER_APPROVAL', 'Validacao do gestor', 'Validacao humana do gestor sobre continuidade da admissao.', 'approval', 4, 'MANAGER', 2880, true, '{"stage":"manager_approval"}'::jsonb),
    ('ADMISSION_READY_FOR_REGISTRATION', 'Pronta para cadastro funcional', 'Admissao pronta para futura conversao manual em colaborador.', 'task', 5, 'HR', 1440, false, '{"stage":"ready_for_registration"}'::jsonb)
) as step(step_key, name, description, step_type, order_index, default_assigned_role, default_sla_minutes, requires_approval, metadata)
where not exists (
  select 1
  from public.hr_workflow_template_steps existing
  where existing.template_id = template.id
    and upper(existing.step_key) = step.step_key
    and existing.deleted_at is null
);

comment on column public.hr_workflow_templates.workflow_type is
  'Tipo administrativo do template de workflow RH, incluindo admission para admissoes administrativas sem criacao automatica de colaborador.';
