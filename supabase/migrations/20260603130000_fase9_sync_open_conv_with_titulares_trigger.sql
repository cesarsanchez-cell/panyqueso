-- ============================================================================
-- Fase 9 follow-up: trigger que mantiene la convocatoria abierta sincronizada
-- con los titulares activos del grupo
-- ============================================================================
--
-- Caso reportado: el admin saca a un titular, el suplente #1 sube
-- automaticamente a titular (via removeMember), pero la convocatoria abierta
-- ya estaba creada con los titulares originales. El recien promovido no
-- aparece en convocatoria_players y por ende no ve el boton "No voy" en
-- /mi-perfil.
--
-- Invariante deseado: para todo grupo con convocatoria 'abierta', sus
-- titulares activos al momento estan invitados en esa convocatoria.
--
-- En vez de espolvorear llamadas a "sync" desde cada action que toca
-- grupo_membresias (addMember, removeMember, promoteToTitular,
-- demoteToSuplente, player_join_suplente_queue, y cualquier futuro path),
-- centralizamos la logica en un trigger AFTER INSERT/UPDATE/DELETE sobre
-- grupo_membresias.
--
-- Comportamiento:
--   - Si la fila resultante es titular activo y no esta en la conv abierta
--     -> insertar como 'confirmado' (ON CONFLICT DO NOTHING para preservar
--     el estado declinado/pendiente si ya existia).
--   - Si la fila dejo de ser titular activo (UPDATE o DELETE) -> sacar de
--     la conv abierta.
--
-- No recursivo: el trigger toca convocatoria_players, no grupo_membresias.
-- SECURITY DEFINER: bypasea RLS para poder insertar/borrar en
-- convocatoria_players a nombre del jugador afectado.
-- ============================================================================

create or replace function public.sync_open_conv_after_membership_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_open_conv_id uuid;
  v_grupo_id     uuid;
  v_was_titular  boolean := false;
  v_is_titular   boolean := false;
begin
  if tg_op = 'DELETE' then
    v_grupo_id := old.grupo_id;
  else
    v_grupo_id := new.grupo_id;
  end if;

  select id into v_open_conv_id
    from public.convocatorias
   where grupo_id = v_grupo_id
     and status = 'abierta'
   order by fecha desc
   limit 1;

  if v_open_conv_id is null then
    return coalesce(new, old);
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    v_was_titular := (old.status = 'activo' and old.tipo = 'titular');
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    v_is_titular := (new.status = 'activo' and new.tipo = 'titular');
  end if;

  -- Alta o promocion a titular activo: garantizar la invitacion.
  if v_is_titular then
    insert into public.convocatoria_players (
      convocatoria_id, player_id, attendance_status
    )
    values (v_open_conv_id, new.player_id, 'confirmado')
    on conflict (convocatoria_id, player_id) do nothing;
  end if;

  -- Baja, demotion o cambio de player_id: sacar al ex-titular de la conv.
  if v_was_titular and not v_is_titular then
    delete from public.convocatoria_players
     where convocatoria_id = v_open_conv_id
       and player_id = old.player_id;
  elsif v_was_titular and v_is_titular and old.player_id <> new.player_id then
    delete from public.convocatoria_players
     where convocatoria_id = v_open_conv_id
       and player_id = old.player_id;
  end if;

  return coalesce(new, old);
end;
$$;

comment on function public.sync_open_conv_after_membership_change() is
  'Fase 9 follow-up: mantiene el invariante de que los titulares activos de un grupo estan invitados en la convocatoria abierta del grupo. Trigger AFTER en grupo_membresias.';

drop trigger if exists trg_sync_open_conv_with_titulares on public.grupo_membresias;
create trigger trg_sync_open_conv_with_titulares
  after insert or update or delete
  on public.grupo_membresias
  for each row
  execute function public.sync_open_conv_after_membership_change();

-- Backfill: cualquier conv abierta con titulares faltantes queda sincronizada.
insert into public.convocatoria_players (convocatoria_id, player_id, attendance_status)
select c.id, gm.player_id, 'confirmado'
  from public.convocatorias c
  join public.grupo_membresias gm
    on gm.grupo_id = c.grupo_id
   and gm.tipo = 'titular'
   and gm.status = 'activo'
 where c.status = 'abierta'
on conflict (convocatoria_id, player_id) do nothing;
