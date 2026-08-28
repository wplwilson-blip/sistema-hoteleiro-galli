-- ============================================================================
-- SEED — Apartamentos do Hotel Galli (UH Fatia 1)
--
-- NAO E' MIGRATION. E' carga de DADOS, fora de supabase/migrations/ de proposito:
-- migrations descrevem ESTRUTURA e sao versionadas; isto e' o inventario de um hotel
-- especifico e nao deve entrar na esteira de schema.
--
-- NAO APLICADO PELO CODEX. O Wilson aplica no Supabase.
--
-- DEPENDE da migration 087 (room_types + colunas novas de rooms) ja' aplicada.
--
-- IDEMPOTENTE: `on conflict do nothing` em todas as chaves unicas, e os UPDATEs sao
-- convergentes (aplicar duas vezes da' o mesmo resultado). Reexecutar nao duplica nada.
--
-- ATENCAO -- o que este script NAO faz: nao corrige dado ja' existente que divirja desta
-- lista. `on conflict do nothing` PULA a linha em conflito; se um apartamento ja' existir
-- com tipo ou status diferente do previsto aqui, ele fica como esta'. Os UPDATEs dos
-- passos 5 e 6 (conjugados e comodidades), esses sim, sobrescrevem.
--
-- Estrutura confirmada em 004_operational_structure.sql:
--   blocks : unit_id NOT NULL, code NOT NULL (check ^[A-Z0-9_-]{1,20}$), name NOT NULL,
--            unique (unit_id, code)
--   floors : unit_id NOT NULL, block_id NULLABLE, number integer NULLABLE, code NOT NULL,
--            name NOT NULL, unique (unit_id, code)
--   rooms  : unit_id NOT NULL, room_number TEXT NOT NULL, block_id/floor_id NULLABLE,
--            capacity integer NULLABLE (check >= 0), room_status enum NOT NULL,
--            display_name NULLABLE, unique (unit_id, room_number)
--   room_status (enum, 001): available | occupied | dirty | cleaning | maintenance |
--            blocked | inactive
-- ============================================================================

do $$
declare
  v_unit uuid;
  v_rooms integer;
begin
  -- A unidade e' resolvida por CODIGO, nunca por uuid literal: o uuid de staging nao e' o
  -- de producao, e um literal errado semearia 115 apartamentos na unidade errada.
  select id into v_unit
  from public.units
  where code = 'GALLI' and deleted_at is null;

  if v_unit is null then
    -- Falha ALTO. Sem isto, tudo abaixo seria pulado em silencio (unit_id nulo nao casa
    -- com nada) e o script "passaria" sem semear uma linha.
    raise exception 'Unidade GALLI nao encontrada (public.units.code = ''GALLI''). Nada foi semeado.';
  end if;

  -- ==========================================================================
  -- 1) room_types — 9 tipos. capacity = PAX do tipo.
  -- ==========================================================================
  insert into public.room_types (unit_id, code, name, category, bed_config, capacity, beds, overbooking_limit)
  values
    (v_unit, 'STDS',  'Standard Solteiro',        'standard',   'solteiro',        1, 1, 1),
    (v_unit, 'STD',   'Standard Duplo',           'standard',   'duplo',           2, 2, 2),
    (v_unit, 'STAND', 'Standard Casal',           'standard',   'casal',           2, 1, 1),
    (v_unit, 'STDT',  'Standard Triplo Solteiro', 'standard',   'triplo_solteiro', 3, 3, 0),
    (v_unit, 'LXCS',  'Luxo Casal',               'luxo',       'casal',           2, 1, 0),
    (v_unit, 'LUX',   'Luxo Duplo',               'luxo',       'duplo',           2, 2, 1),
    (v_unit, 'LUXO',  'Luxo Triplo Solteiro',     'luxo',       'triplo_solteiro', 3, 3, 0),
    (v_unit, 'LXTPL', 'Luxo Casal Triplo',        'luxo',       'casal_triplo',    3, 2, 0),
    (v_unit, 'SLC',   'Super Luxo',               'super_luxo', 'casal',           2, 1, 0)
  on conflict on constraint room_types_unit_code_unique do nothing;

  -- ==========================================================================
  -- 2) blocks — 6 alas
  -- ==========================================================================
  insert into public.blocks (unit_id, code, name)
  values
    (v_unit, '100', 'Ala 100'),
    (v_unit, '200', 'Ala 200'),
    (v_unit, '300', 'Ala 300'),
    (v_unit, '400', 'Ala 400'),
    (v_unit, '500', 'Ala 500'),
    (v_unit, '600', 'Ala 600')
  on conflict on constraint blocks_unit_code_unique do nothing;

  -- ==========================================================================
  -- 3) floors — 3 andares.
  --
  -- block_id fica NULO: o andar atravessa as alas (duas alas por andar), entao nao
  -- pertence a uma so'. A coluna e' nullable na 004, entao isto e' legitimo, nao um
  -- contorno.
  -- ==========================================================================
  insert into public.floors (unit_id, block_id, code, name, number)
  values
    (v_unit, null, 'SUBSOLO',  'Subsolo',  -1),
    (v_unit, null, 'TERREO',   'Terreo',    0),
    (v_unit, null, 'PRIMEIRO', '1o Andar',  1)
  on conflict on constraint floors_unit_code_unique do nothing;

  -- ==========================================================================
  -- 4) rooms — 115 apartamentos.
  --
  -- ala   = 1o digito do numero (1->100 ... 6->600)
  -- andar = 1o digito tambem: alas 100 e 400 no subsolo, 200 e 500 no terreo, 300 e 600
  --         no primeiro. Distribuicao resultante: 38 / 35 / 42.
  -- capacity da UH = capacity (PAX) do tipo, lida de room_types por JOIN -- nao repetida
  --         aqui, para nao existirem duas fontes do mesmo numero.
  -- display_name = nulo (o numero ja' identifica).
  -- ==========================================================================
  with dados (room_number, type_code, block_code, floor_code, room_status) as (
    values
    ('112', 'STDS', '100', 'SUBSOLO', 'available'),
    ('113', 'STDS', '100', 'SUBSOLO', 'available'),
    ('114', 'STD', '100', 'SUBSOLO', 'available'),
    ('115', 'STDS', '100', 'SUBSOLO', 'available'),
    ('116', 'LUXO', '100', 'SUBSOLO', 'available'),
    ('117', 'LUXO', '100', 'SUBSOLO', 'available'),
    ('118', 'LXCS', '100', 'SUBSOLO', 'available'),
    ('119', 'STD', '100', 'SUBSOLO', 'available'),
    ('120', 'LXCS', '100', 'SUBSOLO', 'available'),
    ('121', 'STD', '100', 'SUBSOLO', 'available'),
    ('122', 'LXCS', '100', 'SUBSOLO', 'available'),
    ('123', 'STD', '100', 'SUBSOLO', 'available'),
    ('124', 'LXCS', '100', 'SUBSOLO', 'available'),
    ('125', 'STD', '100', 'SUBSOLO', 'available'),
    ('126', 'STAND', '100', 'SUBSOLO', 'available'),
    ('127', 'STD', '100', 'SUBSOLO', 'available'),
    ('128', 'STD', '100', 'SUBSOLO', 'available'),
    ('129', 'STD', '100', 'SUBSOLO', 'available'),
    ('130', 'STD', '100', 'SUBSOLO', 'available'),
    ('211', 'LUXO', '200', 'TERREO', 'available'),
    ('212', 'LXCS', '200', 'TERREO', 'available'),
    ('213', 'LUX', '200', 'TERREO', 'available'),
    ('214', 'LUX', '200', 'TERREO', 'available'),
    ('215', 'LUX', '200', 'TERREO', 'available'),
    ('216', 'LUX', '200', 'TERREO', 'available'),
    ('217', 'LUX', '200', 'TERREO', 'available'),
    ('218', 'LUX', '200', 'TERREO', 'available'),
    ('219', 'LUX', '200', 'TERREO', 'available'),
    ('220', 'LUX', '200', 'TERREO', 'available'),
    ('221', 'LUX', '200', 'TERREO', 'available'),
    ('222', 'LUX', '200', 'TERREO', 'available'),
    ('223', 'LUX', '200', 'TERREO', 'available'),
    ('224', 'LUX', '200', 'TERREO', 'available'),
    ('225', 'LUX', '200', 'TERREO', 'available'),
    ('226', 'LUX', '200', 'TERREO', 'available'),
    ('302', 'LXTPL', '300', 'PRIMEIRO', 'available'),
    ('303', 'LUXO', '300', 'PRIMEIRO', 'available'),
    ('311', 'STDS', '300', 'PRIMEIRO', 'available'),
    ('312', 'SLC', '300', 'PRIMEIRO', 'available'),
    ('313', 'STAND', '300', 'PRIMEIRO', 'maintenance'),
    ('314', 'STD', '300', 'PRIMEIRO', 'available'),
    ('315', 'LXCS', '300', 'PRIMEIRO', 'available'),
    ('316', 'STDT', '300', 'PRIMEIRO', 'available'),
    ('317', 'LXTPL', '300', 'PRIMEIRO', 'available'),
    ('318', 'LUX', '300', 'PRIMEIRO', 'available'),
    ('319', 'LUX', '300', 'PRIMEIRO', 'available'),
    ('320', 'LXCS', '300', 'PRIMEIRO', 'available'),
    ('321', 'LXCS', '300', 'PRIMEIRO', 'maintenance'),
    ('322', 'LUX', '300', 'PRIMEIRO', 'available'),
    ('323', 'LUX', '300', 'PRIMEIRO', 'available'),
    ('324', 'LUX', '300', 'PRIMEIRO', 'available'),
    ('325', 'LUX', '300', 'PRIMEIRO', 'available'),
    ('326', 'LUX', '300', 'PRIMEIRO', 'available'),
    ('327', 'LUX', '300', 'PRIMEIRO', 'maintenance'),
    ('328', 'LXCS', '300', 'PRIMEIRO', 'available'),
    ('329', 'LUX', '300', 'PRIMEIRO', 'available'),
    ('330', 'LUX', '300', 'PRIMEIRO', 'available'),
    ('331', 'LUX', '300', 'PRIMEIRO', 'maintenance'),
    ('401', 'LXCS', '400', 'SUBSOLO', 'available'),
    ('402', 'LXCS', '400', 'SUBSOLO', 'available'),
    ('403', 'LXCS', '400', 'SUBSOLO', 'available'),
    ('404', 'STD', '400', 'SUBSOLO', 'available'),
    ('405', 'LUX', '400', 'SUBSOLO', 'available'),
    ('406', 'STAND', '400', 'SUBSOLO', 'available'),
    ('407', 'STD', '400', 'SUBSOLO', 'available'),
    ('408', 'STD', '400', 'SUBSOLO', 'available'),
    ('409', 'STD', '400', 'SUBSOLO', 'available'),
    ('410', 'STD', '400', 'SUBSOLO', 'available'),
    ('411', 'STD', '400', 'SUBSOLO', 'available'),
    ('412', 'STD', '400', 'SUBSOLO', 'available'),
    ('413', 'STD', '400', 'SUBSOLO', 'available'),
    ('414', 'STD', '400', 'SUBSOLO', 'available'),
    ('415', 'STD', '400', 'SUBSOLO', 'available'),
    ('416', 'STD', '400', 'SUBSOLO', 'available'),
    ('417', 'STD', '400', 'SUBSOLO', 'available'),
    ('418', 'STD', '400', 'SUBSOLO', 'available'),
    ('419', 'STD', '400', 'SUBSOLO', 'available'),
    ('502', 'LXCS', '500', 'TERREO', 'available'),
    ('503', 'LUX', '500', 'TERREO', 'available'),
    ('504', 'LXCS', '500', 'TERREO', 'available'),
    ('505', 'LUX', '500', 'TERREO', 'available'),
    ('506', 'LUX', '500', 'TERREO', 'available'),
    ('507', 'LUX', '500', 'TERREO', 'available'),
    ('508', 'STD', '500', 'TERREO', 'available'),
    ('509', 'LUX', '500', 'TERREO', 'available'),
    ('510', 'LUX', '500', 'TERREO', 'available'),
    ('511', 'LUX', '500', 'TERREO', 'available'),
    ('512', 'LUX', '500', 'TERREO', 'available'),
    ('513', 'LUX', '500', 'TERREO', 'available'),
    ('514', 'LUX', '500', 'TERREO', 'available'),
    ('515', 'LUX', '500', 'TERREO', 'available'),
    ('516', 'LUX', '500', 'TERREO', 'available'),
    ('517', 'LUX', '500', 'TERREO', 'available'),
    ('518', 'LUX', '500', 'TERREO', 'available'),
    ('519', 'LUX', '500', 'TERREO', 'available'),
    ('520', 'LUX', '500', 'TERREO', 'available'),
    ('601', 'STAND', '600', 'PRIMEIRO', 'available'),
    ('602', 'STAND', '600', 'PRIMEIRO', 'maintenance'),
    ('603', 'STAND', '600', 'PRIMEIRO', 'available'),
    ('604', 'STAND', '600', 'PRIMEIRO', 'maintenance'),
    ('605', 'STD', '600', 'PRIMEIRO', 'available'),
    ('606', 'STD', '600', 'PRIMEIRO', 'maintenance'),
    ('607', 'STD', '600', 'PRIMEIRO', 'maintenance'),
    ('608', 'STD', '600', 'PRIMEIRO', 'maintenance'),
    ('609', 'STD', '600', 'PRIMEIRO', 'maintenance'),
    ('610', 'STD', '600', 'PRIMEIRO', 'available'),
    ('611', 'STD', '600', 'PRIMEIRO', 'available'),
    ('612', 'STD', '600', 'PRIMEIRO', 'available'),
    ('613', 'STD', '600', 'PRIMEIRO', 'available'),
    ('614', 'STD', '600', 'PRIMEIRO', 'available'),
    ('615', 'STD', '600', 'PRIMEIRO', 'available'),
    ('616', 'STD', '600', 'PRIMEIRO', 'available'),
    ('617', 'STD', '600', 'PRIMEIRO', 'available'),
    ('618', 'STD', '600', 'PRIMEIRO', 'available'),
    ('620', 'STD', '600', 'PRIMEIRO', 'available')
  )
  insert into public.rooms (unit_id, block_id, floor_id, room_type_id, room_number, capacity, room_status, display_name)
  select
    v_unit,
    b.id,
    f.id,
    rt.id,
    d.room_number,
    rt.capacity,
    d.room_status::public.room_status,
    null
  from dados d
  join public.room_types rt on rt.unit_id = v_unit and rt.code = d.type_code
  join public.blocks b      on b.unit_id  = v_unit and b.code  = d.block_code
  join public.floors f      on f.unit_id  = v_unit and f.code  = d.floor_code
  on conflict on constraint rooms_unit_number_unique do nothing;

  -- Guarda: se algum JOIN nao casar (tipo/ala/andar ausente), o insert semearia MENOS que
  -- 115 sem reclamar -- inner join descarta a linha em silencio. Aqui a divergencia
  -- aparece em vez de virar um inventario incompleto que ninguem percebe.
  select count(*) into v_rooms
  from public.rooms
  where unit_id = v_unit and deleted_at is null;

  if v_rooms < 115 then
    raise exception 'Esperados 115 apartamentos na unidade GALLI, encontrados %. Verifique se room_types/blocks/floors foram semeados.', v_rooms;
  end if;

  -- ==========================================================================
  -- 5) Conjugados — 4 pares, marcados DOS DOIS LADOS.
  --
  -- Um par so' faz sentido se as duas UHs se apontam. Gravar um lado so' faria a pergunta
  -- "esta UH e' conjugada?" responder diferente conforme o lado consultado.
  -- ==========================================================================
  with pares (a, b) as (
    values ('328', '330'), ('404', '406'), ('504', '506'), ('604', '606')
  ),
  cruzado (origem, destino) as (
    select a, b from pares
    union all
    select b, a from pares
  )
  update public.rooms r
  set is_connecting = true,
      connecting_room_id = alvo.id,
      updated_at = now()
  from cruzado c
  join public.rooms alvo
    on alvo.unit_id = v_unit
   and alvo.room_number = c.destino
   and alvo.deleted_at is null
  where r.unit_id = v_unit
    and r.room_number = c.origem
    and r.deleted_at is null;

  -- ==========================================================================
  -- 6) Comodidades por CATEGORIA do tipo.
  --
  -- Derivado de room_types.category, nao repetido apartamento a apartamento: se um tipo
  -- mudar de categoria, basta reexecutar este passo. Escopado ao v_unit.
  -- ==========================================================================
  update public.rooms r
  set climate_control = case when rt.category = 'standard' then 'ventilador' else 'ar_condicionado' end,
      has_minibar     = (rt.category <> 'standard'),
      updated_at = now()
  from public.room_types rt
  where rt.id = r.room_type_id
    and r.unit_id = v_unit
    and r.deleted_at is null;

  raise notice 'Seed do Hotel Galli concluido na unidade % (% apartamentos).', v_unit, v_rooms;
end;
$$;


-- ============================================================================
-- VALIDACAO (rodar APOS aplicar)
-- ============================================================================
--
-- 1) Contagens por tabela:
--
--    select
--      (select count(*) from public.room_types rt join public.units u on u.id = rt.unit_id
--         where u.code = 'GALLI' and rt.deleted_at is null)  as room_types,   -- esperado 9
--      (select count(*) from public.blocks b join public.units u on u.id = b.unit_id
--         where u.code = 'GALLI' and b.deleted_at is null)   as blocks,       -- esperado 6
--      (select count(*) from public.floors f join public.units u on u.id = f.unit_id
--         where u.code = 'GALLI' and f.deleted_at is null)   as floors,       -- esperado 3
--      (select count(*) from public.rooms r join public.units u on u.id = r.unit_id
--         where u.code = 'GALLI' and r.deleted_at is null)   as rooms;        -- esperado 115
--
-- 2) Manutencao, conjugados e tipo obrigatorio:
--
--    select
--      count(*) filter (where r.room_status = 'maintenance') as em_manutencao,  -- esperado 10
--      count(*) filter (where r.is_connecting)               as conjugados,     -- esperado 8
--      count(*) filter (where r.room_type_id is null)        as sem_tipo        -- esperado 0
--    from public.rooms r
--    join public.units u on u.id = r.unit_id
--    where u.code = 'GALLI' and r.deleted_at is null;
--
-- 3) Os conjugados se apontam DOS DOIS LADOS (nenhuma linha deve voltar):
--
--    select r.room_number, alvo.room_number as aponta_para
--    from public.rooms r
--    join public.units u on u.id = r.unit_id
--    left join public.rooms alvo on alvo.id = r.connecting_room_id
--    where u.code = 'GALLI' and r.is_connecting and r.deleted_at is null
--      and (alvo.id is null or alvo.connecting_room_id is distinct from r.id);
--
-- 4) Comodidade por categoria (standard = ventilador/sem frigobar; demais = ar/com):
--
--    select rt.category, r.climate_control, r.has_minibar, count(*) as apartamentos
--    from public.rooms r
--    join public.units u on u.id = r.unit_id
--    join public.room_types rt on rt.id = r.room_type_id
--    where u.code = 'GALLI' and r.deleted_at is null
--    group by 1, 2, 3
--    order by 1, 2;
--    -- esperado: standard | ventilador | false   e   luxo/super_luxo | ar_condicionado | true
--
-- 5) Distribuicao por ala e andar (conferencia visual do mapeamento):
--
--    select b.name as ala, f.name as andar, count(*) as apartamentos
--    from public.rooms r
--    join public.units u on u.id = r.unit_id
--    left join public.blocks b on b.id = r.block_id
--    left join public.floors f on f.id = r.floor_id
--    where u.code = 'GALLI' and r.deleted_at is null
--    group by 1, 2 order by 1;
--    -- esperado por andar: Subsolo 38, Terreo 35, 1o Andar 42
--
-- ============================================================================
