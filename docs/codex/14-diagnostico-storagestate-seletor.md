# Diagnóstico — storageState vs. hidratação vs. seletor de unidade ausente

> 2026-07-02 · Branch `feat-fase3c-editar-perfis`. **READ-ONLY**, sem commit.
> Premissas dadas: E2E_MULTI tem **2 unidades distintas ativas no banco** e o **código de sessão está
> correto**. Objetivo: por que o seletor "Trocar unidade ativa" não renderiza **na rodada**.

---

## 1. storageState — regravado a cada run ou cache?

**Regravado a cada execução — NÃO é cache de rodada anterior.**

- O projeto `setup` (`auth.setup.ts:13-16`) chama `createAuthState("E2E_MULTI", baseURL)` a **cada**
  `npx playwright test` (o projeto `chromium` depende de `setup` — `playwright.e2e.config.ts:52`). Os
  logs das duas rodadas confirmam: `ok 2 [setup] autenticar E2E_MULTI` rodou nas duas.
- `createAuthState` **sempre** faz `POST /api/auth/login` e **sobrescreve** o arquivo:
  `await ctx.storageState({ path: statePath })` (`helpers/auth.ts:90`), em
  `playwright/.auth/e2e_multi.json` (`helpers/auth.ts:21,24`). Não há condição de "pular se já existe" —
  a regravação é incondicional a cada run.

→ A hipótese "sessão em cache de quando o e2e_multi tinha 1 unidade" **não se sustenta**: o arquivo é
refeito com um login novo toda vez.

---

## 2. O que o storageState guarda — cookies ou units[]?

**Somente cookies de auth. NÃO guarda `units[]`/`SessionContext`.**

- `createAuthState` cria o contexto com **`playwrightRequest.newContext()`** (`helpers/auth.ts:74`) —
  um **API request context**, sem DOM/janela. `storageState()` de um request context captura
  **cookies** (e `origins`/localStorage, que aqui ficam **vazios**, pois não há página/JS executando).
- `units[]` **não** é persistido em lugar nenhum do lado do teste. Ele é **computado no servidor a cada
  request** (SSR) e semeado no store no cliente (§3). O storageState carrega apenas os cookies de sessão
  do Supabase (o `normalizeStoredCookieValues`, `helpers/auth.ts:47-61`, só mexe nos **cookies**).

→ Mesmo que o arquivo fosse reusado, ele **não** poderia carregar um `units[]` desatualizado — essa
informação não vive no storageState. Isso reforça a eliminação da hipótese (a).

---

## 3. Hidratação — síncrona ou race assíncrono?

**Síncrona, antes do 1º paint. Não há race de 5s.**

- O layout autenticado `src/app/(app)/layout.tsx` é **Server Component** com `export const dynamic =
  "force-dynamic"` (`(app)/layout.tsx:7`): computa `getCurrentSessionContext()` **no servidor a cada
  request** (`:14`) e passa `sessionContext` para `AppProviders` (`:21`). O `<AppHeader/>` (que contém o
  `ActiveUnitSwitcher`) é filho desse provider (`:25`).
- `AppProviders` faz **seed SÍNCRONO no 1º render**, via inicializador de `useState`:
  ```tsx
  // app-providers.tsx:14-19
  useState(() => {
    if (sessionContext) {
      useAppStore.getState().setSessionContext(sessionContext);
    }
    return null;
  });
  ```
  O comentário do próprio código (`:12-13`) diz: *"Seed SINCRONO no 1o render: garante que filhos (ex.:
  AppHeader) leiam um SessionContext real antes do 1o paint"*. Há ainda um `useEffect` de re-sync
  (`:22-26`), mas o valor **já está no store antes do paint**.
- `setSessionContext` grava `units: context.units` no store (`store/app-store.ts:51-55`), e o switcher lê
  `state.units` de forma direta (`active-unit-switcher.tsx:8,53`).

→ Como o seed é síncrono a partir do SSR, o header renderiza **já com `units` = valor do SSR** no
primeiro paint. **Não existe** janela assíncrona onde `units=[]` por 5s. Um race de hidratação
duraria 1 tick, não 5s. Hipótese (b) **eliminada**.

---

## 4. Conclusão — (a), (b) ou (c)?

**(c) Outra causa: o `SessionContext` renderizado no SERVIDOR já entrega `units.length ≤ 1` para o
E2E_MULTI naquele request.** Não é cache de storageState (§1/§2) nem race de hidratação (§3).

Encadeamento do porquê:
- storageState é refeito por login novo a cada run e **só tem cookies** → não pode injetar `units`
  antigo (§1, §2).
- o store é semeado **síncrono** com o `SessionContext` do SSR, antes do paint (§3) → se o seletor não
  aparece nem após 5s, é porque `state.units.length ≤ 1` desde o 1º render, ou seja, **o SSR entregou
  ≤ 1 unidade**.
- o smoke de E2E_MULTI passou (logou, viu `/dashboard`) → a sessão/cookie é **válida** e o SSR **produziu
  um `SessionContext`** (senão redirecionaria para `/login`, `(app)/layout.tsx:16-18`). Logo o problema
  não é "sem sessão" — é uma sessão **com 1 unidade**.

Reconciliação com "banco tem 2 unidades ativas" + "código de sessão correto": a query de sessão
(`session.ts:253-265`) exige, **por vínculo e simultaneamente**, `user_unit_links.status='active'` +
`deleted_at is null`, **e** `units.status='active'`/não-deletada, **e**
`access_profiles.status='active'`/não-deletada (os dois `!inner`), e depois **deduplica por `unit_id`**
(`session.ts:325-329`). Basta que **um** dos dois vínculos ativos seja descartado por qualquer desses
filtros (ex.: o **perfil** daquele vínculo inativo/soft-deletado, ou o vínculo da 2ª unidade estar no
conjunto inactive) para o `units[]` colapsar de 2 → 1 e o seletor sumir. Ou seja: "2 unidades distintas
ativas" provavelmente foi verificado **sem** aplicar TODOS os filtros que a sessão aplica (em especial o
de **perfil ativo/não-deletado** por vínculo, e o `status='active'` do próprio vínculo).

> Nota: isto é coerente com o mapa `docs/codex/13`, mas agora **descarta** as explicações de harness
> (cache/race): a origem é o conteúdo do SSR, não o Playwright.

### O que confirmaria (c) — passos read-only

1. **Inspecionar o SSR no browser com o storageState do E2E_MULTI** (sem tocar código): abrir
   `/dashboard` num contexto com `storageState: e2e_multi.json` e ler o store no cliente, ex.:
   `await page.evaluate(() => (window as any) /* store */)` — ou simplesmente checar o header: se mostra
   **um único nome de unidade e nenhum `<select>`**, então `units.length=1` veio do SSR. (O
   `error-context.md`/screenshot do run falho também deve mostrar o header com 1 unidade e sem seletor.)
2. **SQL espelhando TODOS os filtros da sessão** (não só "unidade ativa") — estende o SELECT do doc 13
   incluindo o filtro de **perfil ativo/não-deletado** e do **vínculo ativo/não-deletado**:
   ```sql
   select count(distinct l.unit_id) as unidades_visiveis_pela_sessao
   from public.user_unit_links l
   join public.units u
     on u.id = l.unit_id and u.status = 'active' and u.deleted_at is null
   join public.access_profiles p
     on p.id = l.access_profile_id and p.status = 'active' and p.deleted_at is null
   where l.app_user_id = (select id from public.app_users where username = '<E2E_MULTI_username>')
     and l.status = 'active' and l.deleted_at is null;
   ```
   - Se retornar **1**, (c) está confirmado: a sessão vê 1 unidade (algum filtro de perfil/vínculo
     derruba a 2ª), e o "2 ativas" foi medido sem esses filtros.
   - Se retornar **≥2**, então o SSR deveria entregar 2 e a investigação vira para o transporte
     SSR→cliente (ex.: hidratação/serialização do `sessionContext` naquela rota) — mas, pelo §3, o seed
     é síncrono, então esse cenário seria surpreendente e mereceria capturar o `sessionContext` real
     logado no servidor.

**Resumo:** causa mais provável = **(c)** — o SSR entrega `units.length ≤ 1` para o E2E_MULTI porque os
vínculos que passam por **todos** os filtros da query de sessão (vínculo + unidade + **perfil**, todos
active/não-deletados) resolvem para **1 unidade distinta**. Não é (a) storageState em cache (é regravado
e só tem cookies) nem (b) race de hidratação (o seed é síncrono, pré-paint). A confirmação é o SQL acima
(contagem com o filtro de perfil) e/ou a inspeção do header/store no browser autenticado como E2E_MULTI.
