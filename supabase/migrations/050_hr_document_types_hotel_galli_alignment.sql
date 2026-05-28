-- RH-16F.1 - Alinhamento idempotente do catalogo documental Hotel Galli.
-- Corrige metadados dos tipos documentais quando a migration 049 ja foi
-- aplicada antes do refinamento obrigatorio/condicional/operacional.
-- Nao altera schema, employee_documents, anexos, status, colaboradores ou onboarding.

with expected_document_types as (
  select *
  from (
    values
      ('RG_CNH', 'personal', true),
      ('CPF', 'personal', true),
      ('COMPROVANTE_RESIDENCIA', 'admission', true),
      ('CTPS', 'personal', true),
      ('ASO_ADMISSIONAL', 'admission', true),
      ('CONTRATO_TRABALHO', 'contract', true),
      ('FICHA_ADMISSAO', 'admission', true),
      ('DADOS_BANCARIOS', 'contract', false),
      ('DECLARACAO_VALE_TRANSPORTE', 'contract', false),
      ('FOTO', 'personal', false),
      ('TITULO_ELEITOR', 'personal', false),
      ('QUITACAO_ELEITORAL', 'personal', false),
      ('RESERVISTA', 'personal', false),
      ('CERTIDAO_CASAMENTO', 'personal', false),
      ('CERTIDAO_NASCIMENTO', 'personal', false),
      ('CERTIDAO_DIVORCIO', 'personal', false),
      ('DECLARACAO_UNIAO_ESTAVEL', 'personal', false),
      ('CERTIDAO_NASCIMENTO_FILHOS', 'personal', false),
      ('CPF_DEPENDENTES', 'personal', false),
      ('CARTEIRA_VACINACAO_FILHOS', 'personal', false),
      ('DECLARACAO_ESCOLAR_FILHOS', 'personal', false),
      ('DECLARACAO_DEPENDENTES', 'personal', false),
      ('EXAMES_ADMISSIONAIS', 'admission', false),
      ('COMPROVANTE_VACINACAO', 'admission', false),
      ('TERMO_LGPD', 'internal', false),
      ('TERMO_USO_IMAGEM', 'internal', false),
      ('TERMO_NORMAS_INTERNAS', 'internal', false),
      ('TERMO_UNIFORME', 'internal', false),
      ('TERMO_EPI', 'internal', false),
      ('TERMO_EQUIPAMENTOS', 'internal', false),
      ('TERMO_ACESSOS_CHAVES', 'internal', false),
      ('TERMO_RESPONSABILIDADE', 'internal', false),
      ('CERTIFICADO_TREINAMENTO', 'training', false),
      ('DOCUMENTO_DESLIGAMENTO', 'termination', false)
  ) as values_table(code, category, is_required)
)
update public.hr_document_types document_type
set
  category = expected.category,
  is_required = expected.is_required,
  updated_at = now()
from expected_document_types expected
where document_type.deleted_at is null
  and upper(document_type.code) = expected.code
  and (
    document_type.category is distinct from expected.category
    or document_type.is_required is distinct from expected.is_required
  );
