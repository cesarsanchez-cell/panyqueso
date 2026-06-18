-- ============================================================================
-- Fix: en la vista de jugador/coordinador, los invitados (is_guest) perdían el
-- nombre en el roster de la convocatoria
-- ============================================================================
--
-- Un invitado puntual (FUT-111) es una fila players con is_guest=true, agregada
-- a la convocatoria con player_id (su nombre vive en players.nombre, no en
-- nombre_libre). El roster de /mi-perfil resuelve los nombres vía la vista
-- players_public, que filtra is_guest=false → el invitado caía al fallback "—".
-- El admin lo ve bien porque lee players directo; el jugador/coordinador no.
--
-- Fix: una RPC SECURITY DEFINER que devuelve SOLO datos de display (nombre,
-- apodo, foto, escudo — nada sensible) de los integrantes del roster, e incluye
-- a los invitados. Gateada: el que llama tiene que PARTICIPAR de esa
-- convocatoria (estar en su roster) o GESTIONAR el grupo. Así solo ves los
-- nombres de la gente con la que jugás.
-- ============================================================================

create or replace function public.get_convocatoria_roster_names(p_conv_ids uuid[])
returns table (
  player_id  uuid,
  nombre     text,
  apodo      text,
  avatar_url text,
  club_id    text
)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct cp.player_id, p.nombre, p.apodo, p.avatar_url, p.club_id
    from public.convocatoria_players cp
    join public.players p on p.id = cp.player_id
    join public.convocatorias c on c.id = cp.convocatoria_id
   where cp.convocatoria_id = any (p_conv_ids)
     and cp.player_id is not null
     and (
       -- gestiona el grupo (admin en todos, coordinador en los suyos)
       coalesce(public.can_manage_grupo(c.grupo_id), false)
       -- o participa de esa misma convocatoria
       or exists (
         select 1
           from public.convocatoria_players me
          where me.convocatoria_id = c.id
            and me.player_id = public.current_player_id()
       )
     );
$$;

comment on function public.get_convocatoria_roster_names(uuid[]) is
  'Datos de display (nombre/apodo/foto/escudo, sin nada sensible) de los integrantes del roster de las convocatorias dadas, incluidos los invitados (is_guest). Gate: el caller participa de la convocatoria o gestiona el grupo. Resuelve el bug de nombres "—" en la vista de jugador/coordinador.';

revoke all on function public.get_convocatoria_roster_names(uuid[]) from public, anon;
grant execute on function public.get_convocatoria_roster_names(uuid[]) to authenticated;
