# Hotel Galli — Roteiro do "Tudo" (visão de diretor)

> Como chegar a um sistema completo sem construir cinco coisas pela metade.
> Linguagem de negócio, não de código. A regra de ouro: cada fase sustenta a próxima.

---

## Onde o sistema está hoje (verdade, não intenção)

**Funciona de verdade:**
- **Compras com alçada de aprovação** — controle de gasto e rastreabilidade. Quem aprova o quê depende do valor (≤R$200 gerência; acima, diretoria). Classificação de evidência de cotação. Sólido.
- **RH estruturado** — admissão, documentos, cargos, departamentos, ASO, desligamento.
- **Cadastros base** — unidades, departamentos, colaboradores, usuários, fornecedores.

**Existe só como "porta" (placeholder, não faz nada ainda):**
- Recepção, Governança, Manutenção, A&B — aparecem no menu, mas sem função real.

**Rachaduras na fundação (descobertas em teste, escondidas):**
- Identidade do RLS não resolve na versão atual do Supabase (camada de segurança trancando tudo em vez de filtrar por unidade).
- 3 migrations divergiam do banco real (saneadas nesta sessão).
- Gestão de usuário pela metade (sem reset de senha, exclusão deixa lixo, sem edição).
- CPF de colaborador sem unicidade nem validação.

**Importante:** o sistema **ainda não está em uso**. Nenhum problema atual machuca ninguém hoje — mas todos machucariam quando o hotel operar.

---

## O "tudo", em 4 fases (cada uma sustenta a seguinte)

### Fase 1 — Firmar a fundação (alicerce, invisível ao hóspede)
**Por que primeiro:** tudo se apoia em usuários, unidades, permissões e segurança. Construir operação sobre base instável multiplica erros.
- Corrigir a identidade do RLS (o helper de sessão) — para a segurança por unidade funcionar.
- Gestão de usuário completa: reset de senha, exclusão consistente, edição.
- LGPD: registro de acesso a dados sensíveis de RH + retenção.
- Unidade ativa explícita (hoje pega a primeira arbitrariamente).
- Decisão de identidade: CPF único de colaborador.

### Fase 2 — A operação do dia (o que o hóspede sente)
**Por que aqui:** é o que falta pra ser "hotel de verdade", e agora apoia numa base firme.
- **Recepção:** passagem de turno, ocorrências, achados e perdidos, comunicação entre setores.
- **Governança:** estados do quarto (sujo/limpo/inspecionado/bloqueado), checklists, liberação para venda.
- **Manutenção:** chamados, prioridade, preventiva vs corretiva, bloqueio de quarto.
- **A&B:** consumo, café da manhã, ocorrências, requisições internas.
- **Transversal:** "Minhas demandas" — fila única do que cada pessoa precisa fazer.

### Fase 3 — Refinar o que já roda (em paralelo, conforme o uso)
**Por que contínuo:** compras e RH já funcionam; o uso real revela ajustes.
- Fornecedor corporativo (rede), ajustes de alçada, granularidade de perfil.
- Contas a pagar de verdade (hoje é placeholder) — recebe as compras aprovadas.
- Refatorar telas gigantes (qualidade técnica).

### Fase 4 — O PMS (o sonho grande, por último)
**Por que por último:** é o mais complexo e só faz sentido com a casa firme.
- Reservas, check-in/check-out, tarifas, disponibilidade, motor de reservas.
- Integração da operação (Fase 2) com a hospedagem.

---

## A regra que evita "remendar e dar erro"

Antes de cada fase nova, conferir o estado **real** (banco + código), não o documentado. O custo de conferir antes é pequeno; o custo de descobrir tropeçando (como nesta sessão) é grande e desmotiva a equipe.

Métrica de diretor: o sistema só "existe" para uma função quando alguém da operação consegue usá-la sem planilha paralela nem WhatsApp. Menu não é função; tela que salva e o time confia, é.
