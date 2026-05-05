# Status do Projeto

## Estado Geral

O Sistema Administrativo Hotel Galli está funcional em V1 para base administrativa e compras. O projeto já possui Supabase, GitHub, Vercel, login real por username + senha e deploy automático.

## Infraestrutura

- Supabase funcionando.
- GitHub funcionando.
- Vercel funcionando.
- Deploy automático funcionando.
- Login real por username + senha funcionando.
- Setup inicial do Super Admin funcionando.
- Bucket privado Supabase Storage: `attachments`.

## Módulos Existentes

- Cadastros.
- Compras.
- Aprovações de compras.
- RH dashboard placeholder.
- Recepção dashboard placeholder.
- Manutenção dashboard placeholder.
- Governança dashboard placeholder.
- A&B dashboard placeholder.
- Contas a Pagar dashboard placeholder.
- Administrativo dashboard placeholder.
- Relatórios dashboard placeholder.

## Cadastros Existentes

- Unidades.
- Departamentos.
- Cargos.
- Colaboradores.
- Usuários internos.
- Fornecedores.

## Compras Existentes

- Solicitações de compra.
- Itens da solicitação.
- Cotações.
- Itens da cotação.
- Anexos de cotação.
- Cadastro rápido de fornecedor dentro da cotação.
- Combobox pesquisável de fornecedor.
- Cotação recomendada.
- Cotação vencedora.
- Aprovação real.
- Devolução para Compras.
- Reenvio para aprovação.
- Histórico de decisão.
- Anexos no dossiê de aprovação.
- Snapshot formal do dossiê enviado para aprovação.
- Aprovações legadas sem snapshot apenas para consulta.

## Snapshot Formal de Aprovação

- O envio ou reenvio formal para aprovação cria um snapshot do dossiê.
- O snapshot congela solicitação, unidade, departamento, itens, cotação vencedora, fornecedor, anexos, cotações concorrentes, recomendação e alçada.
- A decisão formal atualiza o snapshot pendente correspondente.
- A tela de Aprovações prioriza dados do snapshot formal quando ele existe.
- Registros legados sem snapshot permanecem visíveis para rastreabilidade, mas não permitem decisão direta.

## Aprovação de Compras

- Até R$ 200,00: Gerência Administrativa.
- Acima de R$ 200,00: Diretoria Geral.
- Não usar nome de pessoa no status.
- Aprovar confirma a compra.
- Reprovar encerra a compra e exige justificativa.
- Devolver para Compras permite revisão sem encerrar a compra e exige justificativa.
- Reenviar para aprovação volta para pendente e recalcula a alçada.

## Status Visuais de Compras

- Em cotação.
- Aguardando aprovação da Gerência Administrativa.
- Aguardando aprovação da Diretoria Geral.
- Compra aprovada.
- Compra reprovada.
- Devolvida para Compras.

## Observações

- Aprovação por grupos/perfis específicos ainda não foi implementada.
- Contas a Pagar ainda é placeholder.
- RH, Recepção, Manutenção, Governança e A&B ainda são entradas de módulo, não fluxos completos.
