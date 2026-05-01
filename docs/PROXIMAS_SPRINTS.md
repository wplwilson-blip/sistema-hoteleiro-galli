# Próximas Sprints

## Prioridade Recomendada

1. Sprint DOC-1 - Documentação operacional do projeto.
2. Sprint UI-2 - Redesign profundo de `/compras/cotacoes`.
3. Sprint UI-3 - Redesign profundo de `/compras/aprovacoes`.
4. Sprint 5B.2 - Decisão inicial da solicitação.
5. Grupos/perfis de aprovação.
6. Contas a Pagar com aprovação.
7. RH administrativo.
8. Recepção operacional.
9. Manutenção.
10. Governança.
11. A&B.
12. Relatórios/KPIs.

## Sprint UI-2 - Redesign de `/compras/cotacoes`

- Objetivo: reduzir carga visual da tela de cotações.
- Ideias: mestre-detalhe mais claro, accordions, resumo fixo da solicitação, melhor organização de comparativo e anexos.
- Risco: médio, pois a tela concentra muita regra funcional.
- Não mexer: regra de cotação recomendada, seleção de vencedora, anexos funcionais e aprovação.

## Sprint UI-3 - Redesign de `/compras/aprovacoes`

- Objetivo: transformar aprovação em dossiê de decisão mais claro.
- Ideias: resumo de risco, barra de ações, histórico em timeline, comparação vencedora x recomendada mais direta.
- Risco: médio.
- Não mexer: APIs de decisão, regras de alçada, histórico e permissões.

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
