# Fase 9 — Onboarding del jugador y grupos recurrentes

Documento de diseño previo a la implementación. Captura las decisiones tomadas en la sesión de diseño del 2026-05-24 antes de empezar a programar.

**Estado**: borrador para revisión. PR 0 — no contiene código, solo este documento.

> **Actualización 2026-05-24**: descartamos Twilio + WhatsApp Business para el MVP de la fase. El onboarding pasa a ser **manual via WhatsApp común** (admin pega links) y el auth es **celular + password** (sin OTP). Detalle operativo en [`docs/onboarding-jugador.md`](onboarding-jugador.md). Los cambios aplicados a este doc están marcados en §5, §8 y §11.

---

## 1. Contexto y objetivo

El MVP (Fases 0–8) cerró con un sistema donde el **admin carga todos los datos del jugador** (incluyendo ratings) y el veedor aprueba. No existe interacción directa con el jugador: no hay login player-facing, no hay invitaciones, no hay self-service.

La Fase 9 introduce al **jugador como actor del sistema**: invitaciones por WhatsApp, signup con OTP, auto-gestión de asistencia, y un modelo de **grupo recurrente** con titulares y lista de espera FIFO.

### Por qué un grupo recurrente y no solo convocatorias

El grupo de fútbol existe como entidad continua: mismo lugar, mismo día, misma hora todas las semanas. Hay más interesados que cupo (12 titulares, varios suplentes). Las membresías persisten semana a semana: un titular no necesita aceptar cada semana, y un suplente no necesita re-anotarse. Esto requiere un nivel de modelo arriba de las convocatorias discretas.

---

## 2. Flujo operativo end-to-end

```
Admin crea un grupo:
  "Martes 20hs en La Cancha del Tano" — cupo 12 titulares.

Admin migra desde WhatsApp:
  Va a /grupos/[id]/importar.
  Pega lista: +5491155551234,Juan Pérez (uno por línea).
  Sistema genera invitaciones masivas (token por cada uno).
  Devuelve links: "Juan Pérez → https://app/invite/<token>".
  Admin copia y pega cada link al privado de WA (o al grupal).

Jugador recibe link y entra a /invite/<token> (pública, sin login):
  Ve: día, hora, lugar (botón "Abrir en Maps"), confirmados+invitados.
  Botones "Voy" / "No voy".

  "No voy" → token se quema, marca declinado, fin.

  "Voy" → flujo de signup (sin OTP):
    - Celular pre-cargado read-only desde el token.
    - Form datos básicos: nombre, fecha_nacimiento, rol_field, position_pref, positions_possible.
    - Jugador define un password en este mismo form (primer login).
    - Sistema crea user en auth.users con email sintético (<phone>@phone.fdlm.local) + password.
    - Sistema crea row en players: phone=X, auth_user_id=Y, status='pending', sin ratings.
    - Sistema agrega al grupo según vacante:
        * Si hay cupo libre de titular → titular.
        * Sino → al final de la cola FIFO de suplentes.
    - Sistema agrega a convocatoria_players con attendance='confirmado' (si todavía hay <8h del partido).

Admin recibe notif en cola "Sin ratings":
  Ve al jugador recién registrado.
  Asigna técnica/físico/mental/rating_confidence.
  Sistema crea request action_type='assign_initial_ratings'.

Veedor en /auditoria:
  Aprueba el request → players.status pasa a 'approved'.
  Jugador queda convocable para próximas semanas.

Próxima semana:
  Admin click "Clonar última convocatoria".
  Sistema toma los titulares activos del grupo + los que jugaron como reemplazo la semana anterior (attendance='confirmado').
  Todos quedan en attendance='confirmado' por default.
  La cola de suplentes del grupo PERSISTE entre convocatorias: vive en grupo_membresias, no se resetea. M sigue siendo #1, N sigue siendo #2, etc.
  Los suplentes no entran a convocatoria_players por default, pero quedan listos para ser promovidos automáticamente si algún titular se baja en esta nueva convocatoria.
  Si un suplente jugó como reemplazo la semana pasada, sigue siendo suplente del grupo con la misma posición FIFO.

Durante la semana, antes de 8h del partido:
  Cualquier titular se baja desde /mi-perfil → attendance='declinado'.
  Sistema ejecuta el SWAP de titularidad:
    - Primer suplente activo de la cola ASCIENDE a titular permanente del grupo.
    - Se agrega a convocatoria_players con attendance='confirmado'.
    - El titular que se bajó queda con membresía INACTIVA (sale del grupo activo: ni titular ni suplente).
    - La cola corre un puesto: N pasa a #1, O a #2, etc.
  Si el nuevo titular (ex-suplente) también declina antes del partido, el ciclo se repite con el próximo suplente activo.
  Admin puede revertir el swap manualmente si la baja del titular fue justificada (ej. emergencia). Restaura al titular original y baja al ex-suplente.

Dentro de las 8h previas al partido:
  Self-service bloqueado (UI + RLS).
  Solo el admin puede mover gente (bajar a alguien, promover un suplente saltando el FIFO, reordenar prioridades).
  Si un jugador no puede ir, avisa al admin por canal externo (WA grupal).

Después del partido:
  Las membresías del grupo reflejan los movimientos de la semana:
    - Suplentes que ascendieron quedan como titulares permanentes desde el próximo partido.
    - Titulares que se bajaron quedan inactivos: perdieron su lugar.
  Un titular que perdió su lugar puede volver al grupo desde /mi-perfil ("Anotarme en la cola"). Entra como suplente al final del FIFO (orden = max + 1).
```


---

## 3. Modelo de datos

### Tablas nuevas

#### `grupos`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `nombre` | text | "Martes 20hs Cancha del Tano" |
| `lugar_id` | uuid FK → lugares | |
| `dia_semana` | int (0–6) | 0=domingo, 6=sábado |
| `hora` | time | |
| `cupo_titulares` | int | default 12 |
| `owner_id` | uuid FK → profiles | admin que lo creó |
| `created_at` | timestamptz | |
| `status` | enum('activo','archivado') | |

#### `grupo_membresias`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `grupo_id` | uuid FK | |
| `player_id` | uuid FK | |
| `tipo` | enum('titular','suplente') | |
| `orden` | int | solo significa algo si tipo='suplente'; orden FIFO (1=primero) |
| `joined_at` | timestamptz | cuándo entró al grupo (titular o cola) |
| `status` | enum('activo','inactivo') | |
| `inactivated_at` | timestamptz | null si activo |
| `inactivated_by` | uuid | null si activo |

Constraints:
- `unique (grupo_id, player_id) where status='activo'`: un jugador no puede estar dos veces activo en el mismo grupo.
- `orden is not null when tipo='suplente'`: validado en server action o trigger.

#### `player_invitations`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `token` | text unique | URL-safe, generado al crear |
| `phone` | text | E.164 |
| `nombre_tentativo` | text | el nombre que el admin tipeó al invitar (opcional) |
| `grupo_id` | uuid FK | grupo al que se está invitando |
| `convocatoria_id` | uuid FK null | partido específico (puede ser null si el invite es solo para sumar al grupo) |
| `created_by` | uuid FK | admin o veedor |
| `created_at` | timestamptz | |
| `used_at` | timestamptz null | cuándo aceptó |
| `used_by_player_id` | uuid FK null | row de players creado al aceptar |
| `declined_at` | timestamptz null | cuándo dijo "No voy" |
| `expires_at` | timestamptz | c
omputado al crear: min(partido - 8h, cuando se llene el cupo) |

Estado derivado en queries:
- `pending`: used_at=null AND declined_at=null AND expires_at > now()
- `accepted`: used_at != null
- `declined`: declined_at != null
- `expired`: used_at=null AND declined_at=null AND expires_at <= now()

### Tablas modificadas

#### `players`
- `+ phone text null` (nullable para legacy)
- `+ auth_user_id uuid null FK auth.users(id)` (nullable para legacy + invitados sin aceptar)
- `+ fecha_nacimiento date null` (nullable solo durante la migración; después NOT NULL para los nuevos)
- `+ apodo text null` — sobrenombre opcional, visible entre miembros del grupo.
- `+ pierna_habil pierna_habil_enum null` — enum nuevo: `'derecha'`, `'izquierda'`, `'ambas'`. Opcional.
- `+ email text null` — backup de contacto / futura recuperación de password. `unique where email is not null`.
- `+ avatar_url text null` — referencia a Supabase Storage (bucket `avatars`). Opcional, lo sube el propio jugador.
- `+ ubicacion_maps_url text null` — link de Google Maps a su ubicación, lo pega el jugador. Útil para ver desde dónde viene cada uno.
- `- edad int` (eliminada después de migrar los datos)
- Constraints nuevos:
  - `unique (phone) where phone is not null`
  - `unique (email) where email is not null`

Enum nuevo: `pierna_habil_enum` con valores `'derecha'`, `'izquierda'`, `'ambas'`.

#### `lugares`
- `+ google_maps_url text null` — link de Google Maps que el admin pega manualmente.

#### `convocatorias`
- `+ grupo_id uuid null FK grupos(id)` — nullable para compat con convocatorias legacy del MVP.

#### `convocatoria_players`
- `attendance_status` default cambia de `'pendiente'` a `'confirmado'`.

#### Enum `user_role`
- `+ 'player'`

#### Enum `player_change_request.action_type`
- `+ 'assign_initial_ratings'`

---

## 4. Reglas operativas

### Regla del cutoff de las 8 horas

El sistema bloquea las acciones self-service de los jugadores dentro de las 8 horas previas al partido. La idea es darle al admin tiempo de coordinar reemplazos manualmente cuando ya no hay margen para que el FIFO se reorganice solo.

**Antes de 8h del partido:**
- Jugador puede cambiar su attendance desde `/mi-perfil`.
- Si un titular declina, el sistema promueve automáticamente al primer suplente activo de la cola.
- Si el suplente promovido declina, el sistema sigue con el siguiente.
- Token de invitación sigue válido (mientras no expire por otra razón).

**Dentro de las 8h previas:**
- UI esconde botón "No voy" en `/mi-perfil`.
- RLS bloquea UPDATE de `convocatoria_players.attendance_status` para role 'player'.
- Solo admin puede modificar: bajar gente, promover suplentes en cualquier orden, etc.
- Token de invitación expira (`expires_at = partido - 8h`).

### Swap de titularidad (regla clave)

Cuando un titular cambia su attendance a 'declinado' (antes de 8h del partido), **pierde su titularidad permanentemente**. El suplente que lo reemplaza asciende a titular del grupo desde ese partido. No es un reemplazo temporal, es un swap.

Pasos del swap automático:

1. Sistema busca primer suplente activo del grupo (`tipo='suplente'`, `status='activo'`, menor `orden`).
2. Verifica que no esté ya en la convocatoria (puede haber subido por otro decline anterior).
3. **Promueve la membresía del suplente**: `tipo='titular'` (mantiene `status='activo'`).
4. **Inactiva la membresía del titular original**: `status='inactivo'`, `inactivated_at=now()`, `inactivated_by=auth.uid()` (el propio jugador que se bajó).
5. **Reordena la cola**: los suplentes con `orden > orden_del_promovido` corren un puesto (`orden -= 1`).
6. Agrega al nuevo titular a `convocatoria_players` con `attendance='confirmado'`.
7. El nuevo titular lo ve en `/mi-perfil` la próxima vez que entre.

Si el nuevo titular también declina antes del partido, repite el ciclo con el siguiente suplente activo. Cada decline genera un swap nuevo.

Si todos los suplentes activos declinaron, la convocatoria queda con un hueco. El admin lo resuelve manualmente.

**Override del admin**: hasta el cierre del cupo o el cutoff de 8h, el admin puede revertir un swap si considera la baja del titular justificada (ej. emergencia médica). La reversión consiste en:

- Re-activar la membresía del titular original (`status='activo'`, `tipo='titular'`).
- Bajar al ex-suplente (volver a `tipo='suplente'`, ubicarlo en su posición original de la cola o donde el admin elija).
- Restaurar `convocatoria_players` para que el titular original quede confirmado.

El admin tiene poder god mode sobre las membresías; el sistema no le impide nada dentro de su grupo.

### Lista de espera FIFO

- Orden inicial: por `joined_at` (orden de entrada al grupo como suplente).
- **La cola es del grupo, no de la convocatoria.** Persiste semana a semana en `grupo_membresias`. Cada nueva convocatoria hereda la misma cola; no se resetea ni se recrea.
- Cuando un suplente asciende a titular (por swap o por baja permanente de otro), la cola se compacta: los que estaban detrás corren un puesto.
- Cuando un jugador nuevo acepta un invite: si hay vacante de titular activa, entra directo como titular; sino, al final de la cola de suplentes (`orden = max + 1`).
- **Anotarse en la cola** (auto-servicio): un jugador con membresía inactiva (típicamente, un ex-titular que perdió su lugar) puede re-entrar al grupo desde `/mi-perfil` → "Anotarme en la cola". Su membresía pasa a `status='activo'`, `tipo='suplente'`, `orden = max + 1`.

### Clonar última convocatoria

Botón "Clonar última" en la pantalla de creación de convocatoria del grupo.

- Pre-llena: lugar, fecha (próximo día_semana del grupo), hora.
- Convocados pre-cargados: los titulares activos del grupo (`grupo_membresias` con `tipo='titular'`, `status='activo'`).
  - Como los swaps de la semana pasada ya promovieron a los ex-suplentes a titulares, esto naturalmente incluye a quienes jugaron por reemplazo.
  - Los ex-titulares que perdieron su lugar quedaron inactivos y no son convocados (deben anotarse en la cola para volver).
- Admin revisa la lista y puede sacar/agregar antes de confirmar.
- Default attendance = 'confirmado' para todos.

### Salida permanente del grupo

Tres vías por las que una membresía puede pasar a `status='inactivo'`:

- **Jugador (voluntaria, explícita)**: en `/mi-perfil`, botón "Salir del grupo X". Confirma. Membresía → inactiva.
- **Jugador (involuntaria, por swap)**: titular se baja de una convocatoria → pierde su lugar automáticamente (regla del swap). Membresía → inactiva.
- **Admin**: en `/grupos/[id]`, puede remover a un miembro manualmente. Misma consecuencia.

En cualquiera de los tres casos, si la membresía inactivada era de un titular, el primer suplente activo asciende a titular y la cola corre un puesto. Si era de un suplente, simplemente desaparece de la cola y los que estaban detrás corren un puesto.

### Volver al grupo después de quedar inactivo

Un jugador con membresía inactiva puede re-entrar al grupo:

- Vía auto-servicio desde `/mi-perfil` → botón "Anotarme en la cola del grupo X".
- Entra como suplente al final del FIFO (`orden = max + 1`).
- Si quiere volver a ser titular, tiene que esperar a que alguno se baje y le toque ascender.

Esto le da una "segunda chance" al jugador sin que el admin tenga que intervenir.

---

## 5. Auth y roles

### Nuevo rol: `player`

Se suma al enum `user_role` (antes solo admin/veedor).

### Login

- Vía **celular + password**. Sin OTP, sin SMS, sin WhatsApp Business.
- Implementación: Supabase Auth con email/password. Internamente se usa un **email sintético** derivado del celular: `<phone>@phone.fdlm.local`. El jugador nunca lo ve ni lo tipea.
- Onboarding manual: el admin reparte los links de invitación copiándolos al WhatsApp común. El detalle operativo (mensajes sugeridos, recovery de password, checklist) está en [`docs/onboarding-jugador.md`](onboarding-jugador.md).
- Recovery de password en Fase 9: manual desde Supabase Dashboard (admin setea pass temporal). Plan B futuro: magic link al email opcional del jugador si configuramos SMTP.
- Si en el futuro el grupo escala o se necesitan notificaciones automáticas, retomamos Twilio + WhatsApp Business. El modelo de datos ya está preparado (phone + auth_user_id) para hacer ese cambio sin migración.

### Identidad

- `players.phone` es la clave de identidad del jugador (1 cel = 1 jugador).
- `players.auth_user_id` linkea con `auth.users.id` cuando el jugador se registra.
- Legacy (players sin phone ni auth_user_id) siguen existiendo: admin los gestiona manualmente como en el MVP.

### Estados del player

| Estado | phone | auth_user_id | Fila en `player_invitations` | Cómo se gestiona |
|---|---|---|---|---|
| Legacy | NULL | NULL | n/a | Admin lo carga manualmente (form `/jugadores/nuevo`) |
| Invitado | (en invite) | n/a | sí | Admin lo invitó, todavía no aceptó. No hay row en `players`. |
| Registrado | X | Y | n/a (ya aceptó) | Self-service en `/mi-perfil` |

---

## 6. Privacidad

### Qué ve cada rol

| Recurso | Admin | Veedor | Player (registrado) |
|---|---|---|---|
| Sus propios datos básicos (nombre, fecha_nac, posición, apodo, pierna, ubicación, foto) | sí | sí | sí (edita libre nombre/pass/posición/apodo/pierna/email/foto/ubicación) |
| Su propio email | sí | sí | sí (lo edita) |
| `internal_score`, technical/physical/mental de sí mismo | sí | sí | **NO** |
| `private_notes` de sí mismo | sí | sí | **NO** |
| Datos básicos de otros jugadores del grupo (nombre, fecha_nac, edad, posición, apodo, pierna, foto, ubicación) | sí | sí | sí (solo de jugadores de sus grupos) |
| Email de otros jugadores | sí | sí | **NO** (es contacto privado, no se expone entre miembros) |
| Ratings de otros jugadores | sí | sí | **NO** |
| Lista de cola FIFO con nombres | sí | sí | sí (de sus grupos) |
| Convocatorias y resultados | sí | sí | sí (de sus grupos) |
| Goles propios | sí | sí | sí |
| Goles de otros jugadores | sí | sí | sí (en match_player_stats del grupo) |
| `audit_log` | sí | sí | **NO** |
| `player_change_requests` de otros | sí (las que él pidió) | sí (todas, para revisar) | **NO** |

### Implementación técnica de la visibilidad cruzada entre jugadores

Player ve datos de **otros jugadores del mismo grupo**, pero solo columnas safe (no ratings).

PostgreSQL no soporta RLS column-level directamente. Dos opciones:

**Opción A: View `players_public`**
- View con SELECT de columnas safe: `id, nombre, fecha_nacimiento, role_field, position_pref, positions_possible, status, apodo, pierna_habil, avatar_url, ubicacion_maps_url`.
- **NO incluye**: `email, phone, technical, physical, mental, internal_score, private_notes, rating_confidence`.
- RLS sobre la view que permite SELECT al player si comparte grupo activo con la row.
- Los queries del frontend para player apuntan a esta view, no a `players`.

**Opción B: Función SECURITY DEFINER**
- `get_grupo_miembros(grupo_id)` retorna lista safe.
- Más controlado pero menos ergonómico.

Decisión: **Opción A** (view + RLS). Más declarativo, mejor integración con PostgREST.

---

## 7. Migración de datos

### Players actuales (MVP, 5 rows de QA)

El usuario decidió migrar la columna `edad` a `fecha_nacimiento`:
- Para cada player con `edad` no null: `fecha_nacimiento = make_date(extract(year from current_date)::int - edad, 1, 1)`.
- Es una aproximación (1 de enero del año calculado). Los jugadores podrán corregirla en `/mi-perfil` cuando se registren.
- La columna `edad` se elimina después de migrar.

Los players actuales no tienen `phone` ni `auth_user_id`. Quedan como **legacy**: admin los sigue gestionando manualmente. Si en el futuro queremos que se autoregistren, podemos invitarlos uno por uno con su teléfono.

### Migración bulk desde WhatsApp

Pantalla nueva: `/grupos/[id]/importar` (admin only).

UX:
- Textarea con instrucción: "Pegá una línea por jugador con formato `+telefono,Nombre`."
- Admin pega 12, 30, 50 líneas.
- Submit.

Procesamiento:
- Por cada línea válida:
  - Parsear teléfono (validar E.164 o convertir).
  - Si el teléfono ya existe en `players.phone` → saltea con warning "Ya está registrado".
  - Sino → crea row en `player_invitations` con token único, phone, nombre tentativo, grupo_id, expires_at calculado.
- Devuelve tabla:
  - Aceptadas: nombre + link generado (admin copia y manda por WA).
  - Salteadas: nombre + razón.

No crea rows en `players`. Eso ocurre cuando cada jugador acepta su invite individual.

---

## 8. Roadmap de PRs

Aproximación: ~13 PRs. Granularidad mixta según criterio: schema/RLS/SECURITY DEFINER van separados, UI puede bundlearse.

| # | PR | Tipo | Por qué separado |
|---|---|---|---|
| 0 | **Este documento de diseño** | Doc | No es código, es la fuente de verdad |
| 1 | Schema base: grupos, grupo_membresias, player_invitations, columnas en players/lugares/convocatorias, role 'player', action_type 'assign_initial_ratings', default attendance, migración edad → fecha_nacimiento | Migration + RLS base | Riesgo alto de DB, va solo |
| 2 | View `players_public` + RLS column-level + ajuste de `compute_internal_score` para leer fecha_nacimiento | RLS + RPC | Toca privacidad crítica, va solo |
| 3 | ~~Setup Twilio WhatsApp~~ → doc operativo de onboarding manual (`docs/onboarding-jugador.md`) | Docs | Mergeado como PR #60. Plan A descartado: vamos con onboarding manual + auth por celular+password |
| 4 | UI admin: crear/listar/editar grupos + membresías + cola FIFO | UI admin | Bundle de UI |
| 5 | UI admin: import bulk desde WA (`/grupos/[id]/importar`) | UI admin | Bundle de UI |
| 6 | Server action `createInvitation` desde convocatoria (form individual) + cola de invites pendientes | Backend admin | Backend nuevo, va separado |
| 7 | `/invite/<token>` página pública con info del partido y botones Voy/No voy | UI pública | Primera ruta pública, va separado |
| 8 | Signup desde /invite/<token>: form con password + creación de auth user (email sintético) + alta a players + membresía de grupo + login automático. Incluye `/login` aceptando celular+password. | Auth + backend | Crítico, va separado |
| 9 | `/mi-perfil` (datos básicos editables — incluye apodo/pierna_habil/email/ubicación + upload de foto a Supabase Storage + próxima convocatoria con "No voy" + historial + posición en cola del grupo) | UI player + Storage | Bundle de UI player. Crea bucket `avatars` con RLS de Storage acá. |
| 10 | "Clonar última convocatoria" + UI admin para movimientos manuales dentro de las 8h | UI admin | Bundle de UI |
| 11 | Promoción automática del suplente cuando titular declina (server action + trigger según convenga) | Backend lógica | Algoritmo nuevo, va separado |
| 12 | RPC `assign_initial_ratings` SECURITY DEFINER + integración con cola del veedor | Backend + audit | SECURITY DEFINER va separado |
| 13 | Tests pgTAP completos: RLS player, grupos, membresías, invites, promoción FIFO, view players_public | Tests | Cierra la fase |

PR 14 (post-fase): audit externo y self-audit.

---

## 9. Decisiones técnicas pendientes

Estas no bloquean el arranque pero hay que resolverlas durante la fase:

1. **Cómo se gatilla la promoción automática del suplente**: trigger en `convocatoria_players` AFTER UPDATE de attendance, o server action explícita llamada desde la UI del jugador. Trade-off: trigger es más robusto (cualquier UPDATE lo dispara) pero más opaco; server action es más visible pero salteable si alguien hace UPDATE directo. Recomendación: server action por consistencia con el resto del proyecto, dejar el trigger como suggestion futuro.

2. **Cómo se calcula `expires_at` del invite cuando cambian las condiciones**: si el cupo se llena después de crear el invite, ¿el `expires_at` se actualiza? Probablemente sí, vía trigger en `convocatoria_players` que detecta cuando conf_count = cupo y marca los invites pending como expirados. O alternativamente, calcular `expires_at` dinámicamente en cada SELECT (más caro, más simple).

3. **Notificación al jugador cuando es promovido desde la cola**: hoy decidimos "el jugador se entera entrando a `/mi-perfil`". Pero si el jugador no entra hasta el día del partido, no va a saber. ¿Vale la pena un push notification / WA message automático cuando alguien es promovido? Por ahora **no**, está fuera del scope. Lo dejo como suggestion post-fase.

4. **Visibilidad de fecha_nacimiento completa entre jugadores**: el usuario decidió "todos los miembros del grupo ven fecha+edad del otro". La fecha completa (día/mes/año) es PII más sensible que la edad sola. **Suggestion**: en una fase posterior, considerar mostrar solo día/mes (para cumpleaños) y ocultar el año, salvo a admin/veedor.

5. **Edge case del legacy player que se quiere registrar**: si un player legacy (sin phone) quiere ahora autoregistrarse, ¿cómo se linkea? Opción: admin invita al legacy con su teléfono, el jugador acepta y el sistema linkea por nombre+otros datos. Mejor manejarlo como flow manual del admin, no automatizar el merge.

---

## 10. Lo que NO entra en Fase 9

- Vista para "no-jugadores" (familiares, fans). Sigue siendo grupo cerrado.
- Notificaciones push.
- Leaderboards de goles o badges.
- Vista de jugador a otro jugador (perfil público entre miembros) que vaya más allá de los datos básicos del grupo.
- Auto-notificación a suplente promovido (queda en `/mi-perfil` only).
- Stats avanzadas (asistencias, figura del partido, etc).
- Multi-deportes o variantes de fútbol distintas (5, 7, 11). Asumimos el formato actual.

Esos quedan para fases posteriores si se necesitan.

---

## 11. Próximos pasos operativos

1. **Vos**: leer este doc tranquilo, marcar lo que no convenza o falte.
2. **Vos**: si todo OK, decir "arrancamos" → se empieza por PR 1.
3. Con el pivot a onboarding manual ya **no hay trámite externo bloqueante**. Todos los PRs siguientes (5 → 13) pueden encadenarse sin esperar a terceros.
4. PR 8 (signup + login celular+password) ya no depende de Twilio; requiere `SUPABASE_SERVICE_ROLE_KEY` disponible en server actions para crear users desde el token de invite.

---

## Glosario

- **Convocatoria**: evento concreto de un día específico (ej. 14/oct martes a las 20hs).
- **Grupo**: entidad recurrente que agrupa convocatorias semanales del mismo lugar/día/hora.
- **Membresía**: relación persistente jugador↔grupo, con tipo (titular o suplente) y orden (FIFO si suplente).
- **Token**: string único en `player_invitations` que actúa como capability para acceder a `/invite/<token>`.
- **Legacy player**: jugador cargado en el MVP sin phone ni auth, gestionado manualmente.
- **Cutoff de 8h**: límite antes del partido a partir del cual el self-service se bloquea y solo el admin opera.
