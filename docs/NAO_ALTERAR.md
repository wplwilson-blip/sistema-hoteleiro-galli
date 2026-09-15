# Não Alterar Sem Autorização Explícita

Este arquivo lista áreas sensíveis. O Codex deve parar e pedir confirmação antes de mexer nelas, exceto quando o prompt autorizar claramente.

## Autenticação e Acesso

- Login.
- Autenticação.
- Supabase Auth.
- `auth_email` técnico.
- Setup inicial.
- Regras de permissão.
- `access_profiles`.
- Helpers server-side de sessão/permissão.

## Banco e APIs

- Migrations.
- Estrutura de banco.
- Tabelas operacionais.
- APIs sensíveis.
- RLS/policies.
- Triggers de auditoria/soft delete.
- Se a rota de transições de apartamento passar a casar o erro por `rpcError.code` em vez de
  por mensagem, o `errcode` da RPC `rooms_apply_transition` vira **contrato** — e qualquer
  mudança nele exige revisão conjunta dos dois lados. Hoje o acoplamento é por texto
  (`includes("ROOMS_TRANSITION_STALE")`), e funciona por acidente. É o tipo de acoplamento
  implícito que só machuca quando alguém "melhora" um dos lados sozinho.
- **Filtro que parece redundante é carga até prova em contrário. A prova é um teste que falhe
  sem ele — não um raciocínio sobre o que ele parece fazer.**
  Lição do `dimension === "blocking" ? efeito : null` na rota de transições (plano 78). O
  filtro parecia descuido de quem só tinha uma dimensão com efeito colateral; era carga.
  `canTransition` devolve `effects` contendo **sempre** a dimensão primária, então lê-lo cru
  numa transição de limpeza manda o próprio destino como "efeito colateral" e a RPC grava uma
  segunda linha de `room_status_history` marcada `is_automatic`. O estado do apartamento fica
  certo e só a **trilha de auditoria** fica duplicada — 91 linhas em staging numa rodada, sem
  sintoma em tela nenhuma. E o comentário escrito na hora da mudança afirmava o **oposto** do
  que o código passou a fazer, o que torna a releitura do diff inútil: quem confere lê a
  justificativa e não o efeito. Antes de remover uma condição por parecer supérflua, escreva o
  teste que falha sem ela. Se não conseguir escrever, você ainda não sabe o que ela faz.
- Arquivo de ambiente novo: conferir o `.gitignore` ANTES de escrever a primeira linha nele.
  O repositorio e' publico, e a regra `.env*.local` nao cobre nomes como `.env.e2e`. A
  diferenca entre uma regra faltando e um vazamento de service key e' so' alguem ter criado o
  arquivo antes de a regra existir.

## Conceitos do Produto

- O sistema não é PMS.
- Não criar reservas.
- Check-in/check-out limitado a registrar a ocupação da UH (ocupada/livre), para alimentar a Governança (docs/codex/78).
- Nenhum dado de hóspede em nenhum campo, inclusive observação/texto livre: nome, documento, telefone (LGPD).
- Continuam proibidos, sem exceção: reserva, entidade de hóspede ou estadia, previsão de saída, valor `reserved` de ocupação, folio/conta, tarifa.
- Não criar tarifas.
- Não criar disponibilidade.
- Financeiro limitado a Contas a Pagar operacional (ver seção Financeiro).
- Não criar ponto eletrônico.
- Não transformar em ERP genérico.

## Compras e Aprovação

- Regra de aprovação por alçada.
- Fluxo de cotação vencedora.
- Cotação recomendada V1, salvo sprint específica.
- Vínculo de anexos.
- Bucket `attachments`.
- Status de aprovação.
- Histórico de decisões.
- Alçada por valor é a fonte única (docs/codex/59). Nenhum tipo de compra, título avulso ou tolerância de divergência pode desligar ou contornar a alçada.
- Quem é o comprador do pedido não registra o recebimento da mesma compra (inclusive super admin).

## Financeiro

- Escopo permitido: Contas a Pagar operacional — títulos com ou sem pedido de compra, parcelas, retenções de serviço, baixa manual com comprovante, cancelamento com justificativa.
- Fora do escopo: conciliação bancária, fluxo de caixa projetado, DRE, CNAB/remessa, contas a receber, emissão de NF.
- Título sem pedido só em categorias marcadas como "despesa sem pedido".
- Despesa recorrente: Diretoria aprova o contrato uma vez, com valor-teto; títulos dentro do teto não reaprovam.
- Folha/encargos: somente valor total, nunca título por colaborador.

## Cadastros

- Separação colaborador x usuário.
- Fornecedores somente em Cadastros no menu lateral.
- Não duplicar Fornecedores dentro do menu Compras.
- Códigos técnicos de perfil devem permanecer internos.

## Texto e Status

- Não colocar nome de pessoa em status de aprovação.
- Usar alçadas/funções: Gerência Administrativa e Diretoria Geral.
- Não exibir códigos técnicos em inglês para usuário operacional quando houver label amigável.

## Git e Sprint

- Não misturar sprints.
- Não fazer commit sem instrução explícita.
- Não fazer push sem instrução explícita.
- Não criar migration em sprint somente UI/documentação.
- Não alterar API em sprint somente UI/documentação.

## Revisão desta Lista

- Qualquer proibição desta lista só é revista por decisão explícita do Wilson, registrada neste arquivo.
