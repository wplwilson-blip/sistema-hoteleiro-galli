# Plano — Formatadores compartilhados (`src/lib/format.ts`)

Refatoração **pura**: zero mudança de comportamento e de UI. Este documento é só o
**inventário** e o **mapa de substituição**. Nenhum código de produção é alterado antes
da revisão. Aguardando aprovação para implementar.

## Contexto

- `src/lib/utils.ts` só exporta `cn`. Não existe util de formatação compartilhado.
- Varredura em `src/components`: **42 cópias locais** de formatadores em **33 arquivos**:
  - 23 cópias de `formatDate`
  - 14 cópias de `formatDateTime`
  - 2 de `formatCurrency`
  - 2 de `formatFileSize`
  - 1 de `parseLocalizedNumber`
- As cópias **não são todas idênticas**. Abaixo estão agrupadas por **comportamento
  observável** (mesma saída para vazio, mesma normalização de string, mesmo locale/timezone,
  mesmo guarda de `NaN`). Diferenças só de estilo (uma linha vs. várias, ordem de opções
  idênticas) **não** contam como divergência de comportamento.

> Critério de agrupamento: duas cópias são "idênticas" se produzem a **mesma string** para
> todo input do domínio de tipos declarado. Diferenças de tipo de parâmetro (`string` vs.
> `string | null | undefined`) **não** mudam a saída em runtime — a versão canônica adota o
> tipo mais amplo (`string | null | undefined`), que é supertipo seguro para todos os
> chamadores. Diferença apenas no *guard* de vazio (`if (!value)`) é **invisível** quando o
> input problemático (`""`) também cai no guard de `NaN` logo depois e produz a mesma saída;
> nesses casos as cópias são agrupadas e isso está explicitado.

---

## 1. `formatDate` — 7 comportamentos distintos

### Grupo D-V3 — T-aware, date-only→UTC, `NaN`→`"-"`, vazio→`"-"` — **13 arquivos** (canônico: `formatDate`)

```ts
if (!value) return "-";
const date = value.includes("T") ? new Date(value) : new Date(`${value}T00:00:00.000Z`);
if (Number.isNaN(date.getTime())) return "-";
return date.toLocaleDateString("pt-BR", value.includes("T") ? undefined : { timeZone: "UTC" });
```

Arquivos (assinatura `(value: string | null | undefined)`):
`hr-employee-evaluations-card.tsx:176`, `hr-employee-terminations-card.tsx:43`,
`hr-employee-documents-card.tsx:98`, `hr-employee-occupational-health-card.tsx:55`,
`hr-employee-trainings-card.tsx:40`, `hr-evaluation-reports-client.tsx:90`,
`hr-employee-detail-client.tsx:310`, `hr-employee-conduct-card.tsx:40`,
`hr-movements-client.tsx:138`, `hr-terminations-client.tsx:189`,
`hr-occupational-health-client.tsx:243`, `hr-trainings-client.tsx:238`,
`hr-conduct-client.tsx:159`.

→ É o comportamento dominante, recebe o nome simples **`formatDate`**.

### Grupo D-V4 — date-only sempre UTC, `NaN`→`"-"`, vazio→`"-"` — **3 arquivos** (canônico: `formatDateOnlyUtc`)

```ts
if (!value) return "-";
const date = new Date(`${value}T00:00:00.000Z`);
if (Number.isNaN(date.getTime())) return "-";
return date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
```

`hr-executive-dashboard-client.tsx:186` (param `string`), `hr-employees-client.tsx:93`
(param `string | null | undefined`), `hr-document-pendencies-client.tsx:139` (param `string`).

Diferença vs. D-V3: **não** trata sufixo `T` (sempre força `…T00:00:00.000Z`). Para uma
string com hora, D-V4 ignora a hora e ainda aplica UTC → saída diferente de D-V3. Divergente.

### Grupo D-V5 — `new Date(value)` local, `toLocaleDateString("pt-BR")` default, `NaN`→`"-"` — **3 arquivos** (canônico: `formatDateLocal`)

```ts
if (!value) return "-";
const date = new Date(value);
if (Number.isNaN(date.getTime())) return "-";
return date.toLocaleDateString("pt-BR");
```

`hr-evaluation-templates-client.tsx:278` (param `string | null | undefined`),
`hr-employee-development-plans-card.tsx:106` (idem), `hr-onboarding-dashboard-client.tsx:158`
(param `string`).

Diferença vs. D-V4: usa `new Date(value)` no fuso **local** (sem forçar UTC) e sem
sufixo `T00:00:00.000Z` → para datas `YYYY-MM-DD` a interpretação de fuso difere. Divergente.

### D-V2 — fallback `"Não informado"`, normaliza len 10, `NaN`→`"Não informado"` — **1 arquivo** (canônico: `formatDateWithFallbackNaoInformado`)

`purchase-quotes-client.tsx:336`:

```ts
if (!value) return "Não informado";
const normalized = value.length === 10 ? `${value}T00:00:00` : value;
const date = new Date(normalized);
if (Number.isNaN(date.getTime())) return "Não informado";
return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
```

Único que retorna `"Não informado"` (não `"-"`) e normaliza com `T00:00:00` **sem** `Z`
(local). Divergente e sensível ao domínio de Compras. Preservado 1:1.

### D-V1 — date-only UTC, **sem** guard de `NaN`, vazio→`"-"` — **1 arquivo** (canônico: `formatDateOnlyUtcNoGuard`)

`purchase-documentation-dashboard-client.tsx:213`:

```ts
if (!value) return "-";
return new Date(`${value}T00:00:00.000Z`).toLocaleDateString("pt-BR", { timeZone: "UTC" });
```

Igual a D-V4 **exceto** que não há guarda de `NaN`: para data inválida devolve
`"Invalid Date"` em vez de `"-"`. Comportamento observavelmente distinto → variante própria.

### D-V6 — `new Date(value)` local, `Intl` explícito `day/month/year:numeric`, `NaN`→`"-"` — **1 arquivo** (canônico: `formatDateLocalIntl`)

`hr-employee-onboarding-card.tsx:102`:

```ts
if (!value) return "-";
const date = new Date(value);
if (Number.isNaN(date.getTime())) return "-";
return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
```

**Ponto para sua decisão:** para `pt-BR`, a saída de D-V6 é **string-equivalente** a D-V5
(`toLocaleDateString("pt-BR")` default também rendeza `dd/mm/aaaa` com dia/mês 2 dígitos).
Poderia ser fundido em `formatDateLocal`. Como o prompt proíbe unificação cega e prioriza
preservar variantes 1:1, o plano **default mantém `formatDateLocalIntl` separado** (garantia
de zero diff). Se você confirmar a equivalência, fundimos D-V6 → `formatDateLocal` e removemos
esta export. Aguardo sua escolha.

### D-V7 — regex date-only manual + `toLocaleDateString` `year:2-digit` — **1 arquivo** (canônico: `formatDateShortYearFlexible`)

`hr-workflow-detail-client.tsx:518`:

```ts
if (!value) return "-";
const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
if (dateOnlyMatch) return `${dateOnlyMatch[3]}/${dateOnlyMatch[2]}/${dateOnlyMatch[1]}`;
const date = new Date(value);
if (Number.isNaN(date.getTime())) return "-";
return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
```

Único que formata via regex (`YYYY-MM-DD`→`DD/MM/YYYY` literal, ano completo) e usa
`year:"2-digit"` no fallback. Divergente. Preservado 1:1.

---

## 2. `formatDateTime` — 3 comportamentos distintos

### Grupo DT-A — full datetime, `year:"numeric"`, `NaN`→`"-"` — **5 arquivos** (canônico: `formatDateTime`)

```ts
if (!value) return "-";
const date = new Date(value);
if (Number.isNaN(date.getTime())) return "-";
return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
```

`purchase-approvals-client.tsx:153` (param `string`, com guard),
`hr-employee-detail-client.tsx:317`, `hr-employee-documents-card.tsx:105`,
`hr-document-rules-client.tsx:107`, e **`hr-onboarding-plans-client.tsx:138`**.

- `hr-onboarding-plans-client.tsx:138` é o mesmo corpo **sem** `if (!value)` (param `string`).
  Para `""` → `new Date("")`→`NaN`→`"-"`; idêntico ao guard. Agrupado (guard invisível).

→ Comportamento datetime dominante, recebe o nome simples **`formatDateTime`**.

### Grupo DT-C — full datetime, `year:"2-digit"`, `NaN`→`"-"` — **8 arquivos** (canônico: `formatDateTimeShortYear`)

```ts
if (!value) return "-";
const date = new Date(value);
if (Number.isNaN(date.getTime())) return "-";
return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
```

`hr-background-jobs-client.tsx:59`, `hr-candidate-shared.ts:91` (**exportada**; ver §6),
`hr-job-opening-list-client.tsx:100`, `hr-onboarding-dashboard-client.tsx:165`,
`hr-operational-dashboard-client.tsx:319`, `hr-workflow-detail-client.tsx:504`,
`hr-workflow-inbox-client.tsx:201`, e **`hr-audit-client.tsx:54`**.

- `hr-audit-client.tsx:54` é o mesmo corpo **sem** `if (!value)` (param `string`). `""` →
  `NaN`→`"-"`; idêntico. Agrupado (guard invisível).

Diferença vs. DT-A: `year:"2-digit"` (`"25"`) em vez de `"numeric"` (`"2025"`). Divergente.

### DT-V0 — só data (sem hora), local, **sem** guard de `NaN` — **1 arquivo** (canônico: `formatDateLocalNoGuard`)

`purchase-documentation-dashboard-client.tsx:221` (nomeada `formatDateTime`, mas **formata
apenas data**):

```ts
if (!value) return "-";
return new Date(value).toLocaleDateString("pt-BR");
```

Não formata hora e não tem guarda de `NaN`. Distinto de tudo acima → variante própria.

---

## 3. `formatCurrency` — 1 comportamento (canônico: `formatCurrency`)

```ts
return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
```

Idêntico em `purchase-requests-client.tsx:132` e `purchase-quotes-client.tsx:325`
(param `number`). **2 arquivos → 1 canônica.**

> Fora de escopo (nome diferente, comportamento diferente): `moneyLabel` em
> `hr-movements-client.tsx:145` (tem guarda de `null`). Não é cópia de `formatCurrency` — não
> será tocado.

---

## 4. `formatFileSize` — 1 comportamento (canônico: `formatFileSize`)

```ts
if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
if (bytes >= 1024) return `${Math.ceil(bytes / 1024)} KB`;
return `${bytes} bytes`;
```

Saída idêntica em `purchase-quotes-client.tsx:421` (multilinha) e
`purchase-approvals-client.tsx:378` (uma linha). **2 arquivos → 1 canônica.**

> Fora de escopo (nome e lógica diferentes): `formatBytes` em
> `hr-employee-documents-card.tsx:118`. Não é cópia de `formatFileSize` — não será tocado.

---

## 5. `parseLocalizedNumber` — 1 cópia (canônico: `parseLocalizedNumber`)

`purchase-quotes-client.tsx:365`:

```ts
if (typeof value === "number") return value;
if (typeof value !== "string") return 0;
const trimmed = value.trim();
if (!trimmed) return 0;
const normalized = trimmed.includes(",") ? trimmed.replace(/\./g, "").replace(",", ".") : trimmed;
const parsed = Number(normalized);
return Number.isFinite(parsed) ? parsed : 0;
```

Cópia única. Movida para `src/lib/format.ts` como canônica (sem divergência).

---

## 6. Caso especial — `hr-candidate-shared.ts`

`hr-candidate-shared.ts:91` **exporta** `formatDateTime` (grupo DT-C), consumida por outros
arquivos, ex.: `hr-candidate-resume-card.tsx`, `hr-interview-form-client.tsx` (e o barrel de
imports de `hr-candidate-list-client.tsx`, `hr-candidate-detail-client.tsx`,
`hr-candidate-scorecard-client.tsx`).

Para **não** alterar nenhum importador, a definição local vira **re-export** do canônico,
mantendo o mesmo nome público:

```ts
export { formatDateTimeShortYear as formatDateTime } from "@/lib/format";
```

Nenhum arquivo que importa `formatDateTime` de `hr-candidate-shared` é modificado.

---

## 7. `src/lib/format.ts` — exports canônicos propostos (13)

| Export | Origem | Nº arquivos | Observação |
|---|---|---|---|
| `formatDate` | D-V3 | 13 | date-only→UTC, T-aware |
| `formatDateOnlyUtc` | D-V4 | 3 | sempre UTC, sem T |
| `formatDateLocal` | D-V5 | 3 | `new Date` local, default |
| `formatDateWithFallbackNaoInformado` | D-V2 | 1 | fallback `"Não informado"` |
| `formatDateOnlyUtcNoGuard` | D-V1 | 1 | UTC sem guard de `NaN` |
| `formatDateLocalIntl` | D-V6 | 1 | (candidato a fundir em `formatDateLocal`) |
| `formatDateShortYearFlexible` | D-V7 | 1 | regex + `year:2-digit` |
| `formatDateTime` | DT-A | 5 | full datetime, `year:numeric` |
| `formatDateTimeShortYear` | DT-C | 8 | full datetime, `year:2-digit` |
| `formatDateLocalNoGuard` | DT-V0 | 1 | só data, local, sem guard |
| `formatCurrency` | — | 2 | BRL |
| `formatFileSize` | — | 2 | MB/KB/bytes |
| `parseLocalizedNumber` | — | 1 | pt-BR → number |

Todas com tipos estritos, sem `any`, seguindo o estilo de helpers puros já usados no domínio
(`src/lib/purchases`, `src/lib/utils.ts`). Sem dependências novas.

---

## 8. Mapa de substituição por arquivo (33 arquivos)

Cada arquivo: **remover** a(s) definição(ões) local(is) e **adicionar** `import { … } from "@/lib/format"`.
Nenhuma outra linha (estado, queries, JSX, regra de negócio) é tocada.

| Arquivo | Cópia local (linha) | Passa a importar |
|---|---|---|
| `purchases/purchase-requests-client.tsx` | `formatCurrency:132` | `formatCurrency` |
| `purchases/purchase-quotes-client.tsx` | `formatCurrency:325`, `formatDate:336`, `parseLocalizedNumber:365`, `formatFileSize:421` | `formatCurrency`, `formatDateWithFallbackNaoInformado`, `parseLocalizedNumber`, `formatFileSize` |
| `purchases/purchase-approvals-client.tsx` | `formatDateTime:153`, `formatFileSize:378` | `formatDateTime`, `formatFileSize` |
| `purchases/purchase-documentation-dashboard-client.tsx` | `formatDate:213`, `formatDateTime:221` | `formatDateOnlyUtcNoGuard`, `formatDateLocalNoGuard` |
| `hr/hr-employee-evaluations-card.tsx` | `formatDate:176` | `formatDate` |
| `hr/hr-employee-terminations-card.tsx` | `formatDate:43` | `formatDate` |
| `hr/hr-employee-documents-card.tsx` | `formatDate:98`, `formatDateTime:105` | `formatDate`, `formatDateTime` |
| `hr/hr-employee-occupational-health-card.tsx` | `formatDate:55` | `formatDate` |
| `hr/hr-employee-trainings-card.tsx` | `formatDate:40` | `formatDate` |
| `hr/hr-evaluation-reports-client.tsx` | `formatDate:90` | `formatDate` |
| `hr/hr-employee-detail-client.tsx` | `formatDate:310`, `formatDateTime:317` | `formatDate`, `formatDateTime` |
| `hr/hr-employee-conduct-card.tsx` | `formatDate:40` | `formatDate` |
| `hr/hr-movements-client.tsx` | `formatDate:138` | `formatDate` |
| `hr/hr-terminations-client.tsx` | `formatDate:189` | `formatDate` |
| `hr/hr-occupational-health-client.tsx` | `formatDate:243` | `formatDate` |
| `hr/hr-trainings-client.tsx` | `formatDate:238` | `formatDate` |
| `hr/hr-conduct-client.tsx` | `formatDate:159` | `formatDate` |
| `hr/hr-executive-dashboard-client.tsx` | `formatDate:186` | `formatDateOnlyUtc` |
| `hr/hr-employees-client.tsx` | `formatDate:93` | `formatDateOnlyUtc` |
| `hr/hr-document-pendencies-client.tsx` | `formatDate:139` | `formatDateOnlyUtc` |
| `hr/hr-evaluation-templates-client.tsx` | `formatDate:278` | `formatDateLocal` |
| `hr/hr-employee-development-plans-card.tsx` | `formatDate:106` | `formatDateLocal` |
| `hr/hr-onboarding-dashboard-client.tsx` | `formatDate:158`, `formatDateTime:165` | `formatDateLocal`, `formatDateTimeShortYear` |
| `hr/hr-employee-onboarding-card.tsx` | `formatDate:102` | `formatDateLocalIntl` |
| `hr/hr-workflow-detail-client.tsx` | `formatDate:518`, `formatDateTime:504` | `formatDateShortYearFlexible`, `formatDateTimeShortYear` |
| `hr/hr-audit-client.tsx` | `formatDateTime:54` | `formatDateTimeShortYear` |
| `hr/hr-background-jobs-client.tsx` | `formatDateTime:59` | `formatDateTimeShortYear` |
| `hr/hr-job-opening-list-client.tsx` | `formatDateTime:100` | `formatDateTimeShortYear` |
| `hr/hr-operational-dashboard-client.tsx` | `formatDateTime:319` | `formatDateTimeShortYear` |
| `hr/hr-workflow-inbox-client.tsx` | `formatDateTime:201` | `formatDateTimeShortYear` |
| `hr/hr-document-rules-client.tsx` | `formatDateTime:107` | `formatDateTime` |
| `hr/hr-onboarding-plans-client.tsx` | `formatDateTime:138` | `formatDateTime` |
| `hr/hr-candidate-shared.ts` | `formatDateTime:91` (exportada) | re-export `formatDateTimeShortYear as formatDateTime` (§6) |

**Total: 42 cópias locais → 13 exports canônicos.**

---

## 9. Notas de risco / pontos abertos para revisão

1. **D-V6 (`formatDateLocalIntl`)** é string-equivalente a D-V5 em `pt-BR`. Mantido separado
   por segurança (§1). Aprovar merge? (default: manter separado).
2. Agrupamentos "guard invisível" (`hr-audit`, `hr-onboarding-plans`): a versão canônica
   **adiciona** `if (!value) return "-"`, que só muda o caminho de `""`/`null` — e nesses casos
   a saída continua `"-"` (idêntica). Confirmado sem diff.
3. Todos os singletons são movidos para `format.ts` (não apenas os grupos), para que
   `grep "function formatDate" src/components` caia de 23 → 0 e `formatDateTime` de 14 → 0
   (em `hr-candidate-shared` vira re-export, não `function`).
4. Nada em `docs/NAO_ALTERAR.md` é tocado: sem migrations, schema, RLS, auth, sessão,
   permissões, nem regra de negócio de compras/aprovação/evidência. Só troca de declaração
   local por import.

## 10. Critério de aceite (a validar após implementação)

- `src/lib/format.ts` concentra os 13 formadores; nenhuma cópia local de comportamento
  idêntico permanece; variantes divergentes preservadas 1:1.
- `grep "function formatDate" src/components` → 0; `"function formatDateTime"` → 0.
- `npm run lint` e `npm run build` passam.
- `tests/screenshots` sem diff visual.
