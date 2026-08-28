# 69 — Plano: Fatia B — resolver de permissão em lote

Status: **plano para revisão. Nenhum código escrito.**
Continua o [53](53-plano-n1-resolver-permissao.md), que fechou a Fatia A (memoização das
folhas invariantes) e registrou, em §1, que a Fatia B teria *"fatia própria, plano próprio"*.
Baseline de medição no [40](40-baseline-resolver-permissao.md).

Área sensível (`src/lib/auth/permissions.ts`) → plano antes de código, por `NAO_ALTERAR.md`.
**Sem migration. Sem mudança de RLS. Sem tocar Auth nem helper de sessão.**

---

## 1. O estado real hoje

A Fatia A está mesclada e funcionando: `sessionLeafCache`, um `WeakMap` chaveado pela
identidade do objeto `SessionContext` ([permissions.ts:148](../../src/lib/auth/permissions.ts)),
memoiza as três leituras que **não** dependem do code — perfil super-admin, vínculos ativos e
lista de unidades ativas.

Sobraram as três que dependem do code, e são justamente as que se repetem:

| Função | Linha | Consulta | Chave |
| --- | --- | --- | --- |
| `getPermissionId` | 253 | `permissions` por `code` | code |
| `getProfileAllowedIds` | 310 | `profile_permissions` por `permission_id` + perfis | permission_id |
| `applyUserPermissionOverrides` | 337 | `user_permission_overrides` por `permission_id` | permission_id |

`GET /api/hr/employees/[id]` resolve **18 codes** num único `Promise.all`
([route.ts:44-64](../../src/app/api/hr/employees/[id]/route.ts)). Isso são 3 × 18 = 54
consultas que hoje saem separadas, além do que a Fatia A já economizou. É o mesmo pedido
repetido 18 vezes trocando só uma constante.

Por que importa fora da métrica: essa é a ficha do colaborador. Durante admissão e durante
rescisão o RH abre e reabre essa tela dezenas de vezes num turno. Tela que demora não vira
chamado — vira o RH anotando no papel e lançando depois, que é como nasce divergência entre
o sistema e a realidade.

---

## 2. O que entra

Um **pré-carregamento em lote**, por request, das três folhas que variam com o code.

- `permissions`: uma consulta com `.in("code", codes)` → `Map<code, permissionId>`
- `profile_permissions`: uma consulta com `.in("permission_id", ids)` + `.in("access_profile_id", profileIds)` → `Map<permissionId, Set<profileId>>`
- `user_permission_overrides`: uma consulta com `.in("permission_id", ids)` → `Map<permissionId, linhas>`

Guardadas no **mesmo** `sessionLeafCache`, sob a mesma garantia da Fatia A: chave é a
identidade do `SessionContext`, `WeakMap`, sem chave enumerável, morre com o request.
Nenhuma propriedade de segurança nova precisa ser argumentada — é a que já foi aceita.

Alvo: de ~56 consultas para ~10 no GET de detalhe. (O número de partida é ~56, não ~90: a
Fatia A já derrubou de ~90 para ~56 no usuário não-super-admin, conforme registrado em
`claude/AUDITORIA_PROGRESSO.md`. O ~90 do baseline original é anterior a ela.)

---

## 3. O que NÃO entra

- **Nenhuma mudança de regra de autorização.** `resolveOverrideAccess`
  (`src/lib/auth/override-precedence.ts`) continua sendo a única fonte de precedência, e não é
  tocado. O lote muda **de onde o dado vem**, nunca **o que se decide com ele**.
- Nenhum novo code de permissão, nenhum perfil, nenhuma policy.
- Nenhuma outra rota além da do detalhe de colaborador nesta fatia. As demais continuam no
  caminho individual, sem alteração.
- Nada de cache entre requests. Continua valendo o que o comentário em
  [permissions.ts:122](../../src/lib/auth/permissions.ts) já descarta: `unstable_cache` e `Map`
  global por `userId` mantêm permissão revogada viva, e isso é inaceitável aqui.

---

## 4. Decisão que depende de você

**Quem informa a lista de codes ao pré-carregador?**

**(a) API explícita — `preloadPermissionCodes(supabase, session, codes)`.**
A rota chama antes do `Promise.all`. Direto, auditável, sem magia. O risco é ter duas listas
de codes na mesma rota (uma no preload, outra no `Promise.all`) e elas divergirem com o
tempo — alguém adiciona um code embaixo e esquece de cima. O resultado seria silencioso:
volta a fazer consulta individual daquele code, sem erro nenhum.

**(b) Coalescência automática por micro-task.** O resolver acumula os codes pedidos no mesmo
tick e dispara uma consulta só, sem a rota saber. Elegante e sem lista duplicada, mas é
comportamento implícito dentro do arquivo mais sensível do sistema. Numa auditoria futura,
"por que essa consulta às vezes é uma e às vezes são dezoito?" não tem resposta legível.

**(c) — recomendada — API explícita com lista única.** Igual à (a), mas a rota declara os
codes **uma vez só**, num array constante, e monta o objeto `permissions` da resposta
iterando esse mesmo array:

```
const DETAIL_PERMISSION_CODES = [...] as const;   // uma lista, uma vez
await preloadPermissionCodes(supabase, session, DETAIL_PERMISSION_CODES);
```

Isso mata o modo de falha da (a) por construção: não existe segunda lista para divergir.
Custa editar a rota — o que a Fatia A explicitamente não fez ([53:143](53-plano-n1-resolver-permissao.md)) —
e essa é a diferença real entre as duas fatias.

**Recomendo (c).** Peço sua confirmação porque ela muda o formato da rota, não só o interior
do resolver.

---

## 5. Comportamento em erro e em ausência

Três casos que precisam estar decididos antes do código, senão o Claude Code resolve por conta própria — e resolve bem, mas resolve outra coisa:

**Code pedido fora do preload** → cai no caminho individual de hoje, sem erro, sem log de
alarme. Isto não é degradação, é a rede de segurança: garante que nenhuma outra das 129
rotas quebre com esta mudança.

**Code inexistente na tabela `permissions`** → comportamento **idêntico ao atual**. Hoje
`getPermissionId` devolve `undefined` e o fluxo termina em 403 (exceto super-admin, que
nem chega a consultar). O lote não pode transformar isso em 500. Fica registrado que a
detecção de code inexistente é assunto do [48](48-plano-permission-code-misconfig.md), e
esta fatia **não** a resolve nem a piora.

**Falha transitória na consulta em lote** → mesma regra da Fatia A: só sucesso é cacheado, a
entrada é removida, e a próxima chamada tenta de novo. Uma falha de rede não pode contaminar
as 18 resoluções seguintes do mesmo request.

---

## 6. Arquivos afetados

| Arquivo | Mudança |
| --- | --- |
| `src/lib/auth/permissions.ts` | Estende `SessionLeafCache` com as três entradas em lote; três fetchers novos; `getPermissionId`, `getProfileAllowedIds` e `applyUserPermissionOverrides` passam a consultar o lote antes de ir ao banco. |
| `src/app/api/hr/employees/[id]/route.ts` | Lista única de codes + chamada de preload (decisão §4c). |
| `tests/unit/...` | Testes novos, §7. |

**Nada além disto.** Se o Claude Code precisar tocar `override-precedence.ts`, `session.ts`,
`api-auth.ts` ou qualquer migration, é sinal de que o plano está errado — parar e perguntar.

---

## 7. Testes exigidos

Quatro, e os dois primeiros são os que provam que a mudança é segura:

1. **Paridade.** Para um conjunto de codes, o resultado do caminho em lote é idêntico, code a
   code, ao do caminho individual — mesmo conjunto de `unitId`, mesma cardinalidade. Rodar
   com super-admin, com gestor de rede e com gestor de uma unidade só.
2. **Invariância de ordem.** Embaralhar a ordem dos codes no preload não muda nenhum
   resultado. Mesmo espírito dos testes de embaralhamento que já existem para
   `resolveOverrideAccess`.
3. **Fallback.** Um code não incluído no preload resolve normalmente, pelo caminho individual.
4. **Erro não contamina.** Falha na consulta em lote não deixa entrada suja no cache; a
   chamada seguinte reconsulta.

Os 14 testes de `override-precedence` continuam passando sem alteração. Se algum deles
precisar mudar, a mudança saiu do escopo.

---

## 8. Critério de pronto

- `npm run test:unit` — os 14 existentes mais os 4 novos, todos verdes.
- `npx tsc --noEmit` — sem erro.
- Contagem de consultas do `GET /api/hr/employees/[id]`, medida pela instrumentação do
  [40](40-baseline-resolver-permissao.md), caindo de ~56 para ~10 num usuário **não**
  super-admin. Medir com super-admin não prova nada: ele desvia do caminho de resolução.
- Em staging, abrir a ficha de um colaborador com um usuário gestor de uma unidade só e
  conferir que os 18 sinalizadores de permissão da resposta continuam exatamente como antes —
  em especial os quatro `sensitive.view`. Um `false` que virou `true` aqui é exposição de
  saúde ocupacional e conduta de outra unidade; é o pior desfecho possível desta fatia e o
  único que o teste automático sozinho pode não pegar.

---

## 9. Branch

`perf/resolver-permissao-lote`

Diff profundo e estreito: dois arquivos de código. Convive com trabalho paralelo sem
conflito de merge — é por isso que esta frente vem primeiro na fila do
`docs/GUIA_DE_CONVERSAS_E_PROMPTS.md` §7.
