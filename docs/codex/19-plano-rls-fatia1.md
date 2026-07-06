# Plano — RLS Fatia 1 (RH ligado a empregado), espelhando a migration 069

> 2026-07-06 · **PLANO, não código.** Read-only. Objetivo: policies de **unidade** (Camada 1) para as
> 9 tabelas da Fatia 1, copiando **exatamente** a forma da `069_rls_policies_hr_sensitive_core.sql`.
> **Sensível NÃO entra no SQL** (fica no `api-auth.ts`, previsto para Camada 2). Base: mapa
> `docs/codex/18-mapa-escopo-rls-fatia1.md`.

---

## 1. Próxima migration

Último arquivo aplicado: **`070_admin_permissions_catalog.sql`**. → nova migration
**`071_rls_policies_hr_employee_scope.sql`** (nome sugerido). Só cria policies; não altera nada mais.

---

## 2. Policies por tabela (predicado exato, forma da 069)

Convenções espelhadas da 069, para **todas** as tabelas:
- `to authenticated` (nunca `anon` → anon fica negado).
- `drop policy if exists "<nome>" on public.<tabela>;` **antes** de cada `create policy` (idempotente).
- **3 policies por tabela**: `for select` (`using`), `for insert` (`with check`), `for update`
  (`using` + `with check`). **Sem `for delete`** → delete negado a authenticated; a app faz soft-delete
  via UPDATE (`deleted_at`), coberto pela policy de update.
- Nomes: `<tabela>_authenticated_select_by_unit` / `_insert_by_unit` / `_update_by_unit`
  (ou `_by_parent_unit` para as filhas).

### 2.A — by_unit (unit_id próprio) — predicado `public.user_has_unit_access(unit_id)`

Aplicar o **bloco §4a da 069** (SELECT `using`, INSERT `with check`, UPDATE `using`+`with check`),
com `using (public.user_has_unit_access(unit_id))` / `with check (public.user_has_unit_access(unit_id))`,
para as **7** tabelas:

| Tabela | Coluna de escopo | Policies |
|---|---|---|
| `employees` | `unit_id` (`003:33`) | select/insert/update_by_unit |
| `employee_functional_events` | `unit_id` (`021:168`) | select/insert/update_by_unit |
| `employee_movements` | `unit_id` (`052:8`) | select/insert/update_by_unit |
| `employee_development_plans` | `unit_id` (`048:222`) | select/insert/update_by_unit |
| `employee_onboardings` | `unit_id` (`047:107`) | select/insert/update_by_unit |
| `employee_onboarding_items` | `unit_id` (`047:170`) | select/insert/update_by_unit |
| `employee_trainings` | `unit_id` (`054:46`) | select/insert/update_by_unit |

> `employee_onboarding_items` tem `unit_id` próprio (denormalizado) → entra em by_unit, **não**
> precisa de join, apesar de ter `onboarding_id`.

### 2.B — by_parent_unit (filhas sem unit_id) — predicado `EXISTS`-join ao pai

Aplicar o **bloco §4b da 069** (`exists (select 1 from <pai> p where p.id = <fk> and
public.user_has_unit_access(p.unit_id))`) nas 3 posições (select `using`, insert `with check`,
update `using`+`with check`), para as **2** tabelas:

| Tabela | FK | Pai | Predicado exato |
|---|---|---|---|
| `employee_movement_approvals` | `movement_id` (`053:6`) | `employee_movements` | `exists (select 1 from public.employee_movements p where p.id = employee_movement_approvals.movement_id and public.user_has_unit_access(p.unit_id))` |
| `employee_development_plan_items` | `development_plan_id` (`048:261`) | `employee_development_plans` | `exists (select 1 from public.employee_development_plans p where p.id = employee_development_plan_items.development_plan_id and public.user_has_unit_access(p.unit_id))` |

**Total:** 9 tabelas × 3 policies = **27 policies** (7×3 by_unit + 2×3 by_parent_unit). Nenhuma de DELETE,
nenhuma para anon.

---

## 3. Confirmações (o que o plano NÃO faz)

- **Não cria helper novo.** Reutiliza `public.user_has_unit_access(unit_id)` da `009` (mesma da 069).
- **Não altera schema.** Nenhum `alter table`, coluna, índice, trigger ou constraint. Só `create policy`
  (+ `drop policy if exists`). RLS já está **habilitado** nas 9 tabelas (migrations 003/021/047/048/052/
  053/054 — confirmado no mapa 17/18); a 071 **não** roda `enable row level security` de novo.
- **Não toca sensível no SQL.** Camada 1 = só unidade. `HR:*.sensitive.view` continua checada na
  aplicação (`api-auth.ts`); as colunas `is_sensitive`/`visibility_scope` e salário/CPF **não** entram em
  nenhum predicado desta migration (isso é Camada 2, futura).

---

## 4. Risco de quebra (por que a app não quebra)

- **A app acessa dados via service_role**, que **bypassa RLS** por natureza
  (`src/lib/supabase/admin.ts` → `createSupabaseAdminClient` com `SUPABASE_SERVICE_ROLE_KEY`; usado por
  todas as rotas via `requirePermission` em `src/lib/auth/permissions.ts`). Adicionar policies **não muda
  nada** para o service_role — ele continua vendo/gravando tudo.
- O único cliente sujeito a RLS é o de **auth** (`server.ts`, anonKey+cookie), que **não** lê/escreve
  essas tabelas de RH (só `auth.getUser()`). Logo, nenhum caminho da app passa a ser barrado.
- Efeito real: fecha o acesso **direto** por chave `authenticated` (defesa em profundidade contra
  cross-unidade). Como hoje essas 9 tabelas estão **RLS ON + zero policy** (deny-all a authenticated),
  a 071 na verdade **afrouxa** de "nada" para "só a própria unidade" — **não** restringe nada que a app
  já fazia (a app é service_role). Risco de regressão na app: **baixíssimo**.
- Ponto de atenção único: se algum job/integração usar a **anonKey** (sessão) para tocar essas tabelas,
  passaria a respeitar unidade. Verificar antes (grep por uso de `createSupabaseServerClient`/anon em
  código que escreve RH) — pelo que mapeamos, não há.

---

## 5. Ordem de aplicação (regra de ouro)

1. **Staging primeiro** (`jascnmgagejlvjlenduv`): aplicar a 071, rodar a validação (§6) e a suíte E2E
   (que hoje roda contra staging).
2. **Só depois de validado**, aplicar em **produção** (`chnamldrlwohaudmjrez`).
3. Nunca aplicar direto em produção. Migration é idempotente (`drop policy if exists`), então reaplicar
   é seguro; ainda assim, staging → validação → produção.

---

## 6. Como validar

**(a) service_role vê tudo (não deve mudar):** com a service_role key, `select count(*)` nas 9 tabelas
retorna o mesmo antes/depois da 071 (RLS ignorado). Confirma que nada foi restringido para a app.

**(b) authenticated só vê a própria unidade:** com um JWT de usuário **não-super** (ex.: E2E_MULTI),
via PostgREST/anon:
- `select` numa tabela by_unit (ex.: `employee_trainings`) retorna **apenas** linhas de unidades em
  `user_unit_links` do usuário (ativas/vigentes); linhas de outra unidade **não** aparecem.
- filha by_parent_unit (ex.: `employee_movement_approvals`) só aparece se o `employee_movements` pai for
  de unidade acessível.
- `insert` com `unit_id` de unidade **não** acessível → **negado** (`with check`); com unidade acessível
  → ok.
- `delete` direto → **negado** (sem policy de delete).

**(c) app não quebra:** rodar a suíte E2E de produção local contra staging
(`npm run test:e2e:prod`) — as rotas de RH (via service_role) continuam 200; **2 rodadas 7/7** como
baseline atual. (Os specs atuais não cobrem RH a fundo, mas provam que login/sessão/compras/perfis
seguem intactos sob as novas policies.)

**(d) diff de policies:** `select tablename, policyname, cmd from pg_policies where schemaname='public'
and tablename in (<as 9>) order by tablename, cmd;` → deve listar as 27 policies (3 por tabela, sem
delete).

---

## Resumo para a revisão aprovar

- Migration **071**, 27 policies (7 by_unit + 2 by_parent_unit), forma **idêntica** à 069.
- **Zero** helper novo, **zero** schema, **zero** sensível no SQL, **zero** DELETE/anon.
- service_role intacto → app não quebra; fecha acesso direto authenticated cross-unidade.
- Staging → validar (service_role vê tudo / authenticated só sua unidade / E2E verde) → produção.

**Aguardando aprovação antes de escrever o SQL.**
