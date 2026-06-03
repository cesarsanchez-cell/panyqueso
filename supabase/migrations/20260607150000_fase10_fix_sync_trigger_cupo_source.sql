-- ============================================================================
-- Fase 10 fix: el trigger sync_open_conv_after_membership_change debe usar el
--              cupo de la CONVOCATORIA (cupo_maximo), no el del grupo
--              (cupo_titulares)
-- ============================================================================
--
-- Misma clase de bug que #109 (20260607130000), pero por la via del trigger en
-- vez de las RPCs del jugador.
--
-- Cuando un jugador se da de alta / reactiva en el grupo y hay una convocatoria
-- abierta, el trigger decide si entra como titular o suplente. Hasta ahora
-- comparaba la cuenta de titulares contra grupos.cupo_titulares. Antes de Fase
-- 10 ese valor SIEMPRE coincidia con convocatorias.cupo_maximo (se copiaba al
-- crear la conv). Pero Fase 10 permite editar el cupo POR convocatoria
-- (set_convocatoria_cupo): si el admin baja el cupo de la conv (ej. grupo=8,
-- conv=6), con 6 titulares el reactivado deberia ir a la cola de suplentes
-- (6 = cupo de la conv), pero comparando contra el grupo (6 < 8) entraba titular.
--
-- Fix: leer cupo_maximo de la convocatoria abierta (ya resuelta en v_open_conv_id
-- mas arriba en la misma funcion), no cupo_titulares del grupo. El grupo sigue
-- siendo solo el default al crear la convocatoria.
--
-- Solo se hace CREATE OR REPLACE de la funcion; el binding del trigger
-- (trg_sync_open_conv_with_grupo, definido en 20260603170000) sigue valido.
-- ============================================================================

create or replace function public.sync_open_conv_after_membership_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_open_conv_id   uuid;
  v_grupo_id       uuid;
  v_cupo_maximo    int;
  v_titulares_count int;
  v_was_active     boolean := false;
  v_is_active      boolean := false;
  v_existing_id    uuid;
  v_existing_rol   public.membresia_tipo;
  v_existing_orden int;
  v_existing_status public.attendance_status;
  v_first_supl_id  uuid;
  v_next_orden     int;
  v_target_player  uuid;
begin
  if tg_op = 'DELETE' then
    v_grupo_id := old.grupo_id;
    v_target_player := old.player_id;
  else
    v_grupo_id := new.grupo_id;
    v_target_player := new.player_id;
  end if;

  -- Conv abierta del grupo.
  select id into v_open_conv_id
    from public.convocatorias
   where grupo_id = v_grupo_id
     and status = 'abierta'
   order by fecha desc
   limit 1;
  if v_open_conv_id is null then
    return coalesce(new, old);
  end if;

  -- Cupo de la CONVOCATORIA abierta (no del grupo). Fase 10: el cupo se edita
  -- por convocatoria, asi que la decision titular/suplente DENTRO de la conv
  -- debe usar convocatorias.cupo_maximo.
  select cupo_maximo into v_cupo_maximo
    from public.convocatorias
   where id = v_open_conv_id;

  if tg_op in ('UPDATE', 'DELETE') then
    v_was_active := (old.status = 'activo');
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_is_active := (new.status = 'activo');
  end if;

  -- 1) Baja del grupo (paso a inactivo o DELETE).
  if v_was_active and not v_is_active then
    select id, rol_en_convocatoria, orden_suplente, attendance_status
      into v_existing_id, v_existing_rol, v_existing_orden, v_existing_status
      from public.convocatoria_players
     where convocatoria_id = v_open_conv_id
       and player_id = v_target_player
       and attendance_status <> 'declinado';

    if found then
      delete from public.convocatoria_players where id = v_existing_id;
      if v_existing_rol = 'titular' then
        select id into v_first_supl_id
          from public.convocatoria_players
         where convocatoria_id = v_open_conv_id
           and rol_en_convocatoria = 'suplente'
           and attendance_status <> 'declinado'
         order by orden_suplente asc
         limit 1;
        if found then
          update public.convocatoria_players
             set rol_en_convocatoria = 'titular',
                 orden_suplente = null,
                 updated_at = now()
           where id = v_first_supl_id;
          perform public._conv_compactar_cola(v_open_conv_id, 1);
        end if;
      elsif v_existing_rol = 'suplente' and v_existing_orden is not null then
        perform public._conv_compactar_cola(v_open_conv_id, v_existing_orden);
      end if;
    end if;
    return coalesce(new, old);
  end if;

  -- 2) Alta o reactivacion al grupo. Si ya tiene fila no-declinada en la
  -- conv (caso raro: el trigger ya lo agrego antes), no tocamos.
  if v_is_active and not v_was_active then
    select id, attendance_status
      into v_existing_id, v_existing_status
      from public.convocatoria_players
     where convocatoria_id = v_open_conv_id
       and player_id = v_target_player
     for update;

    if found and v_existing_status <> 'declinado' then
      return coalesce(new, old);
    end if;

    -- Decidir rol por cupo de la CONVOCATORIA.
    select count(*) into v_titulares_count
      from public.convocatoria_players
     where convocatoria_id = v_open_conv_id
       and rol_en_convocatoria = 'titular'
       and attendance_status <> 'declinado';

    if v_titulares_count < v_cupo_maximo then
      if v_existing_id is not null then
        update public.convocatoria_players
           set attendance_status = 'confirmado',
               rol_en_convocatoria = 'titular',
               orden_suplente = null,
               updated_at = now()
         where id = v_existing_id;
      else
        insert into public.convocatoria_players (
          convocatoria_id, player_id, attendance_status, rol_en_convocatoria, orden_suplente
        ) values (v_open_conv_id, v_target_player, 'confirmado', 'titular', null);
      end if;
    else
      select coalesce(max(orden_suplente), 0) + 1 into v_next_orden
        from public.convocatoria_players
       where convocatoria_id = v_open_conv_id
         and rol_en_convocatoria = 'suplente'
         and attendance_status <> 'declinado';
      if v_existing_id is not null then
        update public.convocatoria_players
           set attendance_status = 'confirmado',
               rol_en_convocatoria = 'suplente',
               orden_suplente = v_next_orden,
               updated_at = now()
         where id = v_existing_id;
      else
        insert into public.convocatoria_players (
          convocatoria_id, player_id, attendance_status, rol_en_convocatoria, orden_suplente
        ) values (v_open_conv_id, v_target_player, 'confirmado', 'suplente', v_next_orden);
      end if;
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

comment on function public.sync_open_conv_after_membership_change() is
  'Fase 10: sincroniza la convocatoria abierta del grupo con cambios en membresias. Alta -> entra como titular si hay cupo SEGUN convocatorias.cupo_maximo (no el del grupo), sino suplente al final. Baja -> sale y sube primer suplente si liberaba titular. Ignora tipo/orden de grupo_membresias (legacy).';
