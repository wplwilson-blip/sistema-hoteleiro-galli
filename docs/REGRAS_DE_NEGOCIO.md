# Regras de Negócio

## 1. Sistema não é PMS

- Não criar reservas.
- Não criar check-in/check-out.
- Não criar tarifas.
- Não criar disponibilidade.
- Não criar motor de reservas.
- Não transformar o sistema em financeiro completo ou ERP genérico.

## 2. Multiunidade

- O sistema atende rede hoteleira com múltiplas unidades.
- Sempre considerar `organization_id` e `unit_id` quando aplicável.
- Usuários podem ter acesso a uma ou mais unidades.
- Relatórios e fluxos operacionais devem respeitar unidade ativa e permissões.

## 3. Colaboradores x Usuários

- Colaborador é cadastro de RH.
- Usuário interno é acesso ao sistema.
- Nem todo colaborador terá usuário.
- Um usuário pode ser auditor, técnico externo ou consultor.
- Criar colaborador não deve criar usuário automaticamente.
- Criar usuário deve continuar fluxo separado e controlado.

## 4. Fornecedores

- Fornecedor fica no menu Cadastros.
- Compras pode ter card/atalho para fornecedores, mas não item duplicado no menu lateral.
- Não permitir duplicidade de CNPJ/CPF por organização.
- Interface deve exibir razão social/nome fantasia/documento em português.
- Não mostrar JSON bruto para usuário operacional.

## 5. Compras

- Solicitação registra necessidade, quantidade e unidade.
- Solicitante não informa valor.
- Valor nasce na cotação.
- Data desejada é opcional.
- Itens usam unidades padronizadas: `UN`, `KG`, `G`, `CX`, `PCT`, `FD`, `LT`, `ML`, `M`, `M2`, `PAR`, `JG`, `ROLO`, `SACO`, `SERV`, `OUTRO`.

## 6. Cotações

- Número automático no padrão `SC-2026-000001-COT-01`.
- Usuário não digita número da cotação.
- Cotação válida para recomendação: `received`, `selected`, `rejected`.
- Não considerar na recomendação: `cancelled`, `expired`.
- Recomendação V1: menor valor total.
- Empate: menor prazo.
- Persistindo empate: data de criação/número da cotação.
- Recomendada é sugestão do sistema.
- Vencedora é escolha do comprador.
- Aprovada só existe após decisão formal.
- Cotação original deve ser preservada quando houver renegociação relevante.
- Renegociação futura com o mesmo fornecedor deve criar nova rodada/proposta, vinculada à proposta original e à proposta imediatamente anterior.
- Cotação superada por nova rodada não deve concorrer na recomendação futura.
- Obrigatoriedade de desconto mínimo, justificativa detalhada ou anexo específico por negociação fica para evolução futura configurável.

## 7. Anexos

- Bucket: `attachments`.
- Bucket privado.
- Vínculo de anexo de cotação:
  - `module = purchases`
  - `entity_type = purchase_quote`
  - `entity_id = purchase_quotes.id`
- Anexos devem ficar dentro da cotação correspondente.
- Na aprovação, mostrar anexos da cotação vencedora e das demais cotações.
- Não criar bucket novo sem autorização.

## 8. Aprovação de Compras

- Toda compra com cotação vencedora precisa de aprovação.
- Até R$ 200,00: Gerência Administrativa.
- Acima de R$ 200,00: Diretoria Geral.
- Não usar nome de pessoa no status.
- Status visuais:
  - Em cotação.
  - Aguardando aprovação da Gerência Administrativa.
  - Aguardando aprovação da Diretoria Geral.
  - Compra aprovada.
  - Compra reprovada.
  - Devolvida para Compras.
- Aprovar confirma a compra.
- Reprovar é decisão final de não comprar e exige justificativa.
- Devolver para Compras permite revisar cotação, documento ou justificativa e exige justificativa.
- Reenviar para aprovação volta para `pending` e recalcula alçada.

## 9. RH

- Não controlar ponto; o hotel já possui software de ponto.
- RH deve focar em admissões, colaboradores, documentos, cargos, departamentos, status, desligamentos, solicitações ao RH, treinamentos, vencimentos, histórico e auditoria.

## 10. Recepção

- Não é PMS.
- Não controla reservas.
- Foco futuro: passagem de turno, ocorrências, achados e perdidos, observações de hóspedes, solicitações internas, comunicação com manutenção/governança/administrativo, evidências e histórico.

## 11. Manutenção

- Foco futuro: chamados, quartos, áreas comuns, urgência, preventiva, evidências e histórico.

## 12. Governança

- Foco futuro: checklists, inspeções, camareiras, UHs, ocorrências e evidências.

## 13. A&B

- Foco futuro: requisições internas, ocorrências e controle operacional.
- Não virar estoque completo ou financeiro completo agora.

## 14. Contas a Pagar

- Será contas a pagar com aprovação.
- Não é financeiro completo.
- Deve receber compras aprovadas futuramente.
- Não implementar conciliação bancária completa.
