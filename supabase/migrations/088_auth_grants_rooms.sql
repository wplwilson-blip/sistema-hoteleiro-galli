-- ============================================================================
-- 088 — Permissoes do modulo Apartamentos (UHs) e concessao aos perfis
--
-- NAO APLICADA PELO CODEX. O Wilson aplica nos DOIS bancos (staging e producao).
--
-- SEED/GRANTS APENAS. Nao altera Auth, login, auth_email, RLS, policies nem schema.
-- Espelha o padrao da 064_auth_grants_base_purchases_attachments.sql.
--
-- As constantes TypeScript correspondentes NAO entram aqui: vem na Fase 1, junto do
-- codigo que as consome. Uma permissao semeada sem consumidor nao faz nada -- e' so'
-- linha de catalogo -- entao a ordem segura e' banco primeiro, codigo depois.
--
-- Formato conferido contra public.permissions (003:91-108):
--   code e' GERADO: module_code || ':' || action_code (coluna stored, unique).
--   check module_code ~ '^[A-Z0-9_]{2,30}$'   -> 'BASE' passa.
--   check action_code ~ '^[a-z0-9_.-]{2,60}$' -> 'rooms.view', 'rooms.block' e
--                                                'rooms.manage' passam (o ponto e' aceito).
--
-- Idempotente: reexecutavel sem duplicar.
-- ============================================================================


-- ============================================================================
-- A) As 3 permissoes do modulo
--
-- `on conflict (code) do update`: reaplicar corrige nome/descricao e REATIVA a permissao
-- (status/deleted_at), igual a 064. O catalogo de permissoes e' definicao do sistema, nao
-- configuracao do cliente -- aqui a migration e' a fonte da verdade.
-- ============================================================================

insert into public.permissions (module_code, action_code, name, description)
values
  ('BASE', 'rooms.view',   'Ver apartamentos',        'Permite consultar a lista e o mapa de apartamentos (UHs) no escopo permitido.'),
  ('BASE', 'rooms.block',  'Bloquear apartamentos',   'Permite bloquear e desbloquear apartamento para manutencao ou reforma no escopo permitido.'),
  ('BASE', 'rooms.manage', 'Gerenciar apartamentos',  'Permite editar o cadastro do apartamento (tipo, comodidades, conjugada, capacidade) no escopo permitido.')
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  status = 'active',
  deleted_at = null,
  deleted_by = null,
  updated_at = now();


-- ============================================================================
-- B) Concessao aos perfis
--
-- Perfis conferidos contra os que EXISTEM de verdade (semeados na 010_seed_base_data.sql):
--   SUPER_ADMIN, NETWORK_MANAGER, UNIT_DIRECTOR, DEPARTMENT_MANAGER, SUPERVISOR,
--   FINANCE, AUDIT, EMPLOYEE, EXTERNAL_TECHNICIAN.
-- (HR_OPERATOR/HR_SUPERVISOR/HR_SENSITIVE_VIEWER vem da 045 e COMPRAS da 064; nenhum
--  deles entra nesta matriz.)
--
-- Racional da matriz:
--   view   -> quem precisa enxergar o inventario, incluindo AUDIT (le tudo, muda nada) e
--             NETWORK_MANAGER (visao corporativa).
--   block  -> operacao do dia a dia: tirar/devolver UH de servico. NAO inclui AUDIT nem
--             NETWORK_MANAGER -- auditoria nao opera, e a rede nao bloqueia UH de unidade.
--   manage -> altera o CADASTRO (tipo, capacidade, conjugada). O mais restrito: nao inclui
--             SUPERVISOR, que opera o mapa mas nao redefine o inventario.
--
-- `on conflict do nothing` nos grants (e nao `do update` como na 064): se alguem REVOGOU
-- deliberadamente uma dessas permissoes de um perfil, reexecutar esta migration NAO
-- restaura a concessao em silencio. Divergencia consciente do padrao da 064 -- ver o
-- resumo da entrega.
-- ============================================================================

with profile_permission_matrix(profile_code, permission_code) as (
  values
    -- BASE:rooms.view
    ('SUPER_ADMIN',        'BASE:rooms.view'),
    ('NETWORK_MANAGER',    'BASE:rooms.view'),
    ('UNIT_DIRECTOR',      'BASE:rooms.view'),
    ('DEPARTMENT_MANAGER', 'BASE:rooms.view'),
    ('SUPERVISOR',         'BASE:rooms.view'),
    ('AUDIT',              'BASE:rooms.view'),

    -- BASE:rooms.block
    ('SUPER_ADMIN',        'BASE:rooms.block'),
    ('UNIT_DIRECTOR',      'BASE:rooms.block'),
    ('DEPARTMENT_MANAGER', 'BASE:rooms.block'),
    ('SUPERVISOR',         'BASE:rooms.block'),

    -- BASE:rooms.manage
    ('SUPER_ADMIN',        'BASE:rooms.manage'),
    ('UNIT_DIRECTOR',      'BASE:rooms.manage'),
    ('DEPARTMENT_MANAGER', 'BASE:rooms.manage')
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
on conflict (access_profile_id, permission_id) do nothing;


-- ============================================================================
-- VALIDACAO (rodar APOS aplicar, staging antes de producao)
-- ============================================================================
--
-- 1) As 3 permissoes existem e estao ativas:
--
--    select code, name, description, status
--    from public.permissions
--    where module_code = 'BASE' and action_code like 'rooms.%'
--    order by code;
--    -- esperado: 3 linhas (BASE:rooms.block, BASE:rooms.manage, BASE:rooms.view),
--    --           todas com status = 'active'
--
-- 2) A matriz concedida, perfil x permissao:
--
--    select ap.code as perfil, p.code as permissao, pp.is_allowed, pp.status
--    from public.profile_permissions pp
--    join public.access_profiles ap on ap.id = pp.access_profile_id
--    join public.permissions p      on p.id  = pp.permission_id
--    where p.module_code = 'BASE' and p.action_code like 'rooms.%'
--      and pp.deleted_at is null
--    order by p.code, ap.code;
--
--    -- esperado (13 linhas):
--    --   BASE:rooms.block  -> DEPARTMENT_MANAGER, SUPERVISOR, SUPER_ADMIN, UNIT_DIRECTOR
--    --   BASE:rooms.manage -> DEPARTMENT_MANAGER, SUPER_ADMIN, UNIT_DIRECTOR
--    --   BASE:rooms.view   -> AUDIT, DEPARTMENT_MANAGER, NETWORK_MANAGER, SUPERVISOR,
--    --                        SUPER_ADMIN, UNIT_DIRECTOR
--
-- 3) Contagem rapida por permissao (confere a matriz de uma olhada):
--
--    select p.code, count(*) as perfis
--    from public.profile_permissions pp
--    join public.permissions p on p.id = pp.permission_id
--    where p.module_code = 'BASE' and p.action_code like 'rooms.%'
--      and pp.deleted_at is null and pp.status = 'active'
--    group by p.code order by p.code;
--    -- esperado: block = 4 | manage = 3 | view = 6
--
-- 4) Nenhum perfil da matriz ficou de fora por nao existir (deve voltar VAZIO):
--
--    with esperado(profile_code) as (
--      values ('SUPER_ADMIN'), ('NETWORK_MANAGER'), ('UNIT_DIRECTOR'),
--             ('DEPARTMENT_MANAGER'), ('SUPERVISOR'), ('AUDIT')
--    )
--    select e.profile_code
--    from esperado e
--    left join public.access_profiles ap
--      on ap.code = e.profile_code and ap.status = 'active' and ap.deleted_at is null
--    where ap.id is null;
--    -- Se voltar alguma linha, aquele perfil NAO existe no banco e os grants dele foram
--    -- silenciosamente descartados pelo inner join do passo B.
--
--
-- ============================================================================
-- ROLLBACK (nao executar junto; so' se for preciso desfazer)
-- ============================================================================
--
-- Revoga os grants e desativa as permissoes. NAO usa `delete` nas permissoes: elas sao
-- referenciadas por profile_permissions com `on delete restrict`, e um delete falharia --
-- alem de apagar historico. Desativar e' o equivalente seguro.
--
--   delete from public.profile_permissions pp
--   using public.permissions p
--   where p.id = pp.permission_id
--     and p.module_code = 'BASE'
--     and p.action_code in ('rooms.view', 'rooms.block', 'rooms.manage');
--
--   update public.permissions
--   set status = 'inactive', deleted_at = now(), updated_at = now()
--   where module_code = 'BASE'
--     and action_code in ('rooms.view', 'rooms.block', 'rooms.manage');
--
-- ============================================================================
