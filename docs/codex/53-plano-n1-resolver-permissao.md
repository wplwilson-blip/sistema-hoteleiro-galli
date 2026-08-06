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
Exatamente o Plano A do doc 37: envolver `userHasActiveSuperAdminProfile`,
`getActiveUserUnitLinks` e `getAllActiveUnitIds` em `cache()` do React, com o desenho de
**objeto-resultado discriminado** já especificado no doc 37 §1.1 (o fetcher memoizado não
loga e não lança; quem tem `options` faz a política de erro). Esse desenho existe para
preservar mensagem de erro e prefixo de log — mantenho-o integralmente.

- Ganho: 90 → 57 queries no endpoint citado; proporcionalmente maior nos endpoints do doc 40
  com super-admin (onde `getAllActiveUnitIds` domina).
- Risco: baixo. `cache()` é escopado ao request do React/Next; nenhuma chave carrega
  `supabase` ou `options`.
- **Pré-requisito a confirmar na Fase B:** que estas rotas rodam no runtime onde `cache()`
  do React tem escopo de request garantido (App Router, Node runtime). Se alguma rota for
  edge ou fora do escopo de render, `cache()` degrada para no-op — correto, mas sem ganho.

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
