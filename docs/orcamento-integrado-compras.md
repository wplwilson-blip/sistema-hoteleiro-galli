# Orcamento Integrado as Compras

## 1. Objetivo

A base de orcamento integrada existe para controlar compras e solicitacoes antes que elas avancem sem saldo gerencial disponivel. O objetivo e apoiar decisao, aprovacao e auditoria por unidade, departamento, centro de custo, gestor e categoria operacional.

O orcamento nao e um financeiro completo. Ele nao substitui contas a pagar, conciliacao bancaria, fluxo de caixa, contabilidade ou fiscal. Ele funciona como controle gerencial de limite aprovado, reservas, compromissos, realizacoes e ajustes.

## 2. Conexao com Compras

Toda compra normal deve consultar o saldo disponivel da linha orcamentaria antes de seguir. A validacao futura deve usar `budget_line_balances.available_amount`, considerando unidade, periodo mensal, centro de custo, departamento e categoria quando aplicavel.

Quando houver saldo, a compra pode reservar ou comprometer o valor, gerando registro em `budget_reservations` e movimento em `budget_movements`. Quando a compra for cancelada, a reserva deve ser liberada. Quando houver recebimento, medicao ou regra futura equivalente, a reserva pode virar compromisso ou realizado.

## 3. Conexao com Solicitacoes de Pagamento

Solicitacoes de pagamento devem reaproveitar a mesma base para diferenciar valores ja reservados por compras, valores comprometidos por aprovacao e valores realizados gerencialmente. Isso evita que pagamento e compra consumam o mesmo saldo sem rastreabilidade.

Na V1, a base orcamentaria apoia a validacao e a auditoria. Ela nao executa pagamento, nao registra baixa bancaria e nao substitui documentos fiscais.

## 4. Reservado, Comprometido e Realizado

`reserved_amount` representa valor separado para uma compra ou solicitacao em andamento, antes da obrigacao estar consolidada.

`committed_amount` representa valor assumido por aprovacao, pedido ou ordem futura, ainda sem realizacao gerencial final.

`realized_amount` representa valor efetivamente reconhecido na gestao interna, por recebimento, medicao, aceite ou evento futuro definido pelo modulo responsavel.

O saldo disponivel e calculado como:

```text
original_amount + approved_adjustments_amount - reserved_amount - committed_amount - realized_amount
```

## 5. Bloqueio de Compra sem Orcamento

Compra normal sem saldo disponivel deve ser bloqueada ou encaminhada para solicitacao de ajuste orcamentario. O bloqueio deve ocorrer antes da aprovacao final da compra, usando a linha orcamentaria correta e a unidade ativa.

O usuario de Compras pode consultar o saldo necessario para validar a compra, mas nao precisa ver todo o orcamento estrategico da unidade ou da rede.

## 6. Compra Emergencial sem Orcamento

Compra emergencial pode seguir mesmo sem saldo, mas deve ter tratamento proprio:

- exigir justificativa;
- exigir evidencia ou anexo;
- marcar o registro futuro como fora do orcamento;
- gerar `budget_change_requests` com `emergency_flag = true` ou registro equivalente;
- aparecer para ciencia/aprovacao posterior do Diretor;
- gerar auditoria e movimento rastreavel quando aplicavel.

Essa excecao nao deve virar caminho padrao para compra sem controle.

## 7. Aprovacao de Mudancas de Orcamento

Toda mudanca relevante de orcamento deve passar por `budget_change_requests`. A solicitacao pode ser aumento, reducao, transferencia, realocacao ou orcamento extra emergencial.

Transferencia e realocacao devem indicar origem e destino. Aumento deve indicar destino. Reducao deve indicar origem. Quando aprovado, o sistema deve refletir a mudanca em `budget_lines.approved_adjustments_amount` e em `budget_movements`.

## 8. Visibilidade por Perfil

Diretor ve todos os orcamentos dentro do escopo autorizado.

Gerente Administrativa e Gerente Financeiro veem visao financeira e centros de custo permitidos.

Gerente Operacional ve orcamento dos setores operacionais permitidos.

Gestor de Departamento ve apenas seu departamento e centros de custo permitidos.

Compras ve saldo suficiente para validar compra, sem necessariamente acessar detalhes estrategicos.

Colaborador operacional nao ve orcamento.

As policies finais devem combinar `unit_id`, `user_unit_links`, `access_profiles`, `permissions`, departamento e centros de custo permitidos.

## 9. Painel Mensal e Acumulado

O banco nasce com periodos mensais em `budget_periods`, mas a modelagem permite visao acumulada por consultas agregadas sobre meses, centros de custo, gestores, departamentos e categorias.

Dashboards futuros devem mostrar aprovado, ajustado, reservado, comprometido, realizado, cancelado e saldo disponivel por gestor e por unidade.

## 10. O que Entra Agora no Banco

A Sprint 2.6 adiciona:

- enums de status, tipos de movimento, reservas e alteracoes;
- `budget_periods`;
- `budget_lines`;
- `budget_movements`;
- `budget_reservations`;
- `budget_change_requests`;
- view `budget_line_balances`;
- triggers de `updated_at`;
- auditoria generica quando `write_audit_trail()` existir;
- RLS habilitado sem policies finais complexas.

## 11. O que Fica para Telas Futuras

Ficam para sprints futuras:

- cadastro e manutencao de periodos orcamentarios;
- tela de linhas por centro de custo;
- tela de ajuste orcamentario;
- visao de saldo por compra;
- aprovacoes de ajuste;
- paineis mensal e acumulado;
- filtros por gestor, departamento e categoria.

## 12. Integracao Futura com Compras

Quando o modulo de Compras for criado, ele deve:

- exigir unidade, centro de custo e linha orcamentaria quando aplicavel;
- consultar `budget_line_balances.available_amount`;
- bloquear compra normal sem saldo;
- criar reserva em `budget_reservations`;
- registrar movimento em `budget_movements`;
- liberar reserva em cancelamentos;
- converter reserva em compromisso ou realizado conforme evento futuro;
- tratar compra emergencial com justificativa, evidencia, flag fora do orcamento e aprovacao/ciencia posterior.
