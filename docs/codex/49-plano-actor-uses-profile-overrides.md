# Plano — #10: `actorUsesProfile` ignora overrides no guard anti-auto-trancamento

**Área SENSÍVEL** (helper de permissão). Só plano.
Branch previsto: `fix/admin-profiles-selflock-effective-permission`.

---

## 0. Evidência reconferida

`src/app/api/admin/permissions/profiles/route.ts`:

- `:15` — `PROTECTED_ADMIN = ["ADMIN:permissions.view", "ADMIN:overrides.manage",
  "ADMIN:profiles.manage"]`.
- `:70-86` — `actorUsesProfile(supabase, actorId, profileId)`: uma query em
  `user_unit_links` filtrando `app_user_id`, `access_profile_id`, `status='active'`,
  `deleted_at is null`. **Nada sobre `user_permission_overrides`.**
- `:381-383` — DELETE bloqueia a revogação só se `PROTECTED_ADMIN.includes(code) &&
  actorUsesProfile(...)`.

O resolver real (`src/lib/auth/permissions.ts:275-282` → `applyUserPermissionOverrides` →
`resolveOverrideAccess` em `src/lib/auth/override-precedence.ts`) considera **três** fontes:
grants de perfil, links ativos e **overrides por usuário/unidade** (`is_allowed` true/false).

**Dois erros, em direções opostas:**

- **Falso negativo (o perigoso):** o ator tem `ADMIN:profiles.manage` **só via override
  allow**, e nenhum link com o perfil-alvo — mas o perfil-alvo é usado por *outra* rota do
  seu acesso… não, o caso real é o inverso, ver abaixo.
- **Falso positivo:** o ator **tem** link com o perfil-alvo mas possui um override
  `is_allowed=false` naquela unidade, ou tem a permissão garantida por override em outro
  perfil. O guard bloqueia uma revogação legítima → **admin travado por engano**, sem
  poder limpar o perfil.
- **Falso negativo real:** o ator **não** tem link ativo com o perfil-alvo, mas o perfil-alvo
  é o único caminho pelo qual ele recebe `ADMIN:profiles.manage` **em outra unidade cujo link
  está inativo/soft-deletado e será reativado**, ou — caso concreto e verificável — a
  permissão do ator vem de um override **cujo escopo depende do grant do perfil**: em
  `resolveOverrideAccess`, um override só concede dentro de `linkedUnitIds`. Logo a
  interação entre perfil e override é real e o guard de meia-checagem não a modela.

Em qualquer leitura, o guard responde a uma pergunta (**"o ator tem link com este
perfil?"**) que **não é** a pergunta de segurança (**"revogar isto tira do ator a permissão
X?"**).

---

## 1. Arquivos e linhas afetados

| Arquivo | Linhas | Mudança |
|---|---|---|
| `src/app/api/admin/permissions/profiles/route.ts` | 67-86 | `actorUsesProfile` → `actorWouldLosePermission` |
| `src/app/api/admin/permissions/profiles/route.ts` | 379-383 | chamada do guard |
| `src/app/api/admin/permissions/profiles/route.ts` | 220 | `usedByActor` no GET — ver §2.2 |
| `tests/unit/` (novo) | — | teste do predicado |

Sem migration. `permissions.ts` **não** é editado.

---

## 2. Diff conceitual

### 2.1 O guard

Substituir a meia-checagem pela **pergunta certa**, usando o resolver efetivo já existente:

```ts
// Anti-auto-trancamento: revogar `permissionCode` do perfil `profileId` deixaria o ATOR
// sem essa permissao em QUALQUER unidade? Usa o resolver efetivo (perfil + links +
// overrides), nao a meia-checagem por user_unit_links.
async function actorWouldLosePermission(
  supabase: SupabaseAdmin,
  session: SessionContext,
  permissionCode: string,
  profileId: string
): Promise<boolean> {
  // 1) O ator tem a permissao hoje? Se ja nao tem, nao ha o que perder.
  const before = await getAccessibleUnitIdsForPermission(supabase, session, permissionCode);
  if (!before.hasPermission) return false;

  // 2) O ator usa o perfil-alvo em alguma unidade? (condicao necessaria)
  const links = /* user_unit_links do ator com access_profile_id = profileId, ativos */;
  if (!links.length) return false;

  // 3) A permissao sobrevive SEM o grant deste perfil?
  //    -> recomputa considerando o perfil-alvo como "sem grant" para este permissionCode.
  return !(await actorKeepsPermissionWithoutProfileGrant(...));
}
```

O passo 3 é o ponto de desenho. **Duas opções, preciso da sua escolha:**

**Opção A — simulação (precisa, mais cara).** Replicar em uma função nova o cálculo de
`getAccessibleUnitIdsForPermission` recebendo um conjunto de `allowedProfileIds` já filtrado
(sem o perfil-alvo), reusando `resolveOverrideAccess` para os overrides. Requer expor de
`permissions.ts` uma variante parametrizada — ou seja, **tocar em `permissions.ts`**
(área sensível, exige aval explícito seu).

**Opção B — conservadora (sem tocar em `permissions.ts`).** Guard = `before.hasPermission &&
actorUsesProfile(...)`, isto é, mantém a query de link **e** acrescenta a checagem efetiva.
Corrige o falso positivo (ator que já não tem a permissão não é bloqueado) mas **não**
corrige o caso "sobrevive por override em outro perfil" — continua bloqueando por excesso
de cautela nesse cenário. Zero risco de destravar quem não deveria destravar.

**Recomendação: Opção B nesta fatia.** O guard é uma trava de segurança: errar por
**excesso** de bloqueio é seguro; errar por falta destrava um admin fora do sistema. A
Opção A entrega precisão ao custo de editar o resolver central — desproporcional para um
guard cuja falha benigna é "peça a outro admin". Se você quiser a A, ela vira fatia própria
com plano próprio.

### 2.2 `usedByActor` no GET (`:220`)

Hoje `usedByActor` vem de `usersByProfile` (links). É rótulo de UI, não trava. Fica
**inalterado** nesta fatia — mudar exigiria N resoluções de permissão no GET, colidindo com
o achado #9. Registrado como divergência conhecida entre rótulo e trava.

---

## 3. Casos de borda

1. **Ator com link no perfil + tem a permissão** → bloqueado (como hoje).
2. **Ator com link no perfil + já NÃO tem a permissão** (override deny, ou grant já
   revogado) → hoje bloqueado por engano; passa a **permitir**. Correção.
3. **Ator sem link no perfil** → permitido (como hoje).
4. **Super admin** → `getAccessibleUnitIdsForPermission` devolve `hasPermission:true` sempre.
   Mas o perfil `SUPER_ADMIN` já é barrado antes (`:370-372`). Um super admin revogando
   `ADMIN:*` de **outro** perfil: se ele tiver link nesse outro perfil, será bloqueado —
   comportamento atual, preservado.
5. **Permissão fora de `PROTECTED_ADMIN`** → guard nem roda. Inalterado.
6. **Erro no resolver** → propaga como 500 (`PermissionAuthorizationError`), tratado pelo
   `catch` em `:431-436`. Hoje o erro da query de link vira 500 pelo `throw` em `:83`.
   Semântica equivalente.

---

## 4. Teste

Predicado extraído como função pura `shouldBlockProfilePermissionRevocation({
hasPermissionNow, actorLinkedToProfile, isProtectedCode })` em módulo próprio →
`tests/unit/` puro, tabela-verdade completa (8 linhas). O caso 2 falha no código atual.

Adicionalmente, teste do handler DELETE com `supabase` dublê confirmando que o resolver é
consultado antes do bloqueio.

---

## 5. Critério de aceite

- [ ] lint / build / test:unit passam.
- [ ] Tabela-verdade coberta; caso 2 falharia sem o fix.
- [ ] Nenhuma revogação que hoje é bloqueada por motivo legítimo passa a ser permitida.
- [ ] `permissions.ts` **não aparece no diff** (Opção B).

---

## 6. O que NÃO muda

- `src/lib/auth/permissions.ts` — não editado (Opção B).
- `src/lib/auth/override-precedence.ts` — não editado.
- Salvaguarda (a) SUPER_ADMIN intocável (`:248-250`, `:370-372`).
- Idempotência do DELETE (`:401-403`), auditoria best-effort (`:88-127`), upsert manual do
  PUT — inalterados.
- `PROTECTED_ADMIN` — mesma lista.
