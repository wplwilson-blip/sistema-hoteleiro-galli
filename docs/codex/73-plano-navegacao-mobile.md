# 73 — Plano: navegação abaixo de 1024px

Status: **plano para revisão. Nenhum código escrito.**
**Portão** para o plano [71](71-plano-tela-da-governanta.md) (a tela da governanta).
Registrado como dívida desde o plano [70](70-plano-estado-apartamento-tres-dimensoes.md), §6.3a.

**Esta fatia é CASCA, não conteúdo.** Não redesenha tela existente, não toca em regra de negócio,
não mexe em permissão.

---

## 1. Levantamento — o que eu encontrei, e uma boa notícia

Você pediu para não confiar no seu diagnóstico. Confirmei-o, e o **estrago é menor** do que o
enunciado deixava supor.

### 1.1 O diagnóstico está certo, e é ausência

[`app-sidebar.tsx:319`](../../src/components/layout/app-sidebar.tsx#L319):

```
<aside className="sticky top-0 hidden h-screen w-72 shrink-0 flex-col border-r … lg:flex">
```

Abaixo de 1024px o `<aside>` some, e **não há nada no lugar**:
[`app-header.tsx`](../../src/components/layout/app-header.tsx) tem seletor de unidade, sino,
trocar senha e sair — **nenhum botão de menu**. `src/components/layout/` tem três arquivos, e
nenhum é gaveta, hambúrguer ou barra de navegação.

**Quem abrir o sistema num tablet em retrato não consegue sair da página em que caiu.** Não é
degradação; é ausência.

### 1.2 O conteúdo NÃO quebra — e isso muda o tamanho da fatia

Era a hipótese que mais me preocupava, e ela **não se confirma**:

| Verificação | Resultado |
| --- | --- |
| Telas com `<table>` | **34** |
| Dessas, com container de rolagem (`overflow-x-auto`) | **34 — todas** |
| Ocorrências de `min-w-[…]` (820–1120px) | 50, **no `<table>` dentro do wrapper que rola** |
| Elementos escondidos por breakpoint em todo o app | **1** — o próprio `<aside>` |

Amostra do padrão, que se repete em todas:

```
<div className="max-w-full overflow-x-auto rounded-lg border …">
  <table className="w-full min-w-[980px] text-left text-sm">
```

**As tabelas rolam dentro de si mesmas, sem estourar a página.** Quem escreveu essas telas já
fez a parte difícil.

O `AppHeader` também já se comporta: `flex-wrap … sm:flex-nowrap`, com o nome do usuário e o
rótulo "Trocar senha" escondidos em telas estreitas. E o `<meta name="viewport">` existe — é o
padrão do Next, confirmado no HTML servido.

**Conclusão do levantamento: o estrago é exatamente a navegação.** A fatia é menor do que
poderia ser, e isso é bom — mas não muda o fato de que ela é portão.

### 1.3 Dois achados que não estavam no enunciado

**(a) Nenhum alvo de toque atinge 44px.** O item da barra lateral é `h-10` (40px); os botões são
`min-h-10` (40px), `sm: min-h-9` (**36px**) e `icon: h-10 w-10` (40px). Para cursor está bom;
para dedo em movimento, não. Vira a **D3**.

**(b) O `<main>` tem `overflow-x-hidden`**
([`(app)/layout.tsx:30`](../../src/app/(app)/layout.tsx#L30)). Conteúdo mais largo que a
viewport é **cortado, não rolável**. As tabelas escapam porque trazem o próprio container — mas
**a grade de 115 apartamentos do plano 71 será cortada em silêncio** se nascer sem um. Ver §6.

---

## 2. Decisões

### D1 — Gaveta lateral, acionada por botão no cabeçalho

**(a) Gaveta (drawer) sobre o conteúdo, a partir de um botão no header.** ← **decidido**
**(b) Barra inferior com ícones (bottom tab bar).**
**(c) Barra lateral colapsada em ícones (rail).**
**(d) Página própria de menu.**

**Por que (a), e o argumento é de fonte única.** A barra lateral já calcula o que aparece a
partir das permissões: `canSee`, `visibleGroupEntries`, grupos com filhos, item ativo pelo
`pathname`. **A gaveta reusa essa árvore inteira, sem copiar nada.**

**(b) foi a alternativa que mais me tentou** — é o padrão certo para uso em movimento, com uma
mão, e o menu da governanta tem quatro ou cinco itens. Mas ela **exigiria uma lista curada
própria**: barra inferior comporta 3 a 5 destinos e não representa grupo aninhado, e o mesmo
componente precisa servir um `SUPER_ADMIN` com grupos, subitens e dezenas de links. Curar essa
lista cria **uma segunda fonte de verdade para navegação**, que diverge da primeira no dia em
que alguém acrescentar um item — e divergência de navegação é invisível até alguém não achar a
tela. Descartada por isso, não por ergonomia.

**(c)** rouba largura permanente justamente em retrato, que é onde ela é escassa, e esconde os
rótulos de um menu que tem "Mapa de Apartamentos" e "Apartamentos" lado a lado.

**(d)** transforma toda navegação em dois passos e perde o contexto da tela atual.

### D2 — As duas orientações, e o que NÃO muda entre elas

O corte continua em **1024px**, que é o `lg` do Tailwind e o breakpoint que a casca já usa. Não
inventamos um segundo.

| Faixa | O que aparece |
| --- | --- |
| **≥ 1024px** (desktop, tablet grande em paisagem) | A barra lateral de hoje, **sem alteração nenhuma** |
| **< 1024px** (tablet em retrato, tablet pequeno em paisagem, celular) | Botão de menu no header + gaveta |

**O que MUDA entre retrato e paisagem:** só a largura da gaveta. Em retrato ela ocupa a maior
parte da tela (largura fluida com teto, para o conteúdo não virar uma coluna de uma palavra);
em paisagem abaixo de 1024 ela é mais estreita, porque há largura sobrando e cobrir tudo seria
desnecessário.

**O que NÃO muda, e é o requisito de verdade:** o conteúdo do menu, a ordem, o item ativo e
quais grupos estão abertos. **Girar o tablet não pode reposicionar a governanta.** Como a
alternância é por CSS sobre a mesma árvore, girar é só um repaint — mas há um caso a tratar
explicitamente: **girar de retrato (gaveta aberta) para paisagem ≥1024** deve fechar a gaveta e
mostrar a barra lateral, sem piscar as duas nem perder o grupo aberto.

**Nada de detectar orientação em JavaScript.** Orientação é consequência da largura; consultar
`orientation` daria dois sistemas de decisão que discordam em tablet pequeno deitado.

### D3 — Alvo de toque de 44px na gaveta, e o desktop fica como está

Dedo não é cursor. O piso prático para uso com uma mão em movimento é **44×44**, e hoje **nada
na casca chega lá** (§1.3a).

**A gaveta usa 44px. A barra lateral do desktop continua com 40px.**

**Por que não subir os dois.** Subir 4px em cada item multiplica por um menu que, no
`SUPER_ADMIN`, tem dezenas de linhas — mais rolagem para quem hoje não tem problema nenhum.
É a §4: **mudança de layout não pode piorar quem já usa**. São contextos de entrada diferentes
(cursor com precisão de pixel × dedo em movimento), e tratá-los igual é que seria a escolha
preguiçosa.

**O mesmo componente de item serve os dois**, com o tamanho vindo de quem o renderiza — não duas
cópias que divergem.

**Esta decisão é herdada pelo plano 71**, e lá ela é mais dura: a grade de 115 apartamentos tem
alvos muito menores que um item de menu, e é onde a governanta vai tocar o dia inteiro.

### D4 — O desktop não muda: nem DOM, nem comportamento

O botão de menu é `lg:hidden`; a gaveta é `lg:hidden`; o `<aside>` continua `hidden … lg:flex`.
**Em 1024px ou mais, a árvore renderizada é a de hoje.**

Isso é afirmável, e a §5 o afirma: a suíte E2E atual roda em 1440×1200 e **precisa continuar
verde sem uma linha alterada** — e o botão de menu **não pode existir** naquela largura.

**Alternativa descartada: unificar tudo numa gaveta, inclusive no desktop.** Menos código, uma
navegação só. Mas transformaria o menu permanente de quem usa o sistema sentado num menu que
precisa ser aberto — regressão para todo mundo, em troca de elegância interna.

### D5 — O estado da gaveta vive num componente cliente próprio

`(app)/layout.tsx` é componente de servidor, e botão e gaveta precisam **compartilhar o mesmo
estado de aberto/fechado**. Entra um componente cliente que renderiza os dois e mantém o estado
entre eles.

**Alternativa descartada: estado global no `app-store`.** A gaveta é detalhe de apresentação de
um único lugar; pô-la no store global convida todo mundo a mexer nela de qualquer tela.

**Comportamento obrigatório, porque é o que separa gaveta boa de gaveta irritante:**
fechar ao navegar (senão ela cobre a tela que acabou de abrir), fechar no `Esc` e no toque fora,
devolver o foco ao botão que a abriu, e travar a rolagem do fundo enquanto estiver aberta.

---

## 3. O que muda, arquivo a arquivo

| Arquivo | Mudança |
| --- | --- |
| `src/components/layout/app-sidebar.tsx` | **Extrair a árvore de navegação** (itens, grupos, `canSee`, ativo) para um componente reutilizável. O `<aside>` passa a ser um dos dois consumidores. **Nenhuma mudança de regra de visibilidade.** |
| `src/components/layout/app-nav-drawer.tsx` | **Novo.** A gaveta: overlay, painel, foco, `Esc`, fechar ao navegar. |
| `src/components/layout/app-shell-nav.tsx` | **Novo.** Componente cliente que segura o estado e renderiza o botão (no header) e a gaveta (D5). |
| `src/components/layout/app-header.tsx` | Recebe o botão de menu, `lg:hidden`, à esquerda do seletor de unidade. |
| `src/app/(app)/layout.tsx` | Monta o componente da D5. **Sem outra alteração** — em especial, o `overflow-x-hidden` do `<main>` **não é tocado** (§6). |
| `playwright.e2e.config.ts` | Projeto novo de viewport de tablet (§5). |
| `tests/e2e/shell-mobile.e2e.spec.ts` | **Novo.** §5. |

**Fora desta fatia:** qualquer tela de conteúdo. Se alguma precisar mudar para caber, é registro,
não conserto (§6).

---

## 4. O que não regride no desktop

- **DOM idêntico** acima de 1024px: mesma `<aside>`, mesmas classes, mesma árvore.
- **A suíte E2E de hoje (31 casos, 1440×1200) continua verde sem alteração.** É o critério, não a
  expectativa.
- **O menu do desktop não muda de tamanho** (D3).
- A extração da árvore de navegação é **refatoração sem mudança de comportamento**: as mesmas
  funções de visibilidade, chamadas do mesmo jeito.

---

## 5. Como isso é testado — e por que o teste unitário não basta

**A suíte E2E roda hoje em 1440×1200 nos dois configs.** Nada exercita largura de tablet: se a
gaveta quebrar, ninguém vê.

E o modo de falha aqui **não é lógica, é CSS e DOM** — `lg:hidden` trocado, `z-index` atrás do
header, foco preso, gaveta que não fecha ao navegar. **Teste puro não pega nada disso.** Já
pagamos três vezes por defeito que só a chamada real pegou: o `organization_id` da 089, o
`errcode` da 090 e o `PGRST203` da 091. A lição vale aqui, com outra fantasia.

**Projeto novo no `playwright.e2e.config.ts`**, com viewport de tablet, rodando **só** o spec da
casca — reusando o mesmo `storageState` do `E2E_GOVERNANCA`, sem login novo.

### §7 — Os testes

Nas **duas orientações** (retrato ~834×1112 e paisagem ~1194×834, ambas abaixo e acima do corte
conforme o caso):

1. **A regressão que a fatia existe para impedir:** em retrato, o usuário **consegue sair da
   página em que caiu** — abre a gaveta, navega para outra tela, e a URL muda. Se um único teste
   tiver que passar, é este.
2. **O botão de menu existe abaixo de 1024 e NÃO existe em 1440.** Os dois sentidos — o segundo é
   o que prova a D4.
3. **A gaveta fecha ao navegar.** Sem isso ela cobre a tela recém-aberta.
4. **`Esc` e toque fora fecham**, e o foco volta ao botão.
5. **A gaveta mostra os mesmos itens que a barra lateral** para o mesmo usuário — comparação
   entre as duas larguras, com `E2E_GOVERNANCA` (menu curto) **e** `E2E_ADMIN` (menu longo, com
   grupos). É o teste que trava a volta de uma segunda fonte de verdade (D1).
6. **Alvo de toque:** todo item da gaveta tem altura ≥ 44px, medida no DOM renderizado.
7. **Girar não reposiciona:** com a gaveta aberta em retrato, ao passar para ≥1024 a gaveta some,
   a barra lateral aparece, e o item ativo continua o mesmo.
8. **O desktop não regrediu:** a suíte de 31 casos em 1440 continua verde.

---

## 6. Registrado, NÃO consertado

**O `<main>` corta o que for mais largo que a viewport** (`overflow-x-hidden`, §1.3b). As tabelas
escapam porque trazem o próprio `overflow-x-auto`.

**Não vou mexer nisso nesta fatia**, e o motivo é o escopo que você fixou: trocar por
`overflow-x-auto` mudaria o comportamento de **34 telas de conteúdo** de uma vez, e nenhuma delas
está sendo revisada aqui. O risco de mudar em silêncio o layout de tudo é maior que o benefício.

**Vira restrição herdada pelo plano 71, e ela é dura:** a grade de 115 apartamentos **precisa
trazer o próprio container de rolagem**, como as 34 tabelas fazem. Se nascer sem, será cortada —
sem erro, sem aviso, sem rolagem. Exatamente o modo de falha silenciosa que esta linha de
trabalho já encontrou três vezes no banco, agora na tela.

---

## 7. Discordância registrada

**O plano 70, §6.3a, disse que "tablet em paisagem funciona; retrato e celular ficam sem
navegação"** — e tratou o problema como aceitável porque paisagem bastaria.

**Não basta mais**, e por uma razão que não existia então: os tablets **ainda não foram
comprados**. Amarrar a compra a "só serve se usarem deitado" é deixar uma limitação que nós
mesmos criamos escolher o aparelho — e ninguém circula por um corredor com um tablet deitado
porque o software exige.

A decisão do plano 70 estava certa **para o momento** (era dívida registrada, não defeito
ignorado). O que mudou foi o contexto: virou portão porque a tela que depende dela vai ser usada
em movimento.

**Segunda discordância, com o meu próprio enunciado desta fatia:** eu esperava encontrar estrago
além da barra lateral, e **não encontrei** (§1.2). Vale registrar que a suspeita não se
confirmou — senão o próximo a ler assume que "abaixo de 1024 tudo quebra", e faz uma fatia maior
do que precisa.

---

## 8. Critério de pronto

- `npx tsc --noEmit` limpo e `npm run test:unit` verde.
- Suíte E2E de **31 casos em 1440×1200 verde, sem alteração** (§4).
- Spec novo da casca verde nas **duas orientações** (§5).
- Nenhuma tela de conteúdo alterada.
- A restrição do `<main>` registrada no plano 71 antes de ele ser escrito (§6).

---

## 9. Branch

`feat/navegacao-mobile`.
