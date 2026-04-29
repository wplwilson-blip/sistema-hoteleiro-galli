# Sprint 4A - Modulo Base: Cadastros

## Objetivo

Criar as primeiras telas reais do Modulo Base para gestao de Unidades, Departamentos e Cargos no Sistema Administrativo Hotel Galli.

## Rotas criadas

- `/cadastros`
- `/cadastros/unidades`
- `/cadastros/departamentos`
- `/cadastros/cargos`

## Telas criadas

### Cadastros

Menu do Modulo Base com cards para:

- Unidades
- Departamentos
- Cargos
- Usuarios, em breve
- Perfis e permissoes, em breve
- UHs/Quartos, em breve
- Fornecedores, em breve

### Unidades

CRUD basico para `units`:

- Listagem
- Criacao
- Edicao
- Inativacao por `status = inactive`

Campos usados:

- `units.code`
- `units.name`
- `units.status`
- `unit_settings.value.city`
- `unit_settings.value.state`

### Departamentos

CRUD basico para `departments`:

- Listagem
- Criacao
- Edicao
- Inativacao por `status = inactive`

Campos usados:

- `departments.unit_id`
- `departments.organization_id`
- `departments.code`
- `departments.name`
- `departments.description`
- `departments.status`

### Cargos

CRUD basico para `job_positions`:

- Listagem
- Criacao
- Edicao
- Inativacao por `status = inactive`

Campos usados:

- `job_positions.unit_id`
- `job_positions.organization_id`
- `job_positions.department_id`
- `job_positions.code`
- `job_positions.name`
- `job_positions.description`
- `job_positions.is_leadership`
- `job_positions.status`

## APIs criadas

- `GET /api/base/units`
- `POST /api/base/units`
- `PATCH /api/base/units/[id]`
- `GET /api/base/departments`
- `POST /api/base/departments`
- `PATCH /api/base/departments/[id]`
- `GET /api/base/job-positions`
- `POST /api/base/job-positions`
- `PATCH /api/base/job-positions/[id]`

As APIs usam Supabase admin client apenas server-side e exigem sessao autenticada. A service role nao e enviada ao client.

## Tabelas utilizadas

- `organizations`
- `units`
- `unit_settings`
- `departments`
- `job_positions`
- `app_users`, indiretamente pelo contexto de sessao
- `user_unit_links`, indiretamente pelo contexto de sessao
- `access_profiles`, indiretamente pelo contexto de sessao

## Limitacoes desta sprint

- Nao ha matriz granular de permissoes.
- As telas exigem apenas usuario autenticado.
- Inativacao usa `status = inactive`; nao ha exclusao fisica.
- Cidade e estado da unidade ficam em `unit_settings`, pois nao existem colunas dedicadas em `units`.
- REC/Recepcao nao foi criado por seed; pode ser cadastrado pela tela de departamentos.
- Usuarios, perfis/permissoes, UHs/quartos e fornecedores ficaram como cards em breve.

## Fica para Sprint 4B

- Avancar no proximo bloco do Modulo Base solicitado.
- Melhorar filtros e busca conforme uso real.
- Definir se cidade/estado devem virar colunas ou permanecer em configuracao por unidade.
- Incluir auditoria detalhada por operacao quando a politica de auditoria da interface for fechada.

## Fica para Sprint 4C

- Permissoes granulares por perfil, unidade, modulo e acao.
- Regras visuais por permissao para botoes de criar, editar e inativar.

