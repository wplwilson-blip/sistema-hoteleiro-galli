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
- Toda cotação deve registrar origem/evidência quando possível.
- Compras registra os fatos; o sistema classifica automaticamente a base documental.
- O comprador não decide livremente se a base documental é suficiente.
- `requires_attachment`, `requires_justification` e `has_formal_evidence` devem ser tratados como derivados pela regra do sistema.
- Cotação sem anexo pode seguir para aprovação, mas deve carregar justificativa, alerta e classificação compatível.
- Evidência crítica exige aprovação restrita à Diretoria.
- WhatsApp com print/anexo é "Aceitável com ressalva", não "Formal suficiente".
- Ligação ou presencial sem documento formal é evidência frágil quando houver contato, relato e justificativa.
- Sem evidência e sem justificativa é evidência crítica.
- Emergência exige motivo e, quando necessário, regularização posterior.
- Cotação que já entrou em dossiê formal não deve ser editada, cancelada, excluída ou desmarcada diretamente; correção deve ser feita por nova proposta/rodada.

## 6.1 Classificação Documental de Cotações

- Função central: `classifyPurchaseQuoteEvidence`.
- O envio/reenvio para aprovação deve considerar anexos reais vinculados à cotação.
- `formal_sufficient` / Formal suficiente:
  - proposta formal/PDF com anexo real;
  - e-mail com documento, cópia ou anexo real;
  - evidência documental forte equivalente.
- `acceptable_with_reservation` / Aceitável com ressalva:
  - WhatsApp com print/anexo;
  - site/catálogo com URL consistente;
  - fornecedor recorrente com referência ou documento mínimo.
- `fragile` / Frágil:
  - ligação com contato, relato e justificativa;
  - presencial com relato e justificativa;
  - WhatsApp sem print, mas com justificativa;
  - cotação sem anexo, mas com justificativa adequada.
- `critical` / Crítica:
  - sem evidência formal;
  - sem anexo;
  - sem URL quando URL é essencial;
  - sem justificativa;
  - evidência `none` sem motivo;
  - emergência sem documentação mínima;
  - ausência de dados essenciais.

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
- Upload de evidência no fluxo da cotação:
  - o usuário seleciona arquivos no formulário;
  - arquivos ficam staged antes da cotação existir;
  - ao salvar, a cotação/proposta é criada;
  - o sistema usa o `purchase_quotes.id` para enviar anexos;
  - anexos são vinculados com `module = purchases`, `entity_type = purchase_quote`, `entity_id = purchase_quotes.id`;
  - se o upload falhar após a criação da cotação, a cotação não é apagada.
- A UI deve orientar o usuário a anexar evidência antes do envio formal para aprovação.

## 8. Aprovação de Compras

- Toda compra com cotação vencedora precisa de aprovação.
- Até R$ 200,00: Gerência Administrativa.
- Acima de R$ 200,00: Diretoria Geral.
- Evidência crítica: Diretoria Geral independentemente do valor.
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
- Enviar ou reenviar para aprovação cria um snapshot formal do dossiê.
- O snapshot formal deve congelar os dados reais do momento do envio, incluindo vencedora, recomendada, anexos, cotações concorrentes, itens, unidade, departamento, alçada e usuário.
- O snapshot formal deve congelar origem da cotação, tipo de evidência, confiança, contato/canal, referência externa, URL, observações, justificativa de ausência de evidência, flags verbal/emergência, motivo da emergência, regularização posterior, classificação documental, motivo da classificação e alertas de auditoria.
- Só pode existir um snapshot formal `pending` ativo por solicitação.
- A decisão formal deve atualizar o snapshot pendente com decisão, justificativa quando aplicável, usuário e data.
- A decisão formal deve usar o `approval_level` do snapshot pendente.
- Para `approval_level = general_directorate`, o backend exige autoridade de Diretoria.
- Hoje, a autoridade diretiva existente é `UNIT_DIRECTOR` com vínculo ativo na unidade da compra.
- `SUPER_ADMIN` não é automaticamente Diretoria.
- Aprovações legadas sem snapshot ficam disponíveis para consulta e rastreabilidade, mas não devem permitir nova decisão direta.
- Criar cotação não cria snapshot.
- Criar negociação não cria snapshot.
- Selecionar vencedora não cria snapshot.
- Snapshots antigos devem continuar compatíveis.

## 8.1 Auditoria de Origem/Evidência

- AUDIT-COTACOES-2-A foi uma varredura técnica read-only pós-implementação.
- AC-01: severidade alta; decisão não validava Diretoria granularmente no backend; corrigido no commit `38a28ab`.
- AC-02: severidade alta; bloqueio de dossiê não cobria `unselect` e `DELETE/cancel`; corrigido no commit `38a28ab`.
- AC-03: severidade média; `has_formal_evidence` com default `true` pode gerar falso positivo em telas/relatórios futuros; pendente.
- Recomendação do AC-03: tratar `has_formal_evidence` como derivado, evitar uso como fonte absoluta de verdade e considerar política futura mais conservadora.

## 8.2 Bloqueio de Cotação em Dossiê

- Cotação que já entrou em snapshot formal não deve ser alterada diretamente.
- A trava considera cotação vencedora e cotações concorrentes presentes no `snapshot_payload`.
- A trava cobre `save`, `unselect` direto, `DELETE/cancel` e mutações estruturais equivalentes.
- Fluxo legítimo preservado: registrar nova proposta, selecionar nova proposta quando permitido, reenviar para aprovação e gerar novo snapshot somente no envio/reenvio formal.
- Risco residual: o modelo atual usa `purchase_quotes.is_selected`; selecionar nova proposta pode limpar a vencedora anterior no caminho controlado. Evolução futura deve modelar vencedora atual sem alterar estado vivo de cotação congelada.

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
