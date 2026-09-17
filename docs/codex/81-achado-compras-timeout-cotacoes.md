# 81 — Achado: os dois E2E de Compras mudaram de falha

Status: **observação registrada. Fora do escopo da fatia em curso — não investigado.**
Registrado porque é **dado novo**, e estreita muito a hipótese para quando a fatia própria
chegar.

---

## O que mudou

`compras-fluxo.e2e.spec.ts` e `compras-diretoria.e2e.spec.ts` falham há cinco rodadas. Até
15/09/2026 a causa era **outra**, e escondia esta.

**Antes:** o usuário `E2E_MULTI` estava preso na tela *"Defina uma nova senha"*
(`must_change_password = true`). Os dois testes morriam em `getByLabel('Trocar unidade ativa')`
porque **nunca chegavam à casca do app**. Quatro rodadas com esse sintoma.

**Agora:** o `must_change_password` foi resolvido pelo Wilson. Os dois **passam do login**, e a
falha mudou de natureza:

- **timeout de 240s**, não erro;
- a captura mostra a tela de **Cotações** já renderizada, com a casca completa (barra lateral,
  seletor de unidade, "GALLI PRAIA", "Gerente Departamental");
- a última mensagem visível na tela é **"Fornecedor cadastrado com sucesso."**

Ou seja: o fluxo cria a solicitação, troca de unidade, cadastra o fornecedor — e **trava depois
disso**, dentro da etapa de cotação.

## O que já foi descartado, com prova

A casca do app mudou no plano 73 (o cabeçalho ganhou o botão de menu e o `ActiveUnitSwitcher`
passou a viver dentro de um `div` novo), e esses dois testes usam
`switchActiveUnit` → `getByLabel('Trocar unidade ativa')`. Como eles estiveram cegos por quatro
rodadas, a mudança do 73 **nunca tinha sido exercitada por eles** — suspeita legítima.

**Descartada por medição, não por raciocínio.** Sondagem direta como `E2E_MULTI` em
`/compras/solicitacoes`:

```
[probe] select ANEXOU em 182ms
[probe] select VISIVEL
[probe] opcoes=2
[probe] networkidle em 10ms
```

O seletor anexa, fica visível, traz as duas unidades, e o `networkidle` chega. O cabeçalho do
plano 73 **não** é a causa.

## O que isto estreita

A falha está **entre** "fornecedor cadastrado" e o fim do fluxo de cotação — não no login, não
na casca, não na troca de unidade. É a primeira vez que se sabe disso: o sintoma anterior
mascarava tudo que vem depois do login.

`p2-quote-panel-refresh.e2e.spec.ts`, que falhava pela **mesma** causa de senha, **voltou ao
verde** — o que reforça que o problema restante é específico da etapa de cotação nesses dois
fluxos, e não do módulo inteiro.

## Não investigado de propósito

Fora do escopo da fatia da Recepção (78). Este arquivo existe para que a próxima pessoa não
recomece do login.
