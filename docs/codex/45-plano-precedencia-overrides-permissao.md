# 45 — Plano: precedência determinística de overrides de permissão (P0)

Área sensível (NAO_ALTERAR.md: "Regras de permissão", "Helpers server-side de
sessão/permissão"). Este documento é o gate. Só escrever código após aprovação.
Sem migration. Sem schema. Sem mudança no gate de autorização.

## 1. Contexto e problema

Arquivo: `src/lib/auth/permissions.ts`, função `applyUserPermissionOverrides` (linhas ~208–249).

A função busca `user_permission_overrides` sem `ORDER BY` e aplica as linhas em loop,
mutando `allowedUnitIds`. Um override global (`unit_id` NULL) de allow e um override
por-unidade de deny coexistindo produzem resultado dependente da ordem que o Postgres
devolve as linhas.

Trace real — links {A, B}, perfil concede nada (base {}), overrides [allow global, deny B]:

- Se allow global vier primeiro → adiciona {A, B}; depois deny B → {A}. Deny pega.
- Se deny B vier primeiro → remove B de {} (no-op); depois allow global re-adiciona
  {A, B}. Deny é clobbered.

Mesmo input, permissão diferente. Amplificador: o `unique` do Postgres não deduplica NULL,
então podem existir dois globais (allow + deny); nesse caso o acesso inteiro do usuário
oscila entre "tudo" e "nada" conforme a ordem. Classe de bug de autorização intermitente,
irreproduzível, com risco de vazamento entre unidades (ex.: Galli vs. Galli Praia).

Severidade: P0 (correção de segurança/consistência).

## 2. Objetivo

Tornar o resultado independente da ordem das linhas, com precedência explícita e testável.
Nenhuma mudança em: ramo super admin, visão de rede (`hasNetworkScope`), gate `hasPermission`,
estreitamento active-unit, schema ou migrations.

## 3. Regras de precedência (decisão fechada — Codex NÃO precisa perguntar)

Hierarquia, do mais específico ao menos específico (o mais específico vence):

1. Override por-unidade (`unit_id` = X)
2. Override global (`unit_id` = NULL)
3. Base derivada do perfil (`profile_permissions`)

Empate na mesma especificidade: deny vence allow.

Regras concretas:

- Global deny presente → zera tudo (base de perfil e qualquer allow global).
- Global allow (e nenhum global deny) → adiciona todas as unidades vinculadas.
- Por-unidade: só vale para unidades em `linkedUnitIds` (mantém o guard atual — override
  não concede unidade sem vínculo). Aplicado por cima do global. deny por-unidade vence
  allow por-unidade na mesma unidade.
- Um allow por-unidade pode re-conceder uma unidade após um deny global. Isso é
  intencional: suporta o padrão "negar em tudo, exceto liberar a unidade X".

> Nota decisória para o Wilson (não é pergunta ao Codex): se você quiser que deny global
> seja absoluto (não re-concedível por override de unidade), é trocar uma condição. Minha
> recomendação é manter por-unidade vence global (mais flexível, padrão da indústria de
> deny-by-default + grant específico). O plano assume essa recomendação.

## 4. Mudança proposta

### 4.1 Extrair a lógica pura para um módulo sem server-only

`permissions.ts` começa com `import "server-only"`, o que impede importar a lógica em um
teste. Extrair a decisão pura para novo arquivo `src/lib/auth/override-precedence.ts`
(sem server-only, sem Supabase, sem imports do Next — só Set/array). Isso isola a lógica
de segurança, torna-a testável por qualquer runner e é bom design.

```ts
// src/lib/auth/override-precedence.ts
export type PermissionOverrideRow = { unit_id: string | null; is_allowed: boolean };

/**
 * Resolve o conjunto final de unidades acessíveis aplicando overrides sobre a base
 * derivada do perfil. Determinístico e independente da ordem das linhas.
 * Precedência: por-unidade > global > base; deny vence allow na mesma especificidade.
 */
export function resolveOverrideAccess(
  profileAllowedUnitIds: ReadonlySet<string>,
  linkedUnitIds: ReadonlySet<string>,
  overrides: ReadonlyArray<PermissionOverrideRow>
): Set<string> {
  const result = new Set(profileAllowedUnitIds);

  // 1) Global (unit_id ausente): deny vence allow. Ignora ordem.
  const globals = overrides.filter((o) => !o.unit_id);
  if (globals.some((o) => !o.is_allowed)) {
    result.clear();
  } else if (globals.some((o) => o.is_allowed)) {
    linkedUnitIds.forEach((unitId) => result.add(unitId));
  }

  // 2) Por-unidade (mais específico, vence global): só unidades vinculadas; deny vence allow.
  const denied = new Set<string>();
  const allowed = new Set<string>();
  for (const o of overrides) {
    if (!o.unit_id || !linkedUnitIds.has(o.unit_id)) continue;
    (o.is_allowed ? allowed : denied).add(o.unit_id);
  }
  allowed.forEach((unitId) => {
    if (!denied.has(unitId)) result.add(unitId);
  });
  denied.forEach((unitId) => result.delete(unitId));

  return result;
}
```

### 4.2 `applyUserPermissionOverrides` passa a só buscar e delegar

Antes (loop dependente de ordem, linhas ~229–248):

```ts
for (const override of data ?? []) {
  if (!override.unit_id) {
    if (override.is_allowed) {
      Array.from(input.linkedUnitIds).forEach((unitId) => input.allowedUnitIds.add(unitId));
    } else {
      input.allowedUnitIds.clear();
    }
    continue;
  }
  if (!input.linkedUnitIds.has(override.unit_id)) continue;
  if (override.is_allowed) input.allowedUnitIds.add(override.unit_id);
  else input.allowedUnitIds.delete(override.unit_id);
}
```

Depois (mantém a assinatura e o contrato de mutar `allowedUnitIds`):

```ts
const resolved = resolveOverrideAccess(input.allowedUnitIds, input.linkedUnitIds, data ?? []);
input.allowedUnitIds.clear();
resolved.forEach((unitId) => input.allowedUnitIds.add(unitId));
```

O select, o tratamento de erro e o restante de `permissions.ts` ficam intactos.

## 5. Restrições

- Respeitar NAO_ALTERAR.md. Não tocar em Auth, login, `auth_email`, RLS, migrations, schema.
- Sem novas dependências de runtime. Sem lib de teste nova (ver seção 6).
- Preservar 100% o comportamento para usuários sem overrides ou com overrides não
  conflitantes (o caminho comum não pode mudar).
- Não alterar: ramo super admin, `hasNetworkScope`, `hasPermission`, estreitamento
  active-unit, nem a fonte de dados dos overrides.
- Diff mínimo e revisável: 1 arquivo novo pequeno + substituição de um bloco em `permissions.ts`.

## 6. Fora de escopo (Codex deve PARAR e sinalizar se encostar)

- Dedup de overrides globais (`unit_id` NULL) no write-path/upsert — o read-path já fica
  robusto a duplicatas com esta correção; a deduplicação na escrita é tarefa/migração separada.
- `actorUsesProfile` (guard anti-auto-trancamento que ignora overrides) — plano P1 separado.
- Decisão de produto do active-unit para super admin / network manager — doc separado.

## 7. Prova / testes

O repo não tem runner unitário (só Playwright: `tests/e2e/*.e2e.spec.ts` e
`tests/screenshots/*.spec.ts`; sem vitest/jest, sem script `test`). A extração da seção 4.1
torna a lógica testável sem Next/DB.

Instrução para o Codex: adicionar `tests/unit/override-precedence.spec.ts` usando o
`@playwright/test` já instalado como runner puro (sem browser, sem webServer), importando
`resolveOverrideAccess` do módulo puro. Se a config atual do Playwright forçar subir
webServer/browser para esse arquivo, PARAR e sinalizar (mudança de config é limítrofe;
não improvisar).

Matriz mínima obrigatória:

| Caso | linked | base perfil | overrides | esperado |
| --- | --- | --- | --- | --- |
| deny por-unidade sobrevive a allow global | {A,B} | {} | [allow global, deny B] | {A} |
| allow por-unidade re-concede após deny global | {A,B} | {} | [deny global, allow A] | {A} |
| duplicados globais → deny vence | {A,B} | {A} | [allow global, deny global] | {} |
| sem overrides → inalterado | {A,B} | {A} | [] | {A} |
| deny por-unidade remove unidade do perfil | {A,B} | {A,B} | [deny A] | {B} |
| override de unidade não vinculada é ignorado | {A} | {A} | [allow C] | {A} |

Teste de invariância de ordem (o que prova o P0): para cada caso, embaralhar o array de
overrides (ex.: original e revertido) e exigir resultado idêntico.

## 8. Critério de aceite

- `lint` e `build` passam.
- Screenshots de RH e Compras passam (regressão de UI/comportamento).
- Resultado idêntico ao atual para usuários sem overrides conflitantes.
- Resultado independe da ordem das linhas de override (provado pelo teste de shuffle).
- Todos os casos da matriz resolvem conforme a tabela.
- Diff limitado a: `src/lib/auth/override-precedence.ts` (novo), bloco substituído em
  `src/lib/auth/permissions.ts`, e `tests/unit/override-precedence.spec.ts` (novo).
