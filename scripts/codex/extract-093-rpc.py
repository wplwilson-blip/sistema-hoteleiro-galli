# -*- coding: utf-8 -*-
"""
Extrai o corpo de `rooms_apply_transition` da 092 e aplica as mudancas da 093.

POR QUE UM SCRIPT, e nao redigitar: o corpo tem ~370 linhas de regra ja validada em
producao. Redigitar e' uma classe inteira de erro de transcricao -- e este projeto ja
pagou por ela. Mesmo metodo da 091 (extraiu da 090) e da 092 (extraiu da 091).

A BASE E' A 092, NAO A 091: a 092 redefiniu a funcao (092:428) para pôr o `detail` no
ROOMS_TRANSITION_STALE. Extrair da 091 regrediria o 409 do plano 77 em silencio.

Uso: python scripts/codex/extract-093-rpc.py > <destino>
"""
import io
import sys

SRC = "supabase/migrations/092_housekeeping_day_close.sql"
s = io.open(SRC, encoding="utf-8").read()

ini = s.index("create or replace function public.rooms_apply_transition(")
fim = s.index("\n$$;\n", ini) + len("\n$$;\n")
corpo = s[ini:fim]


def troca(velho, novo, rotulo):
    """Substitui exigindo ocorrencia UNICA: ambiguidade aqui e' defeito silencioso."""
    global corpo
    if velho not in corpo:
        sys.exit("NAO ENCONTRADO: " + rotulo)
    if corpo.count(velho) != 1:
        sys.exit("AMBIGUO (%d ocorrencias): %s" % (corpo.count(velho), rotulo))
    corpo = corpo.replace(velho, novo, 1)


# ---------------------------------------------------------------- 1) a trava que ESTREITA
troca(
    """  -- Ocupacao nao tem escritor nesta release (plano 70, D1). A trava vive na
  -- aplicacao E aqui: uma chamada direta a RPC nao deve contornar a decisao.
  if p_dimension = 'occupancy' then
    raise exception 'ROOMS_TRANSITION_NO_WRITER' using errcode = '22023';
  end if;
""",
    """  -- A TRAVA DA OCUPACAO NAO CAIU: ELA ESTREITOU (plano 78, D1).
  --
  -- Ate' a 092 este ponto levantava ROOMS_TRANSITION_NO_WRITER incondicionalmente: a D1 do
  -- plano 70 decidiu que `occupancy_status` nasceria SEM ESCRITOR, e a trava existia para que
  -- uma chamada direta nao contornasse a decisao pela porta dos fundos. A mesma D1 previu que
  -- o escritor apareceria. E' esta fatia -- a Recepcao.
  --
  -- Mas DERRUBAR a trava seria a coisa errada, e o resultado desta migration e' MAIS FORTE que
  -- o de antes, nao mais fraco:
  --
  --   ANTES: bloqueava por AUSENCIA de escritor. E' uma trava sobre um vazio -- some
  --          exatamente no dia em que o vazio e' preenchido, junto com a decisao que protegia.
  --
  --   AGORA: a dimensao aceita DUAS FORMAS e nada mais, e a segunda EXIGE o efeito. A frase do
  --          Wilson -- "de ocupado para livre nao existe, tem que ir para sujo" -- passa a ser
  --          INVARIANTE DE BANCO, nao convencao da rota. Uma segunda rota escrita amanha, ou um
  --          `select` no SQL Editor, NAO CONSEGUE produzir um apartamento vago e vistoriado que
  --          ninguem arrumou.
  --
  -- A validacao da forma e' POR ITEM e vive dentro do laco, junto do `from`/`to`/efeito de cada
  -- apartamento -- nao aqui, onde so' existe a dimensao do lote.
""",
    "trava NO_WRITER -> estreitada",
)

# ---------------------------------------------------------------- 2) forma da ocupacao, por item
troca(
    """    -- HORA DO FATO, POR APARTAMENTO (plano 75, D5 e D8). Nulo = agora.""",
    """    -- AS DUAS FORMAS DA OCUPACAO (plano 78, D1). Conferidas ANTES do lock: e' validacao da
    -- FORMA DO PEDIDO, nao do estado do apartamento -- e recusar cedo evita segurar lock para
    -- morrer em seguida.
    --
    --   check-in   `vacant`   -> `occupied`   SEM efeito de limpeza
    --   check-out  `occupied` -> `vacant`     COM efeito, e o efeito so' pode ser `dirty`
    --
    -- Por que o check-in NAO mexe na limpeza: o hospede acabou de entrar num quarto que estava
    -- arrumado. Zerar `housekeeping` no check-in diria que esta' sujo quando nao esta'.
    --
    -- Por que `inspected` nao aparece aqui de forma alguma (plano 78, D4): liberar para venda e'
    -- ato da Governanca. Esta e' a PRIMEIRA das tres camadas que protegem essa fronteira -- as
    -- outras duas sao o perfil sem `rooms.inspect` e a matriz do `canTransition` --, e e' a
    -- unica que vale contra uma chamada direta a RPC.
    if p_dimension = 'occupancy' then
      if v_from = 'vacant' and v_to = 'occupied' then
        if v_effect is not null then
          raise exception 'ROOMS_TRANSITION_OCCUPANCY_INVALID_FORM'
            using errcode = '22023',
                  detail = jsonb_build_object(
                    'room_id', v_room_id,
                    'from', v_from,
                    'to', v_to,
                    'housekeeping_effect', v_effect,
                    'motivo', 'check-in nao altera a limpeza'
                  )::text;
        end if;
      elsif v_from = 'occupied' and v_to = 'vacant' then
        -- O CORACAO DA FATIA. `is distinct from` cobre os dois jeitos de errar numa condicao
        -- so': efeito AUSENTE (nulo) e efeito DIFERENTE de `dirty` -- inclusive `inspected`,
        -- que e' a tentativa que a D4 existe para impedir.
        if v_effect is distinct from 'dirty' then
          raise exception 'ROOMS_TRANSITION_CHECKOUT_REQUIRES_DIRTY'
            using errcode = '22023',
                  detail = jsonb_build_object(
                    'room_id', v_room_id,
                    'housekeeping_effect', v_effect,
                    'motivo', 'de ocupado para livre nao existe: o check-out devolve o apartamento para a governanca'
                  )::text;
        end if;
      else
        raise exception 'ROOMS_TRANSITION_OCCUPANCY_INVALID_FORM'
          using errcode = '22023',
                detail = jsonb_build_object(
                  'room_id', v_room_id,
                  'from', v_from,
                  'to', v_to,
                  'motivo', 'a ocupacao aceita apenas check-in (vacant->occupied) e check-out (occupied->vacant)'
                )::text;
      end if;
    end if;

    -- HORA DO FATO, POR APARTAMENTO (plano 75, D5 e D8). Nulo = agora.""",
    "validacao de forma da ocupacao",
)

# ---------------------------------------------------------------- 3) releitura sob lock
troca(
    """      case p_dimension
        when 'housekeeping' then housekeeping_status::text
        when 'blocking'     then blocking_status::text
      end,""",
    """      case p_dimension
        when 'housekeeping' then housekeeping_status::text
        when 'blocking'     then blocking_status::text
        -- Sem este ramo o `v_current` da ocupacao viria NULO, a comparacao com `v_from` nunca
        -- bateria e TODO check-in morreria como ROOMS_TRANSITION_STALE.
        when 'occupancy'    then occupancy_status::text
      end,""",
    "case da releitura sob lock",
)

# ---------------------------------------------------------------- 4) o update
troca(
    """    if p_dimension = 'housekeeping' then
      update public.rooms
      set housekeeping_status = v_to::public.housekeeping_status,""",
    """    if p_dimension = 'occupancy' then
      -- CHECK-IN E CHECK-OUT NUM UPDATE SO' (plano 78, D2).
      --
      -- E' o ponto onde a fatia poderia dar errado: `occupancy` e `housekeeping` precisam mudar
      -- ATOMICAMENTE. Um sem o outro deixa o apartamento vago e vistoriado -- vendavel com o
      -- quarto sujo. Duas chamadas em sequencia pela rota resolveriam a escrita e nao a
      -- atomicidade, que e' justamente o modo de falha.
      --
      -- Reusa o caminho que o BLOQUEIO ja' percorre desde a 089: mesmo `update`, mesma regra de
      -- relogio, e a linha de historico do efeito gravada logo abaixo com `is_automatic = true`.
      -- Uma funcao dedicada para a Recepcao duplicaria lock, releitura, historico e efeito na
      -- tarefa -- segunda fonte de verdade para as mesmas regras (plano 78, D2, alternativa b).
      update public.rooms
      set occupancy_status = v_to::public.occupancy_status,
          -- `coalesce`: no check-in o efeito e' nulo por construcao (a forma o proibe), e a
          -- limpeza fica exatamente onde estava.
          housekeeping_status = coalesce(v_effect::public.housekeeping_status, housekeeping_status),
          -- Mesmo cuidado do bloqueio: o relogio de "Sujo ha 6 horas" so' reinicia se a limpeza
          -- REALMENTE mudou.
          housekeeping_changed_at = case
            when v_effect is not null and v_effect is distinct from v_current_housekeeping then v_at
            else housekeeping_changed_at
          end,
          updated_at = now(),
          updated_by = p_actor_id
      where id = v_room_id;
    elsif p_dimension = 'housekeeping' then
      update public.rooms
      set housekeeping_status = v_to::public.housekeeping_status,""",
    "update com ramo de ocupacao",
)

sys.stdout.write(corpo)
