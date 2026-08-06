# Plano — #8: zero observabilidade; falhas de cron silenciosas

**NÃO sensível** por `docs/NAO_ALTERAR.md`, mas **exige decisão de produto sua** antes de
qualquer código. Este documento apresenta opções; nada é implementado.
Branch previsto: `chore/observability-sink-e-alerta-cron`.

---

## 0. Evidência reconferida

- **Logging estruturado: inexistente.** Há exatamente **4** chamadas de `console.*` em todo
  `src/`:
  - `src/lib/base-cadastros/api-helpers.ts:11-17` (`logBaseCadastroError`) — a única de uso
    geral; todos os módulos (HR, Compras, Admin) desembocam nela.
  - `src/lib/auth/session.ts:34`
  - `src/app/api/setup/initial-admin/route.ts:34` e `:63`
  Confirmado: **um único ponto de saída real** para erros de aplicação.
- **APM: nenhum.** `package.json` não tem sentry, logtail, pino, winston nem
  opentelemetry. Confirmado por grep.
- **`vercel.json`: não existe.**
- **Cron:** a auditoria cita "efetivadores `apply-due-*`". O que existe de fato:
  - `src/app/api/hr/apply-due/route.ts`
  - `src/app/api/hr/movements/apply-due/route.ts`
  - `src/app/api/cron/run-jobs/route.ts` — o **runner da fila**, protegido por `CRON_SECRET`
    (`requireCronAuth`), **disparado pelo GitHub Actions (`hr-cron.yml`)**, não pelo cron da
    Vercel.
  - No `catch` (`route.ts` do runner), a falha vira `logHrApiError("run_jobs.run_failed")` →
    `console.error` → **e nada mais**. Resposta 500 para o GitHub Actions.

**Divergência a registrar:** a auditoria diz "rodam por cron sem alerta". Correto quanto ao
alerta, mas o disparo é **GitHub Actions**, não cron da Vercel — e isso muda a recomendação,
porque o GitHub Actions **já tem notificação nativa de workflow falho**.

---

## 1. A observação central

Há **duas** falhas distintas aqui, e a segunda é quase de graça:

1. **Sem sink de logs**: `console.error` na Vercel vai para os logs de função, com retenção
   curta, sem busca decente, sem alerta. Um 500 recorrente é invisível.
2. **Falha de cron silenciosa**: parcialmente **já resolvível sem código nenhum** —
   `hr-cron.yml` falhando gera notificação do GitHub para os watchers do repositório, se
   estiver configurado. **Verificar isso é o primeiro passo, antes de comprar solução.**

Não vou propor infraestrutura para um problema que uma configuração de repositório resolve.

---

## 2. Opções de sink (escolha sua)

### Opção A — Sentry (`@sentry/nextjs`)
- **A favor:** integração de uma linha com Next.js App Router; captura erros não tratados
  de rotas e de client sem instrumentação manual; agrupa por *fingerprint* (um erro
  recorrente é 1 issue, não 10.000 linhas); alerta por e-mail/Slack nativo; plano gratuito
  cobre folgadamente o volume de um hotel.
- **Contra:** SDK relativamente pesado; exige cuidado com **PII** — o sistema tem dados de
  RH (CPF em `document_number`, e-mail pessoal, salários). Precisa de `beforeSend` com
  redação, e `sendDefaultPii: false`. Isso não é opcional, é LGPD.
- **Encaixe:** `logBaseCadastroError` vira o ponto único de captura — **uma função, 4
  call-sites**. A integração é genuinamente pequena.

### Opção B — Logtail / Better Stack (ou Axiom)
- **A favor:** é *log sink*, não APM — mais simples de raciocinar; ingestão por HTTP;
  retenção e busca boas; alerta por consulta salva ("mais de N erros com stage
  `run_jobs.*` em 10 min").
- **Contra:** sem agrupamento de erro nem stack trace estruturado de graça; você constrói
  os alertas; sem captura automática de exceção não tratada.

### Recomendação
**Opção A (Sentry) para erros + o alerta de cron da §3.** Motivo: o problema real do
sistema não é "falta de logs" — é que **ninguém é avisado**. Sentry entrega o aviso com o
agrupamento certo e sem eu escrever regra de alerta. A Opção B é a escolha certa se o seu
incômodo for auditoria/retenção de log, não alerta.

**Ponto que preciso que você decida:** enviar dados de erro de um sistema com dados de RH
para um SaaS terceiro é uma decisão de tratamento de dados pessoais. Com `beforeSend`
redigindo e `sendDefaultPii: false`, o payload fica em mensagem + stack + stage. **Se você
não quiser nenhum terceiro**, a alternativa é gravar em uma tabela `system_logs` que **já
existe** e construir uma tela de erros — mais trabalho, zero terceiros. Diga qual caminho.

---

## 3. Alerta de falha de cron (independente do sink)

Ordem de implementação, do mais barato ao mais caro:

1. **Verificar `hr-cron.yml`** (Fase B, primeiro passo): o workflow falha de verdade quando
   o runner devolve 500? As notificações do repositório estão ativas? Se sim, **metade do
   achado já está coberto** e a correção é de configuração.
2. **Assert no próprio workflow:** fazer o step checar o corpo da resposta
   (`ok: true` + contadores) e falhar se houver `failed > 0` — hoje um 200 com jobs falhos
   passa como sucesso. Isto é uma mudança em `.github/workflows/hr-cron.yml`, não em `src/`.
3. **Heartbeat / dead-man's switch** (cobre o caso que 1 e 2 **não** cobrem: o workflow não
   rodar de jeito nenhum). Um serviço de *cron monitoring* (Better Stack, Healthchecks.io)
   que alerta quando o ping **não** chega. Este é o ponto cego real de cron — falha por
   ausência, não por erro.
4. **Alerta pelo sink**, se a Opção A/B for adotada: regra sobre o stage `run_jobs.*`.

**Recomendação: 1 + 2 imediatamente (baratos, sem dependência), 3 se você quiser cobertura
de "não rodou".**

---

## 4. Escopo mínimo que eu implementaria (após seu OK)

| Passo | Arquivo | Natureza |
|---|---|---|
| 1 | `.github/workflows/hr-cron.yml` | assert de `failed === 0` + notificação |
| 2 | `src/lib/base-cadastros/api-helpers.ts:11-17` | `logBaseCadastroError` passa a emitir para o sink **além** do `console.error` |
| 3 | `src/lib/observability/*` (novo) | wrapper do sink + `beforeSend` de redação |
| 4 | `sentry.*.config.ts` / env vars | configuração |

**Sem tocar em nenhuma rota.** O ponto único de saída (`logBaseCadastroError`) é a razão de
isto ser barato — e é também o argumento para que os outros 3 `console.error` avulsos
passem por ele.

---

## 5. Casos de borda

1. **Sink fora do ar** → o envio deve ser *fire-and-forget* com timeout. Observabilidade
   **nunca** pode derrubar uma requisição. `logBaseCadastroError` é chamada em caminhos de
   erro; um `await` que trava ali agrava o incidente.
2. **PII** → `beforeSend` obrigatório. Nenhum objeto de erro do Postgrest deve ir cru: eles
   podem conter valores de coluna em mensagens de constraint (ex.: `document_number` num
   erro de unicidade). **Este é o risco concreto, não teórico.**
3. **Volume/custo** → agrupamento do Sentry cobre; um erro em laço não vira 100k eventos.
4. **Ambiente local/dev** → sink desativado sem `DSN`; `console.error` permanece sempre.
5. **Achado #5** → o stage novo `permission_code_not_found` (doc 48) é exatamente o tipo de
   evento que só tem valor **com** este achado resolvido. Os dois se reforçam.

---

## 6. Critério de aceite (quando implementado)

- [ ] lint / build / test:unit passam.
- [ ] Teste unitário do `beforeSend`: um erro contendo CPF/e-mail sai redigido.
- [ ] Falha induzida no cron gera notificação verificável (teste manual, com você).
- [ ] `logBaseCadastroError` nunca lança e nunca bloqueia (teste com sink que rejeita).
- [ ] Nenhuma rota de API alterada.

---

## 7. O que NÃO muda

- Nenhuma rota, nenhum helper de permissão, nenhuma migration.
- `console.error` **permanece** (o sink é adicional, não substituto).
- Assinatura de `logBaseCadastroError` e de `logHrApiError` — inalteradas.
- `requireCronAuth` / `CRON_SECRET` — não tocados.

---

## 8. O que preciso de você

1. Sink: **Sentry**, **Logtail/Axiom**, ou **nenhum terceiro** (tela sobre `system_logs`)?
2. Autoriza envio de payload de erro redigido a um SaaS terceiro (LGPD)?
3. Alerta de cron: só GitHub Actions (passos 1-2), ou também *dead-man's switch* (passo 3)?
