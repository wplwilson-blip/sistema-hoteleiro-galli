# Prompt 1b — Plano: Alçada de aprovação de compras

> **Status:** plano revisado contra o código real (clone do repo). Nenhum código nesta etapa.
> **Branch:** `prompt-1b-alcada-aprovacao`.
> **Área sensível:** mexe na regra de alçada (`NAO_ALTERAR.md`). Plano → revisão → código.
> **Desenho escolhido:** B2 (duas permissões explícitas) + cascata para baixo + SUPER_ADMIN decide tudo + revogação limpa do grant antigo.

---

## 1. Objetivo

1. Habilitar a **Gerência Administrativa** (perfil `DEPARTMENT_MANAGER`) a decidir a alçada
   administrativa (≤ R$200,00). Hoje esse nível está restrito a `SUPER_ADMIN`.
2. Reconhecer `UNIT_DIRECTOR` **e** `NETWORK_MANAGER` como autoridade de Diretoria
   (`general_directorate`), escopados por unidade. Hoje a função só reconhece `UNIT_DIRECTOR`.
3. Migrar a função de alçada do padrão hardcoded (nome de perfil) para o padrão-ouro
   por permissão (`src/lib/hr/api-auth.ts` + `src/lib/auth/permissions.ts`).

Fora de escopo: fornecedor corporativo, cadastro de colaborador, Prompts 2–6. Não tocar
em Auth, login, RLS, snapshot, triggers.

---

## 2. Achados da revisão do código real

- **Enum de níveis** (`src/lib/purchases/api.ts:63`): `PurchaseApprovalLevel =
  "administrative_management" | "general_directorate"`. O nível administrativo chama-se
  `administrative_management` (NÃO `administrative`).
- **Fronteira de R$200** (`getPurchaseApprovalLevel`, api.ts:117-118): `> 200` →
  `general_directorate`; caso contrário `administrative_management`. Logo R$200,00 exatos
  = `administrative_management` (Gerência Administrativa). Fronteira já correta; não tocar.
- **Função-alvo** (`src/lib/purchases/approval-authorization.ts`): hoje compara nome de
  perfil hardcoded — `DIRECTORATE_PROFILE_CODES = ["UNIT_DIRECTOR"]` e
  `SUPER_ADMIN_PROFILE_CODE`. Está FORA do padrão-ouro. O ramo administrativo só deixa
  passar `SUPER_ADMIN`; o ramo Diretoria só deixa passar `UNIT_DIRECTOR` com vínculo ativo
  na unidade (via `hasActiveUnitProfile` em `user_unit_links`).
- **SUPER_ADMIN no ramo Diretoria:** hoje NÃO tem atalho no ramo `general_directorate` —
  só passaria com vínculo `UNIT_DIRECTOR`. Confirmado como comportamento a corrigir:
  SUPER_ADMIN deve decidir tudo.
- **Padrão-ouro** (`src/lib/auth/permissions.ts`): `getAccessibleUnitIdsForPermission` e
  `userHasPermissionForUnit` resolvem permissão por unidade cruzando `user_unit_links` +
  `profile_permissions` + `user_permission_overrides`, com atalho de SUPER_ADMIN. É o que
  a função de alçada deve passar a usar.
- **Quem chama a função** (`src/app/api/purchases/approvals/[requestId]/decision/route.ts:160`):
  o `approvalLevel` vem do snapshot pendente quando existe (`:149`), senão do
  `purchaseRequest.approval_level` / cálculo por valor (`:136`). Confere com as regras.
- **Migration 064:** já concede `PURCHASES:approvals.decide` a `SUPER_ADMIN` (l.62),
  `NETWORK_MANAGER` (l.76) e `UNIT_DIRECTOR` (l.89). O `DEPARTMENT_MANAGER` tem
  `approvals.view` mas NÃO `approvals.decide` (comentário explícito na l.106). Ou seja: o
  NETWORK_MANAGER já tem o grant — falta a função reconhecê-lo (grant "morto").

---

## 3. Decisões travadas

| # | Decisão | Valor |
| --- | --- | --- |
| 1 | Quem decide ≤R$200 | Somente Gerência Administrativa (`DEPARTMENT_MANAGER`) + Diretoria por cascata. |
| 2 | Teto do administrativo | Rígido e **estrutural**: a GA não tem a permissão de Diretoria, logo é incapaz de decidir `general_directorate`. Não é `if`, é ausência de grant. |
| 3 | NETWORK_MANAGER como Diretoria | Sim, escopado por unidade (vínculo ativo na unidade da compra), visando SaaS/multi-tenant. |
| 4 | Forma de restrição | **B2 — duas permissões explícitas.** Função 100% por permissão, sem nome de perfil. |
| 5 | Cascata | Diretoria decide ≤R$200 também (recebe ambas as permissões). Administrativo nunca sobe. |
| 6 | SUPER_ADMIN | Decide tudo (atalho no código, inclusive `general_directorate`). |
| 7 | Permissão antiga | **Revogação limpa:** os grants de `PURCHASES:approvals.decide` são revogados e substituídos pelos dois códigos novos. Sem grant órfão. |

---

## 4. Desenho B2 — permissões

**Duas permissões novas:**
- `PURCHASES:approvals.decide.administrative` → decide `administrative_management` (≤R$200).
- `PURCHASES:approvals.decide.directorate` → decide `general_directorate` (>R$200 ou evidência crítica).

**Grants:**
| Perfil | `...administrative` | `...directorate` |
| --- | --- | --- |
| `DEPARTMENT_MANAGER` (GA) | ✅ | ❌ |
| `UNIT_DIRECTOR` | ✅ (cascata) | ✅ |
| `NETWORK_MANAGER` | ✅ (cascata) | ✅ |
| `SUPER_ADMIN` | atalho no código (não depende de grant) | atalho no código |

**Permissão antiga `PURCHASES:approvals.decide`:** revogar os 3 grants existentes
(SUPER_ADMIN, NETWORK_MANAGER, UNIT_DIRECTOR — migration 064 l.62/76/89) e substituir
pelos dois códigos acima. A função de alçada deixa de referenciar o código antigo.

---

## 5. Mudanças previstas (sem código)

### 5.1 `src/lib/purchases/approval-authorization.ts`
- Remover a constante `DIRECTORATE_PROFILE_CODES` e a checagem por nome de perfil.
- Passar a validar por permissão, reutilizando `userHasPermissionForUnit` (ou equivalente
  de `@/lib/auth/permissions`), no mesmo estilo de `src/lib/hr/api-auth.ts`:
  - `approvalLevel === "administrative_management"` → exigir
    `PURCHASES:approvals.decide.administrative` na unidade da compra.
  - `approvalLevel === "general_directorate"` → exigir
    `PURCHASES:approvals.decide.directorate` na unidade da compra.
  - `SUPER_ADMIN` → atalho que passa em ambos os ramos (decide tudo).
- Teto rígido garantido pela ausência da permissão de Diretoria na GA; nenhuma exceção
  por valor que contorne evidência crítica.
- Mensagens de erro 403 preservadas no espírito atual (sem nome de pessoa, conforme
  `NAO_ALTERAR.md`).

### 5.2 Nova migration (próximo número sequencial após 064)
- Inserir as duas permissões novas em `permissions` (idempotente).
- Conceder em `profile_permissions` conforme a tabela da seção 4 (idempotente).
- Revogar os grants antigos de `PURCHASES:approvals.decide` (SUPER_ADMIN, NETWORK_MANAGER,
  UNIT_DIRECTOR).
- Rollback documentado no próprio arquivo (reverter grants e desativar permissões novas).
- **Atenção:** por causa da revogação, esta migration NÃO é puramente aditiva.

---

## 6. Cobertura operacional (olhar hoteleiro)

- R$200,00 exatos → `administrative_management` → GA decide. Confirmado no código.
- Evidência crítica → força `general_directorate` no envio/reenvio
  (`resubmit/route.ts:152`); logo a GA não decide crítica nem de valor baixo. Garantido
  estruturalmente (GA não tem `...directorate`).
- Snapshot legado sem `approval_level`: comportamento atual preservado (consulta /
  rastreabilidade; decisão usa o nível do snapshot pendente quando existe).

---

## 7. Estratégia de teste (fase pré-operação)

**Contexto:** sistema ainda não está em uso; banco único (o mesmo que o Vercel publica),
`.env.local` aponta para o mesmo Supabase do deploy; sem dado real a preservar.

- Nesta fase, reset/recriação de banco é aceitável como ferramenta de teste. Isso deixa
  de valer quando o hotel entrar em operação — aí a trava de auditoria e o
  `NAO_ALTERAR.md` voltam a proibir destruição de dado.
- Recomendado (não bloqueia o 1b): projeto Supabase de staging separado antes do Prompt 2 (RLS).

**Plano de teste do 1b:**
1. **Teste unitário da lógica** de `assertCanDecidePurchaseApprovalLevel` (mockando o
   resolvedor de permissão por unidade), cobrindo:
   - GA (`...administrative`) em `administrative_management` na unidade → ok
   - GA tentando `general_directorate` → bloqueado (não tem `...directorate`)
   - GA tentando `administrative_management` em unidade SEM vínculo → bloqueado
   - UNIT_DIRECTOR (`...directorate` + `...administrative`) em `general_directorate` na unidade → ok
   - UNIT_DIRECTOR decidindo `administrative_management` (cascata) → ok
   - NETWORK_MANAGER em `general_directorate` na unidade da compra → ok
   - NETWORK_MANAGER em unidade SEM vínculo → bloqueado
   - SUPER_ADMIN em ambos os níveis → ok
2. **Migration** (insere permissões, concede grants, revoga antigos) com `SELECT` de
   conferência antes/depois e rollback pronto. NÃO puramente aditiva (revoga grants).
3. **Revisão do diff** antes do commit final.

---

## 8. Critério de aceite

- GA decide ≤R$200 na sua unidade; bloqueada acima disso e em evidência crítica.
- UNIT_DIRECTOR e NETWORK_MANAGER decidem `general_directorate` apenas em unidade com
  vínculo ativo; ambos também decidem ≤R$200 (cascata).
- SUPER_ADMIN decide tudo.
- Função sem nenhum nome de perfil hardcoded (alinhada ao padrão-ouro); nenhum grant
  órfão de `approvals.decide` restante.
- Nada de Auth/login/RLS/snapshot/triggers alterado. Lint, build e testes unitários passam.

---

## 9. Sequência de entrega

1. Este plano em `docs/1b-plano-alcada.md` → commit + push → **revisão** (etapa atual).
2. Após OK: prompt do Codex (lógica + migration) conforme este desenho.
3. Teste unitário + diff revisado → commit final.
