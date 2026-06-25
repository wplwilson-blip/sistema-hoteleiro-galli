# Plano — Unidade (e perfil) ativa explícita e trocável

> **Objetivo:** parar de usar units[0] arbitrário como unidade ativa. Permitir que o
> usuário com múltiplos vínculos escolha a unidade ativa, que ela persista, e que o
> perfil ativo acompanhe a unidade escolhida.
> **Motivação real:** o units[0] arbitrário fez Wilson cadastrar departamentos na unidade
> errada sem perceber (a tela pré-seleciona a 1ª unidade). Sintoma de um problema que
> aparece em ~15 telas.

## DESCOBERTA IMPORTANTE (reduz o risco)

O BACKEND (requirePermission / api-auth) NÃO usa activeUnit. Ele recalcula o escopo
completo a cada request: busca TODOS os user_unit_links ativos, TODAS as unidades
acessíveis e TODOS os perfis. A autorização real NÃO depende da unidade ativa.

Consequência: a "unidade ativa" é hoje apenas uma PREFERÊNCIA DE VISUALIZAÇÃO do cliente
(qual unidade a UI pré-seleciona em filtros/formulários). NÃO é trava de segurança.
Portanto, esta mudança é essencialmente UX — NÃO altera autorização. Risco de
"trancar todo mundo" é baixo. Mesmo assim, toca session.ts (sensível) → plano antes.

## Estado atual (verificado)

- src/lib/auth/session.ts linha 178: `activeUnit: units[0]` e `profile` = firstLink (1º vínculo). Arbitrário.
- src/store/app-store.ts: JÁ TEM `setActiveUnit(unitId)` (troca a unidade no cliente). Mas:
  - não troca o profile junto (profile e unidade vêm do mesmo vínculo);
  - não persiste (recarregou, volta pro padrão);
  - tem dados MOCKADOS de dev como valor inicial (Marina Costa, Hotel Rio Centro) —
    sobrescritos por setSessionContext quando a sessão real carrega (inofensivo, mas é lixo).
- activeUnit é consumido em ~15 componentes (telas HR, header, cadastros) + store + login.
- SessionContext (types.ts): user, profile (único), units[], activeUnit.

## Escopo proposto (fatiável)

### Parte 1 — Persistir a unidade ativa escolhida (núcleo)
- Guardar a unidade ativa escolhida pelo usuário (cookie ou localStorage via store).
  Decisão a confirmar: cookie (server pode ler) vs. localStorage (só cliente). Como o
  backend NÃO usa activeUnit, localStorage/Zustand persist basta para a necessidade atual.
- Ao carregar a sessão, se houver unidade salva E ela ainda estiver entre as unidades
  acessíveis do usuário, usar ela como activeUnit; senão, cair no units[0] (fallback seguro).
- setActiveUnit passa a persistir a escolha.

### Parte 2 — Perfil acompanha a unidade ativa
- Hoje profile = firstLink (arbitrário). Mudar para: profile = o perfil DO VÍNCULO da
  unidade ativa. Trocar de unidade → profile correspondente àquela unidade.
- SessionContext.profile passa a ser derivado da unidade ativa, não do 1º link.
- (Se um usuário tiver vínculos só em 1 unidade, nada muda na prática.)

### Parte 3 — Seletor de unidade na UI
- No header (app-header.tsx já consome activeUnit), adicionar um seletor de unidade
  quando o usuário tem mais de uma. Trocar ali troca a unidade ativa (e o perfil) e
  re-renderiza as telas que dependem disso.
- Usuário de unidade única: NÃO vê seletor (ou vê desabilitado) — nada muda pra ele.

### Parte 4 (opcional, limpeza) — remover mock do store
- Trocar os valores mockados iniciais (Marina Costa etc.) por estado vazio/neutro, já
  que são sobrescritos pela sessão real. Baixa prioridade, cosmético.

## Restrições (NAO_ALTERAR)

- session.ts é sensível: plano antes do código (este documento).
- NÃO alterar a lógica de autorização do backend (requirePermission) — ela já recalcula
  escopo e não deve passar a depender de unidade ativa do cliente (isso seria REGRESSÃO
  de segurança). A unidade ativa é só preferência de UI.
- Não quebrar usuário de unidade única (caminho padrão sem escolher nada).
- Sem libs novas (Zustand já tem persist; cookie é nativo do Next).

## Teste (staging)

1. Usuário com 1 unidade: tudo igual a hoje, sem seletor, sem regressão.
2. Usuário com 2+ unidades: troca de unidade no header → telas (ex.: cadastro de
   departamento) passam a refletir a unidade escolhida; o perfil correspondente acompanha.
3. Recarregar a página mantém a unidade escolhida (persistência).
4. Se a unidade salva não estiver mais acessível (vínculo removido), cair no fallback sem erro.
5. CONFIRMAR que a autorização do backend continua igual (não passou a depender de activeUnit).

## Critério de aceite

- Unidade ativa deixa de ser arbitrária; é escolhível e persiste.
- Perfil ativo acompanha a unidade ativa.
- Usuário de unidade única não percebe diferença.
- Backend de autorização inalterado (sem regressão de segurança).
- Lint e build passam.

## Decisões a confirmar com Wilson

1. Persistência: localStorage/Zustand-persist (simples, suficiente) vs cookie (server lê)?
   Recomendação: localStorage/Zustand persist agora, porque o backend não usa activeUnit.
2. Fatiar (núcleo: persistência + perfil; depois: seletor no header) ou tudo junto?
3. Limpar o mock do store nesta leva ou deixar para depois?

---

## DECISÕES CONFIRMADAS por Wilson (não reabrir)

1. **Persistência:** localStorage via Zustand persist. NÃO usar cookie (o backend não usa
   activeUnit, então não há necessidade de o servidor ler a escolha).
2. **Fatiar:** NÚCLEO primeiro (Parte 1 persistência + Parte 2 perfil acompanha a unidade),
   testar, e SÓ DEPOIS o seletor no header (Parte 3). A limpeza do mock (Parte 4) fica para
   o fim ou depois.
3. **Backend inalterado:** a autorização continua recalculando escopo completo no servidor;
   activeUnit permanece só preferência de UI. NÃO introduzir dependência do backend na
   unidade ativa do cliente (seria regressão de segurança).

## ESTA LEVA (núcleo) = Partes 1 + 2 apenas
- Parte 1: persistir a unidade ativa escolhida (Zustand persist / localStorage); ao carregar,
  usar a salva se ainda acessível, senão fallback para units[0].
- Parte 2: profile passa a ser derivado do vínculo da unidade ativa (não do 1º link).
- Seletor no header (Parte 3) = PRÓXIMA leva, não agora.
