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
- Origem e evidência estruturada da cotação.
- Classificação documental automática da evidência.
- Upload de evidência no fluxo de cadastro e negociação de cotação.
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
- Bloqueio backend contra mutação direta de cotação que já entrou em dossiê formal.

## Snapshot Formal de Aprovação

- O envio ou reenvio formal para aprovação cria um snapshot do dossiê.
- O snapshot congela solicitação, unidade, departamento, itens, cotação vencedora, fornecedor, anexos, cotações concorrentes, recomendação e alçada.
- O snapshot também congela origem da cotação, tipo de evidência, confiança, contato/canal, referência externa, URL, observações, justificativa de ausência de evidência, flags verbal/emergência, regularização posterior, classificação documental, motivo da classificação, alertas de auditoria e exigência de Diretoria quando aplicável.
- A decisão formal atualiza o snapshot pendente correspondente.
- A tela de Aprovações prioriza dados do snapshot formal quando ele existe.
- Registros legados sem snapshot permanecem visíveis para rastreabilidade, mas não permitem decisão direta.
- O snapshot continua nascendo somente no envio ou reenvio formal; criar cotação, criar negociação ou selecionar vencedora não cria snapshot.

## Origem e Evidência de Cotações

- Implementado no commit `20b60d8 audit-cotacoes-origem-evidencia`.
- A migration `020_purchase_quote_evidence.sql` adicionou campos estruturados de origem/evidência em `purchase_quotes` e já foi aplicada manualmente no Supabase.
- Compras registra os fatos da proposta; o sistema calcula a classificação documental; o aprovador decide com base no dossiê formal.
- A função central de classificação é `classifyPurchaseQuoteEvidence`.
- Classificações: `formal_sufficient`, `acceptable_with_reservation`, `fragile` e `critical`.
- Evidência crítica força `approval_level = general_directorate` no envio/reenvio formal.
- `requires_attachment`, `requires_justification` e `has_formal_evidence` devem ser tratados como derivados da regra do sistema, não como julgamento livre do usuário.

## Aprovação de Compras

- Até R$ 200,00: Gerência Administrativa.
- Acima de R$ 200,00: Diretoria Geral.
- Evidência crítica: Diretoria Geral mesmo quando o valor da compra for baixo.
- Não usar nome de pessoa no status.
- Aprovar confirma a compra.
- Reprovar encerra a compra e exige justificativa.
- Devolver para Compras permite revisão sem encerrar a compra e exige justificativa.
- Reenviar para aprovação volta para pendente e recalcula a alçada.
- A decisão usa o `approval_level` do snapshot formal pendente.
- Para `approval_level = general_directorate`, o backend exige vínculo ativo de `UNIT_DIRECTOR` na unidade da compra.
- `SUPER_ADMIN` não é automaticamente Diretoria.

## Auditoria AUDIT-COTACOES-2-A

- AC-01: aprovação por Diretoria sem validação granular no backend; corrigido no commit `38a28ab sec-audit-cotacoes-hardening-backend`.
- AC-02: bloqueio de dossiê sem cobertura clara para `unselect` e `DELETE/cancel`; corrigido no commit `38a28ab sec-audit-cotacoes-hardening-backend`.
- AC-03: `has_formal_evidence` com default `true`; pendente para evolução futura e deve ser consumido com cautela.

## Status Visuais de Compras

- Em cotação.
- Aguardando aprovação da Gerência Administrativa.
- Aguardando aprovação da Diretoria Geral.
- Compra aprovada.
- Compra reprovada.
- Devolvida para Compras.

## Observações

- Aprovação por grupos/perfis específicos ainda não foi implementada.
- Diretoria Geral corporativa, se necessária, ainda precisa de perfil/permissão própria ou mapeamento auditável.
- O modelo atual ainda usa `purchase_quotes.is_selected`; seleção de nova vencedora deve evoluir futuramente para evitar mutação em cotação congelada.
- Contas a Pagar ainda é placeholder.
- RH, Recepção, Manutenção, Governança e A&B ainda são entradas de módulo, não fluxos completos.
