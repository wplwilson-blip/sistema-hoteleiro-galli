# Plano — Gestão de Usuário: reset de senha, exclusão e edição (Fase 1)

> **Objetivo:** fechar três lacunas da gestão de usuário interno que hoje obrigam
> intervenção manual via SQL ou deixam estados inconsistentes.
> **Área SENSÍVEL** (reset/exclusão tocam Supabase Auth — `NAO_ALTERAR.md`).
> Plano → revisão → código. Testar no STAGING e aplicar a regra de ouro (staging + produção).
> **Padrão-ouro de autorização:** `src/lib/hr/api-auth.ts`.

---

## 1. Estado atual (verificado no código)

Arquivos: `src/app/api/base/users/route.ts` (GET/POST), `src/app/api/base/users/[id]/route.ts`
(PATCH), `src/components/base-cadastros/users-client.tsx`.

- **Criação (POST):** cria no Auth (`auth.admin.createUser` com senha) e em `app_users`,
  com rollback (`auth.admin.deleteUser`) se algo falhar no meio. Está sólida.
- **Edição (PATCH):** altera status e vínculos de unidade/colaborador. **Não** edita username.
- **Reset de senha:** NÃO existe. Hoje só via SQL manual (`update auth.users ... crypt(...)`).
- **Exclusão:** NÃO existe DELETE. Só dá pra inativar via PATCH de status. Não há caminho
  para remover usuário de forma consistente (Auth + app_users juntos).

## 2. As três lacunas a fechar

### 2.1 Reset de senha (a dor concreta)
Permitir que um admin redefina a senha de um usuário pela interface, sem SQL.
- Nova rota: `POST /api/base/users/[id]/reset-password` (ou ação no PATCH — decidir).
- Backend usa `supabase.auth.admin.updateUserById(authUserId, { password })` — mesmo
  caminho administrativo da criação.
- Regras: validar permissão (quem pode resetar senha de quem); validar força mínima de senha;
  nunca logar a senha; escopo por unidade (admin só reseta usuário das suas unidades).
- Decisão a tomar: senha definida pelo admin, ou senha temporária gerada + troca obrigatória
  no próximo login? (V1 sugerida: admin define; troca obrigatória fica para evolução.)

### 2.2 Exclusão consistente
Hoje deletar no Auth deixaria órfão em app_users (e vice-versa).
- Decisão de modelo: exclusão = **soft delete** (marcar `deleted_at` em app_users) + desativar
  no Auth, OU hard delete dos dois. Recomendação: **soft delete em app_users + desabilitar
  acesso no Auth** (preserva histórico/auditoria; nada some de verdade). Confirmar.
- A operação tem que tratar os dois lados de forma atômica: se um falhar, não deixar o outro
  inconsistente (mesmo cuidado de rollback que a criação já tem).
- Escopo por unidade + permissão.

### 2.3 Edição de username e dados
- Estender o PATCH para permitir editar username (com unicidade) e dados básicos.
- Cuidado: o `auth_email` técnico é derivado do username (`username@internal.hotelgalli.local`).
  Mudar username implica mudar o auth_email no Auth — isto toca `auth_email`, que é
  **explicitamente NAO_ALTERAR**. Decisão necessária: permitir trocar username (e sincronizar
  auth_email) OU bloquear edição de username e permitir só outros campos. Recomendação V1:
  **não permitir trocar username** (evita mexer em auth_email); permitir editar só dados não
  sensíveis. Reavaliar depois.

## 3. Restrições (NAO_ALTERAR)

- Reset e exclusão tocam Supabase Auth — área sensível. Não mudar o fluxo de login,
  o formato do auth_email, nem o setup inicial.
- Reusar os helpers de sessão e o padrão de autorização do RH (`api-auth.ts`).
- Não introduzir libs novas.
- Manter o comportamento de quem já funciona; só adicionar as capacidades novas.

## 4. Autorização (definir antes do código)

- Qual permissão controla reset de senha e exclusão? (ex.: `BASE:users.manage` ou similar —
  verificar o que já existe em permissions/profile_permissions; não criar grant morto).
- Escopo por unidade: admin só age sobre usuários das unidades a que tem acesso.
- Super admin: age sobre todos.

## 5. Teste (staging primeiro, depois produção — regra de ouro)

- Reset: resetar senha de um usuário de teste e confirmar login com a senha nova.
- Exclusão: excluir um usuário de teste e confirmar que ele some das listagens, não loga mais,
  e não deixa registro órfão (nem em app_users vivo, nem em Auth ativo).
- Edição: editar dados permitidos e confirmar persistência; confirmar que username (se
  bloqueado) não pode ser alterado.
- Permissão/escopo: usuário sem permissão recebe 403; admin não age fora das suas unidades.

## 6. Critério de aceite

- Admin reseta senha pela interface, sem SQL manual.
- Exclusão deixa o sistema consistente (Auth + app_users alinhados), preservando auditoria.
- Edição de dados permitidos funciona; auth_email/login intocados.
- Autorização por permissão + escopo por unidade; nada quebra para quem já usa.
- Lint e build passam.

## 7. Decisões que preciso confirmar com Wilson antes do código

1. Reset: admin define a senha, ou senha temporária com troca obrigatória? (V1: admin define.)
2. Exclusão: soft delete (recomendado) ou hard delete?
3. Username: bloquear edição (recomendado, evita mexer em auth_email) ou permitir com sync?

---

## 8. DECISÕES CONFIRMADAS por Wilson (não reabrir)

1. **Reset de senha:** o admin define a senha nova (V1). Troca obrigatória no primeiro
   login fica para evolução futura.
2. **Exclusão:** SOFT DELETE — marca `deleted_at` em app_users + desabilita acesso no Auth,
   preservando histórico/auditoria. Nada é apagado de verdade.
3. **Username:** NÃO permitir edição de username (evita mexer no auth_email técnico, que é
   NAO_ALTERAR). Edição cobre só dados não sensíveis. Reavaliar no futuro.
