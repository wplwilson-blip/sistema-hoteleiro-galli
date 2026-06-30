# Diagnóstico de Multi-Tenant Readiness — Sistema Hotel Galli

Análise da prontidão do schema atual para evoluir de "sistema da rede Galli" para "SaaS
multi-cliente", sem que isso vire reescrita. Base: 69 migrations, 97 tabelas, RLS em construção.

**Veredito em uma linha:** a fundação é **boa** e o caminho para SaaS é **refactor, não
reescrita** — mas há **um furo conceitual estrutural** (perfis/permissões globais) e **uma
decisão de identidade** (usuário pertence a quem?) que precisam ser resolvidos ANTES de abrir
para o segundo cliente. Nenhum dos dois bloqueia fechar o sistema para a Galli agora.

---

## 1. O que já está PRONTO para multi-tenant (a boa notícia)

O sistema nasceu com a espinha dorsal certa: existe a tabela `organizations`, e `units` referencia
`organization_id` com `not null`. Isso significa que o conceito de "cliente = organização" já
existe no modelo — você não precisa inventá-lo, só consolidá-lo.

**~60 tabelas de negócio já carregam `organization_id` diretamente**, incluindo todas as mais
críticas: `purchase_requests`, `purchase_quotes`, `purchase_approval_snapshots`, `suppliers`,
`employees`, `departments`, `job_positions`, e praticamente todo o módulo HR
(`hr_workflows`, `hr_job_candidates`, `employee_documents`, etc.). Onde há dado sensível de
negócio, o tenant está amarrado. Isso é exatamente o que se quer.

**As tabelas SEM `organization_id` direto se dividem em dois grupos** — e a maioria é inofensiva:

- **Herdam o tenant via FK (não são furos):** `rooms`, `blocks`, `floors`, `cost_centers`,
  `unit_settings` — todas têm `unit_id NOT NULL → units.organization_id`. O tenant é alcançável
  por join. As tabelas-filhas (`purchase_quote_items`, `employee_evaluation_scores`,
  `hr_workflow_steps`, etc.) herdam do pai. Para RLS, basta a policy subir pela FK. **OK.**
- **Globais legítimas (compartilháveis entre clientes):** `system_statuses`, `request_types`,
  `attachment_types`, `operational_categories`. São catálogos de referência; faz sentido serem
  compartilhados ou clonados por tenant. **Decisão de produto, não furo de segurança.**

---

## 2. Os DOIS pontos estruturais que exigem decisão (o cerne)

### 🔴 PONTO 1 — Perfis e permissões são GLOBAIS, não por tenant

`access_profiles`, `permissions` e `profile_permissions` **não têm `organization_id`**. Hoje, com
um único cliente (Galli), isso funciona: os perfis (`SUPER_ADMIN`, `DEPARTMENT_MANAGER`, etc.) são
compartilhados. Mas num SaaS isso cria **dois problemas sérios**:

1. **`access_profiles.code` tem `unique (code)` global.** Se o Cliente A criar um perfil "GERENTE"
   e o Cliente B quiser o seu próprio "GERENTE", **colidem** — a constraint não deixa. Pior: um
   cliente poderia ver/herdar perfis de outro.
2. **Não há isolamento de configuração de acesso por cliente.** Cada cliente SaaS vai querer
   definir seus próprios perfis e permissões. Hoje, todos partilham o mesmo conjunto.

**Por que é estrutural:** `access_profile_id` está referenciado em `user_unit_links`,
`profile_permissions`, `user_permission_overrides` e em toda a lógica de autorização
(`permissions.ts`, `requirePermission`). Mudar o modelo de perfis depois toca **a fundação inteira
de autorização** — é o tipo de mudança que, feita tarde, é cirurgia de coração aberto.

**Importante:** isto **não** te impede de fechar para a Galli. Com um cliente, perfis globais
funcionam perfeitamente. É uma decisão a tomar **antes do segundo cliente** — e a tomar **de olhos
abertos agora**, para não escrever mais código que dependa de perfis globais de um jeito difícil
de desfazer.

### 🟡 PONTO 2 — `app_users` não tem tenant: o usuário pertence a quem?

`app_users` não tem `organization_id`. O vínculo do usuário com o negócio é **indireto**, via
`user_unit_links` (usuário → unidade → organização). Isso levanta a pergunta de identidade mais
importante de qualquer SaaS:

**Um usuário pode pertencer a mais de um cliente (tenant)?**

- Hoje, na Galli: um usuário tem vínculos com unidades da Galli. Como só existe a Galli, todos os
  vínculos de um usuário são do mesmo tenant — funciona por acidente feliz.
- Num SaaS: se o usuário "joao" da rede A e o "joao" da rede B forem o mesmo registro `app_users`
  (porque `username` tem `unique` global), você tem um vazamento de identidade entre clientes.
  `app_users_username_unique` e `app_users_auth_email_unique` são **globais** — dois clientes não
  podem ter um usuário "gerente" cada.

**A decisão:** o modelo mais comum e seguro em SaaS B2B é **um usuário pertence a um tenant**
(`app_users.organization_id`), e os `unique` de username/email passam a ser por tenant
(`unique (organization_id, username)`). A alternativa (usuário global que acessa vários tenants)
é mais complexa e raramente necessária no seu caso — hotéis não compartilham funcionários entre
redes concorrentes.

**Por que decidir cedo:** `app_user_id` está em toda parte (vínculos, auditoria, overrides,
`created_by`/`updated_by` em quase tudo). Decidir o modelo de identidade depois é caro.

---

## 3. O estado do RLS (a fundação de isolamento)

O RLS está **em construção e no caminho certo, mas hoje filtra por UNIDADE, não por TENANT.**

- A função-chave é `public.user_has_unit_access(unit_id)` — verifica se o usuário tem vínculo com
  aquela unidade (via `user_unit_links`). As policies das migrations 066 (não-sensível) e 069
  (HR sensível) usam essa função.
- **O ponto crítico para SaaS:** filtrar por unidade que o usuário acessa **já isola tenants como
  efeito colateral** — porque um usuário só tem `user_unit_links` para unidades da sua própria
  organização. **DESDE QUE** o Ponto 2 (usuário pertence a um tenant) seja garantido. Se um
  usuário pudesse ter vínculo com unidades de tenants diferentes, o isolamento quebraria.
- **Recomendação técnica:** quando completar o RLS (está pela metade), adicionar uma camada
  explícita de tenant — uma função `user_belongs_to_organization(org_id)` e policies que checam
  organização nas tabelas que têm `organization_id` diretamente. Isso é **defesa em profundidade**:
  mesmo que um vínculo de unidade vaze, a checagem de organização segura. Fazer isso agora custa
  quase o mesmo que fazer "só por unidade" e serve aos dois mundos (Galli + SaaS).

**Tradução:** o RLS que você ainda vai escrever é o momento mais barato para acertar o isolamento
de tenant. Se escrever só por unidade, retrabalho depois. Se escrever pensando em organização
também, ganha as duas coisas de uma vez. **Este é o principal motivo de pensar no SaaS agora.**

---

## 4. Veredito por categoria (o que trava, o que não trava)

| Área                                  | Estado para SaaS          | Ação                                              |
| ------------------------------------- | ------------------------- | ------------------------------------------------- |
| Tabelas de negócio com `organization_id` | ✅ Pronto              | Manter o padrão; nada nasce sem tenant.           |
| Tabelas-filhas (herança via FK)       | ✅ OK                      | RLS sobe pela FK.                                 |
| **Perfis/permissões globais**         | 🔴 Decisão estrutural     | Definir tenant em `access_profiles` antes do 2º cliente. |
| **Identidade do usuário (`app_users`)** | 🟡 Decisão estrutural   | Definir "usuário pertence a 1 tenant"; unique por org. |
| RLS (isolamento)                      | 🟡 Em construção          | Completar pensando em organização, não só unidade. |
| Catálogos globais (`system_statuses`…) | ✅ Aceitável              | Decisão de produto (compartilhar vs clonar).      |
| Onboarding/cobrança/planos            | ⚪ Não existe              | Categoria SaaS pura — adiável sem dívida.         |
| UI de config (perfis, permissões)     | ⚪ Parcial                 | Feature de produto — adiável.                     |

Legenda: ✅ pronto/seguro · 🔴 estrutural, decidir antes do 2º cliente · 🟡 estrutural, decidir
ao completar RLS · ⚪ adiável sem dívida.

---

## 5. Recomendação de sequência (sem desviar de "fechar para a Galli")

1. **Agora — fechar para a Galli** (T3, bug do `units[0]`, fluxos): nada disso conflita com SaaS.
   Só manter a disciplina: **nenhuma tabela nova nasce sem `organization_id`** (ou herança clara
   via FK), e nenhuma lógica nova assume "existe um único cliente".
2. **Ao completar o RLS** (próximo grande bloco): escrever as policies **pensando em organização**,
   não só unidade. Adicionar `user_belongs_to_organization()`. Serve Galli (LGPD, defesa em
   profundidade) **e** é a fundação do isolamento SaaS. **Maior ganho com menor custo marginal.**
3. **Antes de abrir para o 2º cliente** (a fronteira real do SaaS): resolver os dois pontos
   estruturais — tenant em `access_profiles`/`permissions` (Ponto 1) e identidade de usuário por
   tenant (Ponto 2). São migrations planejadas, com cuidado, em área sensível.
4. **Quando o SaaS for comercial:** onboarding self-service, cobrança, planos. Categoria adiável.

---

## 6. Conclusão

O sistema **não está numa armadilha de reescrita**. A escolha de nascer multiunidade com
`organizations`/`units`/`organization_id` foi acertada e poupa você de meses de retrabalho. O
caminho para SaaS é evolutivo.

Os **dois únicos riscos estruturais** — perfis/permissões globais e identidade de usuário sem
tenant — não bloqueiam fechar para a Galli, mas **devem ser resolvidos antes do segundo cliente**,
e devem ser **levados em conta agora** para não acumular código que os torne difíceis de mudar.

A **maior alavanca isolada** é o RLS: como está sendo escrito agora, é a oportunidade mais barata
de embutir isolamento de tenant. Acertar ali resolve metade do problema de SaaS de graça, enquanto
entrega defesa em profundidade e conformidade que a Galli já precisa.

> Regra de ouro daqui pra frente: **toda tabela nova tem `organization_id` (ou herança clara via
> FK), e toda policy de RLS pensa em organização, não só em unidade.** Seguindo isso, "saasificar"
> continua sendo refactor — nunca reescrita.
