# Não Alterar Sem Autorização Explícita

Este arquivo lista áreas sensíveis. O Codex deve parar e pedir confirmação antes de mexer nelas, exceto quando o prompt autorizar claramente.

## Autenticação e Acesso

- Login.
- Autenticação.
- Supabase Auth.
- `auth_email` técnico.
- Setup inicial.
- Regras de permissão.
- `access_profiles`.
- Helpers server-side de sessão/permissão.

## Banco e APIs

- Migrations.
- Estrutura de banco.
- Tabelas operacionais.
- APIs sensíveis.
- RLS/policies.
- Triggers de auditoria/soft delete.

## Conceitos do Produto

- O sistema não é PMS.
- Não criar reservas.
- Não criar check-in/check-out.
- Não criar tarifas.
- Não criar disponibilidade.
- Não criar financeiro completo.
- Não criar ponto eletrônico.
- Não transformar em ERP genérico.

## Compras e Aprovação

- Regra de aprovação por alçada.
- Fluxo de cotação vencedora.
- Cotação recomendada V1, salvo sprint específica.
- Vínculo de anexos.
- Bucket `attachments`.
- Status de aprovação.
- Histórico de decisões.

## Cadastros

- Separação colaborador x usuário.
- Fornecedores somente em Cadastros no menu lateral.
- Não duplicar Fornecedores dentro do menu Compras.
- Códigos técnicos de perfil devem permanecer internos.

## Texto e Status

- Não colocar nome de pessoa em status de aprovação.
- Usar alçadas/funções: Gerência Administrativa e Diretoria Geral.
- Não exibir códigos técnicos em inglês para usuário operacional quando houver label amigável.

## Git e Sprint

- Não misturar sprints.
- Não fazer commit sem instrução explícita.
- Não fazer push sem instrução explícita.
- Não criar migration em sprint somente UI/documentação.
- Não alterar API em sprint somente UI/documentação.
