# Guia de Conversas e Prompts — Sistema Galli

Status: **documento de processo.** Não descreve código; descreve como o código é decidido,
escrito e revisado. Complementa `NAO_ALTERAR.md` (o que não se toca) e
`Passagem_de_turno.md` (onde o trabalho parou).

Motivo de existir: o projeto passou a ter trabalho em paralelo — análise numa conversa,
programação em outra. Paralelismo sem regra de trânsito produz conflito de merge e revisão
em cima de estado errado. Isto aqui é a regra de trânsito.

---

## 1. Quem faz o quê

Três papéis. Confundi-los é a origem da maior parte do retrabalho.

| Papel | Onde vive | Responsabilidade | O que NÃO faz |
| --- | --- | --- | --- |
| **Wilson** | — | Autoridade de produto e de operação hoteleira. Aprova plano, testa em staging, aplica migration, faz merge. | Não edita código. |
| **Claude (chat)** | claude.ai, este Projeto | Audita código real, escreve plano, revisa diff real, decide arquitetura, antecipa operação de hotel. | **Não escreve o código final.** Não aplica migration. Não faz push. |
| **Claude Code** | VS Code, local | Executa o plano aprovado, num branch. Lê o repositório sozinho. | Não decide escopo. Não toca `main`. Não aplica migration. Não improvisa em área sensível. |

Claude (chat) e Claude Code são **o mesmo modelo em contextos diferentes**. Não é um
revisor esperto vigiando um executor burro — é o mesmo raciocínio com informação diferente
na frente. A separação de papéis não existe porque um é melhor; existe porque **quem escreve
o código é péssimo juiz do próprio código**, e isso vale para pessoas e para modelos igual.
Uma segunda leitura, sem o apego de ter escrito, encontra o que a primeira não encontra.

A regra que sustenta os três: **Claude (chat) nunca revisa pelo relato do Claude Code.**
Sempre `git fetch origin <branch>` + `git show FETCH_HEAD:arquivo`. "Ele disse que fez" não
é evidência — e é exatamente onde a autojustificação entra.

Nota histórica: a pasta chama-se `docs/codex/` desde o começo do projeto, de quando o
executor era outra ferramenta. O nome ficou, os 77 planos estão lá, e renomear a pasta
seria um diff largo sem benefício. Leia "codex" no caminho como "planos de execução".

---

## 2. Mapa de conversas

Uma conversa = um propósito. Conversa longa demais degrada: o modelo passa a responder pelo
que já foi dito em vez de pelo código, e o custo por resposta sobe sem o retorno subir junto.

### 2.1 Conversa de ARQUITETURA (esta)
**Propósito:** auditoria ampla, decisão estrutural, ordem de trabalho, escrita de planos.
**Duração:** longa, semanas. É a única conversa que se mantém aberta por muito tempo.
**Não use para:** revisar diff. Diff sujo entope o contexto e a próxima decisão de
arquitetura sai pior.

### 2.2 Conversa de PLANO — uma por frente de trabalho
**Propósito:** aprofundar um plano específico até virar `docs/codex/NN-*.md`.
**Duração:** curta, some quando o plano é aprovado.
**Abre quando:** a conversa de arquitetura escolheu a frente e você quer o plano detalhado.

### 2.3 Conversa de REVISÃO — uma por branch
**Propósito:** revisar o diff real de um branch antes do merge.
**Duração:** vive e morre com o branch.
**Regra:** **uma conversa por branch, sempre.** Revisar dois branches na mesma conversa é
como fazer merge dos dois na cabeça — você começa a aprovar coisa que só faz sentido junto.

### 2.4 Conversa de INCIDENTE — sob demanda
**Propósito:** erro em produção, segredo vazado, comportamento estranho em staging.
**Duração:** minutos a horas.
**Regra:** abrir nova, sempre. Nunca diagnosticar incidente dentro de uma conversa de
revisão em andamento — a pressa contamina a revisão.

### 2.5 Sessão do CLAUDE CODE (VS Code)
**Propósito:** executar. Uma sessão por plano, uma sessão por branch.
**Regra:** o prompt de abertura dá o **caminho** do plano, não o texto colado. Ele abre o
arquivo sozinho, e vai ler o código de verdade em vez do que o plano diz sobre o código —
que é o que você quer.
**Quando encerrar:** quando o branch for mesclado. Sessão que sobrevive a dois planos
começa a arrastar decisão do plano anterior para dentro do novo.

---

## 3. Como abrir cada conversa

### 3.1 Abrindo uma conversa de PLANO

Cole isto e substitua o que está entre colchetes:

```
Frente: [nome da frente, ex.: "Fatia B — resolver de permissão em lote"]
Referência: docs/codex/[NN]-*.md já contém a análise que originou esta frente.

Quero o plano detalhado, no formato dos planos que já estão em docs/codex/.
Antes de escrever, releia o código real no repositório (clone de main) — não
confie no que está descrito no plano anterior, o código pode ter mudado.

O plano precisa conter:
- o que entra e, explicitamente, o que NÃO entra
- arquivos afetados, com o motivo de cada um
- pontos de decisão que dependem de mim, com sua recomendação e a justificativa
- critério de pronto verificável (comando que eu rodo, resultado que eu espero)
- se toca área do NAO_ALTERAR.md, dizer qual e por quê

Se algo estiver ambíguo no código, pergunte antes de escrever.
```

### 3.2 Abrindo uma conversa de REVISÃO

```
Branch: [nome-do-branch]
Plano de origem: docs/codex/[NN]-*.md
O Claude Code terminou. Atualizei o repositório.

Reclone e revise o diff real contra main. Não use o relato dele — leia o diff.

Revise nesta ordem, e comente cada item mesmo que esteja tudo certo:
1. Segurança (autorização, escopo de unidade, vazamento de dado sensível)
2. Quebra de comportamento (o que funcionava e pode ter parado)
3. Aderência ao padrão de src/lib/hr/api-auth.ts
4. Respeito ao NAO_ALTERAR.md
5. Cenários operacionais de hotel que o código não previu
6. O que saiu do escopo do plano sem eu ter aprovado

No fim: aprovar, aprovar com ressalva, ou reprovar. Uma dessas três, sem meio-termo.
```

O item 6 é o que mais rende. Ele tende a consertar coisas vizinhas que estão mesmo tortas.
Diff maior que o plano é sinal, não bônus — e a hora de discutir a melhoria vizinha é como
próximo plano, não dentro deste diff.

### 3.3 Abrindo uma conversa de INCIDENTE

```
Incidente em [staging|produção].
Sintoma: [o que você viu, literal — mensagem de erro, tela, comportamento]
Quando começou: [antes/depois de qual merge ou migration]
O que eu já tentei: [ou "nada ainda"]

Não proponha correção antes de me dizer qual é a causa e como você chegou nela.
Se precisar que eu rode alguma consulta, me dê a consulta pronta e me diga em qual
ambiente rodar.
```

A última linha existe por um motivo específico: já rodamos consulta em produção achando
que era staging. O prompt força o ambiente a ser dito em voz alta.

---

## 4. Como falar comigo — o que funciona e o que não funciona

Isto não é etiqueta. São padrões que mudam a qualidade da resposta de forma mensurável.

**Contexto no começo, pedido no fim.** Se você colar um diff de 400 linhas e depois
escrever "revise", a resposta é melhor do que se você escrever "revise" e colar o diff
depois. O pedido no final fica adjacente à conclusão.

**Peça o critério, não o veredito.** "Está bom?" convida à concordância. "Verifique se o
escopo de unidade é recalculado no backend em toda rota tocada" produz uma verificação.
Quanto mais específico o critério, menos espaço para eu ser educado em vez de útil.

**Peça discordância explícita.** Uma linha que funciona: *"se você discorda da minha
decisão, diga agora e diga por quê — não implemente algo que você acha errado."* Sem isso,
o comportamento padrão pende para executar o que foi pedido.

**Uma tarefa por mensagem.** Três perguntas numa mensagem produzem três respostas rasas.

**Não me peça para "lembrar" de coisa importante entre conversas.** Conversas não
compartilham estado de forma confiável. O que precisa sobreviver vai para
`Passagem_de_turno.md` ou para um `docs/codex/NN-*.md`. Documento é a memória do projeto;
conversa não é.

**Quando o repositório mudar, diga.** "Atualizei o repo" é o gatilho para eu reclonar. Sem
isso eu posso revisar contra um estado antigo e aprovar algo que já não existe.

**O que evitar:** pedir revisão e implementação na mesma mensagem (o segundo pedido apaga o
rigor do primeiro); colar log inteiro sem dizer o que procurar; pedir "otimize" sem número
alvo.

---

## 5. Como escrever prompt para o Claude Code

O erro de partida é escrever o prompt como se fosse para uma ferramenta que executa
literalmente. Não é. É o mesmo modelo do chat, com o repositório na mão. Ele lê, entende,
julga e **melhora coisas que você não pediu** — porque genuinamente são melhorias.

Esse é o problema real. Não é execução ruim: é **iniciativa boa em escopo errado**. Um diff
maior que o plano quase nunca é preguiça; é ele consertando algo vizinho que estava mesmo
torto. E é inrevisável do mesmo jeito, porque você deixa de conseguir separar o que foi
aprovado do que foi decidido no caminho.

Então o prompt não fecha decisões por desconfiança. Fecha porque **decisão tomada dentro da
sessão de execução não passa por você nem por revisão**.

Cinco blocos:

**1. Aponte o plano, não cole o plano.**
> "Leia `docs/codex/69-plano-fatia-b-resolver-lote.md` e `NAO_ALTERAR.md` antes de escrever
> qualquer coisa."

Ele lê o repositório de verdade. Plano colado é a descrição do código; o repositório é o
código. Quando os dois divergem, você quer que ele veja a divergência — não que ele
implemente a descrição.

**2. Escopo fechado, com o motivo junto.**
> "Você pode editar apenas `src/lib/auth/permissions.ts`,
> `src/app/api/hr/employees/[id]/route.ts` e arquivos em `tests/unit/`. Se você concluir que
> outro arquivo precisa mudar, **pare e me diga qual e por quê** — não edite. Um diff maior
> que o plano me impede de revisar."

O motivo importa. Regra sem motivo é contornada quando parece razoável contornar; regra com
motivo é respeitada porque o motivo continua verdadeiro no momento da tentação.

**3. As bifurcações já resolvidas.**
> "Se o code não existir na tabela `permissions`, mantenha o comportamento atual (403). Não
> transforme em 500, mesmo que 500 seja tecnicamente mais correto."

Aquele "mesmo que" é a parte útil. Sem ele, um argumento melhor ganha da instrução.

**4. Barreira NAO_ALTERAR — a única exceção à regra de não perguntar.**
> "Se a tarefa exigir tocar migration, Auth, RLS, trigger de auditoria ou helper de sessão:
> pare e pergunte. Migrations quem aplica sou eu, no Supabase."

**5. Peça discordância antes do código, e critério de pronto depois.**
> "Antes de escrever: me diga em duas ou três linhas o que você entendeu e onde você
> discorda do plano. Se você acha o plano errado, diga agora — não implemente algo que você
> considera errado.
> Pronto quando `npm run test:unit` passar (14 existentes + 4 novos) e `npx tsc --noEmit`
> não acusar erro."

Esse pedido de discordância é o que mais rende. Ele está lendo o código real e vai enxergar
coisa que eu não enxerguei escrevendo o plano de fora. Se não houver um convite explícito, o
padrão é seguir o plano em silêncio.

E fechar sempre com: **"Trabalhe no branch `<nome>`. Não faça push para `main`."** Já houve
push autônomo para main uma vez neste projeto.

### O que não colocar no prompt

- **"Faça o melhor que puder"** / "use seu julgamento" — abre exatamente a porta que os
  blocos 2 e 3 fecham.
- **Duas frentes no mesmo prompt.** Um plano por sessão. Dois viram um diff só.
- **Ameaça, urgência inventada, "isso é crítico".** Não melhora a saída e piora o
  julgamento de escopo — pressa é o que faz alguém decidir sozinho.

---

## 6. Regra de trânsito para trabalho paralelo

Esta é a parte prática do documento.

Refatoração tem duas formas, e elas não convivem:

- **Diff profundo e estreito** — poucos arquivos, muita mudança dentro deles. Exemplo:
  batch do resolver de permissão.
- **Diff raso e largo** — muitos arquivos, pouca mudança em cada. Exemplo: renomear
  `base-cadastros` para `core` (mexe em ~110 linhas de import espalhadas por 100 arquivos).

**Enquanto houver qualquer outro branch aberto, só rode diff profundo e estreito.** Um diff
largo colide com tudo o que estiver em voo, e resolver conflito de import em massa é onde
se perde comportamento sem perceber.

**Diff largo só em janela silenciosa:** nenhum branch aberto, nada em staging esperando
teste, e o merge dele acontece no mesmo dia em que começa. Não deixe um rename dormir uma
semana.

---

## 7. Fila de trabalho — ordem e motivo

Ordem derivada da regra acima, não de importância pura.

| # | Frente | Forma | Quando | Plano |
| --- | --- | --- | --- | --- |
| 1 | Fatia B — resolver de permissão em lote | Profundo e estreito (1 arquivo) | **Agora**, convive com trabalho paralelo | `docs/codex/69-*.md` |
| 2 | Limpeza: TODO morto, `requireSuperAdminRequest` órfão, `SupabaseAdmin` duplicado 13× | Raso e estreito | Qualquer momento, é quase trivial | a escrever (70) |
| 3 | Encapsular leitura de `room_status` em `rooms-utils.ts` | Estreito | Antes da tela de Governança | a escrever (71) |
| 4 | Primitivos de UI (`DataTable`, `Modal`, `StatusBadge`) | Profundo e largo | Janela silenciosa. Destrava fatiar os clients de 2.600 linhas | a escrever (72) |
| 5 | Kernel: `base-cadastros` → `core` | Raso e larguíssimo | Janela silenciosa, merge no mesmo dia | a escrever (73) |

Os planos 70 a 73 **não devem ser escritos agora.** Plano escrito hoje para um código que
vai mudar três vezes até lá chega desatualizado, e plano desatualizado é pior que plano
ausente — ele parece confiável. Cada um é escrito na véspera de ser executado, contra o
código real daquele momento.

---

## 8. Checklist antes de qualquer merge

1. Claude revisou o **diff real** (fetch, não relato) e aprovou.
2. Wilson testou em **staging** com um usuário **não super-admin** — super-admin ignora
   quase todo caminho de autorização e não prova nada.
3. Se houve migration: aplicada em staging **e** em produção, com `SELECT` de confirmação
   depois (o SQL Editor diz "Success. No rows returned" para DDL e para DML sem RETURNING —
   os dois casos parecem iguais na tela).
4. Merge com `--no-ff`.
5. Branch apagado, local **e** remoto.
6. `Passagem_de_turno.md` atualizado.

Um comando por linha no PowerShell. `&&` não encadeia no PowerShell 5.x.
