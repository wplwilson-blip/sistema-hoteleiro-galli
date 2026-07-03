# Inventário da suíte E2E — cobertura vs. Fase 3-C

> Gerado em 2026-07-02. Read-only: nenhum código de aplicação ou de teste foi alterado.
>
> Escopo: testes executados por `playwright.e2e.config.ts`, projeto **chromium**
> (`testMatch: /.*\.e2e\.spec\.ts$/`), que depende do projeto **setup**
> (`auth.setup.ts`). Guard anti-produção em `tests/e2e/global-setup.ts`.

## Testes que a config executa

| # | Teste (título) | Arquivo:linha | Fluxo exercitado | O que ASSERTA de fato |
|---|----------------|---------------|------------------|------------------------|
| S0a | autenticar E2E_ADMIN | `tests/e2e/auth.setup.ts:8` | Login programático (POST `/api/auth/login`) do super admin; grava `storageState`. | Nenhum `expect`. Falha (throw) se o login não retornar HTTP ok. Pré-requisito dos demais. |
| S0b | autenticar E2E_MULTI | `tests/e2e/auth.setup.ts:13` | Idem para o não-super (Gerente Departamental, 2 unidades). | Igual acima: throw se login não-ok. |
| S1 | `E2E_ADMIN esta autenticado em /dashboard` | `tests/e2e/smoke.e2e.spec.ts:30` (gerado no loop `for user of E2E_USERS`) | Carrega `storageState` do admin, abre `/dashboard`. | (1) URL **não** casa `/login` → sessão aplicada; (2) `main` visível → layout autenticado montou. Não escreve nada. |
| S2 | `E2E_MULTI esta autenticado em /dashboard` | `tests/e2e/smoke.e2e.spec.ts:30` (mesma factory, 2ª iteração) | Idem para E2E_MULTI. | Iguais a S1. |
| T2 | `compras: fluxo completo (<=R$200, com anexo) + invariante de unidade ativa — E2E_MULTI` | `tests/e2e/compras-fluxo.e2e.spec.ts:47` | Jornada de compras 100% UI: unidade A ativa → cria solicitação → inicia cotação → cria fornecedor [E2E] → cotação ≤R$200 com anexo (upload de fixture) → seleciona vencedora → envia p/ aprovação → aprova como E2E_MULTI. | • solicitação aparece na fila; • cotação salva (card do fornecedor); • classificação **"Formal suficiente"** (não "Crítica"); • badge **"Vencedora"**; • status **"Aguardando aprovação / Gerência Administrativa"**; • **invariante de unidade ativa**: com unidade B ativa a compra some da lista operacional mas **permanece** em Aprovações (visão de rede); • após aprovar, status **"Compra aprovada"**. |
| T3 | `compras: alcada de Diretoria (>R$200) bloqueia aprovacao de Gerencia (403) — E2E_MULTI` | `tests/e2e/compras-diretoria.e2e.spec.ts:29` | Mesma jornada com `unitPrice=300` (>R$200 → alçada Diretoria). E2E_MULTI (só `approvals.decide.administrative`) tenta aprovar. | • status **"Aguardando aprovação / Diretoria Geral"** (roteamento por valor); • POST `/decision` retorna **HTTP 403** (bloqueio server-side de alçada); • modal exibe mensagem de `/autoridade/i`; • estado preservado: continua pendente de Diretoria, **`Compra aprovada` tem count 0**. |

Total que a config roda: **2 setups + 4 testes** (2 smoke + T2 + T3).

## Cobertura dos 4 comportamentos da Fase 3-C

A Fase 3-C = edição das permissões de **perfis** (`profile_permissions`),
página `/configuracoes/perfis-acessos` / rota `/api/admin/permissions/profiles`.
**Nenhum** dos specs acima toca essa página, essa rota ou a tabela
`profile_permissions`. A suíte E2E cobre **autenticação/sessão** (smoke) e
**fluxo de compras + alçada** (T2/T3) — outro domínio.

| Item Fase 3-C | Coberto? | Teste que cobre |
|---------------|----------|-----------------|
| **(a)** Admin revogando a PRÓPRIA permissão é BARRADO (anti-auto-trancamento) — retorna erro, não grava | **NÃO** | **NÃO COBERTO** por nenhum teste E2E. |
| **(b)** Mexer em permissão de perfil SUPER_ADMIN é BARRADO no servidor — retorna erro, não grava | **NÃO** | **NÃO COBERTO**. (T3 prova bloqueio server-side com 403, mas para *alçada de aprovação de compras*, não para `profile_permissions`.) |
| **(c)** Revogar grava SOFT-DELETE (`deleted_at` preenchido), não hard-delete nem `is_allowed=false` | **NÃO** | **NÃO COBERTO**. Nenhum teste inspeciona `profile_permissions`/`deleted_at`. |
| **(d)** Aviso "afeta N usuários AGORA" calculado/exibido com número correto | **NÃO** | **NÃO COBERTO**. Nenhum teste abre a UI de edição de perfis nem valida esse aviso. |

**Resumo:** os 4 comportamentos da Fase 3-C estão **NÃO COBERTOS** pela suíte E2E
atual. Ela valida sessão (smoke) e compras/alçada (T2/T3), não a edição de
permissões de perfil.
