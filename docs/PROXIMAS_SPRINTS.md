# Próximas Sprints

## Prioridade Recomendada

1. Sprint DOC-1 - Documentação operacional do projeto.
2. AC-03 - Revisar uso de `has_formal_evidence` e evitar falso positivo.
3. Política de Diretoria Geral corporativa, se o Hotel Galli quiser diferenciar de Diretor de Unidade.
4. Evoluir modelo de vencedora atual sem mutar cotação congelada em dossiê.
5. Sprint UI-2 - Redesign profundo de `/compras/cotacoes`.
6. Sprint UI-3 - Evolução do dossiê formal de `/compras/aprovacoes`.
7. Auditoria/exportação do dossiê formal.
8. Sprint 5B.2 - Decisão inicial da solicitação.
9. Grupos/perfis de aprovação.
10. Contas a Pagar com aprovação.
11. RH administrativo.
12. Recepção operacional.
13. Manutenção.
14. Governança.
15. A&B.
16. Relatórios/KPIs.

## Prioridade Alta / Técnica

- AC-03: revisar consumo de `has_formal_evidence`, tratar como derivado e evitar uso como fonte absoluta de verdade.
- Criar política clara para Diretoria Geral corporativa, caso seja necessário diferenciar `UNIT_DIRECTOR` de uma Diretoria Geral da rede.
- Evoluir modelo de seleção de vencedora para evitar mutação em `purchase_quotes.is_selected` de cotação já congelada em dossiê formal.
- Manter `SUPER_ADMIN` separado de autoridade diretiva, salvo decisão explícita de negócio e modelagem auditável.

## Prioridade Média / Evidência e Auditoria

- Dashboard de pendências documentais:
  - evidência crítica;
  - evidência frágil;
  - regularização vencida;
  - emergência sem regularização;
  - cotação sem anexo.
- Política de regularização posterior para cotações emergenciais ou frágeis.
- Indicadores de origem/evidência por unidade.
- Relatórios de cotações verbais e emergenciais.

## Prioridade Baixa / Monitoramento

- URL de catálogo sem print.
- Fornecedor recorrente usado como justificativa fraca.
- Cotação verbal sem documento posterior.

## Sprint UI-2 - Redesign de `/compras/cotacoes`

- Objetivo: reduzir carga visual da tela de cotações.
- Ideias: mestre-detalhe mais claro, accordions, resumo fixo da solicitação, melhor organização de comparativo e anexos.
- Risco: médio, pois a tela concentra muita regra funcional.
- Não mexer: regra de cotação recomendada, seleção de vencedora, anexos funcionais e aprovação.

## Sprint UI-3 - Evolução do dossiê formal de `/compras/aprovacoes`

- Objetivo: evoluir o dossiê formal já existente sem alterar regras de decisão.
- Ideias: resumo de risco, barra de ações mais fixa, histórico em timeline, comparação vencedora x recomendada mais direta e consulta de snapshots finalizados.
- Risco: médio.
- Não mexer: APIs de decisão, regras de alçada, criação de snapshot, histórico e permissões.

## Auditoria/exportação do dossiê formal

- Objetivo: permitir consulta mais auditável de snapshots formais aprovados, reprovados ou devolvidos.
- Ideias: filtros por status do snapshot, geração de visualização imprimível/PDF e trilha de evidências por solicitação.
- Risco: médio.
- Não mexer: decisão de aprovação, criação automática de snapshots legados ou regras de alçada.

## Sprint 5B.2 - Decisão Inicial da Solicitação

- Objetivo: permitir decisão antes da cotação.
- Status possíveis futuros:
  - Liberada para cotação.
  - Em espera.
  - Não autorizada.
  - Cotar apenas para orçamento.
- Risco: médio/alto, pois pode exigir banco, API e revisão de fluxo.

## Grupos/Perfis de Aprovação

- Objetivo: vincular Gerência Administrativa e Diretoria Geral a usuários/perfis reais.
- Regras futuras:
  - usuários por alçada.
  - filas por alçada.
  - histórico de quem decidiu.
- Não usar nome fixo de pessoa em regra.
- Observação atual: `general_directorate` usa `UNIT_DIRECTOR` por unidade; Diretoria Geral corporativa exige evolução de perfil/permissão.

## Contas a Pagar com Aprovação

- Objetivo: receber compras aprovadas futuramente.
- Não virar financeiro completo.
- Não implementar conciliação bancária completa.

## RH Administrativo

- Foco: admissões, documentos, treinamentos, vencimentos, desligamentos e histórico.
- Não implementar ponto eletrônico.

## Recepção Operacional

- Foco: passagem de turno, ocorrências, achados e perdidos, observações de hóspedes e solicitações internas.
- Não criar reservas ou PMS.

## Manutenção

- Foco: chamados, quartos, áreas comuns, urgência, preventiva, evidências e histórico.

## Governança

- Foco: checklists, inspeções, camareiras, UHs, ocorrências e evidências.

## A&B

- Foco: requisições internas, ocorrências e controle operacional.
- Não virar estoque/financeiro completo agora.

## Relatórios/KPIs

- Começar por Compras:
  - tempo em cotação.
  - compras por unidade.
  - compras por fornecedor.
  - recomendada x vencedora.
  - aprovações pendentes.

## Regras de Sequenciamento

- Não avançar para módulo novo se a sprint anterior estiver instável.
- Não redesenhar várias telas críticas ao mesmo tempo.
- Não misturar regra de negócio com UI se não for necessário.
- Não criar migration em sprint de UI/documentação.
