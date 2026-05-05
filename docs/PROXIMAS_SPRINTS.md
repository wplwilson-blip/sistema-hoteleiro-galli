# Próximas Sprints

## Prioridade Recomendada

1. Sprint DOC-1 - Documentação operacional do projeto.
2. Sprint UI-2 - Redesign profundo de `/compras/cotacoes`.
3. Sprint UI-3 - Evolução do dossiê formal de `/compras/aprovacoes`.
4. Auditoria/exportação do dossiê formal.
5. Sprint 5B.2 - Decisão inicial da solicitação.
6. Grupos/perfis de aprovação.
7. Contas a Pagar com aprovação.
8. RH administrativo.
9. Recepção operacional.
10. Manutenção.
11. Governança.
12. A&B.
13. Relatórios/KPIs.

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
