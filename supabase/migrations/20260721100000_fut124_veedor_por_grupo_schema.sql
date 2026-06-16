-- ============================================================================
-- FUT-124 (Fase 1): el veedor pasa a ser POR GRUPO (igual que el coordinador)
-- ============================================================================
--
-- Hasta ahora el veedor era GLOBAL (rol 'veedor' a secas, auditaba todo). Esto
-- lo lleva al mismo modelo del coordinador: una tabla veedor_grupos dice qué
-- grupos audita cada quién, y la marca 'veedor' en profiles.role queda solo para
-- el gate de la app. Lo asigna el admin O el coordinador del grupo (grupos de
-- amigos: el veedor tiene independencia, no depende de que el admin lo arme).
--
-- Modelo "fusionado": un grupo se audita SI tiene al menos un veedor asignado.
-- No hay toggle aparte; asignar veedor = auditoría ON, sacar a todos = el admin
-- aplica los ratings directo. (grupos.veedor_activo / requiere_veedor() quedan
-- deprecados; se dejan de leer en la Fase 2.)
--
-- Esta migración: tabla + helper can_audit_grupo + RPCs asignar/quitar +
-- limpieza de marcas 'veedor' colgadas (las pruebas de hoy) — al no sembrar
-- veedor_grupos, cualquier role='veedor' queda inconsistente con el modelo nuevo.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tabla de asignación veedor <-> grupo
-- ---------------------------------------------------------------------------
create table public.veedor_grupos (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  grupo_id    uuid not null references public.grupos(id)   on delete cascade,
  created_at  timestamptz not null default now(),
  created_by  uuid references public.profiles(id) on delete set null,
  unique (profile_id, grupo_id)
);

comment on table public.veedor_grupos is
  'FUT-124: qué grupos audita cada veedor. La autoridad de auditoría se chequea con can_audit_grupo(); la marca veedor en profiles.role es para el gate de la app. Un grupo se audita iff tiene >=1 fila acá.';

create index veedor_grupos_grupo_idx   on public.veedor_grupos (grupo_id);
create index veedor_grupos_profile_idx on public.veedor_grupos (profile_id);

-- ---------------------------------------------------------------------------
-- 2. Helper de autoridad de auditoría por grupo
-- ---------------------------------------------------------------------------
-- admin = audita en todos los grupos; veedor = solo en los suyos.
create or replace function public.can_audit_grupo(p_grupo_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.current_user_role() = 'admin'
    or exists (
      select 1
        from public.veedor_grupos vg
       where vg.profile_id = auth.uid()
         and vg.grupo_id = p_grupo_id
    );
$$;

comment on function public.can_audit_grupo(uuid) is
  'FUT-124: true si el usuario puede auditar ratings del grupo: admin (todos) o veedor asignado a ese grupo.';

revoke all on function public.can_audit_grupo(uuid) from public;
grant execute on function public.can_audit_grupo(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. RLS de veedor_grupos
-- ---------------------------------------------------------------------------
alter table public.veedor_grupos enable row level security;

-- SELECT: quien gestiona el grupo (admin o coordinador) ve sus veedores; el
-- propio veedor ve sus asignaciones.
create policy veedor_grupos_select
  on public.veedor_grupos
  for select
  to authenticated
  using (public.can_manage_grupo(grupo_id) or profile_id = auth.uid());

-- INSERT/UPDATE/DELETE van por los RPC SECURITY DEFINER (no por el cliente):
-- no se definen policies de escritura → deny-all salvo los RPC.

-- ---------------------------------------------------------------------------
-- 4. asignar_veedor_a_grupo: otorga la marca (si hace falta) + liga al grupo
-- ---------------------------------------------------------------------------
create or replace function public.asignar_veedor_a_grupo(
  p_profile_id uuid,
  p_grupo_id   uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.user_role;
begin
  -- Lo asigna quien gestiona el grupo: admin o coordinador del grupo.
  if not coalesce(public.can_manage_grupo(p_grupo_id), false) then
    raise exception 'not_authorized' using errcode = 'P0013';
  end if;

  if not exists (select 1 from public.grupos where id = p_grupo_id) then
    raise exception 'grupo_not_found' using errcode = 'P0030';
  end if;

  select role into v_role from public.profiles where id = p_profile_id;
  if not found then
    raise exception 'profile_not_found' using errcode = 'P0033';
  end if;

  -- No pisar otros rangos: si ya es admin o coordinador, hay que sacárselo antes.
  if v_role in ('admin', 'coordinador') then
    raise exception 'tiene_otro_rango' using errcode = 'P0090';
  end if;

  -- Otorga la marca veedor (si venía de player/NULL) — idempotente.
  update public.profiles
     set role = 'veedor'
   where id = p_profile_id
     and role is distinct from 'veedor';

  insert into public.veedor_grupos (profile_id, grupo_id, created_by)
  values (p_profile_id, p_grupo_id, auth.uid())
  on conflict (profile_id, grupo_id) do nothing;
end;
$$;

revoke all on function public.asignar_veedor_a_grupo(uuid, uuid) from public, anon;
grant execute on function public.asignar_veedor_a_grupo(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. quitar_veedor_de_grupo: desliga + (si era el último) baja la marca
-- ---------------------------------------------------------------------------
create or replace function public.quitar_veedor_de_grupo(
  p_veedor_grupo_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_grupo_id   uuid;
  v_has_player boolean;
begin
  select profile_id, grupo_id into v_profile_id, v_grupo_id
    from public.veedor_grupos where id = p_veedor_grupo_id;

  -- Idempotente: si no existe, nada que hacer.
  if v_profile_id is null then
    return;
  end if;

  if not coalesce(public.can_manage_grupo(v_grupo_id), false) then
    raise exception 'not_authorized' using errcode = 'P0013';
  end if;

  delete from public.veedor_grupos where id = p_veedor_grupo_id;

  -- Si todavía audita otros grupos, conserva la marca.
  if exists (
    select 1 from public.veedor_grupos where profile_id = v_profile_id
  ) then
    return;
  end if;

  -- Era su último grupo: le sacamos la marca. Vuelve a 'player' si tiene ficha,
  -- si no a NULL.
  select exists (
    select 1 from public.players where auth_user_id = v_profile_id
  ) into v_has_player;

  update public.profiles
     set role = case when v_has_player then 'player'::public.user_role else null end
   where id = v_profile_id
     and role = 'veedor';
end;
$$;

revoke all on function public.quitar_veedor_de_grupo(uuid) from public, anon;
grant execute on function public.quitar_veedor_de_grupo(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Limpieza: marcas 'veedor' colgadas (no hay asignaciones todavía)
-- ---------------------------------------------------------------------------
-- En el modelo nuevo, ser veedor = estar en veedor_grupos. Cualquier role='veedor'
-- sin fila en veedor_grupos (p.ej. pruebas del día) queda inconsistente → vuelve
-- a 'player' si tiene ficha, si no a NULL.
update public.profiles p
   set role = case
                when exists (select 1 from public.players pl where pl.auth_user_id = p.id)
                then 'player'::public.user_role
                else null
              end
 where p.role = 'veedor'
   and not exists (select 1 from public.veedor_grupos vg where vg.profile_id = p.id);
