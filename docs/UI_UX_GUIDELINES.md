# UI/UX Guidelines

## Princípios

- Interface limpa, empresarial e objetiva.
- Usuário operacional deve entender o próximo passo sem treinamento longo.
- Diretoria deve conseguir decidir com contexto suficiente.
- Evitar excesso de cards competindo na mesma hierarquia.
- Não mostrar termos técnicos quando houver label operacional.

## Responsividade

- Funcionar em 100% de zoom.
- Referências obrigatórias: 1366x768, 1440x900, 1920x1080.
- Sidebar fixa em desktop.
- Conteúdo rola à direita.
- Sem scroll horizontal global.
- Tabelas largas devem ter overflow horizontal local.
- Cards devem usar `min-w-0`, quebra de linha e layout responsivo.
- Botões em grupo devem usar `flex-wrap`.

## Badges e Status

- Badges longas podem quebrar em duas linhas.
- Status de aprovação longo deve aparecer como:
  - Linha 1: Aguardando aprovação.
  - Linha 2: Gerência Administrativa ou Diretoria Geral.
- Não usar nome de pessoa em status.
- Cores devem comunicar estado:
  - sucesso: aprovado/válido.
  - alerta: aguardando decisão.
  - perigo: reprovação/cancelamento/remoção.
  - informação: devolução, contexto ou item selecionado.

## Perfis de Acesso

Não exibir códigos técnicos em inglês para usuários. Usar labels:

- `SUPER_ADMIN` -> Administrador Geral.
- `NETWORK_MANAGER` -> Gestor da Rede.
- `UNIT_DIRECTOR` -> Diretor da Unidade.
- `DEPARTMENT_MANAGER` -> Gerente Departamental.
- `SUPERVISOR` -> Supervisor.
- `FINANCE` -> Financeiro.
- `AUDIT` -> Auditoria.
- `EMPLOYEE` -> Colaborador.
- `EXTERNAL_TECHNICIAN` -> Técnico Externo.

## Anexos

- Anexos devem ficar dentro da entidade correspondente.
- Em cotações, anexos ficam dentro do card da cotação.
- Em aprovações, mostrar anexos da vencedora e das demais cotações.
- Botões de abrir/remover devem ficar próximos ao arquivo.
- Upload de evidência deve estar no fluxo da cotação e da nova proposta negociada.
- Arquivos staged antes de salvar devem ficar visualmente ligados ao formulário da cotação.
- A UI deve orientar o usuário a anexar evidência antes do envio/reenvio formal para aprovação.

## Botões

- Ações primárias: Criar, Salvar, Aprovar, Reenviar para aprovação.
- Ações secundárias: Editar, Abrir, Ver detalhes.
- Ações cautelosas/destrutivas: Reprovar, Devolver para Compras, Cancelar cotação, Remover anexo.
- Ações cautelosas/destrutivas devem ter visual diferente, como variante `danger` ou outline de perigo.

## Textos

- Não usar textos quebrados por encoding.
- Não usar “Sprint X” na interface final.
- Dashboards placeholder devem usar “Em breve” de forma discreta.
- Não prometer funcionalidades que ainda não existem.
- Empty states devem explicar o que aparece ali e qual é o próximo passo.

## Dashboards

- Cards com link indicam funcionalidade disponível.
- Cards sem link indicam funcionalidade futura e devem exibir “Em breve”.
- Dashboards de módulo devem ser pontos de entrada, não páginas de marketing.

## Compras

- Diferenciar claramente cotação recomendada e cotação vencedora.
- Recomendada é sugestão do sistema.
- Vencedora é escolha registrada por Compras.
- Aprovação deve funcionar como dossiê de decisão.
- Quando houver snapshot formal, a interface deve sinalizar o número do dossiê e priorizar os dados congelados no envio.
- Registros legados sem snapshot devem aparecer como consulta histórica, com alerta claro e sem botões de decisão.
- O bloco "Origem e Evidência da Cotação" deve ser único, sem duplicidade no mesmo formulário.
- Campos de origem/evidência devem ser condicionais por origem.
- A classificação documental deve ser clara, compacta e calculada pelo sistema.
- Não mostrar checkboxes livres para o comprador decidir se a evidência é suficiente.
- Evidência crítica deve comunicar exigência de Diretoria sem impedir o registro factual pela área de Compras.
- O modal de nova proposta negociada deve seguir a ordem:
  - cotação anterior compacta;
  - dados da nova proposta;
  - itens/valores;
  - origem/evidência;
  - salvar.
- A tela de Aprovações deve exibir origem/evidência, classificação, alertas e anexos a partir do dossiê formal quando existir.
- Cotação bloqueada por dossiê formal deve orientar correção por nova proposta/rodada, não por edição direta.

## Filas operacionais

- Toda tela operacional deve abrir por padrão com registros que exigem ação, decisão ou acompanhamento ativo.
- Registros finalizados, aprovados, reprovados, cancelados, arquivados ou históricos devem permanecer acessíveis por filtros, abas ou busca, mas não devem poluir a visão principal.
