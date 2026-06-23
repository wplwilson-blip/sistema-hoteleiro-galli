# Prompt 1b — Plano: Alçada de aprovação de compras

> **Status:** plano para revisão. Nenhum código nesta etapa.
> **Branch:** `prompt-1b-alcada-aprovacao` (a partir de `main`).
> **Área sensível:** mexe na regra de alçada (`NAO_ALTERAR.md`). Plano → revisão → código.

---

## 1. Objetivo

Corrigir dois pontos na autoridade de decisão de compras:

1. Habilitar a **Gerência Administrativa** (e somente ela) a decidir aprovações da alçada
   administrativa (≤ R$200,00). Hoje esse nível está restrito a `SUPER_ADMIN`.
2. Reconhecer o **`NETWORK_MANAGER`** como autoridade de Diretoria (`general_directorate`),
   **escopado por unidade**. Hoje ele tem a permissão `PURCHASES:approvals.decide`
   concedida na migration 064, mas o backend não o reconhece (grant "morto").

Fora de escopo: fornecedor corporativo, caminho duplo de cadastro de colaborador,
Prompts 2–6. Não tocar em Auth, login, Supabase Auth, RLS, snapshot, triggers.

---

## 2. Decisões travadas com o revisor de negócio

| # | Decisão | Valor |
| --- | --- | --- |
| 1 | Quem decide ≤ R$200 | **Somente Gerência Administrativa** (não o `DEPARTMENT_MANAGER` genérico). |
| 2 | Teto do administrativo | **Rígido.** GA é bloqueada de decidir `general_directorate` (acima de R$200 ou evidência crítica), mesmo valor baixo. |
| 3 | `NETWORK_MANAGER` como Diretoria | **Escopado por unidade** (vínculo ativo na unidade da compra), pensando na evolução SaaS/multi-tenant. |
| 4 | Como restringir à GA | **Opção B — permissão explícita.** Sem inferir "departamento administrativo" pelo schema. A capacidade de decidir o nível administrativo é uma concessão deliberada e auditável, no padrão do RH (`profile_permissions` / `user_permission_overrides`). |
| 5 | Cascata de autoridade | **A definir na revisão** — ver seção 4. Recomendação: Diretoria pode decidir ≤R$200; administrativo nunca sobe. |

---

## 3. Verificações obrigatórias no código (antes de escrever qualquer linha)

Estas confirmações no repositório real podem ajustar detalhes do plano. Não inventar
caminho/tabela/função; confirmar in loco.

1. **Assinatura real de `assertCanDecidePurchaseApprovalLevel`** em
   `src/lib/purchases/approval-authorization.ts`: parâmetros, de onde vêm `unit_id` da
   compra e `approval_level`. Docs indicam que `approval_level` vem do snapshot pendente
   — confirmar.
2. **Como `NETWORK_MANAGER` carrega unidades**: se usa `user_unit_links` por unidade
   (então o check "vínculo ativo na unidade da compra" é idêntico ao `UNIT_DIRECTOR`),
   ou se é modelado como "todas as unidades da org" sem links explícitos (então o check
   precisa ler escopo org-level). **Isto define a regra de escopo do item 3.**
3. **Mapeamento da Opção B às permissões da migration 064**: confirmar se reaproveitamos
   `PURCHASES:approvals.decide` para ambos os níveis e separamos a alçada na lógica, ou se
   convém um código distinto para o nível administrativo (ex.
   `PURCHASES:approvals.decide.administrative`). Decisão registrada após a verificação.
4. **Padrão-ouro `src/lib/hr/api-auth.ts`**: replicar a forma como o RH resolve
   perfil + `profile_permissions` + `user_permission_overrides` + escopo de unidade +
   atalho de `SUPER_ADMIN`. Não duplicar lógica; reusar helpers existentes.

---

## 4. Ponto aberto para a revisão — cascata de autoridade

A autoridade decai para baixo? Duas leituras:

- **Exclusiva por nível:** só GA decide ≤R$200; só Diretoria decide >R$200. Risco
  operacional: se não houver GA disponível, uma compra de R$50 trava esperando
  especificamente a GA.
- **Cascata para baixo (recomendada):** Diretoria (UNIT_DIRECTOR / NETWORK_MANAGER) também
  pode decidir ≤R$200; o administrativo **nunca** sobe para `general_directorate`.
  `SUPER_ADMIN` decide tudo.

**Recomendação:** cascata para baixo. Confirmar antes do código.

---

## 5. Mudanças previstas (sem código)

### 5.1 `src/lib/purchases/approval-authorization.ts`
A função passa a validar **os dois níveis explicitamente**:

- `approval_level = administrative` (≤R$200): autoridade = quem tem a permissão de decisão
  administrativa (Opção B) **escopada à unidade da compra**, + cascata de cima (se
  aprovada), + `SUPER_ADMIN`.
- `approval_level = general_directorate` (>R$200 **ou** evidência crítica):
  autoridade = `UNIT_DIRECTOR` **ou** `NETWORK_MANAGER`, ambos com vínculo ativo na
  unidade da compra, + `SUPER_ADMIN`. **`SUPER_ADMIN` não é Diretoria automática** por
  herança — continua sendo atalho explícito, como hoje.
- **Bloqueio rígido:** administrativo tentando decidir `general_directorate` →
  rejeição explícita (não silenciosa). Sem atalho por valor que contorne a evidência
  crítica.

### 5.2 Migration de grant
- Aditiva, idempotente (não recria concessão existente), com rollback documentado
  (deletar as linhas concedidas).
- Concede a capacidade de decisão administrativa à Gerência Administrativa conforme
  Opção B + resultado da verificação #3.
- O `NETWORK_MANAGER` já tem `approvals.decide` na 064; pode **não precisar** de migration
  nova — talvez só o código reconhecê-lo. Confirmar na verificação #2/#3 antes de incluir
  qualquer linha de grant para ele.

---

## 6. Cobertura operacional (olhar de operação hoteleira)

- **Fronteira em R$200,00:** a regra diz "até R$200 = GA", logo R$200,00 **é GA** (≤, não <).
  Garantir que o cálculo da alçada no envio/reenvio e o check de decisão concordem na
  mesma fronteira.
- **Evidência crítica:** força `general_directorate` independente do valor → GA não decide
  crítica nem de R$10. O bloqueio rígido cobre, mas validar que a função não tem atalho
  por valor que ignore a classificação documental.
- **Snapshot legado sem `approval_level` claro:** manter comportamento atual (consulta /
  rastreabilidade, sem decisão direta).

---

## 7. Estratégia de teste (fase pré-operação)

**Contexto:** sistema ainda não está em uso; banco único (o mesmo que o Vercel publica),
sem dado real a preservar. `.env.local` aponta para o mesmo Supabase do deploy.

- Nesta fase, **reset/recriação de banco é aceitável** como ferramenta de teste. Isso
  **deixa de valer** quando o hotel entrar em operação — aí a trava de auditoria/soft
  delete e o `NAO_ALTERAR.md` voltam a proibir destruição de dado.
- **Não há isolamento local vs. deploy:** testar local mexe no mesmo banco final. Aceitável
  agora; antes do Prompt 2 (RLS) recomenda-se um projeto Supabase de staging separado.

Plano de teste do 1b:

1. **Teste unitário da lógica** (sem banco) de `assertCanDecidePurchaseApprovalLevel`:
   - GA ≤R$200 → ok
   - GA >R$200 → bloqueado
   - GA evidência crítica (qualquer valor) → bloqueado
   - `NETWORK_MANAGER` com vínculo na unidade da compra → ok
   - `NETWORK_MANAGER` sem vínculo na unidade da compra → bloqueado
   - `UNIT_DIRECTOR` na unidade → ok (comportamento atual preservado)
   - `SUPER_ADMIN` → ok em tudo
   - (se cascata aprovada) Diretoria decidindo ≤R$200 → ok
2. **Migration de grant** aplicada sem cerimônia (aditiva/idempotente), com `SELECT` de
   conferência antes/depois e rollback pronto.
3. **Revisão do diff** antes do commit final.

---

## 8. Critério de aceite

- GA decide ≤R$200 e é bloqueada acima disso e em evidência crítica.
- `NETWORK_MANAGER` decide `general_directorate` apenas em unidade onde tem vínculo ativo.
- `UNIT_DIRECTOR` e `SUPER_ADMIN` mantêm o comportamento atual.
- Nenhuma alteração em Auth, login, RLS, snapshot ou triggers.
- Lint e build passam; testes unitários da função passam.

---

## 9. Sequência de entrega

1. Este plano em `docs/codex/1b-plano-alcada.md` → commit + push → **revisão** (etapa atual).
2. Após OK: verificações da seção 3 no código real.
3. Código (lógica + migration) conforme decisões fechadas.
4. Teste unitário + diff revisado → commit final.
