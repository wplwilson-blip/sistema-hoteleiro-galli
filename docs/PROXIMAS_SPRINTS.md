# Próximas Sprints

## Prioridade Recomendada

1. Sprint DOC-1 - Documentação operacional do projeto.
2. Política de Diretoria Geral corporativa, se o Hotel Galli quiser diferenciar de Diretor de Unidade.
3. Evoluir modelo de vencedora atual sem mutar cotação congelada em dossiê.
4. Sprint UI-2 - Redesign profundo de `/compras/cotacoes`.
5. Sprint UI-3 - Evolução do dossiê formal de `/compras/aprovacoes`.
6. Auditoria/exportação do dossiê formal.
7. Sprint 5B.2 - Decisão inicial da solicitação.
8. Grupos/perfis de aprovação.
9. Contas a Pagar com aprovação.
10. RH administrativo.
11. Recepção operacional.
12. Manutenção.
13. Governança.
14. A&B.
15. Relatórios/KPIs.

## Prioridade Alta / Técnica

- Criar política clara para Diretoria Geral corporativa, caso seja necessário diferenciar `UNIT_DIRECTOR` de uma Diretoria Geral da rede.
- Evoluir modelo de seleção de vencedora para evitar mutação em `purchase_quotes.is_selected` de cotação já congelada em dossiê formal.
- Manter `SUPER_ADMIN` separado de autoridade diretiva, salvo decisão explícita de negócio e modelagem auditável.
- Manter futuras telas, dashboards e relatórios usando classificação documental calculada ou snapshot formal, sem consumir `has_formal_evidence` como verdade isolada.

## Prioridade Média / Evidência e Auditoria

- Evoluir o dashboard de pendências documentais para frentes que ficaram fora da V2:
  - exportação PDF;
  - leitura específica de snapshots antigos quando necessário;
  - paginação server-side e índices, se o volume justificar;
  - relatório auditável separado do dashboard vivo operacional.
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
