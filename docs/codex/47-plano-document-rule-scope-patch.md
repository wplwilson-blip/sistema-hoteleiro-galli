# Plano — #1 CRÍTICO: PATCH de regra documental muta recurso de outra unidade

**Área SENSÍVEL** (helper de permissão / escopo de unidade — `docs/NAO_ALTERAR.md`).
Este documento é **só o plano**. Nenhum código de produção nesta fase.
Branch previsto: `fix/document-rule-patch-unit-scope`.

---

## 0. Evidência reconferida (código real, hoje)

- `src/app/api/hr/document-rules/[id]/route.ts:26-40` — `loadExistingRule` busca a regra
  **só por `id`** (`.eq("id", id).is("deleted_at", null)`). Nenhum assert de unidade.
- `:52-56` — o handler usa `existing` para **preencher os campos ausentes** do payload
  (merge em `:58-71`), sem nunca validar `existing.unit_id`.
- `:73-81` — `update(...).eq("id", id)` roda com `context.supabase` = **service_role**
  (`src/lib/supabase/admin.ts`), portanto **sem RLS**. O `.eq("id", id)` é o único filtro.
- `src/lib/hr/document-rule-actions.ts:124` — `assertUnitWriteScope(context, unitId)` valida
  **apenas o `unitId` resultante do merge** (`:120` → `payload.unitId ?? null`), que no PATCH
  vem de `existing.unit_id` quando o cliente não manda `unitId`.

**Consequência confirmada:** um gerente da unidade A que conheça o `id` de uma regra da
unidade B e faça `PATCH` **sem enviar `unitId`** cai em `assertUnitWriteScope(context, B)` →
403 (bloqueado, por sorte). Mas se enviar `unitId = A` no corpo, o assert passa (A está no
escopo dele) e o `update` **move a regra da unidade B para a unidade A**, alterando um
recurso que ele nunca poderia ler. Pior: se a regra existente for **org-wide**
(`unit_id = null`), `assertUnitWriteScope` do fluxo original já rejeitaria `null`, mas com
`unitId = A` no corpo ele **sequestra a regra org-wide para a própria unidade**.

Ou seja: a falha não é só "403 por acidente" — é **escrita cruzada de unidade**, com o
`existing` nunca autorizado.

**Padrão irmão (o correto, a espelhar):** `src/lib/hr/api-auth.ts:184-208`
(`assertCanAccessHrEmployee`) carrega o recurso e chama `assertUnitInHrScope(context,
employee.unit_id)` **antes** de qualquer uso. É o padrão-ouro citado.

---

## 1. Arquivos e linhas afetados

| Arquivo | Linhas | Mudança |
|---|---|---|
| `src/app/api/hr/document-rules/[id]/route.ts` | 26-40 | `loadExistingRule` passa a validar o escopo do recurso carregado |
| `src/app/api/hr/document-rules/[id]/route.ts` | 52-56 | ordem/tratamento do 404 preservada |
| `tests/unit/…` (novo) | — | teste do predicado de escopo |

Nenhuma migration. Nenhuma mudança em `permissions.ts`, `api-auth.ts` ou
`document-rule-actions.ts`.

---

## 2. Diff conceitual

```ts
// route.ts — loadExistingRule
  const rule = (data?.[0] as HrDocumentRuleRow | undefined) ?? null;

+ // Escopo do RECURSO EXISTENTE (espelha assertCanAccessHrEmployee em hr/api-auth.ts).
+ // Sem isto, o service_role escreve em regra de outra unidade via .eq("id", id).
+ if (rule) {
+   assertUnitInHrScope(context, rule.unit_id);
+ }
+
  return rule;
```

`assertUnitInHrScope` já existe (`src/lib/hr/api-auth.ts:176-182`) e delega a
`assertUnitInPermissionScope` (`src/lib/auth/permissions.ts:358-370`), que:
- retorna cedo para **super admin** (âncora preservada);
- lança `PermissionAuthorizationError(notFoundMessage, 404)` caso contrário.

O `handleHrRouteError` (`:94`) já converte isso em resposta 404 com a mensagem
"Recurso nao encontrado." — **sem vazar a existência** da regra da outra unidade. É o
comportamento desejado (404, não 403), coerente com o resto do módulo HR.

### 2.1 DECISÃO DE PRODUTO APROVADA (substitui o rascunho original)

O rascunho deste plano assumia "regra de rede editável só por super admin" e deixava a
transferência entre unidades acessíveis liberada. A decisão aprovada é **mais estrita nos
dois eixos**:

1. Validar **sempre** `existing.unit_id`, nunca a unidade do corpo.
2. `unit_id` preenchido → só edita quem tem escopo naquela unidade.
   **Transferência de unidade PROIBIDA**; mudar `unit_id` só super admin.
3. `unit_id = null` (regra de rede) → editável por **super admin OU network manager**.

**Divergência D1 — network manager.** `assertUnitInPermissionScope` não conhece a noção de
"rede": ela rejeita `unitId` nulo para todo não-super-admin. O flag `hasNetworkScope` é
calculado dentro de `src/lib/auth/permissions.ts:265-267` e **não é exposto** no
`HrRequestContext`. Como `permissions.ts` é âncora sensível e não pode ser editada nesta
fatia, a checagem de network manager é feita em `document-rule-actions.ts` por uma consulta
local que **espelha exatamente** `userHasActiveSuperAdminProfile`
(`permissions.ts:102-124`), trocando o code do perfil — mesma fonte
(`user_unit_links` + `access_profiles.code`), mesmos filtros de status/soft-delete.
Consequência: `assertUnitInHrScope` sozinho **não** implementa a decisão 3; ele cobre
apenas o caso de unidade preenchida.

**Divergência D2 — transferência.** O caso de borda 4 do rascunho dizia que mover uma regra
entre duas unidades **ambas acessíveis** ao gerente continuaria funcionando. A decisão
aprovada **proíbe**: qualquer `nextUnitId !== existingUnitId` é bloqueado para não-super-
admin, inclusive de/para `null`. Isso significa que um network manager pode **editar** uma
regra de rede, mas **não pode** convertê-la em regra de unidade (nem o inverso) — só super
admin transfere. Implementado literalmente conforme a decisão 2.

### 2.2 Códigos de status (decisão de desenho)

O GET de listagem (`src/app/api/hr/document-rules/route.ts:42-46`) **deixa regras de rede
visíveis para todos** (`(row) => !row.unit_id || accessibleUnitIds.includes(row.unit_id)`).
Logo:

| Recusa | Status | Motivo |
|---|---|---|
| regra de **outra unidade** | **404** "Recurso nao encontrado." | o ator nunca a vê na listagem; 404 não vaza existência (idêntico aos loaders irmãos) |
| regra **de rede**, ator sem escopo de rede | **403** | o ator **vê** a regra na listagem; 404 aqui seria mentira e péssima UX, e não esconde nada que ele já não saiba |
| **transferência** de unidade | **403** | recurso legitimamente visível; a recusa é de autorização, não de existência |

---

## 3. Casos de borda

1. **Gerente A, regra da unidade B, sem `unitId` no corpo** → 404 (antes: 403 acidental).
2. **Gerente A, regra da unidade B, com `unitId: A`** → 404. **É o bug corrigido.**
3. **Gerente A, regra de rede, com `unitId: A`** → 403 (antes: sequestro).
4. **Gerente A, regra da unidade A, `unitId: A`** → **sucesso** (caminho feliz).
5. **Gerente A com escopo em A e B, movendo regra de A para B** → **403** (decisão 2:
   transferência proibida para não-super-admin). Diferente do rascunho — ver D2.
6. **Network manager, regra de rede, `unitId` permanece null** → **sucesso**.
7. **Network manager tentando converter regra de rede em regra de unidade** → 403
   (transferência).
8. **Super admin** → inalterado em todos os casos (early-return).
9. **Regra inexistente / soft-deletada** → 404 pelo caminho já existente (`:54-56`).
10. **`scope: "active-unit"`** → esta rota não usa a opção; `accessibleUnitIds` é a união.
11. **POST (criação)** → **comportamento inalterado**. `prepareHrDocumentRuleWrite` recebe o
    ator como parâmetro **opcional**; sem ele, `assertUnitWriteScope` segue exigindo unidade
    como hoje. A decisão aprovada trata do PATCH; não estendo a criação sem seu pedido.

---

## 4. Teste (obrigatório)

`tests/unit/` roda `@playwright/test` como runner puro (`playwright.unit.config.ts`, sem
browser/webServer). Um módulo importado por esses testes **não pode ter `import
"server-only"`** — `document-rule-actions.ts` tem. Por isso o predicado de escopo vive em um
módulo puro novo, `src/lib/hr/document-rule-scope.ts`, sem I/O e sem `server-only`, e
`document-rule-actions.ts` apenas o consome e traduz a recusa em `HrAuthorizationError`.

Cobertura obrigatória (casos 1-8 acima), mais tabela de status por recusa.

---

## 5. Critério de aceite

- [ ] `npm run lint`, `npm run build`, `npm run test:unit` passam.
- [ ] Teste novo cobre o caso 2 e falharia sem o fix.
- [ ] PATCH cruzado de unidade retorna 404 sem emitir `update`.
- [ ] Nenhum comportamento de super admin alterado.
- [ ] Diff tocando **um único arquivo** de produção.

---

## 6. O que NÃO muda (âncoras sensíveis)

- `src/lib/auth/permissions.ts` — **não é editado**. Nem super admin, nem `hasNetworkScope`,
  nem o estreitamento `active-unit`.
- `src/lib/hr/api-auth.ts` — **não é editado**; apenas consumido.
- `src/lib/hr/document-rule-actions.ts` — **não é editado**; `assertUnitWriteScope` continua
  validando o destino, como hoje.
- Nenhuma migration, policy, trigger ou tabela.
- Contrato de resposta (`{ ok, data }`) e mensagens existentes inalterados.
