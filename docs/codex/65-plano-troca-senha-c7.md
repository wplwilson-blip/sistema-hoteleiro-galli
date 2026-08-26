# 65 — Plano: troca da própria senha + troca forçada no 1º login (#C7)

**Área SENSÍVEL MÁXIMA** (Auth / `docs/NAO_ALTERAR.md`).
Branch: `security/password-self-change-and-rotation`. Dois commits: backend+migration, depois client.
Migration `085` **não é aplicada pelo Codex** — o Wilson aplica.

Decisões travadas (não reabertas neste plano): coluna dedicada (não jsonb); a troca exige a senha atual; o reset do admin re-arma a flag; o enforcement do 1º login é client-side; usuários existentes ficam com `false`; sem revogação de outras sessões.

---

## 1. O problema

Hoje não existe caminho para um usuário trocar a própria senha. A única rota de senha é [reset-password](../../src/app/api/base/users/[id]/reset-password/route.ts), que é **do admin sobre terceiros** (`requirePermission(usersManage)` + `isSuperAdmin`). Consequências:

- a senha que o admin digita no cadastro ([users/route.ts:229](../../src/lib/base-cadastros/schemas.ts#L229) — `password` no create) é conhecida por duas pessoas e **assim permanece para sempre**;
- o mesmo vale depois de um reset: o admin sabe a senha do usuário, indefinidamente;
- não há nada que force a troca, nem no primeiro acesso.

Isso quebra a premissa de que a senha identifica **uma** pessoa — o que, entre outras coisas, esvazia a segregação de função das fatias 50 e 62 (se o admin sabe a senha do aprovador, "quem aprovou" vira uma suposição).

---

## 2. Migration `085` (o Wilson aplica)

```sql
alter table public.app_users
  add column if not exists must_change_password boolean not null default false;
```

- **Idempotente** (`if not exists`).
- **Sem mudança de RLS**: a tabela `app_users` já existe com suas políticas; adicionar coluna não as altera.
- **`default false` preserva os usuários atuais**: ninguém é forçado a trocar retroativamente (decisão travada). A flag só nasce `true` para quem for criado ou tiver a senha resetada **depois** desta fatia.
- Comentário de coluna explicando que é flag de **controle de auth**, não de cadastro.
- Bloco de **rollback comentado** (`drop column`) no fim.

**Ordem de deploy — ponto de atenção real.** Diferente do rate limit (#4), esta fatia **não falha aberta**: se o código subir antes da migration, o `select` de `must_change_password` em `getSessionContextByAuthUserId` quebra, e `getSessionContextByAuthUserId` é o que sustenta **toda** sessão autenticada. O resultado seria ninguém conseguir usar o sistema.
**A migration tem de ser aplicada antes do merge.** Está dito no topo do arquivo `.sql` e repetido aqui porque é a única forma de errar feio nesta fatia.

---

## 3. Backend

### 3.1 A flag nasce `true` onde a senha é de terceiro

| Onde | O quê |
| --- | --- |
| `POST /api/base/users` ([insert em :283-292](../../src/app/api/base/users/route.ts#L283-L292)) | `must_change_password: true` — a senha que o admin define é temporária **por definição** |
| `POST /api/base/users/[id]/reset-password` ([após o updateUserById](../../src/app/api/base/users/[id]/reset-password/route.ts)) | `update app_users set must_change_password = true where id = <alvo>` — reset também é temporário |

No reset, o `update` vem **depois** do `updateUserById` dar certo: se a troca no Auth falhar, a flag não é armada — senão o usuário ficaria obrigado a trocar uma senha que não mudou.

### 3.2 Nova rota `POST /api/auth/change-password`

O ponto crítico desta fatia é **de quem** é a senha que a rota troca.

- **Sessão obrigatória, sem gate de permissão**: qualquer usuário logado troca a própria senha. Não é `requirePermission(usersManage)` — isso é gestão de terceiros.
- **O alvo vem da sessão, nunca do cliente.** `getCurrentSessionContext()` devolve o usuário; o `auth_user_id` é buscado a partir dele. **Não existe id no corpo nem na URL.** É o que impede a rota de virar um "trocar a senha de qualquer um": não há parâmetro para manipular.
- **Verifica a senha atual** com `signInWithPassword({ email: auth_email, password: currentPassword })` num **cliente próprio e descartável** — não o do fluxo de sessão, para não haver chance de mexer nos cookies da requisição em andamento. Falhou → `401 "Senha atual incorreta."`
- Só então `auth.admin.updateUserById(auth_user_id, { password: newPassword })` e `must_change_password = false`.

Por que exigir a senha atual mesmo com sessão válida: sem isso, um cookie roubado (ou uma máquina destravada) permite trocar a senha e **tomar a conta**, expulsando o dono. Com a senha atual, o roubo de sessão não escala para tomada de conta.

**Ordem obrigatória:** primeiro verificar a senha atual, depois trocar. E limpar a flag **depois** do `updateUserById` dar certo, pelo mesmo motivo do reset.

**Schema novo** (`base-cadastros/schemas.ts`): `currentPassword` e `newPassword`, ambos `min(8)`, com `superRefine` garantindo `newPassword !== currentPassword`. Erro no `path: ["newPassword"]`.

### 3.3 A flag no `SessionContext`

- `getSessionContextByAuthUserId` ([session.ts:243-248](../../src/lib/auth/session.ts#L243-L248)): somar `must_change_password` ao `select` de `app_users`.
- `SessionContext` ([types.ts](../../src/lib/auth/types.ts)): novo campo `mustChangePassword: boolean`.
- `getCurrentSessionContext` já delega para a função acima — **não muda**.

Nada mais em `session.ts` é tocado: a resolução de vínculos, de perfil, de unidades e de permissões fica exatamente como está.

---

## 4. Client

### 4.1 Tela de troca

Um componente único com três campos (senha atual, nova, confirmar nova), servindo aos **dois** caminhos:

- **voluntário** — item no cabeçalho, ao lado do "Sair" ([app-header.tsx](../../src/components/layout/app-header.tsx));
- **forçado** — renderizado no lugar do app quando a flag está `true`.

A confirmação ("repetir a nova senha") é validada **só no client**: é proteção contra erro de digitação, não regra de negócio — o servidor não precisa dela.

### 4.2 A trava do 1º login

`must_change_password` entra no store ([app-store.ts](../../src/store/app-store.ts)) via `setSessionContext`. Um componente cliente dentro do `AppProviders` ([app-providers.tsx](../../src/components/providers/app-providers.tsx)) lê a flag: se `true`, renderiza **apenas** a tela de troca, no lugar de `children` — sidebar, header e conteúdo não são montados.

Depois da troca bem-sucedida: `router.refresh()` para o layout ([(app)/layout.tsx](../../src/app/(app)/layout.tsx), server component, `force-dynamic`) recarregar o `SessionContext` já com a flag limpa, e o app aparecer.

A rota `/api/auth/change-password` continua alcançável nesse estado — ela não passa pelo gate, que é de renderização.

### 4.3 Limitação conhecida — e o que exatamente ela significa

**Este gate é client-side. Ele impede o uso do sistema, não o acesso aos dados.**

O que ele **não** cobre: um usuário com `must_change_password = true` que chame as rotas de API diretamente (curl, DevTools) continua sendo atendido normalmente — a sessão dele é válida e nenhuma rota checa a flag. Ou seja, **a trava é de experiência, não de segurança**.

Isso é aceitável para o problema real que a fatia resolve (a senha temporária do admin não fica valendo para sempre — quem entra pela tela é obrigado a trocar), e **não** é aceitável como controle contra um usuário mal-intencionado. Vira defesa de verdade quando o middleware do **#5** passar a barrar toda requisição autenticada de quem tem a flag armada — aí o gate client-side vira só a camada de UX sobre ele.

Registrado aqui e em comentário no código para não virar uma falsa sensação de proteção.

---

## 5. Testes

**Unitário** (`tests/unit/change-password-schema.spec.ts`, puro): o validador do payload — ambos `min(8)`; nova ≠ atual (com o erro em `newPassword`); ausência de campo; espaços. É o único pedaço puro desta fatia; o resto é I/O contra o Supabase Auth.

**Roteiro de validação em staging** (o que os unitários não alcançam) — rodar **após** aplicar a `085`:

1. **Usuário novo é forçado.** Admin cria usuário → login com a senha temporária → deve cair na tela de troca, **sem** sidebar nem conteúdo. Trocar → app aparece. Relogar → entra direto (flag limpa).
2. **Reset re-arma.** Admin reseta a senha de um usuário que já trocou → no próximo login ele é forçado de novo.
3. **Senha atual errada → 401.** Na tela de troca, digitar a atual errada → "Senha atual incorreta.", e a senha **não** muda (confirmar relogando com a antiga).
4. **Troca voluntária.** Usuário sem a flag usa o item do cabeçalho, troca, e o login seguinte só aceita a nova.
5. **A rota age só sobre o próprio usuário.** Logado como A, chamar `POST /api/auth/change-password` tentando forjar outro alvo — não há campo de id, então o teste é confirmar pelo banco que **só** o `app_user` de A teve `updated_at`/senha alterados. Verificar também que a rota **sem sessão** responde 401.
6. **Usuários existentes não foram afetados.** `select count(*) from app_users where must_change_password = true` logo após a migration → deve ser **0**.
7. **A limitação declarada é real** (documentar, não corrigir): com a flag `true`, uma chamada direta a uma rota de API autenticada ainda responde. É o que o #5 fecha.

Gates: `npm run lint`, `npm run build`, `npm run test:unit`.

---

## 6. O que NÃO muda

- O fluxo de `signInWithPassword` **do login** ([auth/login/route.ts](../../src/app/api/auth/login/route.ts)) e o rate limit do #4 — intocados. A verificação da senha atual na troca é uma chamada **separada**, em cliente próprio.
- Cookies e mecanismo de sessão; `loginSchema`; `getCurrentSessionContext` (só passa a carregar um campo a mais vindo da função que ele já chamava).
- `permissions.ts` e qualquer helper de permissão.
- **Sem revogação de outras sessões** (decisão travada): trocar a senha não derruba sessões abertas em outros dispositivos. Vale registrar a consequência — depois de uma troca motivada por suspeita de comprometimento, a sessão do invasor **continua válida** até expirar. Não é o caso de uso desta fatia (senha temporária do admin), mas é o que faltaria para ela servir como resposta a incidente.

---

## 7. Riscos

| Risco | Mitigação |
| --- | --- |
| Código antes da migration → `select` quebra → **ninguém loga** | Aplicar a `085` antes do merge (§2). É o risco mais grave da fatia |
| Flag armada sem a senha ter mudado | O `update` da flag vem sempre **depois** do sucesso no Auth (§3.1, §3.2) |
| Rota virar "trocar senha de terceiro" | O alvo vem da sessão; não existe id no corpo nem na URL (§3.2) |
| Cookie roubado → tomada de conta | Exigir a senha atual (§3.2) |
| Gate client-side ser lido como proteção | Declarado em §4.3 e em comentário no código; fecha no #5 |
