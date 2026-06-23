# Plano de Autorizacao Granular para Base, Compras e Attachments

## 1. Objetivo

Corrigir a lacuna confirmada no diagnostico de autorizacao: rotas de `src/app/api/base`, `src/app/api/purchases` e `src/app/api/attachments` ainda dependem de `requireAuthenticatedRequest()` ou `requireSuperAdminRequest()` sem uma matriz granular consistente por permissao e, em alguns casos, sem filtro por unidade.

O objetivo da proxima etapa de codigo sera criar um helper generico reutilizavel, no mesmo modelo operacional do RH, para exigir permissao por acao e retornar as unidades acessiveis do usuario. As rotas afetadas deverao usar essas unidades para leitura e escrita.

Antes de escrever codigo em `src/`, a primeira etapa obrigatoria e apresentar uma migration de seed/grants para cadastrar permissoes faltantes e conceder acessos aos perfis corretos. Essa migration mexe em `permissions` e `profile_permissions`, area sensivel do `docs/NAO_ALTERAR.md`, portanto deve ser revisada e aprovada antes de ser aplicada.

Nao faz parte deste plano alterar login, Supabase Auth, `auth_email`, RLS/policies, fluxo de login ou regras de negocio fora do escopo de autorizacao.

## 2. Ordem aprovada de execucao

1. Planejar a migration de seed/grants.
2. Criar a migration somente apos aprovacao deste plano.
3. Apresentar o SQL da migration e aguardar aprovacao antes de aplicar no Supabase.
4. Aplicar a migration aprovada.
5. Refatorar `requireHrPermission` para delegar ao helper generico, mantendo comportamento identico para RH.
6. Rodar testes de screenshot/UAT do RH para garantir que o RH nao quebrou.
7. Migrar rotas de `src/app/api/base`.
8. Migrar rotas de `src/app/api/purchases`.
9. Migrar rotas de `src/app/api/attachments`.
10. Rodar lint, build e testes manuais de autorizacao.

## 3. Migration de seed/grants obrigatoria

### 3.1 Objetivo da migration

A migration deve:

- cadastrar permissoes `BASE:*` faltantes;
- cadastrar permissoes `PURCHASES:*`;
- cadastrar permissoes `ATTACHMENTS:*`;
- conceder permissao aos perfis corretos via `profile_permissions`;
- manter `SUPER_ADMIN` com todas as permissoes;
- nao alterar Auth, login, RLS, `auth_email`, policies ou schema operacional.

### 3.2 Permissoes BASE

Permissoes ja existentes:

| Codigo | Uso |
|---|---|
| `BASE:units.view` | Ver unidades. |
| `BASE:units.manage` | Gerenciar unidades. |
| `BASE:employees.view` | Ver colaboradores. |
| `BASE:employees.manage` | Gerenciar colaboradores. |
| `BASE:users.view` | Ver usuarios internos. |
| `BASE:users.manage` | Gerenciar usuarios internos. |
| `BASE:departments.manage` | Gerenciar departamentos legado. |

Permissoes novas obrigatorias:

| Codigo novo | Uso |
|---|---|
| `BASE:departments.view` | Ver departamentos. |
| `BASE:job_positions.view` | Ver cargos. |
| `BASE:job_positions.manage` | Gerenciar cargos. |
| `BASE:suppliers.view` | Ver fornecedores. |
| `BASE:suppliers.manage` | Gerenciar fornecedores. |

Regra: GET usa `.view`; POST/PATCH/DELETE usa `.manage`. Nao reutilizar `.manage` para leitura quando houver `.view`.

### 3.3 Permissoes PURCHASES

Permissoes novas obrigatorias:

| Codigo novo | Uso |
|---|---|
| `PURCHASES:requests.view` | Ver solicitacoes de compra. |
| `PURCHASES:requests.manage` | Criar, editar, enviar ou cancelar solicitacoes. |
| `PURCHASES:quotes.view` | Ver cotacoes. |
| `PURCHASES:quotes.manage` | Iniciar, criar, editar, selecionar, excluir e negociar cotacoes. |
| `PURCHASES:approvals.view` | Ver fila e dossies de aprovacao de compras. |
| `PURCHASES:approvals.submit` | Enviar ou reenviar compra para aprovacao. |
| `PURCHASES:approvals.decide` | Decidir aprovacao, mantendo alcadas existentes. |
| `PURCHASES:documentation.view` | Ver dashboard documental de cotacoes. |

### 3.4 Permissoes ATTACHMENTS

Permissoes novas obrigatorias:

| Codigo novo | Uso |
|---|---|
| `ATTACHMENTS:purchases.view` | Ver anexos de compras no escopo permitido. |
| `ATTACHMENTS:purchases.manage` | Enviar ou remover anexos de compras no escopo permitido. |

Observacao: os anexos atuais de `/api/attachments` aceitam apenas `module = purchases` e `entity_type = purchase_quote`. A autorizacao deve validar permissao de attachment e tambem unidade da cotacao/solicitacao relacionada.

### 3.5 Grants por perfil

Grants iniciais seguindo a matriz `docs/RH-35B_MATRIZ_PAPEIS_PERMISSOES_MENU.md`:

| Perfil atual | Grants planejados |
|---|---|
| `SUPER_ADMIN` | Todas as permissoes `BASE:*`, `PURCHASES:*` e `ATTACHMENTS:*`. |
| `NETWORK_MANAGER` | `BASE:units.view`, `BASE:departments.view`, `BASE:job_positions.view`, `BASE:employees.view`, `BASE:suppliers.view`, `PURCHASES:requests.view`, `PURCHASES:quotes.view`, `PURCHASES:approvals.view`, `PURCHASES:approvals.decide`, `PURCHASES:documentation.view`, `ATTACHMENTS:purchases.view`. |
| `UNIT_DIRECTOR` | Mesmas permissoes de consulta/aprovacao de Compras da unidade: `BASE:* .view` aplicavel, `PURCHASES:requests.view`, `PURCHASES:quotes.view`, `PURCHASES:approvals.view`, `PURCHASES:approvals.decide`, `PURCHASES:documentation.view`, `ATTACHMENTS:purchases.view`. |
| `DEPARTMENT_MANAGER` | Consulta e operacao administrativa conforme escopo: `BASE:departments.view`, `BASE:job_positions.view`, `BASE:employees.view`, `BASE:suppliers.view`, `PURCHASES:requests.view`, `PURCHASES:requests.manage`, `PURCHASES:quotes.view`, `PURCHASES:approvals.view`, `PURCHASES:approvals.decide` quando a alcada permitir, `PURCHASES:documentation.view`, `ATTACHMENTS:purchases.view`. |
| `SUPERVISOR` | `BASE:departments.view`, `BASE:job_positions.view`, `BASE:employees.view`, `BASE:suppliers.view`, `PURCHASES:requests.view`, `PURCHASES:requests.manage`, `PURCHASES:quotes.view`, `ATTACHMENTS:purchases.view`. |
| `FINANCE` | `BASE:suppliers.view`, `PURCHASES:requests.view`, `PURCHASES:quotes.view`, `PURCHASES:approvals.view`, `PURCHASES:documentation.view`, `ATTACHMENTS:purchases.view`. |
| `AUDIT` | Permissoes de leitura/auditoria: `BASE:* .view` aplicavel, `PURCHASES:requests.view`, `PURCHASES:quotes.view`, `PURCHASES:approvals.view`, `PURCHASES:documentation.view`, `ATTACHMENTS:purchases.view`. |
| `EMPLOYEE` | `PURCHASES:requests.view` e `PURCHASES:requests.manage` apenas para operacao propria no escopo da unidade, se o produto mantiver solicitante operacional. |
| `EXTERNAL_TECHNICIAN` | Nenhum grant de Base/Compras/Attachments por padrao. |

Ponto de revisao: a matriz RH-35B cita papeis conceituais como `COMPRAS`, `GERENCIA_ADMINISTRATIVA` e outros que ainda nao aparecem como perfis persistidos nas migrations atuais. A migration inicial deve conceder aos perfis existentes de forma conservadora. Uma migration futura pode criar perfis operacionais novos se aprovado.

## 4. Helper generico proposto

Criar um helper generico, reaproveitando a logica de `src/lib/hr/api-auth.ts`, com responsabilidade equivalente a:

- validar sessao com os helpers existentes;
- localizar a permissao em `permissions.code`;
- considerar `profile_permissions`;
- considerar `user_permission_overrides`;
- considerar apenas `user_unit_links` ativos;
- retornar `accessibleUnitIds`;
- tratar `SUPER_ADMIN` como acesso a todas as unidades ativas;
- devolver `403` quando nao houver permissao efetiva.

Nome sugerido:

| Item | Nome sugerido |
|---|---|
| Helper de consulta de escopo | `getAccessibleUnitIdsForPermission` |
| Helper de rota | `requirePermission` |
| Contexto retornado | `PermissionRequestContext` |
| Assertion de unidade | `assertUnitInPermissionScope` |

Local sugerido:

`src/lib/auth/permissions.ts` ou `src/lib/base-cadastros/api-permissions.ts`.

Depois da migration, `src/lib/hr/api-auth.ts` deve delegar internamente ao helper generico sem mudar sua API publica. O comportamento de RH deve permanecer identico.

## 5. Rotas de Cadastros afetadas

| Rota | Metodo | Permissao | Filtro/restricao por unidade |
|---|---:|---|---|
| `/api/base/units` | GET | `BASE:units.view` | Listar somente `units.id in accessibleUnitIds`, exceto `SUPER_ADMIN`; buscar `unit_settings` apenas das unidades filtradas. |
| `/api/base/units` | POST | `BASE:units.manage` | Criacao de unidade nova deve ficar restrita a `SUPER_ADMIN` ate regra global explicita. |
| `/api/base/units/[id]` | PATCH | `BASE:units.manage` | Confirmar `params.id` em `accessibleUnitIds`, exceto `SUPER_ADMIN`. |
| `/api/base/departments` | GET | `BASE:departments.view` | Aplicar `.in("unit_id", accessibleUnitIds)` na query principal. |
| `/api/base/departments` | POST | `BASE:departments.manage` | Validar `payload.unitId` em `accessibleUnitIds`. |
| `/api/base/departments/[id]` | PATCH | `BASE:departments.manage` | Exigir unidade atual e unidade de destino no escopo. |
| `/api/base/job-positions` | GET | `BASE:job_positions.view` | Aplicar `.in("unit_id", accessibleUnitIds)` na query principal. |
| `/api/base/job-positions` | POST | `BASE:job_positions.manage` | Validar `payload.unitId`; se `departmentId` vier, confirmar departamento da mesma unidade. |
| `/api/base/job-positions/[id]` | PATCH | `BASE:job_positions.manage` | Exigir unidade atual e unidade de destino no escopo; validar departamento da unidade. |
| `/api/base/employees` | GET | `BASE:employees.view` | Aplicar `.in("unit_id", accessibleUnitIds)` na query principal. |
| `/api/base/employees` | POST | `BASE:employees.manage` | Validar `payload.unitId`; validar departamento/cargo dentro da mesma unidade quando informados. |
| `/api/base/employees/[id]` | PATCH | `BASE:employees.manage` | Exigir unidade atual e unidade de destino no escopo; validar departamento/cargo. |
| `/api/base/suppliers` | GET | `BASE:suppliers.view` | Substituir `session.units` por `accessibleUnitIds`; fornecedor global sem `unit_id` visivel apenas para `SUPER_ADMIN` ate regra explicita. |
| `/api/base/suppliers` | POST | `BASE:suppliers.manage` | Validar `payload.unitId`; fornecedor global sem unidade restrito a `SUPER_ADMIN` ate regra explicita. |
| `/api/base/suppliers/[id]` | GET | `BASE:suppliers.view` | Se tiver `unit_id`, exigir unidade no escopo; se nao tiver, restringir a `SUPER_ADMIN`. |
| `/api/base/suppliers/[id]` | PATCH | `BASE:suppliers.manage` | Exigir unidade atual e unidade de destino no escopo; fornecedor global restrito a `SUPER_ADMIN`. |
| `/api/base/users` | GET | `BASE:users.view` | Atualmente exige `SUPER_ADMIN`; se migrar, filtrar usuarios por links em unidades acessiveis e esconder usuarios fora do escopo. |
| `/api/base/users` | POST | `BASE:users.manage` | Validar que todas as `payload.unitIds` estao no escopo; criar usuario multiunidade fora do proprio escopo exige `SUPER_ADMIN`. |
| `/api/base/users/[id]` | PATCH | `BASE:users.manage` | Impedir atribuir/remover escopos fora das unidades acessiveis, exceto `SUPER_ADMIN`. |

## 6. Rotas de Compras afetadas

| Rota | Metodo | Permissao | Filtro/restricao por unidade |
|---|---:|---|---|
| `/api/purchases/requests` | GET | `PURCHASES:requests.view` | Continuar `.in("unit_id", accessibleUnitIds)`, usando escopo do helper. |
| `/api/purchases/requests` | POST | `PURCHASES:requests.manage` | Validar `payload.unitId`, departamento e centro de custo dentro do escopo. |
| `/api/purchases/requests/[id]` | GET | `PURCHASES:requests.view` | Buscar solicitacao e ocultar se `request.unit_id` estiver fora do escopo. |
| `/api/purchases/requests/[id]` | PATCH | `PURCHASES:requests.manage` | Exigir unidade atual e unidade de destino no escopo; manter bloqueios de status. |
| `/api/purchases/requests/[id]/quotes` | POST | `PURCHASES:quotes.manage` | Exigir `request.unit_id` no escopo; validar fornecedor no escopo ou fornecedor global permitido. |
| `/api/purchases/requests/[id]/quotes/[quoteId]` | PATCH | `PURCHASES:quotes.manage` | Exigir `request.unit_id` no escopo; garantir `quote.purchase_request_id = params.id`. |
| `/api/purchases/requests/[id]/quotes/[quoteId]` | DELETE | `PURCHASES:quotes.manage` | Exigir `request.unit_id` no escopo; manter bloqueios de dossie formal e cotacao selecionada. |
| `/api/purchases/requests/[id]/quotes/[quoteId]/negotiations` | POST | `PURCHASES:quotes.manage` | Exigir `request.unit_id` no escopo; validar fornecedor/origem da cotacao. |
| `/api/purchases/quotes` | GET | `PURCHASES:quotes.view` | Filtrar solicitacoes/cotacoes por `.in("unit_id", accessibleUnitIds)` e fornecedores por escopo. |
| `/api/purchases/approvals` | GET | `PURCHASES:approvals.view` | Trocar `requireSuperAdminRequest` por helper granular e manter `.in("unit_id", accessibleUnitIds)`. |
| `/api/purchases/approvals/[requestId]/decision` | POST | `PURCHASES:approvals.decide` | Exigir permissao e unidade no escopo; manter `assertCanDecidePurchaseApprovalLevel`. |
| `/api/purchases/approvals/[requestId]/resubmit` | POST | `PURCHASES:approvals.submit` | Exigir unidade da solicitacao no escopo e permissao de envio; manter validacoes de status/evidencia. |
| `/api/purchases/documentation-dashboard` | GET | `PURCHASES:documentation.view` | Continuar `.in("unit_id", accessibleUnitIds)` em `purchase_quotes`; consultas derivadas partem dos IDs filtrados. |

## 7. Rotas de Attachments afetadas

| Rota | Metodo | Permissao | Filtro/restricao por unidade |
|---|---:|---|---|
| `/api/attachments` | GET | `ATTACHMENTS:purchases.view` | Validar `module = purchases`, `entity_type = purchase_quote`; carregar cotacao/solicitacao relacionada e exigir unidade no escopo. |
| `/api/attachments` | POST | `ATTACHMENTS:purchases.manage` | Validar cotacao/solicitacao relacionada e unidade no escopo antes de upload e insert em `attachments`. |
| `/api/attachments/[id]` | DELETE | `ATTACHMENTS:purchases.manage` | Carregar attachment, validar modulo/tipo, carregar cotacao/solicitacao relacionada e exigir unidade no escopo antes do soft delete. |

## 8. Regras de filtro por unidade

1. Toda leitura de tabela com `unit_id` deve aplicar `.in("unit_id", accessibleUnitIds)`, exceto quando `isSuperAdmin = true`.
2. Toda escrita deve validar a unidade atual do registro antes de alterar.
3. Toda escrita que recebe `payload.unitId` deve validar a unidade de destino.
4. Registros globais com `unit_id null` nao devem ser tratados como visiveis para todos por padrao. A regra inicial e restringir a `SUPER_ADMIN`, salvo aprovacao de regra global explicita.
5. Consultas auxiliares de `units`, `departments`, `job_positions`, `suppliers`, `attachments` e eventos devem derivar dos IDs ja autorizados ou aplicar o mesmo escopo.
6. Fora de escopo deve preferir `404` quando revelar existencia do registro for sensivel; `403` pode ser usado quando a mensagem operacional ja existe e nao vaza detalhe adicional.

## 9. Validacao obrigatoria

Depois da migration e antes de migrar rotas:

- confirmar que `permissions` contem os codigos novos;
- confirmar que `profile_permissions` concedeu os grants esperados;
- confirmar que `SUPER_ADMIN` manteve acesso total;
- confirmar que usuarios nao-super com grants continuam acessando seu escopo.

Depois da refatoracao do helper e antes de migrar Base/Compras/Attachments:

- rodar testes de screenshot/UAT do RH;
- validar rotas criticas de RH que usam `requireHrPermission`;
- confirmar que o comportamento de RH continua identico.

Depois da migracao das rotas:

- usuario sem permissao recebe `403`;
- usuario com permissao em uma unidade enxerga/altera apenas aquela unidade;
- usuario sem acesso a unidade do registro nao enxerga nem altera;
- `SUPER_ADMIN` enxerga tudo;
- `npm.cmd run lint`;
- `npm.cmd run build`.

## 10. Pontos de revisao antes do codigo

| Ponto | Decisao necessaria |
|---|---|
| Migration de seed/grants | Aprovar SQL antes de aplicar, pois mexe em `permissions` e `profile_permissions`. |
| Perfis conceituais sem cadastro | Decidir se ficam mapeados para perfis atuais ou se uma sprint futura cria novos perfis. |
| Fornecedores globais | Confirmar se fornecedor sem `unit_id` e corporativo ou legado; por seguranca, restringir a `SUPER_ADMIN` inicialmente. |
| Criacao de unidades | Confirmar se apenas `SUPER_ADMIN` pode criar unidade nova. |
| Usuarios internos | Confirmar se sai de `SUPER_ADMIN` estrito para `BASE:users.*` com escopo por unidade. |

