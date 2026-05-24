-- ============================================================================
-- Fase 9 PR 1: extender players con campos del onboarding
-- ============================================================================
--
-- Nuevos campos:
--   - phone, auth_user_id: linkeo con auth.users cuando el jugador se registra.
--   - fecha_nacimiento: reemplaza la columna edad (que envejece mal). Por ahora
--     queda nullable y conviven ambas; el drop de edad y la migracion del
--     codigo TS van en un PR posterior.
--   - apodo, pierna_habil, email, avatar_url, ubicacion_maps_url:
--     campos opcionales del perfil del jugador (no invasivos).
--
-- Constraints:
--   - phone UNIQUE WHERE NOT NULL: un cel = un jugador (regla del producto).
--   - email UNIQUE WHERE NOT NULL: para futura recuperacion / contacto backup.
--
-- Trigger de inmutabilidad (players_enforce_immutability): chequea campos
-- por nombre. Los nuevos no estan en su lista de "sensibles" -> se pueden
-- UPDATE directo. Eso es OK para PR 1; la sensibilidad de phone/fecha_nac/
-- email se enforza en un PR posterior cuando se conecten al flow del jugador.
--
-- IMPORTANTE: edad NO se drop en este PR. El codigo TS y compute_internal_score
-- siguen usando edad. La migracion edad -> fecha_nacimiento del codigo se hace
-- en un PR aparte para mantener PR 1 reversible.
-- ============================================================================

-- 1. Columnas nuevas ---------------------------------------------------------
alter table public.players
  add column if not exists phone               text,
  add column if not exists auth_user_id        uuid references auth.users(id) on delete set null,
  add column if not exists fecha_nacimiento    date,
  add column if not exists apodo               text,
  add column if not exists pierna_habil        public.pierna_habil_enum,
  add column if not exists email               text,
  add column if not exists avatar_url          text,
  add column if not exists ubicacion_maps_url  text;

comment on column public.players.phone is
  'Fase 9: telefono del jugador en E.164. Identidad unica (1 cel = 1 jugador).';
comment on column public.players.auth_user_id is
  'Fase 9: linkeo con auth.users cuando el jugador acepta su invite y se registra. Null para legacy (gestionado por admin) y para invitados pendientes.';
comment on column public.players.fecha_nacimiento is
  'Fase 9: reemplaza la columna edad. La edad se calcula on-the-fly. Mientras conviven ambas, la fuente de verdad para el algoritmo es edad; en un PR posterior se migra el codigo y se drop edad.';
comment on column public.players.apodo is
  'Fase 9: sobrenombre opcional, visible entre miembros del grupo.';
comment on column public.players.pierna_habil is
  'Fase 9: pierna habil opcional. Util tactico, no invasivo.';
comment on column public.players.email is
  'Fase 9: email de contacto / futura recuperacion de password. Privado: solo admin/veedor lo ven (no expuesto entre miembros).';
comment on column public.players.avatar_url is
  'Fase 9: referencia a Supabase Storage (bucket avatars). El bucket se crea en PR 9 (mi-perfil).';
comment on column public.players.ubicacion_maps_url is
  'Fase 9: link de Google Maps a la ubicacion del jugador. Lo pega el propio jugador en /mi-perfil. Visible a miembros del grupo.';

-- 2. Unique constraints parciales --------------------------------------------
create unique index if not exists players_phone_unique
  on public.players (phone)
  where phone is not null;

create unique index if not exists players_email_unique
  on public.players (lower(email))
  where email is not null;

create unique index if not exists players_auth_user_id_unique
  on public.players (auth_user_id)
  where auth_user_id is not null;

-- 3. Populate fecha_nacimiento desde edad para players existentes -------------
-- 1 de enero del año aproximado. El jugador puede corregirla cuando se
-- registre. Para los players que se quedan como legacy (sin signup), queda
-- esta aproximacion.
--
-- Nota: este UPDATE pasa por players_enforce_immutability. fecha_nacimiento
-- no esta en la lista de sensibles, asi que el trigger lo permite.
update public.players
   set fecha_nacimiento = make_date(extract(year from current_date)::int - edad, 1, 1)
 where edad is not null
   and fecha_nacimiento is null;
