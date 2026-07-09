# Baseline — N+1 do resolver de permissão (antes do Plano B)

**Tarefa de MEDIÇÃO.** Nenhuma otimização aqui. **`src/lib/auth/permissions.ts` NÃO é
editado** (regra dura). Toda instrumentação proposta fica **fora** do resolver e é apresentada
apenas como **diff no doc** (não aplicada, não mesclada). Objetivo: baseline do N+1 para
decidir o threading (Plano B do doc [37](37-plano-memo-resolver-permissao.md)).

Branch: `perf/baseline-resolver-permissao`. Push apenas deste documento.

---

## 0. Modelo de custo (fatos confirmados, não re-derivados)

Entrada: `getAccessibleUnitIdsForPermission` (`permissions.ts:251`). **1 execução por checagem
de permissão.** Custo em queries por execução:

| Caminho | Queries (em ordem) | Total |
|---|---|---|
| **Não-super** | `user_unit_links` (super-check) → `permissions` → `user_unit_links` (links) → `profile_permissions` → `user_permission_overrides` | **5** (`user_unit_links` 2×) |
| **Super-admin por perfil** | `user_unit_links` (super-check) → `units` (all units) | 2 |
| **Super-admin por código** (`session.profile.code === SUPER_ADMIN`) | `units` (all units) — o `||` curto-circuita a super-check | 1 |

Funções-folha (fonte `permissions.ts`): `userHasActiveSuperAdminProfile` (`user_unit_links`),
`getPermissionId` (`permissions`), `getActiveUserUnitLinks` (`user_unit_links`),
`getProfileAllowedIds` (`profile_permissions`), `applyUserPermissionOverrides`
(`user_permission_overrides`), `getAllActiveUnitIds` (`units`).

**Folhas invariantes por request** (alvos do Plano B, independem do código de permissão):
`userHasActiveSuperAdminProfile`, `getActiveUserUnitLinks`, `getAllActiveUnitIds`.
As demais (`getPermissionId`, `getProfileAllowedIds`, `applyUserPermissionOverrides`) variam
com o **código** de permissão e **não** são alvo do Plano B.

Wrappers que executam o resolver **1×** cada (fonte):
- `requirePermission` (`permissions.ts:330`), `userHasPermissionForUnit` (`permissions.ts:310`).
- `getHrAccessibleUnitIds` (`hr/api-auth.ts:136`), `requireHrPermission` (`:165`),
  `userHasHrPermissionForUnit` (`:152`).
- `requireHrWorkflowPermission` (`hr/workflow-auth.ts:37`), `getWorkflowPermissionAccess`
  (`:70` → `getHrAccessibleUnitIds`).
- `getCandidateSensitiveAccess` (`hr/candidate-data.ts:254` → `getWorkflowPermissionAccess`).

`assertUnitInPermissionScope`, `canAccessWorkflowUnit`, `canAccessSensitiveWorkflowUnit` **não**
executam o resolver (só inspecionam o array `accessibleUnitIds` já resolvido).

---

## 1. Análise estática — invocações do resolver por request, por rota

Varredura de **todos** os handlers em `src/app/api` (128 arquivos, 240 call-sites reais de
funções que disparam o resolver). Contagem **por handler** (= por request), não por arquivo.

### 1.1 TOP rotas (empírico — a mais pesada NÃO é workflows/[id])

| # | Rota / handler | Invocações do resolver | Call-sites (arquivo:linha) | Queries teóricas (não-super = ×5) |
|---|---|---:|---|---:|
| **1** | **`GET /api/hr/employees/[id]`** | **18** | gate `requireHrPermission` (`employees/[id]/route.ts:16`) + **17× `userHasHrPermissionForUnit`** em `Promise.all` (`:47`–`:63`) | **90** |
| **2** | `GET /api/hr/workflows/[id]` | **5** | gate `requireHrWorkflowPermission` (`workflows/[id]/route.ts:133`) + `getWorkflowPermissionAccess` sensitive (`:160`) + **3×** `getWorkflowPermissionAccess` em `Promise.all` (`:109`–`:111`, via `buildDetailAllowedActions`) | 25 |
| **3** | `GET /api/hr/employees/[id]/documents` | **4** | gate `requireHrPermission` (`employees/[id]/documents/route.ts:262`) + **3× `userHasHrPermissionForUnit`** em `Promise.all` (`:273`–`:275`) | 20 |
| **4** | `POST` rotas de ação de workflow (`approve`/`reject`/`return`/`cancel`/`execute`) | **2** cada | gate `requireHrWorkflowPermission` + `getWorkflowPermissionAccess` sensitive (ex.: `workflows/[id]/return/route.ts:223` + `:207`) | 10 cada |

Demais rotas relevantes (2 invocações/request): `GET/POST /api/hr/workflows`
(`workflows/route.ts:196`,`:216`,`:340`), `POST /api/hr/contextual-documents`
(`contextual-documents/route.ts:139`,`:175`), `GET /api/hr/workflows/[id]/timeline`
(`timeline/route.ts` gate + `:70`). A grande maioria dos handlers CRUD faz **1** gate por
request (custo 5 queries não-super).

### 1.2 Loops — **não há resolução por-linha de dados**

Sinalização pedida (rotas que resolvem permissão dentro de loop = multiplicador proporcional
aos dados): **nenhuma encontrada.** Todos os multiplicadores são **fan-outs de tamanho
constante** (blocos `Promise.all` com N fixo de permissões distintas):

- `employees/[id]` GET: fan-out **fixo de 18** (não cresce com dados).
- `employees/[id]/documents` GET: fan-out fixo de 4.
- `workflows/[id]` GET: fan-out fixo de 5.

As rotas de **lista** (`GET /api/hr/workflows`, listas de employees) resolvem permissão **1–2×**
e depois filtram as linhas pelo array `accessibleUnitIds` (`.map`/`.filter` de dados **sem**
resolver por item — ex.: `workflows/route.ts:287`). Portanto o N+1 aqui é **redundância de
fan-out constante**, não um loop de dados — grande, mas limitado.

### 1.3 Por que `employees/[id]` é a pior

18 execuções do resolver **para o mesmo usuário e a mesma unidade**, variando só o **código**
de permissão (`employeesSensitiveView`, `documentsView`, …, `terminationsSensitiveView`). As
folhas invariantes (super-check + links) são refeitas **18×** idênticas; só as folhas
por-código (`permissions`/`profile_permissions`/`user_permission_overrides`) legitimamente
variam.

---

## 2. Instrumentação runtime (diff PROPOSTO — NÃO aplicado)

Requisitos atendidos: atrás de `PERM_PROFILING`, **no-op rigoroso** por padrão, **aditiva**,
**fora de `permissions.ts`**, sem libs novas. Conta chamadas `.from(<tabela>)` no client
`SupabaseAdmin` (onde ele é criado), agrupa por tabela e emite **1 linha por request**.

Mecanismo: `AsyncLocalStorage` (Node) — **propaga de forma confiável através dos `await`** em
Route Handlers no runtime Node do Next 14.2 (ao contrário de `cache()` do React; ver doc 37
§10). É, de fato, uma prévia do store por-request do Plano B.

### 2.1 Novo arquivo `src/lib/perf/perm-profiling.ts`

```ts
import { AsyncLocalStorage } from "node:async_hooks";

type ProfilingContext = { route: string; counts: Map<string, number> };

const storage = new AsyncLocalStorage<ProfilingContext>();

export function isPermProfilingEnabled(): boolean {
  return process.env.PERM_PROFILING === "1";
}

// Incrementa o contador da tabela no contexto do request atual (no-op fora de contexto).
export function recordFromCall(table: string): void {
  const ctx = storage.getStore();
  if (!ctx) return;
  ctx.counts.set(table, (ctx.counts.get(table) ?? 0) + 1);
}

// Envolve um handler: cria o contexto por-request e emite UMA linha ao final.
export async function runWithPermProfiling<T>(route: string, fn: () => Promise<T>): Promise<T> {
  if (!isPermProfilingEnabled()) {
    return fn(); // no-op rigoroso: sem ALS, sem Proxy, zero overhead
  }
  const ctx: ProfilingContext = { route, counts: new Map() };
  return storage.run(ctx, async () => {
    try {
      return await fn();
    } finally {
      const queriesPorTabela = Object.fromEntries([...ctx.counts.entries()].sort());
      const totalQueries = [...ctx.counts.values()].reduce((acc, n) => acc + n, 0);
      // UMA linha por request:
      console.log("[PERM_PROFILING] " + JSON.stringify({ rota: route, totalQueries, queriesPorTabela }));
    }
  });
}
```

### 2.2 Wrap do client factory `src/lib/supabase/admin.ts` (aditivo)

```diff
 import { createClient } from "@supabase/supabase-js";
 import { getAdminSupabaseEnv } from "@/lib/supabase/env";
+import { isPermProfilingEnabled, recordFromCall } from "@/lib/perf/perm-profiling";

 export function createSupabaseAdminClient() {
   const { url, serviceRoleKey } = getAdminSupabaseEnv();

-  return createClient(url, serviceRoleKey, {
+  const client = createClient(url, serviceRoleKey, {
     auth: {
       autoRefreshToken: false,
       persistSession: false
     }
   });
+
+  if (!isPermProfilingEnabled()) {
+    return client; // no-op rigoroso: retorna o client cru (sem Proxy)
+  }
+
+  // Proxy so-de-leitura: conta .from(<tabela>) e delega tudo o mais inalterado.
+  return new Proxy(client, {
+    get(target, prop, receiver) {
+      if (prop === "from") {
+        return (table: string) => {
+          recordFromCall(table);
+          return (target as { from: (t: string) => unknown }).from(table);
+        };
+      }
+      return Reflect.get(target, prop, receiver);
+    }
+  }) as typeof client;
 }
```

Notas:
- Quando `PERM_PROFILING != "1"`, `createSupabaseAdminClient` retorna o **client cru** — zero
  Proxy, zero ALS, comportamento **idêntico** ao atual (no-op rigoroso).
- O Proxy intercepta **apenas** `from`; todo o resto passa por `Reflect.get`. Tipo de retorno
  preservado (`as typeof client`), então `SupabaseAdmin` não muda.
- Cada query começa por `.from(tabela)` → a contagem de `.from` **é** a contagem de queries por
  tabela.

### 2.3 Wrap dos handlers medidos (exemplo — aplicar só às TOP 3–4 para o baseline)

Aditivo: envolve o **corpo atual intacto**. Exemplo em `employees/[id]/route.ts`:

```diff
+import { runWithPermProfiling } from "@/lib/perf/perm-profiling";

 export async function GET(_request: Request, { params }: { params: { id: string } }) {
+  return runWithPermProfiling("GET /api/hr/employees/[id]", async () => {
   const { context, response } = await requireHrPermission(HR_PERMISSIONS.employeesView);
   // ... corpo ATUAL, inalterado ...
+  });
 }
```

Repetir o wrap (só a linha `runWithPermProfiling("<rota>", async () => { ... })`) em:
`workflows/[id]/route.ts` GET, `employees/[id]/documents/route.ts` GET, e uma rota de ação
(ex.: `workflows/[id]/approve`). **Nada** em `permissions.ts` é tocado.

> Alternativa sem tocar handler algum: como o resolver não-super **sempre** começa por
> `user_unit_links` (super-check), o total de execuções do resolver por request é inferível do
> agregado `queriesPorTabela` (`user_unit_links` / 2 no caminho não-super). O wrap por handler
> serve só para carimbar o rótulo `rota` na linha de log.

---

## 3. Protocolo de medição (Wilson)

Objetivo: número **before** real, caminho não-super (5 queries), contra **staging**.

1. **Build de produção local apontando pro STAGING.** `.env.local` com as credenciais do
   projeto **staging** (`jascnmgagejlvjlenduv`). Adicionar (temporário) o diff da §2 e a env:
   ```
   PERM_PROFILING=1
   ```
2. `npm run build && npm run start` (produção local; evita ruído de recompilação do dev).
3. **Logar como usuário NÃO-super-admin** (perfil sem `SUPER_ADMIN`), com vínculo ativo em ≥1
   unidade — garante o caminho de **5 queries** (não o de 1 do super-admin por código).
4. Abrir/bater nas TOP 3–4 rotas e capturar a linha `[PERM_PROFILING] {...}` de cada request:
   - `GET /api/hr/employees/[id]` (a mais pesada);
   - `GET /api/hr/workflows/[id]`;
   - `GET /api/hr/employees/[id]/documents`;
   - `POST /api/hr/workflows/[id]/approve` (ou outra ação).
5. **Remover** o diff de instrumentação e a env ao final (é temporário; não vai pro repo).

### 3.1 Espaço para os números reais (before) — colar aqui

```
# GET /api/hr/employees/[id]
[PERM_PROFILING] {"rota":"GET /api/hr/employees/[id]","totalQueries":__,"queriesPorTabela":{...}}

# GET /api/hr/workflows/[id]
[PERM_PROFILING] {...}

# GET /api/hr/employees/[id]/documents
[PERM_PROFILING] {...}

# POST /api/hr/workflows/[id]/approve
[PERM_PROFILING] {...}
```

---

## 4. Número analítico — before/after do Plano B

`invocações × 5 = queries teóricas` (não-super). O Plano B resolve as **3 folhas invariantes
1× por request** e passa adiante; remove a redundância de `user_unit_links` (super-check +
links, refeitos a cada invocação) e — no caminho super-admin — de `units`.

### 4.1 Caminho NÃO-super-admin (5 queries/execução)

Por request, com N = invocações do resolver, decomposição das queries:
`user_unit_links` = **2N** (super-check + links, ambos invariantes) · `permissions` = N ·
`profile_permissions` = N · `user_permission_overrides` = N. Total = **5N**.
O Plano B colapsa `user_unit_links` **2N → 2** (1 super-check + 1 links, memoizados por
`userId`); as folhas por-código permanecem **3N** (variam com o código).

| Rota | N | Before (5N) | `user_unit_links` before → after | After (2 + 3N) | Economia |
|---|---:|---:|---:|---:|---:|
| `GET /employees/[id]` | 18 | **90** | 36 → 2 | **56** | −34 (38%) |
| `GET /workflows/[id]` | 5 | 25 | 10 → 2 | 17 | −8 (32%) |
| `GET /employees/[id]/documents` | 4 | 20 | 8 → 2 | 14 | −6 (30%) |
| ações de workflow / listas | 2 | 10 | 4 → 2 | 8 | −2 (20%) |
| CRUD típico (1 gate) | 1 | 5 | 2 → 2 | 5 | 0 |

> Observação honesta: no caminho **não-super**, o Plano B remove **só** a duplicação de
> `user_unit_links` (as folhas por-código não são alvo). O ganho é real e cresce com o fan-out
> (máx. na `employees/[id]`: −34 queries), mas não zera o N+1 das folhas por-código — isso é
> esperado e coerente com o escopo fechado do doc 37.

### 4.2 Caminho SUPER-ADMIN por código (1 query/execução = `units`)

Cada execução refaz `getAllActiveUnitIds` (lista de unidades **idêntica**). O Plano B memoiza
`units` **N → 1**.

| Rota | N | Before (`units` = N) | After (`units` = 1) | Economia |
|---|---:|---:|---:|---:|
| `GET /employees/[id]` | 18 | 18 | **1** | −17 (94%) |
| `GET /workflows/[id]` | 5 | 5 | 1 | −4 (80%) |
| `GET /employees/[id]/documents` | 4 | 4 | 1 | −3 (75%) |

No caminho super-admin a redundância é **100%** (mesma lista de unidades N vezes) → o Plano B
praticamente elimina o custo do resolver.

### 4.3 Alvo do Plano B (resumo)

- **Não-super:** `user_unit_links` de **2N → 2** por request (economia máxima observada:
  `employees/[id]` 36 → 2).
- **Super-admin:** `units` de **N → 1** por request (`employees/[id]` 18 → 1).
- A prova empírica (§3) fornece o **before** real; o **after** é medível reaplicando o mesmo
  protocolo após o Plano B (mesma linha `[PERM_PROFILING]`, comparar `queriesPorTabela.user_unit_links`).

---

## 5. Conclusão (para decidir o threading do Plano B)

- A rota mais crítica é **`GET /api/hr/employees/[id]`** (18 execuções / 90 queries não-super),
  **não** `workflows/[id]`. O fan-out de 18 permissões sensíveis por card do colaborador domina.
- O N+1 é **fan-out constante**, não loop de dados — limitado, porém grande e 100% redundante
  nas folhas invariantes.
- `permissions.ts` **não foi tocado**; a instrumentação proposta é aditiva, no-op por padrão e
  externa ao resolver. A medição **não exigiu** editar o resolver (a contagem por `.from` no
  client factory + rótulo por handler basta).
- Recomendação de leitura para o Plano B: priorizar as rotas de fan-out (employees/[id],
  workflows/[id], documents) — é onde o threading das 3 folhas rende mais.
```
