# 59 — Plano: alçada de compra por VALOR como fonte única da verdade (P5)

Status: plano para revisão (sem código). Decisão de negócio: Wilson, 25/08/2026 — Opção A.
Origem: MELHORIAS_GALLI.md, achado P5 (navegação assistida de 24/08/2026).
Depende de: nada. Bloqueia: a fatia visual da tela de Nova cotação (M1, M1.1, M2, P3, P4), porque os textos da tela mudam aqui.

## 1. Problema

A mesma compra é roteada por duas regras diferentes de alçada, conforme o caminho:

| Caminho | Cálculo hoje |
| --- | --- |
| Seleção da cotação vencedora — `quote-mutation-payloads.ts:87` | `getPurchaseApprovalLevel(input.totalAmount)` — só valor |
| Envio / reenvio para aprovação — `resubmit/route.ts:151` | `evidenceClassification.requiresDirectorApproval ? "general_directorate" : getPurchaseApprovalLevel(total)` |

A regra por valor é única e simples (`api.ts:117-119`): acima de R$ 200,00 → `general_directorate`, senão `administrative_management`.

O override vem de `quote-schemas.ts:278` — `requiresDirectorApproval: status === "critical"`. Ou seja, **falta de documento** escala a alçada, independentemente do valor.

Efeitos colaterais confirmados no código:

- `resubmit/route.ts:169-170` ainda forçam `approvalRequired` e `directorApprovalRequired` com o mesmo `||`.
- O snapshot grava `approval.level` já com o override e ainda expõe `requiresDirectorApprovalByEvidence` (`approval-snapshots.ts:661`).
- Consequência prática: uma compra de R$ 100 sem PDF aparece como "Gerência Administrativa" na solicitação e como "Diretoria Geral" no dossiê. Não é bug de exibição — são dois valores gravados diferentes.

A pergunta não é "qual regra criar", e sim **qual das duas já existentes é a verdadeira**.

## 2. Decisão (Opção A — o valor manda)

`getPurchaseApprovalLevel(total)` passa a ser a **única** fonte da alçada, nos dois caminhos.

Evidência frágil/crítica **não** escala alçada. O controle sobre evidência fraca permanece, por dois meios que já existem:

1. **Justificativa obrigatória** quando a evidência é frágil ou crítica — `requiresJustification` (`quote-schemas.ts:276`), validado no `superRefine`. Não muda nada aqui.
2. **Selo visível no dossiê** para o aprovador daquela alçada decidir com o risco à vista — a classificação documental continua sendo calculada, gravada no snapshot e destacada em `purchase-approvals-client.tsx`.

Racional de controle: o risco de uma compra cresce com o valor, não com a ausência de um PDF. Compra grande sem documento já vai à Diretoria **pelo valor**. Escalar por evidência apenas entupia a Diretoria com casos de R$ 100 — e nada frágil passa sem justificativa registrada.

**Regra de ouro:** desescalar ≠ apagar. Toda a classificação documental continua sendo calculada e gravada. Muda só o que ela *aciona*.

## 3. Mudanças propostas

### 3.1 Cálculo da alçada (o núcleo)

- `resubmit/route.ts:151` → `const approvalLevel = getPurchaseApprovalLevel(total);` (remover o ternário).
- `resubmit/route.ts:169-170` → remover os `|| evidenceClassification.requiresDirectorApproval`, deixando apenas `requestFlags.approvalRequired` / `requestFlags.directorApprovalRequired` (que já vêm de `calculateWinningQuoteApprovalFlags(total)`).
- `classifyPurchaseQuoteEvidence(...)` **permanece** na rota: o resultado continua alimentando o snapshot e o selo. Só deixa de decidir roteamento.

Resultado: os dois caminhos passam a derivar a alçada exclusivamente de `total`.

### 3.2 Campo `requiresDirectorApproval`

Duas opções; recomendo (b).

(a) Remover o campo de `quote-schemas.ts:60,278` e todos os consumidores.

(b) **Recomendado:** renomear para `hasCriticalEvidence` (mesma expressão `status === "critical"`), mantendo o dado — que é legítimo como sinal de risco — e eliminando o nome que sugere roteamento. Consumidores a ajustar:
- `approval-snapshots.ts:426` e `:661` (`requiresDirectorApprovalByEvidence` → `hasCriticalEvidence`);
- `approvals/route.ts:126` e `purchase-approvals-client.tsx:59,223,325`.

Compatibilidade: snapshots já gravados contêm `approval.requiresDirectorApprovalByEvidence`. Proposta: gravar a chave nova e, na leitura/exibição, aceitar as duas — `schemaVersion` permanece `1`, sem migração de dados.

### 3.3 Textos

- `quote-schemas.ts:267`: "Evidência crítica: aprovação restrita à Diretoria." → "Evidência crítica: exige justificativa registrada."
- `purchase-approvals-client.tsx:325-327`: mesmo texto no bloco vermelho do dossiê. Vira selo de risco, não de alçada — sugestão: "Evidência crítica — decida com atenção: anexos e justificativa foram revisados?".
- `purchase-approvals-client.tsx:223-231` (`getApprovalEvidenceRisk`): o selo `danger` **permanece** — é exatamente o mecanismo que substitui a escalada. Ajustar só a `description`, que hoje diz "revise ... e alçada".
- `ruleDescription` do snapshot já descreve apenas a regra por valor — passa a ser verdadeira sem ajuste.

## 4. O que NÃO muda

- Faixa de valor (R$ 200,00) e `calculateWinningQuoteApprovalFlags`.
- `classifyPurchaseQuoteEvidence` e suas 4 classificações; `requiresAttachment`; `requiresJustification`; `evidenceConfidence`.
- Trilha de auditoria, eventos e conteúdo do snapshot (exceto o nome de uma chave).
- Segregação de função na aprovação (fatia 50) e lock do dossiê (fatia 42).

## 5. Testes (obrigatórios — `tests/unit/`, Playwright, `npm run test:unit`)

Arquivo novo: `tests/unit/purchase-approval-level.spec.ts`.

1. **Cotação documentada, alçada por valor inalterada** — mapa valor→nível idêntico ao de hoje: R$ 0,01 e R$ 200,00 → `administrative_management`; R$ 200,01 e R$ 5.000 → `general_directorate`.
2. **Baixo valor sem documento não escala** — evidência `critical`, total R$ 100 → nível permanece `administrative_management` (hoje daria `general_directorate`). Cobre também `directorApprovalRequired === false`.
3. **Regressão da divergência** — para o mesmo `total` e a mesma cotação, o `approval_level` produzido pelo caminho de seleção da vencedora é **igual** ao `approvalLevel` do caminho de envio/reenvio. Parametrizar sobre valores nas duas faixas × as 4 classificações documentais.
4. **Evidência frágil mantém o controle** — `requiresJustification === true` para `fragile` e `critical`; o `superRefine` continua rejeitando cotação frágil sem justificativa; o snapshot continua carregando `documentaryClassification` e o sinal crítico para o selo do dossiê.
5. **Texto** — a mensagem de alerta crítica não contém "Diretoria" (guarda contra reintrodução).

Complemento: rodar `tests/unit/quote-mutation-payloads.spec.ts` (regressão) e `tests/unit/approval-segregation.spec.ts`.

## 6. Risco e reversão

- Sensibilidade: **alta** — mexe em roteamento de alçada.
- Direção do risco: a mudança **desescala** casos (crítico de baixo valor deixa de ir à Diretoria). Não cria caminho novo de aprovação nem afrouxa a exigência de justificativa.
- Compras já enviadas não são recalculadas: o `approval_level` gravado no snapshot é imutável; só novos envios/reenvios usam a regra nova.
- Reversão: reintroduzir o ternário em `resubmit/route.ts:151` e os dois `||` em `:169-170`. Nada de banco muda — rollback só de código.

## 7. Ordem de execução

1. **Esta fatia (59)** — plano → aprovação do Wilson → código + testes.
2. Fatia visual da Nova cotação (M1, M1.1, M2, P3, P4 + auto-abrir o bloco recolhido quando a validação exigir campo lá dentro + extrair o componente único de origem/evidência, hoje duplicado entre `purchase-quotes-client.tsx:1708-1903` e `:2106-2449`).
3. Mesmo princípio no dossiê de aprovação e nas demais telas cheias de Compras.

## 8. Pontos para o Wilson confirmar

1. Opção (b) do item 3.2 — manter o dado renomeado como `hasCriticalEvidence` em vez de removê-lo. Recomendo manter.
2. Redação final dos dois textos do item 3.3.
3. Confirmar que o selo `danger` no dossiê é controle suficiente para evidência crítica de baixo valor — é ele que substitui a escalada.
