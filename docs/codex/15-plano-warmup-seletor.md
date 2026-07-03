# Plano — Correção 2: aquecer a rota antes de checar o seletor de unidade

> 2026-07-02 · Branch `feat-fase3c-editar-perfis`. **PLANO, não código.** Read-only, sem commit.
> Objetivo: eliminar a instabilidade cold/warm dos specs de compras atacando a **causa** (primeira
> compilação/hidratação da rota `/compras`), não inflando um timeout mágico. Base empírica: rodada 1
> (frio) falha em `active-unit.ts:19`; rodada 2 (quente) passa — E2E_MULTI **tem** 2 unidades.

---

## 1. Onde `switchActiveUnit` é chamado e o que roda ANTES

Chamadas (grep confirma — só nos 2 specs de compras):
- `tests/e2e/helpers/purchases-flow.ts:78` — usado por **compras-diretoria** (via `createPurchaseAwaitingApproval`).
- `tests/e2e/compras-fluxo.e2e.spec.ts:66` — 1ª troca (cold).
- `tests/e2e/compras-fluxo.e2e.spec.ts:161` e `:184` — trocas posteriores (já quentes).

**A rota `/compras` JÁ foi visitada antes** — `switchActiveUnit` **não** é a primeira coisa a tocar a
tela. Em ambos os pontos críticos ele é imediatamente precedido por
`openAuthenticated(page, "/compras/solicitacoes")` (`purchases-flow.ts:77`, `compras-fluxo.e2e.spec.ts:65`).
Mas o sinal de "pronto" do `openAuthenticated` é **fraco para este caso**: ele faz `page.goto(...)` e
espera só o `<main>` ficar visível (`helpers/purchases-ui.ts:82-86`, timeout 30s).

**Por que `main` visível não basta:** o `<select>` do seletor está num **client component**
(`active-unit-switcher.tsx:1` `"use client"`) e é gated por `isMultiUnit = units.length > 1`
(`active-unit-switcher.tsx:53,66`). O store inicia com `units: []` (`store/app-store.ts:47`) e só é
semeado com as 2 unidades quando o `AppProviders` roda o seed do `SessionContext`
(`components/providers/app-providers.tsx:14-19`). No **cold start** do Next dev, o HTML do SSR chega e o
`<main>` aparece, mas o **bundle client compila sob demanda** e a **hidratação** (que semeia o store e
faz o switcher renderizar o `<select>`) atrasa vários segundos. Resultado: `openAuthenticated` passa
(main visível), mas o `getByLabel('Trocar unidade ativa').toBeVisible({timeout: 5000})` de
`active-unit.ts:16-19` expira antes de a hidratação inserir o `<select>`. No **warm start** a hidratação
é rápida e o seletor aparece < 5s → passa. Essa é exatamente a causa da instabilidade.

---

## 2. Onde encaixar o "aquecimento"

**Recomendação: no helper `switchActiveUnit`** (`tests/e2e/helpers/active-unit.ts`), como um passo de
**readiness positivo** ANTES da checagem do `<select>`. Motivos:
- Cobre **todas** as 4 chamadas (as 2 críticas + as 2 posteriores) e qualquer spec futuro, sem duplicar.
- É **idempotente e barato** quando a página já está quente (a espera resolve instantaneamente).
- `switchActiveUnit` é page-agnostic e é sempre precedido de `openAuthenticated`, então é o ponto certo
  para garantir que o **header** (onde vive o seletor) esteja hidratado.

**Qual sinal esperar (o "aquecimento"):** aguardar um elemento **sempre presente do próprio header do
switcher** — que renderiza para todo usuário, fora do gate `isMultiUnit` — como o nome da unidade
ativa (`active-unit-switcher.tsx:57-59`) ou o nome do perfil (`:64`). Esse elemento só ganha conteúdo
real **após a hidratação** (no estado inicial `activeUnit.name`/`profile.name` são vazios). Esperá-lo
visível **prova que o client component do header hidratou** e, portanto, que o `<select>` gated já foi
renderizado (quando multiunidade). Só então rodar a asserção atual do `<select>`.

> Como o header não tem `data-testid` (e adicioná-lo tocaria o produto — proibido aqui), o âncora será
> por **texto/role** de um elemento já existente do header. Se a fragilidade de texto incomodar, ver a
> alternativa abaixo.

**Alternativa (fallback, por-flow):** logo após o **primeiro** `openAuthenticated` de cada spec, aquecer
esperando um elemento **da página** já hidratado e com testid existente — `getByTestId("solicitacao-nova")`
visível (é o próximo botão do fluxo e prova a hidratação de `/compras/solicitacoes`) — e só depois chamar
`switchActiveUnit`. Vantagem: âncora por testid (sem fragilidade de texto, sem novo testid no produto).
Desvantagem: precisa ser repetido em cada ponto de entrada (menos DRY que o helper).

**Descartado:** reforçar `openAuthenticated` para toda navegação — ele é usado em muitas rotas e o
seletor é específico do header/compras; melhor manter o custo do aquecimento onde o seletor é consumido.

---

## 3. Ainda precisa de folga de timeout?

O **aquecimento é o conserto**; o timeout deixa de ser o mecanismo principal. Divisão recomendada:
- **Espera de readiness (a causa):** timeout **generoso ~30s** — mesma ordem do `<main>` do
  `openAuthenticated` (`purchases-ui.ts:85`) e do `departamento` (`purchases-flow.ts:85`, 10s). Esse é
  o orçamento que absorve a compilação fria; é gasto num **sinal positivo** ("header hidratou"), não
  num número mágico sobre o `<select>`.
- **Asserção do `<select>` (rede de segurança):** manter um timeout **modesto**, subindo de 5s para
  **~10s**. Justificativa: depois que o header hidratou, a presença do `<select>` é praticamente
  síncrona; 10s é só folga para o último render/re-render, não o mecanismo de correção.

Ou seja: **o aquecimento sozinho resolve** o cold-start; a folga de 5s→10s no `<select>` fica apenas
como margem defensiva, não como "timeout mágico" substituindo a causa.

---

## 4. Fica 100% em teste/helper?

**Sim.** A mudança toca **apenas** `tests/e2e/helpers/active-unit.ts` (e, na alternativa por-flow,
`purchases-flow.ts` e `compras-fluxo.e2e.spec.ts` — também arquivos de teste). **Não** toca:
- produto/componentes (`active-unit-switcher.tsx`, header, store) — apenas **lê** o DOM que já existe;
- **nenhum** `data-testid` novo no app (âncora usa texto/role existente ou o testid `solicitacao-nova`
  já presente);
- migration, schema, `playwright.e2e.config.ts` nem qualquer config.

---

## 5. Outros specs afetados por `switchActiveUnit`?

**Não além dos dois de compras.** Grep de `switchActiveUnit` em `tests/e2e/`:
- Definição: `helpers/active-unit.ts:14`.
- Usos: `compras-fluxo.e2e.spec.ts:66,161,184` (import em `:4`) e `helpers/purchases-flow.ts:78`
  (usado por **compras-diretoria**).
- **Nenhum** outro spec importa/usa. Os smokes e `perfis-super-admin` não tocam o seletor.

Impacto colateral: as chamadas posteriores (`compras-fluxo:161,:184`), já em páginas quentes, apenas
ganham uma espera extra **rápida** (resolve imediato) — comportamento inalterado, só mais robusto.

---

## Resumo executável (para a revisão aprovar)

1. Em `switchActiveUnit` (`active-unit.ts`), **antes** da asserção do `<select>`, aguardar um elemento
   **sempre-presente do header** (nome da unidade ativa / nome do perfil) ficar visível — timeout **30s**
   (absorve o cold compile/hidratação). Isso é o "aquecimento" que ataca a causa.
2. Manter a asserção do `<select>` existente, subindo o timeout de **5s → ~10s** só como rede de
   segurança.
3. Alternativa de menor fragilidade (se preferir testid a texto): aquecer por-flow esperando
   `getByTestId("solicitacao-nova")` após o primeiro `openAuthenticated`, antes do `switchActiveUnit`.
4. Escopo 100% em `tests/e2e/**`; nada de produto/config; só as 2 specs de compras são afetadas
   (positivamente).

**Aguardando aprovação** antes de escrever o código.
