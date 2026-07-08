# Decisão de roadmap — Fatia 2.2 congelada; visibilidade de NR ao líder migrada para a CORE de demandas globais

> 2026-07-08 · **Doc de decisão.** Registra roadmap. Não altera código, migration, seed nem planos existentes.

## Contexto

A **Fatia 2.1** (evento funcional de vencimento de NR) está em `main` (commits `0b49c9d`/`544365b`,
migration `076` aplicada em staging + produção pelo dono). O objetivo declarado do dono era: **o líder de
setor ser avisado quando uma NR de um colaborador vence.** A **Fatia 2.2** (tornar a certificação NR
não-sensível por padrão — plano em [docs/codex/33-plano-fatia2-2-nr-nao-sensivel.md](33-plano-fatia2-2-nr-nao-sensivel.md))
foi desenhada como o **meio** para atingir esse objetivo.

## Achado que motivou a decisão

Investigação read-only em [docs/codex/34-investigacao-lider-ve-nr.md](34-investigacao-lider-ve-nr.md):

**Tornar a NR não-sensível NÃO faz o líder ver nada.** As permissões de **base** —
`HR:occupational.view` (concedida em `056:167`) e `HR:history.view` (concedida em `021:38-45`) — são
outorgadas **apenas ao `SUPER_ADMIN`**. O perfil do líder (`SUPERVISOR`) **não tem nenhuma `HR:*`**; recebe
só `BASE`/`PURCHASES`/`ATTACHMENTS` (`064:119-126`).

Conceder essas permissões ao líder (**Caminho 1**) daria a ele **leitura ampla de toda a saúde ocupacional
e do histórico funcional** de todos os colaboradores da unidade — muito além do objetivo ("esta NR venceu"),
e contra:
- a **separação SST × líder** da matriz (`RH-35B`: saúde ocupacional é escopo de `SST`; o líder opera
  "demandas do setor"), e
- o **princípio de menor privilégio** (LGPD).

## Decisão do dono

Seguir o **Caminho 2**: rotear a NR vencida ao líder como **demanda dirigida** ("Minhas demandas"), **sem**
conceder acesso ao módulo ocupacional. Consequências:

1. **Fatia 2.2 CONGELADA** (não abandonada). **Não** alterar o CHECK
   `employee_nr_certifications_visibility_check` (`056:76-78`) nem o default de sensibilidade em
   `prepareNrCertificationWrite` (`occupational-health.ts:222-223`). O plano 33 permanece como referência;
   reativa **só se**, no futuro, a NR precisar aparecer numa **tela ocupacional** além da demanda.
2. **Não conceder** `occupational.view`/`history.view` ao perfil do líder.
3. **Ganho vigente da 2.1 preservado:** NR vencida continua sendo **evento funcional auditável** para
   SST/RH.

## Próxima fatia real: CORE de demandas globais

Infraestrutura que **lê eventos funcionais** (e outras origens) e **roteia ao destinatário** por
papel/unidade, materializando "Minhas demandas". É quem vai **consumir** `nr_expired`/`nr_expiring` e
entregá-lo ao líder do setor **sem** dar-lhe `occupational.view`.

Fluxo provável (o de sempre): **migration** (tabela central de demandas) → **área sensível** →
**diagnóstico read-only** → **plano** → **código**.

Referências: `RH-35B` §18/§18.1 (roteamento de demandas); follow-up da Fatia 2.1 em
[docs/codex/31-plano-fatia2-1-evento-nr.md](31-plano-fatia2-1-evento-nr.md) §8.
