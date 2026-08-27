-- ============================================================================
-- 086 — audit_trail: autor derivado da propria linha (opcao 3 do doc 58)
--
-- NAO APLICADA PELO CODEX. O Wilson aplica: staging primeiro, depois producao.
-- Plano completo: docs/codex/66-plano-audit-trail-autor.md
--
-- O PROBLEMA: audit_trail.app_user_id e' SEMPRE NULL. O write_audit_trail (008) le' o autor
-- de um GUC de sessao (app.current_user_id) que NENHUM ponto da aplicacao seta -- medido em
-- staging: 0 de 1.000 linhas amostradas com autor. A trilha registra o QUE e o QUANDO;
-- nunca o QUEM.
--
-- A CORRECAO: derivar o autor das colunas created_by/updated_by/deleted_by da propria
-- linha, que 87-90% das tabelas ja' possuem e a aplicacao ja' preenche. Zero mudanca em
-- TypeScript. Onde as colunas nao existem, o `->>` devolve null e o comportamento e'
-- exatamente o de hoje (degrade gracioso, nao erro).
--
-- O GUC CONTINUA NA FRENTE (coalesce(GUC, derivado)): se um dia a opcao 1 do doc 58
-- (set_config por request) for implementada, ela passa a ter precedencia automaticamente,
-- sem nova migration. O GUC e' o autor DA REQUISICAO; a coluna e' o autor DA ULTIMA
-- ESCRITA -- quando os dois existem, o primeiro e' mais preciso.
--
-- SEM BACKFILL: as linhas historicas continuam com app_user_id NULL. Derivar autor
-- retroativo do estado ATUAL da linha seria INVENTAR informacao -- o updated_by de hoje
-- nao e' o autor da escrita de meses atras.
--
-- NENHUM TRIGGER E' RECRIADO: os triggers referenciam a funcao pelo nome, entao o
-- `create or replace function` troca o corpo e todos passam a usar o novo. Nao ha' janela
-- em que a auditoria fique desligada.
--
-- Idempotente: `create or replace` nas duas funcoes.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- Helper: converte texto para uuid SEM NUNCA lancar excecao.
--
-- NAO e' zelo excessivo. write_audit_trail roda em TODA escrita de TODA tabela do sistema.
-- Um valor malformado numa unica coluna -- legado, importacao, coluna text em vez de uuid
-- -- faria o cast ::uuid lancar. O `exception when others` no fim do trigger engoliria o
-- erro e a escrita passaria, mas SEM A LINHA DE AUDITORIA: a trilha perderia o registro em
-- silencio, o oposto do objetivo desta migration. Com safe_uuid, valor ruim vira null e a
-- linha de auditoria e' gravada do mesmo jeito.
--
-- Usa exatamente o mesmo regex de current_actor_id_from_setting (008), de proposito: uma
-- regra so' de "o que e' um uuid aceitavel" em todo o schema.
-- ----------------------------------------------------------------------------
create or replace function public.safe_uuid(raw_value text)
returns uuid
language plpgsql
immutable
as $$
begin
  if raw_value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return raw_value::uuid;
  end if;

  return null;
end;
$$;

comment on function public.safe_uuid(text) is
  'Converte texto para uuid, devolvendo null quando o valor nao casa com o formato (mesmo regex de current_actor_id_from_setting). Existe para que um valor malformado em qualquer coluna de autoria nunca lance excecao dentro do trigger de auditoria, que roda em toda escrita de toda tabela.';


-- ----------------------------------------------------------------------------
-- write_audit_trail: corpo IDENTICO ao da 008, exceto a derivacao de actor_id.
--
-- Mudou APENAS isto:
--   - a linha `actor_id := public.current_actor_id_from_setting();` saiu do topo;
--   - dentro de cada ramo `if tg_op` (onde audit_action_value ja' e' definido, e onde
--     old_json/new_json ja' estao montados), actor_id passa a ser
--     coalesce(GUC, <derivado da linha conforme a operacao>).
--
-- Todo o resto -- declaracao de variaveis, nullif(...)::uuid de unit_id/entity_id, o
-- insert, o coalesce(row_entity_id, gen_random_uuid()), o exception when others e os
-- retornos -- e' byte-identico ao original. security definer e set search_path = public
-- preservados.
-- ----------------------------------------------------------------------------
create or replace function public.write_audit_trail()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  audit_action_value public.audit_action;
  actor_id uuid;
  row_unit_id uuid;
  row_entity_id uuid;
  old_json jsonb;
  new_json jsonb;
begin
  old_json := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  new_json := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;

  if tg_op = 'INSERT' then
    audit_action_value := 'insert';
    actor_id := coalesce(
      public.current_actor_id_from_setting(),
      public.safe_uuid(new_json->>'created_by')
    );
    row_unit_id := nullif(new_json->>'unit_id', '')::uuid;
    row_entity_id := nullif(new_json->>'id', '')::uuid;
  elsif tg_op = 'UPDATE'
    and old_json->>'deleted_at' is null
    and new_json->>'deleted_at' is not null then
    audit_action_value := 'soft_delete';
    -- deleted_by antes de updated_by: no soft delete os dois sao escritos na mesma
    -- operacao, e deleted_by e' o campo especifico do ato que esta' sendo auditado.
    actor_id := coalesce(
      public.current_actor_id_from_setting(),
      public.safe_uuid(new_json->>'deleted_by'),
      public.safe_uuid(new_json->>'updated_by')
    );
    row_unit_id := nullif(new_json->>'unit_id', '')::uuid;
    row_entity_id := nullif(new_json->>'id', '')::uuid;
  elsif tg_op = 'UPDATE' then
    audit_action_value := 'update';
    actor_id := coalesce(
      public.current_actor_id_from_setting(),
      public.safe_uuid(new_json->>'updated_by')
    );
    row_unit_id := nullif(new_json->>'unit_id', '')::uuid;
    row_entity_id := nullif(new_json->>'id', '')::uuid;
  else
    audit_action_value := 'delete';
    -- LIMITACAO DECLARADA: num DELETE FISICO nao existe, na linha, o autor DO DELETE --
    -- old_json so' tem quem escreveu por ultimo. Se A criou e B apagou, a trilha dira' A.
    -- E' melhor que o NULL de hoje, e e' impreciso: NAO leia esta coluna como "quem
    -- apagou" em hard delete. Quem fecha isso de verdade e' o GUC (opcao 1 do doc 58),
    -- que ja' tem precedencia no coalesce abaixo.
    actor_id := coalesce(
      public.current_actor_id_from_setting(),
      public.safe_uuid(old_json->>'deleted_by'),
      public.safe_uuid(old_json->>'updated_by')
    );
    row_unit_id := nullif(old_json->>'unit_id', '')::uuid;
    row_entity_id := nullif(old_json->>'id', '')::uuid;
  end if;

  insert into public.audit_trail (
    action,
    entity_type,
    entity_id,
    table_name,
    app_user_id,
    unit_id,
    old_value,
    new_value,
    metadata
  )
  values (
    audit_action_value,
    tg_table_name,
    coalesce(row_entity_id, gen_random_uuid()),
    tg_table_schema || '.' || tg_table_name,
    actor_id,
    row_unit_id,
    old_json,
    new_json,
    jsonb_build_object('trigger', tg_name, 'operation', tg_op)
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
exception
  when others then
    -- Auditoria nao deve impedir gravacao nesta sprint inicial.
    if tg_op = 'DELETE' then
      return old;
    end if;

    return new;
end;
$$;

comment on function public.write_audit_trail() is
  'Auditoria generica. O autor (app_user_id) vem do GUC app.current_user_id quando setado e, na ausencia dele, e derivado das colunas de autoria da propria linha: created_by no insert, updated_by no update, deleted_by/updated_by no soft delete e no delete fisico (migration 086, doc 58 opcao 3). Em delete fisico o autor e o ULTIMO QUE ESCREVEU, nao necessariamente quem apagou.';


-- ============================================================================
-- ROTEIRO DE VALIDACAO (rodar APOS aplicar, staging antes de producao)
-- ============================================================================
--
-- 1) AUTOR NO UPDATE. Editar uma linha de teste PELA APLICACAO (para updated_by ser
--    preenchido de verdade) e conferir que a auditoria registrou o mesmo autor:
--
--    select a.created_at, a.action, a.table_name, a.app_user_id, a.new_value->>'updated_by' as updated_by_da_linha
--    from public.audit_trail a
--    where a.table_name = 'public.<tabela_editada>'
--    order by a.created_at desc
--    limit 1;
--    -- esperado: app_user_id NAO nulo e IGUAL a updated_by_da_linha
--
-- 2) COBERTURA REAL. Apos alguns cliques reais no sistema (criar, editar, inativar):
--
--    select
--      count(*)                                                      as linhas,
--      count(*) filter (where app_user_id is not null)               as com_autor,
--      round(count(*) filter (where app_user_id is not null) * 100.0
--            / nullif(count(*), 0), 1)                               as percentual
--    from public.audit_trail
--    where created_at > now() - interval '5 minutes';
--    -- E ESTE numero que diz o que a migration realmente entregou. O 87-90% do plano e'
--    -- a existencia da COLUNA nas tabelas, nao a garantia de que a aplicacao a preenche
--    -- em toda escrita. A cobertura efetiva e' <= 87%.
--
-- 3) INSERT E SOFT DELETE TAMBEM POPULAM. Criar e depois inativar um registro pela
--    aplicacao, e conferir as duas linhas:
--
--    select action, app_user_id, created_at
--    from public.audit_trail
--    where table_name = 'public.<tabela_de_teste>'
--    order by created_at desc
--    limit 5;
--    -- esperado: linhas 'insert' e 'soft_delete' com app_user_id preenchido
--
-- 4) NADA QUEBROU. Nenhuma escrita passou a falhar e a trilha continua crescendo:
--
--    select count(*) from public.audit_trail where created_at > now() - interval '1 hour';
--    -- comparar com o ritmo normal; nao deve haver queda
--
--
-- ============================================================================
-- ROLLBACK (nao executar junto; so' se for preciso desfazer)
-- ============================================================================
--
-- Reaplica o corpo ORIGINAL da 008 (que permanece no repo como referencia). Nao mexe em
-- trigger nenhum, nao altera dados e nao altera schema -- so' devolve o corpo antigo da
-- funcao. O safe_uuid pode ficar: e' inofensivo e nao e' referenciado por mais nada.
--
--   create or replace function public.write_audit_trail()
--   returns trigger
--   language plpgsql
--   security definer
--   set search_path = public
--   as $rollback$
--   declare
--     audit_action_value public.audit_action;
--     actor_id uuid;
--     row_unit_id uuid;
--     row_entity_id uuid;
--     old_json jsonb;
--     new_json jsonb;
--   begin
--     actor_id := public.current_actor_id_from_setting();
--     old_json := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
--     new_json := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
--
--     if tg_op = 'INSERT' then
--       audit_action_value := 'insert';
--       row_unit_id := nullif(new_json->>'unit_id', '')::uuid;
--       row_entity_id := nullif(new_json->>'id', '')::uuid;
--     elsif tg_op = 'UPDATE'
--       and old_json->>'deleted_at' is null
--       and new_json->>'deleted_at' is not null then
--       audit_action_value := 'soft_delete';
--       row_unit_id := nullif(new_json->>'unit_id', '')::uuid;
--       row_entity_id := nullif(new_json->>'id', '')::uuid;
--     elsif tg_op = 'UPDATE' then
--       audit_action_value := 'update';
--       row_unit_id := nullif(new_json->>'unit_id', '')::uuid;
--       row_entity_id := nullif(new_json->>'id', '')::uuid;
--     else
--       audit_action_value := 'delete';
--       row_unit_id := nullif(old_json->>'unit_id', '')::uuid;
--       row_entity_id := nullif(old_json->>'id', '')::uuid;
--     end if;
--
--     insert into public.audit_trail (
--       action, entity_type, entity_id, table_name, app_user_id,
--       unit_id, old_value, new_value, metadata
--     )
--     values (
--       audit_action_value,
--       tg_table_name,
--       coalesce(row_entity_id, gen_random_uuid()),
--       tg_table_schema || '.' || tg_table_name,
--       actor_id,
--       row_unit_id,
--       old_json,
--       new_json,
--       jsonb_build_object('trigger', tg_name, 'operation', tg_op)
--     );
--
--     if tg_op = 'DELETE' then
--       return old;
--     end if;
--
--     return new;
--   exception
--     when others then
--       if tg_op = 'DELETE' then
--         return old;
--       end if;
--
--       return new;
--   end;
--   $rollback$;
--
-- ============================================================================
