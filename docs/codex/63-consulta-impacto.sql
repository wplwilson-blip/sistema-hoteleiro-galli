-- ============================================================================
-- Consulta de impacto — plano 63 (validacao de documento e contato do fornecedor)
--
-- INFORMATIVA: nao bloqueia o merge. A excecao 6-b (a regra de presenca nao se
-- aplica quando o status nao e' 'active') ja' garante que nenhum fornecedor
-- legado fique preso: sempre da' para INATIVAR.
--
-- O que estas consultas medem: quantos cadastros ATIVOS o operador nao vai
-- conseguir salvar na proxima edicao sem antes completar documento ou contato.
--
-- Nao altera nada: sao tres SELECTs.
--
-- LIMITACAO IMPORTANTE (consulta 3): Postgres nao calcula digito verificador
-- aqui. A consulta 3 so' pre-filtra os documentos com TAMANHO errado depois de
-- remover a mascara. Documentos com tamanho certo e digito errado NAO aparecem
-- — o numero real de reprovados e' MAIOR OU IGUAL ao que ela mostra.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- (1) CONTAGEM: quantos ativos a regua bloquearia na proxima edicao.
--
-- Regua 4-b: documento OU (email | phone | whatsapp). contact_name NAO conta
-- sozinho — um nome sem telefone/e-mail nao e' forma de contato.
--
-- COMO LER: `sem_documento_e_sem_contato` e' o numero que importa. Perto de
-- zero = a mudanca passa despercebida. Dezenas = vale avisar a equipe antes,
-- porque a primeira edicao de cada um desses cadastros vai pedir o complemento.
--
-- `salvos_apenas_por_contact_name` mostra quantos passariam na regua 4-a (mais
-- permissiva, que aceita so' o nome) e reprovam na 4-b, que foi a escolhida.
-- E' a medida exata do custo dessa escolha.
-- ----------------------------------------------------------------------------
select
  count(*)                                                              as ativos_total,
  count(*) filter (
    where coalesce(btrim(s.document_number), '') = ''
      and coalesce(btrim(s.email), '')    = ''
      and coalesce(btrim(s.phone), '')    = ''
      and coalesce(btrim(s.whatsapp), '') = ''
  )                                                                     as sem_documento_e_sem_contato,
  count(*) filter (
    where coalesce(btrim(s.document_number), '') = ''
      and coalesce(btrim(s.email), '')    = ''
      and coalesce(btrim(s.phone), '')    = ''
      and coalesce(btrim(s.whatsapp), '') = ''
      and coalesce(btrim(s.contact_name), '') <> ''
  )                                                                     as salvos_apenas_por_contact_name
from public.suppliers s
where s.deleted_at is null
  and s.status = 'active';


-- ----------------------------------------------------------------------------
-- (2) A LISTA dos bloqueados, para o Wilson decidir se completa a mao.
-- ----------------------------------------------------------------------------
select
  s.name,
  s.trade_name,
  s.document_type,
  s.document_number,
  s.email,
  s.phone,
  s.whatsapp,
  s.contact_name,
  s.category,
  s.created_at
from public.suppliers s
where s.deleted_at is null
  and s.status = 'active'
  and coalesce(btrim(s.document_number), '') = ''
  and coalesce(btrim(s.email), '')    = ''
  and coalesce(btrim(s.phone), '')    = ''
  and coalesce(btrim(s.whatsapp), '') = ''
order by s.created_at desc;


-- ----------------------------------------------------------------------------
-- (3) DOCUMENTO MALFORMADO: tamanho errado para o tipo declarado.
--
-- Ver LIMITACAO no cabecalho: isto e' um PISO, nao o total. Documento com 14
-- digitos e digito verificador errado passa por esta consulta sem aparecer, e
-- ainda assim sera' reprovado pela aplicacao.
--
-- Estes reprovam em QUALQUER status: a validacao de digito nao tem a excecao
-- 6-b. Um cadastro assim precisa ter o documento corrigido ou o tipo trocado
-- para "Outro" antes de qualquer edicao, INCLUSIVE para ser inativado.
-- ----------------------------------------------------------------------------
select
  s.name,
  s.status,
  s.document_type,
  s.document_number,
  length(regexp_replace(coalesce(s.document_number, ''), '\D', '', 'g')) as digitos_encontrados,
  case s.document_type when 'CNPJ' then 14 when 'CPF' then 11 end       as digitos_esperados
from public.suppliers s
where s.deleted_at is null
  and coalesce(btrim(s.document_number), '') <> ''
  and (
    (s.document_type = 'CNPJ' and length(regexp_replace(s.document_number, '\D', '', 'g')) <> 14)
    or (s.document_type = 'CPF' and length(regexp_replace(s.document_number, '\D', '', 'g')) <> 11)
  )
order by s.status, s.document_type, s.name;
