# Plano — Nova Solicitação pré-seleciona a UNIDADE ATIVA (não units[0])

> **Plano. Sem código ainda.** Aprovar antes de implementar. Área sensível (compras). Mudança
> mínima e localizada em `src/components/purchases/purchase-requests-client.tsx` (apenas `openNew`).
> NÃO toca API/schema/migrations/auth/RLS/sessão. Sem libs novas.

## 1. Mudança proposta (exata)

Em `openNew()` (~linha 361-375), trocar a unidade inicial de `units[0]` pela **unidade ativa**, com
fallback defensivo:

```ts
// antes
function openNew() {
  const firstUnit = units[0]?.id ?? "";
  ...
  form.reset({ ...emptyForm, unitId: firstUnit });
  ...
}

// depois
function openNew() {
  // Pré-seleciona a unidade ATIVA (a que o usuário está operando), não a primeira arbitraria.
  // Fallback: se a unidade ativa nao estiver entre as unidades de compras do usuario, usa units[0].
  const initialUnitId =
    activeUnitId && units.some((unit) => unit.id === activeUnitId) ? activeUnitId : units[0]?.id ?? "";
  ...
  form.reset({ ...emptyForm, unitId: initialUnitId });
  ...
}
```

- `activeUnitId` já existe no componente (`useAppStore((s) => s.activeUnit.id)`, ~linha 257).
- `units` é `purchasesQuery.data?.units ?? []` (~linha 277).
- Nenhuma outra linha de `openNew` muda (resets de `editingId`, `editingStatus`, `error`, `replace`,
  `setFormOpen` permanecem). `emptyForm` permanece com `departmentId: ""` e `costCenterId: ""`.

## 2. Análise dos 3 pontos de risco

### 2.1 Cascata do departamento (linhas ~283-290 e useEffect ~310-327) — sem conflito
- `selectedUnitId = useWatch(... "unitId")`. Ao `form.reset({ unitId: initialUnitId })`, o watch passa
  a valer `initialUnitId` no próximo render.
- `activeDepartments`/`activeCostCenters` recomputam filtrando por `selectedUnitId` → passam a listar
  os departamentos/centros **da unidade ativa**. Esse é exatamente o comportamento correto.
- O `useEffect` (310-327) roda com `selectedUnitId = initialUnitId` (não-vazio, então não retorna cedo).
  Ele valida `departmentId`/`costCenterId` atuais contra as listas filtradas. Como `openNew` zera ambos
  (`emptyForm`), `departmentIsValid`/`costCenterIsValid` são `false` e o efeito faz `setValue("", ...)`
  — **idempotente** (já estão `""`). Não há corrida nem loop: o efeito só reescreve `""` sobre `""`.
- Resultado: o `<select>` Departamento abre vazio ("Selecione") e lista apenas os departamentos da
  unidade ativa. O usuário escolhe. **Comportamento correto, sem efeito colateral.**

### 2.2 `openEdit()` (~linha 383) — NÃO alterar
- Usa `unitId: request.unitId` (a unidade real da solicitação existente). Mantido intacto — editar não
  deve "puxar" a solicitação para a unidade ativa. Confirmado: fora do escopo da mudança.

### 2.3 Unidade única e Super Admin
- **Unidade única:** `units = [unidadeAtiva]`; `activeUnitId` é essa unidade → `initialUnitId =
  activeUnitId`. Idêntico ao atual (`units[0]`), sem diferença perceptível.
- **Super admin:** passa a abrir na unidade que está **vendo (ativa)** — comportamento esperado.

## 3. Achado importante (fidelidade) — relato

O GET de solicitações usa `requirePermission(PURCHASES_PERMISSIONS.requestsView, { scope: "active-unit" })`
(`src/app/api/purchases/requests/route.ts:481`) e monta as opções com `loadPurchaseOptions(accessibleUnitIds)`.
Com escopo **active-unit**, `accessibleUnitIds` é **estreitado para a unidade ativa**, então
`purchasesQuery.data.units` normalmente contém **apenas a unidade ativa** — ou seja, hoje `units[0]`
**já costuma ser** a unidade ativa, e o sintoma de "nascer na unidade errada" pode não se manifestar na
operação atual.

Mesmo assim, a correção é **válida e recomendada** porque:
- Remove a dependência de um pressuposto implícito (ordem/conteúdo de `units` vindos do servidor).
- Fica **explícita e correta** caso `units` passe a conter mais de uma unidade — p.ex. se um dia o
  endpoint de opções ganhar um opt-out `?scope=aggregate` (como já existe em `base/departments` e
  `base/job-positions` para destino de transferência), ou se o escopo mudar.
- É **defensiva** (fallback para `units[0]`) e de risco baixíssimo: no cenário atual o valor resultante
  é o mesmo de hoje; no cenário multiunidade, corrige o lançamento na unidade certa.

> Decisão pedida: confirmar se seguimos com a correção mesmo o `units` hoje sendo (na prática) só a
> unidade ativa — recomendo **sim** (correção explícita + à prova de regressão futura). Se preferir,
> posso também avaliar separadamente se faz sentido o endpoint de opções oferecer aggregate; **não** é
> parte desta mudança.

## 4. Garantias / aceite (após código aprovado)

- Só `purchase-requests-client.tsx`, só `openNew`. `openEdit` intacto.
- Nova Solicitação pré-seleciona a unidade ativa; Departamento filtra por ela; unidade única e super
  admin OK.
- `tsc` / `eslint` / `build` verdes. (Sem alteração de teste necessária; o E2E T2 já cobre criar
  solicitação na unidade ativa — passará a depender menos do campo Unidade, coerente.)
