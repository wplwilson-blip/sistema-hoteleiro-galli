# 43 — Estreitamento "active-unit" respeitando visão de rede + Aprovações no padrão

Branch: `fix/approvals-active-unit-scope`

## Problema

Em `src/lib/auth/permissions.ts`, o resolver de escopo
(`getAccessibleUnitIdsForPermission`) estreitava para a unidade ativa de forma **cega**
quando `options.scope === "active-unit"`:

```ts
const accessibleUnitIds =
  options?.scope === "active-unit"
    ? unionUnitIds.filter((unitId) => unitId === session.activeUnit?.id)
    : unionUnitIds;
```

Resultado: o diretor de rede (`NETWORK_MANAGER`), cuja função é ver a rede toda, era
indevidamente limitado à unidade ativa nas telas que usam `scope: "active-unit"`
(Cotações, Solicitações, Documentation).

Além disso, a listagem de **Aprovações** não passava `scope: "active-unit"` — via todas as
unidades —, enquanto Cotações/Solicitações/Documentation usam. Inconsistência que quebrava
o fluxo devolver→revisar (o usuário de unidade via em Aprovações unidades que não vê nas
outras telas).

## Mudanças

### A) `src/lib/auth/session.ts`
Adicionada a constante ao lado de `SUPER_ADMIN_PROFILE_CODE`:

```ts
export const NETWORK_MANAGER_PROFILE_CODE = "NETWORK_MANAGER";
```

### B) `src/lib/auth/permissions.ts`
- Importado `NETWORK_MANAGER_PROFILE_CODE` de `@/lib/auth/session`.
- Em `getActiveUserUnitLinks`, o `select` passou a trazer `code` do perfil
  (`access_profiles!inner(id, status, code)`) — **mesma query**, apenas uma coluna a mais.
- No ramo de usuário comum, `hasNetworkScope` é calculado reusando a **mesma lista de
  links** já carregada (`links.some(link => link.access_profiles?.code === NETWORK_MANAGER_PROFILE_CODE)`),
  no mesmo padrão que o `SUPER_ADMIN` usa em `session.ts`. **Nenhuma query nova.** No ramo
  `isSuperAdmin` os links não são carregados e a flag permanece `false` (irrelevante —
  super admin já vê tudo).
- O estreitamento passou a respeitar a visão de rede:

```ts
const applyActiveUnitNarrowing =
  options?.scope === "active-unit" && !isSuperAdmin && !hasNetworkScope;
const accessibleUnitIds = applyActiveUnitNarrowing
  ? unionUnitIds.filter((unitId) => unitId === session.activeUnit?.id)
  : unionUnitIds;
```

- `hasPermission` **continua calculado sobre a UNIÃO** (`unionUnitIds`), não sobre o
  conjunto estreitado. O estreitamento é só de visualização, nunca de autorização.

### C) `src/app/api/purchases/approvals/route.ts`
Na listagem (`GET`), o `requirePermission(PURCHASES_PERMISSIONS.approvalsView)` passou a
receber `{ scope: "active-unit" }`, alinhando Aprovações a Cotações/Solicitações/Documentation.
A rota de decisão e o restante do arquivo não foram tocados.

## Efeitos (critério de aceite)

- Usuário de perfil de unidade (não super admin, não network manager) com 2 unidades: em
  Aprovações vê só a unidade ativa; ao trocar a unidade no header, vê a outra.
- Super Admin e `NETWORK_MANAGER` continuam vendo **todas** as unidades em Aprovações.
- Cotações/Solicitações/Documentation: `NETWORK_MANAGER` passa a ver todas as unidades
  (antes via só a ativa) — comportamento correto e esperado.
- Nenhuma mudança em quem pode decidir/aprovar: a autorização (`hasPermission`) permanece
  sobre a união das unidades.

## Restrições respeitadas (NAO_ALTERAR.md)

- Não alteradas RLS, Auth, login, migrations nem schema.
- A assinatura pública de `requirePermission` não mudou — apenas foi usado o `options`
  já existente.
- Não foi criado caminho novo de detecção de perfil: usou-se `getActiveUserUnitLinks` +
  `code`, a mesma fonte do `SUPER_ADMIN`.
- Ninguém ganha/perde permissão: muda apenas o conjunto de unidades exibido.
- Sem libs novas. `lint` e `build` passam.
