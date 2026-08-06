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

### 1.3 Import **apenas como tipo** — não é dívida (correção)

> **Correção de uma versão anterior deste documento.** A primeira versão listou 22 rotas
> como "dívida a migrar", inferindo do resultado de `grep -l` que elas instanciavam o
> cliente. **Errado.** Abrindo os arquivos: **21 dos 22 usam o símbolo só como tipo**
> (`type SupabaseAdmin = ReturnType<typeof createSupabaseAdminClient>`) e **nunca chamam
> `createSupabaseAdminClient()`**. Elas já recebem o cliente escopado via
> `requirePermission(...).context.supabase` — ou seja, **já estão no padrão-alvo**.
>
> Isso invalida também o alarme que a versão anterior levantou sobre
> `src/lib/purchases/api.ts` ("candidato a um segundo #1"): o arquivo tem exatamente duas
> linhas com o símbolo, ambas de tipo. Não instancia nada, não fura gate nenhum.
> **Alarme descartado.** Compras terá fatia própria pelos achados #3 e #7, não por isto.

Verificado por varredura de chamada real (`createSupabaseAdminClient()` com parênteses),
não por presença do identificador:

| Módulo | Arquivos (todos tipo-only) |
|---|---|
| Admin | `admin/permissions/overrides/route.ts` |
| Anexos | `attachments/route.ts`, `attachments/[id]/route.ts` |
| Base | `base/departments/route.ts` + `[id]`, `base/employees/route.ts` + `[id]`, `base/job-positions/route.ts` + `[id]`, `base/suppliers/route.ts` + `[id]`, `base/users/[id]/route.ts` |
| Compras | `purchases/approvals/route.ts`, `purchases/approvals/[requestId]/resubmit/route.ts`, `purchases/documentation-dashboard/route.ts`, `purchases/quotes/route.ts`, `purchases/requests/route.ts`, `purchases/requests/[id]/route.ts`, `purchases/requests/[id]/quotes/route.ts`, `purchases/requests/[id]/quotes/[quoteId]/route.ts`, `purchases/requests/[id]/quotes/[quoteId]/negotiations/route.ts` |
| Lib Compras | `src/lib/purchases/api.ts` |

### 1.4 Dívida real (**fora da allowlist**)

| Arquivo | Evidência |
|---|---|
| `src/app/api/base/users/route.ts` | `:9` usa como tipo **e** `:312` chama `createSupabaseAdminClient()` |

**Uma rota.** Toda a "dívida" de 22 arquivos era ruído de `grep -l`.

**Nenhum arquivo de RH** aparece aqui: o módulo já recebe o cliente pelo `context` do
`requireHrPermission`. Somando 1.3 + RH, o padrão-alvo é o padrão **majoritário** do repo —
a regra formaliza o que já é prática, em vez de propor uma migração larga.

---

## 2. A regra proposta

`.eslintrc.json` hoje é só `{ "extends": ["next/core-web-vitals"] }`.

O achado de §1.3 muda o desenho da regra: **21 arquivos importam o símbolo como valor
(`import { createSupabaseAdminClient }`) mas o usam apenas em posição de tipo.** O
`no-restricted-imports` base **não distingue** isso — ele veria 21 violações legítimas em
código que já está correto.

Duas saídas, e a primeira é melhor:

**2.1 (recomendada) — converter os 21 para `import type` + regra com `allowTypeImports`.**

A conversão é mecânica, sem efeito em runtime (o import de tipo é apagado na compilação) e
deixa o código mais honesto: o arquivo declara que só quer o *tipo*, não a fábrica.

```jsonc
// .eslintrc.json (PROPOSTA — não aplicada)
{
  "extends": ["next/core-web-vitals"],
  "rules": {
    "@typescript-eslint/no-restricted-imports": ["error", {
      "paths": [{
        "name": "@/lib/supabase/admin",
        "importNames": ["createSupabaseAdminClient"],
        "allowTypeImports": true,
        "message":
          "Cliente service_role ignora RLS. Use o `context.supabase` devolvido por requirePermission/requireHrPermission. Instanciacao direta e' restrita ao nucleo de auth/permissao e aos efetivadores de cron (ver docs/codex/57). Para o tipo, use `import type`."
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
      "src/lib/hr/apply-due-*.ts",
      // DIVIDA (§1.4) — remover quando a rota passar a usar context.supabase:
      "src/app/api/base/users/route.ts"
    ],
    "rules": { "@typescript-eslint/no-restricted-imports": "off" }
  }]
}
```

**2.2 (alternativa) — `no-restricted-imports` base + os 21 na allowlist.**
Não mexe em nenhum arquivo de código, mas infla a allowlist com 21 entradas que **não são
dívida**, tornando-a mentirosa: ela passaria a dizer "estes furam o padrão" sobre arquivos
que já o seguem. Descarto.

**A verificar ao implementar:** `eslint-config-next` registra o plugin `@typescript-eslint`,
então `@typescript-eslint/no-restricted-imports` deve estar disponível sem dependência
nova — mas isso precisa ser confirmado rodando, não assumido. Se não estiver, a fatia
adiciona `@typescript-eslint/eslint-plugin` como devDependency.

### Limitações honestas
- `no-restricted-imports` **não** pega `await import("@/lib/supabase/admin")` dinâmico nem
  import por caminho relativo (`../../lib/supabase/admin`). Fechar isso exige
  `eslint-plugin-import` (`import/no-restricted-paths`) ou regra custom. Para o uso atual
  do repo (todos os imports pelo alias `@/`), a regra cobre o caso real.
- Ela impede **importar**, não impede mau uso de um cliente já recebido. **Não substitui os
  asserts de escopo** — o #1 aconteceu dentro de um arquivo que legitimamente tinha o
  cliente.

---

## 3. Estratégia de adoção — **Opção B aprovada**

`"error"` desde já, com a allowlist como dívida explícita.

O achado de §1.3/§1.4 torna a Opção B muito mais barata do que a versão anterior deste
documento sugeria: a dívida não são 22 arquivos, é **um** (`base/users/route.ts`). A
allowlist nasce curta e honesta, e some inteira quando essa rota migrar.

**Escopo da fatia própria** (separada da #1, conforme decidido):
1. converter os 21 imports de §1.3 para `import type` (mecânico, sem efeito em runtime);
2. adicionar a regra em `.eslintrc.json` com `allowTypeImports: true`;
3. `base/users/route.ts` na allowlist, com comentário de dívida;
4. `npm run lint` / `build` / `test:unit` verdes.

Sem teste unitário novo: a regra é verificada pelo próprio `npm run lint`.

**Fatia seguinte, opcional:** migrar `base/users/route.ts:312` para `context.supabase` e
esvaziar a allowlist de dívida. Requer conferir qual gate a rota usa — não está no escopo
desta proposta.

---

## 4. Estado das decisões

| Item | Decisão |
|---|---|
| Opção A ou B | **B**, aprovada |
| Fatia própria, separada da #1 | **sim**, aprovada |
| Alarme sobre `src/lib/purchases/api.ts` | **descartado** — tipo-only, verificado (§1.3) |
| Allowlist do núcleo (§1.1) e de cron (§1.2) | pendente de conferência sua |

**Nada foi ativado.** `.eslintrc.json` não foi tocado.
