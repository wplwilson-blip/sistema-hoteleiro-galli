-- RH-6I - RPC da workflow engine com suporte a reject_step.
-- Mantem create_workflow, execute_step e approve_step preservados e adiciona rejeicao transacional de etapa.

alter table public.hr_workflows
  drop constraint if exists hr_workflows_status_check;

alter table public.hr_workflows
  add constraint hr_workflows_status_check check (
    status in (
      'draft',
      'open',
      'in_progress',
      'waiting_approval',
      'returned',
      'completed',
      'cancelled',
      'rejected'
    )
  );

alter table public.hr_workflows
  drop constraint if exists hr_workflows_cancellation_required_check;

alter table public.hr_workflows
  add constraint hr_workflows_cancellation_required_check check (
    status not in ('cancelled', 'rejected')
    or (
      cancelled_at is not null
      and cancelled_by is not null
      and btrim(coalesce(cancellation_reason, '')) <> ''
    )
  );

alter table public.hr_workflows
  drop constraint if exists hr_workflows_cancellation_status_check;

alter table public.hr_workflows
  add constraint hr_workflows_cancellation_status_check check (
    status in ('cancelled', 'rejected')
    or (
      cancelled_at is null
      and cancelled_by is null
      and cancellation_reason is null
    )
  );

alter table public.hr_workflow_events
  drop constraint if exists hr_workflow_events_type_check;

alter table public.hr_workflow_events
  add constraint hr_workflow_events_type_check check (
    event_type in (
      'workflow_created',
      'workflow_opened',
      'workflow_assigned',
      'workflow_status_changed',
      'workflow_due_date_changed',
      'workflow_submitted_for_approval',
      'workflow_approved',
      'workflow_returned',
      'workflow_rejected',
      'workflow_completed',
      'workflow_cancelled',
      'step_started',
      'step_completed',
      'step_rejected',
      'step_returned',
      'step_skipped',
      'document_linked',
      'note_added'
    )
  );

alter table public.hr_workflow_idempotency_keys
  drop constraint if exists hr_workflow_idempotency_keys_action_check;

alter table public.hr_workflow_idempotency_keys
  add constraint hr_workflow_idempotency_keys_action_check check (
    action in (
      'create_workflow',
      'execute_step',
      'approve_step',
      'reject_step',
      'return_step',
      'cancel_workflow'
    )
  );

create or replace function public.hr_workflow_apply_action(
  p_action text,
  p_organization_id uuid,
  p_unit_id uuid,
  p_actor_user_id uuid,
  p_idempotency_key text,
  p_request_hash text,
  p_payload jsonb default '{}'::jsonb,
  p_workflow_id uuid default null,
  p_step_id uuid default null
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_payload_text text;
  v_action text;
  v_idempotency public.hr_workflow_idempotency_keys%rowtype;
  v_existing public.hr_workflow_idempotency_keys%rowtype;
  v_workflow public.hr_workflows%rowtype;
  v_step_record public.hr_workflow_steps%rowtype;
  v_next_step public.hr_workflow_steps%rowtype;
  v_response jsonb;
  v_error jsonb;
  v_now timestamptz := now();
  v_uuid_pattern constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
  v_workflow_type text;
  v_title text;
  v_description text;
  v_employee_id_text text;
  v_employee_id uuid;
  v_priority text;
  v_responsible_user_id_text text;
  v_responsible_user_id uuid;
  v_due_at_text text;
  v_due_at timestamptz;
  v_metadata jsonb;
  v_steps jsonb;
  v_step jsonb;
  v_step_order integer;
  v_step_key text;
  v_step_title text;
  v_step_description text;
  v_step_requires_approval boolean;
  v_step_assigned_to_text text;
  v_step_assigned_to uuid;
  v_step_metadata jsonb;
  v_step_count integer;
  v_seen_orders integer[] := array[]::integer[];
  v_seen_keys text[] := array[]::text[];
  v_first_order integer;
  v_first_requires_approval boolean;
  v_first_step_status text;
  v_workflow_status text;
  v_workflow_visibility text;
  v_workflow_sensitive boolean;
  v_workflow_id uuid;
  v_current_step_id uuid;
  v_inserted_step_id uuid;
  v_completed_step_id uuid;
  v_event_id uuid;
  v_event_ids uuid[] := array[]::uuid[];
  v_notes text;
  v_reason text;
  v_next_step_status text;
begin
  v_action := nullif(btrim(coalesce(p_action, '')), '');

  if v_action is null or v_action not in ('create_workflow', 'execute_step', 'approve_step', 'reject_step') then
    return jsonb_build_object(
      'ok', false,
      'error_code', 'INVALID_ACTION',
      'message', 'Acao nao suportada nesta versao da engine.',
      'retryable', false
    );
  end if;

  if v_action = 'create_workflow'
    and (p_workflow_id is not null or p_step_id is not null) then
    return jsonb_build_object(
      'ok', false,
      'error_code', 'INVALID_PAYLOAD',
      'message', 'create_workflow nao aceita workflow_id ou step_id.',
      'retryable', false
    );
  end if;

  if v_action in ('execute_step', 'approve_step', 'reject_step')
    and (p_workflow_id is null or p_step_id is null) then
    return jsonb_build_object(
      'ok', false,
      'error_code', 'INVALID_PAYLOAD',
      'message', 'A acao exige workflow_id e step_id.',
      'retryable', false
    );
  end if;

  if jsonb_typeof(v_payload) <> 'object' then
    return jsonb_build_object(
      'ok', false,
      'error_code', 'INVALID_PAYLOAD',
      'message', 'Payload invalido.',
      'retryable', false
    );
  end if;

  if p_organization_id is null
    or p_unit_id is null
    or p_actor_user_id is null
    or btrim(coalesce(p_idempotency_key, '')) = ''
    or length(btrim(coalesce(p_idempotency_key, ''))) > 160
    or coalesce(p_request_hash, '') !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object(
      'ok', false,
      'error_code', 'INVALID_PAYLOAD',
      'message', 'Parametros obrigatorios invalidos.',
      'retryable', false
    );
  end if;

  v_payload_text := lower(v_payload::text);

  if v_payload_text like '%file_path%'
    or v_payload_text like '%signed_url%'
    or v_payload_text like '%signedurl%'
    or v_payload_text like '%storage_path%'
    or v_payload_text like '%download_url%'
    or v_payload_text like '%public_url%'
    or v_payload_text like '%document_number%'
    or v_payload_text like '%createsignedurl%'
    or v_payload_text like '%salary%'
    or v_payload_text like '%medical%'
    or v_payload::text ~* '(^|[^a-z0-9_])cpf([^a-z0-9_]|$)'
    or v_payload::text ~* '(^|[^a-z0-9_])rg([^a-z0-9_]|$)'
    or v_payload::text ~* '(^|[^a-z0-9_])cid([^a-z0-9_]|$)' then
    return jsonb_build_object(
      'ok', false,
      'error_code', 'LGPD_PAYLOAD_DENIED',
      'message', 'Payload contem campos proibidos para a engine de workflows.',
      'retryable', false
    );
  end if;

  if v_action in ('execute_step', 'approve_step', 'reject_step')
    and not exists (
      select 1
      from public.hr_workflows workflow
      where workflow.id = p_workflow_id
        and workflow.organization_id = p_organization_id
        and workflow.unit_id = p_unit_id
        and workflow.deleted_at is null
    ) then
    return jsonb_build_object(
      'ok', false,
      'error_code', 'WORKFLOW_NOT_FOUND',
      'message', 'Workflow nao encontrado.',
      'retryable', false
    );
  end if;

  insert into public.hr_workflow_idempotency_keys (
    organization_id,
    unit_id,
    workflow_id,
    actor_user_id,
    action,
    idempotency_key,
    request_hash,
    status,
    expires_at
  )
  values (
    p_organization_id,
    p_unit_id,
    case when v_action <> 'create_workflow' then p_workflow_id else null end,
    p_actor_user_id,
    v_action,
    btrim(p_idempotency_key),
    p_request_hash,
    'processing',
    now() + interval '48 hours'
  )
  on conflict (organization_id, actor_user_id, action, idempotency_key)
  do nothing
  returning *
  into v_idempotency;

  if not found then
    select *
    into v_existing
    from public.hr_workflow_idempotency_keys
    where organization_id = p_organization_id
      and actor_user_id = p_actor_user_id
      and action = v_action
      and idempotency_key = btrim(p_idempotency_key)
    for update;

    if v_existing.request_hash <> p_request_hash then
      return jsonb_build_object(
        'ok', false,
        'error_code', 'IDEMPOTENCY_CONFLICT',
        'message', 'Chave de idempotencia reutilizada com payload diferente.',
        'retryable', false
      );
    end if;

    if v_existing.status = 'completed' then
      return jsonb_set(
        v_existing.response_snapshot,
        '{idempotency,replayed}',
        'true'::jsonb,
        true
      );
    end if;

    if v_existing.status = 'processing' then
      return jsonb_build_object(
        'ok', false,
        'error_code', 'REQUEST_ALREADY_PROCESSING',
        'message', 'A mesma acao ainda esta em processamento.',
        'retryable', true,
        'idempotency', jsonb_build_object(
          'status', 'processing',
          'replayed', true
        )
      );
    end if;

    return coalesce(
      v_existing.error_snapshot,
      jsonb_build_object(
        'ok', false,
        'error_code', 'INTERNAL_ERROR',
        'message', 'Tentativa anterior falhou.',
        'retryable', false
      )
    ) || jsonb_build_object(
      'idempotency',
      jsonb_build_object(
        'status', 'failed',
        'replayed', true
      )
    );
  end if;

  if v_action = 'execute_step' then
    <<execute_step_phase>>
    begin
      v_notes := nullif(btrim(coalesce(v_payload->>'notes', '')), '');

      if v_notes is not null and length(v_notes) > 2000 then
        v_error := jsonb_build_object(
          'ok', false,
          'error_code', 'INVALID_PAYLOAD',
          'message', 'Observacao da etapa excede o tamanho permitido.',
          'retryable', false
        );
        exit execute_step_phase;
      end if;

      select *
      into v_workflow
      from public.hr_workflows workflow
      where workflow.id = p_workflow_id
        and workflow.organization_id = p_organization_id
        and workflow.unit_id = p_unit_id
        and workflow.deleted_at is null
      for update;

      if not found then
        v_error := jsonb_build_object(
          'ok', false,
          'error_code', 'WORKFLOW_NOT_FOUND',
          'message', 'Workflow nao encontrado.',
          'retryable', false
        );
        exit execute_step_phase;
      end if;

      if v_workflow.status <> 'in_progress' then
        v_error := jsonb_build_object(
          'ok', false,
          'error_code', 'WORKFLOW_STATUS_INVALID',
          'message', 'Workflow nao esta ativo para execucao de etapa.',
          'retryable', false
        );
        exit execute_step_phase;
      end if;

      select *
      into v_step_record
      from public.hr_workflow_steps step
      where step.id = p_step_id
        and step.workflow_id = p_workflow_id
        and step.organization_id = p_organization_id
        and step.unit_id = p_unit_id
        and step.deleted_at is null
      for update;

      if not found then
        v_error := jsonb_build_object(
          'ok', false,
          'error_code', 'WORKFLOW_STEP_NOT_FOUND',
          'message', 'Etapa nao encontrada.',
          'retryable', false
        );
        exit execute_step_phase;
      end if;

      if v_step_record.status not in ('pending', 'in_progress')
        or v_step_record.requires_approval then
        v_error := jsonb_build_object(
          'ok', false,
          'error_code', 'STEP_STATUS_INVALID',
          'message', 'Etapa nao esta pendente para execucao.',
          'retryable', false
        );
        exit execute_step_phase;
      end if;

      select *
      into v_next_step
      from public.hr_workflow_steps step
      where step.workflow_id = p_workflow_id
        and step.organization_id = p_organization_id
        and step.unit_id = p_unit_id
        and step.deleted_at is null
        and step.status in ('pending', 'in_progress')
      order by step.step_order asc, step.created_at asc
      limit 1
      for update;

      if not found or v_next_step.id <> v_step_record.id then
        v_error := jsonb_build_object(
          'ok', false,
          'error_code', 'STEP_OUT_OF_ORDER',
          'message', 'Execute a etapa pendente anterior antes desta etapa.',
          'retryable', false
        );
        exit execute_step_phase;
      end if;

      if not exists (
        select 1
        from public.app_users app_user
        where app_user.id = p_actor_user_id
          and app_user.status = 'active'
          and app_user.deleted_at is null
      ) then
        v_error := jsonb_build_object(
          'ok', false,
          'error_code', 'ACTOR_INVALID',
          'message', 'Executor invalido para esta acao.',
          'retryable', false
        );
        exit execute_step_phase;
      end if;

      if not exists (
        select 1
        from public.user_unit_links unit_link
        join public.access_profiles access_profile
          on access_profile.id = unit_link.access_profile_id
         and access_profile.status = 'active'
         and access_profile.deleted_at is null
        join public.profile_permissions profile_permission
          on profile_permission.access_profile_id = access_profile.id
         and profile_permission.is_allowed = true
         and profile_permission.status = 'active'
         and profile_permission.deleted_at is null
        join public.permissions permission_row
          on permission_row.id = profile_permission.permission_id
         and permission_row.status = 'active'
         and permission_row.deleted_at is null
        where unit_link.app_user_id = p_actor_user_id
          and unit_link.unit_id = p_unit_id
          and unit_link.status = 'active'
          and unit_link.deleted_at is null
          and (unit_link.starts_at is null or unit_link.starts_at <= v_now)
          and (unit_link.ends_at is null or unit_link.ends_at > v_now)
          and permission_row.code in ('HR:workflows.manage', 'HR:workflow_steps.complete')
      ) then
        v_error := jsonb_build_object(
          'ok', false,
          'error_code', 'ACTOR_INVALID',
          'message', 'Executor nao possui permissao de RH para esta unidade.',
          'retryable', false
        );
        exit execute_step_phase;
      end if;

      if v_step_record.assigned_to_user_id is not null
        and v_step_record.assigned_to_user_id <> p_actor_user_id then
        v_error := jsonb_build_object(
          'ok', false,
          'error_code', 'STEP_NOT_ASSIGNED_TO_ACTOR',
          'message', 'Etapa atribuida a outro responsavel.',
          'retryable', false
        );
        exit execute_step_phase;
      end if;
    end execute_step_phase;

    if v_error is not null then
      update public.hr_workflow_idempotency_keys
      set status = 'failed',
          response_snapshot = null,
          error_snapshot = v_error,
          updated_at = now()
      where id = v_idempotency.id;

      return v_error;
    end if;

    begin
      v_event_ids := array[]::uuid[];
      v_workflow_id := v_workflow.id;
      v_workflow_status := v_workflow.status;
      v_workflow_visibility := v_workflow.visibility_scope;
      v_workflow_sensitive := v_workflow.is_sensitive;
      v_employee_id := v_workflow.employee_id;

      update public.hr_workflow_steps
      set status = 'completed',
          completed_at = v_now,
          completed_by = p_actor_user_id,
          updated_by = p_actor_user_id,
          updated_at = v_now
      where id = v_step_record.id
      returning id into v_completed_step_id;

      insert into public.hr_workflow_events (
        organization_id,
        unit_id,
        workflow_id,
        workflow_step_id,
        employee_id,
        event_scope,
        event_type,
        from_status,
        to_status,
        summary,
        details,
        visibility_scope,
        is_sensitive,
        actor_user_id,
        occurred_at,
        event_payload,
        created_by,
        updated_by
      )
      values (
        p_organization_id,
        p_unit_id,
        v_workflow_id,
        v_completed_step_id,
        v_employee_id,
        'step',
        'step_completed',
        v_step_record.status,
        'completed',
        'Etapa concluida',
        v_notes,
        v_workflow_visibility,
        v_workflow_sensitive,
        p_actor_user_id,
        v_now,
        jsonb_build_object(
          'step_id', v_completed_step_id,
          'step_code', v_step_record.step_code,
          'completion_kind', 'executed',
          'notes_present', v_notes is not null
        ),
        p_actor_user_id,
        p_actor_user_id
      )
      returning id into v_event_id;
      v_event_ids := array_append(v_event_ids, v_event_id);

      select *
      into v_next_step
      from public.hr_workflow_steps step
      where step.workflow_id = p_workflow_id
        and step.organization_id = p_organization_id
        and step.unit_id = p_unit_id
        and step.deleted_at is null
        and step.status = 'pending'
      order by step.step_order asc, step.created_at asc
      limit 1
      for update;

      if found then
        v_next_step_status := case
          when v_next_step.requires_approval then 'waiting_approval'
          else 'in_progress'
        end;
        v_workflow_status := v_next_step_status;
        v_current_step_id := v_next_step.id;

        update public.hr_workflow_steps
        set status = v_next_step_status,
            started_at = coalesce(started_at, v_now),
            updated_by = p_actor_user_id,
            updated_at = v_now
        where id = v_next_step.id;

        update public.hr_workflows
        set status = v_workflow_status,
            updated_by = p_actor_user_id,
            updated_at = v_now
        where id = v_workflow_id;

        insert into public.hr_workflow_events (
          organization_id,
          unit_id,
          workflow_id,
          workflow_step_id,
          employee_id,
          event_scope,
          event_type,
          from_status,
          to_status,
          summary,
          visibility_scope,
          is_sensitive,
          actor_user_id,
          occurred_at,
          event_payload,
          created_by,
          updated_by
        )
        values (
          p_organization_id,
          p_unit_id,
          v_workflow_id,
          v_current_step_id,
          v_employee_id,
          'step',
          'step_started',
          'pending',
          v_next_step_status,
          'Proxima etapa aberta',
          v_workflow_visibility,
          v_workflow_sensitive,
          p_actor_user_id,
          v_now,
          jsonb_build_object(
            'step_id', v_current_step_id,
            'step_status', v_next_step_status
          ),
          p_actor_user_id,
          p_actor_user_id
        )
        returning id into v_event_id;
        v_event_ids := array_append(v_event_ids, v_event_id);
      else
        v_workflow_status := 'completed';
        v_current_step_id := null;

        update public.hr_workflows
        set status = 'completed',
            completed_at = v_now,
            completed_by = p_actor_user_id,
            updated_by = p_actor_user_id,
            updated_at = v_now
        where id = v_workflow_id;

        insert into public.hr_workflow_events (
          organization_id,
          unit_id,
          workflow_id,
          employee_id,
          event_scope,
          event_type,
          from_status,
          to_status,
          summary,
          visibility_scope,
          is_sensitive,
          actor_user_id,
          occurred_at,
          event_payload,
          created_by,
          updated_by
        )
        values (
          p_organization_id,
          p_unit_id,
          v_workflow_id,
          v_employee_id,
          'workflow',
          'workflow_completed',
          v_workflow.status,
          'completed',
          'Workflow concluido',
          v_workflow_visibility,
          v_workflow_sensitive,
          p_actor_user_id,
          v_now,
          jsonb_build_object(
            'completed_step_id', v_completed_step_id,
            'workflow_status', 'completed'
          ),
          p_actor_user_id,
          p_actor_user_id
        )
        returning id into v_event_id;
        v_event_ids := array_append(v_event_ids, v_event_id);
      end if;

      v_response := jsonb_build_object(
        'ok', true,
        'action', 'execute_step',
        'workflow_id', v_workflow_id,
        'workflow_status', v_workflow_status,
        'completed_step_id', v_completed_step_id,
        'current_step_id', v_current_step_id,
        'event_ids', to_jsonb(v_event_ids),
        'idempotency', jsonb_build_object(
          'status', 'completed',
          'replayed', false
        )
      );

      update public.hr_workflow_idempotency_keys
      set workflow_id = v_workflow_id,
          status = 'completed',
          response_snapshot = v_response,
          error_snapshot = null,
          updated_at = now()
      where id = v_idempotency.id;

      return v_response;
    exception
      when others then
        v_error := jsonb_build_object(
          'ok', false,
          'error_code', 'INTERNAL_ERROR',
          'message', 'Nao foi possivel executar etapa.',
          'retryable', true,
          'idempotency', jsonb_build_object(
            'status', 'failed',
            'replayed', false
          )
        );

        update public.hr_workflow_idempotency_keys
        set status = 'failed',
            response_snapshot = null,
            error_snapshot = v_error,
            updated_at = now()
        where id = v_idempotency.id;

        return v_error;
    end;
  end if;

  if v_action = 'approve_step' then
    <<approve_step_phase>>
    begin
      v_notes := nullif(btrim(coalesce(v_payload->>'notes', '')), '');

      if v_notes is not null and length(v_notes) > 2000 then
        v_error := jsonb_build_object(
          'ok', false,
          'error_code', 'INVALID_PAYLOAD',
          'message', 'Observacao da aprovacao excede o tamanho permitido.',
          'retryable', false
        );
        exit approve_step_phase;
      end if;

      select *
      into v_workflow
      from public.hr_workflows workflow
      where workflow.id = p_workflow_id
        and workflow.organization_id = p_organization_id
        and workflow.unit_id = p_unit_id
        and workflow.deleted_at is null
      for update;

      if not found then
        v_error := jsonb_build_object(
          'ok', false,
          'error_code', 'WORKFLOW_NOT_FOUND',
          'message', 'Workflow nao encontrado.',
          'retryable', false
        );
        exit approve_step_phase;
      end if;

      if v_workflow.status not in ('in_progress', 'waiting_approval') then
        v_error := jsonb_build_object(
          'ok', false,
          'error_code', 'WORKFLOW_STATUS_INVALID',
          'message', 'Workflow nao esta ativo para aprovacao de etapa.',
          'retryable', false
        );
        exit approve_step_phase;
      end if;

      select *
      into v_step_record
      from public.hr_workflow_steps step
      where step.id = p_step_id
        and step.workflow_id = p_workflow_id
        and step.organization_id = p_organization_id
        and step.unit_id = p_unit_id
        and step.deleted_at is null
      for update;

      if not found then
        v_error := jsonb_build_object(
          'ok', false,
          'error_code', 'WORKFLOW_STEP_NOT_FOUND',
          'message', 'Etapa nao encontrada.',
          'retryable', false
        );
        exit approve_step_phase;
      end if;

      if v_step_record.status <> 'waiting_approval'
        or v_step_record.requires_approval is not true then
        v_error := jsonb_build_object(
          'ok', false,
          'error_code', 'STEP_STATUS_INVALID',
          'message', 'Etapa nao esta aguardando aprovacao.',
          'retryable', false
        );
        exit approve_step_phase;
      end if;

      select *
      into v_next_step
      from public.hr_workflow_steps step
      where step.workflow_id = p_workflow_id
        and step.organization_id = p_organization_id
        and step.unit_id = p_unit_id
        and step.deleted_at is null
        and step.status in ('pending', 'in_progress', 'waiting_approval')
      order by step.step_order asc, step.created_at asc
      limit 1
      for update;

      if not found or v_next_step.id <> v_step_record.id then
        v_error := jsonb_build_object(
          'ok', false,
          'error_code', 'STEP_OUT_OF_ORDER',
          'message', 'Aprove a etapa pendente anterior antes desta etapa.',
          'retryable', false
        );
        exit approve_step_phase;
      end if;

      if not exists (
        select 1
        from public.app_users app_user
        where app_user.id = p_actor_user_id
          and app_user.status = 'active'
          and app_user.deleted_at is null
      ) then
        v_error := jsonb_build_object(
          'ok', false,
          'error_code', 'ACTOR_INVALID',
          'message', 'Aprovador invalido para esta acao.',
          'retryable', false
        );
        exit approve_step_phase;
      end if;

      if not exists (
        select 1
        from public.user_unit_links unit_link
        join public.access_profiles access_profile
          on access_profile.id = unit_link.access_profile_id
         and access_profile.status = 'active'
         and access_profile.deleted_at is null
        join public.profile_permissions profile_permission
          on profile_permission.access_profile_id = access_profile.id
         and profile_permission.is_allowed = true
         and profile_permission.status = 'active'
         and profile_permission.deleted_at is null
        join public.permissions permission_row
          on permission_row.id = profile_permission.permission_id
         and permission_row.status = 'active'
         and permission_row.deleted_at is null
        where unit_link.app_user_id = p_actor_user_id
          and unit_link.unit_id = p_unit_id
          and unit_link.status = 'active'
          and unit_link.deleted_at is null
          and (unit_link.starts_at is null or unit_link.starts_at <= v_now)
          and (unit_link.ends_at is null or unit_link.ends_at > v_now)
          and permission_row.code = 'HR:workflows.approve'
      ) then
        v_error := jsonb_build_object(
          'ok', false,
          'error_code', 'ACTOR_INVALID',
          'message', 'Aprovador nao possui permissao de RH para esta unidade.',
          'retryable', false
        );
        exit approve_step_phase;
      end if;

      if v_step_record.assigned_to_user_id is not null
        and v_step_record.assigned_to_user_id <> p_actor_user_id then
        v_error := jsonb_build_object(
          'ok', false,
          'error_code', 'STEP_NOT_ASSIGNED_TO_ACTOR',
          'message', 'Etapa atribuida a outro responsavel.',
          'retryable', false
        );
        exit approve_step_phase;
      end if;
    end approve_step_phase;

    if v_error is not null then
      update public.hr_workflow_idempotency_keys
      set status = 'failed',
          response_snapshot = null,
          error_snapshot = v_error,
          updated_at = now()
      where id = v_idempotency.id;

      return v_error;
    end if;

    begin
      v_event_ids := array[]::uuid[];
      v_workflow_id := v_workflow.id;
      v_workflow_status := v_workflow.status;
      v_workflow_visibility := v_workflow.visibility_scope;
      v_workflow_sensitive := v_workflow.is_sensitive;
      v_employee_id := v_workflow.employee_id;

      update public.hr_workflow_steps
      set status = 'completed',
          completed_at = v_now,
          completed_by = p_actor_user_id,
          approved_at = v_now,
          approved_by = p_actor_user_id,
          updated_by = p_actor_user_id,
          updated_at = v_now
      where id = v_step_record.id
      returning id into v_completed_step_id;

      insert into public.hr_workflow_events (
        organization_id,
        unit_id,
        workflow_id,
        workflow_step_id,
        employee_id,
        event_scope,
        event_type,
        from_status,
        to_status,
        summary,
        details,
        visibility_scope,
        is_sensitive,
        actor_user_id,
        occurred_at,
        event_payload,
        created_by,
        updated_by
      )
      values (
        p_organization_id,
        p_unit_id,
        v_workflow_id,
        v_completed_step_id,
        v_employee_id,
        'step',
        'workflow_approved',
        v_step_record.status,
        'completed',
        'Etapa aprovada',
        v_notes,
        v_workflow_visibility,
        v_workflow_sensitive,
        p_actor_user_id,
        v_now,
        jsonb_build_object(
          'step_id', v_completed_step_id,
          'step_code', v_step_record.step_code,
          'approval_kind', 'approved',
          'notes_present', v_notes is not null
        ),
        p_actor_user_id,
        p_actor_user_id
      )
      returning id into v_event_id;
      v_event_ids := array_append(v_event_ids, v_event_id);

      select *
      into v_next_step
      from public.hr_workflow_steps step
      where step.workflow_id = p_workflow_id
        and step.organization_id = p_organization_id
        and step.unit_id = p_unit_id
        and step.deleted_at is null
        and step.status = 'pending'
      order by step.step_order asc, step.created_at asc
      limit 1
      for update;

      if found then
        v_next_step_status := case
          when v_next_step.requires_approval then 'waiting_approval'
          else 'in_progress'
        end;
        v_workflow_status := v_next_step_status;
        v_current_step_id := v_next_step.id;

        update public.hr_workflow_steps
        set status = v_next_step_status,
            started_at = coalesce(started_at, v_now),
            updated_by = p_actor_user_id,
            updated_at = v_now
        where id = v_next_step.id;

        update public.hr_workflows
        set status = v_workflow_status,
            updated_by = p_actor_user_id,
            updated_at = v_now
        where id = v_workflow_id;

        insert into public.hr_workflow_events (
          organization_id,
          unit_id,
          workflow_id,
          workflow_step_id,
          employee_id,
          event_scope,
          event_type,
          from_status,
          to_status,
          summary,
          visibility_scope,
          is_sensitive,
          actor_user_id,
          occurred_at,
          event_payload,
          created_by,
          updated_by
        )
        values (
          p_organization_id,
          p_unit_id,
          v_workflow_id,
          v_current_step_id,
          v_employee_id,
          'step',
          'step_started',
          'pending',
          v_next_step_status,
          'Proxima etapa aberta',
          v_workflow_visibility,
          v_workflow_sensitive,
          p_actor_user_id,
          v_now,
          jsonb_build_object(
            'step_id', v_current_step_id,
            'step_status', v_next_step_status
          ),
          p_actor_user_id,
          p_actor_user_id
        )
        returning id into v_event_id;
        v_event_ids := array_append(v_event_ids, v_event_id);
      else
        v_workflow_status := 'completed';
        v_current_step_id := null;

        update public.hr_workflows
        set status = 'completed',
            completed_at = v_now,
            completed_by = p_actor_user_id,
            updated_by = p_actor_user_id,
            updated_at = v_now
        where id = v_workflow_id;

        insert into public.hr_workflow_events (
          organization_id,
          unit_id,
          workflow_id,
          employee_id,
          event_scope,
          event_type,
          from_status,
          to_status,
          summary,
          visibility_scope,
          is_sensitive,
          actor_user_id,
          occurred_at,
          event_payload,
          created_by,
          updated_by
        )
        values (
          p_organization_id,
          p_unit_id,
          v_workflow_id,
          v_employee_id,
          'workflow',
          'workflow_completed',
          v_workflow.status,
          'completed',
          'Workflow concluido',
          v_workflow_visibility,
          v_workflow_sensitive,
          p_actor_user_id,
          v_now,
          jsonb_build_object(
            'approved_step_id', v_completed_step_id,
            'workflow_status', 'completed'
          ),
          p_actor_user_id,
          p_actor_user_id
        )
        returning id into v_event_id;
        v_event_ids := array_append(v_event_ids, v_event_id);
      end if;

      v_response := jsonb_build_object(
        'ok', true,
        'action', 'approve_step',
        'workflow_id', v_workflow_id,
        'workflow_status', v_workflow_status,
        'approved_step_id', v_completed_step_id,
        'current_step_id', v_current_step_id,
        'event_ids', to_jsonb(v_event_ids),
        'idempotency', jsonb_build_object(
          'status', 'completed',
          'replayed', false
        )
      );

      update public.hr_workflow_idempotency_keys
      set workflow_id = v_workflow_id,
          status = 'completed',
          response_snapshot = v_response,
          error_snapshot = null,
          updated_at = now()
      where id = v_idempotency.id;

      return v_response;
    exception
      when others then
        v_error := jsonb_build_object(
          'ok', false,
          'error_code', 'INTERNAL_ERROR',
          'message', 'Nao foi possivel aprovar etapa.',
          'retryable', true,
          'idempotency', jsonb_build_object(
            'status', 'failed',
            'replayed', false
          )
        );

        update public.hr_workflow_idempotency_keys
        set status = 'failed',
            response_snapshot = null,
            error_snapshot = v_error,
            updated_at = now()
        where id = v_idempotency.id;

        return v_error;
    end;
  end if;

  if v_action = 'reject_step' then
    <<reject_step_phase>>
    begin
      v_reason := nullif(btrim(coalesce(v_payload->>'reason', '')), '');
      v_notes := nullif(btrim(coalesce(v_payload->>'notes', '')), '');

      if v_reason is null or length(v_reason) < 3 or length(v_reason) > 2000 then
        v_error := jsonb_build_object(
          'ok', false,
          'error_code', 'INVALID_PAYLOAD',
          'message', 'Motivo da rejeicao obrigatorio.',
          'retryable', false
        );
        exit reject_step_phase;
      end if;

      if v_notes is not null and length(v_notes) > 2000 then
        v_error := jsonb_build_object(
          'ok', false,
          'error_code', 'INVALID_PAYLOAD',
          'message', 'Observacao da rejeicao excede o tamanho permitido.',
          'retryable', false
        );
        exit reject_step_phase;
      end if;

      select *
      into v_workflow
      from public.hr_workflows workflow
      where workflow.id = p_workflow_id
        and workflow.organization_id = p_organization_id
        and workflow.unit_id = p_unit_id
        and workflow.deleted_at is null
      for update;

      if not found then
        v_error := jsonb_build_object(
          'ok', false,
          'error_code', 'WORKFLOW_NOT_FOUND',
          'message', 'Workflow nao encontrado.',
          'retryable', false
        );
        exit reject_step_phase;
      end if;

      if v_workflow.status not in ('in_progress', 'waiting_approval') then
        v_error := jsonb_build_object(
          'ok', false,
          'error_code', 'WORKFLOW_STATUS_INVALID',
          'message', 'Workflow nao esta ativo para rejeicao de etapa.',
          'retryable', false
        );
        exit reject_step_phase;
      end if;

      select *
      into v_step_record
      from public.hr_workflow_steps step
      where step.id = p_step_id
        and step.workflow_id = p_workflow_id
        and step.organization_id = p_organization_id
        and step.unit_id = p_unit_id
        and step.deleted_at is null
      for update;

      if not found then
        v_error := jsonb_build_object(
          'ok', false,
          'error_code', 'WORKFLOW_STEP_NOT_FOUND',
          'message', 'Etapa nao encontrada.',
          'retryable', false
        );
        exit reject_step_phase;
      end if;

      if v_step_record.status <> 'waiting_approval'
        or v_step_record.requires_approval is not true then
        v_error := jsonb_build_object(
          'ok', false,
          'error_code', 'STEP_STATUS_INVALID',
          'message', 'Etapa nao esta aguardando aprovacao.',
          'retryable', false
        );
        exit reject_step_phase;
      end if;

      select *
      into v_next_step
      from public.hr_workflow_steps step
      where step.workflow_id = p_workflow_id
        and step.organization_id = p_organization_id
        and step.unit_id = p_unit_id
        and step.deleted_at is null
        and step.status in ('pending', 'in_progress', 'waiting_approval')
      order by step.step_order asc, step.created_at asc
      limit 1
      for update;

      if not found or v_next_step.id <> v_step_record.id then
        v_error := jsonb_build_object(
          'ok', false,
          'error_code', 'STEP_OUT_OF_ORDER',
          'message', 'Rejeite a etapa pendente anterior antes desta etapa.',
          'retryable', false
        );
        exit reject_step_phase;
      end if;

      if not exists (
        select 1
        from public.app_users app_user
        where app_user.id = p_actor_user_id
          and app_user.status = 'active'
          and app_user.deleted_at is null
      ) then
        v_error := jsonb_build_object(
          'ok', false,
          'error_code', 'ACTOR_INVALID',
          'message', 'Aprovador invalido para esta acao.',
          'retryable', false
        );
        exit reject_step_phase;
      end if;

      if not exists (
        select 1
        from public.user_unit_links unit_link
        join public.access_profiles access_profile
          on access_profile.id = unit_link.access_profile_id
         and access_profile.status = 'active'
         and access_profile.deleted_at is null
        join public.profile_permissions profile_permission
          on profile_permission.access_profile_id = access_profile.id
         and profile_permission.is_allowed = true
         and profile_permission.status = 'active'
         and profile_permission.deleted_at is null
        join public.permissions permission_row
          on permission_row.id = profile_permission.permission_id
         and permission_row.status = 'active'
         and permission_row.deleted_at is null
        where unit_link.app_user_id = p_actor_user_id
          and unit_link.unit_id = p_unit_id
          and unit_link.status = 'active'
          and unit_link.deleted_at is null
          and (unit_link.starts_at is null or unit_link.starts_at <= v_now)
          and (unit_link.ends_at is null or unit_link.ends_at > v_now)
          and permission_row.code = 'HR:workflows.approve'
      ) then
        v_error := jsonb_build_object(
          'ok', false,
          'error_code', 'ACTOR_INVALID',
          'message', 'Aprovador nao possui permissao de RH para esta unidade.',
          'retryable', false
        );
        exit reject_step_phase;
      end if;

      if v_step_record.assigned_to_user_id is not null
        and v_step_record.assigned_to_user_id <> p_actor_user_id then
        v_error := jsonb_build_object(
          'ok', false,
          'error_code', 'STEP_NOT_ASSIGNED_TO_ACTOR',
          'message', 'Etapa atribuida a outro responsavel.',
          'retryable', false
        );
        exit reject_step_phase;
      end if;
    end reject_step_phase;

    if v_error is not null then
      update public.hr_workflow_idempotency_keys
      set status = 'failed',
          response_snapshot = null,
          error_snapshot = v_error,
          updated_at = now()
      where id = v_idempotency.id;

      return v_error;
    end if;

    begin
      v_event_ids := array[]::uuid[];
      v_workflow_id := v_workflow.id;
      v_workflow_status := 'rejected';
      v_current_step_id := null;
      v_workflow_visibility := v_workflow.visibility_scope;
      v_workflow_sensitive := v_workflow.is_sensitive;
      v_employee_id := v_workflow.employee_id;

      update public.hr_workflow_steps
      set status = 'cancelled',
          updated_by = p_actor_user_id,
          updated_at = v_now
      where id = v_step_record.id
      returning id into v_completed_step_id;

      update public.hr_workflows
      set status = 'rejected',
          cancelled_at = v_now,
          cancelled_by = p_actor_user_id,
          cancellation_reason = v_reason,
          updated_by = p_actor_user_id,
          updated_at = v_now
      where id = v_workflow_id;

      insert into public.hr_workflow_events (
        organization_id,
        unit_id,
        workflow_id,
        workflow_step_id,
        employee_id,
        event_scope,
        event_type,
        from_status,
        to_status,
        summary,
        details,
        visibility_scope,
        is_sensitive,
        actor_user_id,
        occurred_at,
        event_payload,
        created_by,
        updated_by
      )
      values (
        p_organization_id,
        p_unit_id,
        v_workflow_id,
        v_completed_step_id,
        v_employee_id,
        'step',
        'step_rejected',
        v_step_record.status,
        'cancelled',
        'Etapa rejeitada',
        v_notes,
        v_workflow_visibility,
        v_workflow_sensitive,
        p_actor_user_id,
        v_now,
        jsonb_build_object(
          'step_id', v_completed_step_id,
          'step_code', v_step_record.step_code,
          'rejection_kind', 'rejected',
          'reason_present', true,
          'notes_present', v_notes is not null
        ),
        p_actor_user_id,
        p_actor_user_id
      )
      returning id into v_event_id;
      v_event_ids := array_append(v_event_ids, v_event_id);

      insert into public.hr_workflow_events (
        organization_id,
        unit_id,
        workflow_id,
        employee_id,
        event_scope,
        event_type,
        from_status,
        to_status,
        summary,
        details,
        visibility_scope,
        is_sensitive,
        actor_user_id,
        occurred_at,
        event_payload,
        created_by,
        updated_by
      )
      values (
        p_organization_id,
        p_unit_id,
        v_workflow_id,
        v_employee_id,
        'workflow',
        'workflow_rejected',
        v_workflow.status,
        'rejected',
        'Workflow rejeitado',
        v_reason,
        v_workflow_visibility,
        v_workflow_sensitive,
        p_actor_user_id,
        v_now,
        jsonb_build_object(
          'rejected_step_id', v_completed_step_id,
          'workflow_status', 'rejected',
          'reason_present', true
        ),
        p_actor_user_id,
        p_actor_user_id
      )
      returning id into v_event_id;
      v_event_ids := array_append(v_event_ids, v_event_id);

      v_response := jsonb_build_object(
        'ok', true,
        'action', 'reject_step',
        'workflow_id', v_workflow_id,
        'workflow_status', v_workflow_status,
        'rejected_step_id', v_completed_step_id,
        'current_step_id', v_current_step_id,
        'event_ids', to_jsonb(v_event_ids),
        'idempotency', jsonb_build_object(
          'status', 'completed',
          'replayed', false
        )
      );

      update public.hr_workflow_idempotency_keys
      set workflow_id = v_workflow_id,
          status = 'completed',
          response_snapshot = v_response,
          error_snapshot = null,
          updated_at = now()
      where id = v_idempotency.id;

      return v_response;
    exception
      when others then
        v_error := jsonb_build_object(
          'ok', false,
          'error_code', 'INTERNAL_ERROR',
          'message', 'Nao foi possivel rejeitar etapa.',
          'retryable', true,
          'idempotency', jsonb_build_object(
            'status', 'failed',
            'replayed', false
          )
        );

        update public.hr_workflow_idempotency_keys
        set status = 'failed',
            response_snapshot = null,
            error_snapshot = v_error,
            updated_at = now()
        where id = v_idempotency.id;

        return v_error;
    end;
  end if;

  <<validation_phase>>
  begin
    v_workflow_type := nullif(btrim(coalesce(v_payload->>'workflow_type', '')), '');
    v_title := nullif(btrim(coalesce(v_payload->>'title', '')), '');
    v_description := nullif(btrim(coalesce(v_payload->>'description', '')), '');
    v_priority := coalesce(nullif(btrim(coalesce(v_payload->>'priority', '')), ''), 'normal');
    v_metadata := coalesce(v_payload->'metadata', '{}'::jsonb);
    v_steps := v_payload->'steps';

    if v_workflow_type is null
      or v_workflow_type not in (
      'admission',
      'termination',
      'transfer',
      'promotion',
      'job_position_change',
      'training',
      'vacation',
      'absence',
      'warning',
      'equipment_delivery',
      'general_note'
    ) then
      v_error := jsonb_build_object(
        'ok', false,
        'error_code', 'WORKFLOW_TYPE_NOT_ALLOWED',
        'message', 'Tipo de workflow nao permitido.',
        'retryable', false
      );
      exit validation_phase;
    end if;

    if v_title is null or length(v_title) > 180 then
      v_error := jsonb_build_object(
        'ok', false,
        'error_code', 'INVALID_PAYLOAD',
        'message', 'Titulo do workflow invalido.',
        'retryable', false
      );
      exit validation_phase;
    end if;

    if v_description is not null and length(v_description) > 2000 then
      v_error := jsonb_build_object(
        'ok', false,
        'error_code', 'INVALID_PAYLOAD',
        'message', 'Descricao do workflow muito longa.',
        'retryable', false
      );
      exit validation_phase;
    end if;

    if v_priority not in ('low', 'normal', 'high', 'critical') then
      v_error := jsonb_build_object(
        'ok', false,
        'error_code', 'INVALID_PAYLOAD',
        'message', 'Prioridade invalida.',
        'retryable', false
      );
      exit validation_phase;
    end if;

    if jsonb_typeof(v_metadata) <> 'object' then
      v_error := jsonb_build_object(
        'ok', false,
        'error_code', 'INVALID_PAYLOAD',
        'message', 'Metadata invalida.',
        'retryable', false
      );
      exit validation_phase;
    end if;

    if octet_length(v_metadata::text) > 16384 then
      v_error := jsonb_build_object(
        'ok', false,
        'error_code', 'INVALID_PAYLOAD',
        'message', 'Metadata excede o tamanho permitido.',
        'retryable', false
      );
      exit validation_phase;
    end if;

    v_employee_id_text := nullif(btrim(coalesce(v_payload->>'employee_id', '')), '');
    if v_employee_id_text is not null then
      if v_employee_id_text !~* v_uuid_pattern then
        v_error := jsonb_build_object(
          'ok', false,
          'error_code', 'INVALID_PAYLOAD',
          'message', 'employee_id invalido.',
          'retryable', false
        );
        exit validation_phase;
      end if;
      v_employee_id := v_employee_id_text::uuid;
    end if;

    if v_employee_id is null
      and v_workflow_type not in ('admission', 'training', 'general_note') then
      v_error := jsonb_build_object(
        'ok', false,
        'error_code', 'WORKFLOW_EMPLOYEE_REQUIRED',
        'message', 'Colaborador obrigatorio para este tipo de workflow.',
        'retryable', false
      );
      exit validation_phase;
    end if;

    v_responsible_user_id_text := nullif(btrim(coalesce(v_payload->>'responsible_user_id', '')), '');
    if v_responsible_user_id_text is not null then
      if v_responsible_user_id_text !~* v_uuid_pattern then
        v_error := jsonb_build_object(
          'ok', false,
          'error_code', 'INVALID_PAYLOAD',
          'message', 'responsible_user_id invalido.',
          'retryable', false
        );
        exit validation_phase;
      end if;
      v_responsible_user_id := v_responsible_user_id_text::uuid;
    end if;

    v_due_at_text := nullif(btrim(coalesce(v_payload->>'due_at', '')), '');
    if v_due_at_text is not null then
      begin
        v_due_at := v_due_at_text::timestamptz;
      exception
        when others then
          v_error := jsonb_build_object(
            'ok', false,
            'error_code', 'INVALID_PAYLOAD',
            'message', 'due_at invalido.',
            'retryable', false
          );
          exit validation_phase;
      end;
    end if;

    if coalesce(jsonb_typeof(v_steps), '') <> 'array' then
      v_error := jsonb_build_object(
        'ok', false,
        'error_code', 'INVALID_PAYLOAD',
        'message', 'steps deve ser um array.',
        'retryable', false
      );
      exit validation_phase;
    end if;

    v_step_count := jsonb_array_length(v_steps);

    if v_step_count < 1 then
      v_error := jsonb_build_object(
        'ok', false,
        'error_code', 'INVALID_PAYLOAD',
        'message', 'steps deve conter ao menos uma etapa.',
        'retryable', false
      );
      exit validation_phase;
    end if;

    if v_step_count > 20 then
      v_error := jsonb_build_object(
        'ok', false,
        'error_code', 'INVALID_PAYLOAD',
        'message', 'steps excede o limite de 20 etapas.',
        'retryable', false
      );
      exit validation_phase;
    end if;

    for v_step in
      select value
      from jsonb_array_elements(v_steps) as step_items(value)
    loop
      if jsonb_typeof(v_step) <> 'object' then
        v_error := jsonb_build_object(
          'ok', false,
          'error_code', 'INVALID_PAYLOAD',
          'message', 'Step invalido.',
          'retryable', false
        );
        exit validation_phase;
      end if;

      if coalesce(v_step->>'step_order', '') !~ '^[0-9]+$'
        or length(coalesce(v_step->>'step_order', '')) > 9 then
        v_error := jsonb_build_object(
          'ok', false,
          'error_code', 'INVALID_PAYLOAD',
          'message', 'step_order invalido.',
          'retryable', false
        );
        exit validation_phase;
      end if;

      v_step_order := (v_step->>'step_order')::integer;
      v_step_key := nullif(btrim(coalesce(v_step->>'step_key', v_step->>'step_code', '')), '');
      v_step_title := nullif(btrim(coalesce(v_step->>'title', '')), '');
      v_step_description := nullif(btrim(coalesce(v_step->>'description', '')), '');

      if v_step_order < 1
        or v_step_key is null
        or v_step_key !~ '^[A-Z0-9_.-]{2,80}$'
        or v_step_title is null
        or length(v_step_title) > 180 then
        v_error := jsonb_build_object(
          'ok', false,
          'error_code', 'INVALID_PAYLOAD',
          'message', 'Step contem campos obrigatorios invalidos.',
          'retryable', false
        );
        exit validation_phase;
      end if;

      if v_step_description is not null and length(v_step_description) > 500 then
        v_error := jsonb_build_object(
          'ok', false,
          'error_code', 'INVALID_PAYLOAD',
          'message', 'Descricao do step muito longa.',
          'retryable', false
        );
        exit validation_phase;
      end if;

      if v_step_order = any(v_seen_orders) or v_step_key = any(v_seen_keys) then
        v_error := jsonb_build_object(
          'ok', false,
          'error_code', 'INVALID_PAYLOAD',
          'message', 'Steps contem ordem ou chave duplicada.',
          'retryable', false
        );
        exit validation_phase;
      end if;

      v_seen_orders := array_append(v_seen_orders, v_step_order);
      v_seen_keys := array_append(v_seen_keys, v_step_key);

      if v_step ? 'requires_approval'
        and jsonb_typeof(v_step->'requires_approval') <> 'boolean' then
        v_error := jsonb_build_object(
          'ok', false,
          'error_code', 'INVALID_PAYLOAD',
          'message', 'requires_approval invalido.',
          'retryable', false
        );
        exit validation_phase;
      end if;

      v_step_assigned_to_text := nullif(btrim(coalesce(v_step->>'assigned_to_user_id', '')), '');
      if v_step_assigned_to_text is not null then
        if v_step_assigned_to_text !~* v_uuid_pattern then
          v_error := jsonb_build_object(
            'ok', false,
            'error_code', 'INVALID_PAYLOAD',
            'message', 'assigned_to_user_id invalido.',
            'retryable', false
          );
          exit validation_phase;
        end if;

        if not exists (
          select 1
          from public.app_users app_user
          where app_user.id = v_step_assigned_to_text::uuid
            and app_user.deleted_at is null
        ) then
          v_error := jsonb_build_object(
            'ok', false,
            'error_code', 'INVALID_PAYLOAD',
            'message', 'assigned_to_user_id nao encontrado.',
            'retryable', false
          );
          exit validation_phase;
        end if;
      end if;

      v_step_metadata := coalesce(v_step->'metadata', '{}'::jsonb);
      if jsonb_typeof(v_step_metadata) <> 'object' then
        v_error := jsonb_build_object(
          'ok', false,
          'error_code', 'INVALID_PAYLOAD',
          'message', 'Metadata do step invalida.',
          'retryable', false
        );
        exit validation_phase;
      end if;

      if octet_length(v_step_metadata::text) > 8192 then
        v_error := jsonb_build_object(
          'ok', false,
          'error_code', 'INVALID_PAYLOAD',
          'message', 'Metadata do step excede o tamanho permitido.',
          'retryable', false
        );
        exit validation_phase;
      end if;
    end loop;

    if array_position(v_seen_orders, 1) is null then
      v_error := jsonb_build_object(
        'ok', false,
        'error_code', 'INVALID_PAYLOAD',
        'message', 'A primeira etapa deve ter step_order 1.',
        'retryable', false
      );
      exit validation_phase;
    end if;

    if not exists (
      select 1
      from public.units unit_row
      where unit_row.id = p_unit_id
        and unit_row.organization_id = p_organization_id
        and unit_row.status = 'active'
        and unit_row.deleted_at is null
    ) then
      v_error := jsonb_build_object(
        'ok', false,
        'error_code', 'INVALID_PAYLOAD',
        'message', 'Unidade invalida para a organizacao informada.',
        'retryable', false
      );
      exit validation_phase;
    end if;

    if not exists (
      select 1
      from public.app_users app_user
      where app_user.id = p_actor_user_id
        and app_user.deleted_at is null
    ) then
      v_error := jsonb_build_object(
        'ok', false,
        'error_code', 'INVALID_PAYLOAD',
        'message', 'Ator invalido.',
        'retryable', false
      );
      exit validation_phase;
    end if;

    if v_responsible_user_id is not null
      and not exists (
        select 1
        from public.app_users app_user
        where app_user.id = v_responsible_user_id
          and app_user.deleted_at is null
      ) then
      v_error := jsonb_build_object(
        'ok', false,
        'error_code', 'INVALID_PAYLOAD',
        'message', 'Responsavel invalido.',
        'retryable', false
      );
      exit validation_phase;
    end if;

    if v_employee_id is not null
      and not exists (
        select 1
        from public.employees employee
        where employee.id = v_employee_id
          and employee.organization_id = p_organization_id
          and employee.unit_id = p_unit_id
          and employee.deleted_at is null
      ) then
      v_error := jsonb_build_object(
        'ok', false,
        'error_code', 'INVALID_PAYLOAD',
        'message', 'Colaborador invalido para a unidade informada.',
        'retryable', false
      );
      exit validation_phase;
    end if;
  end validation_phase;

  if v_error is not null then
    update public.hr_workflow_idempotency_keys
    set status = 'failed',
        response_snapshot = null,
        error_snapshot = v_error,
        updated_at = now()
    where id = v_idempotency.id;

    return v_error;
  end if;

  begin
    select
      (step_item.value->>'step_order')::integer,
      coalesce((step_item.value->>'requires_approval')::boolean, false)
    into v_first_order, v_first_requires_approval
    from jsonb_array_elements(v_steps) as step_item(value)
    order by (step_item.value->>'step_order')::integer
    limit 1;

    v_first_step_status := case
      when v_first_requires_approval then 'waiting_approval'
      else 'in_progress'
    end;
    v_workflow_status := case
      when v_first_requires_approval then 'waiting_approval'
      else 'in_progress'
    end;
    v_workflow_sensitive := v_workflow_type in ('termination', 'absence', 'warning');
    v_workflow_visibility := case
      when v_workflow_sensitive then 'restricted'
      else 'unit'
    end;

    insert into public.hr_workflows (
      organization_id,
      unit_id,
      employee_id,
      workflow_type,
      title,
      description,
      status,
      priority,
      visibility_scope,
      is_sensitive,
      initiated_by,
      responsible_user_id,
      due_at,
      started_at,
      metadata,
      created_by,
      updated_by
    )
    values (
      p_organization_id,
      p_unit_id,
      v_employee_id,
      v_workflow_type,
      v_title,
      v_description,
      v_workflow_status,
      v_priority,
      v_workflow_visibility,
      v_workflow_sensitive,
      p_actor_user_id,
      v_responsible_user_id,
      v_due_at,
      v_now,
      v_metadata,
      p_actor_user_id,
      p_actor_user_id
    )
    returning id into v_workflow_id;

    for v_step in
      select value
      from jsonb_array_elements(v_steps) as step_items(value)
      order by (value->>'step_order')::integer
    loop
      v_step_order := (v_step->>'step_order')::integer;
      v_step_key := nullif(btrim(coalesce(v_step->>'step_key', v_step->>'step_code', '')), '');
      v_step_title := nullif(btrim(coalesce(v_step->>'title', '')), '');
      v_step_description := nullif(btrim(coalesce(v_step->>'description', '')), '');
      v_step_requires_approval := coalesce((v_step->>'requires_approval')::boolean, false);
      v_step_assigned_to_text := nullif(btrim(coalesce(v_step->>'assigned_to_user_id', '')), '');
      v_step_assigned_to := case
        when v_step_assigned_to_text is null then null
        else v_step_assigned_to_text::uuid
      end;
      v_step_metadata := coalesce(v_step->'metadata', '{}'::jsonb);

      insert into public.hr_workflow_steps (
        organization_id,
        unit_id,
        workflow_id,
        employee_id,
        step_order,
        step_code,
        title,
        description,
        status,
        requires_approval,
        visibility_scope,
        is_sensitive,
        assigned_to_user_id,
        assigned_at,
        started_at,
        metadata,
        created_by,
        updated_by
      )
      values (
        p_organization_id,
        p_unit_id,
        v_workflow_id,
        v_employee_id,
        v_step_order,
        v_step_key,
        v_step_title,
        v_step_description,
        case
          when v_step_order = v_first_order then v_first_step_status
          else 'pending'
        end,
        v_step_requires_approval,
        v_workflow_visibility,
        v_workflow_sensitive,
        v_step_assigned_to,
        case when v_step_assigned_to is null then null else v_now end,
        case when v_step_order = v_first_order then v_now else null end,
        v_step_metadata,
        p_actor_user_id,
        p_actor_user_id
      )
      returning id into v_inserted_step_id;

      if v_step_order = v_first_order then
        v_current_step_id := v_inserted_step_id;
      end if;
    end loop;

    insert into public.hr_workflow_events (
      organization_id,
      unit_id,
      workflow_id,
      employee_id,
      event_scope,
      event_type,
      to_status,
      summary,
      visibility_scope,
      is_sensitive,
      actor_user_id,
      occurred_at,
      event_payload,
      created_by,
      updated_by
    )
    values (
      p_organization_id,
      p_unit_id,
      v_workflow_id,
      v_employee_id,
      'workflow',
      'workflow_created',
      v_workflow_status,
      'Workflow criado',
      v_workflow_visibility,
      v_workflow_sensitive,
      p_actor_user_id,
      v_now,
      jsonb_build_object(
        'workflow_type', v_workflow_type,
        'workflow_status', v_workflow_status
      ),
      p_actor_user_id,
      p_actor_user_id
    )
    returning id into v_event_id;
    v_event_ids := array_append(v_event_ids, v_event_id);

    insert into public.hr_workflow_events (
      organization_id,
      unit_id,
      workflow_id,
      employee_id,
      event_scope,
      event_type,
      to_status,
      summary,
      visibility_scope,
      is_sensitive,
      actor_user_id,
      occurred_at,
      event_payload,
      created_by,
      updated_by
    )
    values (
      p_organization_id,
      p_unit_id,
      v_workflow_id,
      v_employee_id,
      'workflow',
      'workflow_opened',
      v_workflow_status,
      'Workflow aberto',
      v_workflow_visibility,
      v_workflow_sensitive,
      p_actor_user_id,
      v_now,
      jsonb_build_object(
        'workflow_status', v_workflow_status,
        'current_step_id', v_current_step_id
      ),
      p_actor_user_id,
      p_actor_user_id
    )
    returning id into v_event_id;
    v_event_ids := array_append(v_event_ids, v_event_id);

    insert into public.hr_workflow_events (
      organization_id,
      unit_id,
      workflow_id,
      workflow_step_id,
      employee_id,
      event_scope,
      event_type,
      from_status,
      to_status,
      summary,
      visibility_scope,
      is_sensitive,
      actor_user_id,
      occurred_at,
      event_payload,
      created_by,
      updated_by
    )
    values (
      p_organization_id,
      p_unit_id,
      v_workflow_id,
      v_current_step_id,
      v_employee_id,
      'step',
      'step_started',
      'pending',
      v_first_step_status,
      'Etapa inicial aberta',
      v_workflow_visibility,
      v_workflow_sensitive,
      p_actor_user_id,
      v_now,
      jsonb_build_object(
        'step_id', v_current_step_id,
        'step_status', v_first_step_status
      ),
      p_actor_user_id,
      p_actor_user_id
    )
    returning id into v_event_id;
    v_event_ids := array_append(v_event_ids, v_event_id);

    v_response := jsonb_build_object(
      'ok', true,
      'action', 'create_workflow',
      'workflow_id', v_workflow_id,
      'workflow_status', v_workflow_status,
      'current_step_id', v_current_step_id,
      'event_ids', to_jsonb(v_event_ids),
      'idempotency', jsonb_build_object(
        'status', 'completed',
        'replayed', false
      )
    );

    update public.hr_workflow_idempotency_keys
    set workflow_id = v_workflow_id,
        status = 'completed',
        response_snapshot = v_response,
        error_snapshot = null,
        updated_at = now()
    where id = v_idempotency.id;

    return v_response;
  exception
    when others then
      v_error := jsonb_build_object(
        'ok', false,
        'error_code', 'INTERNAL_ERROR',
        'message', 'Nao foi possivel criar workflow.',
        'retryable', true,
        'idempotency', jsonb_build_object(
          'status', 'failed',
          'replayed', false
        )
      );

      update public.hr_workflow_idempotency_keys
      set status = 'failed',
          response_snapshot = null,
          error_snapshot = v_error,
          updated_at = now()
      where id = v_idempotency.id;

      return v_error;
  end;
end;
$$;

revoke execute on function public.hr_workflow_apply_action(
  text,
  uuid,
  uuid,
  uuid,
  text,
  text,
  jsonb,
  uuid,
  uuid
) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.hr_workflow_apply_action(
      text,
      uuid,
      uuid,
      uuid,
      text,
      text,
      jsonb,
      uuid,
      uuid
    ) from anon;
  end if;

  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke execute on function public.hr_workflow_apply_action(
      text,
      uuid,
      uuid,
      uuid,
      text,
      text,
      jsonb,
      uuid,
      uuid
    ) from authenticated;
  end if;

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.hr_workflow_apply_action(
      text,
      uuid,
      uuid,
      uuid,
      text,
      text,
      jsonb,
      uuid,
      uuid
    ) to service_role;
  end if;
end;
$$;

comment on function public.hr_workflow_apply_action(
  text,
  uuid,
  uuid,
  uuid,
  text,
  text,
  jsonb,
  uuid,
  uuid
) is
  'Workflow engine transacional de RH. Nesta versao suporta create_workflow, execute_step, approve_step e reject_step; demais acoes retornam INVALID_ACTION.';
