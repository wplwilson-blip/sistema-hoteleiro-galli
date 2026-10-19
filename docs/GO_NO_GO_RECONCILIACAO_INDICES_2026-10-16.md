# GO / NO-GO — Reconciliação de Índices — 2026-10-16

**Documento de decisão técnica.** Reúne as evidências arquivadas e dá o veredito sobre a migration
seletiva. **Não autoriza aplicação por si só, e nada foi aplicado ao escrevê-lo.**

| | |
| --- | --- |
| **Migration** | `supabase/migrations/20260918120033_hr_workflow_idempotency_indexes_parity.sql` |
| **Escopo técnico** | 3 índices: `_unit_idx`, `_workflow_idx`, `_actor_idx` |
| **Commit de referência** | `b29055b` (`main` = `origin/main`) |
| **Blob Git da migration em `b29055b`** | `ff9fa1115504cee3096a689cef5b1c8b04512703` |
| **Ambiente-alvo** | produção (`hotel-galli-admin`) |

Evidências consolidadas:

- [`PLANO_RECONCILIACAO_MIGRATIONS.md`](PLANO_RECONCILIACAO_MIGRATIONS.md): §12 (runbook), §13–§14
  (decisão dos nove), §15 (TTL), §16 (teste descartável)
- [`PREFLIGHT_STAGING_RECONCILIACAO_MIGRATIONS_2026-09-18.md`](PREFLIGHT_STAGING_RECONCILIACAO_MIGRATIONS_2026-09-18.md)
- [`PREFLIGHT_PRODUCAO_RECONCILIACAO_MIGRATIONS_2026-09-21.md`](PREFLIGHT_PRODUCAO_RECONCILIACAO_MIGRATIONS_2026-09-21.md)
- [`TESTE_LOCAL_RECONCILIACAO_INDICES_2026-10-16.md`](TESTE_LOCAL_RECONCILIACAO_INDICES_2026-10-16.md)

---

## 1. Achado ao consolidar: o blob da migration mudou depois dos preflights

Os dois preflights (staging em 2026-09-18, produção em 2026-09-21) e o roteiro
[`PREFLIGHT_PRODUCAO_RECONCILIACAO_MIGRATIONS.md`](PREFLIGHT_PRODUCAO_RECONCILIACAO_MIGRATIONS.md)
§3 registram como identidade esperada:

```text
74ccd8e2a2a8d322f1e1a1c423e92f86a5da13ee   (a1cfbb4)
```

Em `b29055b` o blob é outro:

```text
ff9fa1115504cee3096a689cef5b1c8b04512703   (b29055b)
```

**Causa, conferida em `git diff a1cfbb4 b29055b`:** o commit `b29055b` reescreveu **só o cabeçalho
de comentários**, trocando "paridade" por "restauração de 3 de 9". **Nenhuma linha executável
mudou.** Os três `create index if not exists` são idênticos nas duas versões.

**Consequências:**

- **As evidências continuam valendo.** Os preflights mediram o banco, e o SQL que importa para eles
  não mudou. O teste local já rodou o SQL da versão `b29055b`.
- **O valor esperado do preflight de última hora estava desatualizado.** Quem seguisse o roteiro ao
  pé da letra veria blob divergente e **pararia**, o que seria o comportamento correto do roteiro.
- **A partir deste documento, o blob esperado é `ff9fa111…`**, desde que o commit de aplicação seja
  `b29055b` ou um descendente que não altere o arquivo. **O roteiro genérico foi alinhado** (P1): o §3
  agora espera `b29055b` / `ff9fa111…` e explica a mudança. As evidências históricas de staging e
  produção continuam com `74ccd8e2…`, que era o valor correto na data em que foram feitas.

---

## 2. Matriz final de decisão

| Critério | Evidência | Estado | Bloqueante? |
| --- | --- | --- | --- |
| **Git** — migration versionada | `b29055b`, blob `ff9fa111…`. A diferença para `74ccd8e2…` é só de comentários (§1) | ✅ | Não |
| **Git** — documentação versionada | Plano, preflights e decisão dos nove em `b29055b`. Este pacote (teste local, GO/NO-GO e atualizações) fica versionado pelo commit que o contém | Checkpoint documental (P2) | Não. Antes da aplicação, confirmar em `main` e `origin/main` |
| **Git** — working tree limpa | Exigida no momento da aplicação | Conferir no preflight de última hora | Não |
| **Staging** — preflight concluído | 2026-09-18, arquivado | ✅ | Não |
| **Staging** — 3 índices já existiam | 11 índices medidos. A migration seria no-op lá | ✅ | Não |
| **Staging** — §12.3 | `conforme = true` nos três | ✅ | Não |
| **Staging** — §12.4 | 0 linhas (caso B) | ✅ | Não |
| **Produção** — volume | **11 linhas** | ✅ | Não |
| **Produção** — tamanho | **80 kB** total · **16 kB** heap · **32 kB** índices | ✅ | Não |
| **Produção** — índices existentes | **2** (`_pkey`, `_unique_idx`) | ✅ medido | Não |
| **Produção** — históricos ausentes | **9** dos 11 da `023` | ✅ medido | Não |
| **Produção** — selecionados para restauração | **3** (`unit`, `workflow`, `actor`) | ✅ decidido (§14.1 do plano) | Não |
| **Produção** — deliberadamente não restaurados | **6**, cada um com justificativa e gatilho de reavaliação | ✅ decidido (§14.2 do plano) | Não |
| **Produção** — §12.3 | Os 3 selecionados com `existe = false` | ✅ esperado | Não |
| **Produção** — §12.4 | **0 concorrentes** (caso A, exercitado de verdade) | ✅ | Não |
| **Produção** — locks | Nenhum sobre a tabela | ✅ | Não |
| **Produção** — bloqueios | Nenhum, e nenhuma transação antiga | ✅ | Não |
| **Produção** — escrita | **0 escritas** em 3h02min38s de janela medida | ✅ | Não |
| **Teste local** — estado inicial | **2 índices**, como em produção | ✅ | Não |
| **Teste local** — aplicar 3 | Total **5** | ✅ | Não |
| **Teste local** — §12.3 | Os três com `existe = true`, `conforme = true` | ✅ | Não |
| **Teste local** — §12.4 | **0 linhas** | ✅ | Não |
| **Teste local** — reaplicar | Total continua **5**. No-op | ✅ | Não |
| **Teste local** — seis excluídos | Ausentes na listagem final | ✅ | Não |
| **Rollback** | §12.6, condicionado ao preflight arquivado. Produção registrou `esperado_existe = false` nos três | ✅ condicionado | Não. O preflight de última hora também precisa ser arquivado |
| **TTL / cleanup** | Dívida separada (§15 do plano). Não implementado | 🟡 registrado | **Não bloqueia esta migration** |
| **Identidade da migration** | Roteiro alinhado: espera `ff9fa111…` / `b29055b` (§1) | ✅ (versionado com P2) | Não |
| **Janela operacional** | Recomendada (fora de 6h–8h e 14h–16h), **não fixada** | 🟡 | **Sim, até fixar** (P3) |
| **Mecanismo de aplicação** | §5 do plano: `db push` só depois do `repair` das legadas. **Não executado em nenhum ambiente** | 🟡 | **Sim, até decidir** (P4) |

---

## 3. Decisão final

```text
GO CONDICIONADO
```

### Por que não `NO-GO`

Não resta divergência técnica sem explicação:

- o escopo está correto: 3 de 9, com os 6 restantes decididos e justificados;
- o caminho de criação, que nunca tinha rodado, **rodou e conferiu**;
- o estado de produção medido é compatível com a aplicação;
- a mudança de blob está explicada: só comentários, verificado por `git diff`.

### Por que não `GO`

Ainda há **condições operacionais** a cumprir. Nenhuma delas põe em dúvida o conteúdo da migration,
mas são pré-requisitos reais:

- o checkpoint documental (P2) tem de estar em `main` e `origin/main` no momento da aplicação;
- janela não fixada;
- mecanismo de aplicação em produção não decidido;
- o estado de produção é de **2026-09-21**. Para valer, precisa ser repetido imediatamente antes.

### O que este veredito é, e o que não é

```text
O teste local elimina o bloqueio técnico do caminho de criação,
mas não substitui o preflight de última hora em produção.
```

`GO CONDICIONADO` **não autoriza aplicação.** Diz que, cumpridas as condições abaixo, **não há
impedimento técnico conhecido** para alguém com autoridade sobre o banco decidir aplicar.

---

## 4. Condições

### 4.1 Pré-requisitos, antes de marcar a aplicação

| # | Condição | Por quê |
| --- | --- | --- |
| **P1** | ✅ **Resolvido.** O §3 do roteiro [`PREFLIGHT_PRODUCAO_RECONCILIACAO_MIGRATIONS.md`](PREFLIGHT_PRODUCAO_RECONCILIACAO_MIGRATIONS.md) foi alinhado com `b29055b` e o blob `ff9fa111…` | Evitava a falsa parada por blob divergente (§1). Versionado junto com P2 |
| **P2** | **Checkpoint documental.** A condição é satisfeita pelo commit que versiona este documento e as evidências associadas. **Antes da aplicação, confirmar que o commit autorizado está em `main` e em `origin/main`** | O documento que sustenta a decisão tem de estar versionado e publicado antes de ser usado |
| **P3** | Fixar a janela: horário, duração máxima tolerada e quem aborta | Pendente desde 2026-09-21 |
| **P4** | Decidir e registrar **como** a migration entra em produção | §5(j) do plano: `db push` sem o `repair` das 54 legadas tentaria aplicar 55 (R1). *(Contagem corrigida em 2026-10-19: antes dizia 55 e 56, contando o `074`, que não existe.)* O `repair` exige a matriz §5(b). Qualquer alternativa precisa de decisão explícita própria, e **nunca** pode incluir `repair` na corretiva (R3) |
| **P5** | Registrar a escolha `create index` normal × `CONCURRENTLY` (A9) | Os dados de produção apontam para `create index` normal: 11 linhas, 0 escrita, sem locks. A escolha ainda não foi registrada |

### 4.2 Preflight de última hora, imediatamente antes da aplicação

Obrigatório, na ordem:

```text
1. confirmar projeto/ref de produção;
2. confirmar commit e migration;
3. confirmar blob/versionamento  (esperado: ff9fa1115504cee3096a689cef5b1c8b04512703);
4. repetir locks/transações       (§12.1(d) do plano);
5. repetir §12.3                  (os três com existe = false);
6. repetir §12.4                  (zero linhas);
7. confirmar que os três índices continuam ausentes
   e que a tabela continua com 2 índices;
8. confirmar que os seis deliberadamente excluídos continuam fora do escopo;
9. somente então decidir aplicar.
```

**Arquivar o resultado** deste preflight. É ele, e não o de 2026-09-21, que vai sustentar o rollback
do §12.6 se algo precisar ser desfeito.

### 4.3 Critérios de aborto

Os mesmos do §12 do preflight de produção. Qualquer um deles interrompe:

```text
lock inesperado · transação antiga · escrita ativa relevante
§12.3 diferente do esperado · §12.4 com linha
blob/commit divergente · ambiente incorreto · erro ou warning não previsto
```

Em qualquer um: **PARAR. Não corrigir automaticamente. Não remover nem renomear objeto. Investigar.**

---

## 5. O que este documento não fez

- Nenhum acesso a staging ou produção.
- Nenhum SQL remoto.
- Nenhuma migration aplicada.
- Nenhum índice criado ou removido em ambiente remoto.
- Nenhuma migration nova criada.
