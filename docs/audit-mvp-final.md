# Audit handoff — MVP Pan y Queso

Documento de cierre del MVP para revisión por auditor externo cuando esté disponible.
Generado al cerrar Fase 8 (2026-05-23).

---

## 1. Estado del proyecto

**MVP terminado.** Todas las fases del plan v4 cerradas. Definition of Done cubierto:

| DoD item | Estado |
|---|---|
| Admin y veedor pueden loguearse | ✅ Fase 1 |
| Jugadores: crear / editar / aprobar / desactivar | ✅ Fase 3 |
| Ratings internos calculados + almacenados | ✅ Fase 2 (`compute_internal_score`, trigger) |
| Cambios sensibles registrados con trazabilidad | ✅ Fase 2-3 (`audit_log` + `player_change_requests`) |
| Crear convocatoria | ✅ Fase 5 |
| Generar 2 teams desde jugadores convocados | ✅ Fase 6 (`lib/teams/generate.ts`) |
| Balance summary visible | ✅ Fase 6 |
| Ajuste manual de teams pre-confirmación | ✅ Fase 6 (swap + promote GK) |
| Confirmar match + persistir snapshot inmutable | ✅ Fase 6 (`confirm-actions.ts` + `balance_snapshots`) |
| Cargar resultado + stats básicas | ✅ Fase 7 (`result-actions.ts`, `goals-actions.ts`) |
| UI responsive | ⚠️ Tailwind responsive en todas las páginas; pendiente QA manual en device real |
| Privacidad: rating interno no expuesto | ✅ todas las páginas con `internal_score` requieren admin/veedor |

---

## 2. Resumen por fase con commits de GO

| Fase | Scope | Commit GO | PRs | Notas |
|---|---|---|---|---|
| Fase 0 | Setup Next 15 + TS + Tailwind 4 + CI | (pre-audit) | — | Resuelto en audit externo |
| Fase 1 | Auth + roles (admin / veedor) + middleware | (pre-audit) | — | GO externo |
| Fase 2 | Schema DB + RLS + funciones SECURITY DEFINER + pgTAP | `540ad72` | — | GO externo, marcada como crítica |
| Fase 3 | UI gestión de jugadores | `c4b659c` | #36–#38 | 3 majors en re-review, fixeados |
| Fase 4 | UX veedor (cola, badge, P0005, diff) | `5aed27a` | #39–#43 | Primer review limpio sin majors |
| Fase 5 | Convocatorias + Lugares | `e57061d` | #44–#47 | Hotfix #47: policy DELETE faltante en `convocatoria_players` |
| Fase 6 | Generador + draft + confirmación | `8deb549` | #48–#51 | **Self-audit** (sin auditor externo). 2 majors en self-audit hotfixeados en #51: unique constraint en `matches` + logging de rollback fallido |
| Fase 7 | Resultado + goles por jugador | `1f39cd3` | #52–#54 | **Self-audit**. 1 major detectado: veedor no veía goles; fixeado en #54 (vista read-only) |
| Fase 8 | Cierre: home, boundaries, RLS tests, doc | (este PR) | — | **Self-audit**. Sin nuevos features, pulido + handoff |

---

## 3. Mapa de archivos críticos

### Seguridad / RLS / funciones SECURITY DEFINER

| Archivo | Función |
|---|---|
| `supabase/migrations/20260522182835_create_players.sql` | Schema players + triggers de inmutabilidad |
| `supabase/migrations/20260522183207_create_matches.sql` | Schema matches + match_teams + match_team_players + match_player_stats |
| `supabase/migrations/20260522183914_rls_convocatorias_matches.sql` | Policies RLS de toda Fase 2 |
| `supabase/migrations/*_approve_player_change_request.sql` | RPC SECURITY DEFINER que aplica cambios sensibles atomicamente |
| `supabase/migrations/20260523200000_convocatoria_players_delete_policy.sql` | Hotfix Fase 5: policy DELETE admin-only |
| `supabase/migrations/20260524100000_convocatorias_team_draft.sql` | Columna `team_draft` jsonb |
| `supabase/migrations/20260524110000_confirm_match_cleanup.sql` | RPC para rollback atómico de `confirmMatch` |
| `supabase/migrations/20260524130000_matches_unique_convocatoria.sql` | Hotfix Fase 6: previene matches duplicados por race |
| `lib/auth/require-role.ts` | Guard server-side de roles |

### Server actions (escritura)

| Archivo | Función |
|---|---|
| `app/(app)/jugadores/nuevo/actions.ts` | Crea `player_change_request` (no inserta player directo) |
| `app/(app)/jugadores/[id]/actions.ts` | Editar campos no sensibles, proponer cambios sensibles |
| `app/(app)/auditoria/actions.ts` | Aprobar / rechazar / flag de requests (invoca RPC) |
| `app/(app)/convocatorias/actions.ts` | Crear convocatoria |
| `app/(app)/convocatorias/[id]/actions.ts` | Agregar / quitar convocados, cancelar |
| `app/(app)/convocatorias/[id]/draft-actions.ts` | Generar / limpiar / swap / promote GK del draft |
| `app/(app)/convocatorias/[id]/confirm-actions.ts` | Confirmar match (4 inserts en cadena + rollback) |
| `app/(app)/convocatorias/[id]/result-actions.ts` | Cargar / editar resultado del partido |
| `app/(app)/convocatorias/[id]/goals-actions.ts` | Upsert goles por jugador |
| `app/(app)/lugares/actions.ts` | CRUD de lugares |

### Lógica de negocio (lib/)

| Archivo | Función |
|---|---|
| `lib/teams/generate.ts` | Algoritmo de generación de teams (greedy + balance) |
| `lib/teams/draft.ts` | Helpers de manipulación del draft persistido |

### Tests pgTAP

| Archivo | Cobertura |
|---|---|
| `supabase/tests/database/rls_phase2.sql` | RLS profiles, players, change_requests, audit_log |
| `supabase/tests/database/functions_phase2.sql` | approve/reject/flag con casos negativos |
| `supabase/tests/database/audit_private_notes.sql` | Trigger de audit_log para notas privadas |
| `supabase/tests/database/lugares_rls.sql` | RLS de lugares |
| `supabase/tests/database/convocatoria_players_delete_rls.sql` | Hotfix Fase 5: policy DELETE |
| `supabase/tests/database/matches_unique_convocatoria.sql` | Hotfix Fase 6: unique constraint |
| `supabase/tests/database/matches_rls.sql` | **Fase 8 nuevo**: RLS de matches + match_player_stats |

---

## 4. Suggestions deferidas

Hallazgos no-bloqueantes acumulados a lo largo de las fases que pueden tratarse post-MVP:

### Fase 3
- **S3.1** — Búsqueda por nombre + filtros rol/posición + paginación en `/jugadores`. Lista funcional pero crece poco escalable.

### Fase 6
- **S6.1** — `confirm_match_cleanup` solo limpia si la convocatoria sigue `abierta`. Si el rollback falla (RPC error), queda match huérfano. Hoy se logea + mensaje al usuario; podría hacerse cron de cleanup.

### Fase 7
- **S7.1** — Sin tests pgTAP para `result-actions` ni `goals-actions` (la lógica TS no se testea SQL-side). La RLS subyacente sí está cubierta en `matches_rls.sql` (Fase 8).
- **S7.2** — `saveMatchResult` no es atómico entre UPDATE de `matches` y UPDATE de `convocatorias.status`. Self-heals (la próxima carga reintenta), pero podría moverse a RPC para garantizar atomicidad.
- **S7.3** — No hay `audit_log` específico de cargas/ediciones de resultado y goles. Si en el futuro hay disputas, no hay trazabilidad de "quién cambió el resultado".
- **S7.4** — Race last-write-wins en `saveMatchResult` (dos admins simultáneos). Bajo riesgo en uso real.
- **S7.5** — `goalsFormTeams.score` asume `team_label === "A"` o `"B"`. Hoy hay constraint a A/B; si en el futuro hay más teams, frágil.

### Fase 8
- **S8.1** — QA mobile-first en device real pendiente. Tailwind tiene breakpoints definidos pero no se validó tap targets ni scroll en formularios largos.
- **S8.2** — Loading skeleton es genérico (no segmentado por página). Podría mejorarse con skeletons específicos por listado.

---

## 5. Test plan manual end-to-end

Checklist para QA pre-deploy. Ejecutar como admin y luego repetir flujos relevantes como veedor.

### Setup
- [ ] Existen 2 cuentas en Supabase Auth con roles `admin` y `veedor` en `profiles`.
- [ ] Login como admin funciona.
- [ ] Login como veedor funciona.
- [ ] Sin sesión: redirect a `/login`.
- [ ] Sesión sin rol: redirect a `/sin-rol`.

### Jugadores (admin)
- [ ] `/jugadores` lista jugadores con filtros por status.
- [ ] `/jugadores/nuevo` crea una `create_player` request (NO inserta player directo).
- [ ] Mensaje "Solicitud creada" aparece en `/jugadores?created=1`.
- [ ] `/jugadores/[id]` muestra todos los campos para admin (incluido `internal_score`).
- [ ] Editar `private_notes` y `positions_possible` aplica directo.
- [ ] Proponer cambio sensible crea request `update_sensitive_fields`.

### Auditoría (veedor)
- [ ] `/auditoria` muestra cola con tabs por tipo.
- [ ] Badge de pendientes aparece en header con count correcto.
- [ ] Aprobar request `create_player` crea el player (status approved).
- [ ] Aprobar request sensible aplica cambios al player.
- [ ] Veedor NO puede aprobar su propia request (error P0001 / mensaje claro).
- [ ] Rechazar request no toca el player.
- [ ] Flag request permite re-aprobación por otro veedor.
- [ ] Error `stale_request` muestra modal con explicación.

### Convocatorias (admin)
- [ ] `/convocatorias/nueva` crea convocatoria con fecha + hora + lugar + cupo.
- [ ] `/convocatorias/[id]` permite agregar jugadores approved.
- [ ] No se pueden agregar players con status ≠ approved.
- [ ] Filtros del selector (nombre, rol, posición) funcionan.
- [ ] Quitar convocado funciona (DELETE policy).
- [ ] Cancelar convocatoria la deja en status `cancelada` (irreversible).

### Generador y confirmación (admin)
- [ ] Botón "Generar teams" deshabilitado si < 10 convocados.
- [ ] Con ≥ 10 convocados, genera draft con balance summary.
- [ ] Warning aparece si no hay arqueros suficientes.
- [ ] Mover jugador entre A/B funciona y recalcula balance en vivo.
- [ ] Promote to GK funciona.
- [ ] Confirmar match crea: `matches` + `match_teams` + `match_team_players` + `balance_snapshots`.
- [ ] Convocatoria pasa a status `cerrada`.
- [ ] Vista de match reemplaza al draft después de confirmar.
- [ ] Si dos admins click "Confirmar" simultáneo, el segundo recibe error claro (unique constraint).

### Resultado y goles (admin)
- [ ] Cargar resultado (scores 0..99) transiciona convocatoria a `jugada`.
- [ ] Editar resultado funciona en estado `jugada`.
- [ ] Cargar goles por jugador hace upsert correcto.
- [ ] Warning aparece si suma de goles por team no matchea el score.

### Visibilidad como veedor
- [ ] Veedor ve `/jugadores`, `/convocatorias`, `/auditoria`, `/perfil`.
- [ ] Veedor NO ve botón "Nueva convocatoria" ni "Nuevo jugador".
- [ ] Veedor NO ve forms editables en `/convocatorias/[id]`.
- [ ] Veedor ve goles cargados en vista read-only.
- [ ] Veedor NO accede a `/lugares`.

### UI / errores
- [ ] Listados vacíos muestran mensaje útil.
- [ ] Páginas en carga muestran skeleton (`loading.tsx`).
- [ ] Error inesperado muestra pantalla de retry (`error.tsx`).
- [ ] Mobile (375px ancho): formularios scrolleables, tap targets ≥ 44px.

---

## 6. Comandos de verificación

```bash
# Type + lint + format + build
pnpm typecheck
pnpm lint
pnpm format:check
pnpm build

# Tests pgTAP (requiere supabase CLI + DB local o linked)
supabase test db

# Aplicar migrations a remote
pnpm db:push

# Regenerar types desde DB linked
pnpm db:types
```

---

## 7. Próximos pasos sugeridos (post-MVP)

1. **QA mobile real** en al menos un Android y un iOS reales.
2. **Deploy a Vercel** con env vars de Supabase prod.
3. **Vista player-facing inicial** — solo info neutral/positiva (matches jugados, goles, badges). Sin login todavía.
4. **Stats extendidas** — figura del partido, asistencias destacadas, leaderboard de goles.
5. **Historial filtrable** — vista `/partidos` con todos los partidos jugados, ordenados, con búsqueda.
6. **Atender suggestions deferidas** (sección 4 arriba) según prioridad.

---

## 8. Cómo correr una auditoría externa

1. Compartir este documento con el auditor.
2. Compartir acceso al repo (read-only suficiente).
3. Pedir foco en:
   - **Privacidad**: ¿hay algún path donde un rol vea data que no debería?
   - **RLS**: ¿se pueden bypassear policies?
   - **Atomicidad**: ¿hay race conditions reproducibles?
   - **Validación de inputs**: ¿server actions validan correctamente?
4. Esperar findings clasificados (blocker / major / suggestion).
5. Fixear blockers y majors antes de deploy.
