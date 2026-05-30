# Audit handoff — Fase 9 post-prod (7 bugs)

Documento de cierre de la tanda de bugs reportados tras el primer uso productivo en
prod, para revisión por auditor. Generado 2026-05-30.

---

## 1. Contexto

El 2026-05-27, tras el primer uso real con jugadores en producción, se reportaron
**7 bugs/propuestas**. Se resolvieron fase por fase (con GO explícito y validación en
local por bug), en este orden:

- **Fase A** → bugs 1 y 2 (PR #93)
- **Fase B** → bug 5 (PR #94)
- **Fase C** → bug 3 (PR #95)
- **Fase D1** → bug 4 (PR #96)
- **Fase D2** → bugs 6 y 7 (PR #97)
- **Tests de regresión** de las RPCs nuevas (PR #98)

Todos mergeados a `main`. CI (`db-tests` pgTAP + `verify` + Vercel) en verde en cada PR.

---

## 2. Resumen por bug

| # | Bug | Fix | Tipo | PR |
|---|-----|-----|------|----|
| 1 | El generador de equipos incluía suplentes (armaba 7v6). | `loadConvocadosForGenerator` filtra `rol_en_convocatoria='titular'` y excluye declinados. Solo titulares entran al balance. | Frontend | #93 |
| 2 | La auto-renovación re-leía `grupo_membresias` y podía cambiar el roster. | `close_and_create_next_convocatoria` copia **estrictamente** desde la conv anterior (no-declinados), sin JOIN al grupo. El trigger de sync ya mantiene el roster al día con las bajas. | Migración (SECURITY DEFINER) | #93 |
| 5 | Las convocatorias canceladas quedaban persistidas sin aportar al historial. | `cancelConvocatoria` pasa de `UPDATE status='cancelada'` a `DELETE` + redirect. Nueva policy RLS de DELETE (admin, solo `abierta`). Limpieza one-time de canceladas legacy. UI: sin tab "Canceladas" ni manejo de ese estado en /mi-perfil. | Migración (RLS) + Frontend | #94 |
| 3 | El reset de password no llegaba al jugador (su `auth.email` es sintético `@phone.fdlm.local`). | `/recuperar`: si el email matchea `players.email`, se genera el link de recovery con `admin.generateLink` contra el auth.email sintético y se envía al email real vía Resend API (app-level). Admin/veedor siguen por flujo nativo. Anti-enumeración. | Server + nueva infra de email | #95 |
| 4 | Al confirmar el match no se creaba la próxima convocatoria. | Nueva RPC `create_next_convocatoria` (worker sin guardas de cierre, admin-only); `close_and_create_next_convocatoria` delega en ella; `confirmMatch` la llama best-effort. | Migración (SECURITY DEFINER) + Server | #96 |
| 6 | Label confuso para anotarse a la conv. | Estado único "Me anoto" en `no_anotado_convo` (decisión de producto: sin distinguir primera vez vs retorno). | Frontend | #97 |
| 7 | El jugador no veía los equipos confirmados del próximo partido. | Nueva RPC `get_my_confirmed_match_teams` (SECURITY DEFINER, **solo datos neutrales** — nombre, apodo, is_goalkeeper; **sin scores**). Render de 2 columnas en /mi-perfil. | Migración (SECURITY DEFINER) + Frontend | #97 |

---

## 3. Mapa de archivos críticos (para auditar)

### Migraciones (SECURITY DEFINER / RLS) — prioridad de auditoría

| Archivo | Qué hace | Punto de atención |
|---|---|---|
| `supabase/migrations/20260605100000_fase9_close_next_no_regroup.sql` | Reescribe `close_and_create_next_convocatoria` sin re-leer el grupo. | Que la copia del roster sea exacta y no arrastre declinados. |
| `supabase/migrations/20260605110000_fase9_no_persistir_canceladas.sql` | Policy RLS `convocatorias_delete_admin` (admin + `status='abierta'`) + limpieza de canceladas legacy. | **DELETE habilitado** en convocatorias: la USING limita a `abierta`; `cerrada`/`jugada` no se borran (además `matches.convocatoria_id` es FK `ON DELETE RESTRICT`). |
| `supabase/migrations/20260606100000_fase9_auto_create_next_on_confirm.sql` | RPC `create_next_convocatoria` (worker) + `close_and_create_next_convocatoria` delega. | **Admin-only** vía `current_user_role()='admin'` interno. Idempotencia: chequeo de "abierta posterior". |
| `supabase/migrations/20260606110000_fase9_get_my_confirmed_match_teams.sql` | RPC que expone equipos confirmados al jugador. | **Privacidad**: devuelve solo datos neutrales, nunca `internal_score`. Scope: solo grupos donde el caller es miembro activo (`current_player_id()`). |

### Server actions (escritura) y server-only

| Archivo | Función | Punto de atención |
|---|---|---|
| `app/(app)/convocatorias/[id]/draft-actions.ts` | Generador: fuente filtrada a titulares no-declinados. | — |
| `app/(app)/convocatorias/[id]/actions.ts` | `cancelConvocatoria` ahora hace DELETE + redirect. | El guard de `status='abierta'` y la RLS son defensa en profundidad. |
| `app/(app)/convocatorias/[id]/confirm-actions.ts` | Llama a `create_next_convocatoria` best-effort tras confirmar. | Si falla, el match queda confirmado igual (se loguea). |
| `app/(auth)/recuperar/actions.ts` | Resolución player → link de recovery → envío al email real. | **Anti-enumeración**: mensaje genérico siempre. Usa `createAdminClient` (service role). |
| `lib/email/recovery.ts` | Envío vía Resend API (fetch). Server-only. | Lee `RESEND_API_KEY`/`RESEND_FROM`. Escapa HTML del link. |
| `app/(app)/mi-perfil/page.tsx` | Render de equipos confirmados + label "Me anoto". | Consume la RPC neutral; nunca lee `matches`/`match_teams` directo. |

### Tests pgTAP

| Archivo | Cubre |
|---|---|
| `supabase/tests/database/create_next_convocatoria.sql` | forbidden no-admin, crea +7d, hereda roster sin declinados, no duplica, null si `auto_renovar=false`. |
| `supabase/tests/database/get_my_confirmed_match_teams.sql` | jugador del grupo ve ambos equipos del match futuro, arquero marcado, excluye match pasado, vacío si no es miembro. |
| `supabase/tests/database/convocatoria_players_delete_rls.sql` | (actualizado) admin puede DELETE conv `abierta`, no `cerrada`. |

---

## 4. Decisiones de diseño relevantes

- **Bug 3 (enfoque A):** se eligió enviar el link de recovery por Resend a nivel app
  (no tocar el login por celular). Alternativa descartada: alinear `auth.email` al email
  real y resolver el login celular→email vía RPC (más riesgo de lockout + backfill).
- **Bug 5 (DELETE vs status):** el enum `convocatoria_status` conserva el valor
  `cancelada` por compatibilidad; simplemente se deja de producir filas con ese estado.
  La RLS de DELETE se restringe a `abierta` por defensa en profundidad.
- **Bug 7 (RPC neutral):** `matches`/`match_teams`/`match_team_players` son SELECT
  admin+veedor por RLS y `balance_snapshot` incluye `internal_score`. La RPC
  SECURITY DEFINER expone solo lo neutral, alineado con la privacidad del CLAUDE.md.
- **Bug 4 (best-effort):** confirmar el match es lo crítico; la auto-creación de la
  próxima no debe revertirlo si falla.

---

## 5. Riesgos conocidos / a revisar por el auditor

1. **Rate-limit del reset por email:** el envío vía Resend (Bug 3) no tiene rate-limit
   propio (igual que el path público de Supabase). Posible abuso: spamear /recuperar con
   un email de jugador conocido. Sugerencia: throttle por IP/email.
2. **`RESEND_*` en prod:** sin `RESEND_API_KEY`/`RESEND_FROM` el reset del jugador no
   envía (falla silencioso, solo log). Verificar que estén en Vercel.
3. **`create_next_convocatoria` admin-only:** confiar en `current_user_role()` dentro de
   la RPC. Verificar que ningún caller no-admin pueda invocarla con efecto.
4. **Tipos generados a mano:** las firmas de las 2 RPCs nuevas se agregaron a mano en
   `lib/supabase/database.types.ts`; conviene un `pnpm db:types` post-deploy para
   formalizarlas contra la base real.

---

## 6. Test plan manual end-to-end

> Requiere las 4 migraciones aplicadas y `RESEND_*` configuradas.

**Bug 1 — generador:** conv con titulares + suplentes → generar equipos → solo titulares
en el balance (sin 7v6); marcar un titular declinado y regenerar → excluido.

**Bug 2 — auto-renov manual:** cerrar una conv vencida con el botón de ciclo → la próxima
hereda exacto titulares+suplentes no-declinados.

**Bug 4 — auto-renov al confirmar:** confirmar match de un grupo con `auto_renovar` →
queda `cerrada` y aparece la próxima (+7d, abierta). No duplica. Grupo sin auto_renovar /
sin grupo → no crea.

**Bug 5 — cancelar:** cancelar una conv `abierta` → confirma → desaparece del listado y de
/mi-perfil; no queda en ningún tab.

**Bug 3 — reset jugador:** jugador con `players.email` cargado → /recuperar con ese email
→ llega el mail; abrir el link en otro dispositivo → /reset-password logueado. Email
inexistente → mismo mensaje genérico, sin mail.

**Bug 6 — label:** jugador en el grupo pero no en el roster de la conv abierta → botón
"Me anoto".

**Bug 7 — equipos:** confirmar match → como jugador del grupo, /mi-perfil muestra
"Equipos del próximo partido" (A/B, vos resaltado, sin números/scores).

---

## 7. Comandos de verificación

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm build
# Tests pgTAP (requiere supabase CLI + DB):
supabase test db
# Aplicar migraciones a prod:
pnpm db:push
# Regenerar types desde la base (post-deploy):
pnpm db:types
```

---

## 8. Pendientes operativos (no de código)

- [ ] Confirmar que las 4 migraciones nuevas están aplicadas en prod:
  `20260605100000`, `20260605110000`, `20260606100000`, `20260606110000`.
- [ ] `RESEND_API_KEY` + `RESEND_FROM` cargadas en Vercel (Production).
- [ ] `pnpm db:types` post-deploy para formalizar las firmas de las RPCs nuevas.
