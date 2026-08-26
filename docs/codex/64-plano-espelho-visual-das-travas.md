# 64 — Plano: espelho visual das travas do servidor (M3 + C6)

Status: **Fase A — plano para revisão. Nenhum código escrito.**
Sensibilidade: baixa-média. Não é área do `docs/NAO_ALTERAR.md`. **Nenhuma regra de bloqueio muda** — o servidor continua sendo o único que decide; a tela passa a mostrar antes o que ele já responde depois.
Sem migration.

Princípio: **o servidor calcula, o client obedece.** Nenhuma das duas telas recalcula a regra; cada item da resposta traz um booleano pronto e o motivo em texto. Se a regra mudar no servidor, a tela acompanha sem edição.

---

## 1. M3 — botão "Aprovar" na tela de aprovações

### 1.1 O que o servidor já barra

Dois guards em [decision/route.ts](../../src/app/api/purchases/approvals/[requestId]/decision/route.ts), ambos só para `decision === "approved"`:

- `isPurchaseSelfApproval` — quem criou a solicitação não aprova (`purchase_requests.requested_by`);
- `isPurchaseSelfSelectionApproval` — quem selecionou a vencedora não aprova (`purchase_quotes.selected_by`), fatia 62.

Hoje a tela oferece "Aprovar", o usuário preenche o modal, clica em "Confirmar aprovação" e **só então** leva 403. Trabalho perdido e mensagem tardia.

### 1.2 O dado necessário — e o que falta

Levantei os dois campos na rota de listagem ([approvals/route.ts](../../src/app/api/purchases/approvals/route.ts)):

| Campo | Já disponível? |
| --- | --- |
| `requested_by` | **Sim.** A rota já o seleciona ([:400](../../src/app/api/purchases/approvals/route.ts#L400)) e o snapshot já guarda `request.requestedBy.id` ([approval-snapshots.ts:685](../../src/lib/purchases/approval-snapshots.ts#L685)). |
| `selected_by` da vencedora | **Não.** `selected_by` **não existe no snapshot** — a migration 082 criou a coluna depois, e `mapQuote` nunca passou a incluí-la. |

Ou seja: metade do flag sai de graça; a outra metade exige ir ao banco.

**Proposta:** uma consulta adicional na rota de listagem, buscando `purchase_request_id, selected_by` de `purchase_quotes` onde `is_selected = true` e `purchase_request_id in (...)` — os ids que a rota já montou ([:458](../../src/app/api/purchases/approvals/route.ts#L458)). É **um** round-trip a mais para a página inteira, não um por item, e devolve duas colunas.

**Por que ler do banco e não do snapshot:** o guard do servidor lê `selected_by` **vivo** ([decision/route.ts:86](../../src/app/api/purchases/approvals/[requestId]/decision/route.ts#L86)), não o snapshot. Se a tela lesse do snapshot, o espelho divergiria justamente quando a vencedora fosse trocada depois do envio — o caso em que a trava mais importa. Espelho tem de ler a mesma fonte que a trava.

**Alternativa considerada e descartada:** passar a gravar `selected_by` no snapshot. Resolveria os dossiês futuros e não os antigos, e ainda assim seria a fonte errada (congelada). Fica fora.

### 1.3 O flag

Calculado por item, **reusando os predicados** — sem reimplementar a regra:

```
const blockedBySelfRequest   = isPurchaseSelfApproval({ requestedBy, actorId, decision: "approved" });
const blockedBySelfSelection = isPurchaseSelfSelectionApproval({ selectedBy, actorId, decision: "approved" });
```

Campos novos no item da resposta:

- `selfApprovalBlocked: boolean` — `blockedBySelfRequest || blockedBySelfSelection`;
- `selfApprovalBlockedReason: string` — o motivo em texto, para a tela exibir sem montar frase própria. Três valores possíveis: solicitante, selecionador, ou ambos.

`decision: "approved"` fica **fixo** na chamada: é a única decisão que os guards bloqueiam, e escrever assim deixa explícito que o flag fala só do botão Aprovar.

**Os dois construtores do item precisam receber o campo** — o de snapshot ([:605-625](../../src/app/api/purchases/approvals/route.ts#L605-L625)) e o legado sem snapshot ([:670-690](../../src/app/api/purchases/approvals/route.ts#L670-L690)). Esquecer o legado deixaria o botão habilitado exatamente nos dossiês mais antigos.

### 1.4 Client

Em [purchase-approvals-client.tsx](../../src/components/purchases/purchase-approvals-client.tsx):

- **"Aprovar"** ([:680](../../src/components/purchases/purchase-approvals-client.tsx#L680)): `disabled` quando `selfApprovalBlocked`, com o motivo visível **ao lado do grupo de botões** — não só em `title`, que não aparece em toque e é invisível para leitor de tela.
- **"Confirmar aprovação"** ([:870](../../src/components/purchases/purchase-approvals-client.tsx#L870)): `disabled` também quando `decisionState.decision === "approved" && selfApprovalBlocked`. Cinto e suspensório: se o modal for aberto por outro caminho, ou se a listagem estiver velha, a confirmação continua barrada.
- **"Reprovar" e "Devolver para Compras" seguem habilitados** — os guards não os bloqueiam, e travá-los seria pior que o problema: tirariam da pessoa a única ação que ela pode tomar sobre um dossiê que ela mesma originou.

### 1.5 Um efeito que precisa ficar dito

Hoje, quem cai na trava descobre o motivo pelo 403. Com o flag, **descobre antes** — e isso é o objetivo. Mas significa que a tela passa a **revelar** que a pessoa foi a selecionadora da vencedora, informação que hoje ela só infere. Não vejo problema (é o próprio ato dela), mas registro porque muda o que a tela conta.

---

## 2. C6 — botão "Excluir" na tela de usuários

### 2.1 O que o servidor já barra

Em [users/[id]/route.ts](../../src/app/api/base/users/[id]/route.ts), o `DELETE` recusa em dois casos, **ambos já implementados**:

- **próprio usuário** ([:270-272](../../src/app/api/base/users/[id]/route.ts#L270-L272)) → 409 "Voce nao pode excluir o proprio usuario.";
- **último super admin ativo** ([:292-298](../../src/app/api/base/users/[id]/route.ts#L292-L298)), via `getActiveSuperAdminUserIds` → 409.

Confirmei que os dois existem antes de propor o espelho: um flag que desabilitasse algo que a API aceita seria pior que a ausência dele.

### 2.2 O flag

No GET da listagem ([users/route.ts:74](../../src/app/api/base/users/route.ts#L74)), por usuário:

- `canDelete: boolean` — `false` quando `user.id === context.session.user.id` **ou** quando o usuário é super admin ativo e é o único;
- `cannotDeleteReason: string` — o motivo, para a tela não remontar a frase.

`getActiveSuperAdminUserIds` hoje é **privado** de `[id]/route.ts` ([:143](../../src/app/api/base/users/[id]/route.ts#L143)). Para reusar sem duplicar, movê-la para um módulo compartilhado (proposta: `src/lib/auth/super-admin.ts`) e importar nos dois lugares. **A função não muda** — só troca de casa; o `DELETE` passa a importá-la. Isso mantém uma definição só de "super admin ativo", que é o ponto.

Custo: **uma** chamada por request da listagem (ela já é uma consulta agregada, não por usuário).

### 2.3 Sobre o id do usuário logado no client — sua pergunta

**O client já tem o id.** `useAppStore` expõe `user.id` ([app-store.ts:13-17](../../src/store/app-store.ts#L13-L17)), populado pelo `SessionContext` no SSR. Ou seja, a metade "é o próprio" seria calculável na tela.

**Mesmo assim recomendo o flag do servidor para as duas metades.** Motivos: a metade "último super admin" é impossível no client (depende de contar vínculos ativos); e ter metade da regra no client e metade no servidor é exatamente o tipo de divisão que sai de sincronia na próxima mudança. Uma origem só, um campo só.

### 2.4 Client

Em [users-client.tsx](../../src/components/base-cadastros/users-client.tsx):

- **"Excluir"** ([:440-452](../../src/components/base-cadastros/users-client.tsx#L440-L452)): `disabled={!user.canDelete}` e o motivo em `title` **mais** um texto visível na linha (mesma razão do item 1.4 — `title` sozinho não serve).
- **"Inativar"** ([:438](../../src/components/base-cadastros/users-client.tsx#L438)): você pediu para conferir e alinhar. **Achado: o rótulo é dinâmico (`Inativar`/`Ativar`), mas não localizei tratamento do próprio usuário nesse caminho.** Preciso verificar na Fase B o `PATCH`/rota de status antes de afirmar o que quer que seja — se o servidor **não** barra auto-inativação, o alinhamento correto não é desabilitar o botão, é **decidir se essa trava deve existir**, o que é mudança de regra e vira fatia própria, com sua aprovação. Este plano **não** assume nenhuma das duas coisas.

---

## 3. Testes

**Unitários (`tests/unit/`), sobre o cálculo dos flags — não sobre a tela:**

Arquivo `tests/unit/approval-ui-flags.spec.ts`:
1. `requestedBy === actor` → `selfApprovalBlocked` true, motivo de solicitante.
2. `selectedBy === actor` → true, motivo de selecionador.
3. os dois → true, motivo combinado.
4. nenhum dos dois → false.
5. `requestedBy`/`selectedBy` nulos (legado) → false, coerente com os predicados.
6. **Coerência com a trava:** para a mesma entrada, `selfApprovalBlocked` é igual a `isPurchaseSelfApproval(...) || isPurchaseSelfSelectionApproval(...)` com `decision: "approved"`. É o teste que garante que o espelho não descola da trava.

Arquivo `tests/unit/user-delete-flags.spec.ts`:
7. próprio usuário → `canDelete` false.
8. único super admin ativo → false.
9. super admin com outro super admin ativo → true.
10. usuário comum, não é o próprio → true.
11. próprio **e** único super admin → false, com o motivo do próprio (precedência definida e testada).

Para isso, o cálculo dos dois flags fica em **função pura exportada**, fora do handler — a rota só chama. Sem isso não há teste possível sem subir servidor.

**Só verificável na tela:** o `disabled` real, o texto do motivo e o comportamento do modal.

Portões: `npm run lint`, `npm run build`, `npm run test:unit`.

---

## 4. Invariantes

| Invariante | Como fica |
| --- | --- |
| Nenhuma regra de bloqueio muda | Os guards do servidor ficam intocados; a tela só espelha |
| Sem duplicar lógica no client | O client lê booleano + texto; não conhece `requested_by`, `selected_by` nem contagem de super admins |
| Espelho lê a mesma fonte que a trava | `selected_by` vivo do banco, não do snapshot (item 1.2) |
| Reprovar/Devolver seguem livres | Os guards não os bloqueiam |
| Sem migration | Nenhuma coluna nova |
| `getActiveSuperAdminUserIds` | Muda de arquivo, não de comportamento |

---

## 5. Decisões que preciso antes da Fase B

1. **Custo do round-trip extra** na listagem de aprovações (item 1.2) — confirmo que é aceitável em troca do espelho fiel? A alternativa (ler do snapshot) é grátis, mas mente quando a vencedora é trocada após o envio.
2. **Mover `getActiveSuperAdminUserIds`** para `src/lib/auth/super-admin.ts` (item 2.2), ou prefere duplicar a consulta na listagem e não tocar no arquivo do `DELETE`? Recomendo mover.
3. **"Inativar" (item 2.4):** autoriza eu **investigar** o caminho de status na Fase B e te trazer o achado — sem mexer? Se descobrir que o servidor não barra auto-inativação, isso é uma lacuna de regra, e eu paro e reporto em vez de decidir sozinho.
