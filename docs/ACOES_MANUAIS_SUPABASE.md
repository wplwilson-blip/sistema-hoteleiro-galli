# Ações Manuais no Supabase

Coisas que **não são migration** e que ninguém deve tentar automatizar daqui: configuração de
painel, de Auth e de projeto. Cada item traz onde mexer, o que esperar, como testar e como voltar.

Levantado em 2026-09-18. **Nada aqui foi executado.**

---

## Regra que vale para todos os itens

1. **Staging primeiro.** Validar lá, com teste real de login, antes de encostar em produção.
2. **Um item por vez.** Duas configurações de Auth mudadas juntas tornam impossível saber qual
   quebrou o login.
3. **Não alterar Auth sem autorização explícita** — regra do `AGENTS.md` e do `docs/NAO_ALTERAR.md`.
4. **O login é por `username`**, nunca por e-mail. O Supabase Auth usa `auth_email` técnico interno.
   Nenhum item abaixo pode alterar isso.

| Projeto | Ref |
| --- | --- |
| Staging | `jascnmgagejlvjlenduv` (`galli-staging`) |
| Produção | `chnamldrlwohaudmjrez` (`hotel-galli-admin`) |

---

## AM-01 — Proteção contra senhas vazadas (Correção 8) — **BLOQUEADA**

**Estado relatado pelos advisors:** desativada.

> ### 🔴 BLOQUEADA — não ativar nesta tarefa, nem em staging
>
> A ativação está bloqueada até o código mapear `error.code === "weak_password"` para uma mensagem
> segura em português, preferencialmente **HTTP 422**. Hoje as quatro rotas devolvem **mensagem
> genérica com HTTP 500** (achado confirmado abaixo). Ativar antes disso transforma uma proteção
> correta num erro que ninguém consegue interpretar.

### Disponibilidade

**Recurso de plano Pro ou superior.** Em projetos de plano gratuito ele não aparece ou não pode ser
ativado. **Confirmar o plano dos dois projetos antes de planejar a ativação** — se algum estiver
abaixo de Pro, a discussão deixa de ser técnica e vira comercial.

### Onde ativar

Nas **configurações de Auth do projeto** (Auth settings), na seção de política de senha — a opção é
*"prevent use of leaked passwords"* / proteção contra senhas vazadas.

*A descrição é deliberadamente por função, não por caminho de menu: a navegação do painel muda entre
versões, e um caminho fixo aqui envelhece mal.*

É configuração de projeto, por ambiente. **Não existe migration que faça isso**, e não deve existir:
não é schema.

### O que ela faz

O Supabase Auth passa a consultar o **HaveIBeenPwned** por *k-anonymity* — envia apenas os 5
primeiros caracteres do hash SHA-1 da senha, nunca a senha. Se o hash constar em vazamento
conhecido, a operação é recusada com `error.code === "weak_password"`.

### Onde ela atua — e o que NÃO afirmo sobre login

O efeito principal é em **definição e troca de senha**.

> **Correção de uma versão anterior deste documento.** Eu havia escrito que a proteção "não atua em
> login com senha já existente". **Não afirmo mais isso.** A documentação do Supabase indica que
> usuários existentes continuam conseguindo entrar, **mas também menciona `WeakPasswordError` em
> `signInWithPassword`** para senha fraca. As duas coisas estão na documentação, e eu não consegui
> reconciliá-las por leitura.
>
> **Sem observar o comportamento real, a formulação segura é:** o impacto sobre login de senha
> existente é **incerto** e precisa ser medido antes de produção.

**Consequência prática, e ela é dura:** se o login de senha já existente for afetado, a proteção
pode **trancar do lado de fora** usuários cuja senha atual conste em vazamento — inclusive, no pior
caso, quem administra o sistema. É por isso que o teste de não regressão de login em staging é
**obrigatório e bloqueante**, não um item de conferência.

**Registrar o comportamento real observado em staging antes de sequer planejar produção**, com:
qual usuário, qual senha (categoria — nunca o valor), o que aconteceu, e a resposta HTTP.

### 🔴 Achado confirmado — as quatro rotas devolvem mensagem genérica e HTTP 500

Verificado no código em 2026-09-18. **`weak_password` não aparece em lugar nenhum do repositório**
(`grep -rn "weak_password" src tests` → nenhuma ocorrência).

| Rota | Linha | Chamada ao Auth | Resposta hoje | HTTP |
| --- | --- | --- | --- | --- |
| `src/app/api/auth/change-password/route.ts` | 72–75 | `updateUserById` | *"Nao foi possivel trocar a senha agora."* | **500** |
| `src/app/api/base/users/route.ts` | 274–276 | `createUser` | *"Nao foi possivel criar o usuario de autenticacao."* | **500** |
| `src/app/api/base/users/[id]/reset-password/route.ts` | 44–47 | `updateUserById` | *"Nao foi possivel redefinir a senha do usuario."* | **500** |
| `src/app/api/setup/initial-admin/route.ts` | 268–270 | `createUser` | *"Nao foi possivel criar o usuario de autenticacao."* | **500** |

**O tratamento NÃO é o mesmo nas quatro** — e a versão anterior deste documento errou ao dizer que
era. Conferido no código:

| Rota | Registra o erro em log? | O que acontece com `error.code` |
| --- | --- | --- |
| `auth/change-password` | **Sim** — `logBaseCadastroError("auth.change_password_update_failed", updateError)` | Vai para o log; descartado na resposta |
| `base/users/[id]/reset-password` | **Sim** — `logBaseCadastroError("users.password_reset_failed", updateError)` | Vai para o log; descartado na resposta |
| `base/users` (POST) | **NÃO** | `if (authError \|\| !authUser.user) { return apiError(...) }` — **o erro é descartado por completo** |
| `setup/initial-admin` | **NÃO** | `if (authError \|\| !authUser.user) { return errorResponse(...) }` — **o erro é descartado por completo** |

**Nas duas que não registram, o achado é pior do que o 500.** O `error.code` não vai para lugar
nenhum: nem para a resposta, nem para o log. Com a proteção ligada, uma criação de usuário recusada
por senha vazada seria **indistinguível** de uma falha de rede ou de um erro de configuração do
Auth — e não haveria como investigar depois, porque não sobra rastro.

**Por que 500 é o pior detalhe deste achado.** Senha vazada não é falha do servidor: é entrada
inválida do usuário, que ele pode corrigir escolhendo outra senha. Um 500 diz a ele — e a qualquer
monitoramento — que o **sistema** quebrou. O usuário tenta de novo com a mesma senha, recebe 500 de
novo, e abre chamado.

**O impacto operacional é específico deste sistema.** Há senha temporária definida por admin e trava
de primeiro acesso (`isPasswordChangeRequired`, planos 65/67). Senha temporária **tende** a ser
óbvia — exatamente o tipo que o HaveIBeenPwned rejeita. Com a proteção ligada e o mapeamento
ausente, o admin cria usuário, recebe 500, e conclui que o sistema quebrou.

### O que precisa ser feito no código antes de ativar

1. **Mapear `error.code === "weak_password"`** nas quatro rotas para **HTTP 422** com mensagem
   própria em português, no tom do restante do sistema — algo como *"Esta senha aparece em
   vazamentos públicos conhecidos. Escolha outra."*
2. **Não propagar a mensagem bruta do Supabase.** Ela vem em inglês, pode mudar entre versões e pode
   carregar detalhe interno. A mensagem é **nossa**; o `code` é que é contrato.
3. **Log seguro nas quatro** — e aqui há trabalho diferente em cada par:
   - **manter** o log que já existe em `auth/change-password` e em `reset-password`;
   - **acrescentar** log em `base/users` e em `setup/initial-admin`, que hoje descartam o erro.

   **O que o log NUNCA pode conter:** senha, hash de senha, o payload da requisição, ou a mensagem
   que foi mostrada ao usuário. O que ele deve conter é `error.code`, `error.status`, o estágio e
   identificadores não sensíveis — o formato que `logBaseCadastroError` já usa.
4. **Tratamento de fallback inalterado:** qualquer outro `error.code` continua caindo na mensagem
   genérica com 500. Só `weak_password` muda de caminho.

### Testes exigidos

**Unitários — o mapeamento, sem rede:**

- `weak_password` → 422 e mensagem em português;
- outro `code` (ex.: `unexpected_failure`) → mantém 500 e mensagem genérica;
- `error` sem `code`, `code` nulo e `code` desconhecido → 500 genérico (nenhum deles pode virar 422
  por acidente);
- a mensagem devolvida **não** contém texto em inglês vindo do Supabase.

**E2E — os quatro fluxos, com a proteção ligada em staging:**

1. troca de senha pelo próprio usuário com senha vazada → **422**, mensagem legível;
2. criação de usuário interno com senha temporária vazada → **422**, e o admin entende o que fazer;
3. reset de senha por admin com senha vazada → **422**;
4. setup inicial com senha vazada → **422**;
5. **controle negativo:** senha forte e inédita → aceita nos quatro caminhos;
6. **controle de não-regressão:** login de usuário existente continua funcionando — é o teste que
   prova que a mudança não vazou para onde não devia;
7. fluxo completo de primeiro acesso: admin cria usuário → usuário loga → é obrigado a trocar →
   troca.

### Rollback

A configuração **pode ser desativada nas configurações de Auth** (Auth settings), na mesma opção que
a ativou. Reversível e imediato.

**Sobre o comportamento do login, não afirmo nada aqui.** Ele deve seguir **o resultado documentado
do teste em staging** — pela mesma razão da seção acima: o impacto sobre senha já existente é
**incerto**, e uma frase tranquilizadora no rollback contradiria o que este documento reconhece não
saber.

> *(Uma versão anterior afirmava que "a verificação acontece na definição, não no login". Retirada:
> contradizia a própria seção que classifica o impacto no login como incerto.)*

### Ordem, quando desbloquear

1. Implementar o mapeamento + testes unitários (**sem** ativar nada).
2. Confirmar plano Pro nos dois projetos.
3. Ativar **em staging** → E2E dos quatro fluxos → observar uso real.
4. Só então produção → repetir os controles 5, 6 e 7.

**Não ativar nos dois ambientes no mesmo dia.**

---

## AM-02 — Limite de conexões do Auth (Correção 9, parte)

**Estado relatado:** Auth usa limite absoluto de **10 conexões**.

### Decisão: **apenas documentar. Não alterar.**

Não há evidência de que 10 conexões estejam apertando. Os sintomas seriam erro de conexão sob pico
ou latência de login — e **nenhum foi relatado**. Mexer em pool sem evidência costuma trocar um
problema que não existe por um que existe.

### O que observar antes de considerar mudança

- Erros de conexão nos logs de Auth em horário de pico (troca de turno: 6h–8h e 14h–16h).
- Latência de `POST /api/auth/login`.
- `supabase inspect db role-stats --linked` e `role-connections`.

**Só com um desses mostrando pressão é que a mudança se justifica.** Antes disso, é dívida
registrada, não tarefa.

---

## AM-03 — Reconciliação do histórico de migrations

Depende inteiramente de `docs/PLANO_RECONCILIACAO_MIGRATIONS.md`. Registrado aqui porque **o
primeiro passo é manual e é seu**: decidir se algum comando de CLI pode tocar produção.

**Motivo:** a CLI imprime `Initialising login role...` mesmo em comando de leitura — ou seja,
**escreve**. Rodar contra produção violaria a regra de não executar DDL remoto.

A alternativa sem CLI, que é leitura pura, no SQL Editor:

```sql
select version, name from supabase_migrations.schema_migrations order by version;
```

**A tabela não guarda data de aplicação** — só `version`, `name` e `statements`. A fotografia
preserva o conteúdo do ledger e a evidência do estado anterior, não uma data (§7.2 do plano).

### O tamanho real da fila

| Ambiente | Legadas ausentes | Migration nova | **Fila antes do `repair`** |
| --- | --- | --- | --- |
| Staging | 29 | 1 | **30** |
| Produção *(relato até `039`)* | 55 | 1 | **56** |

**29 e 55 são o backlog LEGADO, não o total.** A migration corretiva também está fora do histórico —
mas por nunca ter sido aplicada em lugar nenhum.

> 🔴 **O `repair` é SÓ para as legadas.** A corretiva **nunca** entra em `repair`: isso a marcaria
> como aplicada sem criar índice nenhum, e o histórico passaria a afirmar que a Correção 1 foi
> entregue quando não foi.

---

## AM-04 — Aplicação da migration de paridade de índices (Correção 1)

`supabase/migrations/20260918120033_hr_workflow_idempotency_indexes_parity.sql` está **escrita e não
aplicada**.

### Os objetos desta ação

| | |
| --- | --- |
| **Tabela** | `public.hr_workflow_idempotency_keys` |
| **Índices** | `hr_workflow_idempotency_keys_unit_idx` → `(unit_id)` |
| | `hr_workflow_idempotency_keys_workflow_idx` → `(workflow_id)` |
| | `hr_workflow_idempotency_keys_actor_idx` → `(actor_user_id)` |
| **Origem da declaração** | migration `023`, linhas 149–154 — **não alterada** |

As três colunas são `uuid`. Todas as consultas do §12 do plano usam **exatamente** estes nomes; se
alguma medição for rodada contra outra tabela, o resultado não vale.

| | |
| --- | --- |
| **Staging** | **No-op** quanto aos índices (já existem). O efeito real é **registrar a versão no histórico**. Prova parsing, idempotência e o caminho do `db push` |
| **Produção** | Aqui os índices seriam de fato criados — e **esse caminho não foi testado** |

> **Não trate a passagem em staging como aprovação.** Ela não exercita a criação. O teste do caminho
> de criação exige banco descartável sem os três índices, e está **PENDENTE** (Docker ausente).
> Ver §6.1–6.3 do plano de reconciliação.

### Onde esta ação entra na ordem

É a etapa **(g)** da sequência do §5 do plano, e ela **não pode ser antecipada**. Antes dela:

1. **(a)** fotografar o histórico;
2. **(b)** validar objeto por objeto **somente as legadas**;
3. **(c)** `repair` **somente nas legadas comprovadas**;
4. **(d)** **nunca** `repair` nesta migration;
5. **(e)** `db push --dry-run` deve mostrar **exatamente UMA pendente** — esta. **Zero aqui é
   condição de parada**, não sucesso: significaria que ela foi marcada sem execução;
6. **(f)** preflight dos índices — **§12.3 E §12.4, as duas**, antes de aplicar.

**As duas consultas do preflight param o procedimento, por motivos diferentes:**

| Consulta | Detecta | Para se |
| --- | --- | --- |
| **§12.3** | Um dos três **nomes esperados** já existe com definição diferente ou estado inválido | `existe = true` e `conforme = false` |
| **§12.4** (detector orientado a alvos) | Já existe índice **com OUTRO nome** cujo primeiro campo-chave é uma das três colunas-alvo | qualquer linha devolvida |

> 🔴 **Se a §12.4 devolver linha antes da aplicação: PARE.** Comparar `pg_get_indexdef` e decidir
> com pessoa. **Não aplicar a migration** (criaria um segundo índice sobre a mesma coluna) e **não
> remover nem renomear** o existente automaticamente — ele pode estar em uso por consultas que
> ninguém mapeou.
>
> **O detector do §12.4 foi reescrito**: a versão anterior agrupava por forma e terminava em
> `having count(*) > 1`, o que **não dispara** quando o índice esperado está ausente e existe
> **apenas um** equivalente com outro nome — justamente o cenário que o preflight precisa pegar. A
> consulta atual é orientada aos três alvos e não depende de `count(*)`.

Depois: **(h)** rodar **§12.3 e §12.4 de novo** como confirmação — os três `conforme = true` e zero
candidatos —, validar o histórico, e só então **(i)** o dry-run final mostrar **zero pendentes**.

### Medições obrigatórias antes de produção (§12.1 do plano)

| | |
| --- | --- |
| `count(*)` | volume de linhas |
| `pg_total_relation_size` | tamanho da relação com índices |
| **Atividade de escrita** | **DUAS amostras** de `n_tup_ins/upd/del`, separadas por intervalo definido, com o **delta** calculado. Uma leitura só não mostra atividade atual — os contadores são cumulativos |
| Transações abertas e lock waits | `pg_stat_activity`, `pg_blocking_pids`, `pg_locks` |
| Janela de manutenção | definida **depois** das medições acima |

**A escolha entre `create index` e `CONCURRENTLY` sai dessas medições — não de um corte numérico
fixo.** Não há limiar pré-definido, e inventar um substituiria a medição por um palpite.

### Os dois formatos de aplicação em produção

| Decisão de §12.2 | Como aplicar |
| --- | --- |
| **`create index` normal** | Aplicar a migration normalmente: ela cria os três índices e registra a versão |
| **`CONCURRENTLY`** | Criar os três **manualmente, fora de transação**, um de cada vez; **validar por §12.3 e executar o detector orientado a alvos do §12.4**; **e só então aplicar a migration**, que será **no-op** e servirá para registrar a versão no histórico |

**Nos dois casos a migration é aplicada** — nunca pulada, nunca reparada. É o `db push` que põe a
versão no ledger.

### Rollback desta ação — depende de evidência guardada

> 🔴 **O rollback (§12.6 do plano) NÃO é três `drop index`.** Ele só pode derrubar índice que **esta
> migration criou**, e a prova disso não está no catálogo: um índice criado aqui e um criado pela
> `023` têm **definição idêntica**.
>
> A prova é a coluna `esperado_existe` do preflight **§12.3 ANTES** da aplicação. **Arquive o
> resultado do preflight** — sem ele o rollback fica bloqueado, e não há como recuperar a informação
> depois.

**Em staging o rollback não tem caso de uso:** lá os três índices já existem, a migration é no-op
quanto a eles, e portanto não criou nada que se possa desfazer. Rodar `drop index` ali apagaria
índices vindos da `023`.

---

## Pendências que dependem de decisão sua

| # | Pendência | Bloqueia |
| --- | --- | --- |
| P1 | Autorizar (ou proibir) comandos de CLI contra produção | Reconciliação inteira |
| P2 | **Implementar o mapeamento `weak_password`** nas quatro rotas, com testes | **AM-01 inteiro** |
| P3 | Só depois de P2: ativar AM-01 em staging | Correção 8 |
| P4 | Confirmar que os projetos estão em plano **Pro ou superior** | AM-01 — recurso indisponível abaixo disso |
| P5 | Disponibilizar Docker ou branch descartável | Teste do caminho de criação dos índices (§6 do plano) |
| P6 | Medições do §12.1 em produção | AM-04 |
| P7 | Decidir cada candidato devolvido pelo detector do §12.4 no preflight, se houver | AM-04 — a aplicação fica parada até a decisão |
| P8 | Observar e registrar o comportamento real do login em staging com a proteção ligada | AM-01 — o impacto sobre senha já existente é **incerto** |
