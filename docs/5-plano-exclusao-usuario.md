# Plano — Exclusão de usuário interno (soft delete) — Fase 1, Leva 2

> **Objetivo:** permitir excluir um usuário interno pela interface, de forma consistente,
> preservando histórico (soft delete). Hoje só dá pra inativar via status; não há exclusão.
> **Área SENSÍVEL** (toca usuário/acesso — NAO_ALTERAR). Plano → revisão → código.
> **Decisão já tomada (sessão anterior):** SOFT DELETE, não hard delete.
> Testar no STAGING; aplicar a regra de ouro se houver mudança de banco.

---

## 1. Estado atual (verificado no código)

- `app_users` já tem as colunas: `deleted_at`, `status`, `updated_by`. Soft delete já é suportado pelo schema.
- **GET /api/base/users** já filtra `deleted_at is null` → usuário soft-deletado some da lista automaticamente.
- **Login** (`/api/auth/login`) já exige `deleted_at is null` E `status = 'active'` no app_user, e exige vínculo ativo → usuário soft-deletado NÃO consegue logar, sem mexer no Auth.
- **PATCH** já sabe inativar status e coordenar vínculos (`replaceUnitLinks` etc.).
- **Não existe** hoje uma operação de exclusão (nem DELETE, nem marcação de `deleted_at`).

**Conclusão importante:** como login e listagem já respeitam `deleted_at`/`status`, o soft delete
pode ser feito SÓ no lado do app_users — NÃO é necessário deletar/banir no Supabase Auth.
Isso evita a parte mais arriscada (mexer no Auth) e mantém o registro do Auth intacto para auditoria.

## 2. Decisões (confirmar com Wilson)

1. **O que o soft delete faz, exatamente:**
   - Marca `deleted_at = now()` no `app_users`.
   - Define `status = 'inactive'` (defensivo: garante que qualquer checagem por status também barre).
   - Desativa os vínculos do usuário em `user_unit_links` (status inactive + deleted_at), reusando a lógica que o PATCH já tem, para o usuário não aparecer como "super admin ativo" nem em nenhuma fila.
   - Registra `updated_by` = quem excluiu.
   - NÃO toca no Supabase Auth (o registro auth fica, mas o login já é barrado pelo app_users). Decisão a confirmar: deixar o Auth intacto (recomendado) vs. também banir no Auth.

2. **Reversível?** Soft delete é reversível por natureza (basta limpar `deleted_at`). V1 não precisa de tela de "restaurar" — mas o dado fica recuperável via SQL se necessário. Confirmar se quer ação de restaurar agora (sugiro: não, fica para depois).

3. **Proteções (importantes):**
   - **Não deixar excluir o último super admin ativo.** Se o usuário a excluir for o único super admin com vínculo ativo, BLOQUEAR (senão o sistema fica sem admin e cai no setup — exatamente o pesadelo que vivemos). Esta checagem é obrigatória.
   - **Não deixar o usuário excluir a si mesmo** (evita auto-lockout). Confirmar.
   - Exigir confirmação explícita na UI (modal "tem certeza?").

## 3. Implementação proposta

1. **Backend — nova rota:** `DELETE /api/base/users/[id]` (ou `POST .../[id]/delete`). Recomendo
   `DELETE` no `[id]/route.ts` existente (semântica REST correta; o arquivo já existe com o PATCH).
   - Autorização: mesma do PATCH (`usersManage` + `isSuperAdmin`).
   - Checagem anti-lockout: se o alvo é o último super admin ativo → 409/422 com mensagem clara.
   - Checagem auto-exclusão: se `params.id` == usuário da sessão → bloquear.
   - Operação: `update app_users set deleted_at=now(), status='inactive', updated_by=<ator>` +
     desativar vínculos. Tratar como uma unidade (se uma parte falhar, não deixar inconsistente).
2. **Frontend:** botão "Excluir" na lista/edição de usuários, com modal de confirmação.
   Após sucesso, o usuário some da lista (GET já filtra). Mensagem de sucesso.

## 4. Restrições (NAO_ALTERAR)

- Não alterar login, auth_email, setup inicial, nem o fluxo de criação/edição além do necessário.
- Reusar helpers de sessão e padrão de autorização do arquivo.
- Soft delete, nunca hard delete. Não apagar linha de app_users nem do Auth.
- Sem libs novas.

## 5. Teste (staging primeiro)

1. Excluir um usuário de teste (NÃO o super admin) → some da lista; não loga mais.
2. Confirmar no banco: `deleted_at` preenchido, `status=inactive`, vínculos desativados.
3. Tentar excluir o último super admin ativo → BLOQUEADO com mensagem.
4. Tentar excluir a si mesmo → bloqueado.
5. Usuário sem permissão → 403.
6. Confirmar que o registro do Auth permanece (soft, não hard).

## 6. Critério de aceite

- Exclusão soft funciona pela interface; usuário some da lista e não loga.
- Proteções anti-lockout (último super admin, auto-exclusão) funcionando.
- Auth intacto; nada de hard delete.
- Autorização correta; nada quebra para quem já usa.
- Lint e build passam.

## 7. Decisões que preciso confirmar antes do código

1. Soft delete deixa o Auth intacto (recomendado) ou também bane no Auth?
2. Bloquear auto-exclusão (recomendado: sim)?
3. Ação de "restaurar" agora (sugiro: não, fica para depois)?

---

## 8. DECISÕES CONFIRMADAS por Wilson (não reabrir)

1. **Auth intacto:** soft delete marca deleted_at + status inactive no app_users e desativa
   vínculos. NÃO toca no Supabase Auth (não bane, não apaga). O login já barra pelo app_users.
2. **Bloquear auto-exclusão:** usuário não pode excluir a si mesmo.
3. **Sem ação de restaurar agora:** soft delete é reversível via SQL se necessário; tela de
   restaurar fica para evolução futura.
4. **Proteção anti-lockout (obrigatória):** não permitir excluir o último super admin ativo.
