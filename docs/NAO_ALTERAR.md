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
- Se a rota de transições de apartamento passar a casar o erro por `rpcError.code` em vez de
  por mensagem, o `errcode` da RPC `rooms_apply_transition` vira **contrato** — e qualquer
  mudança nele exige revisão conjunta dos dois lados. Hoje o acoplamento é por texto
  (`includes("ROOMS_TRANSITION_STALE")`), e funciona por acidente. É o tipo de acoplamento
  implícito que só machuca quando alguém "melhora" um dos lados sozinho.
- Arquivo de ambiente novo: conferir o `.gitignore` ANTES de escrever a primeira linha nele.
  O repositorio e' publico, e a regra `.env*.local` nao cobre nomes como `.env.e2e`. A
  diferenca entre uma regra faltando e um vazamento de service key e' so' alguem ter criado o
  arquivo antes de a regra existir.

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
