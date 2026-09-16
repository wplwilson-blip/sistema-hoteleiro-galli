# -*- coding: utf-8 -*-
"""
Extrai o corpo de `rooms_apply_transition` da 093 e aplica a mudanca da 094.

A BASE E' A 093 -- a versao mais nova do corpo (trava da ocupacao estreitada, ramo
`occupancy` na releitura e no update). Extrair da 092 regrediria a fatia 78 inteira em
silencio, do mesmo jeito que extrair da 091 teria regredido o `detail` do plano 77.

Mesmo metodo de sempre: nada de redigitar ~380 linhas de regra ja validada.

Uso: python scripts/codex/extract-094-rpc.py > <destino>
"""
import io
import sys

SRC = "supabase/migrations/093_front_desk_occupancy.sql"
s = io.open(SRC, encoding="utf-8").read()

ini = s.index("create or replace function public.rooms_apply_transition(")
fim = s.index("\n$$;\n", ini) + len("\n$$;\n")
corpo = s[ini:fim]


def troca(velho, novo, rotulo):
    global corpo
    if corpo.count(velho) != 1:
        sys.exit("ESPERAVA 1 OCORRENCIA (achou %d): %s" % (corpo.count(velho), rotulo))
    corpo = corpo.replace(velho, novo, 1)


# ---------------------------------------------------------------- o bloco (a) passa a PULAR
troca(
    """      -- (a) CHEGAR EM `inspected` E' SAIDA POR DEFINICAO (D2.1). Permanencia para em `clean`,
      -- entao nao ha outro caminho ate aqui. Isto e' o que fecha o atalho
      -- `cleaning -> inspected` sem exigir um passo a mais da governanta -- e corrige uma
      -- tarefa que estivesse tipada `stayover` porque o hospede saiu DEPOIS da arrumacao de
      -- permanencia. A vistoria e' o ato posterior e mais informado; ela vence.
      --
      -- SEM GUARDA DE DESFECHO, e isto e' DECISAO, nao esquecimento -- diferente do bloco (b),
      -- que filtra `pending` de proposito.
      --
      -- Uma tarefa `declined` ou `cancelled` que chegue aqui vira `done`, e esta certo: NAO SE
      -- ALCANCA `inspected` SEM TER PASSADO PELO CICLO DE LIMPEZA. A propria matriz de
      -- transicao so' aceita `clean -> inspected` e `cleaning -> inspected`, e dispensa nao
      -- mexe no estado de limpeza. Logo, se a tarefa foi dispensada de manha e o quarto chegou
      -- a `inspected` a tarde, o trabalho ACONTECEU depois da dispensa -- o hospede saiu, o
      -- quarto foi arrumado e vistoriado. Registrar isso como `done` e' o unico desfecho
      -- verdadeiro; manter `declined` diria que ninguem entrou num quarto que foi vistoriado.
      --
      -- A maquina de estados e' que garante isso. Se um dia alguem acrescentar uma aresta que
      -- chegue a `inspected` sem passar por limpeza, esta guarda precisa voltar.
      if p_dimension = 'housekeeping' and v_to = 'inspected' then
        update public.housekeeping_tasks
        set service_type = 'checkout'::public.housekeeping_service_type,
            outcome = 'done'::public.housekeeping_task_outcome,
            completed_at = v_at,
            updated_at = now(),
            updated_by = p_actor_id
        where housekeeping_day_id = v_day_id and room_id = v_room_id;
      end if;
""",
    """      -- (a) CHEGAR EM `inspected` E' SAIDA POR DEFINICAO (D2.1). Permanencia para em `clean`,
      -- entao nao ha outro caminho ate aqui. Isto e' o que fecha o atalho
      -- `cleaning -> inspected` sem exigir um passo a mais da governanta -- e corrige uma
      -- tarefa que estivesse tipada `stayover` porque o hospede saiu DEPOIS da arrumacao de
      -- permanencia. A vistoria e' o ato posterior e mais informado; ela vence.
      --
      -- ================================================================================
      -- 16/09/2026 -- ESTE BLOCO PASSA A NAO TOCAR TAREFA COM DESFECHO (plano 80).
      --
      -- LEIA ANTES DE "CONSERTAR DE VOLTA". Ate' a 093 o comentario aqui afirmava:
      --
      --     "Uma tarefa `declined` ou `cancelled` que chegue aqui vira `done`, e esta
      --      certo: nao se alcanca `inspected` sem ter passado pelo ciclo de limpeza.
      --      Registrar isso como `done` e' o unico desfecho verdadeiro."
      --
      -- O raciocinio estava CERTO SOBRE O DESFECHO e ignorava uma coisa que ninguem
      -- tinha ido conferir: ONDE CADA UM DOS DOIS FATOS MORA.
      --
      --   A ARRUMACAO tem segundo domicilio. Ela esta' em `room_status_history`, linha
      --   por linha -- `dirty -> cleaning -> clean -> inspected` --, com hora, autor e
      --   organizacao. Sobrescrever a tarefa nao apaga que o quarto foi arrumado.
      --
      --   A DISPENSA NAO TEM. Dispensa NAO E' TRANSICAO -- decisao da §3 do plano 75,
      --   porque o estado do apartamento nao muda --, entao ela nao aparece no
      --   historico. Ela existe em UM lugar so': nesta linha, em `outcome`,
      --   `decline_origin`, `decline_note` e `completed_at`. Sobrescrever APAGA O FATO
      --   DE VEZ, sem segundo registro em lugar nenhum.
      --
      -- Entre perder o registro de um fato que tem outro domicilio e perder o UNICO
      -- registro de outro, nao ha escolha. Por isso a tarefa com desfecho fica INTACTA.
      --
      -- (Havia tambem um sintoma imediato: `declined` tem a coluna companheira
      -- `decline_origin` com bicondicional, entao o `update` antigo levantava 23514 e a
      -- vistoria respondia 500. Mas o 23514 e' o MOTIVO MENOR. `cancelled` nao tem
      -- coluna companheira: ali o mesmo `update` nao levantava nada e apagava calado --
      -- e e' por isso que os dois desfechos entram na mesma guarda. Tratar so' o que
      -- grita seria deixar de fora exatamente o pior dos dois.)
      --
      -- O QUE ISTO NAO RESOLVE esta no LIMITE CONHECIDO, no rodape deste arquivo, ao
      -- lado do D12 do plano 78: sao o mesmo problema -- dois fatos no mesmo dia, uma
      -- linha so'. A saida definitiva e' a trilha de eventos da tarefa (plano 80, (A)).
      -- ================================================================================
      --
      -- `pending` e `not_done` continuam sendo escritas: nenhuma das duas registra um
      -- fato proprio que a sobrescrita apagaria. `not_done` e' derivada do fechamento do
      -- dia, e a reabertura a devolve.
      if p_dimension = 'housekeeping' and v_to = 'inspected' then
        update public.housekeeping_tasks
        set service_type = 'checkout'::public.housekeeping_service_type,
            outcome = 'done'::public.housekeeping_task_outcome,
            completed_at = v_at,
            updated_at = now(),
            updated_by = p_actor_id
        where housekeeping_day_id = v_day_id
          and room_id = v_room_id
          and outcome in (
            'pending'::public.housekeeping_task_outcome,
            'not_done'::public.housekeeping_task_outcome
          );
      end if;
""",
    "bloco (a) passa a pular tarefa com desfecho",
)

sys.stdout.write(corpo)
