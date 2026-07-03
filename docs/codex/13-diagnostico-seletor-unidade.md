# Diagnóstico — por que o seletor "Trocar unidade ativa" não renderiza

> 2026-07-02 · Branch `feat-fase3c-editar-perfis`. **READ-ONLY**: nada alterado, sem commit.
> Não consultei o banco de staging (sem credencial aqui) — reporto a **lógica determinística** do
> código e a **condição de dados** que produz o sintoma.

---

## 1. Seletor do header — componente e condição de exibição

- **Componente:** `ActiveUnitSwitcher` — `src/components/layout/active-unit-switcher.tsx:7`
  (montado no header em `src/components/layout/app-header.tsx:23`).
- **O elemento do teste** (`getByLabel('Trocar unidade ativa')`) é o `<select aria-label="Trocar
  unidade ativa">` em `active-unit-switcher.tsx:78`, **envolvido por um gate condicional**
  `{isMultiUnit ? (...) : null}` em `:66`.
- **Condição de exibição:** `const isMultiUnit = units.length > 1;` (`active-unit-switcher.tsx:53`).
  Ou seja, o seletor **só** renderiza quando o array `units` tem **mais de 1** elemento.
  `units` vem do store: `useAppStore((state) => state.units)` (`:8`).
- **Como conta "multiunidade":** por **nº de unidades DISTINTAS** no array `units[]`, **não** por nº de
  linhas de `user_unit_links`. Esse array já vem **deduplicado por `unit_id`** e **filtrado por
  `status='active'` + `deleted_at is null`** na origem (§2). Não há contagem de linhas de vínculo aqui —
  o componente só olha `units.length`.

---

## 2. Fonte dos dados do seletor

Cadeia: **servidor** monta `SessionContext.units` → **store** recebe via `setSessionContext` → o
switcher lê `state.units`.

- **Servidor:** `getSessionContextByAuthUserId` em `src/lib/auth/session.ts:236`. A query real dos
  vínculos (`session.ts:253-265`):
  ```ts
  const { data: links } = await supabase
    .from("user_unit_links")
    .select("id, unit_id, access_profile_id, status, units!inner(id, name, code, status), access_profiles!inner(id, name, code, status)")
    .eq("app_user_id", appUser.id)
    .eq("status", "active")          // <- só vínculos ATIVOS
    .is("deleted_at", null)          // <- e não soft-deletados
    .eq("units.status", "active")    // <- unidade precisa estar ativa
    .is("units.deleted_at", null)    // <- e não soft-deletada
    .eq("access_profiles.status", "active")
    .is("access_profiles.deleted_at", null)
    .order("created_at", { ascending: true });
  ```
- **Deduplicação por `unit_id`:** para usuário **não-super**, `units[]` é montado por um `Map` chaveado
  em `link.units.id` (`session.ts:325-329`):
  ```ts
  const map = new Map<string, {...}>();
  for (const link of typedLinks) {
    map.set(link.units.id, { id: link.units.id, name: link.units.name, code: link.units.code });
  }
  units = Array.from(map.values());
  ```
  → **SIM, deduplica por `unit_id`** (múltiplos perfis/linhas na mesma unidade viram **1** entrada).
  (Super admin toma outro caminho: lista **todas** as unidades ativas, `session.ts:306-323` — não é o
  caso do E2E_MULTI.)
- **Filtra `status='active'`?** **SIM**, no nível da query (`.eq("status","active").is("deleted_at",null)`,
  `session.ts:259-260`), além dos `!inner` exigindo unidade e perfil ativos/não-deletados. Vínculos
  **inactive** ou soft-deletados **nunca chegam** ao dedup.
- **Store (cliente):** `setSessionContext` grava `units: context.units` (`src/store/app-store.ts:51-55`);
  o refresh via API faz o mesmo (`app-store.ts:79-83`). O switcher lê exatamente esse `state.units`.

---

## 3. Impacto da duplicata (2 active + 4 inactive, 2 unidades)

Passo a passo do que a lógica atual produz:

1. **A query descarta os 4 inactive no banco** (`.eq("status","active").is("deleted_at",null)`). Restam
   só os **2 vínculos active**.
2. **Dedup por `unit_id`** (`session.ts:325-329`) sobre esses 2 → `units.length` = **nº de unidades
   DISTINTAS entre os 2 vínculos ativos**.

Resultado: **nem 6, nem erro, nem duplicação** — o `Map` garante unicidade. O valor final é **1 ou 2**:

- **2 vínculos active em 2 unidades DISTINTAS (ativas)** → `units.length = 2` → `isMultiUnit = true` →
  **seletor APARECE**.
- **2 vínculos active resolvendo para 1 única unidade distinta** → `units.length = 1` →
  `isMultiUnit = false` → **seletor SOME** (exatamente o sintoma observado no teste).

Isso acontece quando os 2 active **não** cobrem 2 unidades distintas, por um destes motivos:
  - os 2 active estão na **mesma** unidade (a outra unidade só tem vínculos **inactive**); **ou**
  - um dos 2 active é **filtrado pelos `!inner`** porque a **unidade** dele está inactive/soft-deletada,
    ou o **perfil** dele está inactive/soft-deletado (`session.ts:261-264`).

**Conclusão:** a presença dos 4 inactive é **irrelevante** para a contagem — eles são filtrados e não
duplicam nada. O seletor sumir significa, deterministicamente, que **os vínculos ativos de E2E_MULTI
resolvem para apenas 1 unidade distinta ativa agora** (o acesso ativo à 2ª unidade caiu para o conjunto
inactive, ou ambos os ativos estão na mesma unidade). Não dá para a lógica atual "duplicar" o seletor;
ela só pode **exibi-lo (≥2 distintas)** ou **escondê-lo (≤1 distinta)**.

> Ressalva: não rodei query no staging (read-only, sem credencial). O acima é a lógica exata; a
> confirmação de **qual** dos dois casos (mesma unidade vs. unidade/perfil inativo) exige um
> `SELECT` em `user_unit_links` do E2E_MULTI — proposto no fim.

---

## 4. `units[0]` (dívida #4) — unidade ativa default

- **Ainda é o primeiro vínculo (mais antigo) arbitrário.** `session.ts:344-345`:
  ```ts
  const desiredUnitId = activeUnitIdOverride ?? getActiveUnitCookie();
  const activeUnit = (desiredUnitId ? units.find((unit) => unit.id === desiredUnitId) : undefined) ?? units[0];
  ```
  Sem cookie/override válido apontando para uma unidade **presente em `units[]`**, cai em **`units[0]`**.
- Como `units[]` (não-super) é o `Map` na **ordem de inserção** dos `typedLinks`, e estes vêm
  **ordenados por `created_at asc`** (`session.ts:265`), `units[0]` = a unidade do **vínculo ATIVO mais
  antigo** (deduplicado). Segue sendo "primeiro link arbitrário", agora por `created_at asc`.
- **Efeito da duplicata:** os 4 inactive **não participam** (filtrados). Entre os 2 active, o dedup
  mantém a primeira ocorrência por `unit_id` por `created_at asc` → é o **vínculo ativo mais antigo**
  que decide o default. Se os 2 active estão na mesma unidade, `units[0]` é essa unidade (sem
  ambiguidade e sem seletor). A duplicata **não** desestabiliza a escolha; só reforça que a dívida #4
  (default = link ativo mais antigo, sem critério de negócio) permanece.

---

## Síntese

- O seletor é gated por **`units.length > 1`** (`active-unit-switcher.tsx:53,66`), e `units[]` é
  **deduplicado por `unit_id`** e **filtrado por active/não-deletado** já no servidor
  (`session.ts:253-265, 325-329`) — refletido no store (`app-store.ts:55`).
- Com "2 active + 4 inactive", os inactive são descartados e o resultado é **1 ou 2** unidades
  distintas; **1** esconde o seletor. O sintoma (seletor ausente) só é possível se os vínculos **ativos**
  de E2E_MULTI cobrirem **uma única unidade distinta** neste momento — não é bug de duplicação/contagem
  de linhas, é **estado de dados**: o acesso ativo à 2ª unidade não está mais ativo/válido.
- Dívida #4 intacta: default = unidade do **vínculo ativo mais antigo** (`units[0]`).

**Verificação sugerida (para você rodar, sem escrever nada):**
```sql
select l.status, l.deleted_at, u.id as unit_id, u.name, u.status as unit_status, u.deleted_at as unit_deleted,
       p.code as profile_code, p.status as profile_status, p.deleted_at as profile_deleted, l.created_at
from public.user_unit_links l
join public.units u on u.id = l.unit_id
join public.access_profiles p on p.id = l.access_profile_id
where l.app_user_id = (select id from public.app_users where username = '<E2E_MULTI_username>')
order by l.created_at asc;
```
Se, entre as linhas com `l.status='active' and l.deleted_at is null` (e `unit_status='active'`,
`profile_status='active'`, ambos sem `deleted_at`), houver **≥2 `unit_id` distintos**, o seletor
deveria aparecer; se houver **1**, está explicado.
