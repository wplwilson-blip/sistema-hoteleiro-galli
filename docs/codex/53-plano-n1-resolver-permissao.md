# Plano — #9: N+1 no resolver de permissões

**Área SENSÍVEL** (helper de permissão). Só plano.
Branch previsto: `perf/permission-resolver-memo` (o mesmo já reservado no doc 37).

**Este plano NÃO é novo: ele reativa e recorta o [37](37-plano-memo-resolver-permissao.md),
usando a medição do [40](40-baseline-resolver-permissao.md).** Li os dois antes de escrever.

---

## 0. Evidência reconferida

**Ponto quente citado no achado** — `src/app/api/hr/employees/[id]/route.ts:45-64`:
um `Promise.all` com **1 chamada a `loadEmployeeRelations` + 17 chamadas a
`userHasHrPermissionForUnit`**. Confirmado, contei as 17 (linhas `:47` a `:63`).

Somando o gate `requireHrPermission(employeesView)` (`:16`) e o
`assertCanAccessHrEmployee` (`:24`, que **não** resolve — só inspeciona o array, conforme
doc 40), são **18 execuções** de `getAccessibleUnitIdsForPermission` por GET.

**Custo por execução** (doc 40, §0, reconferido contra `permissions.ts` hoje):

| Caminho | Queries |
|---|---|
| Não-super | `user_unit_links` (super-check `:107`) → `permissions` (`:142`) → `user_unit_links` (links `:163`) → `profile_permissions` (`:192`) → `user_permission_overrides` (`:217`) = **5** |
| Super-admin por perfil | `user_unit_links` → `units` = 2 |
| Super-admin por código | `units` = 1 (o `||` em `:242-243` curto-circuita) |

**18 × 5 = 90 queries** num único GET de detalhe de colaborador, para um usuário comum.

**Folhas invariantes por request** (dependem só do `userId`, ou de nada):
`userHasActiveSuperAdminProfile`, `getActiveUserUnitLinks`, `getAllActiveUnitIds`.
**Folhas variantes** (dependem do `permissionCode`): `getPermissionId`,
`getProfileAllowedIds`, `applyUserPermissionOverrides`.

Memoizando só as invariantes: 18 × 5 = 90 → **3 + 18 × 3 = 57**. Redução de ~37%.
Memoizando também as variantes por `(userId, permissionCode)` — chaves distintas nas 17
chamadas, então **não ajuda aqui**, porque os 17 codes são todos diferentes.

**Conclusão honesta que o doc 37 já antecipava:** a memoização de folhas invariantes é
correta e barata, mas **não é a maior parte do ganho neste endpoint**. O ganho grande viria
de **batch**: resolver os 17 codes numa única passada (`getPermissionId` com `.in("code",
[...])`, `getProfileAllowedIds` com um `.in` sobre os 17 `permission_id`, overrides idem) —
5 queries no total em vez de 90.

---

## 1. Recorte proposto: duas fatias, nesta ordem

### Fatia A — memoização por-request das 3 folhas invariantes

Memoizar `userHasActiveSuperAdminProfile`, `getActiveUserUnitLinks` e
`getAllActiveUnitIds`, mantendo o desenho de **objeto-resultado discriminado** do doc 37
§1.1 (o fetcher memoizado não loga e não lança; quem tem `options` aplica a política de
erro). Isso preserva mensagem de erro e prefixo de log exatamente.

**REVISÃO DO MECANISMO — `cache()` do React foi descartado.** O doc 37 e a versão anterior
deste doc propunham `cache()` do React. Duas verificações mudam a decisão:

1. `require("react").cache` é **`undefined`** no react 18.3.1 deste projeto na resolução
   padrão — `cache` só existe no build sob a condição `react-server`. Depender dele em
   Route Handlers é apostar em comportamento de framework que eu teria de confirmar
   empiricamente e que pode mudar entre versões do Next.
2. Existe alternativa cujo escopo é **estrutural**, não uma promessa do framework.

**Mecanismo adotado: `WeakMap` com chave na identidade do objeto `SessionContext`.**

```ts
// modulo interno, nao exportado
const requestScopedCache = new WeakMap<SessionContext, SessionLeafCache>();
```

Por que isto é **impossível** de vazar entre usuários ou requests:

- **A chave não é o `userId` nem qualquer string.** É a *referência* do objeto
  `SessionContext`. Para ler uma entrada é preciso já possuir exatamente aquele objeto —
  não há como derivá-lo, adivinhá-lo ou construí-lo.
- **Cada request cria um objeto novo.** `getCurrentSessionContext`
  (`src/lib/auth/session.ts:223`) monta um `SessionContext` do zero a cada chamada, e não
  há nenhuma memoização hoje na camada de auth (verificado: zero ocorrências de `cache(`
  ou `unstable_cache` em `src/lib/auth/` e em `api-helpers.ts`). Dois requests do **mesmo**
  usuário produzem dois objetos distintos → duas entradas distintas.
- **Dentro do request, a identidade é compartilhada de propósito.** `requirePermission`
  guarda o objeto em `context.session` (`permissions.ts:346`), e a rota passa
  `context.session` às 17 chamadas. Uma sessão, 18 resoluções — que é exatamente o alvo.
- **`WeakMap` não retém a chave.** Terminado o request, o `SessionContext` fica
  inalcançável e a entrada é coletada. Sem TTL, sem política de expiração, sem rotina de
  limpeza — portanto sem bug de expiração.
- **Não há travessia possível.** Mesmo que uma entrada sobrevivesse na memória, só poderia
  ser lida por código que segure aquele objeto — isto é, o próprio request que o criou.

**Descartados explicitamente:**

| Alternativa | Por que não |
|---|---|
| `unstable_cache` / `revalidate` | **persiste entre requests** — seria o vazamento |
| `Map` global por `userId` | sobrevive ao request; permissão revogada continuaria valendo; chave adivinhável |
| `cache()` do React | indisponível na resolução padrão (§1); escopo dependeria do framework |

**Ganho esperado** (endpoint `GET /api/hr/employees/[id]`, 18 resoluções):

| Caminho | Hoje | Depois |
|---|---|---|
| Não-super | 18 × 5 = **90** | 1 (super-check) + 1 (links) + 18 × 3 = **56** |
| Super admin por perfil | 18 × 2 = **36** | 1 + 1 = **2** |
| Super admin por código de sessão | 18 × 1 = **18** | **1** |

(A versão anterior dizia 57 no caminho não-super: contava `getAllActiveUnitIds`, que nesse
caminho nem é chamada. São 56.)

As três folhas que **não** entram: `getPermissionId`, `getProfileAllowedIds` e
`applyUserPermissionOverrides` variam com o *code*, e os 17 codes são distintos — memoizar
não daria ganho aqui. É o que a Fatia B (batch) resolve.

**Cachear só sucesso.** Um resultado de erro **não** é armazenado, para que uma falha
transitória não contamine as 18 resoluções e para preservar a semântica atual de repetir a
consulta. Como o cache guarda valores (nunca promessas rejeitadas), não há risco de
*unhandled rejection*.

### Fatia B — resolver em lote para múltiplos codes
Nova função `getAccessibleUnitIdsForPermissions(supabase, session, codes[], options)` que
faz **uma** passada e devolve `Map<code, PermissionAccessResult>`. `employees/[id]/route.ts`
passa a chamá-la uma vez com os 17 codes.

- Ganho: 57 → ~5 queries.
- Risco: **médio-alto**. É código novo no resolver central, e precisa reproduzir
  exatamente `resolveOverrideAccess` por code.
- **Só após a Fatia A estar mesclada e estável.** Fatia própria, plano próprio.

**Recomendação: implementar apenas a Fatia A agora.** É a que o doc 37 já especificou em
detalhe, é a de menor risco numa área sensível, e o achado #9 é MÉDIO. A Fatia B eu
especifico depois, se você quiser o ganho completo.

---

## 2. Arquivos afetados (Fatia A)

| Arquivo | Mudança |
|---|---|
| `src/lib/auth/permissions.ts` `:102-135`, `:241-254` | 3 folhas viram fetchers memoizados + política de erro no chamador |
| `tests/unit/` | teste de equivalência |

`src/app/api/hr/employees/[id]/route.ts` — **não é editado na Fatia A.** O ganho vem só do
resolver. Isso é bom: nenhuma rota muda de forma.

---

## 3. Teste de equivalência (exigência do achado)

O achado pede "teste de equivalência antes/depois". Desenho:

- Um duplo de `supabase` que **conta chamadas por tabela** e devolve fixtures fixas.
- Para um conjunto de cenários (não-super com 2 unidades; super por código; super por
  perfil; usuário com override allow; com override deny; sem link), executar N resoluções
  com codes distintos e assertar:
  - **resultado idêntico** ao baseline (comparação de `{isSuperAdmin, accessibleUnitIds
    ordenado, hasPermission, hasPermissionInScope}`) — este é o teste de equivalência;
  - **contagem de queries reduzida** exatamente como previsto (`user_unit_links` cai de 2N
    para 2; `units` de N para 1).
- O baseline é gerado pelo próprio teste chamando a versão não-memoizada — evitando
  fixture congelada que envelhece.

O segundo assert falha no código atual (é a medição do ganho); o primeiro passa em ambos e
é a rede de segurança.

---

## 4. Casos de borda

1. **Mesmo request, dois usuários** — impossível (uma sessão por request), mas a chave do
   cache é o `userId`, então mesmo assim está correto.
2. **Mutação de permissão durante o request** (admin revoga enquanto outra aba lê) → o
   cache é por request; a próxima requisição já vê o novo estado. Janela de no máximo um
   request. Aceitável, e é o comportamento que o doc 37 já assumia.
3. **Erro numa folha memoizada** → o objeto-resultado discriminado garante que o cache
   guarda um **valor**, nunca uma Promise rejeitada (doc 37 §1.1). Cada chamador loga com
   o prefixo correto e lança a mensagem correta.
4. **Super admin por código** → `getAllActiveUnitIds` memoizado; as outras duas nem são
   chamadas. Ganho de N→1 em `units`.
5. **`scope: "active-unit"`** → o estreitamento acontece **depois** das folhas, sobre
   `unionUnitIds`. Memoizar as folhas não o afeta. Âncora preservada.
6. **`hasNetworkScope`** → derivado de `links`, que passa a vir do cache. Mesma lista →
   mesmo resultado.

---

## 5. Critério de aceite

- [ ] lint / build / test:unit passam.
- [ ] Teste de equivalência cobre os 6 cenários e passa **idêntico** antes/depois.
- [ ] Contagem de queries reduzida e verificada por teste, não por estimativa.
- [ ] Mensagens de erro HTTP e prefixos de log **inalterados** (assert explícito no teste).
- [ ] Diff em **um** arquivo de produção.

---

## 6. O que NÃO muda

- Semântica de autorização: **nenhum** resultado de `hasPermission` /
  `accessibleUnitIds` muda para nenhum usuário. É o requisito central.
- Ramo super admin (`:241-255`), `hasNetworkScope` (`:265-267`), estreitamento
  `active-unit` (`:288-295`) — intocados.
- `applyUserPermissionOverrides` / `resolveOverrideAccess` — intocados (folha variante).
- Assinaturas públicas: `getAccessibleUnitIdsForPermission`, `userHasPermissionForUnit`,
  `requirePermission`, `assertUnitInPermissionScope` — inalteradas.
- `src/lib/hr/api-auth.ts` e todas as rotas — não editados.
