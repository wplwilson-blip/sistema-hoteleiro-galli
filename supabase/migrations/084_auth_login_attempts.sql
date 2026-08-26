-- ============================================================================
-- 084 — auth_login_attempts: estado do rate limit do login (#4, plano docs/codex/54)
--
-- NAO APLICADA PELO CODEX. O Wilson aplica: staging primeiro, depois producao.
--
-- POR QUE UMA TABELA DEDICADA, e nao reusar system_logs (avaliado no plano, secao 3):
--   - a consulta do limitador precisaria de indice novo de qualquer jeito -> migration
--     mesmo assim, entao "reaproveita o que existe" nao economiza nada;
--   - `username` mora dentro de `context` jsonb em system_logs: exigiria indice de
--     expressao, e qualquer mudanca no formato do log quebraria o limitador EM SILENCIO;
--   - system_logs pertence a' observabilidade. Quando alguem adicionar expurgo la', a
--     memoria do limitador mudaria sem ninguem perceber. Controle de acesso nao pode
--     depender do ciclo de vida de um log.
--
-- RETENCAO: esta tabela tem vida propria. A janela do limitador e' de 15 minutos; nada
-- aqui serve depois de 30 dias. Ha' uma consulta de expurgo no roteiro abaixo — ainda
-- MANUAL, porque nao existe rotina de expurgo no projeto (verificado nas migrations e no
-- src/). Se um dia houver, esta tabela entra nela.
--
-- Idempotente: `if not exists` em tudo; pode ser reaplicada sem efeito.
-- ============================================================================

create table if not exists public.auth_login_attempts (
  id uuid primary key default gen_random_uuid(),
  -- O username SUBMETIDO, exista a conta ou nao. Contar so' os existentes faria o 429
  -- virar oraculo: "esse nome nunca throttla, logo nao existe".
  username text not null,
  -- Nulo quando x-forwarded-for esta' ausente. Nesse caso vale so' o limite por username.
  ip inet,
  succeeded boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.auth_login_attempts is
  'Tentativas de login para o rate limit (#4). Escrita e leitura APENAS pela service_role: RLS habilitada sem policy (deny-all). Nao e trilha de auditoria -- essa continua em system_logs.';

comment on column public.auth_login_attempts.username is
  'Username SUBMETIDO, exista a conta ou nao. Contar apenas os existentes transformaria o 429 em oraculo de enumeracao.';

comment on column public.auth_login_attempts.ip is
  'Primeiro valor de x-forwarded-for. Nulo quando o header esta ausente -- ai vale somente o limite por username.';

-- Indices sob medida para as DUAS consultas do limitador, e so' elas: falhas por chave
-- dentro da janela. `created_at desc` porque a leitura e' sempre "a partir de agora - 15min".
create index if not exists auth_login_attempts_username_idx
  on public.auth_login_attempts (username, created_at desc);

create index if not exists auth_login_attempts_ip_idx
  on public.auth_login_attempts (ip, created_at desc);

-- RLS HABILITADA E SEM NENHUMA POLICY = deny-all para anon/authenticated.
-- Isto e' deliberado, nao um esquecimento: a service_role ignora RLS (e' quem a rota de
-- login usa), e ninguem mais deve ler nem escrever tentativas de login via PostgREST.
-- Sem esta linha, a tabela ficaria exposta e viraria justamente o que ela existe para
-- combater: uma lista de usernames tentados.
alter table public.auth_login_attempts enable row level security;

-- Cinto e suspensorio: alem do deny-all da RLS, tira o grant padrao dos papeis do
-- PostgREST. Assim a tabela nao aparece nem no schema exposto pela API.
revoke all on table public.auth_login_attempts from anon, authenticated;


-- ============================================================================
-- ROTEIRO DE VALIDACAO (rodar APOS aplicar, em staging antes de producao)
-- ============================================================================
--
-- 1) A tabela existe e tem as 5 colunas esperadas:
--
--    select column_name, data_type, is_nullable
--    from information_schema.columns
--    where table_schema = 'public' and table_name = 'auth_login_attempts'
--    order by ordinal_position;
--    -- esperado: id uuid NO | username text NO | ip inet YES
--    --           succeeded boolean NO | created_at timestamptz NO
--
-- 2) Os dois indices existem:
--
--    select indexname from pg_indexes
--    where schemaname = 'public' and tablename = 'auth_login_attempts';
--    -- esperado: auth_login_attempts_pkey, auth_login_attempts_username_idx,
--    --           auth_login_attempts_ip_idx
--
-- 3) RLS ligada e SEM policy (este e o ponto de seguranca da migration):
--
--    select relrowsecurity from pg_class
--    where oid = 'public.auth_login_attempts'::regclass;
--    -- esperado: t
--
--    select count(*) from pg_policies
--    where schemaname = 'public' and tablename = 'auth_login_attempts';
--    -- esperado: 0   (zero policies = deny-all para anon/authenticated)
--
-- 4) A API REST nao le a tabela. Com a ANON KEY (nao a service_role):
--
--    curl -s "$SUPABASE_URL/rest/v1/auth_login_attempts?select=*" \
--         -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"
--    -- esperado: erro de permissao ou lista vazia. NUNCA linhas.
--
-- 5) Fumaca do fluxo real, na aplicacao ja' com o codigo desta fatia:
--    a) errar a senha uma vez -> deve aparecer 1 linha com succeeded = false;
--    b) acertar a senha       -> deve aparecer 1 linha com succeeded = true;
--    c) errar 10 vezes em menos de 15 min -> a 11a deve responder 429 com Retry-After.
--
--    select username, ip, succeeded, created_at
--    from public.auth_login_attempts
--    order by created_at desc limit 20;
--
--    IMPORTANTE: remover as linhas de teste ao final da validacao em staging:
--    delete from public.auth_login_attempts where username = '<o username usado no teste>';
--
-- 6) Expurgo (manual, periodico — a janela do limitador e' de 15 min):
--
--    delete from public.auth_login_attempts where created_at < now() - interval '30 days';
--
--
-- ============================================================================
-- ROLLBACK (nao executar junto; so' se for preciso desfazer)
-- ============================================================================
--
-- O codigo do limitador FALHA ABERTO: se esta tabela sumir, o login continua
-- funcionando (sem rate limit) e o erro vai para o log. Por isso o rollback e' seguro
-- mesmo com a aplicacao no ar.
--
--   drop index if exists public.auth_login_attempts_ip_idx;
--   drop index if exists public.auth_login_attempts_username_idx;
--   drop table if exists public.auth_login_attempts;
--
-- ============================================================================
