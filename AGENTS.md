# Repository Guidelines

## Visão Geral

Este repositório é um sistema administrativo SaaS multiunidade para rede hoteleira brasileira. O sistema não é PMS, não terá reservas e não será um financeiro completo. O foco é administração interna, operação, aprovações, evidências, padronização, auditoria e gestão multiunidade.

Todo desenvolvimento deve considerar o fluxo: rede -> unidade -> departamento -> usuário -> solicitação -> aprovação -> execução -> evidência -> indicador.

## Stack Obrigatória

Use Next.js 14 com App Router, TypeScript, Tailwind CSS, shadcn/ui, Supabase, PostgreSQL, Supabase Auth, Supabase Storage, React Hook Form, Zod, TanStack Query e Zustand.

## Decisões Obrigatórias

- Login deve ser por nome de usuário + senha. Não usar e-mail como login.
- E-mail é opcional e serve apenas para contato ou notificação futura.
- Na V1, notificações principais são in-app; e-mail transacional não é obrigatório.
- `users`, `employees` e `user_employee_link` são entidades separadas.
- Nem todo colaborador terá login, e um usuário pode ser auditor, técnico externo ou consultor.
- O sistema deve ser multiunidade desde o início; todo dado operacional deve ter `unit_id`.
- Registros críticos exigem auditoria e soft delete com `deleted_at` e `deleted_by`.
- Toda tabela operacional deve considerar RLS no Supabase.
- Não expor `auth_email` técnico em telas, APIs públicas ou logs de interface.
- Se Supabase Auth exigir e-mail técnico, usar `auth_email` interno fictício invisível ao usuário.

## Módulo Base Obrigatório

O Módulo Base sustenta todos os demais módulos e deve conter: organizações/rede, unidades, departamentos, cargos, usuários, colaboradores, vínculo usuário x colaborador, perfis de acesso, permissões, vínculos usuário x unidade x departamento, centros de custo, categorias operacionais, fornecedores, alçadas de aprovação, tipos de solicitação, tipos de anexo, status padrão, notificações in-app, logs, auditoria, configurações globais, configurações por unidade e estrutura operacional da unidade.

## Estrutura Operacional Obrigatória

Incluir desde o Módulo Base: UHs/quartos, andares, blocos, áreas comuns, ambientes internos, setores físicos, equipamentos principais e status operacional do local.

## Módulos do Sistema

Módulos previstos: RH, Solicitações de Pagamento com Aprovação, Compras, Manutenção, Governança, A&B, Administrativo Geral, Dashboards, Auditoria e Relatórios. Solicitações de Pagamento não devem virar financeiro completo.

## Ordem de Desenvolvimento

Nunca criar o sistema inteiro de uma vez. Trabalhar sempre por sprint e não avançar sem solicitação explícita.

Ordem obrigatória: base inicial do projeto; banco do Módulo Base; login por username + senha; usuários, unidades, departamentos, cargos e permissões; estrutura operacional; workflow geral; Solicitações de Pagamento; Compras; Manutenção; Governança; Administrativo Geral; RH; A&B; Dashboards e relatórios; testes e produção.

## Regras Para o Codex

- Não implementar módulos operacionais quando a tarefa pedir apenas estrutura base.
- Não criar banco quando a tarefa pedir apenas layout.
- Não inventar regras fora do escopo.
- Sempre listar arquivos criados, alterados e comandos executados.
- Sempre explicar como testar localmente.
- Sempre preservar segurança, RLS, soft delete, auditoria e multiunidade.
- Sempre perguntar antes de mudanças grandes.
- Não usar e-mail na tela de login.
- Não criar autenticação própria insegura sem necessidade.
- Não expor dados sensíveis.
- Não misturar `users` com `employees`.
- Não criar módulos isolados sem integração com workflow geral.

## Padrão de Telas

A interface deve ser limpa, empresarial e objetiva. Deve ser fácil para usuários operacionais e útil para diretoria. Usar menu lateral com módulos e header com usuário, unidade ativa, notificações e sair. Tabelas devem ter filtros, formulários devem ter validação, status devem ser claros e botões de ação devem aparecer apenas conforme permissão.

## Padrão de Banco

Use UUID como chave primária. Tabelas críticas devem conter `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at` e `deleted_by`. Tabelas operacionais devem conter `unit_id`. Criar índices em `unit_id`, `status`, `created_at` e campos de busca. Usar constraints para `username` único e formato válido. Usar `audit_trail` para alterações críticas, `system_logs` para logs técnicos, soft delete e RLS desde o início.
