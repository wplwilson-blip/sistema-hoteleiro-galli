# 68 — Plano: UH Fase 2 — Mapa visual de apartamentos (read-only)

Status: **plano para revisão. Nenhum código escrito.**
Fatia 2 da UH, Fase 2. Continua a Fase 1 (lista read-only, merge `3cd2505`).
Sem migration, sem rota nova de API, **sem gravação** — reusa o `GET /api/base/rooms` que já existe.
Navegação ancorada em [CORE-EMP-02](../CORE-EMP-02_MAPA_TELAS_MENUS_FLUXOS_OPERACIONAIS.md) (§2, §4, §11, §16).

---

## 1. O que entra

Uma segunda visão da **mesma** tela de apartamentos: grade de portas por andar e ala, cor por situação, com tipo/PAX/conjugada/climatização no card. Alternância Lista ⇄ Mapa por **query param**, e o mapa exposto como porta operacional nos dashboards de Governança e Manutenção.

Continua **read-only**: nenhum botão de bloquear, nenhum PATCH. Bloqueio é Fase 3.

---

## 2. Uma tensão real entre o plano e o CORE-EMP-02 — precisa de decisão

O plano diz que a porta operacional é *"o item «Quartos/áreas» que o CORE-EMP-02 já lista"*. Conferindo o documento, isso não fecha sozinho, por dois motivos:

**2.1 O CORE-EMP-02 dá a «Quartos/áreas» uma rota PRÓPRIA.** [§11:532](../CORE-EMP-02_MAPA_TELAS_MENUS_FLUXOS_OPERACIONAIS.md#L532):

| Página | Rota | Objetivo | Observações |
| --- | --- | --- | --- |
| Quartos/áreas | `/governanca/quartos-areas` | Gestão administrativa de áreas | Não é PMS |

Ou seja: o documento canônico prevê **duas rotas**, e o plano prevê **uma rota com duas portas**. As duas coisas não podem ser verdade ao mesmo tempo. Três saídas:

- **(a) Card no dashboard, sem rota própria** — Governança/Manutenção ganham um card que aponta para `/cadastros/apartamentos?view=mapa`. O CORE-EMP-02 §11 passa a registrar «Quartos/áreas» como atalho, não como rota. **Recomendada:** é literalmente a decisão "tela única, duas portas" já aceita, e é a de menor código.
- **(b) Rota própria que reaproveita o componente** — `/governanca/quartos-areas` renderiza o mesmo client em modo mapa. Fiel ao documento e melhor de linkar/favoritar, mas cria uma segunda URL para a mesma tela — e é exatamente a duplicação que o princípio "não duplica dado nem CRUD" quer evitar (aqui seria duplicação de *rota*, não de dado, mas o efeito de manutenção é parecido).
- **(c) Redirect** — `/governanca/quartos-areas` → `/cadastros/apartamentos?view=mapa`. Preserva a URL do documento sem duplicar tela. Custa um arquivo de 3 linhas.

Recomendo **(a)**, com **(c)** como alternativa barata se você quiser a URL do documento funcionando.

**2.2 «Quartos/áreas» é mais amplo que apartamentos.** O nome e a descrição do §11 ("Gestão administrativa de **áreas**") cobrem também as **áreas operacionais** — que existem em tabela própria, `public.operational_areas` ([004:58](../../supabase/migrations/004_operational_structure.sql#L58)). O mapa desta fase cobre **só `rooms`**.

Então, ou o item de menu vira **«Apartamentos»** (escopo honesto do que a tela faz), ou continua «Quartos/áreas» prometendo áreas que a tela não mostra. Recomendo renomear para **«Mapa de Apartamentos»** no menu operacional e registrar no CORE-EMP-02 que as áreas operacionais ficam para depois — em vez de entregar um item que cumpre metade do nome.

---

## 3. Alternância Lista ⇄ Mapa

Query param, como decidido: `/cadastros/apartamentos` (lista, padrão) e `/cadastros/apartamentos?view=mapa`.

- Lido com `useSearchParams()`; trocar de aba usa `router.replace` (não `push`) para a alternância não empilhar histórico — voltar deve sair da tela, não desfazer cliques de aba.
- Valor inválido (`?view=qualquer`) cai na lista, sem erro.
- **Um só fetch:** a `useQuery` com `queryKey: ["base", "rooms", activeUnitId]` continua no componente pai; lista e mapa consomem o mesmo array em memória. Trocar de aba **não** dispara requisição nova.

**Consequência do `useSearchParams` que precisa ficar dita:** em Next 14 App Router, ele exige `<Suspense>` no componente que o usa, senão o build reclama de *bail out to client-side rendering*. A página fina passa a envolver o client num `<Suspense>` com um fallback simples. É a única mudança estrutural na página.

---

## 4. O mapa

**Agrupamento:** andar → ala → apartamentos. Os dois vêm do mesmo GET, sem chamada nova. Ordem: andar por `floor.number` (Subsolo −1, Térreo 0, 1º 1), ala por nome, apartamento por número.

**Card de porta** (grade responsiva, ~`w-24`): número em destaque, código do tipo (`STD`, `LXCS`…), e marcadores discretos para conjugada e climatização. Borda/fundo pela cor da situação. Todo o detalhe (tipo por extenso, PAX, conjugada, climatização, frigobar) no `title` **e** num rodapé de card visível — `title` sozinho não aparece em toque nem é lido por leitor de tela, mesmo problema que já tratamos nas fatias M3/C6.

**Cores por situação** — reusando o `StatusBadge` da casa, mesmo mapa de tons que a lista já usa (`roomStatusToneMap`), para lista e mapa nunca discordarem:

| Situação | Tom |
| --- | --- |
| Livre | success |
| Ocupado | info |
| Sujo / Em limpeza | warning |
| Manutenção / Bloqueado | danger |
| Inativo | visual |

**Legenda fixa** acima da grade — grade colorida sem legenda obriga a decorar.

**Filtros:** os mesmos da lista (ala, andar, tipo, situação, busca) valem para as duas visões, no mesmo estado. Trocar de aba **preserva** o filtro; é a mesma tela vendo o mesmo recorte de outro jeito.

---

## 5. Portas operacionais (Governança e Manutenção)

Os dois dashboards já usam `ModuleDashboard` com `DashboardCard` que aceita `href` e `status` ([module-dashboard.tsx:8-15](../../src/components/common/module-dashboard.tsx#L8-L15)). Hoje os cards de Governança são todos `status: "Em breve"` sem `href` ([governanca/page.tsx](../../src/app/(app)/governanca/page.tsx)).

Entra em cada um um card **"Mapa de Apartamentos"**, `icon: BedDouble`, `status: "Disponível"`, `href: "/cadastros/apartamentos?view=mapa"`.

**Ponto que precisa de decisão — o card não conhece permissão.** `ModuleDashboard` é um componente estático: renderiza os cards que recebe, sem filtrar por permissão. Quem não tem `BASE:rooms.view` veria o card e levaria 403 ao clicar. Duas saídas:

- **(a)** transformar os dashboards de Governança/Manutenção em client components que filtram os cards com `canDo(permissions, "BASE:rooms.view")` — coerente com o que o sidebar já faz, mas mexe em dois arquivos que hoje são server components estáticos;
- **(b)** aceitar o card visível para todos nesta fase, já que o servidor barra de qualquer modo.

Recomendo **(a)**: mostrar porta que não abre é o oposto do princípio do §2 ("o sistema deve levar o trabalho até o usuário"). E é o mesmo tratamento que demos em M3/C6 — a tela não oferece o que a API recusa.

---

## 6. Atualização do CORE-EMP-02 (parte da entrega)

Como decidido, a navegação é registrada **no repo**:

- **§4 → Cadastros:** acrescentar `Apartamentos` à lista (hoje termina em Fornecedores).
- **§4 → Governança e Manutenção:** acrescentar `Mapa de Apartamentos` (ou ajustar «Quartos/áreas», conforme a decisão do item 2).
- **§11 → Cadastros:** nova linha na tabela — `Apartamentos` · `/cadastros/apartamentos` · "Inventário de UHs: tipo, ala, andar, situação, comodidades." · Admin/Gerência · Existente.
- **§11 → Governança:** ajustar a linha `Quartos/áreas` conforme o item 2 — rota, escopo (só apartamentos nesta fase) e maturidade.

As **§16 (regras de ouro)** respondidas para esta tela, que é o que o documento exige de quem cria tela nova:

| Regra | Resposta |
| --- | --- |
| Processo | Consulta do inventário de UHs; na Fase 3 vira bloqueio/liberação |
| Responsável | Governança e Manutenção (operacional); Admin/Gerência (cadastro) |
| Demanda | Nenhuma nesta fase — read-only |
| Permissão | `BASE:rooms.view` para ver; `block`/`manage` só nas Fases 3 e 4 |
| Unidade | `rooms.unit_id`, escopo `active-unit` no GET |
| Departamento | Governança é dona da operação da UH |
| Histórico | Nada gravado nesta fase; `room_status_history` entra na Fase 3 |
| Encerramento | N/A (consulta) |
| Sensibilidade | Nenhum dado pessoal |
| Dashboard | Indicadores de ocupação/manutenção nascem daqui — fase futura |

---

## 7. Arquivos previstos

| Arquivo | Natureza |
| --- | --- |
| `src/components/base-cadastros/rooms-map.tsx` | novo — a grade |
| `src/components/base-cadastros/rooms-client.tsx` | alterado — alternância, `useSearchParams`, filtros compartilhados |
| `src/app/(app)/cadastros/apartamentos/page.tsx` | alterado — `<Suspense>` |
| `src/app/(app)/governanca/page.tsx` | alterado — card + filtro por permissão |
| `src/app/(app)/manutencao/page.tsx` | alterado — idem |
| `docs/CORE-EMP-02_...md` | alterado — §4 e §11 |

**Nada de:** migration, rota de API, gravação, auth/login/sessão, `permissions.ts` (as três constantes já entraram na Fase 1).

---

## 8. Testes

**Unitário** (`tests/unit/rooms-map.spec.ts`, puro) — a lógica de agrupamento e a resolução da aba, extraídas como funções puras:

1. `groupRoomsByFloorAndBlock`: agrupa e ordena por `floor.number` e nome de ala; apartamento sem ala/andar cai num grupo "Não classificado" em vez de sumir da grade (é o risco real: `block_id`/`floor_id` são nullable na 004).
2. `resolveRoomsView`: `"mapa"` → mapa; ausente/`"lista"`/lixo → lista.
3. Consistência de tons: todo valor do enum `room_status` tem entrada no mapa de tons — se alguém acrescentar um status, o teste cai antes de a grade renderizar cinza silenciosamente.

**Só verificável na tela:** o visual da grade, a legenda, o card nos dashboards e o `<Suspense>` funcionando.

Portões: `npx tsc --noEmit`, `npm run lint`, `npm run test:unit`.

---

## 9. Decisões que preciso antes de implementar

1. **Item 2.1** — porta operacional como **(a) card sem rota**, (b) rota própria reaproveitando o componente, ou (c) redirect de `/governanca/quartos-areas`? Recomendo (a).
2. **Item 2.2** — o item de menu operacional chama-se **«Mapa de Apartamentos»** (escopo real) ou continua «Quartos/áreas» (nome do documento, escopo maior que a tela)? Recomendo renomear e registrar que áreas operacionais ficam para depois.
3. **Item 5** — filtrar os cards dos dashboards por permissão (mexendo em dois server components) ou deixar o card visível para todos nesta fase? Recomendo filtrar.
