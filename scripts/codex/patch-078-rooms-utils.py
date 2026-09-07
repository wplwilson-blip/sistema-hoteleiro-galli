# -*- coding: utf-8 -*-
"""
Aplica no espelho puro (`rooms-utils.ts`) as mudancas da fatia 78, na MESMA ordem em que a
093 as aplica no banco. Script, e nao edicao a mao, pelo motivo de sempre: o que tem que
casar com SQL nao deve ser redigitado duas vezes.
"""
import io
import sys

P = "src/components/base-cadastros/rooms-utils.ts"
s = io.open(P, encoding="utf-8").read()


def troca(velho, novo, rotulo):
    global s
    if s.count(velho) != 1:
        sys.exit("ESPERAVA 1 OCORRENCIA (achou %d): %s" % (s.count(velho), rotulo))
    s = s.replace(velho, novo, 1)


# ------------------------------------------------------------------ 1) o comentario da coluna
troca(
    """/** public.occupancy_status. Dono: a futura fatia de reservas. Escritor hoje: NINGUEM (D1). */""",
    """/**
 * public.occupancy_status. ESCRITOR: a Recepcao, desde o plano 78 (migration 093).
 *
 * Ate' a 092 esta coluna nao tinha escritor -- e nao estava vazia, estava CONGELADA: a 089
 * fez backfill dela a partir do `room_status` legado e nenhuma linha de codigo a alterou
 * depois. Parecia plausivel, que e' a pior forma de um dado estar errado.
 *
 * Dois valores, e continuam dois. `reserved` como terceiro seria a conflacao que a 089
 * desfez, de volta: reserva e' fato sobre um PERIODO, nao sobre o estado presente da UH.
 */""",
    "comentario de OCCUPANCY_STATUS_VALUES",
)

# ------------------------------------------------------------------ 2) o codigo de permissao
troca(
    """export const ROOM_PERMISSIONS = {
  view: "BASE:rooms.view",
  block: "BASE:rooms.block",
  manage: "BASE:rooms.manage",
  housekeeping: "BASE:rooms.housekeeping",
  inspect: "BASE:rooms.inspect"
} as const;""",
    """export const ROOM_PERMISSIONS = {
  view: "BASE:rooms.view",
  block: "BASE:rooms.block",
  manage: "BASE:rooms.manage",
  housekeeping: "BASE:rooms.housekeeping",
  inspect: "BASE:rooms.inspect",
  /** Check-in e check-out (plano 78, D5). NAO libera para venda -- ver ROOM_PERMISSIONS.inspect. */
  occupancy: "BASE:rooms.occupancy"
} as const;""",
    "ROOM_PERMISSIONS.occupancy",
)

# ------------------------------------------------------------------ 3) a matriz de concessao
troca(
    """  "BASE:rooms.housekeeping": ["SUPER_ADMIN", "UNIT_DIRECTOR", "LIDER_GOVERNANCA"],
  "BASE:rooms.inspect": ["SUPER_ADMIN", "UNIT_DIRECTOR", "LIDER_GOVERNANCA"]
};""",
    """  "BASE:rooms.housekeeping": ["SUPER_ADMIN", "UNIT_DIRECTOR", "LIDER_GOVERNANCA"],
  "BASE:rooms.inspect": ["SUPER_ADMIN", "UNIT_DIRECTOR", "LIDER_GOVERNANCA"],
  // LIDER_GOVERNANCA NAO esta aqui, e e' decisao, nao esquecimento: e' a metade reciproca da
  // D4 do plano 78. A governanta nao marca ocupacao pelo mesmo motivo que a recepcionista nao
  // vistoria -- cada setor escreve numa dimensao so'.
  "BASE:rooms.occupancy": ["SUPER_ADMIN", "UNIT_DIRECTOR", "RECEPCAO"]
};""",
    "matriz de concessao de rooms.occupancy",
)

# ------------------------------------------------------------------ 4) as regras da ocupacao
troca(
    """function rulesFor(dimension: RoomStateDimension): readonly TransitionRule[] {""",
    """/**
 * AS DUAS FORMAS DA OCUPACAO (plano 78, D1) -- o espelho da validacao que a 093 faz na RPC.
 *
 * A trava da ocupacao NAO CAIU: ELA ESTREITOU. Ate' a 092, `canTransition` negava toda
 * transicao de ocupacao com o codigo `no_writer`, porque a D1 do plano 70 decidiu que a
 * coluna nasceria sem escritor. A mesma D1 previu que o escritor apareceria -- e' a Recepcao.
 *
 * Mas derrubar a trava seria a coisa errada. Antes, ela bloqueava por AUSENCIA de escritor:
 * uma trava sobre um vazio, que some no dia em que o vazio e' preenchido. Agora sao duas
 * formas e nada mais, e o check-out EXIGE o efeito -- "de ocupado para livre nao existe, tem
 * que ir para sujo" vira regra, aqui e no banco.
 *
 * `inspected` NAO APARECE, e nao pode aparecer: liberar para venda e' ato da Governanca
 * (D4). Esta e' a terceira das tres camadas que protegem a fronteira -- a primeira e' a forma
 * na RPC (a unica que vale contra chamada direta), a segunda e' o perfil sem `rooms.inspect`.
 */
const OCCUPANCY_RULES: readonly TransitionRule[] = [
  // CHECK-IN. Sem efeito: o hospede acabou de entrar num quarto que estava arrumado, e zerar
  // a limpeza aqui diria que esta' sujo quando nao esta'.
  { from: "vacant", to: "occupied", permission: ROOM_PERMISSIONS.occupancy },
  // CHECK-OUT. O efeito NAO e' opcional e NAO e' cortesia: o check-out nao devolve o
  // apartamento para a venda, devolve para a governanca. Um apartamento que fosse para
  // `vacant` mantendo `inspected` ficaria VENDAVEL com o quarto sujo -- e' o modo de falha
  // que a fatia inteira existe para impedir.
  { from: "occupied", to: "vacant", permission: ROOM_PERMISSIONS.occupancy, effects: { housekeeping: "dirty" } }
];

function rulesFor(dimension: RoomStateDimension): readonly TransitionRule[] {""",
    "OCCUPANCY_RULES",
)

troca(
    """  // Ocupacao entra sem escritor (D1), de proposito. A coluna existe para que ninguem enfie
  // "esta ocupado" dentro de housekeeping_status; quem a escreve e' a futura fatia de
  // reservas. Ate' la', toda transicao de ocupacao e' negada AQUI -- e nao apenas por
  // ausencia de tela, que seria uma trava que a primeira chamada direta a rota contorna.
  return [];
}""",
    """  return OCCUPANCY_RULES;
}""",
    "rulesFor devolve OCCUPANCY_RULES",
)

# ------------------------------------------------------------------ 5) o ramo do canTransition
troca(
    """  if (dimension === "occupancy") {
    return {
      allowed: false,
      code: "no_writer",
      message: "A ocupacao do apartamento ainda nao e' operada pelo sistema."
    };
  }

""",
    """""",
    "ramo no_writer do canTransition",
)

# ------------------------------------------------------------------ 6) o codigo de negacao fica
troca(
    """  | "no_writer\"""",
    """  // `no_writer` DEIXA DE SER ALCANCAVEL pela ocupacao na fatia 78 -- e CONTINUA AQUI, junto
  // com a sua chave no `denialStatusMap` da rota. Tirar os dois e descobrir o buraco em
  // producao e' caro; manter custa uma linha, e o dia em que uma dimensao nova nascer sem
  // escritor o codigo ja' existe.
  | "no_writer\"""",
    "codigo de negacao no_writer permanece",
)

io.open(P, "w", encoding="utf-8", newline="\n").write(s)
print("rooms-utils.ts: espelho da fatia 78 aplicado")
