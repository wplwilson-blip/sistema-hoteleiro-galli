# 42 — Trava no banco de cotações em dossiê formal ativo

Branch: `fix/purchase-quote-dossier-lock`
Migration: `supabase/migrations/080_purchase_quote_dossier_lock.sql` (puramente aditiva)

## Problema

Uma cotação (`purchase_quotes`) que já entrou em um dossiê formal de aprovação
(`purchase_approval_snapshots`) não pode ser alterada nem apagada, para preservar a
auditoria. Até aqui isso era garantido **apenas em código de aplicação**
(`assertQuoteIsNotInFormalDossier` na rota de quotes), que:

- tem lógica que depende do formato do JSON do snapshot;
- só verifica a cotação diretamente endereçada — o caminho de "selecionar nova vencedora"
  faz um **bulk update** (`update ... where purchase_request_id = X and id <> vencedora`)
  que toca a vencedora anterior **mesmo que ela esteja congelada** num dossiê;
- tem janela de corrida entre a checagem e a escrita.

Faltava uma garantia no próprio banco.

## Solução

Trigger `before update or delete` em `public.purchase_quotes` que, linha a linha, recusa
qualquer UPDATE/DELETE de uma cotação que integre um dossiê **ativo**, levantando
`PURCHASE_QUOTE_LOCKED_IN_DOSSIER`. A trava de aplicação continua como primeira linha de
defesa; o trigger é a rede de segurança por baixo.

### 1. `public.purchase_quote_in_active_dossier(p_quote_id uuid) returns boolean`

`plpgsql`, `security definer`, `set search_path = public`. Retorna `true` se existir um
snapshot que **referencie** a cotação **e** esteja **ativo**:

- **Referência**: `selected_quote_id = p_quote_id` **ou** presença do id dentro do
  `snapshot_payload` jsonb — conferindo `selectedQuote.id`, `recommendedQuote.id` e
  qualquer `quotes[*].id` (vencedora, recomendada e concorrentes). A inspeção do JSON usa
  `jsonb_path_exists` com variável (`$qid`), ou seja, consulta estruturada — nunca
  conversão do payload para texto.
- **Ativo**: `snapshot_status in ('pending','approved','rejected') and deleted_at is null`.

### 2. `public.enforce_purchase_quote_dossier_lock() returns trigger`

`plpgsql`, `security definer`, `set search_path = public`.
- `TG_OP = 'DELETE'`: se travada → `raise exception 'PURCHASE_QUOTE_LOCKED_IN_DOSSIER'`;
  senão `return old`.
- `TG_OP = 'UPDATE'`: se travada → mesma exceção; senão `return new`.
- Bloqueio **total** no UPDATE (não compara coluna a coluna).

### 3. Trigger

```sql
create trigger purchase_quote_dossier_lock
  before update or delete on public.purchase_quotes
  for each row execute function public.enforce_purchase_quote_dossier_lock();
```

## Por que `returned_to_purchases` e `superseded` NÃO travam

O ciclo de vida do dossiê prevê que, ao **devolver para Compras**
(`returned_to_purchases`) ou ao **substituir** um dossiê por outro (`superseded`), a
solicitação volta a ser revisável: Compras precisa poder trocar a vencedora, reeditar
valores e refazer a cotação. Se esses estados travassem a cotação, a devolução ficaria
sem efeito prático. Por isso o "dossiê ativo" é restrito a `pending` (aguardando decisão),
`approved` e `rejected` (decisões formais imutáveis, que devem permanecer intactas para
auditoria). Isso é consistente com a rota de decisão, que só congela de fato quando há um
snapshot pendente/decidido, e com a rota de quotes, que reabre a revisão em
`returned_to_purchases`.

## Segurança / grants

Seguindo o padrão de `008_triggers_updated_at_soft_delete_audit.sql` e
`009_rls_policies_base.sql`: ambas as funções são `security definer` com `search_path`
fixo (`public`), e o trigger dispara pelo dono da tabela — não é necessário `grant execute`
para roles de aplicação. Como `security definer` executa como dono da tabela, a função
enxerga todos os snapshots (inclusive sob RLS), que é exatamente o comportamento desejado
para a rede de segurança.

## Restrições respeitadas (NAO_ALTERAR.md)

- Não foram alteradas tabelas, colunas, enums, RLS, Auth, login nem migrations existentes.
- `assertQuoteIsNotInFormalDossier` e a rota de quotes permanecem **intactas** — a trava
  de aplicação continua como primeira linha de defesa; esta migration só acrescenta uma
  função auxiliar, uma função de trigger e um trigger.
- A migration **não foi aplicada** no banco — apenas o arquivo `.sql` foi criado.
- Sem dependências novas.

## Como aplicar

Rodar o conteúdo de `supabase/migrations/080_purchase_quote_dossier_lock.sql` no
Supabase SQL Editor.
