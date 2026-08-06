# Plano de discussão — #2: isolamento sem rede de segurança no banco

**ARQUITETURA. NÃO IMPLEMENTAR.** Este documento existe para você decidir. Nenhum código,
nenhuma migration, nenhum branch de implementação.

---

## 0. Evidência reconferida

- **28 arquivos** sob `src/app/api` importam `createSupabaseAdminClient` (contagem real).
  `src/lib/supabase/admin.ts` usa a **service_role key**, que **ignora RLS por definição**.
- **Não existe `middleware.ts`** — nem em `src/`, nem na raiz. Confirmado. Não há ponto
  único por onde toda requisição passe.
- `getInitialOrganizationId` — `src/lib/base-cadastros/api-helpers.ts:44-64`: seleciona a
  **primeira organização ativa por `created_at`**. Confirmado. É a materialização da
  premissa mono-org: não há noção de "a org **deste** usuário", há "a org".

**Portanto**, e isto é o fato que atravessa toda a auditoria: **a barreira de isolamento em
runtime é o `.in("unit_id", accessibleUnitIds)` e os asserts de escopo espalhados por cada
rota.** As policies das migrations 066/078 não protegem o caminho da aplicação. Elas só
valem para acesso direto ao PostgREST com chave `anon`/`authenticated`.

O achado #1 é a demonstração empírica disso: **um** loader sem assert = escrita cruzada de
unidade. Não houve segunda linha de defesa porque não existe segunda linha de defesa.

---

## 1. A pergunta real

Não é "RLS ou gate central". É: **quantos lugares precisam estar certos para que o
isolamento se sustente?**

Hoje a resposta é: **todos os ~28 arquivos de rota, para sempre, em cada nova rota, por cada
pessoa que escrever uma.** É um modelo em que a segurança é uma propriedade da disciplina,
não da estrutura. O #1 mostra o custo: passou.

No SaaS multi-cliente, a mesma falha deixa de ser "gerente vê outra unidade do mesmo hotel"
e passa a ser "cliente A escreve no banco do cliente B". A gravidade de **cada** rota
esquecida muda de categoria.

---

## 2. Opção 1 — RLS no caminho quente (abandonar service_role nas leituras/escritas de negócio)

Trocar `createSupabaseAdminClient` por um cliente que carrega o JWT do usuário nas rotas de
negócio, deixando o banco recusar o que a policy não permite. `service_role` fica restrito
ao que realmente precisa (setup, cron, auth).

**A favor**
- A barreira passa a ser **inescapável**: uma rota nova que esqueça o filtro simplesmente
  não retorna linha alheia. Falha fechada, não aberta.
- Aproveita as migrations 066/078 que **já existem** — o trabalho de policy está em boa
  parte feito.
- É o modelo para o qual o Supabase foi desenhado; a documentação, os helpers e o
  `user_has_unit_access` já apontam para lá.

**Contra**
- **Migração larga:** 28 arquivos, e cada um precisa ser reverificado (o que hoje funciona
  por service_role pode silenciosamente parar de retornar linhas).
- As policies existentes cobrem SELECT razoavelmente; **INSERT/UPDATE/DELETE precisam ser
  auditadas tabela a tabela**. Onde faltar policy de escrita, a rota quebra.
- Cron e jobs (`run-jobs`, `apply-due`) não têm sessão de usuário — **continuam** em
  service_role. Ou seja, a superfície não some, encolhe.
- Custo de performance: policies com subconsulta rodam por linha.
- Risco de regressão funcional alto e difuso, difícil de cobrir por teste unitário.

---

## 3. Opção 2 — gate central de tenant (middleware + contexto obrigatório)

Manter service_role, mas introduzir um `middleware.ts` e/ou um wrapper obrigatório de rota
que resolve o tenant/unidades **uma vez** e entrega um cliente já "amarrado" — por exemplo,
um objeto que **não expõe** `.from()` cru, só métodos que exigem escopo explícito.

**A favor**
- Incremental: dá para adotar rota a rota, sem *big bang*.
- Não toca em policies, migrations, nem no comportamento do banco. Risco de regressão
  funcional muito menor.
- Resolve o problema de **esquecimento** (o tipo não compila sem escopo) sem resolver o de
  **contorno** — e esquecimento é o que causou o #1.
- Combina com o achado #9: o gate central é o lugar natural para resolver permissão **uma
  vez** por request.

**Contra**
- **Continua sendo defesa em uma camada só, na aplicação.** Um bug no gate, ou uma rota que
  o contorne, e não há rede embaixo. É exatamente a crítica do achado.
- `middleware.ts` no Next roda no runtime edge por padrão e **não** deve ser a única trava
  de autorização (não tem acesso confortável ao Postgres). O gate útil é o wrapper de
  handler, não o middleware.
- Exige disciplina de code review para que ninguém importe `createSupabaseAdminClient`
  direto — mitigável com uma **regra de ESLint** que proíba o import fora de uma allowlist.
  Essa regra, sozinha, já vale muito.

---

## 4. Opção 3 — as duas, em ordem

1. **Agora:** gate central + regra de ESLint proibindo `createSupabaseAdminClient` fora de
   uma allowlist (auth, setup, cron). Isso torna **impossível** repetir o #1 por
   esquecimento, e é barato.
2. **Antes do SaaS:** RLS no caminho quente, usando o gate como ponto único de injeção do
   cliente — a troca passa a ser em **um** lugar, não em 28.
3. **Junto com 2:** o reescopo de policies do doc [52](52-plano-rls-catalogos-permissao.md),
   que hoje é preparatório e passa a ser carregante.

**Minha recomendação é a Opção 3.** O motivo: a Opção 1 sozinha é a resposta certa para a
pergunta errada *agora* — ela é cara, arriscada e o sistema ainda é mono-org, então o
retorno imediato é baixo. A Opção 2 sozinha nunca vira rede de segurança. A ordem 3 entrega
a proteção contra o modo de falha **real e demonstrado** (esquecimento) já, e cria a
alavanca que torna a RLS viável depois.

---

## 5. O que a decisão trava ou destrava

- **Doc 52 (#6, policies de catálogo)** — só faz diferença prática se a Opção 1 entrar. Sem
  ela, é higiene preparatória. Vale entregar o `.sql` de qualquer forma.
- **`getInitialOrganizationId`** — é insustentável em SaaS e precisa morrer na Opção 1 **e**
  na 2. Substituto: `organizationId` derivado da sessão. Isso é uma fatia própria, e é
  provavelmente o **primeiro** passo concreto de qualquer caminho.
- **Achado #9 (N+1)** — o gate central é o lugar onde a resolução única de permissão por
  request faz sentido. Se a Opção 2/3 for adotada, o plano 53 (Fatia B, batch) fica mais
  fácil.

---

## 6. Perguntas que preciso que você responda

1. **Horizonte do SaaS multi-cliente**: meses ou ano(s)? Isso define se a RLS é urgente ou
   preparatória.
2. **Um cliente = uma organização, ou um cliente = várias organizações?** O modelo de
   tenant muda a policy inteira.
3. **Aceita a regra de ESLint** proibindo `createSupabaseAdminClient` fora de allowlist?
   (É barata, imediata, e sozinha impede a repetição do #1.)
4. **Tolerância a regressão funcional** numa migração de 28 rotas para RLS — existe janela
   para isso, com teste em staging?

---

## 7. O que este documento NÃO faz

- Não altera nenhum arquivo de produção.
- Não propõe reescrita, troca de stack ou refatoração arquitetural fora do que você pediu
  para avaliar neste achado específico.
- Não entrega `.sql`. O `.sql` do #6 está no doc 52 e é independente desta decisão.
