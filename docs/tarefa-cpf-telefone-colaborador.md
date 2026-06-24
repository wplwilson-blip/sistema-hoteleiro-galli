# Tarefa formal — Validação e unicidade de CPF e telefone de colaborador

> **Prioridade:** P1 (qualidade de dado / integridade cadastral). Entra **depois** do
> Prompt 2 (RLS), ou junto da revisão do cadastro de colaborador já prevista no roadmap.
> **Área sensível:** mexe em migration (índice único em `employees`) → plano antes do código.
> **Origem:** identificado em sessão de testes — o cadastro de colaborador aceita CPF
> duplicado e não valida formato de CPF nem de celular.

---

## Problema confirmado no código

1. **CPF duplicado é aceito.** A migration `014_suppliers_unique_document.sql` criou índice
   único de documento **apenas para `suppliers`**. A tabela `employees` **não tem** nenhuma
   constraint/índice de unicidade em `document_number`. Hoje é possível cadastrar dois
   colaboradores com o mesmo CPF.
2. **Sem validação de formato.** Não há regex, máscara, nem validação de dígito verificador
   para CPF ou telefone no cadastro de colaborador (nem no schema de validação, nem no input).
   O campo aceita qualquer texto.

## Impacto operacional (hotelaria)

- CPF repetido gera colaborador duplicado → risco de folha duplicada, ASO duplicado,
  confusão em admissão, onboarding e desligamento.
- Telefone sem padrão dificulta contato e integrações futuras.

## Escopo proposto

### Banco (migration — sensível, plano antes)
- Criar índice único de CPF em `employees`, no mesmo padrão da `014` (normalizando dígitos
  com `regexp_replace(..., '\D', '', 'g')`, ignorando nulos/vazios, respeitando soft delete).
- **Decisão de negócio a definir antes:** CPF único por **organização** ou **global**?
  Numa rede, o mesmo CPF pode estar ativo em mais de uma unidade/empresa do grupo?
  (Recomendado avaliar: único por `organization_id`, alinhado ao padrão multiunidade.)

### Frontend + validação
- Validação de dígito verificador de CPF (não só formato).
- Máscara de CPF (`000.000.000-00`) no input.
- Máscara de celular brasileiro (`(00) 00000-0000`, com 9º dígito).
- Mensagem de erro amigável em português ao detectar CPF duplicado (vindo do 409 do backend).

## Restrições
- Respeitar `NAO_ALTERAR.md`: migration é área sensível — plano antes do código.
- Não alterar Auth, login nem `auth_email`.
- Não introduzir dependência nova só para validar CPF (a validação de dígito é simples e
  pode ser implementada sem lib).

## Critério de aceite
- Não é possível cadastrar dois colaboradores com o mesmo CPF (no escopo definido).
- CPF inválido (dígito verificador) é rejeitado no cadastro.
- CPF e celular exibidos/digitados com máscara.
- Lint e build passam; cadastros existentes não quebram.

## Pré-requisito de dados
- Antes de aplicar o índice único em produção: verificar se já existem CPFs duplicados na
  base atual (`select document_number, count(*) ... group by ... having count(*) > 1`).
  Se houver, limpar/decidir antes, senão a criação do índice único falha.
