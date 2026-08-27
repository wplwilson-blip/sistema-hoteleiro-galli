# 67 — Plano: trava server-side de senha temporária (#5, fatia estreita)

**Área SENSÍVEL** (Auth — `docs/NAO_ALTERAR.md`).
Branch: `security/must-change-password-server-guard`, **cortado de `security/password-self-change-and-rotation`** (ver §0).
Sem migration. Sem `middleware.ts` — a trava vive no afunil que já existe.

---

## 0. Dependência que muda a ordem de merge

Esta fatia lê `session.mustChangePassword`, que **só existe no branch do C7** — ainda não mergeado, porque a migration `085` não foi aplicada. Então:

- o branch é cortado de `security/password-self-change-and-rotation`, não de `main` (senão não compila);
- **a ordem obrigatória é: migration 085 → merge do C7 → merge desta fatia.** Mergear esta antes do C7 quebra o build.

---

## 1. O que esta fatia fecha

O C7 entregou a tela de troca com um gate **de renderização**: com `mustChangePassword = true`, o app não é montado. Mas a sessão é válida e nenhuma rota checa a flag — quem chamar a API direto (curl, DevTools, barra de endereço) **continua sendo atendido**. É controle de experiência, não de segurança, e está declarado assim no C7.

Aqui isso vira trava de verdade: enquanto a senha temporária não for trocada, **as rotas de negócio respondem 403**.

---

## 2. O afunil pega mesmo todas as rotas? — medido

Censo dos **136** arquivos `route.ts` em `src/app/api`:

| Helper de auth | Rotas | Chega em `requireAuthenticatedRequest`? |
| --- | --- | --- |
| `requireHrPermission` | 75 | **sim** — chama `requirePermission` ([hr/api-auth.ts:167](../../src/lib/hr/api-auth.ts#L167)) |
| `requirePermission` | 29 | **sim** — chama direto ([permissions.ts:463](../../src/lib/auth/permissions.ts#L463)) |
| `requireHrWorkflowPermission` | 24 | **sim** — chama direto ([workflow-auth.ts:38](../../src/lib/hr/workflow-auth.ts#L38)) |
| `requireCronAuth` | 3 | não — e **não deve** (§4) |
| `getCurrentSessionContext` direto | 2 | não — `active-unit` e `change-password` (§3.2, §4) |
| sem helper de auth | 3 | não — `login`, `logout`, `setup/initial-admin` (§4) |

**128 das 136 rotas passam pelo afunil.** As 8 restantes são todas justificadas em §4 — nenhuma é rota de negócio.

### 2.1 Um furo real encontrado na medição

`requireHrWorkflowPermission` chama `requireAuthenticatedRequest()` mas **descarta o `response`**, ficando só com `{ session }` ([workflow-auth.ts:38](../../src/lib/hr/workflow-auth.ts#L38)). Se a sessão vier nula, ele devolve **o 401 dele** ("Sessao expirada. Entre novamente.").

Consequência se nada for feito: as 24 rotas de workflow de RH **ficam bloqueadas** (bom), mas respondendo **401 "Sessão expirada"** em vez de 403 "Troque sua senha temporária" (ruim). O usuário sairia, entraria de novo, e cairia no mesmo 401 — um laço sem explicação.

**Proposta:** `requireHrWorkflowPermission` passa a propagar o `response` quando ele existe, caindo no 401 próprio só quando não há. É uma linha, não muda o comportamento de nenhum caso atual (hoje `response` só é preenchido junto com `session: null`), e é o que faz a mensagem certa chegar.

Isto é um terceiro ponto de código além dos dois do briefing. Está aqui porque **não fazê-lo entrega a trava com uma mensagem que engana** — e mensagem que engana, num bloqueio de auth, custa chamado de suporte e faz o usuário achar que o sistema quebrou.

---

## 3. As mudanças

### 3.1 Predicado puro + a trava no afunil

`src/lib/auth/password-guard.ts` (novo):

```
export function isPasswordChangeRequired(session: { mustChangePassword?: boolean } | null | undefined): boolean
```

Puro, sem I/O, sem `server-only` — testável no runner puro. `null`/ausente → `false` (quem não tem sessão é problema do 401, não deste guard).

Em [`requireAuthenticatedRequest`](../../src/lib/base-cadastros/api-helpers.ts#L19-L28), logo após o check de `!session`:

```
if (isPasswordChangeRequired(session)) {
  return { session: null, response: apiError("Troque sua senha temporária antes de continuar.", 403) };
}
```

**`session: null` de propósito**, mesmo shape do 401: todos os chamadores já tratam `response || !session` como "pare aqui". Devolver a sessão junto abriria a chance de alguém usar o contexto ignorando o `response`.

### 3.2 `active-unit`

[`/api/auth/active-unit`](../../src/app/api/auth/active-unit/route.ts) usa `getCurrentSessionContext` direto — pula o afunil. Ganha a mesma checagem, **antes** de gravar o cookie de unidade.

Sem ela, um usuário travado ainda conseguiria trocar a unidade ativa — mudança de estado de sessão, pequena mas real, e sem motivo para ser permitida antes da troca.

---

## 4. O que fica FORA da trava, e por quê

| Rota(s) | Por quê |
| --- | --- |
| `POST /api/auth/change-password` | **É a saída.** Usa `getCurrentSessionContext` direto e continua assim de propósito — travá-la deixaria o usuário sem como destravar. É o ponto mais importante desta fatia |
| `POST /api/auth/logout` | Sair sempre tem de funcionar. Travar o logout prenderia a pessoa numa sessão que ela não pode usar |
| `POST /api/auth/login` | A flag só é conhecida **depois** do login; e é o login que a carrega para a sessão |
| 3 rotas de cron (`requireCronAuth`) | Não têm usuário — autenticam por segredo de serviço. Não há senha temporária a trocar |
| `POST /api/setup/initial-admin` | Bootstrap; roda antes de existir usuário |

Nenhuma dessas é rota de negócio: nenhuma lê ou escreve dado operacional em nome de um usuário travado.

---

## 5. Testes

**Unitário** (`tests/unit/password-guard.spec.ts`, puro): `isPasswordChangeRequired` — `true` → bloqueia; `false` → passa; campo ausente, `undefined`, `null` → passa; sessão completa realista nos dois estados.

**Só verificável em staging** (mesma limitação aceita no C7 — a ligação entre o predicado e o 403 real depende de sessão e banco):

1. Com um usuário de senha temporária logado, chamar uma rota de negócio direto pela barra de endereço — ex.: `GET /api/base/users` → deve vir **403 "Troque sua senha temporária antes de continuar."**, e **não** os dados.
2. Repetir com uma rota de RH (`requireHrPermission`) e uma de workflow (`requireHrWorkflowPermission`) → 403 com a **mesma** mensagem nas três famílias. A de workflow é a que valida a correção do §2.1.
3. `POST /api/auth/change-password` **ainda funciona** nesse estado — trocar a senha e confirmar que as rotas voltam a responder.
4. `POST /api/auth/logout` continua funcionando com a flag armada.
5. `POST /api/auth/active-unit` → 403, e o cookie de unidade **não** muda.
6. Usuário **sem** a flag: nada muda — as rotas respondem como antes (guarda contra regressão geral, que é o risco real de mexer no afunil).

Gates: `npm run lint`, `npm run build`, `npm run test:unit`.

---

## 6. Riscos

| Risco | Mitigação |
| --- | --- |
| Mexer no afunil quebra **todas** as rotas | A trava só dispara com a flag `true`; o passo 6 do roteiro verifica o caminho normal. `mustChangePassword` é `false` para todo usuário existente (default da 085) |
| Usuário travado sem como destravar | `change-password` e `logout` ficam fora (§4) — é o ponto a conferir primeiro na revisão |
| Mensagem enganosa nas rotas de workflow | Corrigido em §2.1 |
| Merge fora de ordem quebra o build | §0: migration 085 → C7 → esta fatia |

Sem migration, sem `middleware.ts`, sem mudança em `permissions.ts` além do que já vem por herança do afunil.
