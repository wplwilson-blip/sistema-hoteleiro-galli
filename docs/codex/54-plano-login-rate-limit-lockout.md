# Plano — #4: login sem rate limit/lockout + enumeração de usuários

**Área SENSÍVEL MÁXIMA** (Auth / login / Supabase Auth — `docs/NAO_ALTERAR.md`). Só plano.
Branch previsto: `security/login-rate-limit-uniform-response`.

---

## 0. Evidência reconferida

`src/app/api/auth/login/route.ts` (124 linhas, lido inteiro):

- **Sem rate limit, sem contador, sem backoff, sem lockout.** Nenhuma leitura de tentativas
  anteriores em lugar nenhum do handler.
- `:41-56` — busca `app_users` por `username`. Se não existe (ou `status != 'active'`),
  retorna 401 **sem nunca chamar `signInWithPassword`**. Confirmado: **oráculo de timing**.
  O caminho do usuário inexistente custa 1 query; o do usuário existente custa 1 query +
  1 round-trip de bcrypt no Supabase Auth. A diferença é de ordens de grandeza e mensurável
  do cliente.
- `:58-75` — usuário existente **sem vínculo ativo** retorna **403 com mensagem distinta**
  ("Acesso bloqueado. Procure o administrador do sistema."), também **antes** de verificar a
  senha. Confirmado: **oráculo explícito** — o atacante distingue "usuário não existe" (401)
  de "usuário existe mas está sem vínculo" (403) **sem saber a senha**.
- `:96-99` — sessão sem perfil retorna 403 com terceira mensagem, mas aí já houve
  autenticação bem-sucedida; não é oráculo.
- `:14-34` — `writeAuthLog` grava em `system_logs`. **Já existe** trilha de tentativa com
  `action`, `context.username` e `created_at` implícito.

Nota: o 403 de `:74` é, na prática, **pior** que o de timing — não exige medição.

---

## 1. As duas correções são independentes. Recomendo separá-las.

**Fatia 1 — resposta uniforme (barata, sem infraestrutura).**
**Fatia 2 — rate limit / lockout (exige decidir onde mora o estado).**

Entrego os dois planos aqui; implemento em branches separados.

---

## 2. Fatia 1 — resposta uniforme

### Diff conceitual

Reordenar o handler para que **todo caminho de falha custe o mesmo e responda o mesmo**:

```
1. valida payload (422 — inalterado, não é oráculo: erro de formato)
2. busca app_users por username
3. SEMPRE chama signInWithPassword:
     - usuário existe   -> email real
     - usuário não existe -> email sentinela inexistente (custo de bcrypt equivalente)
4. verifica vínculo ativo APÓS a senha conferir
5. qualquer falha em 2/3/4 -> MESMA resposta: 401, invalidLoginMessage
```

- O passo 3 com email sentinela iguala o custo. **Alternativa mais robusta:** manter a
  ordem atual mas aplicar um *padding* de tempo — medir o tempo decorrido e dormir até um
  piso fixo (ex.: 400ms) em **todos** os caminhos de falha. É mais previsível que confiar
  no custo do sentinela, e não gera tráfego extra no Supabase Auth. **Recomendo o padding.**
- O passo 4 move a checagem de vínculo para **depois** da senha. Quem tem a senha certa mas
  não tem vínculo continua vendo a mensagem informativa (403) — isso é legítimo e útil, e
  não vaza nada, porque já provou ser o dono da conta.
- Os logs em `system_logs` **continuam distinguindo** os casos (`auth.login.failed` vs
  `auth.login.failed_no_unit`). A uniformidade é para o *cliente*, não para a trilha.

### Casos de borda

1. Usuário inexistente → 401 uniforme, tempo ≥ piso.
2. Usuário inativo (`status != 'active'`) → 401 uniforme (hoje já é 401, mas antes da senha).
3. Usuário válido, senha errada → 401 uniforme.
4. Usuário válido, senha certa, sem vínculo → 403 informativo. **Mudança:** hoje é 403
   *sem* senha; passa a exigir a senha.
5. Usuário válido, senha certa, com vínculo → sucesso, inalterado.
6. Supabase Auth fora do ar → 500, não 401 (não confundir indisponibilidade com credencial
   inválida).

**Impacto de UX a confirmar com você:** um usuário legítimo recém-desvinculado hoje recebe
"Procure o administrador" imediatamente; passará a recebê-la só se digitar a senha certa.
Se errar a senha, verá "Usuario ou senha invalidos". Julgo aceitável e correto.

---

## 3. Fatia 2 — rate limit / lockout: **onde mora o estado**

O achado levanta o ponto certo: **serverless, sem memória entre requests**. Um `Map` em
módulo não funciona (cada instância tem o seu, instâncias somem, e o atacante só precisa
que os pedidos caiam em instâncias diferentes). Descarto de saída.

### Opção A — tabela no Postgres (recomendada)

Estado em `auth_login_attempts` (tabela nova, migration que **você** aplica):
`id, username, ip, succeeded, created_at`, com índices em `(username, created_at)` e
`(ip, created_at)`.

Fluxo: antes de autenticar, contar tentativas falhas na janela (ex.: 15 min) por `username`
**e** por `ip`; acima do limiar, responder 429 com `Retry-After` sem tocar no Supabase Auth.
Após cada tentativa, inserir a linha.

- **A favor:** já temos Postgres e já escrevemos em `system_logs` no mesmo handler — custo
  marginal de ~2 queries. Estado durável e compartilhado entre instâncias. Auditável. Zero
  serviço novo, zero custo, zero vendor.
- **Contra:** ~2 queries a mais por login (irrelevante no volume de um hotel). Precisa de
  expurgo (um `delete` por retenção, ou a rotina de cron que já existe).
- **Poderíamos usar `system_logs` direto?** Ela já tem `action` e `context.username`. Mas
  contar por `context->>'username'` em JSONB sem índice apropriado é frágil, e misturar
  trilha com controle de acesso acopla duas coisas de ciclo de vida diferente. **Tabela
  dedicada.**

### Opção B — Upstash Redis / Vercel KV

- **A favor:** feito para isto; TTL nativo, sem expurgo; latência baixa; contadores atômicos.
- **Contra:** serviço externo novo, credencial nova, custo, e uma dependência de
  disponibilidade **no caminho do login** — se o Redis cai, ou o login trava ou o rate limit
  vira no-op (fail-open). Desproporcional para a escala atual.

### Recomendação: **Opção A.**
Adequada à escala, sem dependência nova, auditável, e o custo real (2 queries) é
desprezível perto do bcrypt que já roda.

### Parâmetros a definir com você
- Janela e limiar por `username` (sugestão: 10 falhas / 15 min → 429).
- Janela e limiar por `ip` (sugestão: 30 falhas / 15 min → 429) — protege contra
  *password spraying*, que o limite por usuário não pega.
- **Lockout duro** (conta trancada até intervenção do admin) ou **apenas backoff**?
  Recomendo **backoff / 429 temporário**, não lockout duro: lockout duro é um vetor de DoS
  contra usuários legítimos (basta o atacante errar a senha 10 vezes no seu usuário).
- Retenção das linhas (sugestão: 30 dias).
- Origem do IP: em Vercel, `x-forwarded-for` — **a confirmar**, e nunca confiar num header
  arbitrário sem saber que o proxy o reescreve.

### Casos de borda
1. **NAT corporativo** — todo o hotel sai por um IP. O limiar por IP precisa ser folgado o
   bastante, senão trava a recepção inteira. Argumento adicional para o limiar por
   `username` ser o principal.
2. **Login bem-sucedido** deve **zerar** (ou ignorar) o contador do `username`.
3. **Corrida** — duas tentativas simultâneas podem ambas passar pela contagem. Aceitável:
   o objetivo é frear milhares, não garantir exatidão de ±1.
4. **Falha ao escrever a tentativa** → **fail-open** (permite o login) e loga erro. Um bug
   no rate limit não pode derrubar o login do hotel. Registrado como decisão consciente.
5. **429 não deve vazar** se o username existe — mensagem genérica de "muitas tentativas".

---

## 4. Entregáveis

| Fatia | Arquivos |
|---|---|
| 1 | `src/app/api/auth/login/route.ts` (reordenação + padding) + teste |
| 2 | `supabase/migrations/0NN_auth_login_attempts.sql` (**você aplica**), `src/lib/auth/login-rate-limit.ts` (novo), `route.ts` (2 chamadas), teste |

---

## 5. Teste

Predicados puros, testáveis em `tests/unit/` sem rede:
- `shouldThrottle({ failuresByUser, failuresByIp, limits })` — tabela-verdade.
- `resolveLoginFailureResponse(reason)` — assert de que **todos** os motivos de falha
  pré-senha produzem status 401 e a **mesma** string. Este falha no código atual (o caminho
  sem vínculo produz 403 com outra string).

---

## 6. Critério de aceite

- [ ] lint / build / test:unit passam.
- [ ] Teste de uniformidade falha sem o fix.
- [ ] `.sql` entregue, **não aplicado**.
- [ ] Login legítimo continua funcionando (roteiro manual em staging, combinado com você).
- [ ] Rate limit falha **aberto**, nunca fechado.

---

## 7. O que NÃO muda

- `signInWithPassword` e o fluxo do Supabase Auth — **nenhuma** mudança em como a senha é
  verificada, nem em cookies/sessão.
- `getSessionContextByAuthUserId` (`src/lib/auth/session.ts`) — não tocado.
- `loginSchema` — não tocado.
- `writeAuthLog` e o formato de `system_logs` — preservados; a trilha continua
  distinguindo os motivos.
- Mensagem de sucesso e payload `{ ok, user: sessionContext }` — inalterados.
- Nenhuma mudança em `permissions.ts` ou em qualquer helper de permissão.

---

## 8. Bloqueio explícito

Esta é a área mais sensível do sistema. **Não escrevo uma linha aqui sem seu OK item a
item** — especialmente sobre: padding vs sentinela, backoff vs lockout duro, e os limiares.
