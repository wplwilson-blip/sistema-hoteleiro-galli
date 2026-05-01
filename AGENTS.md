# AGENTS.md - Sistema Administrativo Hotel Galli

## Identidade do Projeto

Sistema Administrativo Hotel Galli é um SaaS administrativo multiunidade para operação interna de rede hoteleira.

O sistema não é PMS, não possui reservas, não possui check-in/check-out, não controla tarifas, não controla disponibilidade e não deve virar ERP ou financeiro completo. O foco é administração interna, compras, aprovações, evidências, anexos, auditoria, rastreabilidade, RH administrativo, recepção operacional, manutenção, governança, A&B, contas a pagar com aprovação, administrativo geral, dashboards e operação multiunidade.

## Stack

- Next.js 14 com App Router.
- TypeScript.
- Tailwind CSS.
- shadcn/ui.
- Supabase.
- Supabase Storage.
- GitHub.
- Vercel.

## Regras Invioláveis

- Não alterar login, autenticação, Supabase Auth ou `auth_email` técnico sem autorização explícita.
- Não criar migration sem necessidade clara e autorização de sprint.
- Não alterar banco, APIs sensíveis ou regras de permissão fora do escopo.
- Não criar reservas, check-in/check-out, tarifas, disponibilidade ou PMS.
- Não transformar Contas a Pagar em financeiro completo.
- Não colocar nome de pessoa em status de aprovação.
- Não duplicar Fornecedores no menu Compras.
- Não misturar `employees` com usuários internos.
- Não fazer commit ou push sem instrução explícita, exceto quando o prompt pedir COMMIT E PUSH.
- Não misturar sprints.

## Autenticação

- O login do usuário é por username + senha.
- O usuário não entra com e-mail.
- Supabase Auth usa `auth_email` técnico interno invisível ao usuário.
- Colaborador não é necessariamente usuário do sistema.
- Usuário interno é criado separadamente e pode ser vinculado a colaborador.
- APIs sensíveis devem validar sessão e permissão server-side.

## Fluxo de Desenvolvimento

1. Criar branch por sprint.
2. Implementar apenas o escopo fechado.
3. Rodar `npm.cmd run lint`.
4. Rodar `npm.cmd run build`.
5. Rodar `git status --short --untracked-files=all`.
6. Testar localmente.
7. Se houver migration, aplicar manualmente no Supabase antes de testar.
8. Só commitar quando o usuário pedir.
9. Fazer push somente quando o usuário pedir.
10. Abrir PR para `main`.
11. Merge.
12. Validar deploy da Vercel.
13. Fechar sprint.

## Regras de Compras e Aprovação

- Solicitante registra necessidade, quantidade e unidade; não informa valor.
- O valor nasce na cotação.
- Cotação recomendada V1 é a cotação válida de menor valor total.
- Recomendada é sugestão do sistema.
- Vencedora é escolha do comprador.
- Toda compra com cotação vencedora precisa de aprovação.
- Até R$ 200,00: Gerência Administrativa.
- Acima de R$ 200,00: Diretoria Geral.
- Aprovar confirma a compra.
- Reprovar encerra a compra e exige justificativa.
- Devolver para Compras permite revisão e exige justificativa.
- Reenviar para aprovação volta para `pending` e recalcula alçada.

## UI/UX

- Sistema deve funcionar em 100% de zoom em 1366x768, 1440x900 e 1920x1080.
- Sidebar fixa em desktop.
- Conteúdo principal rola à direita.
- Sem scroll horizontal global.
- Tabelas largas usam overflow local.
- Badges longas podem quebrar em duas linhas.
- Não exibir códigos técnicos em inglês para usuários operacionais.
- Não usar textos quebrados por encoding.
- Não usar “Sprint X” na interface final.

## Documentos de Apoio

Antes de iniciar sprint, consultar:

- `docs/STATUS_PROJETO.md`
- `docs/SPRINTS.md`
- `docs/REGRAS_DE_NEGOCIO.md`
- `docs/NAO_ALTERAR.md`
- `docs/ARQUITETURA.md`
- `docs/FLUXO_DESENVOLVIMENTO.md`
- `docs/BANCO_DADOS.md`
- `docs/UI_UX_GUIDELINES.md`
- `docs/PROXIMAS_SPRINTS.md`
