# 61 — Plano: painel de cotação não reflete o salvamento na hora (P2)

Status: **Fase A — plano para revisão. Nenhum código escrito.**
Origem: MELHORIAS_GALLI.md, achado P2. Sintoma observado em produção.
Sensibilidade: baixa (client, react-query). Sem migration, sem API, sem alçada.
Arquivo central: `src/components/purchases/purchase-quotes-client.tsx`.

---

## 1. Aviso honesto antes de tudo

**Não consegui provar a causa por leitura estática.** O que o código faz e o que o sintoma descreve não fecham, e isso é informação — não um detalhe a esconder atrás de um fix plausível. Este plano entrega: (a) o que está **provado**; (b) o que está **descartado**, com a evidência; (c) as hipóteses que sobram, ranqueadas, cada uma com o teste que a discrimina; (d) o fix mínimo de cada uma. A Fase B começa por **meia hora de diagnóstico instrumentado**, não por código de correção.

Escrever agora um fix para a hipótese mais provável seria adivinhar num sintoma que já é intermitente — e um fix errado num bug intermitente parece funcionar.

---

## 2. O que está provado (leitura do código)

### 2.1 O painel lê a query viva, não um snapshot

Descartei a primeira suspeita do briefing. A lista e o card "Vencedora" derivam direto do `detailQuery`:

```
const selectedRequest = detailQuery.data?.request?.id === selectedRequestId ? detailQuery.data.request : null;   // :312
const quotes = useMemo(() => (detailQuery.data?.request?.id === selectedRequestId ? detailQuery.data.quotes : []), ...);  // :313-316
const winningQuote = quotes.find((quote) => quote.isSelected) ?? null;  // :991
```

Não há estado local espelhando as cotações, nem prop congelada, nem `useMemo` com dependência faltando (as deps de `:315` cobrem `data.quotes`, `data.request.id` e `selectedRequestId`). "Nenhuma cotação cadastrada" (`:1793`) e "Nenhuma selecionada" (`:1373`, `:1482`) saem os dois de `quotes` vazio.

**Consequência importante:** se o painel mostra vazio, ou `detailQuery.data` está indefinido, ou o `request.id` da resposta não bate com `selectedRequestId`, **ou a resposta do servidor realmente veio sem as cotações**. Não existe caminho de "dado certo na query, tela errada" — o React re-renderiza quando `data` muda.

### 2.2 A query do detalhe está sempre montada e ativa

`detailQuery` é declarado no topo do componente (`:263-268`), com `enabled: Boolean(selectedRequestId)`. Não está dentro da aba. Trocar de aba (`detailTab`) muda só qual JSX é renderizado — **não remonta o hook, não dispara refetch, não muda a key**. Isto é o núcleo do paradoxo: pela leitura do código, trocar de aba não deveria consertar nada.

### 2.3 Há refetch redundante — provado, mas não é a causa

Em cada mutation (`:797-799`, `:848-851`, `:867-868`, `:880-881`, `:894-896`, `:911-912`):

```
queryClient.invalidateQueries({ queryKey: ["purchases", "quotes"] }),
queryClient.refetchQueries({ queryKey: ["purchases", "quotes", selectedRequestId], type: "active" })
```

`invalidateQueries` usa **prefix match** e, por padrão, `refetchType: "active"`. O prefixo `["purchases","quotes"]` cobre tanto o detalhe (`["purchases","quotes", selectedRequestId]`, `:264`) quanto a lista da fila (`["purchases","quotes","requests", activeUnitId]`, `:259`). Ou seja, o `invalidateQueries` **já refaz o fetch do detalhe**; o `refetchQueries` seguinte dispara um **segundo** GET do mesmo endpoint.

Isto é desperdício real (dois GETs por mutation) e é o que o briefing chama de "refetch redundante" — mas **não explica dado velho**: dois refetches não deixam a tela mais atrasada que um.

Vale registrar o efeito colateral: toda mutation de cotação também refaz a lista da fila inteira, por causa do prefixo.

---

## 3. Hipóteses que sobram, ranqueadas

### H1 — Read-after-write: o GET roda antes de o dado estar visível (mais provável)

O refetch é disparado no `onSuccess` da mutation, imediatamente após o 200 da rota de escrita. Se a leitura seguinte não enxergar o commit — replica de leitura, pool diferente, timing — o GET responde **sem a cotação nova**, o react-query guarda essa resposta como boa, e a tela fica vazia até algo disparar outra leitura.

**Por que isso encaixa com "some ao trocar de aba":** trocar de aba não refaz o fetch, mas o usuário leva alguns segundos e vários cliques até fazer isso — e o `refetchOnWindowFocus` do react-query (ligado por padrão; o `QueryClient` é criado sem options em [app-providers.tsx:9](../../src/components/providers/app-providers.tsx#L9)) dispara em qualquer volta de foco à janela. A "troca de aba" seria o **proxy** do usuário para "alguns segundos depois, mexendo na tela" — não a causa.

Esta é a hipótese que explica o sintoma **e** a intermitência. É a primeira a testar.

**Discriminante:** no DevTools → Network, com o painel vazio: abrir a resposta do GET `/api/purchases/quotes?requestId=...` disparado logo após o POST. Se o array `quotes` já vier sem a cotação recém-salva, é H1 — e o problema é de servidor/ordem, não de cache de client.

**Fix mínimo se confirmada:** a rota de escrita passa a devolver o registro salvo (várias já devolvem `quoteId`) e o client faz `queryClient.setQueryData` no detalhe com o dado autoritativo da própria resposta, em vez de depender de uma releitura. O refetch continua, mas como confirmação, não como fonte. Nada de `setTimeout`, nada de retry cego.

### H2 — A resposta do GET vem do cache HTTP do browser

[`requestJson`](../../src/components/hr/hr-candidate-shared.ts#L114-L130) chama `fetch(url, init)` **sem `cache: "no-store"`**. Para GET, o modo default do fetch usa o cache HTTP do browser. Se a resposta do route handler não carregar `no-store`, a "releitura" pode ser servida do cache com o corpo antigo — e um `Cache-Control` curto expiraria segundos depois, o que também produziria "corrigiu sozinho depois".

Contra a hipótese: route handlers dinâmicos do Next normalmente já respondem `no-store`, e esta rota é dinâmica (lê cookies via `requirePermission`). Por isso fica em segundo lugar — mas é barato de verificar e de blindar.

**Discriminante:** no Network, o GET pós-save aparece como `(disk cache)` / `(memory cache)`, ou traz `Cache-Control` permissivo.

**Fix mínimo:** `cache: "no-store"` no `requestJson` (afeta outros módulos — avaliar escopo) ou header explícito na rota.

### H3 — `detailQuery.data.request.id !== selectedRequestId` momentaneamente

A guarda de `:312`/`:314` zera `quotes` sempre que a resposta em mãos não é da solicitação aberta. Isso é correto e proposital, mas produz **exatamente** o sintoma se `selectedRequestId` mudar de identidade sem que a tela mude de solicitação.

Contra a hipótese: `setSelectedRequestId` só é chamado em `openRequest` (`:429`) e `closeRequestModal` (`:1148`). Nenhuma mutation o toca. Fica em terceiro.

**Discriminante:** um `console.log` de `detailQuery.data?.request?.id` e `selectedRequestId` no momento do vazio. Se forem iguais e `quotes` estiver vazio, H3 cai e sobra H1/H2.

---

## 4. Fase B — protocolo de diagnóstico (antes de qualquer fix)

1. Reproduzir em produção (ou no preview) com o Network aberto, gravando: o POST de save, o(s) GET(s) subsequente(s), o corpo de cada um, e se algum veio de cache.
2. Registrar `selectedRequestId` × `data.request.id` × `data.quotes.length` no instante do vazio.
3. Anotar quanto tempo passa até a tela corrigir sozinha, e se corrige **sem** interação (H1/H2) ou só depois de voltar o foco à janela (confirma o papel do `refetchOnWindowFocus`).
4. Só então escolher o fix da hipótese confirmada.

Se o passo 1 mostrar o GET já com a cotação presente **e** a tela vazia, todas as três hipóteses caem e o problema é outro — nesse caso volto com um plano novo, não com um remendo.

---

## 5. Limpeza que entra junto, independentemente da causa

Provada no item 2.3 e válida em qualquer cenário:

- **Remover os `refetchQueries` explícitos** dos 6 pontos de mutation, já cobertos pelo `invalidateQueries` de prefixo. Corta um GET por mutation.
- **Estreitar o `invalidateQueries`** onde for possível, para a mutation não refazer a fila inteira quando só o detalhe mudou.

Isto é otimização, **não é o fix do P2**, e o plano não vai fingir que é. Se sair sozinha, sai como commit próprio, para não misturar com a correção.

---

## 6. Testes

**Helper puro (`tests/unit/`)** — o que dá para testar sem browser é pouco, e é honesto dizer:

- `getSelectedRequestQuotes({ data, selectedRequestId })`: extrair a guarda de `:312-316` para função pura e cobrir os casos — data indefinida → `[]`; `request.id` diferente → `[]` (e por quê); `request.id` igual → as cotações. Isso documenta a regra e protege contra alguém "simplificar" a guarda.
- Se o fix for H1 (`setQueryData` com o retorno da escrita): testar o **merge** puro — dado o payload da resposta e o cache atual, qual é o novo estado do detalhe.

**Só verificável na tela (E2E / manual):** salvar uma cotação e ver a lista aparecer sem trocar de aba; selecionar vencedora e ver o card "Vencedora" mudar na hora; contar os GETs por mutation (deve cair de 2 para 1). Estes precisam de sessão autenticada e de banco real; não há como cobri-los no runner puro. Declarado, não escondido.

---

## 7. Invariantes

- Nenhuma mudança de API, schema, permissão ou alçada.
- Nenhuma migration.
- `docs/NAO_ALTERAR.md`: nada da fatia toca aprovação, anexos, RLS ou migrations.

---

## 8. O que preciso de você

1. **Autorização para diagnosticar antes de corrigir.** A Fase B começa com instrumentação, não com patch.
2. Se conseguir reproduzir aí, os três dados do item 4 (corpo do GET pós-save, se veio de cache, e se corrige sem interação) encurtam tudo — com eles a causa provavelmente sai na primeira tentativa.
3. A limpeza do item 5 (tirar os refetch redundantes) pode sair já, em commit separado, mesmo antes do diagnóstico. Confirma?
