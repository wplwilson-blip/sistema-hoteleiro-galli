# 63 — Plano: validação de documento e contato no cadastro de fornecedor (C1, C2, C3)

Status: **Fase A — plano para revisão. Nenhum código escrito.**
Sensibilidade: média. Não é área do `docs/NAO_ALTERAR.md`, mas **muda o que o sistema aceita gravar** e atinge um caminho crítico de Compras (o cadastro rápido dentro da cotação).
Sem migration proposta (ver item 7).

Arquivos: [schemas.ts](../../src/lib/base-cadastros/schemas.ts) · [suppliers/route.ts](../../src/app/api/base/suppliers/route.ts) · [suppliers/[id]/route.ts](../../src/app/api/base/suppliers/[id]/route.ts) · [suppliers-client.tsx](../../src/components/base-cadastros/suppliers-client.tsx) · [quick-supplier-dialog.tsx](../../src/components/purchases/quick-supplier-dialog.tsx)

---

## 1. Estado atual (confirmado no código)

[`supplierPayloadSchema`](../../src/lib/base-cadastros/schemas.ts#L58-L71) aceita hoje um fornecedor com **nome e nada mais**:

| Campo | Hoje |
| --- | --- |
| `name` | único obrigatório (`min(2)`) |
| `documentType` | enum CNPJ/CPF/OTHER, **default `"OTHER"`** |
| `documentNumber` | `string` opcional, **sem validação nenhuma** |
| `email` | opcional, formato validado se preenchido |
| `phone` / `whatsapp` / `contactName` | opcionais, livres |

`isValidCpf` existe ([:8-29](../../src/lib/base-cadastros/schemas.ts#L8-L29)) e já é usado em `employeePayloadSchema` ([:98](../../src/lib/base-cadastros/schemas.ts#L98)) — **mas não em fornecedor**. Não há validador de CNPJ no repositório.

Consequência prática: dá para cadastrar fornecedor com CNPJ "123", com CPF inválido, ou sem forma nenhuma de contato — e esse fornecedor entra em cotação e vira compra aprovada.

### 1.1 Achado extra: a validação de duplicidade tem um furo hoje

`validateDuplicateDocument` ([route.ts:88-104](../../src/app/api/base/suppliers/route.ts#L88-L104)) casa por `document_type` + documento normalizado. Como `documentNumber` não é validado, dois cadastros do mesmo CNPJ digitados diferente (um com dígito errado, outro certo) **não** colidem — são documentos distintos para o banco. Validar o dígito fecha essa porta de quebra, sem nenhuma mudança na checagem de duplicidade.

---

## 2. Validador de CNPJ

Irmão do `isValidCpf`, no mesmo arquivo, mesmo estilo (normaliza máscara, rejeita tamanho errado e sequência repetida, confere os dois dígitos com pesos 5..2/9..2):

```
export function isValidCnpj(raw: string): boolean { ... }   // 14 dígitos, aceita 00.000.000/0000-00
```

**Testes** (`tests/unit/supplier-document.spec.ts`, runner puro):
- válidos conhecidos, com e sem máscara, e com espaços nas pontas;
- inválidos por dígito verificador (um dígito trocado em um CNPJ válido);
- todos iguais (`11.111.111/1111-11` … as 10 sequências);
- tamanho errado (13, 15, vazio, só máscara);
- lixo (letras, `undefined`-ish via string vazia);
- **regressão do `isValidCpf`**: o arquivo novo não altera o existente, mas cubro os mesmos casos para o CPF, que hoje **não tem teste nenhum** no repo.

---

## 3. `documentNumber` validado conforme `documentType`

Um `superRefine` no `supplierPayloadSchema` cruzando os dois campos:

| `documentType` | Regra | Mensagem |
| --- | --- | --- |
| `CNPJ` | `isValidCnpj(documentNumber)` | "Informe um CNPJ válido." |
| `CPF` | `isValidCpf(documentNumber)` | "Informe um CPF válido." |
| `OTHER` | livre (qualquer texto) | — |

O erro é emitido em `path: ["documentNumber"]`, para o form marcar o campo certo.

**Ponto de atenção — documento vazio com tipo CNPJ/CPF:** proponho que vazio **não** dispare esta regra (quem exige presença é o item 4). Assim a mensagem de "documento inválido" nunca aparece num campo em branco; quem fala nesse caso é a régua de obrigatoriedade, com a mensagem dela.

---

## 4. Documento OU contato — a régua

Sua proposta: **pelo menos um entre `documentNumber` (com tipo válido) ou um contato (`email`/`phone`/`whatsapp`/`contactName`)**.

**Concordo, e recomendo manter.** O motivo é que a régua alternativa ("documento sempre") quebraria um caminho real: o **cadastro rápido dentro da cotação** ([quick-supplier-dialog.tsx](../../src/components/purchases/quick-supplier-dialog.tsx)), usado quando o comprador está com o fornecedor na linha e precisa registrar a cotação agora. Exigir CNPJ válido ali transforma "cotei com a loja da esquina" em "não consigo lançar a cotação". O objetivo do C1 é impedir fornecedor-fantasma, e um contato registrado já cumpre isso: existe por onde cobrar.

Uma observação sobre a sua formulação: **`contactName` como contato suficiente é a parte mais fraca da régua.** Um nome sozinho ("João") não é meio de contato — não dá para ligar nem escrever. Ficam duas leituras:

- **4-a (como você propôs):** `email` OU `phone` OU `whatsapp` OU `contactName`. Mais permissiva; aceita "João" como suficiente.
- **4-b (recomendada):** `email` OU `phone` OU `whatsapp` — `contactName` conta só como complemento, não sozinho. Continua sem exigir documento, mas garante um canal real.

Recomendo **4-b**: o custo para o operador é idêntico (preencher um telefone em vez de um nome) e o resultado é a diferença entre "tem contato" e "tem como contatar". Se preferir a 4-a, é uma linha a menos — só me diga.

Mensagem proposta (emitida em `path: ["documentNumber"]`, o campo mais alto do grupo, com o texto explicando a alternativa):

> "Informe o documento (CNPJ/CPF) ou pelo menos uma forma de contato (e-mail, telefone ou WhatsApp)."

---

## 5. `documentType` default `CNPJ` (C2) e tradução do enum (C3)

- **C2 — default:** `supplierDocumentTypeSchema.default("CNPJ")` no schema **e** o `<option>` padrão do form. Hoje o schema tem `default("OTHER")` ([:62](../../src/lib/base-cadastros/schemas.ts#L62)) e o form de cadastro abre em "Outro" ([suppliers-client.tsx:81](../../src/components/base-cadastros/suppliers-client.tsx#L81)); o quick dialog **já** abre em CNPJ ([:69](../../src/components/purchases/quick-supplier-dialog.tsx#L69)) — ou seja, hoje as duas telas divergem. A mudança alinha as duas.
- Reordenar as `<option>` para CNPJ → CPF → Outro ([suppliers-client.tsx:294-298](../../src/components/base-cadastros/suppliers-client.tsx#L294-L298)), hoje com "Outro" em primeiro.
- **C3 — tradução na lista:** a coluna da tabela imprime `supplier.documentType` cru ([:361](../../src/components/base-cadastros/suppliers-client.tsx#L361)), então aparece "OTHER". É barato: um mapa `{ CNPJ: "CNPJ", CPF: "CPF", OTHER: "Outro" }` e usar nos dois lugares (tabela e `<option>`). Entra junto.

**Efeito colateral do C2 que precisa ficar explícito:** com o default virando CNPJ, quem antes salvava sem pensar no tipo passa a cair na validação de CNPJ. Isso é o comportamento desejado — mas significa que o default **não é cosmético**, é parte do enforcement. Quem realmente não tem CNPJ precisa trocar para "Outro" conscientemente.

---

## 6. O caminho de EDIÇÃO — o ponto que você quer medir

O `PATCH` faz `supplierPayloadSchema.parse` do payload **completo** ([[id]/route.ts:196](../../src/app/api/base/suppliers/[id]/route.ts#L196)), e o form envia todos os campos. Logo, **a régua nova se aplica automaticamente à edição** — não é uma escolha, é o comportamento que sai de graça se nada for feito.

Consequência concreta: um fornecedor legado sem documento e sem contato **não consegue mais ser salvo** — nem para uma edição que não tem nada a ver com isso (mudar categoria, inativar, corrigir o nome). O usuário que só queria inativar o cadastro fica preso.

### 6.1 As três opções

- **6-a — aplicar na edição (sua inclinação).** Força a limpeza do cadastro. Risco: bloqueia edições legítimas e não relacionadas, inclusive **inativar** um fornecedor ruim — que é justamente o que se quer fazer com cadastro sujo.
- **6-b — aplicar na edição, com escape para inativar/arquivar.** Igual à 6-a, exceto quando o `status` do payload for `inactive`/`archived`: aí a régua de presença (item 4) não roda. A validação de dígito (item 3) continua valendo sempre. Fecha o buraco da 6-a sem abrir mão da limpeza.
- **6-c — só na criação.** Sem atrito, mas o legado sujo nunca se resolve.

**Recomendo 6-b**, e recomendo decidir **depois de ver o número** — a consulta abaixo.

### 6.2 Consulta de impacto (`.sql`, para você/Wilson rodar; eu não aplico)

Entrego como `docs/codex/63-consulta-impacto.sql` na Fase B. Conteúdo:

```sql
-- (1) Quantos fornecedores ATIVOS a regra nova bloquearia numa edicao.
--     "Sem contato" segue a regua 4-b (email/phone/whatsapp); ajuste se ficar 4-a.
select
  count(*)                                                            as ativos_total,
  count(*) filter (
    where coalesce(btrim(s.document_number), '') = ''
      and coalesce(btrim(s.email), '')    = ''
      and coalesce(btrim(s.phone), '')    = ''
      and coalesce(btrim(s.whatsapp), '') = ''
  )                                                                   as sem_documento_e_sem_contato,
  count(*) filter (
    where coalesce(btrim(s.document_number), '') = ''
      and coalesce(btrim(s.email), '')    = ''
      and coalesce(btrim(s.phone), '')    = ''
      and coalesce(btrim(s.whatsapp), '') = ''
      and coalesce(btrim(s.contact_name), '') <> ''
  )                                                                   as salvos_apenas_por_contact_name
from public.suppliers s
where s.deleted_at is null and s.status = 'active';

-- (2) A lista, para o Wilson decidir se limpa a mao ou se precisa do escape da 6-b.
select s.name, s.document_type, s.document_number, s.email, s.phone, s.whatsapp, s.contact_name, s.created_at
from public.suppliers s
where s.deleted_at is null
  and s.status = 'active'
  and coalesce(btrim(s.document_number), '') = ''
  and coalesce(btrim(s.email), '')    = ''
  and coalesce(btrim(s.phone), '')    = ''
  and coalesce(btrim(s.whatsapp), '') = ''
order by s.created_at desc;

-- (3) Documento gravado que a validacao de digito REPROVARIA.
--     Postgres nao calcula digito verificador; esta consulta so' pre-filtra os
--     obviamente malformados (tamanho errado depois de tirar a mascara). Os que
--     tem tamanho certo mas digito errado NAO aparecem aqui — a contagem real
--     e' >= a desta consulta.
select s.name, s.document_type, s.document_number,
       length(regexp_replace(coalesce(s.document_number, ''), '\D', '', 'g')) as digitos
from public.suppliers s
where s.deleted_at is null
  and s.status = 'active'
  and coalesce(btrim(s.document_number), '') <> ''
  and (
    (s.document_type = 'CNPJ' and length(regexp_replace(s.document_number, '\D', '', 'g')) <> 14)
    or (s.document_type = 'CPF' and length(regexp_replace(s.document_number, '\D', '', 'g')) <> 11)
  )
order by s.document_type, s.name;
```

**Como ler:** se (1) vier perto de zero, a 6-a é segura e mais simples. Se vier com dezenas, a 6-b passa a ser necessária — senão a primeira coisa que acontece é alguém não conseguir inativar um fornecedor velho. A consulta (3) mede quantos cadastros o dígito reprova; se vier alta, vale um aviso à equipe antes de subir.

---

## 7. Sem migration (e por quê)

A tentação seria um `CHECK` no banco espelhando a régua. **Não proponho**, por dois motivos: o `CHECK` valeria para as linhas existentes em qualquer `UPDATE`, tornando o legado sujo imutável de vez (pior que a 6-a); e a regra tem alternativa lógica ("A ou B") que fica ilegível e difícil de evoluir em constraint. A validação fica na aplicação, que é onde já vive a de CPF do colaborador.

---

## 8. Client

- **Cadastro completo** ([suppliers-client.tsx](../../src/components/base-cadastros/suppliers-client.tsx)): hoje só `name` tem `required` ([:288](../../src/components/base-cadastros/suppliers-client.tsx#L288)) e **não há exibição de erro por campo** — o form mostra só a mensagem geral da API. Entra: marcação visual do grupo obrigatório ("Documento **ou** contato"), `<FieldError>` por campo alimentado pelo erro do zod devolvido pela rota, e o placeholder de máscara conforme o tipo.
- **Quick dialog** ([quick-supplier-dialog.tsx](../../src/components/purchases/quick-supplier-dialog.tsx)): tem os campos de contato no estado ([:45-50](../../src/components/purchases/quick-supplier-dialog.tsx#L45-L50)) — confirmar na Fase B se todos estão renderizados; se algum não estiver, precisa estar, senão o comprador não tem como satisfazer a régua sem sair da cotação.
- Erro do zod hoje: as rotas devolvem uma mensagem só. Verificar na Fase B se o formato preserva o `path` — se não preservar, o mapeamento por campo exige um ajuste no handler de erro, e eu digo antes de fazer.

### 8.1 Impacto no e2e (verificado)

O helper [`createE2ESupplierViaDialog`](../../tests/e2e/helpers/purchases-ui.ts#L117-L135) cria fornecedor com tipo **"Outro"** + documento fake. Com `OTHER` livre e documento presente, **a suíte continua passando** nas duas réguas. Se um dia o helper mudar para CNPJ, o documento fake passa a reprovar — deixo isso registrado num comentário no helper.

---

## 9. Testes

**Unitários** (`tests/unit/supplier-document.spec.ts` + `supplier-payload.spec.ts`):
1. `isValidCnpj` — a matriz do item 2.
2. `isValidCpf` — mesma matriz (hoje sem cobertura).
3. `supplierPayloadSchema`: CNPJ válido passa; CNPJ inválido erra em `documentNumber`; CPF idem; `OTHER` com lixo passa.
4. Régua documento-ou-contato: só nome → erro; nome + CNPJ válido → passa; nome + telefone → passa; nome + `contactName` só → **depende da escolha 4-a/4-b** (o teste documenta a decisão).
5. Documento vazio com tipo CNPJ → a mensagem é a da régua de presença, **não** "CNPJ inválido" (item 3).
6. Default `documentType` = `CNPJ` quando ausente.
7. Se 6-b: payload com `status: "inactive"` e sem documento/contato → passa; com `status: "active"` → erra.

**Só verificável na tela:** a marcação de obrigatório, o erro no campo certo e o quick dialog dentro da cotação.

Portões: `npm run lint`, `npm run build`, `npm run test:unit`.

---

## 10. Decisões que preciso antes da Fase B

1. **Régua (item 4):** 4-a (`contactName` conta sozinho) ou **4-b** (só e-mail/telefone/WhatsApp contam)? Recomendo 4-b.
2. **Edição (item 6):** 6-a (régua sempre), **6-b** (régua sempre, exceto ao inativar/arquivar) ou 6-c (só criação)? Recomendo 6-b — e recomendo rodar a consulta antes de bater o martelo, como você mesmo disse.
3. **Entrego a consulta junto com o código** (um diff só, merge condicionado ao número), ou a consulta primeiro e o código depois que você vir o resultado? Recomendo a primeira, como foi na fatia 62.
