# Investigação — o "líder de setor" enxerga NR / histórico funcional hoje?

> 2026-07-08 · **Read-only.** Nada alterado. Base para decidir a Fatia 2.2. Cita `arquivo:linha`; o que
> depende de dado de banco em runtime está **(não verificado)**.

## TL;DR

**Não.** Em código/seed versionado, **`HR:occupational.view` e `HR:history.view` são concedidas APENAS ao
`SUPER_ADMIN`.** O perfil do líder (`SUPERVISOR` = "Líder/Encarregado") recebe só permissões
`BASE`/`PURCHASES`/`ATTACHMENTS` — **nenhuma HR**. Logo, mesmo tornando a NR não-sensível (Fatia 2.2), o
líder **continua sem ver** a lista de NR nem o histórico funcional, porque falta a **permissão de base**.
Fatia 2.2 é **necessária mas não suficiente**.

## 1. Quem é o "líder de setor"

- **Matriz (design):** `SUPERVISOR` = "Líder/Encarregado" (`docs/RH-35B_...:91`, `:490`); líderes de setor
  `LIDER_GOVERNANCA`/`LIDER_AB` (`:70`,`:72`); `DEPARTMENT_MANAGER` = gestor de departamento conforme
  `department_id` em `user_unit_links` (`:90`). Saúde ocupacional/ASO é escopo do papel **`SST`** (`:66`,
  `menu.sst:155`); o líder opera "demandas do setor" (`menu.operations.leader:156`), **não** o módulo
  ocupacional.
- **Código/seed:** só existem como `access_profiles` versionados `SUPERVISOR` e `DEPARTMENT_MANAGER`
  (`010_seed_base_data.sql:9-10`). `LIDER_GOVERNANCA`, `LIDER_AB`, `SST`, `GERENCIA_ADMINISTRATIVA` **não**
  estão no seed versionado — são conceitos da matriz **(não verificado** se criados em runtime).
- → O "líder de setor" mais literal hoje = **`SUPERVISOR`** (e/ou `DEPARTMENT_MANAGER`).

## 2. Permissões que gateiam (códigos reais)

- **(a) Ver a lista de NR** (`GET /api/hr/nr-certifications` e `/[id]`): **`HR:occupational.view`**
  (`api-auth.ts:40`; exigida em `nr-certifications/route.ts:12` e `[id]/route.ts:10`). Definida em
  `056:144`.
- **(b) Ver o histórico/eventos funcionais** (`GET /api/hr/employees/[id]/history`): **`HR:history.view`**
  (`api-auth.ts:52`; exigida em `history/route.ts:24`). Definida em `021:22`.
- **(c) Permissão sensível que esconde o evento** (`redactFunctionalEvent`): **`HR:history.sensitive.view`**
  (`api-auth.ts:53`; `history/route.ts:39-44` calcula `canViewSensitiveHistory` e passa a
  `redactFunctionalEvent`, `redaction.ts:249`). Para a **lista** de NR, a redação usa
  **`HR:occupational.sensitive.view`** (`api-auth.ts:43`; `nr-certifications/route.ts:17`).

## 3. O líder POSSUI (a) e (b)? — NÃO (em código)

- **`HR:occupational.view` → só `SUPER_ADMIN`** (`056:156-188`, grant `cross join` só com
  `code='SUPER_ADMIN'`).
- **`HR:history.view` → só `SUPER_ADMIN`** (`021:38-45`, `where ap.code = 'SUPER_ADMIN'`).
- **`SUPERVISOR`** só recebe (`064:119-126`): `BASE:departments.view`, `BASE:job_positions.view`,
  `BASE:employees.view`, `BASE:suppliers.view`, `PURCHASES:requests.view/manage`, `PURCHASES:quotes.view`,
  `ATTACHMENTS:purchases.view` — **zero `HR:*`**.
- **`DEPARTMENT_MANAGER`** idem, só BASE/PURCHASES/ATTACHMENTS (`064:107-116`, `065:30`).
- **Perfis de RH da 045** (`HR_OPERATOR`/`HR_SUPERVISOR`/`HR_SENSITIVE_VIEWER`): só `employees.view` +
  `documents.*` (`045:37-50`) — **não** têm `occupational.view` nem `history.view`.
- Busca exaustiva por `occupational.view`/`history.view` em todas as migrations → **apenas** definições
  (`021`,`056`) + grants ao `SUPER_ADMIN`. Nenhum grant a perfil não-super.

**Conclusão (código):** o líder (`SUPERVISOR`/`DEPARTMENT_MANAGER`) **não vê** a lista de NR nem o histórico
funcional de um colaborador da unidade. **(não verificado):** grants podem ter sido editados em runtime na
tabela `profile_permissions` (via UI de perfis) — isso não está no código; não dá para confirmar aqui.

## 4. O que faltaria conceder (se optar por isso)

Para o líder ver **via módulo/dossiê** (não via demandas):
- **(a)** conceder **`HR:occupational.view`** ao perfil do líder (hoje só SUPER_ADMIN, padrão de grant em
  `056:156-188`).
- **(b)** conceder **`HR:history.view`** (hoje só SUPER_ADMIN, padrão em `021:38-45`).
- **NÃO** conceder `HR:occupational.sensitive.view` / `HR:history.sensitive.view` — assim o líder vê o NR
  (não-sensível após 2.2) e **continua sem** ver ASO/eventos sensíveis. Isso casa com a Fatia 2.2.
- Seria uma **fatia de permissões à parte** (migration de grant, área sensível), **não** implementada aqui.

## 5. Tensão de design a considerar (antes de conceder)

A matriz desenha o líder recebendo vencimento de NR como **"demanda do setor"**
(`menu.operations.leader:156`; painéis "Pendências do setor", `:406`), **não** navegando o módulo
ocupacional/dossiê (que é escopo de `SST`/RH/Auditoria). Ou seja:
- **Caminho 1 (permissões amplas):** conceder `occupational.view`+`history.view` ao líder — simples, mas dá
  ao líder leitura ampla de NR/histórico de **todos** os colaboradores da unidade (superfície maior que
  "esta NR venceu").
- **Caminho 2 (demanda — intenção da matriz):** rotear o vencimento de NR ao líder como demanda — depende da
  **CORE de demandas globais** (o follow-up da Fatia 2.1 §8), que **não existe** hoje.

**Recomendação:** decidir o caminho antes de mexer no banco. Se o objetivo é só "o líder ser avisado do
vencimento", o Caminho 2 é o alinhado — mas exige a CORE de demandas. Se quiser valor imediato, o Caminho 1
(grant mínimo de `occupational.view`+`history.view`, sem sensível) entrega, com a ressalva de leitura ampla.
Fatia 2.2 (NR não-sensível) é pré-requisito dos dois caminhos, mas sozinha **não** faz o líder ver nada sem
a permissão de base.
