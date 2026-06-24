-- Migration 067 - Conserto do helper de identidade do RLS.
--
-- Problema (confirmado em staging, ver docs/3-plano-helper-identidade.md):
--   public.current_auth_user_id() (migration 009) le o "sub" do JWT apenas de
--   current_setting('request.jwt.claim.sub') -- o formato ANTIGO do Supabase, em que
--   cada claim virava um GUC separado. A versao atual do Supabase/PostgREST (chaves
--   sb_publishable_/sb_secret_) nao popula mais os GUCs por-claim e entrega o JSON
--   inteiro em current_setting('request.jwt.claims'). Resultado: o helper retornava
--   NULL e o RLS trancava tudo para o role authenticated.
--
-- Correcao: reescrever SOMENTE public.current_auth_user_id() para resolver o "sub"
--   de forma tolerante aos dois formatos:
--     1. tentar request.jwt.claim.sub (antigo);
--     2. se vazio, ler request.jwt.claims (novo) e extrair ->> 'sub';
--     3. validar formato UUID por regex (cast seguro); senao, NULL.
--
-- Restricoes respeitadas:
--   * NAO altera current_app_user_id() nem user_has_unit_access() (seguem da 009).
--   * NAO toca em login, Supabase Auth nem auth_email.
--   * NAO edita a 009; esta e migration nova.
--   * Mesma assinatura/atributos da versao original (returns uuid, language sql, stable).
--   * Cast de UUID protegido por regex -- nunca lanca excecao em valor invalido.
--
-- Cast seguro: o valor candidato so e convertido para uuid quando casa com o regex de
-- UUID; valores invalidos resultam em NULL (comportamento seguro). O acesso a
-- request.jwt.claims usa current_setting(..., true) (missing_ok), que devolve NULL
-- quando o GUC nao esta setado, e nullif para tratar string vazia; quando NULL/'' o
-- caminho do JSON nao executa o cast e tambem retorna NULL, sem erro.

create or replace function public.current_auth_user_id()
returns uuid
language sql
stable
as $$
  with candidato as (
    select coalesce(
      -- 1) formato antigo: GUC por-claim
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      -- 2) formato novo: JSON unico com todos os claims
      nullif(
        nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub',
        ''
      )
    ) as sub
  )
  select case
    when candidato.sub ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then candidato.sub::uuid
    else null
  end
  from candidato;
$$;

comment on function public.current_auth_user_id() is
  'Resolve o auth user id (sub) do JWT tolerando os dois formatos do Supabase: '
  'request.jwt.claim.sub (antigo) e request.jwt.claims->>sub (novo). '
  'Cast de UUID protegido por regex. Substitui a versao da 009 que so lia o formato antigo.';
