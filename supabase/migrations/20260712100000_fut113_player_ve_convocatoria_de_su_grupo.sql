-- ============================================================================
-- FUT-113: el jugador ve las convocatorias de SUS GRUPOS, no solo donde tiene fila
-- ============================================================================
--
-- Bug: cuando el coordinador "saca" a un jugador de una convocatoria,
-- admin_remove_from_convocatoria BORRA su fila de convocatoria_players. La
-- política de SELECT de convocatorias del jugador exigía tener una fila ahí,
-- así que al borrarla el jugador perdía la visibilidad de la convocatoria
-- entera: en /mi-perfil caía en "no hay convocatoria abierta" y nunca le
-- aparecía el cartel "Me anoto" para volver. Dead-end.
--
-- La política del ROSTER (convocatoria_players_select_player_member_of_grupo)
-- ya usa la pertenencia al grupo (is_member_of_conv_grupo), no la fila. Esta
-- migración alinea la política de la convocatoria con el mismo criterio: el
-- jugador ve una convocatoria si es (o fue) miembro de su grupo. Así:
--   - el sacado vuelve a ver la convocatoria -> aparece "Me anoto" -> se reanota
--     (player_join_open_convocatoria ya existe y solo exige membresía activa);
--   - cualquier miembro no anotado también la ve y se puede postular.
--
-- is_member_of_conv_grupo es SECURITY DEFINER (corre como owner, sin RLS), así
-- que leer convocatorias adentro no re-dispara esta policy: no hay recursión.
--
-- Nota: con un draft generado el "Me anoto" sigue bloqueado por el trigger de
-- FUT-112 (lista congelada) — comportamiento buscado. Esto opera en el estado
-- abierto-sin-draft.
-- ============================================================================

drop policy if exists convocatorias_select_player_invited on public.convocatorias;

create policy convocatorias_select_player_member_of_grupo
  on public.convocatorias
  for select
  to authenticated
  using (
    public.current_user_role() = 'player'
    and public.is_member_of_conv_grupo(public.convocatorias.id)
  );

comment on policy convocatorias_select_player_member_of_grupo on public.convocatorias is
  'FUT-113: el jugador ve las convocatorias de los grupos donde es (o fue) miembro, no solo donde tiene fila en convocatoria_players. Reemplaza convocatorias_select_player_invited para que un jugador sacado del roster siga viendo la convocatoria y pueda re-anotarse. Mismo criterio que la policy del roster (is_member_of_conv_grupo, SECURITY DEFINER, sin recursión).';
