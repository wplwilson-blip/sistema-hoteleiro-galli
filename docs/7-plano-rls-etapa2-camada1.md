# Plano — RLS Etapa 2, Camada 1: RH sensível por unidade (defesa em profundidade)

> **Objetivo:** dar policy RLS às tabelas do NÚCLEO SENSÍVEL de RH, que hoje têm RLS
> habilitado mas SEM policy (ficaram de fora da Etapa 1 / migration 066).
> **Decisão de arquitetura (Wilson):** fazer em DUAS CAMADAS.
>   - CAMADA 1 (este plano): escopo por UNIDADE (user_has_unit_access), igual ao padrão da 066.
>     Já blinda o pior risco: acesso a dado sensível de RH de OUTRA unidade/hotel.
>   - CAMADA 2 (plano futuro, separado): exigir também permissão sensível específica
>     (HR:*.sensitive.view) via helper SQL novo. NÃO entra agora.
> **Importante:** a permissão sensível CONTINUA sendo checada na aplicação (api-auth.ts) como hoje.
> Esta camada NÃO afrouxa nada — só adiciona a trava de unidade no banco.
> **Área SENSÍVEL:** migration + RLS → plano antes do código. Regra de ouro: aplicar nos 2 bancos.

---

## 1. Escopo — tabelas do núcleo sensível (10)

Com unit_id direto (policy: user_has_unit_access(unit_id)):
- employee_documents
- employee_document_links
- employee_occupational_records   (saúde ocupacional / ASO)
- employee_nr_certifications       (certificações NR / SST)
- employee_conduct_records         (condutas / disciplina)
- employee_terminations            (rescisões)
- employee_evaluations             (avaliações)
- employee_evaluation_scores       (notas de avaliação)

Tabelas FILHAS sem unit_id (policy via EXISTS no pai, padrão das filhas de compras na 066):
- employee_conduct_reviews        -> pai employee_conduct_records (conduct_record_id)
- employee_termination_checklists -> pai employee_terminations (termination_id)

(employee_evaluation_scores: confirmar se tem unit_id próprio ou se é filha de employee_evaluations.
 O grep indicou unit_id=1, então tratar como unit_id direto; o Claude Code deve confirmar no schema.)

## 2. Regra das policies

- Role: authenticated (service_role continua bypassando, intacto).
- SELECT/INSERT/UPDATE restritos ao escopo de unidade do usuário.
- Tabelas com unit_id: using/with check = public.user_has_unit_access(unit_id).
- Tabelas filhas: using/with check = EXISTS (select 1 from <pai> p where p.id = <fk>
    and public.user_has_unit_access(p.unit_id)).
- SEM policy de DELETE (igual 066; soft delete é via UPDATE).
- NÃO mexer em tabela, estrutura, trigger, nem nas policies da 066.

## 3. Migration

- Arquivo novo: supabase/migrations/069_rls_policies_hr_sensitive_core.sql
- Só CREATE POLICY (RLS já está habilitado nessas tabelas). Idempotente onde possível
  (drop policy if exists antes de create, no mesmo padrão que a 066 usou).

## 4. Restrições (NAO_ALTERAR)

- Não editar 066 nem migrations aplicadas. Migration nova (069).
- Não alterar Auth/login/RLS helpers existentes (reusar user_has_unit_access).
- service_role intacto. Não criar policy para anon.
- Não tocar na lógica de permissão sensível da aplicação (camada 2, depois).

## 5. Teste (staging primeiro — regra de ouro depois)

1. Usuário restrito à unidade A NÃO vê employee_documents/occupational/etc. da unidade B (via anon/authenticated key, script de teste como o usado na 067).
2. Usuário da unidade A vê os registros sensíveis da unidade A (não bloqueou indevidamente).
3. As tabelas filhas (conduct_reviews, termination_checklists) seguem o pai corretamente.
4. service_role (app com chave clássica) continua vendo tudo — app de RH não quebra.
5. IMPORTANTE: validar que o módulo de RH na interface continua funcionando logado
   (não cair em tela vazia / erro), porque a app usa service_role e não pode ser afetada.

## 6. Critério de aceite

- As 10 tabelas do núcleo sensível têm policy de unidade.
- Acesso cross-unidade bloqueado na camada de banco.
- service_role e app intactos; RH não quebra.
- Migration roda nos 2 bancos sem erro. Lint/build não se aplicam (é SQL).

## 7. O que fica para a Camada 2 (NÃO agora)

- Helper SQL para checar HR:*.sensitive.view por unidade.
- Policies que exigem a permissão sensível além da unidade.
- Mapear cada tabela -> permissão sensível correspondente (employees.sensitive.view,
  occupational.sensitive.view, conduct.sensitive.view, terminations.sensitive.view, etc.).
