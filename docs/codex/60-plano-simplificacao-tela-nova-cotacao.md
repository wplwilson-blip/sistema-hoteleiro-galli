# 60 — Plano: simplificação da tela de Nova cotação (M1.1, M2, P3, P4 + auto-open + componente único)

Status: **Fase A — plano para revisão. Nenhum código de produção escrito.**
Origem: MELHORIAS_GALLI.md (navegação assistida de 24/08/2026). Direção do Wilson: "não precisa mostrar tudo — o que é exceção vai pra um clique ou pra relatório".
Depende de: fatia P5 (docs/codex/59), já mergeada em `9084607`. **Esta fatia não toca em alçada.**
Arquivo central: `src/components/purchases/purchase-quotes-client.tsx` (2568 linhas).

---

## 0. Três premissas do briefing que o código não confirma

Antes da estrutura, o que a leitura do arquivo contradiz. Os três pontos mudam o desenho e **precisam de decisão antes da Fase B**.

### 0.1 O input de arquivo NÃO é condicional hoje (afeta M1.1)

O briefing diz "o input de arquivo é condicional em `requiresAttachment` (:2368) — não refazer, confirmar". Não confere. Na linha 2367-2371, `requiresAttachment` envolve **apenas o aviso âmbar** ("Arquivo obrigatório para este tipo de evidência"). O `<Field label="Arquivos de evidência">` com o `<Input type="file">` está em :2330-2337, **sempre visível**. O mesmo vale no bloco de negociação (:1954 aviso / :1938 input).

Consequência: M1.1 não é "esconder o `<h5>` junto com o input já condicional". É tornar condicional um bloco que hoje é incondicional — decisão nova, não confirmação.

### 0.2 `!requiresAttachment` é a condição errada para esconder o bloco (afeta M1.1)

`requiresAttachment` é calculado como `!hasAttachment && status !== "formal_sufficient"` ([quote-schemas.ts:275](../../src/lib/purchases/quote-schemas.ts#L275)), e no form `hasAttachment` vem de `pendingQuoteAttachmentFiles.length > 0` ([purchase-quotes-client.tsx:362](../../src/components/purchases/purchase-quotes-client.tsx#L362)).

Ou seja: **anexar um arquivo faz `requiresAttachment` virar `false`**. Esconder o bloco em `!requiresAttachment` faria o bloco desaparecer no instante em que o usuário anexa — levando junto a lista "Selecionados" e o botão Remover. O usuário perderia a única forma de ver e remover o que anexou.

Condição proposta no lugar (item 4 abaixo): mostrar o bloco quando `requiresAttachment || houver arquivo pendente || (edição com anexo já vinculado)`. Cobre o objetivo do M1.1 (sumir no caminho de 90%) sem criar o buraco.

### 0.3 M2 colide com o `superRefine` — não dá para resolver só na apresentação

O briefing pede: "no caso verbal, o usuário preenche um campo, não dois; a Justificativa é a única obrigatória e `sourceNotes` vira opcional e secundária", mantendo o invariante "é só apresentação".

O `superRefine` ([quote-schemas.ts:436-541](../../src/lib/purchases/quote-schemas.ts#L436-L541)) exige **os dois** nesse caminho:

| Caso | `sourceNotes` | `evidenceMissingReason` |
| --- | --- | --- |
| `isVerbalQuote` | obrigatório (:477-483) | — |
| `quote_source_type = phone_call` | obrigatório (:502-508) | obrigatório (:510-516) |
| `quote_source_type = in_person` | obrigatório se sem contato (:519-525) | obrigatório (:527-533) |
| `quote_source_type = other` | obrigatório (:469-475) | — |
| `evidence_type = none` | — | obrigatório (:453-459) |

Rotular `sourceNotes` como "opcional" e mandar o usuário preencher só a justificativa produz, no submit de uma cotação por ligação, um erro de campo obrigatório num campo que a tela chamou de opcional. Pior que hoje.

**Três saídas — preciso da tua escolha:**

- **M2-a (só apresentação, escopo reduzido):** manter os dois obrigatórios, mas dar hierarquia visual — Justificativa primeiro e em destaque, "Observações da origem" logo abaixo com label explicando o que se espera ("O que foi dito na ligação"). Não cumpre "um campo em vez de dois", cumpre "parar de parecerem dois campos iguais e redundantes". Zero risco.
- **M2-b (relaxar o schema — recomendada):** no caminho verbal (`phone_call` / `in_person` / `isVerbalQuote`), `sourceNotes` deixa de ser exigido **quando `evidenceMissingReason` estiver preenchido**. A justificativa passa a ser o campo único obrigatório; observações fica genuinamente opcional. Isso é mudança de regra de validação, não de apresentação — quebra o invariante declarado e precisa de autorização explícita. O dado continua existindo e sendo persistido; muda só a exigência. Não afeta `classifyPurchaseQuoteEvidence` (que já trata `sourceNotes` vazio: cai para `fragile`/`critical`, o que só reforça a exigência de justificativa — que continua de pé).
- **M2-c:** não fazer M2 nesta fatia.

Recomendo **M2-b**: é a única que entrega o objetivo declarado ("um campo, não dois"), e o controle não afrouxa — a justificativa, que é a peça de auditoria, continua obrigatória.

---

## 1. Estrutura antes / depois

### 1.1 Bloco cotação — hoje (`:2057-2489`)

| Ordem | Seção | Linhas |
| --- | --- | --- |
| 1 | `Dados da cotação` — fornecedor, data, validade, prazo, condição pgto | :2057-2200 |
| 2 | `Origem e Evidência da Cotação` — badge de classificação, origem, tipo, contato, referência, URL, observações, justificativa, emergência, 3 checkboxes, dica, **Evidências/anexos** | :2202-2374 |
| 3 | `Itens cotados` + valor unitário | :2376-2489 |

### 1.2 Bloco cotação — depois

| Ordem | Seção | Estado |
| --- | --- | --- |
| 1 | `Dados da cotação` | inalterada |
| 2 | **`Itens cotados`** (movida de :2376) | sempre aberta |
| 3 | **`Detalhes da origem e evidência`** (era :2202) | **começa fechada**, abre por clique ou por auto-open |

Dentro do bloco 3, na ordem:

1. Origem da cotação · Tipo de evidência (os dois campos que determinam tudo)
2. Contato / canal / referência / URL / prazo de regularização (já condicionais hoje — inalterados)
3. **Justificativa da evidência frágil ou ausente** (sobe: hoje vem depois de Observações)
4. **Observações da origem** (desce; label ajustado conforme a decisão M2)
5. Motivo da emergência (condicional, inalterado)
6. Checkboxes de exceção (verbal / emergencial / regularização)
7. Dica de upload (`getEvidenceUploadHint`)
8. **Evidências da cotação** — agora condicional (M1.1, item 4)
9. Badge de classificação **no rodapé do bloco**, não no cabeçalho (P3, item 3)

### 1.3 O que NÃO muda de lugar

`Dados da cotação` inteiro; a ordem interna dos campos condicionais de contato; o bloco de exceção de validade (`:2519` em diante); toda a listagem de cotações existentes.

---

## 2. Auto-open — como lê o erro do `superRefine`

A regra não negociável: **o bloco abre sozinho e foca o primeiro campo com erro quando o submit falhar em algo lá dentro.**

### 2.1 Mecânica

O form usa `react-hook-form` + `zodResolver(purchaseQuoteFormSchemaClient)`, `mode: "onTouched"`, `reValidateMode: "onChange"` ([:263-268](../../src/components/purchases/purchase-quotes-client.tsx#L263-L268)). O `superRefine` publica cada issue com um `path` (`["evidenceMissingReason"]`, `["sourceNotes"]`, `["sourceContactName"]`, …). O zodResolver converte esses paths em chaves de `quoteForm.formState.errors`. **É daí que o auto-open lê** — não do zod diretamente, e não de um cálculo próprio de classificação.

Duas peças novas:

```
// lista fechada dos campos que moram dentro do bloco recolhível.
// Origem: os paths que validatePurchaseQuoteForm pode emitir (quote-schemas.ts:436-541)
// mais os campos de origem/evidência do schema base.
const EVIDENCE_BLOCK_FIELDS = [
  "quoteSourceType", "evidenceType", "sourceContactName", "sourceContactChannel",
  "sourceReference", "sourceUrl", "sourceNotes", "evidenceMissingReason",
  "emergencyReason", "regularizationDeadline"
] as const;
```

O handler de submit passa a usar o **segundo argumento** de `handleSubmit` (o callback de inválido), que é onde o RHF entrega o objeto de erros já montado:

```
quoteForm.handleSubmit(onValid, (errors) => {
  const firstInvalid = EVIDENCE_BLOCK_FIELDS.find((name) => errors[name]);
  if (firstInvalid) {
    setEvidenceBlockOpen(true);      // abre antes de focar: o campo precisa estar montado
    quoteForm.setFocus(firstInvalid); // RHF rola até ele e foca
  }
})
```

### 2.2 Os quatro detalhes que fazem isso funcionar de verdade

1. **Ordem abre-antes-de-focar.** Se o bloco estiver colapsado por `{open ? <div/> : null}`, o input não está no DOM e `setFocus` é no-op. `setEvidenceBlockOpen(true)` roda primeiro; o `setFocus` vai num `useEffect` que dispara quando o bloco estiver aberto e houver um alvo pendente (`pendingFocusField`), não na mesma linha do `setState`.
2. **Colapso por CSS, não por desmontagem — decisão.** Alternativa mais simples e mais segura: manter os campos montados e esconder com `hidden`/`display:none`. Aí `setFocus` funciona direto, o estado do RHF nunca se perde no colapso, e não há risco de campo desmontado alterar o valor enviado. **Proposta: colapso por CSS.** O ganho de performance de desmontar não compensa o risco num form deste tamanho.
3. **A ordem do `find` é a ordem de foco.** `EVIDENCE_BLOCK_FIELDS` é declarada na ordem visual do bloco, então "primeiro campo com erro" significa o mais alto na tela, não o primeiro que o zod emitiu.
4. **O bloco não fecha sozinho.** Uma vez aberto (por clique ou por erro), permanece aberto durante a sessão de edição daquela cotação. Só volta ao estado fechado quando o form é resetado (`buildDefaultQuoteForm` / troca de solicitação / entrar em edição de outra cotação).

### 2.3 Sinal visual no cabeçalho fechado

Enquanto fechado, o cabeçalho mostra um contador de pendências quando houver erro dentro (`"2 campos a revisar"`, em tom `danger`). Sem isso, um usuário que role a página não descobre por que o submit não passou.

---

## 3. P3 — classificação calculada depois

### 3.1 Por que hoje abre em vermelho

Não é porque os campos estão vazios. `buildDefaultQuoteForm` ([purchase-quotes-utils.ts:478-479](../../src/components/purchases/purchase-quotes-utils.ts#L478-L479)) já pré-preenche `quoteSourceType: "formal_proposal"` e `evidenceType: "attached_file"`. Com esses valores e **sem anexo**, o classificador não casa o primeiro ramo (que exige `hasAttachment`) e cai no default `status = "critical"`, reason `"Ausência de dados essenciais para sustentar a cotação."`

Ou seja: a tela abre acusando "Crítica" numa cotação que o usuário ainda não começou, e a saída daquele estado é anexar um arquivo — algo que o campo de anexo, no desenho novo, nem está visível ainda.

Isso invalida o critério do briefing ("só mostra severidade depois que origem/tipo forem preenchidos") — eles **já vêm preenchidos**.

### 3.2 Critério proposto

Um estado `evidenceTouched`, verdadeiro quando qualquer uma valer:

- o usuário alterou algum campo do bloco de evidência (via `quoteForm.formState.dirtyFields` restrito a `EVIDENCE_BLOCK_FIELDS`);
- há arquivo pendente ou anexo já vinculado;
- o form está em modo edição de uma cotação existente (`editingQuoteId`) — aí a classificação é sobre dado real e deve aparecer;
- o submit já falhou uma vez.

Enquanto `evidenceTouched === false`: badge neutro **"A classificar"** (`status="info"`), sem `reason` e sem a lista de alerts. A partir de `true`: exatamente o comportamento de hoje, com label, severidade, motivo e alerts.

`classifyPurchaseQuoteEvidence` **não muda** — continua sendo chamada e continua retornando o mesmo objeto. Muda só o que a tela decide renderizar. O valor persistido em `evidenceConfidence` etc. também não muda.

### 3.3 Reposicionamento

O badge sai do cabeçalho da seção (:2208) e o painel "Classificação documental / Motivo / alerts" (:2210-2221) sai do topo, indo para o **rodapé do bloco**, depois dos campos que o determinam. No cabeçalho fechado fica só o badge compacto (útil como resumo), nunca o painel completo.

---

## 4. M1.1 — bloco de evidências condicional

`shouldShowAttachmentBlock = requiresAttachment || pendingFiles.length > 0 || (editingQuoteId && anexosVinculados.length > 0)`

- `requiresAttachment` → o caso em que o anexo é exigido: o bloco aparece.
- `pendingFiles.length > 0` → resolve 0.2: quem anexou continua vendo e podendo remover.
- edição com anexo vinculado → o contador "Anexos já vinculados: N" (:2361-2365) não some.

Quando falso, some o `<div>` inteiro de :2310-2372 — `<h5>Evidências da cotação</h5>`, descrição, campo de descrição, input de arquivo, lista e aviso âmbar.

**Escape hatch obrigatório:** com o bloco escondido, não existe caminho para anexar um documento voluntariamente numa cotação que não o exige (hoje existe, porque o input é incondicional — ver 0.1). Isso é perda de função, não simplificação. Proposta: quando `shouldShowAttachmentBlock` for falso, renderizar no lugar uma linha discreta — `"Anexar documento (opcional)"` — que ao clicar mostra o bloco. Mesmo padrão do "Detalhes", um nível abaixo.

Mesmo tratamento no bloco de negociação (:1936-1958).

---

## 5. Componente extraído — desenho

### 5.1 O problema real: os dois blocos usam modelos de estado diferentes

Não é duplicação de JSX sobre a mesma base. É duplicação sobre bases incompatíveis:

| | Cotação (:2202-2374) | Negociação (:1825-1989) |
| --- | --- | --- |
| Estado | `react-hook-form` (`register` / `Controller`) | objeto plano `negotiationForm` + `updateNegotiationField` |
| Erros de campo | `quoteForm.formState.errors` + `<FieldError>` | **nenhum** — não há `FieldError` no bloco inteiro |
| Validação no submit | `purchaseQuoteFormSchemaClient` (com `validatePurchaseQuoteForm`) | `purchaseQuoteNegotiationCreateSchema`, cujo `superRefine` valida **só `validUntil`** ([quote-schemas.ts:576-584](../../src/lib/purchases/quote-schemas.ts#L576-L584)) |
| Campos ausentes | — | não tem Justificativa com o mesmo label; não tem `FieldError` em lugar nenhum |

### 5.2 Desenho proposto: componente controlado, agnóstico de RHF

Arquivo novo: `src/components/purchases/quote-evidence-fields.tsx`.

```
type EvidenceFieldName = typeof EVIDENCE_BLOCK_FIELDS[number];

type QuoteEvidenceFieldsProps = {
  values: QuoteEvidenceValues;                       // os 10 campos, só leitura
  onChange: (field: EvidenceFieldName, value: string | boolean) => void;
  errors?: Partial<Record<EvidenceFieldName, string>>; // undefined = sem erros (negociação hoje)
  classification: PurchaseQuoteEvidenceClassification;
  showClassification: boolean;                        // P3: o evidenceTouched do chamador
  attachmentSlot: React.ReactNode;                    // o bloco de anexos, que difere entre os dois
};
```

Por que controlado e não "recebe o `quoteForm`": um componente que recebesse o objeto do RHF não serviria à negociação sem antes migrá-la para RHF — migração maior, com risco próprio, e fora do escopo desta fatia. Controlado, os dois chamadores adaptam:

- **Cotação:** um wrapper fino que lê de `quoteForm.watch()`, escreve com `quoteForm.setValue(field, value, { shouldDirty: true, shouldValidate: true })` e mapeia `formState.errors` para o `errors`. `register` sai do bloco de evidência; o resto do form segue como está.
- **Negociação:** passa `negotiationForm` direto e `updateNegotiationField` como `onChange`. `errors` fica `undefined` — comportamento idêntico ao de hoje.

O `attachmentSlot` fica de fora porque as duas telas usam estados de arquivo distintos (`pendingQuoteAttachmentFiles` vs `pendingNegotiationAttachmentFiles`) e textos distintos. Unificar isso é uma terceira fatia, se valer a pena.

### 5.3 Uma divergência que a extração **não** resolve sozinha

Com o componente único, a negociação passa a **exibir** os mesmos campos, inclusive a Justificativa com o mesmo label. Mas a validação continua diferente: o schema da negociação não roda `validatePurchaseQuoteForm`. Resultado: a negociação mostraria a Justificativa como obrigatória sem que nada a exija no envio.

Duas opções:

- **5.3-a (recomendada nesta fatia):** o componente recebe `errors` como `undefined` na negociação e a Justificativa aparece com label neutro ali. Zero mudança de comportamento — a fatia entrega a unificação visual e para aí.
- **5.3-b:** aplicar `validatePurchaseQuoteForm` também ao schema da negociação. É endurecer validação num fluxo que hoje aceita proposta sem justificativa — pode **bloquear negociações que hoje passam**. Não é regressão de tela, é mudança de regra, e vai de fatia própria com aviso ao Wilson.

O briefing pede "a negociação passa a ter o mesmo comportamento sem regressão". As duas metades não cabem juntas: mesmo comportamento = 5.3-b = risco de bloquear fluxo existente. **Proposta: 5.3-a agora, 5.3-b como fatia 61 se o Wilson quiser o aperto.**

---

## 6. Invariantes verificados

| Invariante | Como fica |
| --- | --- |
| Nenhum campo persistido some | Nenhum campo é removido do form nem do payload. `sourceNotes` e `evidence_missing_reason` seguem separados e ambos enviados. |
| `requiresAttachment` / `requiresJustification` / `classifyPurchaseQuoteEvidence` iguais | Não são tocados. P3 e M1.1 só mudam quem lê o resultado. **Exceção:** se M2-b for aprovada, o `superRefine` muda — está isolado no item 0.3 e requer autorização. |
| Nada de alçada | Zero arquivo de alçada no escopo. `quote-mutation-payloads.ts`, `resubmit/route.ts` e `api.ts` não são tocados. |
| Textos "crítica" do P5 | Intocados. |
| `docs/NAO_ALTERAR.md` | "Vínculo de anexos" e "Fluxo de cotação vencedora" são sensíveis. O escape hatch (item 4) existe justamente para não reduzir a capacidade de vincular anexo. Nenhuma migration, nenhuma API, nenhuma policy. |

---

## 7. Testes

### 7.1 Unitários (`tests/unit/`, `npm run test:unit`)

Arquivo novo: `tests/unit/quote-evidence-visibility.spec.ts` — lógica pura, extraída para helpers testáveis em `purchase-quotes-utils.ts`:

1. `getFirstEvidenceFieldError`: dado um objeto de erros do RHF, devolve o primeiro campo do bloco na ordem visual; devolve `null` quando o erro é fora do bloco (ex.: `supplierId`, `validUntil`) — **o bloco não abre por erro que não é dele**.
2. `shouldShowAttachmentBlock`: verdadeiro com `requiresAttachment`; verdadeiro com arquivo pendente **mesmo com `requiresAttachment === false`** (a regressão do item 0.2); verdadeiro em edição com anexo vinculado; falso no caso de 90%.
3. `shouldShowClassification` (P3): falso no estado inicial pré-preenchido do `buildDefaultQuoteForm`; verdadeiro após dirty em campo de evidência; verdadeiro em `editingQuoteId`; verdadeiro após submit inválido.
4. Cobertura de paths: todo `path` que `validatePurchaseQuoteForm` pode emitir está em `EVIDENCE_BLOCK_FIELDS` **ou** declarado como fora do bloco. Guarda contra alguém adicionar um `ctx.addIssue` novo e o auto-open ficar cego para ele.
5. Se M2-b for aprovada: caminho verbal com `evidenceMissingReason` preenchido e `sourceNotes` vazio → válido; ambos vazios → erro em `evidenceMissingReason`.

### 7.2 E2E / screenshots (`tests/e2e`, `tests/screenshots/compras.spec.ts`)

6. Submit inválido com o bloco fechado → bloco abre e o foco cai no primeiro campo com erro.
7. Caso verbal: preencher fornecedor + itens + valor, marcar "Cotação verbal", salvar → o que a tela exige bate com o que o schema exige (nenhum erro em campo escondido).
8. Caminho de 90%: fornecedor + itens + valor com origem/tipo default → salva sem abrir o bloco.
9. `requiresAttachment === false` → o `<h5>Evidências da cotação</h5>` não está no DOM; o link "Anexar documento (opcional)" está.
10. Negociação sem regressão: os mesmos campos persistem, o payload enviado é idêntico ao de antes da extração (comparação de payload, não de pixels).

### 7.3 Portões de sempre

`npm run lint` · `npm run build` · `npm run test:unit` — todos verdes antes do merge, como na fatia 59.

---

## 8. Ordem de execução da Fase B

1. Extrair `quote-evidence-fields.tsx` **sem nenhuma mudança visual** e ligar nos dois chamadores. Commit próprio, verificável por "a tela está idêntica".
2. P4 (mover itens/valores para cima) — mudança de ordem de JSX, sem lógica.
3. P3 (`evidenceTouched` + badge no rodapé).
4. M1.1 (bloco de anexo condicional + escape hatch).
5. Colapso + auto-open (a peça de risco, por último, sobre estrutura já estável).
6. M2, conforme a opção aprovada no item 0.3.

Commits separados: se algo quebrar em produção, dá para reverter o passo 5 sem perder os passos 1-4.

---

## 9. Decisões que preciso antes da Fase B

1. **M2 (item 0.3):** M2-a (só apresentação, não cumpre "um campo"), **M2-b (relaxar o `superRefine` — recomendada)** ou M2-c (adiar)?
2. **M1.1 (item 4):** o escape hatch "Anexar documento (opcional)" entra? Sem ele, perde-se a capacidade de anexar voluntariamente.
3. **Negociação (item 5.3):** 5.3-a (só unificação visual, zero mudança de regra — recomendada) ou 5.3-b (endurecer a validação da negociação, com risco de bloquear fluxo que hoje passa)?
4. **Colapso (item 2.2):** confirma colapso por CSS em vez de desmontagem? É o que torna o auto-open confiável.
