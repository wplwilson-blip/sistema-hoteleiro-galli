# Plano — #6: policies `using (true)` em catálogos e permissões

**Área SENSÍVEL** (RLS/migration). Só plano. **Nada é aplicado por mim.**
Branch previsto: `security/rls-catalogos-permissao-escopo`.

---

## 0. Evidência reconferida

`supabase/migrations/066_rls_policies_non_sensitive_foundation.sql`, seção
"4.3 Catalogos globais e cadastros de permissao (SELECT para authenticated)":

```sql
create policy "organizations_authenticated_select_catalog"    on public.organizations     for select to authenticated using (true);
create policy "permissions_authenticated_select_catalog"      on public.permissions       for select to authenticated using (true);
create policy "access_profiles_authenticated_select_catalog"  on public.access_profiles   for select to authenticated using (true);
create policy "profile_permissions_authenticated_select_catalog" on public.profile_permissions for select to authenticated using (true);
create policy "system_statuses_authenticated_select_catalog"  on public.system_statuses   for select to authenticated using (true);
```

Confirmado (as linhas caem em ~`:695-725`, batendo com a auditoria).

`supabase/migrations/078_*.sql` — confirmado o template
`using (unit_id is null or public.user_has_unit_access(unit_id))` (`:57`, `:80`, `:103`,
`:126`, `:149`, `:172`) e a variante por pai (`:207`, `:261`, `:315`, `:371`). Ou seja:
**`unit_id is null` = visível para todos os autenticados**.

---

## 1. Qual é realmente o risco, e qual não é

**Não é** um bypass do app: o caminho da aplicação roda com service_role
(`src/lib/supabase/admin.ts`), que ignora RLS de qualquer forma. Nenhuma dessas policies
protege ou desprotege uma rota da API hoje.

**É** um risco em duas situações concretas:

1. **Cliente `anon`/`authenticated` direto no PostgREST.** A `SUPABASE_ANON_KEY` é pública
   por construção (vai para o browser). Qualquer usuário autenticado pode chamar o
   PostgREST diretamente e ler `permissions`, `access_profiles` e `profile_permissions`
   inteiras — isto é, **o mapa completo de autorização do sistema**: quais perfis existem
   e exatamente que permissão cada um tem. É reconhecimento, não escalação. Hoje, mono-org,
   o dano é limitado.
2. **No SaaS multi-cliente, vira vazamento de tenant.** `organizations` com `using (true)`
   expõe a **lista de clientes** a qualquer usuário autenticado de qualquer cliente. Isso é
   inaceitável em SaaS e é o motivo de o achado ser "MÉDIO hoje, ALTO no SaaS".

Portanto: **esta fatia é preparação para o SaaS**, e sua urgência é a urgência do #2. Ela
não deve ser vendida como fechamento de brecha ativa.

---

## 2. Reescopo proposto, tabela a tabela

| Tabela | Hoje | Proposta | Justificativa |
|---|---|---|---|
| `organizations` | `using (true)` | apenas as orgs às quais o usuário tem vínculo (via `user_unit_links` → `units.organization_id`) | fronteira de tenant |
| `access_profiles` | `using (true)` | perfis da(s) org(s) do usuário, ou globais (`organization_id is null`) | perfis são configuração do cliente |
| `profile_permissions` | `using (true)` | linhas cujos `access_profile_id` são visíveis pela policy acima | herda do pai (padrão da 078) |
| `permissions` | `using (true)` | **mantém `using (true)`** | é um catálogo de *codes* do produto, idêntico para todos os clientes; não contém dado de cliente |
| `system_statuses` | `using (true)` | **mantém `using (true)`** | catálogo estático do produto |

**Ponto de decisão para você:** `permissions` e `system_statuses` ficam abertos. Expõem a
superfície de funcionalidades do produto, não dados de cliente. Fechar custa uma junção em
todo lookup e não protege nada de valor. **Recomendo manter.** Se você discordar, fecho
junto — mas registre a decisão.

**Dependência dura:** o reescopo de `organizations` e `access_profiles` exige um predicado
`user_has_organization_access(org_id)` análogo ao `user_has_unit_access` já usado na 078.
Preciso **confirmar na Fase B** se essa função já existe (a 078 só usa a de unidade) e, se
não, ela entra na migration.

**Dependência de dados:** `access_profiles` precisa ter `organization_id`. Se a coluna não
existir (mono-org sempre assumiu uma org), a migration precisa **primeiro** adicionar a
coluna e fazer backfill — o que a acopla ao #2. **A verificar antes de escrever o `.sql`.**

---

## 3. Entregável

Um único arquivo `supabase/migrations/0NN_rls_catalogos_escopo_org.sql`, contendo:

- `drop policy if exists` + `create policy` para as três tabelas reescopadas, seguindo
  exatamente o estilo da 066 (mesmos nomes de policy, sufixo trocado para
  `_org_scoped_select`);
- se necessário, `create or replace function public.user_has_organization_access(uuid)`
  espelhando `user_has_unit_access`;
- comentários `--` explicando cada escolha, no padrão da 078.

**Entregue como arquivo. Não aplicado. Não mesclado.** Você aplica no Supabase.

---

## 4. Casos de borda

1. **Super admin via PostgREST** → as policies não conhecem super admin. Um super admin
   consultando direto o PostgREST passaria a ver menos do que vê pelo app. Como o app usa
   service_role, **nenhuma tela quebra**. Registrado como divergência aceita.
2. **Usuário sem link ativo** → passa a não ver nenhuma org/perfil via PostgREST. Hoje vê
   tudo. Sem impacto no app.
3. **Perfis globais** (`organization_id is null`, ex.: `SUPER_ADMIN`, `NETWORK_MANAGER` se
   forem globais) → precisam continuar visíveis, daí o `or organization_id is null` na
   policy. **Sem isso, a migration quebra o login/UI se algum dia o app parar de usar
   service_role.**
4. **Recursão de policy** → `access_profiles` consultada dentro da policy de
   `user_unit_links` (ou vice-versa) pode causar recursão infinita. O predicado deve ser
   `security definer` como o `user_has_unit_access` da 078 — verificar.
5. **Performance** → policies com subconsulta rodam por linha. `permissions` fica aberta
   justamente por ser a mais consultada.

---

## 5. Critério de aceite

- [ ] `.sql` entregue, **não aplicado**.
- [ ] Verificações de pré-requisito (§2) respondidas antes do SQL final:
      existe `user_has_organization_access`? `access_profiles` tem `organization_id`?
- [ ] Roteiro de validação pós-aplicação (queries com token `authenticated` de dois
      usuários distintos, mostrando o antes/depois) incluído no arquivo.
- [ ] `npm run lint` / `build` / `test:unit` passam (nenhum código TS muda — é só sanidade).
- [ ] Plano de rollback: a 066 original permanece no repositório; a reversão é recriar as
      policies `using (true)` — incluído como bloco comentado no fim do `.sql`.

---

## 6. O que NÃO muda

- **Nenhum código TypeScript.** Zero mudança no app.
- `066_rls_policies_non_sensitive_foundation.sql` e `078_*.sql` — **não são editados**
  (migrations aplicadas são imutáveis). A nova migration sobrepõe.
- `permissions` e `system_statuses` — policies mantidas (§2).
- Policies de INSERT/UPDATE/DELETE — fora do escopo desta fatia.
- O uso de service_role pelo app — inalterado. Este plano **não** é o #2.
