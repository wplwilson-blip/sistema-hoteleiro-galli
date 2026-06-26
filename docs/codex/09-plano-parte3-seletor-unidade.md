# Plano — Parte 3: indicador/seletor visível de unidade ativa no header

> **Escopo:** SÓ UI/UX da troca de unidade ativa. **Nada de escopo de dados** (isso é a
> Leva 2). Não toca backend, `permissions.ts`, `session.ts`, endpoint `active-unit`, login,
> auth, migrations.
> **Base (Leva 1, já no main):** `app-store.ts` expõe `activeUnit`, `units[]`, `profile`,
> `activeUnitError` e `setActiveUnit(unitId)` (assíncrono: chama `POST /api/auth/active-unit`,
> valida server-side, reflete o `SessionContext`; em 403/erro grava `activeUnitError` e **não**
> troca). `app-header.tsx` já tem um `<select>` controlado por `activeUnit.id`.

---

## 1. Restrição de componentes (verificado)

Instalado: apenas `@radix-ui/react-label`, `@radix-ui/react-slot`, `lucide-react`, e os
shadcn locais `button`, `card`, `input`, `label`. **Não há** Radix Select/Popover/DropdownMenu
nem `cmdk`. Portanto:

- **Não** dá para um Combobox/Command com busca "shadcn" sem **lib nova** (proibido).
- O controle será o **`<select>` nativo** (já em uso): acessível por padrão (teclado, foco,
  rótulo, **type-ahead nativo** — digitar filtra a opção, o que cobre bem a lista grande do
  super admin), estilizado com Tailwind + ícone lucide. Sem dependência nova, baixo risco de a11y.
- (Combobox com busca custom, feito à mão, fica como **alternativa futura** — ver §6 — não nesta parte.)

## 2. Desenho do indicador/seletor (onde e o quê)

No `app-header.tsx`, o cluster da esquerda hoje mostra `MapPin + activeUnit.name` e, embaixo,
`profile.name`; e à direita há um `<select>` solto. Proposta: **encapsular tudo num
subcomponente** `ActiveUnitSwitcher` e deixar o header só compondo.

- **Indicador (sempre visível):** `MapPin` + **nome da unidade ativa** em destaque + label
  curto "Unidade ativa" (ou o `profile.name` como subtexto, mantendo o que já existe) — deixa
  claro "é aqui que você está operando", não um select solto.
- **Controle de troca (quando `units.length > 1`):** o `<select>` nativo, com `aria-label`
  "Trocar unidade ativa", `value={activeUnit.id}`, `onChange` chamando o fluxo do §3. Ícone
  `ChevronDown` (já usado). Visualmente atrelado ao indicador (mesmo bloco), não solto.
- **Novo arquivo:** `src/components/layout/active-unit-switcher.tsx` (client component) que lê
  do store (`activeUnit`, `units`, `profile`, `activeUnitError`, `setActiveUnit`) e contém os 4
  estados. `app-header.tsx` passa a renderizar `<ActiveUnitSwitcher />` no lugar do `<select>`
  atual (e, opcionalmente, do bloco MapPin+nome, para centralizar a apresentação).
- **Responsivo:** o **nome da unidade ativa** permanece visível inclusive no mobile (hoje o
  `<select>` é `hidden md:block`). Proposta: indicador (nome) sempre visível; o controle de
  troca aparece md+ como hoje, e no mobile pode virar o próprio `<select>` compacto full-width
  (decisão de layout menor; sem mudar comportamento). Registrar como ponto de design.

## 3. Os quatro estados

### (a) Normal (multiunidade)
Mostra o indicador + `<select>` habilitado com a unidade ativa selecionada. Trocar dispara o §3(b).

### (b) Trocando (loading, evitar troca dupla) — sem tocar no store
`setActiveUnit` é assíncrono e já retorna `Promise`. O subcomponente mantém **estado local**
`isSwitching` (não precisa mexer no store):
- no `onChange`: setar `isSwitching = true`, `await setActiveUnit(novoId)`, depois `isSwitching = false`;
- enquanto `isSwitching`: **desabilitar** o `<select>` (`disabled`) → impede troca dupla; mostrar
  um `Loader2` (spin) ao lado e `aria-busy="true"`;
- o `<select>` é **controlado** por `activeUnit.id`: durante o await o valor exibido continua a
  unidade atual; ao **sucesso** o store atualiza `activeUnit` → o select reflete a nova; em
  **erro** o store não muda `activeUnit` → o select **reverte sozinho** para a atual (§3c).
- Opcional de UX: ao concluir com sucesso, `router.refresh()` para recarregar dados server-side
  (na Leva 1 os dados são união, então é cosmético; **deixar para a Leva 2**, quando os dados
  passam a depender da unidade — registrar como dependência, **não** fazer agora).

### (c) Erro (ex.: 403) — reverte e avisa de forma discreta
- O store já grava `activeUnitError` quando falha; o subcomponente **lê** esse valor e o exibe
  de forma **discreta** (texto pequeno em `text-destructive`, abaixo/ao lado do controle), com
  `role="status"`/`aria-live="polite"`.
- Como `activeUnit` não mudou no erro, o `<select>` controlado **já reverte** para a unidade atual.
- **Auto-dismiss:** o subcomponente usa estado/efeito **local** com timer (ex.: 4s) para
  **esconder** a mensagem; o valor no store é sobrescrito naturalmente na próxima tentativa
  (sucesso → `null`; novo erro → nova mensagem). Assim não é preciso adicionar ação ao store
  (mantém o store **read-only** nesta parte).
  - *Alternativa sinalizada (decisão sua):* adicionar um `clearActiveUnitError()` ao store para
    zerar de verdade o valor — é 1 linha e mantém store/efeito mais limpos. Por padrão **não**
    altero o store; só leio `activeUnitError`.

### (d) Unidade única (`units.length <= 1`)
- **Não** renderizar `<select>` (não sugerir troca). Mostrar a unidade como **rótulo estático**
  (mesmo indicador `MapPin + nome` + `profile.name`), texto acessível, sem control interativo.
- Caso de borda: `units.length === 0` (estado neutro antes da hidratação / sessão vazia) →
  rótulo vazio/placeholder sem quebrar (o estado inicial neutro da Leva 1 já garante objetos
  definidos; o seed síncrono do `AppProviders` evita flash).

### Super admin (lista grande)
- `units[]` traz todas as unidades ativas. O `<select>` nativo lida bem: rolagem nativa +
  **type-ahead** (digitar o início do nome pula para a opção) — navegável por teclado, sem lib.
- Opcional de legibilidade: agrupar/ordenar por nome (já vem ordenado por nome do `session.ts`)
  e exibir `código - nome` quando houver `code`. Sem busca custom nesta parte (ver §6).

## 4. Acessibilidade
- `<select>` nativo: foco/teclado/leitor de tela por padrão; manter `aria-label` descritivo.
- Indicador associado por texto visível; estado de troca com `aria-busy`; erro com
  `aria-live="polite"`.
- Estado `disabled` durante a troca comunica indisponibilidade temporária.

## 5. Arquivos tocados
- **NOVO** `src/components/layout/active-unit-switcher.tsx` — subcomponente client com os 4
  estados; lê do store (inclui **leitura** de `activeUnitError`); estado local `isSwitching` +
  timer de auto-dismiss do erro.
- **EDIT** `src/components/layout/app-header.tsx` — substitui o `<select>` atual (e,
  opcionalmente, o bloco de nome) por `<ActiveUnitSwitcher />`; remove a lógica de troca
  inline. Mantém logout/NotificationBell/usuário como estão.
- **Store:** **somente leitura** (`activeUnitError`); **sem alteração** (a menos que você
  aprove o `clearActiveUnitError()` opcional do §3c).
- **Nada** de backend, `permissions.ts`, `session.ts`, endpoint, login, auth, migrations, libs.

## 6. Fora desta parte (registrado)
- Combobox com **busca** para super admin com dezenas de unidades: exigiria `cmdk`/Radix
  (lib nova) ou um combobox custom à mão (a11y trabalhosa). Fica para evolução, se a lista
  crescer a ponto do type-ahead nativo não bastar.
- `router.refresh()` / invalidação de dados na troca: pertence à **Leva 2** (quando os dados
  passam a seguir a unidade). Aqui a troca é só de indicador/perfil.

## 7. Critério de aceite
- **Unidade única:** não aparece seletor de troca; a unidade é rótulo estático (sem sugerir troca).
- **Multiunidade:** trocar no header reflete a nova unidade no indicador (e no `profile`
  retornado pelo servidor); enquanto troca, mostra carregando e **bloqueia troca dupla**.
- **Erro/403:** o seletor **reverte** para a unidade atual e aparece aviso **discreto** que
  **some** depois; nenhuma troca acontece.
- **Super admin:** o seletor funciona com muitas opções (rolagem + type-ahead nativo, teclado).
- **Sem mudança de dado:** comportamento de dados idêntico ao atual (continua união — Leva 2 é
  que muda isso).
- **A11y:** controle navegável por teclado e rotulado.
- **build e lint passam.**
