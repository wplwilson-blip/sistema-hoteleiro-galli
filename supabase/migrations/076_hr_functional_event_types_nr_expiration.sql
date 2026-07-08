-- CORE Fatia 2.1 - Evento funcional de vencimento de certificacao NR.
-- Amplia somente o check constraint de employee_functional_events.event_type: adiciona
-- 'nr_expiring' e 'nr_expired' (espelhando aso_expiring/aso_expired). A sensibilidade/visibilidade
-- do evento NAO e' definida aqui (e' derivada do registro no publish helper, fatia de codigo).
-- Nao altera dados, colunas, RLS, policies, triggers, severidade, visibilidade ou status.
-- (Numero 076: 074 fica reservado para o rename da fila - docs/codex/25; 075 e' o desligamento.)

alter table public.employee_functional_events
  drop constraint if exists employee_functional_events_type_check;

alter table public.employee_functional_events
  add constraint employee_functional_events_type_check check (
    event_type in (
      'employee_created',
      'employee_basic_updated',
      'employee_sensitive_updated',
      'unit_changed',
      'department_changed',
      'job_position_changed',
      'document_requested',
      'document_uploaded',
      'document_verified',
      'document_rejected',
      'document_expired',
      'document_replaced',
      'document_waived',
      'admission_started',
      'admission_completed',
      'termination_started',
      'termination_completed',
      'training_registered',
      'warning_registered',
      'vacation_registered',
      'note_added',
      'onboarding_created',
      'onboarding_started',
      'onboarding_item_started',
      'onboarding_item_completed',
      'onboarding_item_blocked',
      'onboarding_item_waived',
      'onboarding_completed',
      'onboarding_cancelled',
      'evaluation_created',
      'evaluation_started',
      'evaluation_submitted',
      'evaluation_reviewed',
      'evaluation_feedback_given',
      'evaluation_acknowledged',
      'evaluation_closed',
      'evaluation_cancelled',
      'development_plan_created',
      'development_plan_item_created',
      'development_plan_item_completed',
      'development_plan_item_overdue',
      'development_plan_reviewed',
      'development_plan_completed',
      'development_plan_cancelled',
      'salary_changed',
      'promotion_registered',
      'transfer_registered',
      'suspension_registered',
      'complaint_registered',
      'compliment_registered',
      'formal_guidance_registered',
      'formal_conversation_registered',
      'training_required',
      'training_completed',
      'training_certificate_uploaded',
      'training_expiring',
      'training_expired',
      'training_retraining_required',
      'aso_requested',
      'aso_completed',
      'aso_expiring',
      'aso_expired',
      'nr_expiring',
      'nr_expired',
      'occupational_restriction_registered',
      'occupational_exam_registered',
      'termination_checklist_created',
      'termination_pending_item_registered',
      'employee_inactivated'
    )
  );
