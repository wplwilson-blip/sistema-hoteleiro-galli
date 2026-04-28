# Sistema Administrativo Hotel Galli

Sistema administrativo SaaS multiunidade do Hotel Galli. O foco do produto e administracao interna, operacao, aprovacoes, evidencias, padronizacao, auditoria e gestao multiunidade.

Este sistema nao e PMS, nao tera reservas e nao sera um financeiro completo.

## Stack

- Next.js 14 com App Router
- TypeScript
- Tailwind CSS
- shadcn/ui
- React Hook Form
- Zod
- TanStack Query
- Zustand
- Supabase client preparado para uso futuro

## Como instalar

```bash
npm install
```

## Como rodar localmente

```bash
npm run dev
```

Acesse:

- `http://localhost:3000/login`
- `http://localhost:3000/dashboard`
- `http://localhost:3000/minha-operacao`

## Comandos principais

```bash
npm run dev
npm run build
npm run start
npm run lint
```

- `npm run dev`: inicia o ambiente local.
- `npm run build`: gera build de producao.
- `npm run start`: executa a build de producao.
- `npm run lint`: executa as regras de lint do Next.js.

## Status da Sprint 1

A Sprint 1 entrega apenas a base visual e estrutural do sistema. A tela de login usa usuario e senha, sem e-mail, magic link ou recuperacao por e-mail.

A autenticacao real sera implementada somente na Sprint 3. Banco de dados, migrations, RLS, workflow real e modulos operacionais ainda nao foram criados.
