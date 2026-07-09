# Plano — Memoização por-request do resolver de permissão

**Área SENSÍVEL** (`docs/NAO_ALTERAR.md`: helper de permissão/sessão). Este documento é
**só o plano**. Nenhum código de produção é escrito nesta tarefa. Aguardando revisão.

Branch: `perf/permission-resolver-memo`. Sem push de código; apenas este documento.

---

## 0. Diagnóstico (confirmado em varredura)

`src/lib/auth/permissions.ts` → `getAccessibleUnitIdsForPermission` é o resolver central.
Para um usuário **não** super-admin-por-código, cada resolução executa:

- `userHasActiveSuperAdminProfile(supabase, userId)` — 1 query em `user_unit_links`
- `getActiveUserUnitLinks(supabase, userId)` — 1 query em `user_unit_links`
- (super-admin) `getAllActiveUnitIds(supabase)` — 1 query em `units`

Estas **3 folhas** dependem **apenas do `userId`** (as duas primeiras) ou **de nada**
(a terceira), portanto são idempotentes dentro de um request. As outras 3 folhas
(`getPermissionId`, `getProfileAllowedIds`, `applyUserPermissionOverrides`) dependem do
**código de permissão** (variam por chamada) e **ficam fora do escopo**.

Contagem real no caminho quente `GET /api/hr/workflows/[id]` (arquivo `route.ts`):

| Resolução | Origem |
|---|---|
| 1 | `requireHrWorkflowPermission(workflowsView)` (gate) |
| 2 | `getWorkflowPermissionAccess(workflowsSensitiveView)` |
| 3,4,5 | `buildDetailAllowedActions` → `Promise.all` [`workflowStepsComplete`, `workflowsApprove`, `workflowsCancel`] |

São **5 resoluções** só no GET → hoje **5× `userHasActiveSuperAdminProfile`** e
**5× `getActiveUserUnitLinks`** (não-admin), ou **5× `getAllActiveUnitIds`** (super-admin),
todas com o **mesmo `userId`**. Contando os demais handlers da família de workflows o total
chega a ~9. É N+1 no caminho de toda tela gateada.

**Objetivo:** deduplicar essas 3 leituras idempotentes por-request com `cache()` do React.
Zero mudança de comportamento (mesmo `{isSuperAdmin, accessibleUnitIds, hasPermission,
hasPermissionInScope}`, mesma semântica de erro, mesma mensagem HTTP, mesmo prefixo de log).

---

## 1. As 3 folhas e o wrapper `cache()` proposto

### 1.1 Princípio de desenho (por que resolver com objeto-resultado, não com throw)

Regra 1 exige que o fetcher memoizado **não receba** `supabase` nem `options` (senão a
chave do cache — que deve ser só o `userId` primitivo — quebra, pois `options` é um objeto
com referência nova a cada chamada e carrega o closure `logError`).

Mas a **mensagem** do erro 500 (`options.validationErrorMessage` /
`unitValidationErrorMessage`) **e** o **prefixo de log** (`options.logError`) vêm ambos de
`options`. Para preservar as duas coisas (semântica de erro + prefixo), o fetcher memoizado
**não loga e não lança**: ele faz só a leitura idempotente e devolve um **objeto-resultado
discriminado**. Quem tem `options` (o chamador `getAccessibleUnitIdsForPermission`) faz a
**política**: em erro, loga com o prefixo correto e lança `PermissionAuthorizationError(…, 500)`
com a mensagem correta. Assim o cache guarda um valor resolvido (nunca uma Promise rejeitada)
e a chave permanece só o `userId`.

```ts
// tipo interno (não exportado)
type LeafOk<T> = { ok: true; value: T };
type LeafErr = { ok: false; stage: string; error: { name?: string; message?: string; code?: string } };
type LeafResult<T> = LeafOk<T> | LeafErr;
```

### 1.2 Os 3 fetchers memoizados (chave = `userId`, sem args extras)

```ts
import { cache } from "react";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// FOLHA 1 — flag de super-admin ativo. Chave: userId.
const readActiveSuperAdminFlag = cache(async (userId: string): Promise<LeafResult<boolean>> => {
  const supabase = createSupabaseAdminClient();               // client criado INTERNAMENTE
  const { data, error } = await supabase
    .from("user_unit_links")
    .select("id, access_profiles!inner(code)")
    .eq("app_user_id", userId)
    .eq("status", "active")
    .is("deleted_at", null)
    .eq("access_profiles.code", SUPER_ADMIN_PROFILE_CODE)
    .eq("access_profiles.status", "active")
    .is("access_profiles.deleted_at", null)
    .limit(1);
  if (error) return { ok: false, stage: "super_admin_profile_lookup_failed", error };
  return { ok: true, value: Boolean(data?.length) };
});

// FOLHA 2 — vínculos ativos do usuário. Chave: userId.
const readActiveUserUnitLinks = cache(async (userId: string): Promise<LeafResult<UserUnitLinkRow[]>> => {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("user_unit_links")
    .select("unit_id, access_profile_id, units!inner(id, status), access_profiles!inner(id, status)")
    .eq("app_user_id", userId)
    .eq("status", "active")
    .is("deleted_at", null)
    .eq("units.status", "active")
    .is("units.deleted_at", null)
    .eq("access_profiles.status", "active")
    .is("access_profiles.deleted_at", null);
  if (error) return { ok: false, stage: "user_unit_links_lookup_failed", error };
  return { ok: true, value: data ?? [] };
});

// FOLHA 3 — todas as unidades ativas. SEM argumento (dedup única por request).
const readAllActiveUnitIds = cache(async (): Promise<LeafResult<string[]>> => {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("units").select("id").eq("status", "active").is("deleted_at", null);
  if (error) return { ok: false, stage: "units_list_failed", error };
  return { ok: true, value: unique((data ?? []).map((unit) => unit.id)) };
});
```

Notas:
- `UserUnitLinkRow` = tipo derivado do `select` atual (mesmo shape que hoje retorna
  `getActiveUserUnitLinks`); tipagem estrita, sem `any`. Pode ser o tipo já inferido pelo
  supabase-js ou um `type` explícito com `unit_id`/`access_profile_id`.
- As queries são **cópias byte-a-byte** das folhas atuais (mesmos filtros, mesmo `limit`),
  garantindo resultado idêntico.
- `const … = cache(async …)` fica em **escopo de módulo** (referência estável, exigida pelo
  React). Isto **não** é um cache global mutável nosso — ver §4.

### 1.3 Adaptadores option-aware (não memoizados, substituem as 3 folhas atuais)

Estes preservam **assinatura de erro + mensagem + prefixo de log** exatamente como hoje.
São finos e recebem `options` (nunca entram na chave do cache):

```ts
function unwrapLeaf<T>(
  result: LeafResult<T>,
  options: PermissionAuthorizationOptions | undefined,
  message: "validation" | "unit"
): T {
  if (result.ok) return result.value;
  logPermissionError(options, result.stage, result.error);          // mesmo prefixo de hoje
  const fallback =
    message === "unit"
      ? options?.unitValidationErrorMessage ?? defaultUnitValidationErrorMessage
      : options?.validationErrorMessage ?? defaultValidationErrorMessage;
  throw new PermissionAuthorizationError(fallback, 500);             // mesma semântica de hoje
}

async function userHasActiveSuperAdminProfile(userId: string, options?: PermissionAuthorizationOptions) {
  return unwrapLeaf(await readActiveSuperAdminFlag(userId), options, "validation");
}
async function getActiveUserUnitLinks(userId: string, options?: PermissionAuthorizationOptions) {
  return unwrapLeaf(await readActiveUserUnitLinks(userId), options, "unit");
}
async function getAllActiveUnitIds(options?: PermissionAuthorizationOptions) {
  return unwrapLeaf(await readAllActiveUnitIds(), options, "unit");
}
```

Mapa de mensagem/prefixo vs. hoje (idêntico):

| Folha | `message` | Mensagem 500 (HR) | Prefixo de log (HR) | Prefixo de log (default/base) |
|---|---|---|---|---|
| super-admin | `validation` | "…validar as permissoes de RH." | `[base_cadastros.hr.super_admin_profile_lookup_failed]` | `[base_cadastros.permissions.super_admin_profile_lookup_failed]` |
| links | `unit` | "…validar as unidades permitidas." | `[base_cadastros.hr.user_unit_links_lookup_failed]` | `[base_cadastros.permissions.user_unit_links_lookup_failed]` |
| all units | `unit` | "…validar as unidades permitidas." | `[base_cadastros.hr.units_list_failed]` | `[base_cadastros.permissions.units_list_failed]` |

> **Assinaturas mudam só internamente**: `userHasActiveSuperAdminProfile`,
> `getActiveUserUnitLinks` e `getAllActiveUnitIds` são funções **privadas do módulo**
> (não exportadas). Trocar `(supabase, userId, options)` → `(userId, options)` /
> `(options)` não afeta nenhuma API pública. As públicas
> (`getAccessibleUnitIdsForPermission`, `requirePermission`, `userHasPermissionForUnit`,
> `assertUnitInPermissionScope`) **não mudam de assinatura**.

---

## 2. Diff conceitual em `getAccessibleUnitIdsForPermission`

Só trocam as **3 chamadas** para as folhas memoizadas; toda a lógica de união, overrides,
scope aggregate/active-unit e cálculo de `hasPermission` fica **idêntica**.

```diff
  const isSuperAdmin =
    session.profile.code === SUPER_ADMIN_PROFILE_CODE ||
-   (await userHasActiveSuperAdminProfile(supabase, session.user.id, options));
+   (await userHasActiveSuperAdminProfile(session.user.id, options));   // memoizado por userId

  if (isSuperAdmin) {
-   unionUnitIds = await getAllActiveUnitIds(supabase, options);
+   unionUnitIds = await getAllActiveUnitIds(options);                  // memoizado (sem arg)
    hasPermission = true;
  } else {
    const permissionId = await getPermissionId(supabase, permissionCode, options);   // INALTERADO
    if (!permissionId) { return { isSuperAdmin, accessibleUnitIds: [], hasPermission: false, hasPermissionInScope: false }; }

-   const links = await getActiveUserUnitLinks(supabase, session.user.id, options);
+   const links = await getActiveUserUnitLinks(session.user.id, options);            // memoizado por userId
    const linkedUnitIds = new Set(unique(links.map((link) => link.unit_id)));
    const profileIds = unique(links.map((link) => link.access_profile_id));
    const allowedProfileIds = await getProfileAllowedIds(supabase, profileIds, permissionId, options); // INALTERADO
    …
    await applyUserPermissionOverrides({ supabase, userId: session.user.id, permissionId, … });         // INALTERADO
  }
```

- `getAccessibleUnitIdsForPermission` continua recebendo `supabase` (passa para as folhas
  **não** memoizadas: `getPermissionId`, `getProfileAllowedIds`, `applyUserPermissionOverrides`).
  O `supabase` deixa de ser repassado só para as 3 folhas memoizadas.
- `import { cache } from "react";` adicionado ao topo do módulo.
- Nada mais no arquivo muda.

---

## 3. Semântica de erro e prefixo de log — **decisão fechada**

**Decisão: preservar TUDO** (comportamento, mensagem HTTP 500 **e** prefixo de log). Não
"gastamos" a tolerância oferecida na regra 3. Motivo: área sensível; e a mensagem do 500
vem de `options` — portanto o erro **precisa** ser tratado pelo chamador option-aware de
qualquer forma (§1.3), e uma vez lá, preservar também o prefixo é de graça (mesma chamada
`logPermissionError(options, stage, error)`). Resultado: **zero diferença observável**.

- Em erro de query, continua lançando `PermissionAuthorizationError` com **status 500** e a
  **mesma mensagem** de hoje.
- Prefixo de log **idêntico** (`base_cadastros.hr.*` para HR; `base_cadastros.permissions.*`
  para base/default), pois o log continua saindo de `logPermissionError(options, …)`.
- Contagem de logs no caminho de erro: preservada. O fetcher memoizado roda a query **uma
  vez** e devolve `{ ok:false }` cacheado; **cada chamador** que consumir esse resultado
  chama `logPermissionError` e lança — exatamente como hoje cada chamada logava/lançava.
  (Na prática o 1º throw aborta o request; em `Promise.all` os N irmãos logam N vezes, igual
  a hoje.)

**Alternativa tolerada (NÃO escolhida), para registro:** memoizar a folha lançando/logando
internamente com prefixo genérico `permissions.*`. Rejeitada porque perderia também a
**mensagem** customizada do 500 (viola "preservar semântica de erro"), não só o prefixo.

Detalhe de cache: escolhemos **objeto-resultado resolvido** (nunca Promise rejeitada no
cache), evitando qualquer nuance de "rejection caching" do `cache()` e tornando o caminho de
erro determinístico.

---

## 4. Proibição de cache global e isolamento entre usuários (regra 2)

**Não há** cache global, `Map` estático, singleton mutável nem estado module-level nosso.
O único mecanismo é `cache()` do React (`import { cache } from "react"`).

Por que isso isola B de A:

1. `cache()` **não** guarda resultados numa estrutura de módulo compartilhada entre requests.
   O React associa a memoização a um **store por-request**, estabelecido pelo servidor
   (Next/React) no início de cada request via contexto assíncrono (AsyncLocalStorage). Cada
   request tem seu próprio store; ao terminar, o store é descartado.
2. Dois requests concorrentes (usuário A e usuário B) recebem **stores distintos** — mesmo
   chamando `readActiveUserUnitLinks("...")`, B nunca lê o valor memoizado de A. Não há
   janela de vazamento entre usuários.
3. `const readX = cache(async …)` em escopo de módulo é apenas a **função-wrapper**
   (referência estável exigida pelo React); ela **não** contém dados de request. Os dados
   vivem no store por-request que o React troca a cada request. Portanto não é "cache global
   mutável" no sentido proibido.
4. **Chave = `userId`** (primitivo) garante correção *dentro* do request: se, hipoteticamente,
   duas resoluções no mesmo request usassem `userId` diferente, não colidiriam. Como o request
   tem uma única sessão autenticada, o `userId` é constante — a chave é cinto-e-suspensório
   sobre o isolamento já dado pelo store por-request. `readAllActiveUnitIds` é global-ao-tenant
   por natureza (lista de unidades ativas), logo sem argumento: 1 entrada por request.

---

## 5. Matriz de equivalência de comportamento (validar antes/depois)

Resultado esperado **idêntico** antes e depois em `{isSuperAdmin, accessibleUnitIds,
hasPermission, hasPermissionInScope}`. Overrides e scope inalterados.

| # | Cenário | Entrada | `isSuperAdmin` | `accessibleUnitIds` | `hasPermission` | Observação |
|---|---|---|---|---|---|---|
| 1 | Super-admin por código | `session.profile.code = SUPER_ADMIN` | `true` | `getAllActiveUnitIds()` | `true` | folha super-admin nem é chamada (short-circuit); `getAllActiveUnitIds` memoizado |
| 2 | Super-admin por perfil vinculado | perfil super-admin ativo em `user_unit_links` | `true` | todas as unidades ativas | `true` | folha super-admin retorna `true`; memo dedup |
| 3 | Não-admin multi-unidade COM permissão | vínculos em U1,U2; perfil concede a permissão | `false` | `[U1,U2]` (∩ ativa se `scope:"active-unit"`) | `true` | união via links+profile; memo dedup de links |
| 4 | Não-admin SEM permissão | vínculos existem, perfil não concede; sem override allow | `false` | `[]` | `false` | `allowedUnitIds.size === 0` |
| 4b | Permissão inexistente/ inativa | `getPermissionId` → `undefined` | `false` | `[]` | `false` | retorno antecipado (folha não memoizada; inalterado) |
| 5 | Override **allow** por unidade | deny do perfil + override allow em U2 (U2 ∈ links) | `false` | `[U2]` | `true` | `applyUserPermissionOverrides` inalterado |
| 6 | Override **allow global** (`unit_id = null`, `is_allowed`) | perfil sem acesso + override allow global | `false` | todos os `linkedUnitIds` | `true` | ramo `!override.unit_id` inalterado |
| 7 | Override **deny** por unidade | perfil concede U1,U2 + override deny U2 | `false` | `[U1]` | `true` | `allowedUnitIds.delete(U2)` |
| 8 | Override **deny global** (`unit_id = null`, `!is_allowed`) | perfil concede + override deny global | `false` | `[]` | `false` | `allowedUnitIds.clear()` |
| 9 | `scope:"active-unit"` | qualquer não-admin com união [U1,U2], ativa=U1 | `false` | `[U1]` | `true` | `hasPermission` continua sobre a UNIÃO |
| 10 | Erro de query numa das 3 folhas | supabase retorna `error` | — | — | — | lança `PermissionAuthorizationError` 500, mesma mensagem e mesmo prefixo de log |

Como as folhas memoizadas devolvem **os mesmos dados** que as folhas atuais (mesmas queries),
todos os ramos a jusante (união, overrides, scope) produzem saída idêntica. A memoização só
**reduz o número de execuções** das queries, não os dados.

---

## 6. Plano de prova — SEM runner/infra de teste nova (sem libs novas)

Cinco evidências, todas com ferramentas já existentes (`next build`, `next lint`,
`console.error` temporário, script Node pontual, e os specs de screenshot já presentes):

### 6.1 Build + lint verdes
`npm run build` e `npm run lint` passam (TypeScript estrito, sem `any`, sem import novo além
de `cache` do `react` já disponível no Next 14.2).

### 6.2 Prova de dedup em runtime dentro de um Route Handler (regra 4)
Risco central: `cache()` precisa deduplicar dentro de um **Route Handler** no Next 14.2, não
só em RSC. Como provar empiricamente (instrumentação **temporária**, removida antes do commit
de código):

1. Inserir um `console.count()` (ou `console.error("[leaf-hit] super_admin")`) **dentro de
   cada um dos 3 fetchers memoizados**, logo após a query.
2. Rodar `npm run dev`, autenticar como um usuário **não** super-admin com permissões de RH.
3. Fazer **um** request a `GET /api/hr/workflows/[id]` (que hoje resolve permissão 5×).
4. **Esperado (Plano A OK):** cada `[leaf-hit]` aparece **1 vez** (super-admin e links caem
   de 5→1). Para um usuário super-admin, `[leaf-hit] all_units` cai de 5→1.
5. **Contraprova:** repetir sem a memoização (branch `main`) e observar a contagem ~5.

### 6.3 Isolamento entre dois `userIds` no mesmo processo
Objetivo: mostrar que a memo não vaza entre usuários e que a chave = `userId` distingue.

- Como o store do `cache()` é por-request, dois requests separados (um autenticado como A,
  outro como B) **não** compartilham memo por construção. Prova manual: com a instrumentação
  do §6.2 imprimindo também o `userId`, fazer request A e request B em sequência e confirmar
  que cada request recomputa a folha (1 hit por request, com o `userId` correto), e que o
  `accessibleUnitIds` retornado corresponde a cada usuário (A vê o escopo de A; B o de B).
- Verificação de unidade sobre o **cálculo** (sem servidor): script Node pontual
  (`node --loader tsx` já? — se não houver tsx, usar um `.mjs` que importa a lógica
  compilada, ou validar por inspeção) exercitando `unwrapLeaf` + a montagem de união com
  dois conjuntos de links simulados (A→[U1], B→[U2]) e conferindo saídas distintas. **Sem
  lib nova**; se não houver caminho de import ergonômico para o resolver server-only, esta
  sub-prova é feita pela via de request do parágrafo anterior (preferida) e o script fica
  opcional.

### 6.4 Equivalência funcional (matriz §5) via requests
Para cada linha executável da matriz, exercitar telas/rotas gateadas e comparar a resposta
(status + corpo `allowed_actions`/`accessibleUnitIds`) entre `main` e o branch:
- Autorizado (cenários 1–3,5–7,9): `GET /api/hr/workflows/[id]` retorna 200 com o mesmo
  `allowed_actions`.
- Sem permissão (cenário 4/8): retorna 403 com a mesma mensagem.
- Erro (cenário 10): simular erro de query (ex.: apontar a env para credencial inválida em
  ambiente descartável) e confirmar 500 com mensagem e prefixo de log idênticos.

### 6.5 Screenshots de RH (telas gateadas) sem diff visual
Rodar os specs já existentes `npm run screenshots:rh` (e `screenshots:ui`) autenticado como
usuário autorizado; confirmar que as telas gateadas renderizam idênticas (sem diff). Isso
cobre o caminho quente real (a tela de workflow que dispara as 5 resoluções).

### Plano B (contingência — descrever, **não** implementar)
Se §6.2 provar que `cache()` **não** deduplica em Route Handlers no Next 14.2:
- Substituir `cache()` por um **memo request-scoped explícito**: um `Map<string, Promise>`
  criado **uma vez por request** e propagado. O ponto natural de criação seria em
  `requireAuthenticatedRequest`/`requireHrWorkflowPermission` (onde o request começa e onde o
  `supabase` admin já é instanciado uma vez por request), threading o memo até o resolver.
- Isolamento garantido por ser criado dentro do fluxo do request (nunca module-level).
- Custo: diff maior (threading por assinaturas internas / contexto), possivelmente tocando
  a fronteira de `api-helpers`. Por isso Plano A (`cache()`) é preferido. **Plano B não é
  implementado nesta tarefa**; fica documentado como fallback caso a prova empírica falhe.

---

## 7. Confirmação `NAO_ALTERAR` (regra 5)

Nada em `docs/NAO_ALTERAR.md` é alterado:
- **Sem** migration, schema, RLS/policies, triggers.
- **Sem** tocar em login, Supabase Auth, `auth_email`, setup inicial.
- **Sem** tocar em `session.ts`, `getCurrentSessionContext`, nem em `requireAuthenticatedRequest`
  no Plano A.
- **Sem** mudar regra de permissão/alçada, união de unidades, overrides ou scope.
- **Sem** mudar assinaturas públicas (`getAccessibleUnitIdsForPermission`, `requirePermission`,
  `userHasPermissionForUnit`, `assertUnitInPermissionScope`).
- **Sem** consolidar/batchar queries; **sem** dependência nova (só `cache` do `react`, já
  disponível).

A mudança é puramente **deduplicação de leituras idempotentes por-request** de 3 folhas
internas — otimização de performance com comportamento preservado 1:1.

---

## 8. Escopo fechado — o que NÃO muda

- **Não** memoizar `getPermissionId`, `getProfileAllowedIds`, `applyUserPermissionOverrides`
  (dependem do código de permissão; ficam exatamente como estão, recebendo `supabase` + `options`).
- **Não** memoizar/alterar `userHasPermissionForUnit`, `requirePermission`,
  `assertUnitInPermissionScope` (apenas passam a se beneficiar da dedup interna).
- **Não** tocar em `workflow-auth.ts` nem em `hr/api-auth.ts` (o `getHrAccessibleUnitIds`
  continua chamando o resolver com o mesmo `options`; o prefixo `hr.*` é preservado por §3).

---

## 9. Arquivo a alterar quando o código for aprovado

- **Somente** `src/lib/auth/permissions.ts`:
  1. `import { cache } from "react";`
  2. 3 fetchers `cache(...)` + tipo `LeafResult` + helper `unwrapLeaf`.
  3. Reescrever as 3 folhas privadas (`userHasActiveSuperAdminProfile`,
     `getActiveUserUnitLinks`, `getAllActiveUnitIds`) como adaptadores option-aware.
  4. Trocar as 3 chamadas em `getAccessibleUnitIdsForPermission`.

Nenhum outro arquivo de produção é tocado no Plano A.
