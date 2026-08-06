# Proposta — regra de ESLint com allowlist para `createSupabaseAdminClient`

**LEVANTAMENTO E PROPOSTA. A REGRA NÃO ESTÁ ATIVADA.** Ativá-la hoje quebraria
`npm run lint` nos 28 arquivos de rota que já a usam. Este documento entrega a lista real e
o desenho da regra, para você revisar e decidir a estratégia de adoção.

Relacionado: [56](56-plano-isolamento-saas.md) (#2, isolamento SaaS) — esta regra é o passo
1 da Opção 3 recomendada lá.

---

## 0. Por que isto existe

`src/lib/supabase/admin.ts` devolve um cliente com a **service_role key**, que ignora RLS.
Todo arquivo que o importa tem acesso irrestrito ao banco, e a única barreira de isolamento
passa a ser o filtro `.in("unit_id", accessibleUnitIds)` ou o assert de escopo que o autor
daquele arquivo lembrou de escrever.

O achado #1 (corrigido nesta fatia) é a prova: **um** loader sem assert bastou para
permitir escrita cruzada entre unidades. Não houve segunda linha de defesa porque não
existe. A regra de ESLint não cria a segunda linha — ela impede que a **terceira** rota
esquecida apareça sem que ninguém perceba no review.

---

## 1. Levantamento completo (36 arquivos, verificado por grep)

### 1.1 Núcleo — auth, sessão e permissão (**allowlist proposta**)

| Arquivo | Por que precisa |
|---|---|
| `src/lib/supabase/admin.ts` | é a própria fábrica |
| `src/lib/auth/session.ts` | resolve a sessão antes de existir escopo |
| `src/lib/auth/permissions.ts` | resolve o escopo; não pode depender dele |
| `src/lib/base-cadastros/api-helpers.ts` | `SupabaseAdmin`, `requireAuthenticatedRequest` |
| `src/lib/hr/workflow-auth.ts` | gate de workflow, mesmo papel |
| `src/app/api/auth/login/route.ts` | pré-sessão por definição |
| `src/app/api/auth/active-unit/route.ts` | troca de unidade ativa |
| `src/app/api/setup/initial-admin/route.ts` | bootstrap: não há usuário ainda |

### 1.2 Efetivadores de cron (**allowlist proposta**)

Sem sessão de usuário por construção; protegidos por `CRON_SECRET` (`requireCronAuth`).

| Arquivo |
|---|
| `src/app/api/cron/run-jobs/route.ts` |
| `src/app/api/hr/apply-due/route.ts` |
| `src/app/api/hr/movements/apply-due/route.ts` |
| `src/lib/hr/apply-due-movements.ts` |
| `src/lib/hr/apply-due-terminations.ts` |

### 1.3 Rotas de negócio (**fora da allowlist — dívida a migrar**)

Estas 22 deveriam receber o cliente já escopado via `requirePermission(...).context.supabase`
em vez de instanciá-lo. Muitas **já** usam `requirePermission`; a chamada direta é
redundante ou legado.

| Módulo | Arquivos |
|---|---|
| Admin | `admin/permissions/overrides/route.ts` |
| Anexos | `attachments/route.ts`, `attachments/[id]/route.ts` |
| Base | `base/departments/route.ts` + `[id]`, `base/employees/route.ts` + `[id]`, `base/job-positions/route.ts` + `[id]`, `base/suppliers/route.ts` + `[id]`, `base/users/route.ts` + `[id]` |
| Compras | `purchases/approvals/route.ts`, `purchases/approvals/[requestId]/resubmit/route.ts`, `purchases/documentation-dashboard/route.ts`, `purchases/quotes/route.ts`, `purchases/requests/route.ts`, `purchases/requests/[id]/route.ts`, `purchases/requests/[id]/quotes/route.ts`, `purchases/requests/[id]/quotes/[quoteId]/route.ts`, `purchases/requests/[id]/quotes/[quoteId]/negotiations/route.ts` |
| Lib Compras | `src/lib/purchases/api.ts` |

**Observação:** `src/lib/purchases/api.ts` é lib, não rota. Se ele instancia o cliente por
conta própria, todas as rotas de Compras herdam service_role independentemente do gate —
vale investigar em fatia própria (é o mesmo padrão que produziu o #1).

**Nenhum arquivo de RH** aparece em 1.3: o módulo HR já recebe o cliente pelo `context` do
`requireHrPermission`. É a prova de que o padrão-alvo é viável — HR já está lá.

---

## 2. A regra proposta

Sem plugin novo: `no-restricted-imports` do ESLint base, com `overrides` invertendo a
proibição para a allowlist.

```jsonc
// .eslintrc.json (PROPOSTA — não aplicada)
{
  "rules": {
    "no-restricted-imports": ["error", {
      "paths": [{
        "name": "@/lib/supabase/admin",
        "importNames": ["createSupabaseAdminClient"],
        "message":
          "Cliente service_role ignora RLS. Use o `context.supabase` devolvido por requirePermission/requireHrPermission. Uso direto e' restrito ao nucleo de auth/permissao e aos efetivadores de cron (ver docs/codex/57)."
      }]
    }]
  },
  "overrides": [{
    "files": [
      "src/lib/supabase/admin.ts",
      "src/lib/auth/session.ts",
      "src/lib/auth/permissions.ts",
      "src/lib/base-cadastros/api-helpers.ts",
      "src/lib/hr/workflow-auth.ts",
      "src/app/api/auth/**",
      "src/app/api/setup/**",
      "src/app/api/cron/**",
      "src/app/api/hr/apply-due/route.ts",
      "src/app/api/hr/movements/apply-due/route.ts",
      "src/lib/hr/apply-due-*.ts"
    ],
    "rules": { "no-restricted-imports": "off" }
  }]
}
```

### Limitações honestas
- `no-restricted-imports` **não** pega `await import("@/lib/supabase/admin")` dinâmico nem
  import por caminho relativo (`../../lib/supabase/admin`). Fechar isso exige
  `eslint-plugin-import` (`import/no-restricted-paths`) ou uma regra custom. Para o uso
  atual do repo (todos os imports são pelo alias `@/`), a regra base cobre o caso real.
- Ela impede **importar**, não impede mau uso de um cliente já recebido. Não substitui os
  asserts de escopo.

---

## 3. Estratégia de adoção (escolha sua)

**Opção A — `"warn"` agora, `"error"` depois.**
Ativa já, sem quebrar o lint; cada arquivo em 1.3 vira um aviso visível. Migra-se por
módulo e promove-se a `error` quando a lista zerar.
*Contra:* aviso que ninguém corrige vira ruído e some da percepção.

**Opção B — `"error"` já, com os 22 arquivos de 1.3 na allowlist como dívida explícita,
listados um a um.**
O lint continua verde. **Arquivo novo já nasce bloqueado** — que é exatamente o objetivo.
Cada migração remove uma linha da allowlist, e a lista encolhendo é a métrica de progresso.
*Contra:* a allowlist fica grande e feia — o que é uma virtude, porque a feiura é visível.

**Recomendo a Opção B.** Ela entrega hoje o único benefício que importa (impedir o
**próximo** caso) sem exigir a migração das 22 antes de qualquer proteção existir. A Opção A
protege o novo apenas se alguém ler o aviso.

---

## 4. O que preciso de você

1. Opção A ou B?
2. A allowlist do núcleo (§1.1) e de cron (§1.2) está correta, ou algum arquivo dela deveria
   sair / entrar?
3. Investigo `src/lib/purchases/api.ts` (§1.3) em fatia própria? É o candidato mais
   provável a um segundo #1.

**Nada foi ativado.** `.eslintrc.json` não foi tocado nesta fatia.
