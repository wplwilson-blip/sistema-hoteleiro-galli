# Plano — CORE Fatia 2.2: certificação NR não-sensível por padrão (líder vê o vencimento)

> 2026-07-08 · **PLANO, não código.** Read-only; nada de app code/migration ainda (área sensível =
> migration antes do código). Cita `arquivo:linha`; o não confirmado está **(não verificado)**. Fecha o
> bloqueio da Fatia 2.1 (`docs/codex/32`): o evento NR já deriva a sensibilidade do registro, mas o registro
> nasce sempre restrito. Decisão do dono (fechada): NR é competência/compliance, **não** saúde → não deve
> ser sensível por padrão. Opção **(A)**: mudar o default em `prepareNrCertificationWrite`. ASO (exame
> médico) continua restrito.

## 0. Confirmações no código (base do plano)

- **Default hoje (a mudar):** `prepareNrCertificationWrite` (`occupational-health.ts:222-223`) hardcoda
  `is_sensitive: true` / `visibility_scope: "restricted"` para **toda** NR (inclusive no UPDATE — recebe
  `existing`). `nrCertificationPayloadSchema` (`schemas.ts:724-740`) **não** expõe sensibilidade → o dono
  descartou campo no payload; a sensibilidade é 100% server-side.
- **ASO NÃO é tocado:** `prepareOccupationalRecordWrite` (`occupational-health.ts:203-204`) segue
  `is_sensitive: true` / `restricted`.
- **⚠️ BLOQUEIO DE BANCO (a mudança de app sozinha NÃO basta):** existe CHECK
  `employee_nr_certifications_visibility_check` (**`056:76-78`**): `visibility_scope = 'restricted' and
  is_sensitive = true`. Um insert com `is_sensitive=false` **viola** o CHECK → a criação de NR passaria a
  dar **500**. Logo **é obrigatória uma migration** que remova/afrouxe esse CHECK. (O CHECK análogo do ASO
  é `employee_occupational_records_visibility_check` `056:42-44` — **não** tocar.)
- **RLS é unit-only, não por sensibilidade:** `069:94-99` (NR select) usa
  `public.user_has_unit_access(unit_id)`; **não** referencia `is_sensitive`. Logo tornar a NR não-sensível
  **não** muda visibilidade no banco — só a **redação em app**. (Insert/update idem, `069:101-114`.)
- **Redação em app:** `mapNrCertification` (`occupational-health.ts:160-181`): `redacted =
  row.is_sensitive && !canViewSensitive` (`:161`); com `is_sensitive=false` → `redacted=false`. **Só**
  `certificateAttachmentId` é apagado quando redacted (`:173`); `nrCode`/`expiresAt`/`status` aparecem
  **sempre**. `canViewSensitive` vem de `occupationalSensitiveView` (rotas abaixo).
- **Evento (Fatia 2.1) já deriva do registro:** `publishNrExpirationEvent`
  (`occupational-health.ts:387-388`) usa `is_sensitive ?? false` / `visibility_scope ?? "unit"` → **não
  muda**. É o `redactFunctionalEvent` (`redaction.ts:249`) que **esconde de fato** o evento sensível
  (title→"Evento sensivel"); com NR não-sensível, o evento fica visível. **Este é o ganho central** para o
  líder (a lista já mostrava `expiresAt`; o evento é que estava oculto).

## 1. A mudança de app (Passo depois da migration)

`prepareNrCertificationWrite` (`occupational-health.ts:222-223`):
```ts
// antes:
is_sensitive: true,
visibility_scope: "restricted"
// depois:
is_sensitive: false,
visibility_scope: "unit"
```
- Vale para create **e** update (a função é usada por `POST /api/hr/nr-certifications:55` e
  `PATCH .../[id]:43`). No UPDATE, isso **normaliza** legados para não-sensível ao editar (backfill
  incremental — ver §2). `prepareOccupationalRecordWrite` (ASO) **inalterado**.
- O código do **evento** não muda (já deriva). Nada de Zod/labels/handler.

## 2. Migration OBRIGATÓRIA (077) — drop do CHECK + backfill

**Sem esta migration a mudança de app quebra.** Próximo número livre = **077** (maior atual = 076). Área
sensível → plano antes do código; aplicada **staging → produção** pelo dono.

**Conteúdo proposto (ordem importa):**
1. `alter table public.employee_nr_certifications drop constraint if exists
   employee_nr_certifications_visibility_check;`
2. **Backfill** dos registros já existentes (nasceram `restricted`/sensíveis):
   ```sql
   update public.employee_nr_certifications
     set is_sensitive = false, visibility_scope = 'unit', updated_at = now()
     where is_sensitive = true or visibility_scope <> 'unit';
   ```
3. **(Recomendado) guardrail invertido** para travar o invariante da decisão (NR nunca sensível):
   ```sql
   alter table public.employee_nr_certifications
     add constraint employee_nr_certifications_visibility_check
     check (is_sensitive = false and visibility_scope = 'unit');
   ```
   - Só funciona **após** o backfill (senão os legados violam). Alternativa: **drop puro** (sem recriar),
     deixando flexível — mas aí nada impede drift futuro. **Recomendo o guardrail invertido** (espelha o
     original, agora do lado não-sensível; é coerente com "NR nunca é sensível"). Trade-off: torna o branch
     "registro sensível" do evento inalcançável — **inofensivo** (é derivação defensiva, fica future-proof
     se um dia o invariante mudar). **(decisão do dono.)**

**Backfill — quantidade:** **(não verificado)** — não tenho acesso ao banco para `count(*)`. Como a NR
sempre nasceu restrita, **todos** os registros existentes estão `is_sensitive=true`. **Recomendo o
backfill** (não deixar legado): sem ele, NRs antigas continuariam ocultas/restritas enquanto novas nascem
visíveis → UX inconsistente para o líder (veria só as novas). O backfill é barato e idempotente.

**Overlap (não tocar):** o `record_type 'nr_certification'` também é permitido na tabela **ASO**
`employee_occupational_records` (`056:36`), mas o handler/efeito de NR lê **`employee_nr_certifications`**
(tabela dedicada) e o scan ASO só processa `aso_*` (`occupational-health.ts` asoTypes) — logo eventuais
linhas `nr_certification` em `employee_occupational_records` estão fora de escopo e seguem restritas.
**(não verificado** se existem tais linhas — recomendo não migrar a tabela ASO.)

## 3. Rota de leitura/listagem de NR (o líder ver na lista)

- **Lista:** `GET /api/hr/nr-certifications` (`route.ts:11-46`) — gated por `occupationalView` (`:12`),
  **não** por sensível; filtra por unidade (`accessibleUnitIds`, `:23`). `canViewSensitive` vem de
  `occupationalSensitiveView` (`:17`) e alimenta `mapNrCertification` (`:40`).
- **Detalhe:** `GET /api/hr/nr-certifications/[id]` (`[id]/route.ts:9-23`) — mesmo padrão
  (`occupationalView` + `occupationalSensitiveView` → `mapNrCertification`, `:17-18`).
- **Efeito de tornar NR não-sensível:** para quem tem `occupationalView` **mas não** `occupationalSensitiveView`
  (o líder), `redacted` passa de `true`→`false` → deixa de apagar `certificateAttachmentId`/`trainingName`
  e some o badge "restrito". **Nota importante:** `nrCode`/`expiresAt`/`status` **já apareciam** a esse
  usuário hoje (só o anexo/nome eram apagados). Ou seja, o líder **já via o vencimento na lista** — o que
  muda é: (a) anexo/nome deixam de ser redigidos; (b) principalmente, o **evento funcional** de vencimento
  passa a ser visível (antes oculto). **É o desejado.** Nada vaza para outra unidade (RLS unit-only).
- **Pré-requisito real:** o líder precisa ter a permissão **`occupationalView`** (lista) e/ou
  **`historyView`** (evento no dossiê). **(não verificado** se o perfil "líder de setor" já tem essas
  permissões — confirmar no cadastro de perfis; se não tiver, ver nada adianta.)

## 4. Outros consumidores de `is_sensitive`/`visibility_scope` da NR (o que muda / não vaza)

- **`mapNrCertification`** (`occupational-health.ts:160-181`): redação (item 3). Muda como esperado.
- **`publishNrExpirationEvent`** (`:387-388`): já deriva — passa a produzir evento `unit`/não-sensível.
- **UI ocupacional** `hr-occupational-health-client.tsx`: envia `formData.set("isSensitive","true")` /
  `"visibilityScope","restricted"` (`:180-181,:211-212`) — **mas o payload schema ignora** (não há esses
  campos) → **no-op** hoje e depois; só muda o **badge** exibido (`redacted`/`isSensitive` deixam de marcar
  a NR como restrita, `:576-608`). Cosmético/desejado.
- **Dossiê / timeline** `hr-employee-detail-client.tsx`: filtro `only_sensitive`/`hide_sensitive` por
  `event.isSensitive` (`:682-683`) e badges (`:1160`) — o evento NR não-sensível passa a aparecer em
  "ocultar restritos" e some o rótulo "Evento restrito". Correto.
- **`executive-dashboard.ts`**: conta NR por `status`/`expires_at`/`deleted_at`
  (`:149,:173-174,:226`), **não** por `is_sensitive` → **sem mudança** nos KPIs.
- **RLS `069`**: unit-only → **sem mudança** de visibilidade no banco.
- **`contextual-documents.ts` / `061`**: aparecem no grep por "nr_certification" **(não verificado** o uso
  exato — provável referência a tipo de documento, não à sensibilidade da certificação; confirmar que não
  há acoplamento a `is_sensitive` da NR).
- **Conclusão:** o único efeito observável é **tornar a NR (lista, detalhe, evento) visível a quem tem
  `occupationalView`/`historyView` sem o sensível** — exatamente o objetivo. Nenhum vazamento cross-unidade
  ou para quem não tem as permissões de base.

## 5. E2E — reativar o caso §7 da Fatia 2.1

Hoje em `test.skip` (`tests/e2e/nr-expiration-event.e2e.spec.ts`): "usuário sem acesso sensível vê o NR
não-sensível e não vê o ASO". Após a Fatia 2.2 fica **testável**:
- **Setup (E2E_ADMIN):** criar colaborador; criar **NR** via `POST /api/hr/nr-certifications`
  (`expiresAt=ontem`) — **agora nasce não-sensível**; criar **ASO** `aso_periodic` (`expiresAt=ontem`) —
  **restrito**. Rodar `POST /api/hr/occupational-records/process-expirations {unitId}`.
- **Ator não-privilegiado:** um usuário com `historyView` **sem** `historySensitiveView` (o `GET
  /api/hr/employees/[id]/history` devolve `permissions.canViewSensitiveHistory` — usar esse flag para
  confirmar o estado). **(não verificado** se `E2E_MULTI` tem exatamente esse par de permissões — o teste
  deve **ler o flag** e, se `canViewSensitiveHistory===true`, `test.skip` com aviso, em vez de falhar; se
  `false`, asserir de verdade.)
- **Asserções:** `history?eventType=nr_expired` → evento **não redigido** (`redacted=false`,
  `isSensitive=false`, `visibilityScope="unit"`); `history?eventType=aso_expired` → **redigido**
  (`redacted=true`, title "Evento sensivel"). + idempotência (dedupe) e ASO intacto já cobertos.
- Trocar o `expect(isSensitive).toBe(true)` atual (que reflete o bloqueio) por `false`/`unit`.

## 6. Ordem de implementação e regra de ouro

1. **Migration 077** (drop CHECK + backfill + guardrail) → **staging**, validar, → **produção** (pelo dono).
2. **Só depois**, deploy do app: `prepareNrCertificationWrite` default `false/unit`.
   - **Ordem obrigatória:** migration **antes** do app. Se o app subir antes do drop do CHECK, todo insert
     de NR (`is_sensitive=false`) viola o constraint → 500. Com o CHECK já removido, o app antigo
     (`is_sensitive=true`) ainda seria válido enquanto o guardrail invertido não existir — por isso, se
     adotar o guardrail invertido, ele deve ser adicionado **na mesma migration, após o backfill**, e o
     deploy do app default `false` deve vir logo em seguida (o app antigo com `true` violaria o guardrail
     invertido). Sequência segura: **migration (drop+backfill+guardrail) → deploy app (false/unit)**, em
     janela próxima.
3. Reativar o E2E (§5). Lint+build. **Nada aplicado/commitado sem OK; migration aplicada só pelo dono.**

### Itens marcados (não verificado)
- Quantidade de NRs existentes (para dimensionar o backfill) — sem acesso ao banco.
- Se o perfil "líder de setor" tem `occupationalView`/`historyView` (senão a visibilidade não o alcança).
- Se `E2E_MULTI` tem `historyView` sem `historySensitiveView` (o E2E deve se auto-adaptar pelo flag).
- Uso de `nr_certification` em `contextual-documents.ts`/`061` e eventuais linhas `nr_certification` em
  `employee_occupational_records` (fora de escopo; não migrar a tabela ASO).
