# Plano — namespacing do documento do fornecedor [E2E] (anti-409 por rodada)

> 2026-07-02 · Branch `feat-fase3c-editar-perfis`. **PLANO, não código.** Read-only: nada foi
> alterado. Objetivo: tornar o `document_number` do fornecedor [E2E] **único por rodada** (alta
> entropia, **só dígitos**) para eliminar o `23505`/HTTP 409 de colisão. **Fora de escopo:** teardown
> de limpeza de residual (fica como anotação futura). Base: mapa `docs/codex/11-mapa-residual-e2e-compras.md`.

---

## 1. Estado atual (relido agora)

**A duplicação AINDA existe** — o documento do fornecedor [E2E] é gerado em **dois** lugares, idênticos:

**(a) Helper** — `tests/e2e/helpers/purchases-flow.ts:122-124`:
```ts
await supplierDialog.getByTestId("fornecedor-razao-social").fill(supplierName);
await selectByOptionText(supplierDialog.getByTestId("fornecedor-tipo-documento"), "Outro");
await supplierDialog.getByTestId("fornecedor-documento").fill(`E2E-${suffix}`);
```
(usado por `compras-diretoria.e2e.spec.ts` via `createPurchaseAwaitingApproval`).

**(b) Cópia inline no T2** — `tests/e2e/compras-fluxo.e2e.spec.ts:119-121`, **idêntica**:
```ts
await supplierDialog.getByTestId("fornecedor-razao-social").fill(supplierName);
await selectByOptionText(supplierDialog.getByTestId("fornecedor-tipo-documento"), "Outro");
await supplierDialog.getByTestId("fornecedor-documento").fill(`E2E-${suffix}`);
```

Em ambos, `suffix = runSuffix()` (`compras-fluxo.e2e.spec.ts:54` e `purchases-flow.ts:72`) e
`supplierName = e2eLabel("Fornecedor")` = `"[E2E] Fornecedor <suffix>"`. Tipo de documento: **"Outro"**
(→ `OTHER`). **Nenhum outro** ponto em `tests/e2e/**` gera documento de fornecedor (grep confirmado);
existe um helper de CPF digit-only não usado por esse fluxo (`data.ts:45,73`).

**Conclusão:** corrigir **os dois** call-sites (ou unificar) é obrigatório — corrigir só o helper
deixaria o T2 quebrado.

---

## 2. Como o documento é gerado hoje e por que colapsa

- Valor inserido em `document_number`: literalmente `` `E2E-${suffix}` ``, com
  `suffix = ${Date.now().toString(36)}-${rand4}` (`helpers/data.ts:14-18`). Ex.: `E2E-mr3jm22a-cdgs`.
- O índice único **normaliza removendo tudo que não é dígito**
  (`migration 014_suppliers_unique_document.sql:1-8`):
  ```sql
  create unique index suppliers_org_document_type_normalized_active_unique
    on public.suppliers (organization_id, document_type,
      (regexp_replace(coalesce(document_number, ''), '\D', '', 'g')))
    where deleted_at is null
      and nullif(regexp_replace(coalesce(document_number,''), '\D','','g'), '') is not null;
  ```
- Como `E2E-<suffix>` tem **pouquíssimos dígitos** (o base36 do timestamp + o "2" de "E2E" viram uma
  string curta), a normalização colapsa para algo como **`"2322"`** (exatamente o valor do 409 real:
  fornecedor residual `"[E2E] Fornecedor mr3jm22a-cdgs"` → `document_number` normalizado `"2322"`).
  Com residual nunca hard-deletado, dois `suffix` diferentes cujos **dígitos** coincidem → `23505` →
  a rota `POST /api/base/suppliers` responde **HTTP 409** → `withApi` lança (`purchases-flow.ts:29`).

**Cerne:** o problema é a **baixa contagem de dígitos** do documento após normalização — não o nome.

---

## 3. Proposta de namespacing

**Gerar um documento SÓ DÍGITOS, longo e único por chamada.** Como a normalização só preserva
dígitos, o valor precisa ser digit-safe (sem letras/hífen — ao contrário de `E2E-...`).

### Valor proposto
Um helper novo em `tests/e2e/helpers/data.ts`, ex.:
```ts
let e2eDocCounter = 0;
/** Documento SO DIGITOS, unico por chamada e por rodada (para suppliers document_type OTHER). */
export function uniqueE2ESupplierDocument(): string {
  const ts = Date.now().toString();                 // ~13 digitos (ms)
  const seq = (e2eDocCounter++).toString().padStart(3, "0"); // unicidade intra-processo
  const rand = Math.floor(Math.random() * 1e6).toString().padStart(6, "0"); // 6 digitos
  return `${ts}${seq}${rand}`;                       // ~22 digitos, so digitos
}
```
- **Quantos dígitos garante:** ~**22 dígitos** (13 do `Date.now()` + 3 do contador + 6 do random).
  Unicidade **entre rodadas** vem do `Date.now()` em ms (+ random); **dentro** da mesma rodada/ms vem
  do contador incremental. Colisão é desprezível.
- **Mantém `document_type` "Outro" (OTHER):** OTHER não valida checksum (o `E2E-...` atual já é aceito),
  então uma string numérica longa também passa — **não** precisamos trocar para CPF/CNPJ.
- **Alternativa considerada e descartada:** reusar `uniqueValidCpf()` (`data.ts:73`, 11 dígitos, válido).
  Funcionaria e é digit-only, mas obrigaria trocar o tipo para "CPF" e casar validação de CPF do
  cadastro — mais superfície de mudança sem ganho. Manter OTHER + dígitos longos é o mínimo.

### Onde aplicar — **nos dois**, unificando
Para não "corrigir um e esquecer a cópia", o plano recomenda **unificar** a criação do fornecedor:
- **Opção A (recomendada):** extrair um helper `createE2ESupplierInline(page/dialog, { name })` em
  `purchases-flow.ts` (ou em um `helpers/purchases-ui.ts`) que faça razão social + tipo + documento
  (usando `uniqueE2ESupplierDocument()`), e **chamar esse helper nos dois** specs — elimina a
  duplicação de vez.
- **Opção B (mínima):** manter os dois blocos, mas trocar **ambas** as linhas
  (`purchases-flow.ts:124` e `compras-fluxo.e2e.spec.ts:121`) de `` `E2E-${suffix}` `` para
  `uniqueE2ESupplierDocument()`. Menos invasiva; mantém a duplicação estrutural (aceitável se
  quisermos diff pequeno).

> Recomendo **A** (remove a fonte da duplicação que causou este bug de "corrigiu num lugar só"), mas
> **B** é suficiente para o 409. Decisão sua na revisão.

### Outros campos precisam ser únicos?
**Não.** O **único** índice único de fornecedor é o de documento (`migration 014`). A tabela
`suppliers` (`migration 011:5-31`) só tem `suppliers_name_not_blank` (não-único) no `name` — logo
**`name` pode repetir**; manter `"[E2E] Fornecedor <suffix>"` é ok para identificação de residual.
Nenhum outro campo do fornecedor [E2E] tem restrição de unicidade.

---

## 4. Impacto

- **Só dado de teste.** A mudança toca **apenas** a geração do documento em `tests/e2e/**`
  (helper `data.ts` + call-sites). **Não** toca código de app, migration, schema, nem o índice único
  (`014`) — o índice continua igual; passamos a **respeitá-lo** entregando dígitos únicos.
- **Asserts inalterados.** Os specs de compras asseram sobre: nome do fornecedor
  (`expect(modal.getByText(supplierName))`, `compras-fluxo.e2e.spec.ts:133`), classificação
  "Formal suficiente", badge "Vencedora", status ("Gerência Administrativa"/"Diretoria Geral"),
  "Compra aprovada" e o 403 do T3. **Nenhum** assert lê o `document_number`. Trocar o formato do
  documento não altera nenhum resultado esperado.

---

## 5. Risco de borda

- **Nenhum teste depende do formato do documento [E2E].** Grep em `tests/e2e/**`: o token `E2E-`
  aparece **só** nas duas linhas de `fill(...)` (geração); não há assert casando o valor do documento.
  O documento é escrito, nunca lido/verificado por teste.
- **`suffix` continua usado para o resto** (título/nome/descrição/itens). O namespacing troca **apenas**
  o documento; `runSuffix()` permanece para os demais campos — sem efeito colateral.
- **Sem risco de CPF inválido:** como mantemos `document_type = OTHER`, não há validação de dígito
  verificador; string numérica longa é aceita (comportamento idêntico ao atual `E2E-...`, que já passa).
- **Observação (fora de escopo, anotar):** isto elimina o 409 por rodada, mas **não** limpa o residual
  acumulado — cada run continua deixando 1 fornecedor [E2E]. A limpeza (teardown / SQL do mapa 11) é
  tarefa separada e **não** entra aqui.

---

## Resumo para a revisão

1. Adicionar `uniqueE2ESupplierDocument()` (≈22 dígitos, só dígitos) em `tests/e2e/helpers/data.ts`.
2. Substituir `` `E2E-${suffix}` `` por essa função **nos dois** pontos
   (`purchases-flow.ts:124` e `compras-fluxo.e2e.spec.ts:121`) — de preferência **unificando** a
   criação do fornecedor num helper único (Opção A).
3. Nada mais muda: tipo "Outro", nome com `[E2E]`, asserts e app intactos.

**Aguardando aprovação** antes de escrever o código.
