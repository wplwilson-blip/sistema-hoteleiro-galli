-- Migration 068 - CPF unico de colaborador por organizacao.
--
-- Espelha 014_suppliers_unique_document.sql:
--   * escopo por organization_id;
--   * normaliza digitos (remove mascara) com regexp_replace;
--   * ignora nulos/vazios (nullif(...) is not null);
--   * respeita soft delete (where deleted_at is null).
--
-- Decisao de negocio: CPF unico POR ORGANIZACAO (mesmo CPF pode existir em
-- organizacoes diferentes da rede, mas nao duas vezes na mesma).
-- Pre-requisito verificado: zero duplicatas em staging e producao.
-- NAO altera estrutura de tabela; apenas cria indice.

create unique index if not exists employees_org_cpf_normalized_active_unique
  on public.employees (
    organization_id,
    (regexp_replace(coalesce(document_number, ''), '\D', '', 'g'))
  )
  where deleted_at is null
    and nullif(regexp_replace(coalesce(document_number, ''), '\D', '', 'g'), '') is not null;
