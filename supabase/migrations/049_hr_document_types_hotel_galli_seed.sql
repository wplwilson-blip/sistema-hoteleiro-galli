-- RH-16F - Seed controlado dos tipos documentais padrao Hotel Galli.
-- Amplia o catalogo logico usado pelo dossie documental automatico.
-- Nao altera schema, nao cria workflow, nao cria GED, nao cria OCR,
-- nao cria assinatura digital e nao altera regras condicionais.

insert into public.hr_document_types (
  code,
  name,
  description,
  category,
  is_system_default,
  is_required,
  requires_valid_until,
  is_sensitive_default,
  visibility_scope_default,
  sort_order
)
select
  seed.code,
  seed.name,
  seed.description,
  seed.category,
  true,
  seed.is_required,
  false,
  true,
  'restricted',
  seed.sort_order
from (
  values
    ('FOTO', 'Foto cadastral', 'Foto 3x4 ou foto cadastral para identificacao interna do colaborador.', 'personal', false, 90),
    ('CTPS', 'CTPS', 'Carteira de trabalho ou comprovante digital equivalente.', 'personal', true, 100),
    ('TITULO_ELEITOR', 'Titulo de eleitor', 'Titulo de eleitor para conferencia cadastral quando aplicavel.', 'personal', false, 110),
    ('QUITACAO_ELEITORAL', 'Quitacao eleitoral', 'Comprovante de votacao ou quitacao eleitoral quando aplicavel.', 'personal', false, 120),
    ('RESERVISTA', 'Certificado de reservista', 'Certificado de reservista quando aplicavel.', 'personal', false, 130),
    ('ASO_ADMISSIONAL', 'ASO admissional', 'Atestado de saude ocupacional admissional.', 'admission', true, 140),
    ('EXAMES_ADMISSIONAIS', 'Exames admissionais', 'Exames admissionais complementares quando houver.', 'admission', false, 150),
    ('COMPROVANTE_VACINACAO', 'Comprovante de vacinacao', 'Comprovante de vacinacao quando aplicavel.', 'admission', false, 160),
    ('CERTIDAO_CASAMENTO', 'Certidao de casamento', 'Certidao de casamento quando aplicavel ao cadastro admissional.', 'personal', false, 170),
    ('CERTIDAO_NASCIMENTO', 'Certidao de nascimento', 'Certidao de nascimento quando aplicavel ao cadastro admissional.', 'personal', false, 180),
    ('CERTIDAO_DIVORCIO', 'Certidao de divorcio', 'Certidao de divorcio quando aplicavel ao cadastro admissional.', 'personal', false, 190),
    ('DECLARACAO_UNIAO_ESTAVEL', 'Declaracao de uniao estavel', 'Declaracao de uniao estavel quando aplicavel ao cadastro admissional.', 'personal', false, 200),
    ('CERTIDAO_NASCIMENTO_FILHOS', 'Certidao de nascimento dos filhos', 'Certidao de nascimento de filhos ou dependentes quando aplicavel.', 'personal', false, 210),
    ('CPF_DEPENDENTES', 'CPF dos dependentes', 'CPF de dependentes quando aplicavel.', 'personal', false, 220),
    ('CARTEIRA_VACINACAO_FILHOS', 'Carteira de vacinacao dos filhos', 'Carteira ou cartao de vacinacao de filhos ou dependentes quando aplicavel.', 'personal', false, 230),
    ('DECLARACAO_ESCOLAR_FILHOS', 'Declaracao escolar dos filhos', 'Declaracao escolar de filhos ou dependentes quando aplicavel.', 'personal', false, 240),
    ('DECLARACAO_DEPENDENTES', 'Declaracao de dependentes', 'Declaracao de dependentes para conferencia administrativa quando aplicavel.', 'personal', false, 250),
    ('DECLARACAO_VALE_TRANSPORTE', 'Declaracao de vale-transporte', 'Declaracao de uso ou renuncia de vale-transporte quando aplicavel.', 'contract', false, 260),
    ('DADOS_BANCARIOS', 'Dados bancarios', 'Dados bancarios para cadastro administrativo quando aplicavel.', 'contract', false, 270),
    ('TERMO_LGPD', 'Termo LGPD', 'Termo de ciencia sobre tratamento de dados pessoais quando aplicavel.', 'internal', false, 280),
    ('TERMO_USO_IMAGEM', 'Termo de uso de imagem', 'Termo de uso de imagem quando aplicavel.', 'internal', false, 290),
    ('TERMO_NORMAS_INTERNAS', 'Termo de normas internas', 'Termo de ciencia de normas internas do hotel.', 'internal', false, 300),
    ('TERMO_UNIFORME', 'Termo de uniforme', 'Termo de entrega ou responsabilidade por uniforme quando aplicavel.', 'internal', false, 310),
    ('TERMO_EPI', 'Termo de EPI', 'Termo de entrega ou responsabilidade por EPI quando aplicavel.', 'internal', false, 320),
    ('TERMO_EQUIPAMENTOS', 'Termo de equipamentos', 'Termo de responsabilidade por equipamentos quando aplicavel.', 'internal', false, 330),
    ('TERMO_ACESSOS_CHAVES', 'Termo de acessos e chaves', 'Termo de acesso a sistemas, chaves ou recursos operacionais quando aplicavel.', 'internal', false, 340)
) as seed(code, name, description, category, is_required, sort_order)
where not exists (
  select 1
  from public.hr_document_types existing
  where existing.deleted_at is null
    and upper(existing.code) = seed.code
);
