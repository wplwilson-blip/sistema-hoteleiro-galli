# Localização dos comportamentos da Fase 3-C (para planejar testes)

> Gerado em 2026-07-02. **Read-only**: nenhum arquivo de código/config/migration/teste
> foi alterado. Sem commit.
>
> Arquivos-fonte:
> - Rota: `src/app/api/admin/permissions/profiles/route.ts` (GET/PUT/DELETE)
> - Client: `src/components/admin/perfis-acessos-client.tsx`
> - Helper de gate: `src/lib/auth/permissions.ts` (`requirePermission`)
> - Constante: `src/lib/auth/session.ts` → `SUPER_ADMIN_PROFILE_CODE = "SUPER_ADMIN"`
> - Seed do gate: `supabase/migrations/070_admin_permissions_catalog.sql`
>
> ⚠️ Nota de rótulos: os comentários no `route.ts` chamam SUPER_ADMIN de
> "Salvaguarda (a)" e anti-auto-trancamento de "Salvaguarda (b)" — **invertido**
> em relação à numeração deste pedido. Abaixo uso os rótulos **do pedido**.

---

## (a) ANTI-AUTO-TRANCAMENTO — **server-side** (handler DELETE)

- **Onde é checado:** `route.ts:379-383` (dentro do handler `DELETE`).
- **Consulta `user_unit_links` por query direta?** SIM — via `actorUsesProfile()`
  em `route.ts:70-86`. Não usa o perfil ativo da sessão (o ator pode ter o perfil
  numa unidade não-ativa).
- **Status / mensagem:** HTTP **422** — `"Voce nao pode remover permissoes de administracao de um perfil que voce mesmo utiliza."`
- **Escopo:** só dispara para códigos em `PROTECTED_ADMIN`
  (`["ADMIN:permissions.view", "ADMIN:overrides.manage", "ADMIN:profiles.manage"]`,
  `route.ts:15`). Só existe no caminho **DELETE** (conceder via PUT não reduz acesso).
- **Espelho no client (não é a trava real):** `perfis-acessos-client.tsx:245`
  (`lockedBySelfProtection`) apenas desabilita o checkbox.

```ts
// route.ts:379-383 (handler DELETE)
if (PROTECTED_ADMIN.includes(payload.permissionCode) && (await actorUsesProfile(supabase, actorId, profile.id))) {
  return apiError("Voce nao pode remover permissoes de administracao de um perfil que voce mesmo utiliza.", 422);
}
```
```ts
// route.ts:70-86 — a query direta em user_unit_links
const { data, error } = await supabase
  .from("user_unit_links")
  .select("id")
  .eq("app_user_id", actorId)
  .eq("access_profile_id", profileId)
  .eq("status", "active")
  .is("deleted_at", null)
  .limit(1);
```

---

## (b) SUPER_ADMIN INTOCÁVEL — **server-side** (PUT e DELETE)

- **Server-side no route.ts?** SIM, nos **dois** handlers: `route.ts:247-250` (PUT)
  e `route.ts:369-372` (DELETE).
- **Bloqueio por nome, código ou id?** Por **CÓDIGO** — compara
  `profile.code === SUPER_ADMIN_PROFILE_CODE`, e `SUPER_ADMIN_PROFILE_CODE === "SUPER_ADMIN"`
  (`session.ts:9`). Não é por nome nem por id.
- **Status / mensagem:** HTTP **422** — `"O perfil Super Administrador nao pode ser editado."`
- **Espelho no client:** `perfis-acessos-client.tsx:138` (`isSuperAdminProfile`) →
  em `:222-228` esconde a edição e mostra aviso "acesso total e não pode ser editado".

```ts
// route.ts:247-250 (PUT) e idêntico em route.ts:369-372 (DELETE)
if (profile.code === SUPER_ADMIN_PROFILE_CODE) {
  return apiError("O perfil Super Administrador nao pode ser editado.", 422);
}
```

---

## (c) SOFT-DELETE ao revogar — **UPDATE com `deleted_at`** (não DELETE físico)

- **UPDATE preenchendo `deleted_at` (soft-delete)** — `route.ts:406-411` (handler DELETE).
  **Não** há `.delete()` físico em nenhum caminho.
- **Seta `is_allowed=false` em algum caminho?** **NÃO.** A revogação seta
  `status: "inactive"` + `deleted_at` + `deleted_by` + `updated_by`, mas **não toca
  em `is_allowed`** (a linha soft-deletada permanece com o `is_allowed` que tinha).
  O único lugar que escreve `is_allowed` é o PUT (concessão/reativação), que seta
  `is_allowed: true` (`route.ts:280` e `:311`).
- Antes do UPDATE, o handler exige um grant **ativo** (`status=active`, `deleted_at null`)
  senão retorna `{ ok: true, removed: false }` idempotente (`route.ts:385-403`).

```ts
// route.ts:406-411 — a operação de escrita real da revogação (soft-delete)
const { data: updated, error: updateError } = await supabase
  .from("profile_permissions")
  .update({ status: "inactive", deleted_at: new Date().toISOString(), deleted_by: actorId, updated_by: actorId })
  .eq("id", current.id)
  .select(PROFILE_PERMISSION_COLUMNS)
  .single();
```

---

## (d) "AFETA N USUÁRIOS AGORA" — **calculado no SERVIDOR**, exibido no client

- **Servidor:** o número vem do handler **GET**, campo **`userCount`** por perfil
  (`route.ts:219`). Não é contado no cliente — o client só lê `selectedProfile.userCount`.
- **Query de contagem:** `route.ts:188-207` — busca `user_unit_links`
  (`access_profile_id`, `app_user_id`) filtrando `status=active` e `deleted_at null`,
  e conta **usuários distintos** por perfil via `Set<app_user_id>` (`.size`).
- **Exibição:** o texto do modal de confirmação está em
  `perfis-acessos-client.tsx:290-294`: *"Este perfil é usado por N usuário(s); a mudança
  afeta todos eles AGORA."* (usa `selectedProfile.userCount`).

```ts
// route.ts:202-207 — usuários distintos por perfil (fonte do userCount)
const usersByProfile = new Map<string, Set<string>>();
for (const link of (linkRows ?? []) as Array<{ access_profile_id: string; app_user_id: string }>) {
  const set = usersByProfile.get(link.access_profile_id) ?? new Set<string>();
  set.add(link.app_user_id);
  usersByProfile.set(link.access_profile_id, set);
}
// route.ts:219 — campo retornado no corpo da resposta
userCount: users?.size ?? 0,
```
```tsx
// perfis-acessos-client.tsx:291-293 — apenas exibe o número do servidor
{selectedProfile.userCount > 0
  ? `Este perfil é usado por ${selectedProfile.userCount} usuário${selectedProfile.userCount > 1 ? "s" : ""}; a mudança afeta todos eles AGORA.`
  : "Nenhum usuário usa este perfil atualmente; a mudança valerá para quem for vinculado a ele."}
```

---

## (e) FIXTURE DE TESTE — usuário NÃO super-admin com `ADMIN:profiles.manage`

**NÃO EXISTE — precisa de fixture.** (com base na evidência do repositório)

- O único grant de `ADMIN:profiles.manage` no repo é o seed
  `supabase/migrations/070_admin_permissions_catalog.sql:31-58`, que concede a permissão
  **exclusivamente ao perfil `SUPER_ADMIN`** (matriz `profile_permission_matrix` só lista
  `SUPER_ADMIN`). Nenhum perfil não-super recebe `profiles.manage`.
- Usuários E2E documentados (`.env.e2e.example`, `tests/e2e/helpers/auth.ts`):
  - `E2E_ADMIN` = **super admin** (tem tudo, inclusive `profiles.manage`, mas é super).
  - `E2E_MULTI` = **não-super** (Gerente Departamental, permissões de compras/RH), **sem**
    `ADMIN:profiles.manage`.
- Não há seed/script no repo criando um não-super com essa permissão.

> Ressalva: isto reflete o **repositório**. Não consultei o banco de staging ao vivo
> (tarefa read-only sobre arquivos). Se alguém concedeu `profiles.manage` manualmente
> a um perfil não-super no staging, só uma query no DB confirmaria — não há evidência disso
> nos arquivos. Para testar (a)/(b)/(c) com um ator **não-super** que passe pelo gate, será
> preciso **criar a fixture** (usuário não-super + grant `ADMIN:profiles.manage`).

---

## (f) GATE DA ROTA — permissão exigida no PUT e DELETE

- **PUT** exige `requirePermission("ADMIN:profiles.manage")` — `route.ts:231`.
- **DELETE** exige `requirePermission("ADMIN:profiles.manage")` — `route.ts:353`.
- **Confirmado: é `ADMIN:profiles.manage`** nos dois. (O GET usa outra:
  `ADMIN:permissions.view`, `route.ts:130`.)
- **Helper:** `requirePermission` importado de `@/lib/auth/permissions` (`route.ts:3`),
  o helper base (`permissions.ts:330-361`). Retorna `{ context, response }`; nega com
  **403** (`"Voce nao tem permissao para acessar este recurso."`) quando não há permissão.
- **Relação com o RH (`src/lib/hr/api-auth.ts`):** é o **mesmo** helper base. O RH apenas
  o embrulha em `requireHrPermission` (`hr/api-auth.ts:165-175`), que chama
  `requirePermission(...)` por baixo. A rota de perfis usa `requirePermission`
  **diretamente** (não o wrapper de RH) — mesmo padrão de retorno `{context, response}`
  usado por `overrides/route.ts`.

```ts
// route.ts:230-235 (PUT) — gate; DELETE é idêntico em route.ts:352-357
export async function PUT(request: Request) {
  const { context, response } = await requirePermission("ADMIN:profiles.manage");
  if (response || !context) {
    return response;
  }
```
