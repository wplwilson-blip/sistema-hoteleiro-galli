# Sprint 3 - Login real por username e senha

## Decisao de autenticacao

O usuario entra com `username` e senha. O Supabase Auth continua sendo o provedor de sessao por tras, mas recebe um e-mail tecnico interno no formato:

```text
username@internal.hotelgalli.local
```

Esse identificador nao aparece em telas, respostas de API publicas ou logs de interface. O campo de e-mail pessoal segue opcional e nao e usado como login.

## Variaveis obrigatorias

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

`NEXT_PUBLIC_SUPABASE_URL` deve ser a URL base do projeto, sem `/rest/v1`. As validacoes do servidor falham com mensagem clara quando alguma variavel estiver ausente, sem imprimir valores de chaves.

## Rotas criadas

- `GET /setup-inicial`: formulario para criar o primeiro Super Admin.
- `POST /api/setup/initial-admin`: cria organizacao, unidade, usuario no Supabase Auth, `app_users` e vinculo em `user_unit_links`.
- `POST /api/auth/login`: autentica por `username` + senha.
- `POST /api/auth/logout`: encerra a sessao Supabase e limpa cookies.

## Setup inicial

O setup fica disponivel somente enquanto nao existir Super Admin ativo vinculado a uma unidade ativa. A API tambem valida essa regra antes de gravar, para impedir novos Super Admins pelo endpoint publico.

Como Supabase Auth e tabelas locais nao compartilham uma unica transacao SQL, o rollback e best effort: se a criacao em `app_users` ou `user_unit_links` falhar depois de criar o usuario Auth, a rota tenta remover o usuario Auth via Admin API. Se a remocao falhar, o erro fica restrito ao servidor.

## Login

Fluxo:

1. Recebe `username` e senha.
2. Valida formato do username e campos obrigatorios.
3. Localiza `app_users` internamente.
4. Bloqueia usuarios inativos, bloqueados ou sem vinculo ativo.
5. Usa o `auth_email` tecnico apenas no servidor para chamar Supabase Auth.
6. Retorna apenas dados seguros: usuario, perfil, unidades e unidade ativa.
7. Registra logs tecnicos de sucesso/falha sem expor chaves ou `auth_email`.

## Como testar

1. Configure `.env.local` com as tres variaveis obrigatorias.
2. Rode `npm run dev`.
3. Acesse `http://localhost:3000/`.
4. Sem Super Admin ativo, o sistema deve redirecionar para `/setup-inicial`.
5. Crie o Super Admin.
6. Acesse `/setup-inicial` novamente e confirme que redireciona para `/login`.
7. Faça login com `username` e senha.
8. Confirme acesso a `/dashboard`.
9. Clique em `Sair`.
10. Tente abrir `/dashboard` deslogado e confirme o redirecionamento para `/login`.

## Fica para Sprint 4

- Policies finais de RLS por modulo e por permissao efetiva.
- Gestao completa de usuarios, unidades, departamentos, cargos e permissoes.
- Seletor persistente de unidade ativa por usuario.
- Fluxo de primeiro acesso, troca de senha e recuperacao sem e-mail transacional.
