// Tipos e logica PURA compartilhados pela lista e pelo mapa de apartamentos (UH Fase 2,
// plano docs/codex/68).
//
// Vive num .ts separado dos componentes de proposito: e' o que permite testar agrupamento,
// resolucao de aba e consistencia de tons no runner puro, sem browser. E, principalmente,
// e' o que garante que a lista e o mapa leiam os MESMOS mapas de rotulo e tom -- duas
// copias divergiriam no primeiro status novo que alguem acrescentasse.

export type RoomTypeRef = {
  id: string;
  code: string;
  name: string;
  category: string;
  capacity: number | null;
  beds: number | null;
};

export type BlockRef = { id: string; code: string; name: string };
export type FloorRef = { id: string; code: string; name: string; number: number | null };

export type RoomRecord = {
  id: string;
  unitId: string;
  roomNumber: string;
  displayName: string;
  // LEGADO (D2): NENHUMA tela le mais este campo -- lista e mapa passaram para as tres
  // dimensoes. Continua no payload so' porque a coluna continua no banco por uma release;
  // sai junto com ela na migration seguinte.
  roomStatus: string;
  // Situacao do CADASTRO (public.rooms.status / record_status). Nao e' uma das tres
  // dimensoes operacionais: e' a pergunta anterior a elas -- este apartamento faz parte do
  // inventario em uso? Um apartamento inativo nao entra em fila, nao transita e nao vende.
  recordStatus: RoomRecordStatus;
  // As tres dimensoes reais do estado (plano 70, migration 089).
  occupancyStatus: OccupancyStatus;
  housekeepingStatus: HousekeepingStatus;
  blockingStatus: BlockingStatus;
  capacity: number | null;
  isConnecting: boolean;
  connectingRoomId: string;
  climateControl: string;
  hasMinibar: boolean;
  roomType: RoomTypeRef | null;
  block: BlockRef | null;
  floor: FloorRef | null;
};

export type RoomStatusTone = "success" | "warning" | "danger" | "info" | "visual";

/** public.record_status (migration 001), aplicado ao cadastro do apartamento. */
export const ROOM_RECORD_STATUS_VALUES = ["active", "inactive", "archived"] as const;
export type RoomRecordStatus = (typeof ROOM_RECORD_STATUS_VALUES)[number];

export const roomRecordStatusLabelMap: Record<RoomRecordStatus, string> = {
  active: "Ativo",
  inactive: "Inativo",
  archived: "Arquivado"
};

/** Valores do enum public.room_status (migration 001), na ordem em que foram declarados. */
export const ROOM_STATUS_VALUES = [
  "available",
  "occupied",
  "dirty",
  "cleaning",
  "maintenance",
  "blocked",
  "inactive"
] as const;

/**
 * LEGADO (plano 70, D2). `room_status` continua no banco por uma release, mas nenhuma tela
 * o le mais: lista e mapa leem as tres dimensoes abaixo, pela mesma `describeRoomState`.
 * Estes mapas sobrevivem para o backfill e para os testes do enum antigo. Nao acrescente
 * valor aqui: acrescente na dimensao.
 */
export type RoomStatus = (typeof ROOM_STATUS_VALUES)[number];

export function isRoomStatus(value: string): value is RoomStatus {
  return (ROOM_STATUS_VALUES as readonly string[]).includes(value);
}

export const roomStatusLabelMap: Record<RoomStatus, string> = {
  available: "Livre",
  occupied: "Ocupado",
  dirty: "Sujo",
  cleaning: "Em limpeza",
  maintenance: "Manutenção",
  blocked: "Bloqueado",
  inactive: "Inativo"
};

export const roomStatusToneMap: Record<RoomStatus, RoomStatusTone> = {
  available: "success",
  occupied: "info",
  dirty: "warning",
  cleaning: "warning",
  maintenance: "danger",
  blocked: "danger",
  inactive: "visual"
};

export const climateControlLabelMap: Record<string, string> = {
  ar_condicionado: "Ar-condicionado",
  ventilador: "Ventilador"
};

export function roomStatusLabel(value: string) {
  return isRoomStatus(value) ? roomStatusLabelMap[value] : value;
}

export function roomStatusTone(value: string): RoomStatusTone {
  return isRoomStatus(value) ? roomStatusToneMap[value] : "visual";
}

export function climateControlLabel(value: string) {
  if (!value) {
    return "-";
  }

  return climateControlLabelMap[value] ?? value;
}

export function normalizeSearchValue(value: string) {
  return value.trim().toLowerCase();
}

// ---------------------------------------------------------------- alternancia de visao

export type RoomsView = "lista" | "mapa";

/**
 * Resolve a aba a partir do query param `?view=`.
 *
 * O estado da aba vive na URL (e nao em useState) para o card da porta operacional em
 * Governanca/Manutencao poder linkar direto no mapa. Qualquer valor que nao seja "mapa"
 * cai na lista -- inclusive lixo e ausencia -- em vez de quebrar a tela.
 */
export function resolveRoomsView(value: string | null | undefined): RoomsView {
  return value === "mapa" ? "mapa" : "lista";
}

// ---------------------------------------------------------------- agrupamento do mapa

export type RoomsMapBlockGroup = {
  key: string;
  blockName: string;
  rooms: RoomRecord[];
};

export type RoomsMapFloorGroup = {
  key: string;
  floorName: string;
  floorNumber: number | null;
  blocks: RoomsMapBlockGroup[];
};

const UNCLASSIFIED_KEY = "__sem_classificacao__";
const UNCLASSIFIED_LABEL = "Não classificado";

/**
 * Agrupa os apartamentos por andar e, dentro de cada andar, por ala.
 *
 * `block_id` e `floor_id` sao NULLABLE em public.rooms (migration 004). Um apartamento sem
 * ala ou sem andar cai num grupo "Nao classificado" em vez de DESAPARECER da grade -- some
 * silenciosamente e' o pior comportamento possivel para um inventario, porque a tela fica
 * com cara de completa. O grupo sem andar vai para o fim.
 *
 * Ordenacao: andar por floor.number (Subsolo -1, Terreo 0, 1o 1), ala por nome, apartamento
 * por numero (comparacao numerica quando ambos sao numericos, para 9 nao vir depois de 10).
 */
export function groupRoomsByFloorAndBlock(rooms: RoomRecord[]): RoomsMapFloorGroup[] {
  const floors = new Map<string, RoomsMapFloorGroup>();

  for (const room of rooms) {
    const floorKey = room.floor?.id ?? UNCLASSIFIED_KEY;
    const blockKey = room.block?.id ?? UNCLASSIFIED_KEY;

    let floorGroup = floors.get(floorKey);

    if (!floorGroup) {
      floorGroup = {
        key: floorKey,
        floorName: room.floor?.name ?? UNCLASSIFIED_LABEL,
        floorNumber: room.floor?.number ?? null,
        blocks: []
      };
      floors.set(floorKey, floorGroup);
    }

    let blockGroup = floorGroup.blocks.find((block) => block.key === blockKey);

    if (!blockGroup) {
      blockGroup = {
        key: blockKey,
        blockName: room.block?.name ?? UNCLASSIFIED_LABEL,
        rooms: []
      };
      floorGroup.blocks.push(blockGroup);
    }

    blockGroup.rooms.push(room);
  }

  const ordered = Array.from(floors.values()).sort((a, b) => {
    // Sem andar vai para o fim, nao para o comeco (um null nao e' "antes do subsolo").
    if (a.floorNumber === null && b.floorNumber === null) {
      return a.floorName.localeCompare(b.floorName, "pt-BR");
    }

    if (a.floorNumber === null) {
      return 1;
    }

    if (b.floorNumber === null) {
      return -1;
    }

    return a.floorNumber - b.floorNumber;
  });

  for (const floorGroup of ordered) {
    floorGroup.blocks.sort((a, b) => {
      if (a.key === UNCLASSIFIED_KEY) {
        return 1;
      }

      if (b.key === UNCLASSIFIED_KEY) {
        return -1;
      }

      return a.blockName.localeCompare(b.blockName, "pt-BR");
    });

    for (const blockGroup of floorGroup.blocks) {
      blockGroup.rooms.sort((a, b) => compareRoomNumbers(a.roomNumber, b.roomNumber));
    }
  }

  return ordered;
}

/** Numero de apartamento e' TEXT no banco: compara como numero quando os dois forem. */
function compareRoomNumbers(a: string, b: string) {
  const numberA = Number(a);
  const numberB = Number(b);

  if (Number.isFinite(numberA) && Number.isFinite(numberB) && numberA !== numberB) {
    return numberA - numberB;
  }

  return a.localeCompare(b, "pt-BR", { numeric: true });
}

// =========================================================================================
// ESTADO DO APARTAMENTO EM TRES DIMENSOES (plano docs/codex/70, migration 089)
//
// Um apartamento tem tres estados AO MESMO TEMPO, e nenhum substitui o outro. O enum
// `room_status` antigo achatava os tres num campo so' -- e por isso nao havia estado para a
// camareira dizer "terminei" sem, no mesmo gesto, liberar o apartamento para venda.
//
// REGRA DE OURO: nenhuma tela le estas colunas cruas para decidir cor, rotulo ou
// vendabilidade. Tudo passa por aqui.
// =========================================================================================

/** public.occupancy_status. Dono: a futura fatia de reservas. Escritor hoje: NINGUEM (D1). */
export const OCCUPANCY_STATUS_VALUES = ["vacant", "occupied"] as const;
export type OccupancyStatus = (typeof OCCUPANCY_STATUS_VALUES)[number];

/** public.housekeeping_status. O ciclo que a Governanca opera. */
export const HOUSEKEEPING_STATUS_VALUES = ["dirty", "cleaning", "clean", "inspected"] as const;
export type HousekeepingStatus = (typeof HOUSEKEEPING_STATUS_VALUES)[number];

/** public.blocking_status. `maintenance` e' chamado tecnico; `commercial` e' diretoria. */
export const BLOCKING_STATUS_VALUES = ["none", "maintenance", "commercial"] as const;
export type BlockingStatus = (typeof BLOCKING_STATUS_VALUES)[number];

export const ROOM_STATE_DIMENSIONS = ["occupancy", "housekeeping", "blocking"] as const;
export type RoomStateDimension = (typeof ROOM_STATE_DIMENSIONS)[number];

export type RoomState = {
  /** Situacao do CADASTRO. Vence as tres dimensoes operacionais -- ver describeRoomState. */
  record: RoomRecordStatus;
  occupancy: OccupancyStatus;
  housekeeping: HousekeepingStatus;
  blocking: BlockingStatus;
};

/**
 * Valores validos por dimensao. E' a MESMA tabela que o CHECK da migration 089 transcreve --
 * um `dimension` so' aceita os valores da sua propria dimensao. Sem isso, trocar o enum por
 * `text` em room_status_history teria trocado a seguranca do enum por nada.
 */
export const ROOM_STATE_DIMENSION_VALUES: {
  occupancy: readonly OccupancyStatus[];
  housekeeping: readonly HousekeepingStatus[];
  blocking: readonly BlockingStatus[];
} = {
  occupancy: OCCUPANCY_STATUS_VALUES,
  housekeeping: HOUSEKEEPING_STATUS_VALUES,
  blocking: BLOCKING_STATUS_VALUES
};

export function isRoomStateDimension(value: string): value is RoomStateDimension {
  return (ROOM_STATE_DIMENSIONS as readonly string[]).includes(value);
}

/** O valor pertence AQUELA dimensao? `dirty` e' housekeeping; nunca blocking. */
export function isValueOfDimension(dimension: RoomStateDimension, value: string): boolean {
  return (ROOM_STATE_DIMENSION_VALUES[dimension] as readonly string[]).includes(value);
}

// ------------------------------------------------------------------ rotulos e tons

/**
 * "Vistoriado", nao "Inspecionado" -- vocabulario do Wilson, e a regra 1 do
 * MODELO_UH_DESBRAVADOR ja' fixou que o que o usuario le vence o nome tecnico. No banco
 * continua `inspected`.
 */
export const housekeepingStatusLabelMap: Record<HousekeepingStatus, string> = {
  dirty: "Sujo",
  cleaning: "Em limpeza",
  clean: "Limpo",
  inspected: "Vistoriado"
};

export const blockingStatusLabelMap: Record<BlockingStatus, string> = {
  none: "Sem bloqueio",
  maintenance: "Manutenção",
  commercial: "Bloqueio comercial"
};

export const housekeepingStatusToneMap: Record<HousekeepingStatus, RoomStatusTone> = {
  dirty: "warning",
  cleaning: "warning",
  clean: "info",
  inspected: "success"
};

export const blockingStatusToneMap: Record<BlockingStatus, RoomStatusTone> = {
  none: "visual",
  maintenance: "danger",
  commercial: "danger"
};

export function housekeepingStatusLabel(value: HousekeepingStatus) {
  return housekeepingStatusLabelMap[value];
}

export function blockingStatusLabel(value: BlockingStatus) {
  return blockingStatusLabelMap[value];
}

// ------------------------------------------------------------------ vendabilidade

/**
 * A substituta honesta do que `available` fingia ser.
 *
 * Vendavel exige as TRES: vago, vistoriado e sem bloqueio. Um apartamento limpo mas nao
 * vistoriado NAO e' vendavel -- e' exatamente a fronteira `clean` -> `inspected` da matriz
 * do RH-35B, a razao de a Governanca existir como setor separado da camareira.
 */
export function isRoomSellable(state: RoomState): boolean {
  // `record === "active"` primeiro: um apartamento fora do inventario em uso nao e' vendavel
  // por mais vistoriado que esteja. Sem esta condicao, desativar o cadastro de um apartamento
  // que estava `inspected` o deixaria vendavel -- some da lista e continua a venda.
  return (
    state.record === "active" &&
    state.occupancy === "vacant" &&
    state.housekeeping === "inspected" &&
    state.blocking === "none"
  );
}

/**
 * O que a porta do mapa mostra: UM rotulo e UM tom vindos da COMBINACAO, nunca de um campo
 * unico.
 *
 * Precedencia -- bloqueio > ocupacao > limpeza. Nao e' estetica: bloqueio e ocupacao sao os
 * dois motivos pelos quais o apartamento NAO pode receber hospede agora, e precisam vencer o
 * estado de limpeza na leitura de relance. Um apartamento em manutencao que por acaso esta
 * `inspected` nao pode aparecer verde.
 */
export function describeRoomState(state: RoomState): { label: string; tone: RoomStatusTone; sellable: boolean } {
  const sellable = isRoomSellable(state);

  // Cadastro ACIMA de bloqueio. Um apartamento inativo nao esta "em manutencao", nem "sujo":
  // ele nao esta em operacao. Mostra-lo com a cor da fila de arrumacao poria na fila da
  // governanta um apartamento que ninguem deve arrumar.
  if (state.record !== "active") {
    return { label: roomRecordStatusLabelMap[state.record], tone: "visual", sellable };
  }

  if (state.blocking !== "none") {
    return { label: blockingStatusLabelMap[state.blocking], tone: blockingStatusToneMap[state.blocking], sellable };
  }

  if (state.occupancy === "occupied") {
    // Ocupado ainda precisa dizer em que pe' esta' a arrumacao: as 9h da manha a fila de
    // rotina e' justamente "ocupado + sujo", e era essa a informacao que o modelo antigo
    // perdia ao marcar o apartamento como `cleaning`.
    return {
      label: `Ocupado · ${housekeepingStatusLabelMap[state.housekeeping]}`,
      tone: "info",
      sellable
    };
  }

  return {
    label: housekeepingStatusLabelMap[state.housekeeping],
    tone: housekeepingStatusToneMap[state.housekeeping],
    sellable
  };
}

// ------------------------------------------------------------------ backfill

/**
 * O mapa do backfill da migration 089 (§5.3), como funcao pura.
 *
 * A migration TRANSCREVE esta tabela. O teste puro valida a tabela de referencia, NAO o SQL
 * aplicado -- a prova do SQL e' a contagem por dimensao do §8, na mao do revisor. Custo
 * declarado no plano, repetido aqui para ninguem confundir os dois.
 *
 * Duas escolhas nao obvias: `available` vira `inspected` (e' o que o valor significava na
 * pratica -- liberado para venda), e tudo que estava bloqueado ou inativo cai em `dirty`,
 * NUNCA em `inspected`. Ninguem volta a venda por migration: um apartamento que estava em
 * manutencao precisa de arrumacao e vistoria de gente, nao de um UPDATE.
 */
export type RoomOperationalState = Omit<RoomState, "record">;

/**
 * NAO devolve `record`: a situacao do cadastro vive em `public.rooms.status`, que a migration
 * 089 nao toca. Derivar um `record` aqui seria inventar -- um apartamento com cadastro
 * inativo continuaria inativo depois do backfill, e afirmar `active` mentiria sobre ele.
 */
export function backfillRoomState(legacyStatus: RoomStatus): RoomOperationalState {
  switch (legacyStatus) {
    case "available":
      return { occupancy: "vacant", housekeeping: "inspected", blocking: "none" };
    case "occupied":
      return { occupancy: "occupied", housekeeping: "dirty", blocking: "none" };
    case "dirty":
      return { occupancy: "vacant", housekeeping: "dirty", blocking: "none" };
    case "cleaning":
      return { occupancy: "vacant", housekeeping: "cleaning", blocking: "none" };
    case "maintenance":
      return { occupancy: "vacant", housekeeping: "dirty", blocking: "maintenance" };
    case "blocked":
      return { occupancy: "vacant", housekeeping: "dirty", blocking: "commercial" };
    case "inactive":
      return { occupancy: "vacant", housekeeping: "dirty", blocking: "none" };
  }
}

// ------------------------------------------------------------------ permissoes

/**
 * TODOS os codigos de permissao do modulo Apartamentos -- 088 (view, block, manage) e 089
 * (housekeeping, inspect). Fonte unica: `BASE_PERMISSIONS` em lib/auth/permissions.ts
 * REFERENCIA este objeto em vez de repetir as strings.
 *
 * `manage` entra aqui mesmo sem participar de transicao alguma. Um mapa de CODIGOS que
 * omitisse um codigo seria um subconjunto com nome de conjunto -- e a proxima pessoa que
 * precisasse de `rooms.manage` redeclararia a string em outro arquivo, que e' exatamente a
 * divergencia que centralizar aqui existe para impedir.
 */
export const ROOM_PERMISSIONS = {
  view: "BASE:rooms.view",
  block: "BASE:rooms.block",
  manage: "BASE:rooms.manage",
  housekeeping: "BASE:rooms.housekeeping",
  inspect: "BASE:rooms.inspect"
} as const;

export type RoomPermissionCode = (typeof ROOM_PERMISSIONS)[keyof typeof ROOM_PERMISSIONS];

/**
 * Os codigos cuja CONCESSAO esta declarada aqui. `manage` fica de fora de proposito: nenhum
 * perfil novo da 089 o recebe, e a matriz dele vive na 088. Codigo e concessao sao coisas
 * diferentes -- este tipo e' o que impede a matriz de virar "quase todos os codigos".
 */
export type GrantedRoomPermissionCode = Exclude<RoomPermissionCode, typeof ROOM_PERMISSIONS.manage>;

/**
 * A matriz da D5, transcrita da migration 089 -- mesma relacao que o backfill tem com o SQL.
 *
 * Existe para o teste §7.7 poder afirmar a allowlist FECHADA: so' estes perfis recebem
 * `rooms.inspect`, e qualquer perfil fora da lista e' negado. Substitui o teste antigo
 * ("OPERACIONAL_GOVERNANCA recebe 403"), que passava trivialmente por o perfil nao existir e
 * continuaria passando com a permissao concedida a quem nao devia.
 *
 * NAO e' consultado em runtime -- a autorizacao real vem do resolver de permissao por CODIGO,
 * que le o banco. E' referencia versionada do que a migration concede, para o teste ter contra
 * o que comparar.
 */
export const ROOM_PERMISSION_PROFILE_GRANTS: Record<GrantedRoomPermissionCode, readonly string[]> = {
  "BASE:rooms.view": [
    "SUPER_ADMIN",
    "NETWORK_MANAGER",
    "UNIT_DIRECTOR",
    "DEPARTMENT_MANAGER",
    "SUPERVISOR",
    "AUDIT",
    "LIDER_GOVERNANCA",
    "LIDER_MANUTENCAO"
  ],
  // DEPARTMENT_MANAGER e SUPERVISOR SAIRAM (089, item 10.1). Na 088 bloquear era cosmetico;
  // agora desbloquear derruba a UH para `dirty`, exige observacao e grava historico -- acao
  // operacional que a D5 tirou dos perfis genericos.
  "BASE:rooms.block": ["SUPER_ADMIN", "UNIT_DIRECTOR", "LIDER_GOVERNANCA", "LIDER_MANUTENCAO"],
  "BASE:rooms.housekeeping": ["SUPER_ADMIN", "UNIT_DIRECTOR", "LIDER_GOVERNANCA"],
  "BASE:rooms.inspect": ["SUPER_ADMIN", "UNIT_DIRECTOR", "LIDER_GOVERNANCA"]
};

// ------------------------------------------------------------------ transicoes

export type RoomTransitionDenialCode =
  | "forbidden"
  | "invalid_dimension_value"
  | "invalid_transition"
  | "no_writer"
  | "reason_required";

export type RoomTransitionResult =
  | { allowed: true; effects: Partial<RoomState>; requiresReason: boolean }
  | { allowed: false; code: RoomTransitionDenialCode; message: string };

type TransitionRule = {
  from: string;
  to: string;
  permission: RoomPermissionCode;
  /** Observacao obrigatoria: sem texto, a transicao nao grava. */
  requiresReason?: boolean;
  /** Efeito colateral em OUTRA dimensao, aplicado na mesma transacao. */
  effects?: Partial<RoomState>;
};

/**
 * A matriz de transicao da D3, fechada por construcao: o que nao esta aqui e' negado.
 *
 * Allowlist, nao denylist. Uma denylist deixaria `dirty -> inspected` passar por
 * esquecimento, e vistoriar um apartamento que ninguem arrumou e' precisamente o furo que
 * esta fatia existe para fechar.
 */
const HOUSEKEEPING_RULES: readonly TransitionRule[] = [
  { from: "dirty", to: "cleaning", permission: ROOM_PERMISSIONS.housekeeping },
  { from: "cleaning", to: "clean", permission: ROOM_PERMISSIONS.housekeeping },
  { from: "clean", to: "inspected", permission: ROOM_PERMISSIONS.inspect },
  // Atalho da §4.1: `clean` e' disponivel, nao obrigatorio. Se a governanta tivesse que
  // marcar "Limpo" em quarenta apartamentos e depois "Vistoriado" nos mesmos quarenta, ela
  // pularia o primeiro -- e o estado viraria ritual vazio.
  { from: "cleaning", to: "inspected", permission: ROOM_PERMISSIONS.inspect },
  // Reprovar na vistoria. Volta para o inicio da fila, nao para "limpo".
  { from: "inspected", to: "dirty", permission: ROOM_PERMISSIONS.inspect },
  // DESFAZER. Clique errado em 115 apartamentos por dia nao e' hipotese, e sem estas duas
  // linhas o unico jeito de corrigir um "Limpo" lancado por engano era passar por
  // `inspected` -- ou seja, liberar o apartamento para venda para poder consertar o erro.
  // Voltam para `dirty`, nunca para `cleaning`: reabrir uma limpeza que nao aconteceu seria
  // inventar um fato. Exigem `rooms.housekeeping`, a mesma permissao que registrou o estado.
  { from: "cleaning", to: "dirty", permission: ROOM_PERMISSIONS.housekeeping },
  { from: "clean", to: "dirty", permission: ROOM_PERMISSIONS.housekeeping }
];

const BLOCKING_RULES: readonly TransitionRule[] = [
  // ENTRAR em manutencao nao exige observacao: o motivo vem do chamado tecnico, e pedir de
  // novo aqui seria transcrever o que ja esta registrado em outro lugar.
  { from: "none", to: "maintenance", permission: ROOM_PERMISSIONS.block },
  // ENTRAR em bloqueio comercial exige. Tirar um apartamento de venda por decisao propria e'
  // perda de receita, e perda de receita sem motivo registrado nao tem a quem perguntar
  // depois. Diferente da manutencao, aqui nao existe chamado por tras.
  { from: "none", to: "commercial", permission: ROOM_PERMISSIONS.block, requiresReason: true },
  // §4.2: SAIR de bloqueio -- de qualquer tipo -- exige observacao e derruba a UH para
  // `dirty`, nunca para `inspected`.
  //
  // O criterio nao e' "passou por obra", e' "alguem entrou no apartamento": manutencao entra
  // com furadeira e peca trocada; reforma, uso interno e cortesia tambem sao gente dentro do
  // quarto. Nos dois casos a UH volta para a fila de arrumacao, e quem a devolve a venda
  // continua sendo so' quem tem `rooms.inspect`.
  {
    from: "maintenance",
    to: "none",
    permission: ROOM_PERMISSIONS.block,
    requiresReason: true,
    effects: { housekeeping: "dirty" }
  },
  {
    from: "commercial",
    to: "none",
    permission: ROOM_PERMISSIONS.block,
    requiresReason: true,
    effects: { housekeeping: "dirty" }
  }
];

function rulesFor(dimension: RoomStateDimension): readonly TransitionRule[] {
  if (dimension === "housekeeping") {
    return HOUSEKEEPING_RULES;
  }

  if (dimension === "blocking") {
    return BLOCKING_RULES;
  }

  // Ocupacao entra sem escritor (D1), de proposito. A coluna existe para que ninguem enfie
  // "esta ocupado" dentro de housekeeping_status; quem a escreve e' a futura fatia de
  // reservas. Ate' la', toda transicao de ocupacao e' negada AQUI -- e nao apenas por
  // ausencia de tela, que seria uma trava que a primeira chamada direta a rota contorna.
  return [];
}

/**
 * Decide UMA transicao. A rota apenas chama -- nao ha regra de transicao vivendo na rota.
 *
 * Pura de proposito (§6.1): `test:unit` roda num runner sem banco e sem browser, entao a
 * matriz de permissao so' e' testavel de verdade se a decisao nao depender de I/O.
 *
 * `permissions` sao os CODIGOS que o ator possui, ja' resolvidos pelo gate da rota.
 */
export function canTransition(
  permissions: readonly string[],
  dimension: RoomStateDimension,
  from: string,
  to: string,
  reason?: string | null
): RoomTransitionResult {
  if (!isValueOfDimension(dimension, from) || !isValueOfDimension(dimension, to)) {
    return {
      allowed: false,
      code: "invalid_dimension_value",
      message: `Valor invalido para a dimensao ${dimension}.`
    };
  }

  if (dimension === "occupancy") {
    return {
      allowed: false,
      code: "no_writer",
      message: "A ocupacao do apartamento ainda nao e' operada pelo sistema."
    };
  }

  const rule = rulesFor(dimension).find((candidate) => candidate.from === from && candidate.to === to);

  if (!rule) {
    return {
      allowed: false,
      code: "invalid_transition",
      message: `Transicao de ${from} para ${to} nao e' permitida.`
    };
  }

  // Permissao ANTES de observacao: quem nao pode fazer a transicao nao deve descobrir, pela
  // mensagem de erro, que faltava so' preencher um campo.
  if (!permissions.includes(rule.permission)) {
    return {
      allowed: false,
      code: "forbidden",
      message: "Voce nao tem permissao para esta transicao."
    };
  }

  if (rule.requiresReason && !(reason ?? "").trim()) {
    return {
      allowed: false,
      code: "reason_required",
      message: "Informe a observacao do bloqueio."
    };
  }

  return {
    allowed: true,
    effects: { [dimension]: to, ...(rule.effects ?? {}) } as Partial<RoomState>,
    requiresReason: Boolean(rule.requiresReason)
  };
}

/** Aplica os efeitos de uma transicao permitida sobre o estado atual. */
export function applyRoomTransition(state: RoomState, effects: Partial<RoomState>): RoomState {
  return { ...state, ...effects };
}
