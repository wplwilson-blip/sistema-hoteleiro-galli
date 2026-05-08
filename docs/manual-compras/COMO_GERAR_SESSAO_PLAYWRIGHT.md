# Como gerar sessao local do Playwright para screenshots

## Objetivo

Gerar um arquivo local de sessao autenticada para permitir que o Playwright capture telas internas do modulo de Compras.

## Importante

O arquivo `playwright/.auth/user.json` pode conter cookies validos de sessao.

Nunca faca commit desse arquivo.

A pasta `playwright/.auth/` deve permanecer no `.gitignore`.

## Passo a passo

1. Rode o sistema local:

```bash
npm run dev
```

2. Em outro terminal, rode:

```bash
npm run screenshots:auth
```

3. O navegador sera aberto em `/login`.

4. Faca login manualmente.

5. Depois que o sistema carregar a area autenticada, o Playwright salvara a sessao em:

```text
playwright/.auth/user.json
```

6. Confirme que o arquivo nao aparece no `git status`.

## Seguranca

Nao usar dados sensiveis em screenshots.

Preferir usuario demo e registros ficticios.

Nao capturar producao com dados reais.
