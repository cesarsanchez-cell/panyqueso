# Roadmap del MVP en Linear — Pan y Queso

Guía operativa para cargar el proyecto en Linear. Pegar / crear manualmente.
Referencia maestra: `plan.txt` v4 (raíz del repo).

> **Nota sobre prefijo**: Linear genera el prefijo del team automáticamente. Asumo `FUT-`. Si tu team usa otro (p. ej. `MAR-`, `FDM-`), reemplazá `FUT-` por el real al referenciar issues en commits.

---

## 0. Pre-requisitos en Linear

1. **Workspace** existente.
2. **Team**: crear team "Pan y Queso" (prefijo sugerido `FUT`).
3. **Integración GitHub** → Settings → Integrations → GitHub → autorizar.
4. **Repo vinculado**: en la config del team, agregar `cesarsanchez-cell/panyqueso` como repo del team. Esto habilita:
   - Cierre automático de issues con `Closes FUT-123` / `Fixes FUT-123` en PRs.
   - Linkeo automático de branches que tengan el ID en el nombre.
   - Cambio de estado al abrir/mergear PRs.
5. **Project**: crear un Project nuevo en el team: **"Pan y Queso"**.
   - Description: copiar el primer párrafo de `plan.txt`.
   - Target date: a definir.
   - Lead: vos.

---

## 1. Labels a crear (una sola vez)

**Fases** (color sugerido: degradé azul → verde):
- `fase-0` — Setup
- `fase-1` — Auth y roles
- `fase-2` — Modelo de datos + RLS
- `fase-3` — Gestión de jugadores
- `fase-4` — Veedor / auditoría
- `fase-5` — Convocatorias
- `fase-6` — Generador de equipos
- `fase-7` — Resultado y stats
- `fase-8` — Pulido

**Áreas** (color violeta):
- `area:auth`
- `area:db`
- `area:rls`
- `area:funciones-sql`
- `area:ui`
- `area:algoritmo`
- `area:tests`
- `area:infra`

**Tipos** (color gris):
- `tipo:setup`
- `tipo:feature`
- `tipo:bugfix`
- `tipo:test`
- `tipo:doc`
- `tipo:auditoria`

**Especiales** (color rojo):
- `gate` — issue que bloquea avance hasta auditoría externa
- `seguridad-critica` — RLS / funciones SECURITY DEFINER / inmutabilidad de datos sensibles

---

## 2. Convención de branches y commits

Branches:
```
cesar/FUT-123-nombre-corto
```

Commits (Conventional Commits + ID Linear):
```
feat(scope): FUT-123 descripcion corta

Detalle si hace falta.
```

PRs:
- Título: `FUT-123 — feat: …`
- Body: incluir `Closes FUT-123` para cierre automático al mergear.

---

## 3. Issues por fase

Formato: cada bloque es una issue. Copiar Título y Descripción en Linear, agregar Labels.

---

### Fase 0 — Setup ✅ DONE

Cargar estas issues directamente en estado **Done** (no las trabajamos, ya están hechas; sirven para tener histórico).

#### Setup Next.js 15 + TypeScript + Tailwind v4
**Labels**: `fase-0`, `area:infra`, `tipo:setup`
**Descripción**:
Bootstrap del proyecto: Next 15 App Router, React 19, TS estricto (`noUncheckedIndexedAccess`), Tailwind v4 vía `@tailwindcss/postcss`. Verificado con `pnpm build`.

#### Estructura de carpetas /lib y /db
**Labels**: `fase-0`, `area:infra`, `tipo:setup`
**Descripción**:
Crear `lib/{scoring,team-generator,change-requests,supabase,auth}` y `db/{migrations,functions,policies,tests}` con `.gitkeep`. Estructura según plan v4 sección 1.

#### Lint, format y CI mínimo
**Labels**: `fase-0`, `area:infra`, `tipo:setup`
**Descripción**:
ESLint flat config (`next/core-web-vitals` + `next/typescript`), Prettier, EditorConfig. Workflow CI con `typecheck` + `lint` en push/PR a main.

#### Fix: mover cafile a .npmrc user-level
**Labels**: `fase-0`, `area:infra`, `tipo:bugfix`
**Descripción**:
El `.npmrc` del repo tenía un path absoluto local que rompía CI en Ubuntu. Cafile movido a `~/.npmrc` del usuario; el `.npmrc` del repo se eliminó.

#### Audit Fase 0
**Labels**: `fase-0`, `tipo:auditoria`, `gate`
**Descripción**:
Auditoría externa con múltiples iteraciones. Bloqueantes resueltos en orden:
1. `.npmrc` del repo con path absoluto local rompía CI → movido a `~/.npmrc` user-level.
2. Workflow corría Node 20; pnpm 11 requiere Node ≥22.13 → subido a Node 22 vía `.nvmrc`.
3. CI no validaba deploy readiness (solo typecheck + lint) → agregados `format:check` y `build`.

GO para Fase 1 solo cuando todos esos majors cerraron.

---

### Fase 1 — Auth y roles

#### Cliente Supabase: server + browser helpers
**Labels**: `fase-1`, `area:auth`, `tipo:setup`
**Descripción**:
Crear `lib/supabase/server.ts` y `lib/supabase/client.ts` con los helpers de `@supabase/ssr`. Tipos generados desde la DB.

#### Migración: tabla `profiles`
**Labels**: `fase-1`, `area:db`, `tipo:feature`
**Descripción**:
`profiles (id FK auth.users, nombre, role enum admin|veedor, created_at)`. Trigger para auto-crear profile al signup. RLS: cada uno su perfil; admin+veedor leen todos.

#### Middleware de auth y guardia de rol
**Labels**: `fase-1`, `area:auth`, `tipo:feature`
**Descripción**:
`middleware.ts` que refresca sesión y redirige `/login` si no hay sesión. Helper `requireRole(role)` para Server Components.

#### Página `/login` con email + password
**Labels**: `fase-1`, `area:ui`, `area:auth`, `tipo:feature`
**Descripción**:
Form simple con Zod, Server Action de login, manejo de errores. Sin signup público.

#### Layout `(app)` protegido por rol
**Labels**: `fase-1`, `area:ui`, `area:auth`, `tipo:feature`
**Descripción**:
Layout que valida sesión, carga profile, expone rol a children. Redirect a `/login` si no autenticado.

#### Página `/perfil` para cambiar password
**Labels**: `fase-1`, `area:ui`, `area:auth`, `tipo:feature`
**Descripción**:
Form de cambio de password vía Supabase Auth. No expone otros datos sensibles.

#### Crear cuentas admin y veedor (operativo)
**Labels**: `fase-1`, `tipo:doc`
**Descripción**:
Tarea operativa: vos creás los 2 usuarios en Supabase Auth dashboard, asignás `role` en `profiles`. Documentar el procedimiento en `docs/`. Requisito del plan: 2 cuentas DISTINTAS.

#### Audit Fase 1
**Labels**: `fase-1`, `tipo:auditoria`, `gate`
**Descripción**:
Gate de fase. Auditoría externa verifica que: login funciona, redirects por rol correctos, no hay signup público, `service_role` no se filtra al cliente.

---

### Fase 2 — Modelo de datos + RLS + funciones ⚠️ FASE CRÍTICA

> El auditor marcó esta fase como la más sensible. Cuidado especial con RLS, funciones SECURITY DEFINER y tests negativos.

#### Migración: tabla `players`
**Labels**: `fase-2`, `area:db`, `tipo:feature`, `seguridad-critica`
**Descripción**:
Todas las columnas del plan v4 sección 2. `internal_score` mantenido por trigger. INSERT directo bloqueado.

#### Migración: tabla `player_change_requests`
**Labels**: `fase-2`, `area:db`, `tipo:feature`, `seguridad-critica`
**Descripción**:
Estructura completa con `action_type`, `old_values`/`proposed_values` JSONB, CHECK `reviewed_by ≠ requested_by`, status enum.

#### Migración: tabla `audit_log`
**Labels**: `fase-2`, `area:db`, `tipo:feature`
**Descripción**:
INSERT solo desde funciones SECURITY DEFINER. SELECT admin+veedor. UPDATE/DELETE bloqueado.

#### Migración: convocatorias + convocatoria_players
**Labels**: `fase-2`, `area:db`, `tipo:feature`
**Descripción**:
Estructura del plan v4. FK a `players` con check de `status=approved` al insertar en `convocatoria_players`.

#### Migración: matches + match_teams + match_team_players + match_player_stats
**Labels**: `fase-2`, `area:db`, `tipo:feature`
**Descripción**:
Estructura del plan v4 incluyendo `confirmed_with_warning`, `balance_snapshot`, `algorithm_version`.

#### Función `compute_internal_score`
**Labels**: `fase-2`, `area:funciones-sql`, `tipo:feature`
**Descripción**:
Pura, sin acceso a tablas. Implementa la fórmula de factor_edad + scoring del plan v4 sección 5.

#### Función `approve_player_change_request`
**Labels**: `fase-2`, `area:funciones-sql`, `tipo:feature`, `seguridad-critica`
**Descripción**:
SECURITY DEFINER atómica. Valida rol veedor, estado pending/flagged, `requested_by≠auth.uid()`, staleness en updates, aplica cambio según `action_type`, marca approved, escribe `audit_log`.

#### Función `reject_player_change_request`
**Labels**: `fase-2`, `area:funciones-sql`, `tipo:feature`, `seguridad-critica`
**Descripción**:
Marca status='rejected' con `reviewed_by=auth.uid()`. NO toca players. Escribe audit_log.

#### Función `flag_player_change_request`
**Labels**: `fase-2`, `area:funciones-sql`, `tipo:feature`, `seguridad-critica`
**Descripción**:
Marca status='flagged'. NO toca players. Permite re-aprobación/rechazo posterior por otro veedor distinto del requester.

#### Trigger: inmutabilidad de campos sensibles en `players`
**Labels**: `fase-2`, `area:rls`, `tipo:feature`, `seguridad-critica`
**Descripción**:
BEFORE UPDATE rechaza cambios a technical/physical/mental/edad/status/role_field/position_pref/rating_confidence si el caller no es la función de aprobación.

#### Trigger: normalización en INSERT de `player_change_requests`
**Labels**: `fase-2`, `area:rls`, `tipo:feature`, `seguridad-critica`
**Descripción**:
BEFORE INSERT fuerza `status='pending'`, anula `reviewed_by/reviewed_at/review_comment/created_player_id` independientemente de lo que mande el cliente.

#### Trigger: inmutabilidad post-decisión
**Labels**: `fase-2`, `area:rls`, `tipo:feature`, `seguridad-critica`
**Descripción**:
Una vez `status IN ('approved','rejected')`, ninguna columna admite UPDATE. Flagged sí puede transicionar a approved/rejected.

#### RLS policies: profiles, players, player_change_requests, audit_log
**Labels**: `fase-2`, `area:rls`, `tipo:feature`, `seguridad-critica`
**Descripción**:
Policies según plan v4 sección 6. Insert directo en players BLOQUEADO. Update directo en change_requests BLOQUEADO.

#### RLS policies: convocatorias, matches, match_*
**Labels**: `fase-2`, `area:rls`, `tipo:feature`
**Descripción**:
SELECT admin+veedor; INSERT/UPDATE solo admin; DELETE bloqueado.

#### Tests de RLS
**Labels**: `fase-2`, `area:tests`, `tipo:test`, `seguridad-critica`
**Descripción**:
Lista del plan v4 sección 6 — todos los escenarios negativos: admin no puede UPDATE sensible, admin no puede INSERT en players, veedor no aprueba la suya, anónimo no accede, request approved es inmutable.

#### Tests de funciones SECURITY DEFINER
**Labels**: `fase-2`, `area:tests`, `tipo:test`, `seguridad-critica`
**Descripción**:
Por función: approve/reject/flag con casos OK, request inexistente, request no-pending, requester==reviewer, stale_request (old_values cambió), rol incorrecto.

#### Audit Fase 2 ⚠️ GATE CRÍTICO
**Labels**: `fase-2`, `tipo:auditoria`, `gate`, `seguridad-critica`
**Descripción**:
Auditoría externa con foco en RLS, funciones SECURITY DEFINER, triggers de inmutabilidad. NO avanzar a Fase 3 si hay bloqueantes/mayores. El auditor pidió cuidado especial acá.

---

### Fase 3 — Gestión de jugadores

#### Pantalla `/jugadores` (listado)
**Labels**: `fase-3`, `area:ui`, `tipo:feature`
**Descripción**:
Listado paginado con filtros por status (approved/inactive), role_field, position_pref. Búsqueda por nombre. Muestra `internal_score` solo a admin/veedor.

#### Pantalla `/jugadores/nuevo`
**Labels**: `fase-3`, `area:ui`, `tipo:feature`
**Descripción**:
Form que NO inserta en `players`. Crea `player_change_request` action_type=create_player con motivo obligatorio. Mensaje: "queda pendiente de aprobación del veedor".

#### Pantalla `/jugadores/[id]` (detalle)
**Labels**: `fase-3`, `area:ui`, `tipo:feature`
**Descripción**:
Datos, score, historial de change_requests (approved/rejected/flagged), notas privadas. Banner si hay request pending.

#### Acción "proponer cambio sensible"
**Labels**: `fase-3`, `area:ui`, `tipo:feature`
**Descripción**:
Modal/página que crea `update_sensitive_fields` request con motivo obligatorio. Muestra qué campos están en pending.

#### Acción "desactivar / reactivar jugador"
**Labels**: `fase-3`, `area:ui`, `tipo:feature`
**Descripción**:
Crea `deactivate_player` o `reactivate_player` request. Motivo obligatorio.

#### Edición de campos no sensibles
**Labels**: `fase-3`, `area:ui`, `tipo:feature`
**Descripción**:
`private_notes` y `positions_possible`: aplican directo. Cada edit escribe `audit_log` con actor + old/new truncado.

#### Audit Fase 3
**Labels**: `fase-3`, `tipo:auditoria`, `gate`
**Descripción**:
Gate de fase. Verifica: jugadores no se crean directo, edición sensible solo vía requests, audit_log se llena.

---

### Fase 4 — Veedor / auditoría

#### Pantalla `/auditoria` con tabs
**Labels**: `fase-4`, `area:ui`, `tipo:feature`
**Descripción**:
Tabs: Altas pendientes / Cambios de ratings / Activación-Desactivación / Partidos con alerta / Historial.

#### Acciones Aprobar / Rechazar / Flag
**Labels**: `fase-4`, `area:ui`, `area:auth`, `tipo:feature`
**Descripción**:
Server Actions que invocan `approve_/reject_/flag_player_change_request`. Manejo de errores SQL específicos.

#### Manejo de error `stale_request`
**Labels**: `fase-4`, `area:ui`, `tipo:feature`
**Descripción**:
Modal explicativo cuando `old_values` ya no coincide con valores actuales. Ofrece refrescar y revisar.

#### Manejo de error "no podés aprobar tu propia request"
**Labels**: `fase-4`, `area:ui`, `tipo:feature`
**Descripción**:
Mensaje claro. UI puede ocultar el botón también pero la función SQL es la línea de defensa.

#### Badge de pendientes en dashboard
**Labels**: `fase-4`, `area:ui`, `tipo:feature`
**Descripción**:
Veedor: cantidad de requests sin resolver. Admin: cantidad de sus requests en pending.

#### Audit Fase 4
**Labels**: `fase-4`, `tipo:auditoria`, `gate`
**Descripción**:
Gate de fase. Verifica flujo end-to-end: admin propone, veedor aprueba/rechaza/flag, errores manejados.

---

### Fase 5 — Convocatorias

#### Pantalla `/convocatorias` (listado)
**Labels**: `fase-5`, `area:ui`, `tipo:feature`
**Descripción**:
Tabs por status: abiertas / cerradas / jugadas / canceladas.

#### Pantalla `/convocatorias/nueva`
**Labels**: `fase-5`, `area:ui`, `tipo:feature`
**Descripción**:
Form: fecha, notas, selección inicial de jugadores (solo `status=approved`).

#### Pantalla `/convocatorias/[id]`
**Labels**: `fase-5`, `area:ui`, `tipo:feature`
**Descripción**:
Gestión de asistencia. Cambio de `attendance_status`. Botón "generar equipos" deshabilitado si confirmados < 10.

#### Validación: solo jugadores approved son convocables
**Labels**: `fase-5`, `area:rls`, `tipo:test`
**Descripción**:
DB-level CHECK + RLS + tests.

#### Audit Fase 5
**Labels**: `fase-5`, `tipo:auditoria`, `gate`

---

### Fase 6 — Generador de equipos

#### 🚦 GATE PREVIO: Pesos w1..w7 + test cases
**Labels**: `fase-6`, `area:algoritmo`, `tipo:doc`, `gate`
**Descripción**:
Entregable previo a UI. Documento con: pesos iniciales con justificación, ~8 test cases (10 jugadores 5v5, 12v12, impar 11, 0/1/2 arqueros, alerta fuerte, posiciones desbalanceadas, mayores con buen físico). Auditoría obligatoria antes de codear UI (compromiso del plan v4).

#### Audit pesos + test cases
**Labels**: `fase-6`, `tipo:auditoria`, `gate`

#### `lib/scoring`: compute_internal_score TS
**Labels**: `fase-6`, `area:algoritmo`, `tipo:feature`
**Descripción**:
Implementación TS + tests de paridad con `compute_internal_score` SQL (mismos inputs → mismo output).

#### `lib/team-generator`: snake draft + swap refining
**Labels**: `fase-6`, `area:algoritmo`, `tipo:feature`
**Descripción**:
Snake draft por score desc; hill climbing acotado (≤200 iter, determinista con seed). Tests unitarios.

#### `lib/team-generator`: detección de arqueros y reemplazos
**Labels**: `fase-6`, `area:algoritmo`, `tipo:feature`
**Descripción**:
Lógica de 0/1/2+ arqueros y `was_keeper_replacement` para candidatos. Tests con cada caso.

#### `lib/team-generator`: balance_meta y alertas
**Labels**: `fase-6`, `area:algoritmo`, `tipo:feature`
**Descripción**:
Cálculo de diff_score, diff_pct, distribución por posición, warnings (<5%, 5–10%, ≥10%, posición desbalanceada, sin arquero). Tests por umbral.

#### Pantalla generador: propuesta + balance + alertas
**Labels**: `fase-6`, `area:ui`, `tipo:feature`

#### Pantalla generador: botones "mover a equipo X"
**Labels**: `fase-6`, `area:ui`, `tipo:feature`
**Descripción**:
Mover jugadores con botones (mecanismo principal según [SUG-1]). Recalc en vivo de balance_meta.

#### Modal de confirmación con alerta fuerte
**Labels**: `fase-6`, `area:ui`, `tipo:feature`
**Descripción**:
Si `diff_pct ≥ 10%`, modal explícito al confirmar. Setea `confirmed_with_warning=true`.

#### Persistencia: balance_snapshot + algorithm_version
**Labels**: `fase-6`, `area:db`, `tipo:feature`
**Descripción**:
Al confirmar partido: guardar snapshot completo (jugadores, scores, balance, alertas, decisión humana, confirmed_by, algorithm_version) en `matches`.

#### Audit Fase 6
**Labels**: `fase-6`, `tipo:auditoria`, `gate`

---

### Fase 7 — Resultado y stats básicas

#### Carga de resultado y goles
**Labels**: `fase-7`, `area:ui`, `tipo:feature`
**Descripción**:
Form post-partido: score por equipo, ganador (auto-calculado), goles por jugador en `match_player_stats`, notas opcionales.

#### Visualización de partido jugado
**Labels**: `fase-7`, `area:ui`, `tipo:feature`
**Descripción**:
Vista read-only con equipos finales, score, goles, link al `balance_snapshot`. Indicador `confirmed_with_warning` si aplica.

#### Audit Fase 7
**Labels**: `fase-7`, `tipo:auditoria`, `gate`

---

### Fase 8 — Pulido

#### Mobile-first: revisión exhaustiva
**Labels**: `fase-8`, `area:ui`, `tipo:feature`
**Descripción**:
Layouts, tap targets ≥44px, breakpoints, scroll en formularios largos. Probar en celular real.

#### Estados vacíos, errores, loading
**Labels**: `fase-8`, `area:ui`, `tipo:feature`
**Descripción**:
Cada listado vacío con CTA. Cada error con mensaje útil. Cada async con loading state.

#### Revisión final de privacidad
**Labels**: `fase-8`, `area:ui`, `tipo:test`, `seguridad-critica`
**Descripción**:
Búsqueda exhaustiva de filtración de ratings/scores/notas en lugares indebidos. Auditar logs del servidor también.

#### Revisión final de RLS
**Labels**: `fase-8`, `area:rls`, `tipo:test`, `seguridad-critica`
**Descripción**:
Re-correr todos los tests de RLS contra DB con datos reales del MVP. Verificar que no se filtró nada en producción.

#### Audit Fase 8 + preparación deploy
**Labels**: `fase-8`, `tipo:auditoria`, `gate`
**Descripción**:
Gate final. Si pasa, conectar a Vercel y deployar a producción.

---

## 4. Estado inicial sugerido

Al cargar todo en Linear:

- Fase 0: todas las issues en **Done** (excepto si querés re-auditar).
- Fase 1: todas en **Backlog**, salvo "Cliente Supabase: server + browser helpers" que podés pasar a **Todo** apenas tengas GO de Fase 1.
- Fases 2–8: **Backlog**.
- Issues con label `gate`: marcarlas con prioridad **High** y bloqueantes (Linear permite marcar issues como blockers de otras).

## 5. Próximos pasos operativos

1. Crear team + project + labels en Linear.
2. Cargar las issues (puede hacerse con Linear CLI / API si querés batchearlo, pero pegándolas manualmente está bien para esta cantidad).
3. Vincular branches del repo con IDs de issue (Linear lo detecta automáticamente si el branch contiene `FUT-N`).
4. Cuando llegue GO de Fase 1, mover "Cliente Supabase: server + browser helpers" a **In Progress** y arrancar.
