# Projeto de Permissões e Controle de Acesso — Sistema Hotel Galli

Documento-mãe do projeto que transforma o controle de acesso do sistema em algo **configurável,
granular e por perfil**, com exceções por pessoa — e desenhado para, no futuro, cada empresa
(tenant) configurar os seus próprios perfis num SaaS.

> **Princípio central:** a tela mostra ao usuário apenas o que ele pode ver e fazer. Menu e ações
> refletem as permissões. **Mas** ocultar é experiência, não segurança — a segurança real
> permanece no backend (validação server-side, já existente). As duas camadas trabalham juntas.

---

## 0. O que já existe (a fundação — não construir de novo)

O motor de permissões **já existe e funciona** (usado e testado nos E2E T2/T3):

- `access_profiles` — os papéis/perfis (SUPER_ADMIN, DEPARTMENT_MANAGER, etc.).
- `permissions` — as ações possíveis, granulares (ex.: `PURCHASES:approvals.decide.directorate`,
  `BASE:suppliers.manage`). Formato: `MÓDULO:recurso.ação`.
- `profile_permissions` — quais permissões cada perfil tem (a **regra geral / atacado**).
- `user_permission_overrides` — exceções por pessoa, nas **duas direções**:
  `is_allowed = true` concede algo extra; `is_allowed = false` remove algo que o perfil dava
  (o **ajuste fino / varejo**). Confirmado no motor (`permissions.ts`).
- `user_unit_links` — vínculo usuário↔unidade↔perfil (o **escopo**).
- `requirePermission` / `userHasPermissionForUnit` — a validação **server-side** (a segurança real).

**O que falta NÃO é o motor. É a interface e o gate visual:**
1. Expor as permissões do usuário para o front (hoje o `SessionContext` não as carrega).
2. Filtrar o **menu** por permissão (Fase 1).
3. Ocultar **ações/botões** por permissão (Fase 2).
4. **UI de administração** para montar perfis (atacado) e exceções por pessoa (varejo) — Fase 3.

---

## 1. Modelo de duas camadas (perfil + exceção)

O controle de acesso combina duas camadas que se sobrepõem:

| Camada | Onde | O que faz | Exemplo |
| ------ | ---- | --------- | ------- |
| **Perfil** (atacado) | `profile_permissions` | Regra geral do papel. Configura uma vez, vale para todos do perfil. | "Financeiro" vê e altera contas. |
| **Exceção** (varejo) | `user_permission_overrides` | Ajuste na pessoa. Concede (`true`) ou nega (`false`) por cima do perfil. | João é Financeiro mas **não** altera contas (override `false`). |

Precedência (já implementada no motor): a exceção da pessoa vence sobre o perfil. Serve a **qualquer
departamento** — é mecanismo universal, não específico de um módulo.

---

## 2. As três fases (ordem de menor risco / maior valor visível)

Baseado na sequência recomendada em `RH-35B` (seção 22): menu → ações → administração.

### Fase 1 — Menu filtrado por perfil/permissão  *(esta é a fase detalhada abaixo)*
Esconder do menu lateral os itens que o usuário não pode acessar. Impacto visual imediato,
risco baixo. O auxiliar de RH deixa de ver "Compras", "Aprovações", etc.

### Fase 2 — Ações por permissão (botões)
Dentro das telas visíveis, ocultar/desabilitar os botões que a pessoa não pode acionar
(ex.: "Aprovar" some para quem não tem `approvals.decide`). Complementa o menu. O backend
já barra (T3 provou); esta fase é pura experiência.

### Fase 3 — UI de administração de perfis e exceções
A tela com checkboxes onde o administrador monta os perfis (grade perfil × permissões, agrupada
por módulo) e as exceções por pessoa. É a mais complexa e **mexe em autorização** — vem por
último, quando menu e ações já estão firmes. **É aqui que a decisão "perfis por empresa" (SaaS)
se materializa** (ver §4).

> Cada fase é um bloco com **plano próprio** e revisão antes do código. Não implementar as três
> de uma vez.

---

## 3. FASE 1 — Menu filtrado (plano detalhado)

### 3.1. Situação atual (confirmada no código)
- `src/components/layout/app-sidebar.tsx` tem `menuGroups` como **lista estática**, renderizada
  **inteira para todos** (`menuGroups.map`, sem filtro). Todo usuário vê o menu completo.
- O `SessionContext` (`src/lib/auth/types.ts`) expõe `user`, `profile` (id/name/code), `units`,
  `activeUnit` — mas **NÃO** a lista de permissões do usuário. A resolução de permissão hoje é
  só server-side.

### 3.2. Decisão estrutural desta fase: expor permissões ao front
Para o menu filtrar por permissão específica, o front precisa saber **quais permissões** o
usuário tem. Duas abordagens:

- **(A) Carregar a lista de permissões efetivas do usuário na sessão** — ao montar o
  `SessionContext`, calcular o conjunto de permissões (perfil + overrides, no escopo das unidades)
  e disponibilizá-lo ao front. O menu lê essa lista. **Recomendada:** uma resolução, cacheável,
  reutilizável pela Fase 2 (botões) também.
- (B) Endpoint dedicado que o front consulta para montar o menu. Mais chamadas, menos coeso.

**Recomendação: (A).** Expor `permissions: string[]` (códigos) no contexto de sessão do front,
derivado do que o backend já calcula. Reaproveitável nas Fases 1 e 2.

> Cuidado de segurança: expor a lista de permissões ao front é aceitável (não é dado sensível —
> é o que o usuário pode fazer). **Não** substitui a validação server-side: o backend continua
> validando toda ação. O front só usa a lista para **exibição** (esconder o que não serve).

### 3.3. Mapeamento item de menu → permissão (Decisão 1: por permissão específica)
Cada `SidebarLink` ganha um campo opcional `requiredPermission?: string` (ou
`requiredAnyOf?: string[]` quando o acesso à tela é satisfeito por qualquer uma de um conjunto).
O filtro esconde o item se o usuário não tiver a permissão. Exemplos:

| Item de menu | Permissão sugerida (a confirmar no código de cada rota) |
| ------------ | ------------------------------------------------------ |
| Compras › Solicitações | `PURCHASES:requests.manage` (ou `.view`) |
| Compras › Cotações | `PURCHASES:quotes.manage` (ou `.view`) |
| Compras › Aprovações | `PURCHASES:approvals.decide.administrative` **ou** `.directorate` (`requiredAnyOf`) |
| Cadastros › Fornecedores | `BASE:suppliers.view`/`.manage` |
| RH › Vagas | permissão do módulo de vagas |
| RH › Documentos | permissão de documentos RH |

- Itens **sem** `requiredPermission` (ex.: Dashboard) aparecem para todos.
- Um **grupo** inteiro sem nenhum item visível deve ser ocultado (não mostrar grupo vazio).
- As permissões exatas de cada item devem ser **verificadas rota por rota** (a tela usa qual
  `requirePermission`?) no plano de execução — não assumir.

### 3.4. Regra de ouro da fase
- O menu filtra por permissão do usuário; **super admin vê tudo** (como já ocorre no backend).
- Esconder item **nunca** substitui o gate server-side: se o usuário digitar a URL direto, o
  backend ainda barra. (A Fase 1 pode, opcionalmente, redirecionar/mostrar "sem acesso" ao
  acessar rota proibida — mas isso é complemento, não a Fase 1 em si.)
- Mudança aditiva e reversível: `menuGroups` ganha metadados de permissão; a renderização ganha
  um `.filter(...)`. Nada no backend muda.

### 3.5. Critério de aceite (Fase 1)
- O menu esconde itens que o usuário não pode acessar (por permissão específica).
- Grupos sem itens visíveis não aparecem.
- Super admin vê o menu completo.
- Usuário existente com acesso amplo não perde nada indevidamente.
- Nenhuma mudança de backend/schema/RLS; `SessionContext` do front passa a incluir
  `permissions: string[]`.
- Validação server-side intacta (a segurança não muda).

---

## 4. Contemplando "perfis por empresa" (SaaS) no desenho — SEM implementar agora

Decisão do produto: SaaS é norte de médio prazo; **desenhamos com ele em mente, sem construir
multi-tenant agora** (ver `DIAGNOSTICO_MULTI_TENANT.md`).

O que isso significa para este projeto, por fase:

- **Fase 1 (menu) e Fase 2 (botões):** NÃO tocam multi-tenant. Só leem as permissões que o usuário
  já tem. Funcionam para a Galli hoje sem qualquer mudança de tenancy. Nada a antecipar.
- **Fase 3 (UI de administração):** é onde "perfis por empresa" aparece. Ao desenhar a tela de
  perfis, projetá-la assumindo que **perfis pertencem a uma organização** — mesmo que hoje, com um
  cliente, todos sejam da Galli. Concretamente, ao construir a Fase 3:
  - A UI de perfis deve ser construída de forma que adicionar `organization_id` a
    `access_profiles`/`permissions` depois seja um passo natural, não uma reescrita da tela.
  - O `unique (code)` global de `access_profiles` (hoje um risco para o 2º cliente — ver
    diagnóstico) deve ser tratado quando a Fase 3/multi-tenant for implementada, virando
    `unique (organization_id, code)`.
  - **Não** implementar `organization_id` em perfis agora; apenas não desenhar a UI de um jeito
    que dependa de perfis globais de forma difícil de desfazer.

Resumo: **Fases 1 e 2 seguem sem multi-tenant. A Fase 3 é desenhada com perfis-por-empresa em
mente, e é o momento natural de resolver a dívida estrutural de perfis globais — quando chegarmos
lá, com plano próprio.**

---

## 5. Sequência recomendada de execução

1. **Fase 1 — menu filtrado** (esta): expor permissões no `SessionContext` do front + filtrar
   `menuGroups` por permissão específica. Plano de execução detalhado antes do código (mapear a
   permissão real de cada item rota por rota).
2. **Fase 2 — ações/botões por permissão:** reaproveita a lista de permissões da Fase 1; oculta
   botões (ex.: "Aprovar" para quem não decide). Plano próprio.
3. **Fase 3 — UI de administração de perfis + exceções:** grade perfil × permissões por módulo +
   exceções por pessoa; desenhada com perfis-por-empresa em mente; resolve a dívida de perfis
   globais. Área sensível — plano detalhado, revisão cuidadosa.

Cada fase: plano → revisão → código → merge, sem misturar.

---

## 6. Riscos e cuidados

- **Esconder ≠ proteger.** Toda ação sensível continua validada no backend. O menu/botão filtrado
  é UX; a segurança é server-side (já provada nos E2E).
- **Não expor dados sensíveis ao front.** Expor a lista de *permissões* (o que pode fazer) é ok;
  não confundir com expor *dados* protegidos.
- **Mapear permissões item por item** (Fase 1) verificando a rota real — não assumir o código da
  permissão.
- **Fase 3 é autorização** (área sensível do `NAO_ALTERAR.md`): plano antes do código, sempre.
- **Perfis por empresa:** contemplado no desenho, implementado só quando o multi-tenant for feito.
