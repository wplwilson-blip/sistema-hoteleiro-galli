import { NextResponse } from "next/server";
import {
  HOUSEKEEPING_DECLINE_ORIGIN_VALUES,
  ROOM_PERMISSIONS,
  type HousekeepingDeclineOrigin
} from "@/components/base-cadastros/rooms-utils";
import { requirePermission, userHasPermissionForUnit } from "@/lib/auth/permissions";
import { apiError, logBaseCadastroError } from "@/lib/base-cadastros/api-helpers";

// Dispensa de arrumação (plano docs/codex/75, D3).
//
// Boa parte das permanencias o hospede nao quer que arrumem. A dispensa chega por dois caminhos
// -- a recepcao avisa antes, ou a camareira descobre na porta --, e REGISTRAR QUAL DOS DOIS e' o
// que permite avaliar depois se o aviso da recepcao esta funcionando.
//
// A dispensa ENCERRA a tarefa, nao a deixa pendente: nao e' trabalho que ficou faltando, e'
// trabalho que nao existiu. O numero que a governanta olha no fim do dia e' "o que ficou por
// fazer" -- se dispensa contasse ali, ela terminaria todo dia com vinte vermelhos que nao sao
// problema nenhum, e em duas semanas pararia de olhar o numero.
//
// O APARTAMENTO NAO MUDA DE ESTADO: dispensa nao e' transicao. O estado de limpeza continua o
// que era, e e' justamente o ponto -- por isso ela vive na tarefa do dia e nao em
// `room_status_history`.

function isDeclineOrigin(value: unknown): value is HousekeepingDeclineOrigin {
  return typeof value === "string" && (HOUSEKEEPING_DECLINE_ORIGIN_VALUES as readonly string[]).includes(value);
}

type Params = { params: { id: string } };

export async function PATCH(request: Request, { params }: Params) {
  const { context, response } = await requirePermission(ROOM_PERMISSIONS.view, { scope: "active-unit" });

  if (response || !context) {
    return response;
  }

  try {
    const supabase = context.supabase;

    let body: { outcome?: unknown; declineOrigin?: unknown; declineNote?: unknown };

    try {
      body = (await request.json()) as typeof body;
    } catch {
      return apiError("Corpo da requisicao invalido.", 400);
    }

    // Esta rota registra DISPENSA e so' isso. Concluir tarefa acontece pela transicao de
    // estado (a limpeza de fato mudou), e reabrir tarefa concluida nao e' operacao de
    // governanca -- e' o dia inteiro que reabre, com registro.
    if (body.outcome !== "declined") {
      return apiError("Esta rota registra apenas dispensa de arrumacao.", 422);
    }

    if (!isDeclineOrigin(body.declineOrigin)) {
      return apiError("Informe se a dispensa foi avisada pela recepcao ou descoberta na porta.", 422);
    }

    const declineNote =
      typeof body.declineNote === "string" && body.declineNote.trim() ? body.declineNote.trim() : null;

    const { data: task, error: taskError } = await supabase
      .from("housekeeping_tasks")
      .select("id, unit_id, outcome, housekeeping_days!inner(closed_at)")
      .eq("id", params.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (taskError) {
      logBaseCadastroError("rooms.task_lookup_failed", taskError);
      return apiError("Nao foi possivel carregar a tarefa.", 500);
    }

    if (!task || (!context.accessibleUnitIds.includes(task.unit_id) && !context.isSuperAdmin)) {
      return apiError("Tarefa nao encontrada.", 404);
    }

    // A ORIGEM DECLARADA PRECISA CASAR COM QUEM ESTA' LANCANDO (plano 78, D6).
    //
    // ACHADO, e a versao honesta dele: este gate NAO estava aberto demais -- estava fechado
    // para a Recepcao. Ate' aqui ele exigia `rooms.housekeeping` para QUALQUER dispensa,
    // inclusive a de origem `front_desk`, que por definicao e' lancada por quem NAO opera
    // limpeza. A dispensa da recepcao existia no modelo desde a 091 e nao tinha por onde
    // entrar; ninguem percebeu porque nao havia perfil de recepcao para tentar.
    //
    // O gate continua POR ORIGEM -- a origem NAO e' rotulo decorativo, e a D3 do plano 75 a
    // criou para responder "o aviso da recepcao esta' funcionando?". Mas ele e' ASSIMETRICO:
    //
    //   `front_desk`  -> `rooms.occupancy` OU `rooms.housekeeping`
    //   `housekeeper` -> `rooms.housekeeping`
    //
    // A ASSIMETRIA E' DELIBERADA E PERMANENTE (plano 71.0, D2). Nao e' concessao temporaria
    // ate' a tela da recepcao existir; nao feche quando o plano 79 chegar.
    //
    //   INFORMACAO VIAJA DA RECEPCAO PARA A GOVERNANCA POR DESENHO.
    //   PRESENCA FISICA NAO VIAJA.
    //
    // A versao anterior deste gate exigia `rooms.occupancy` para `front_desk`, e se apoiava
    // numa frase: "uma recepcionista nao registra 'descoberto na porta': ela nao esteve na
    // porta". A frase esta' CERTA. A reciproca que ela assume e' FALSA, e falsa em producao:
    //
    //   A GOVERNANTA TAMBEM NAO ESTEVE NA PORTA quando registra `housekeeper`. Quem esteve foi
    //   a camareira, que contou para ela -- a D6 do plano 75 escreve isso com todas as letras
    //   ("hoje ela avisa e a governanta lanca"). A camareira nao tem sistema; e' a premissa da
    //   linha de trabalho inteira.
    //
    // Ou seja: este gate NUNCA protegeu presenca. Ele protege DE QUAL SETOR VEIO A INFORMACAO
    // -- que e' exatamente o que `decline_origin` ja' declara. Exigir `rooms.occupancy` para
    // `front_desk` garantia um atributo que o campo declara, e barrava a governanta de
    // transcrever um aviso que so' chega ate' ela.
    //
    // O QUE CONTINUA FECHADO, e e' o que precisava ficar: `RECEPCAO` nao declara `housekeeper`.
    // Essa e' a afirmacao de presenca fisica no lugar de outro setor, e ninguem a faz pelos
    // outros. Ver o E2E do plano 71.0 -- ele quebra nos dois sentidos.
    //
    // QUEM DIGITOU fica no `updated_by`: `front_desk` lancada por RECEPCAO e' a recepcao
    // registrando o proprio aviso; lancada por LIDER_GOVERNANCA e' a governanca transcrevendo.
    // Ressalva honesta: `updated_by` guarda a PESSOA, nao o perfil dela NA EPOCA -- se alguem
    // trocar de perfil, a leitura historica fica ambigua. E' pequeno (tres ocupantes) e e' o
    // preco exato que separa esta saida da alternativa (e), abaixo.
    //
    // A SAIDA MAIS PRECISA, REGISTRADA E NAO CONSTRUIDA: um terceiro valor de origem,
    // `front_desk_relayed` ("a governanca transcreveu o aviso"). Tres valores, tres fatos,
    // zero ambiguidade. Descartada porque VALOR DE ENUM NAO SE REMOVE -- ficaria no schema para
    // sempre -- e o que ela compra (distinguir quem digitou) o `updated_by` ja' registra. A
    // pergunta que o campo existe para responder tem a MESMA resposta com ou sem o relay,
    // porque o aviso aconteceu nos dois casos. Continua disponivel e ADITIVA se em seis meses
    // a distincao virar pergunta real.
    //
    // A ALTERNATIVA QUE NAO FIZEMOS, e por que: lancar tudo como `housekeeper` ate' o 79.
    // Nao e' perda de informacao, e' INFORMACAO FALSA na direcao ruim -- a contagem de
    // `front_desk` iria a ZERO, e zero le-se como "a recepcao nunca avisa", o oposto da
    // verdade. E o dado PERSISTE depois do 79. E' a mesma familia do `occupancy_status`
    // congelado da §1 da 093: dado que PARECE PLAUSIVEL e esta' errado -- a forma mais cara de
    // um dado estar errado, e a terceira vez que esta linha de trabalho a encontra.
    //
    // NAO "RESOLVA" ISTO PELA MATRIZ DE CONCESSOES: dar `rooms.occupancy` a LIDER_GOVERNANCA
    // desfaria a D4 do plano 78 inteira (ela passaria a fazer check-in e check-out). A matriz
    // continua INALTERADA, e ha' teste unitario que quebra se alguem a alargar.
    const permissoesDaOrigem =
      body.declineOrigin === "front_desk"
        ? [ROOM_PERMISSIONS.occupancy, ROOM_PERMISSIONS.housekeeping]
        : [ROOM_PERMISSIONS.housekeeping];

    let origemAutorizada = false;

    for (const permissao of permissoesDaOrigem) {
      if (await userHasPermissionForUnit(supabase, context.session, permissao, task.unit_id)) {
        origemAutorizada = true;
        break;
      }
    }

    if (!origemAutorizada) {
      return apiError("Voce nao tem permissao para registrar dispensa com esta origem.", 403);
    }

    const day = task.housekeeping_days as unknown as { closed_at: string | null };

    // Dia fechado nao recebe lancamento. Reabrir e' um ato proprio, explicito e registrado --
    // deixar a dispensa entrar num dia fechado seria mudar o passado sem que ninguem soubesse.
    if (day?.closed_at) {
      return apiError("O dia esta fechado. Reabra o dia para registrar.", 409);
    }

    if (task.outcome !== "pending") {
      // So' tarefa pendente pode ser dispensada: `done` ja aconteceu, `declined` ja esta, e
      // `cancelled`/`not_done` sao desfechos que a dispensa nao descreve.
      return apiError("Esta tarefa ja tem desfecho.", 422);
    }

    const { error } = await supabase
      .from("housekeeping_tasks")
      .update({
        outcome: "declined",
        decline_origin: body.declineOrigin,
        decline_note: declineNote,
        completed_at: new Date().toISOString(),
        updated_by: context.session.user.id,
        updated_at: new Date().toISOString()
      })
      .eq("id", params.id);

    if (error) {
      logBaseCadastroError("rooms.task_decline_failed", error);
      return apiError("Nao foi possivel registrar a dispensa.", 500);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    logBaseCadastroError("rooms.task_patch_unexpected", error instanceof Error ? error : { message: "unknown" });
    return apiError("Nao foi possivel registrar a dispensa.", 500);
  }
}
