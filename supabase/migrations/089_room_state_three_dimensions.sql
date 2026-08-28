-- ============================================================================
-- 089 — Estado do apartamento em TRES DIMENSOES (plano docs/codex/70)
--
-- NAO APLICADA PELO CODEX. O Wilson aplica nos DOIS bancos (staging e producao).
--
-- O que esta migration faz, em uma frase: substitui o enum `room_status` -- uma
-- dimensao fazendo o trabalho de tres -- por ocupacao, limpeza e bloqueio como
-- colunas independentes, para que exista um estado onde a camareira possa dizer
-- "terminei" sem, no mesmo gesto, liberar o apartamento para venda.
--
-- ADITIVA e IDEMPOTENTE. Nao ha `drop` de coluna, de tipo nem de tabela.
-- `room_status` NAO e' alterado nem removido (D2): para de ser escrito pelo app e
-- sai numa migration posterior, depois de confirmado em producao.
--
-- PREMISSA DATADA, verificada pelo Wilson em 28/08/2026: `room_status_history`
-- tem ZERO linhas em staging e em producao. E' o que torna o `alter type` do
-- passo 5 gratuito e sem `using`. QUEM REAPLICAR ISTO DEPOIS: reconfira antes --
--     select count(*) from public.room_status_history;
-- se voltar diferente de zero, PARE: o alter type precisa de `using` explicito e
-- o mapeamento de valores antigos precisa ser decidido, nao improvisado.
--
-- RLS: conferido. As tres policies de room_status_history
-- (066:366-388) filtram por `unit_id` via user_has_unit_access e nenhuma delas
-- referencia as colunas de status. Trocar o tipo nao toca politica. Esta migration
-- NAO cria, altera nem remove policy alguma.
-- ============================================================================


-- ============================================================================
-- 1) Os tres enums
--
-- Mesmo padrao defensivo da 001: `if not exists (select 1 from pg_type ...)`,
-- que torna a migration reexecutavel sem erro de tipo duplicado.
-- ============================================================================

do $$
begin
  -- Ocupacao. Dono: a futura fatia de reservas. Escritor hoje: NINGUEM (D1).
  if not exists (select 1 from pg_type where typname = 'occupancy_status') then
    create type public.occupancy_status as enum ('vacant', 'occupied');
  end if;

  -- Limpeza. O ciclo que a Governanca opera. `clean` e `inspected` sao estados
  -- DISTINTOS de proposito: a fronteira entre eles e' a linha da matriz do RH-35B
  -- ("registrar limpeza" x "validar conclusao") e a razao de a Governanca existir
  -- como setor separado da camareira.
  if not exists (select 1 from pg_type where typname = 'housekeeping_status') then
    create type public.housekeeping_status as enum ('dirty', 'cleaning', 'clean', 'inspected');
  end if;

  -- Bloqueio. `maintenance` e' chamado tecnico; `commercial` e' decisao de
  -- diretoria (reforma, uso interno, cortesia). Separados porque quem levanta
  -- cada um e' setor diferente.
  if not exists (select 1 from pg_type where typname = 'blocking_status') then
    create type public.blocking_status as enum ('none', 'maintenance', 'commercial');
  end if;
end
$$;


-- ============================================================================
-- 2) As tres colunas em public.rooms
--
-- Todas `not null` com default: a aplicacao nunca trata nulo nestas colunas. O
-- default cobre a janela entre o `add column` e o backfill do passo 3, e cobre
-- qualquer apartamento inserido depois.
--
-- O default de housekeeping e' 'dirty', nao 'inspected': um apartamento novo no
-- inventario nao foi vistoriado por ninguem. O default nunca deve ser o estado
-- que libera para venda.
-- ============================================================================

alter table public.rooms
  add column if not exists occupancy_status public.occupancy_status not null default 'vacant',
  add column if not exists housekeeping_status public.housekeeping_status not null default 'dirty',
  add column if not exists blocking_status public.blocking_status not null default 'none';

comment on column public.rooms.occupancy_status is
  'Ocupacao da UH. PROPRIEDADE DA FUTURA FATIA DE RESERVAS: sem escritor e sem UI nesta release (plano 70, D1). Existe agora para impedir que "esta ocupado" seja enfiado em housekeeping_status, refazendo a conflacao que a 089 removeu.';

comment on column public.rooms.housekeeping_status is
  'Ciclo de limpeza operado pela Governanca: dirty -> cleaning -> clean -> inspected. Apenas `inspected` libera para venda, e so quem tem BASE:rooms.inspect chega nele.';

comment on column public.rooms.blocking_status is
  'Bloqueio da UH. `maintenance` = chamado tecnico; `commercial` = diretoria. Bloqueado sai da venda, nao sai do inventario (MODELO_UH_DESBRAVADOR, regra 4).';


-- ============================================================================
-- 3) BACKFILL a partir do room_status atual
--
-- Transcricao literal de `backfillRoomState()` em rooms-utils.ts (§5.3 / §6.1 do
-- plano 70). As duas tabelas precisam continuar identicas; o teste unitario valida
-- a tabela TypeScript, nao este SQL -- a prova deste SQL e' a contagem por dimensao
-- da secao VALIDACAO, no fim do arquivo.
--
-- Duas escolhas que NAO sao obvias e por isso ficam escritas:
--
--   `available` -> `inspected`. E' o que o valor significava na pratica: liberado
--   para venda. Qualquer outro destino inventaria uma fila de arrumacao que nao
--   existe.
--
--   `maintenance`, `blocked` e `inactive` -> `dirty`, NUNCA `inspected`. NINGUEM
--   VOLTA A VENDA POR MIGRATION. Um apartamento que estava em manutencao precisa
--   de arrumacao e vistoria de gente antes de receber hospede -- nao de um UPDATE.
--
-- O `where` torna o passo idempotente e, mais importante, impede que uma reexecucao
-- ATROPELE trabalho ja feito na tela: so' toca linhas que ainda estao no default
-- intocado. Sem ele, reaplicar a migration devolveria ao estado do room_status
-- antigo apartamentos que a governanta ja' vistoriou.
-- ============================================================================

update public.rooms
set
  occupancy_status = case room_status
    when 'occupied' then 'occupied'::public.occupancy_status
    else 'vacant'::public.occupancy_status
  end,
  housekeeping_status = case room_status
    when 'available' then 'inspected'::public.housekeeping_status
    when 'cleaning'  then 'cleaning'::public.housekeeping_status
    else 'dirty'::public.housekeeping_status
  end,
  blocking_status = case room_status
    when 'maintenance' then 'maintenance'::public.blocking_status
    when 'blocked'     then 'commercial'::public.blocking_status
    else 'none'::public.blocking_status
  end,
  updated_at = now()
where occupancy_status = 'vacant'
  and housekeeping_status = 'dirty'
  and blocking_status = 'none';


-- ============================================================================
-- 4) Indices dos dois filtros reais
--
-- A fila de arrumacao ("o que esta sujo nesta unidade") e o painel de manutencao
-- ("o que esta bloqueado nesta unidade"). Sempre por unidade -- nenhuma tela
-- consulta o parque inteiro.
-- ============================================================================

create index if not exists rooms_unit_housekeeping_status_idx
  on public.rooms (unit_id, housekeeping_status);

create index if not exists rooms_unit_blocking_status_idx
  on public.rooms (unit_id, blocking_status);


-- ============================================================================
-- 5) room_status_history passa a registrar UMA LINHA POR DIMENSAO
--
-- `previous_status` e `new_status` deixam de ser `public.room_status` e viram
-- `text`, porque agora carregam valores de TRES enums diferentes. A seguranca que
-- o enum dava nao e' descartada: volta como CHECK amarrando cada `dimension` aos
-- valores validos daquela dimensao -- senao teriamos trocado o enum por um campo
-- de texto livre, que e' pior que o problema original.
--
-- `alter type ... using` NAO e' necessario: a tabela tem zero linhas (premissa
-- datada no cabecalho). O cast de enum para text e' de qualquer forma trivial; o
-- `using` explicito fica registrado abaixo, comentado, para quem reaplicar num
-- banco com dados.
-- ============================================================================

alter table public.room_status_history
  alter column previous_status type text using previous_status::text,
  alter column new_status type text using new_status::text;

alter table public.room_status_history
  add column if not exists dimension text;

-- Backfill de `dimension` para linhas preexistentes. Zero linhas hoje; existe para
-- a migration ser correta tambem num banco onde a premissa nao valha mais.
update public.room_status_history
set dimension = 'housekeeping'
where dimension is null;

alter table public.room_status_history
  alter column dimension set not null;

-- Um `dimension` so' aceita os valores da SUA dimensao. `dirty` e' housekeeping e
-- nunca blocking; `none` e' blocking e nunca housekeeping. `previous_status` e'
-- nullable (primeira transicao registrada de um apartamento nao tem origem).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'room_status_history_dimension_values_check'
  ) then
    alter table public.room_status_history
      add constraint room_status_history_dimension_values_check check (
        (
          dimension = 'occupancy'
          and (previous_status is null or previous_status in ('vacant', 'occupied'))
          and new_status in ('vacant', 'occupied')
        )
        or (
          dimension = 'housekeeping'
          and (previous_status is null or previous_status in ('dirty', 'cleaning', 'clean', 'inspected'))
          and new_status in ('dirty', 'cleaning', 'clean', 'inspected')
        )
        or (
          dimension = 'blocking'
          and (previous_status is null or previous_status in ('none', 'maintenance', 'commercial'))
          and new_status in ('none', 'maintenance', 'commercial')
        )
      );
  end if;
end
$$;

comment on column public.room_status_history.dimension is
  'Qual das tres dimensoes esta linha registra: occupancy | housekeeping | blocking. Uma linha por transicao de dimensao.';


-- ============================================================================
-- 6) Observacao obrigatoria no encerramento de bloqueio (§4.2)
--
-- A regra vive nos DOIS lugares de proposito: a rota valida (mensagem util para o
-- usuario) e o banco garante (a rota nao e' o unico caminho ate a tabela). A coluna
-- `reason` ja existe desde a 011 -- nao se cria coluna nova.
--
-- Escopo do CHECK: exige texto na saida de QUALQUER bloqueio (`maintenance` ou
-- `commercial`) para `none`. O criterio nao e' "passou por obra", e' "alguem entrou
-- no apartamento" -- reforma, uso interno e cortesia tambem sao gente dentro do
-- quarto. BLOQUEAR nao exige observacao; so' desbloquear.
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'room_status_history_unblock_reason_check'
  ) then
    alter table public.room_status_history
      add constraint room_status_history_unblock_reason_check check (
        not (dimension = 'blocking' and previous_status in ('maintenance', 'commercial') and new_status = 'none')
        or btrim(coalesce(reason, '')) <> ''
      );
  end if;
end
$$;


-- ============================================================================
-- 7) housekeeping_employee_id — o gancho do plano 72
--
-- Nullable, e SO em room_status_history: a pergunta e' historica ("quem arrumou o
-- 305 no dia 12"), e uma coluna em `rooms` seria sobrescrita no dia seguinte,
-- respondendo apenas "quem arrumou por ultimo".
--
-- Fica NULO ate o plano 72 (escala de arrumacao e folha impressa) existir. Campo
-- orfao consciente, com dono declarado -- diferente do overbooking_limit, que nao
-- tinha nenhum dos dois.
-- ============================================================================

alter table public.room_status_history
  add column if not exists housekeeping_employee_id uuid
    references public.employees(id) on delete set null;

comment on column public.room_status_history.housekeeping_employee_id is
  'Camareira responsavel pela arrumacao, derivada da escala do dia. NULO ate o plano 72 (escala + folha impressa); nenhum escritor nesta release.';

create index if not exists room_status_history_housekeeping_employee_id_idx
  on public.room_status_history (housekeeping_employee_id);


-- ============================================================================
-- 8) Dois perfis novos (D5)
--
-- `LIDER_GOVERNANCA` e `LIDER_MANUTENCAO` nao existiam: eram matriz de projeto no
-- RH-35B, nunca semeados.
--
-- Por que perfil novo em vez de reaproveitar um existente -- o motivo NAO e' o
-- vazamento lateral (o gerente de Compras enxergar apartamentos ja acontece desde a
-- 088). E' o inverso: para RECEBER `rooms.inspect`, a governanta teria que SER
-- DEPARTMENT_MANAGER (e ganharia PURCHASES:approvals.decide.administrative --
-- alcada de compra ate R$200 -- alem de BASE:rooms.manage) ou SUPERVISOR (e ganharia
-- HR:documents.manage, HR:documents.verify e HR:employees.view). Alcada financeira e
-- documento de colaborador para quem so precisa dizer que o apartamento esta limpo.
--
-- `is_system_default = true`, como todos os perfis da 010: sao definicao do sistema,
-- nao configuracao do cliente.
-- ============================================================================

insert into public.access_profiles (code, name, description, is_system_default)
values
  ('LIDER_GOVERNANCA', 'Líder de Governança', 'Lideranca de Governanca: opera o ciclo de limpeza e valida a vistoria da UH.', true),
  ('LIDER_MANUTENCAO', 'Líder de Manutenção', 'Lideranca de Manutencao: bloqueia e desbloqueia UH para chamado tecnico.', true)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  is_system_default = excluded.is_system_default,
  status = 'active',
  deleted_at = null,
  deleted_by = null,
  updated_at = now();


-- ============================================================================
-- 9) Os dois codigos de permissao novos
--
-- Formato conferido contra public.permissions (003:91-108): `code` e' GERADO
-- (module_code || ':' || action_code). `action_code ~ '^[a-z0-9_.-]{2,60}$'` --
-- 'rooms.housekeeping' e 'rooms.inspect' passam.
--
-- `on conflict (code) do update`, como a 088: o catalogo de permissoes e' definicao
-- do sistema, e reaplicar corrige nome/descricao e reativa.
-- ============================================================================

insert into public.permissions (module_code, action_code, name, description)
values
  ('BASE', 'rooms.housekeeping', 'Registrar limpeza de apartamentos', 'Permite registrar o andamento da arrumacao da UH (sujo, em limpeza, limpo). NAO libera a UH para venda.'),
  ('BASE', 'rooms.inspect',      'Vistoriar apartamentos',            'Permite validar a vistoria da UH e libera-la para venda, e reprovar UH ja vistoriada.')
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  status = 'active',
  deleted_at = null,
  deleted_by = null,
  updated_at = now();


-- ============================================================================
-- 10) Concessao aos perfis (matriz da D5)
--
-- Conjunto MINIMO de proposito. Nem LIDER_GOVERNANCA nem LIDER_MANUTENCAO recebem
-- `rooms.manage`: quem opera o mapa nao redefine o inventario -- criterio que a 088
-- ja fixou ao negar `manage` ao SUPERVISOR. Nenhum dos dois recebe nada de Compras
-- ou de RH.
--
-- SUPERVISOR e DEPARTMENT_MANAGER NAO recebem housekeeping nem inspect: a fronteira
-- `clean` -> `inspected` e' o que esta fatia existe para proteger, e alarga-la para
-- perfis genericos desfaria a decisao D5 em silencio. O teste §7.7 (allowlist
-- fechada) quebra se alguem acrescentar um deles aqui sem atualizar
-- ROOM_PERMISSION_PROFILE_GRANTS em rooms-utils.ts.
--
-- `on conflict do nothing`, como a 088: se alguem REVOGOU deliberadamente uma
-- concessao, reexecutar esta migration nao a restaura em silencio.
-- ============================================================================

with profile_permission_matrix(profile_code, permission_code) as (
  values
    -- Governanca: ve, bloqueia, registra limpeza e vistoria.
    ('LIDER_GOVERNANCA', 'BASE:rooms.view'),
    ('LIDER_GOVERNANCA', 'BASE:rooms.block'),
    ('LIDER_GOVERNANCA', 'BASE:rooms.housekeeping'),
    ('LIDER_GOVERNANCA', 'BASE:rooms.inspect'),

    -- Manutencao: ve e bloqueia. NAO vistoria -- encerrar o proprio bloqueio deixa a
    -- UH em `dirty`, e quem a devolve a venda e' a governanca.
    ('LIDER_MANUTENCAO', 'BASE:rooms.view'),
    ('LIDER_MANUTENCAO', 'BASE:rooms.block'),

    -- Os dois codigos novos para quem ja tinha o equivalente de escrita na 088.
    ('SUPER_ADMIN',   'BASE:rooms.housekeeping'),
    ('SUPER_ADMIN',   'BASE:rooms.inspect'),
    ('UNIT_DIRECTOR', 'BASE:rooms.housekeeping'),
    ('UNIT_DIRECTOR', 'BASE:rooms.inspect')
)
insert into public.profile_permissions (access_profile_id, permission_id, is_allowed, status)
select
  access_profile.id,
  permission.id,
  true,
  'active'
from profile_permission_matrix matrix
join public.access_profiles access_profile
  on access_profile.code = matrix.profile_code
 and access_profile.status = 'active'
 and access_profile.deleted_at is null
join public.permissions permission
  on permission.code = matrix.permission_code
 and permission.status = 'active'
 and permission.deleted_at is null
on conflict (access_profile_id, permission_id) do nothing;


-- ============================================================================
-- 11) room_status: NAO alterado, NAO removido (D2)
--
-- Continua no banco por uma release, intacto, como rede de seguranca: se algo der
-- errado em staging, o dado original esta la. O app para de ESCREVER nele nesta
-- fatia. A lista (rooms-client.tsx) ainda o LE -- ela sai na fatia da tela (plano
-- 71), e so depois disso a coluna pode ser removida.
--
-- Consequencia de brinde quando ele sair: public.rooms tem hoje DUAS colunas de
-- situacao (`status`/record_status e `room_status`, com `inactive` nas duas).
-- Encerrar o room_status deixa "apartamento desativado" como assunto exclusivo de
-- `status`.
-- ============================================================================


-- ============================================================================
-- 12) RPC transacional da transicao em lote
--
-- POR QUE existe: supabase-js nao abre transacao. Sem RPC, um lote de quarenta
-- apartamentos seria quarenta updates sequenciais com rollback manual -- e rollback
-- manual nao cobre queda de processo (timeout, OOM, deploy). Um lote parcialmente
-- aplicado deixa a governanta sem saber o que gravou, que e' exatamente o estado
-- que faz alguem voltar para o papel. Mesmo padrao das RPCs de Compras (079/081/083):
-- a RPC e' um ENVELOPE TRANSACIONAL -- toda a REGRA (canTransition) permanece na
-- aplicacao, em rooms-utils.ts, e chega aqui ja decidida.
--
-- O QUE ela garante, e a aplicacao nao consegue garantir sozinha:
--
--   a) Atomicidade: ou todos os apartamentos do lote mudam e todas as linhas de
--      historico sao gravadas, ou nenhum.
--
--   b) `for update`: serializa lotes concorrentes sobre os mesmos apartamentos.
--
--   c) Releitura da origem DENTRO do lock. A rota le o estado, decide, e chama --
--      entre a leitura e a escrita cabe outra governanta. Aqui o estado atual e'
--      conferido contra o `from` que a rota viu, e diverg encia ABORTA o lote inteiro
--      com ROOMS_TRANSITION_STALE. Sem isto, duas vistorias simultaneas poderiam
--      gravar um historico que nunca aconteceu.
--
-- `p_transitions`: [{"room_id": uuid, "from": text, "to": text,
--                    "housekeeping_effect": text|null}, ...]
-- O `housekeeping_effect` e' o efeito colateral da §4.2 (encerrar manutencao derruba
-- a UH para `dirty`), calculado por canTransition e transcrito aqui -- a RPC nao
-- reimplementa a regra, so' a aplica.
--
-- Ator: created_by/updated_by = p_actor_id, como as demais rotas fazem. NAO setamos
-- o GUC app.current_user_id -- a auditoria generica (write_audit_trail, 008) o le e
-- ninguem no app o seta hoje; corrigir isso e' assunto proprio, fora desta fatia.
--
-- Idempotente: create or replace.
-- ============================================================================

create or replace function public.rooms_apply_transition(
  p_transitions jsonb,
  p_dimension text,
  p_reason text default null,
  p_actor_id uuid default null
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_room_id uuid;
  v_from text;
  v_to text;
  v_effect text;
  v_current text;
  v_count integer := 0;
begin
  if p_dimension is null or p_dimension not in ('occupancy', 'housekeeping', 'blocking') then
    raise exception 'ROOMS_TRANSITION_INVALID_DIMENSION' using errcode = '22023';
  end if;

  -- Ocupacao nao tem escritor nesta release (plano 70, D1). A trava vive na
  -- aplicacao E aqui: uma chamada direta a RPC nao deve contornar a decisao.
  if p_dimension = 'occupancy' then
    raise exception 'ROOMS_TRANSITION_NO_WRITER' using errcode = '22023';
  end if;

  if p_transitions is null or jsonb_typeof(p_transitions) <> 'array' or jsonb_array_length(p_transitions) = 0 then
    raise exception 'ROOMS_TRANSITION_EMPTY_BATCH' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(p_transitions)
  loop
    v_room_id := (v_item ->> 'room_id')::uuid;
    v_from    := v_item ->> 'from';
    v_to      := v_item ->> 'to';
    v_effect  := v_item ->> 'housekeeping_effect';

    -- Lock + releitura da origem. `deleted_at is null`: apartamento excluido nao
    -- transita, e um lote que o inclua falha inteiro em vez de ignora-lo em silencio.
    select
      case p_dimension
        when 'housekeeping' then housekeeping_status::text
        when 'blocking'     then blocking_status::text
      end
    into v_current
    from public.rooms
    where id = v_room_id and deleted_at is null
    for update;

    if v_current is null then
      raise exception 'ROOMS_TRANSITION_ROOM_NOT_FOUND' using errcode = '22023';
    end if;

    if v_current is distinct from v_from then
      raise exception 'ROOMS_TRANSITION_STALE' using errcode = '40001';
    end if;

    if p_dimension = 'housekeeping' then
      update public.rooms
      set housekeeping_status = v_to::public.housekeeping_status,
          updated_at = now(),
          updated_by = p_actor_id
      where id = v_room_id;
    else
      update public.rooms
      set blocking_status = v_to::public.blocking_status,
          -- Efeito colateral da §4.2, quando houver: encerrar bloqueio -- de qualquer
          -- tipo -- derruba a UH para `dirty`. NUNCA para `inspected`: alguem entrou no
          -- apartamento, e a liberacao para venda continua exclusiva da governanca.
          housekeeping_status = coalesce(v_effect::public.housekeeping_status, housekeeping_status),
          updated_at = now(),
          updated_by = p_actor_id
      where id = v_room_id;
    end if;

    -- Uma linha por transicao de dimensao. A linha do efeito colateral e' gravada
    -- SEPARADAMENTE abaixo: sao dois fatos distintos, e achatar os dois numa linha
    -- so' e' a mesma conflacao que esta migration existe para desfazer.
    insert into public.room_status_history
      (unit_id, room_id, dimension, previous_status, new_status, reason, changed_by, created_by, updated_by, source_module)
    select unit_id, id, p_dimension, v_from, v_to, p_reason, p_actor_id, p_actor_id, p_actor_id, 'BASE'
    from public.rooms
    where id = v_room_id;

    if v_effect is not null and v_effect is distinct from v_current then
      insert into public.room_status_history
        (unit_id, room_id, dimension, previous_status, new_status, reason, changed_by, created_by, updated_by, source_module, is_automatic)
      select unit_id, id, 'housekeeping', null, v_effect, p_reason, p_actor_id, p_actor_id, p_actor_id, 'BASE', true
      from public.rooms
      where id = v_room_id;
    end if;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

comment on function public.rooms_apply_transition(jsonb, text, text, uuid) is
  'Envelope TRANSACIONAL da transicao de estado de UH em lote (plano 70, §6.2). A regra vive em rooms-utils.ts (canTransition) e chega decidida; aqui garantem-se atomicidade, lock e releitura da origem sob lock.';


-- ============================================================================
-- VALIDACAO (rodar APOS aplicar, staging antes de producao)
--
-- Atencao: o SQL Editor mostra "Success. No rows returned" tanto para DDL quanto
-- para DML sem RETURNING. Os dois casos sao visualmente identicos -- "deu certo"
-- na tela nao e' prova de que o backfill escreveu alguma coisa. As consultas
-- abaixo sao a prova.
-- ============================================================================
--
-- 1) A PROVA DO BACKFILL: contagem por dimensao batendo com o room_status antigo.
--    Toda linha deve ter divergencia = 0. Qualquer linha diferente de zero
--    significa backfill errado -- NAO prossiga para producao.
--
--    select
--      room_status,
--      count(*) as total,
--      count(*) filter (
--        where (occupancy_status::text, housekeeping_status::text, blocking_status::text) is distinct from (
--          case room_status when 'occupied' then 'occupied' else 'vacant' end,
--          case room_status when 'available' then 'inspected'
--                           when 'cleaning'  then 'cleaning'
--                           else 'dirty' end,
--          case room_status when 'maintenance' then 'maintenance'
--                           when 'blocked'     then 'commercial'
--                           else 'none' end
--        )
--      ) as divergencia
--    from public.rooms
--    where deleted_at is null
--    group by room_status
--    order by room_status;
--
-- 2) Nenhum apartamento voltou a venda por migration. Deve bater EXATAMENTE com a
--    contagem de room_status = 'available':
--
--    select count(*) as vendaveis
--    from public.rooms
--    where deleted_at is null
--      and occupancy_status = 'vacant'
--      and housekeeping_status = 'inspected'
--      and blocking_status = 'none';
--
--    select count(*) as available_antigo
--    from public.rooms
--    where deleted_at is null and room_status = 'available';
--
-- 3) Os dois perfis existem e estao ativos (deve voltar 2 linhas):
--
--    select code, name, status from public.access_profiles
--    where code in ('LIDER_GOVERNANCA', 'LIDER_MANUTENCAO');
--
-- 4) A matriz concedida, EXATAMENTE como a D5 -- nem uma a mais:
--
--    select ap.code as perfil, p.code as permissao
--    from public.profile_permissions pp
--    join public.access_profiles ap on ap.id = pp.access_profile_id
--    join public.permissions p      on p.id  = pp.permission_id
--    where p.module_code = 'BASE' and p.action_code like 'rooms.%'
--      and pp.deleted_at is null and pp.status = 'active'
--    order by p.code, ap.code;
--
--    -- esperado para os codigos NOVOS (3 perfis cada, e SO estes):
--    --   BASE:rooms.housekeeping -> LIDER_GOVERNANCA, SUPER_ADMIN, UNIT_DIRECTOR
--    --   BASE:rooms.inspect      -> LIDER_GOVERNANCA, SUPER_ADMIN, UNIT_DIRECTOR
--    -- Se SUPERVISOR ou DEPARTMENT_MANAGER aparecer em `inspect`, a decisao D5 foi
--    -- desfeita -- e' o cenario que o teste §7.7 protege no codigo.
--
-- 5) Nenhum perfil da matriz foi descartado por nao existir (deve voltar VAZIO --
--    e' o teste de dead grant que a 088 ja usava):
--
--    with esperado(profile_code) as (
--      values ('LIDER_GOVERNANCA'), ('LIDER_MANUTENCAO'), ('SUPER_ADMIN'), ('UNIT_DIRECTOR')
--    )
--    select e.profile_code
--    from esperado e
--    left join public.access_profiles ap
--      on ap.code = e.profile_code and ap.status = 'active' and ap.deleted_at is null
--    where ap.id is null;
--
-- 6) Os CHECKs de historico estao valendo (as duas devem FALHAR; rodar em staging,
--    dentro de uma transacao com rollback, e nunca em producao):
--
--    -- valor de outra dimensao:
--    -- begin;
--    --   insert into public.room_status_history (unit_id, room_id, dimension, new_status)
--    --   select unit_id, id, 'blocking', 'dirty' from public.rooms limit 1;
--    -- rollback;   -- esperado: room_status_history_dimension_values_check
--
--    -- encerrar bloqueio sem observacao (vale para maintenance E commercial):
--    -- begin;
--    --   insert into public.room_status_history (unit_id, room_id, dimension, previous_status, new_status)
--    --   select unit_id, id, 'blocking', 'maintenance', 'none' from public.rooms limit 1;
--    -- rollback;   -- esperado: room_status_history_maintenance_exit_reason_check
--
--
-- ============================================================================
-- ROLLBACK (nao executar junto; so' se for preciso desfazer)
--
-- O dado original esta intacto em `room_status` (D2) -- e' justamente para isto que
-- ele fica. Desfazer NAO exige recuperar backup.
--
--   -- a) grants e permissoes novas
--   delete from public.profile_permissions pp
--   using public.permissions p
--   where p.id = pp.permission_id
--     and p.module_code = 'BASE'
--     and p.action_code in ('rooms.housekeeping', 'rooms.inspect');
--
--   update public.permissions
--   set status = 'inactive', deleted_at = now(), updated_at = now()
--   where module_code = 'BASE' and action_code in ('rooms.housekeeping', 'rooms.inspect');
--
--   -- b) perfis novos: DESATIVAR, nunca deletar (podem ja ter usuario vinculado,
--   --    e access_profiles e' referenciada com on delete restrict).
--   update public.access_profiles
--   set status = 'inactive', deleted_at = now(), updated_at = now()
--   where code in ('LIDER_GOVERNANCA', 'LIDER_MANUTENCAO');
--
--   -- c) as colunas de rooms. So faca isto se NENHUMA transicao tiver sido gravada
--   --    pela tela desde a aplicacao -- confira antes:
--   --      select count(*) from public.room_status_history;
--   --    Se voltar > 0, dropar as colunas DESCARTA trabalho real da governanca.
--   alter table public.rooms
--     drop column if exists occupancy_status,
--     drop column if exists housekeeping_status,
--     drop column if exists blocking_status;
--
-- ============================================================================
