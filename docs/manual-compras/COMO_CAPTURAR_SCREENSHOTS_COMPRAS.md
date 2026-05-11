# Como capturar screenshots do modulo de Compras

## Objetivo

Gerar prints padronizados das telas principais do modulo de Compras para uso no manual operacional.

## Pre-requisitos

1. Rode o sistema local:

```bash
npm run dev
```

2. Tenha a sessao local do Playwright ja criada:

```bash
npm run screenshots:auth
```

## Captura

Em outro terminal, rode:

```bash
npm run screenshots:compras
```

Antes de capturar, abra `http://localhost:3000/compras` no navegador e confirme visualmente que o sistema esta estilizado.

Mantenha `npm run dev` rodando durante toda a captura.

Se algum print sair sem CSS/Tailwind, apague os PNGs gerados em `docs/manual-compras/assets/screenshots/` e rode a captura novamente.

Se isso acontecer depois de rodar `npm run build`, reinicie o `npm run dev`. O servidor local pode ficar apontando para assets CSS antigos da pasta `.next`.

O script tambem aguarda os indicadores de carregamento sumirem antes de salvar os PNGs.

Se a sessao expirar ou o Playwright voltar para `/login`, gere a sessao novamente:

```bash
npm run screenshots:auth
```

## Máscara de dados pessoais nos screenshots

Durante a captura, o script substitui visualmente no navegador dados pessoais do usuário autenticado por textos de treinamento, como:

- `Usuário Treinamento`
- `@usuario.demo`

Essa máscara ocorre apenas no DOM usado pelo Playwright para gerar o print.

Ela não altera banco de dados, usuário, login, Auth ou informações reais do sistema.

## Arquivos gerados

Os screenshots serao salvos em:

```text
docs/manual-compras/assets/screenshots/
```

Arquivos esperados:

```text
01-dashboard-compras.png
02-solicitacoes-compras.png
03-cotacoes-compras.png
04-aprovacoes-compras.png
05-pendencias-documentais-compras.png
```

## Seguranca

Antes de commitar imagens, revise visualmente os arquivos.

Nao versionar prints com dados sensiveis, documentos, informacoes pessoais, credenciais, anexos ou observacoes internas inadequadas.

Preferir ambiente local com dados ficticios/demo.
