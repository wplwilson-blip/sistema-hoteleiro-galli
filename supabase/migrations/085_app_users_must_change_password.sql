-- ============================================================================
-- 085 — app_users.must_change_password: troca de senha obrigatoria (#C7, plano docs/codex/65)
--
-- NAO APLICADA PELO CODEX. O Wilson aplica: staging primeiro, depois producao.
--
-- ATENCAO A ORDEM: esta migration tem de ser aplicada ANTES do merge do codigo.
-- Diferente do rate limit (#4), esta fatia NAO falha aberta: getSessionContextByAuthUserId
-- passa a incluir `must_change_password` no select de app_users, e essa funcao sustenta
-- TODA sessao autenticada. Codigo no ar sem a coluna = ninguem consegue usar o sistema.
--
-- POR QUE COLUNA DEDICADA, e nao uma chave em jsonb: e' flag de CONTROLE DE AUTH, lida em
-- todo carregamento de sessao. Coluna booleana e' indexavel, tipada e obvia na leitura do
-- schema; dentro de jsonb ficaria invisivel para quem inspeciona a tabela e sujeita a
-- quebra silenciosa se o formato do documento mudar.
--
-- SEM MUDANCA DE RLS: app_users ja' existe com suas politicas. Adicionar coluna nao as
-- altera, e esta coluna nao muda quem pode ler ou escrever a linha.
--
-- DEFAULT false DE PROPOSITO: preserva os usuarios atuais. Ninguem e' forcado a trocar
-- retroativamente (decisao aprovada). A flag so' nasce `true` para quem for criado ou
-- tiver a senha resetada por um admin DEPOIS desta fatia.
--
-- Idempotente: `add column if not exists`.
-- ============================================================================

alter table public.app_users
  add column if not exists must_change_password boolean not null default false;

comment on column public.app_users.must_change_password is
  'Flag de controle de AUTH (nao de cadastro). true obriga o usuario a passar pela tela de troca de senha antes de usar o sistema. Armada ao criar usuario e ao admin resetar a senha -- nos dois casos a senha e conhecida por outra pessoa, entao e temporaria por definicao. Limpa pela propria troca (POST /api/auth/change-password). default false preserva os usuarios existentes.';


-- ============================================================================
-- VALIDACAO (rodar APOS aplicar, staging antes de producao)
-- ============================================================================
--
-- 1) A coluna existe, e' NOT NULL e tem default false:
--
--    select column_name, data_type, is_nullable, column_default
--    from information_schema.columns
--    where table_schema = 'public' and table_name = 'app_users'
--      and column_name = 'must_change_password';
--    -- esperado: boolean | NO | false
--
-- 2) NENHUM usuario existente foi forcado a trocar (o ponto da decisao "sem retroativo"):
--
--    select count(*) from public.app_users where must_change_password = true;
--    -- esperado: 0  (imediatamente apos aplicar a migration)
--
-- 3) O restante do roteiro (usuario novo e' forcado, reset re-arma a flag, senha atual
--    errada -> 401, troca voluntaria, a rota so' age sobre o proprio usuario) esta' em
--    docs/codex/65-plano-troca-senha-c7.md, secao 5 -- depende do codigo no ar.
--
--
-- ============================================================================
-- ROLLBACK (nao executar junto; so' se for preciso desfazer)
-- ============================================================================
--
-- CUIDADO: derrubar a coluna com o codigo desta fatia no ar quebra o carregamento de
-- sessao (o select passa a referenciar coluna inexistente) e ninguem consegue usar o
-- sistema. Reverta o CODIGO primeiro, a coluna depois.
--
--   alter table public.app_users drop column if exists must_change_password;
--
-- ============================================================================
