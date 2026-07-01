# Norte de Produto — Sistema Hotel Galli

Documento de **visão de longo prazo**. Registra para onde o produto caminha, para que cada módulo
novo nasça conectado à visão — **sem** construir nada especulativo agora. É um mapa de rota, não um
plano de execução.

> **Princípio-guia (repetido do resto do projeto):** não se prepara o futuro construindo peças
> especulativas; prepara-se o futuro mantendo o presente **limpo e bem modelado**. Código limpo +
> disciplinas (organization_id, RLS por organização, autorização granular, auditoria, plano-antes-de-
> código) = a expansão futura vira encaixe, não reescrita. Este documento guia a **ordem** e o
> **encaixe**; ele não antecipa implementação.

---

## 1. A filosofia Front / Back (operação × administração)

O sistema espelha como um hotel real se organiza: duas frentes que se complementam.

- **FRONT (linha de frente / operação):** Recepção, Governança, A&B, Manutenção. Onde o hotel
  **acontece** — em contato com o hóspede e com o físico do hotel. Gera **fatos operacionais**
  (turnos, caixa, quartos, chamados, consumo, ocorrências).
- **BACK (retaguarda / administração):** RH, Compras, Financeiro/Contas a Pagar, Administrativo.
  Onde o hotel se **controla** — confere, aprova, paga, registra, audita.

**A ponte é o coração do sistema:** quase toda ação do front que tenha consequência de dinheiro,
compra, pessoal ou controle **gera uma demanda para o back**. O front gera o fato; o back confere/
aprova/paga. O sistema é o que conecta os dois — sem ele, cada setor vira uma ilha (recepção no
caderno, financeiro descobrindo a diferença no fim do mês).

**Exemplo-mãe (fechamento de caixa):** a Recepção fecha o caixa no **front** (conta, registra o
turno) → o fechamento **sobe para o back** (Financeiro confere, bate valores, aprova ou questiona).
Fato na ponta → conferência na retaguarda.

**Isto NÃO é dois sistemas.** É **um** sistema que (a) diferencia papéis (quem é front, quem é back)
via **permissões** — o projeto de permissões em andamento já é o primeiro tijolo disto — e (b) tem
**fluxos de estado** que atravessam front→back — padrão que o módulo de **Compras já implementa**
(solicitação → cotação → aprovação por alçada → decisão). Cada fluxo novo é uma instância do mesmo
esqueleto: um lado gera, o outro confere, com estados e "minhas demandas" no meio.

---

## 2. Mapa de fluxos Front → Back (os atravessamentos reais)

O padrão recorrente: **um setor gera o fato → outro setor confere/aprova/paga.** Já temos o esqueleto
(Compras). Os demais serão instâncias dele.

| Fato gerado no FRONT | Atravessa para | Ação no BACK |
| --- | --- | --- |
| Recepção **fecha o caixa** do turno | Financeiro | Conferência/auditoria do fechamento; aprova ou questiona. |
| Recepção registra **hóspede faturado** (empresa paga depois) | Financeiro | Vira conta a receber; cobrança/controle. |
| Governança acha **item danificado / avaria no quarto** | Manutenção → Compras | Chamado de manutenção; se precisa peça, vira solicitação de compra → aprovação. |
| A&B registra **consumo / perda / desperdício** | Estoque → Financeiro | Baixa de estoque; custo acompanhado pelo financeiro. |
| Manutenção precisa de **material/peça** | Compras | Solicitação → cotação → aprovação por alçada. |
| Qualquer setor precisa de **gente** | RH | Solicitação de vaga → recrutamento → admissão. |
| Manutenção **bloqueia UH** (quarto indisponível) | Recepção/PMS | Impacto na disponibilidade para venda (quando houver PMS). |

> Cada linha acima, quando o módulo correspondente for construído, será detalhada **estado a estado**
> (como foi feito com o dossiê de Compras) — não agora.

**Transversal a todos:** "Minhas Demandas" (RH-35B §18) é o ponto único onde cada pendência aparece
para quem deve agir — é o que faz a ponte front→back ser visível e cobrável. Auditoria/rastreabilidade
acompanha todo fato crítico.

---

## 3. Módulos futuros (visão; ordem sujeita ao negócio)

Cada módulo marcado como **FRONT** ou **BACK**, com nota **construir × integrar**. A ordem é
sugestão — o negócio decide a prioridade real.

| Módulo | Front/Back | Nota de rota (construir × integrar) |
| --- | --- | --- |
| **Contas a Pagar completo** | Back | **Construir** (já é placeholder; recebe compras aprovadas). Evoluir do que existe. Não virar conciliação bancária completa cedo. |
| **Fechamento de caixa / turno** | Front→Back | **Construir.** Primeiro fluxo front→back operacional; usa o padrão de Compras. Alto valor, baixo risco regulatório. |
| **Recepção / Front office (PMS: check-in/out, UH, disponibilidade)** | Front | **Construir com cuidado** — operação crítica (se cai, a recepção para). É o coração do PMS. Modelar sobre `rooms`/`floors`/`blocks`/`room_status_history` que já existem. |
| **Governança (estados de quarto, inspeção, achados)** | Front | **Construir.** Integra com Manutenção (avaria→chamado) e com a disponibilidade da Recepção. |
| **Manutenção (chamados, preventiva, bloqueio de UH)** | Front | **Construir.** Integra com Governança (recebe avaria) e Compras (pede material). |
| **A&B / Restaurante (venda, ficha técnica, consumo)** | Front | **Construir — o mais complexo.** Ficha técnica = receita que baixa estoque a cada venda; é um subsistema. Modelar só quando a operação de A&B da Galli estiver clara. |
| **Controle de Estoque** | Back/Transversal | **Construir**, acoplado a Compras (entrada) e A&B (saída). Não virar WMS genérico. |
| **Financeiro completo / Faturamento** | Back | **Avaliar integrar.** Fiscal brasileiro é pesado. Construir o controle gerencial; considerar integração para a parte contábil/fiscal. |
| **Emissão de NF (NFe/NFSe)** | Back | **Integrar, quase certamente.** Inferno regulatório (muda por município/ano). Reconstruir raramente compensa; integrar com emissor especializado. |
| **Portal/App do hóspede, motor de reservas** | (nova frente) | **Decisão de rota futura.** É praticamente um 2º produto (usuário anônimo, pagamento online, cara pública). Não confundir com o back office atual. |

---

## 4. O que preparar AGORA (e o que NÃO preparar)

**NÃO preparar:** nenhuma fundação técnica específica desses módulos. Construir alicerce sem a planta
de cada andar = errar a planta e travar. Cada módulo se modela **quando for a vez**, com a operação
real na frente.

**Preparar (já em curso — é postura, não tarefa):**
- **Código limpo e domínio bem modelado** — dá os ganchos de graça (ex.: `rooms`/`floors` já existem;
  compra aprovada já carrega o que o financeiro vai querer).
- **Disciplinas contínuas:** `organization_id` em toda tabela nova; RLS por organização; autorização
  granular por permissão (cada módulo novo herda o motor); auditoria/soft-delete; plano-antes-de-código
  em área sensível.
- **O padrão front→back:** todo módulo operacional novo é desenhado como "que fatos gera, para qual
  back sobem, que conferência/aprovação disparam" — reusando o esqueleto de estados+demandas de Compras.
- **Esta visão registrada** (este documento) — para guiar ordem e encaixe, e não fechar portas óbvias.

---

## 5. Cuidados de rota (visão de diretor de hotel)

- **Não virar "ERP genérico".** O `NAO_ALTERAR.md` já alerta. Crescer com **foco**, um módulo de cada
  vez, cada um bem feito — não o ERP-dos-sonhos de uma vez (é como projetos morrem).
- **Construir × integrar é decisão caso a caso.** O que é diferencial do hotel, construir; o que é
  commodity regulatória (NF, fiscal), integrar.
- **Operação crítica primeiro, com rede.** PMS/Recepção é onde o hotel para se falhar — exige mais
  teste, mais cuidado, rollout gradual.
- **Um fluxo front→back de cada vez.** Começar pelos de maior valor e menor risco (fechamento de
  caixa) antes dos complexos (restaurante com ficha técnica).
- **O hóspede é outra fronteira.** Se um dia houver portal/reservas do hóspede, tratar como novo
  produto (segurança, pagamento, escala e identidade são outros) — não emendar no back office.
