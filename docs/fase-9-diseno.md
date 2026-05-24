# Fase 9 — Onboarding del jugador y grupos recurrentes

Documento de diseño previo a la implementación. Captura las decisiones tomadas en la sesión de diseño del 2026-05-24 antes de empezar a programar.

**Estado**: borrador para revisión. PR 0 — no contiene código, solo este documento.

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

  "Voy" → flujo de signup:
    - Confirma teléfono → OTP por WhatsApp (Twilio Sender) → valida.
    - Form datos básicos: nombre, fecha_nacimiento, rol_field, position_pref, positions_possible.
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
  Los suplentes esperan en la cola, no entran a la convocatoria todavía.

Durante la semana, antes de 8h del partido:
  Cualquier titular se baja desde /mi-perfil → attendance='declinado'.
  Sistema promueve automáticamente al primer suplente disponible.
  Si el suplente no puede esa semana, declina y el sistema sigue con el siguiente.

Dentro de las 8h previas al partido:
  Self-service bloqueado (UI + RLS).
  Solo el admin puede mover gente (bajar a alguien, promover un suplente saltando el FIFO, reordenar prioridades).
  Si un jugador no puede ir, avisa al admin por canal externo (WA grupal).

Después del partido:
  Membresías del grupo no cambian. Titulares siguen titulares, suplentes mantienen su orden FIFO.
  Si un titular se baja del grupo (no solo de una semana), el primer suplente activo asciende a titular fijo.
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
| `expires_at` | timestamptz | computado al crear: min(partido - 8h, cuando se llene el cupo) |

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
- `- edad int` (eliminada después de migrar los datos)
- Constraint nuevo: `unique (phone) where phone is not null`

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

### Promoción automática del suplente

Cuando un titular cambia su attendance a 'declinado' (antes de 8h):

1. Sistema busca primer suplente activo del grupo (menor `orden` con `tipo='suplente'` y `status='activo'`).
2. Verifica que no esté ya en la convocatoria (puede haber subido por otro decline anterior).
3. Lo agrega a `convocatoria_players` con attendance='confirmado'.
4. El suplente lo ve en `/mi-perfil` la próxima vez que entre.

**El suplente promovido mantiene su orden FIFO en el grupo.** Jugar como reemplazo no le cuesta posición.

Si el suplente promovido declina, el ciclo se repite con el siguiente.

Si todos los suplentes activos declinaron, la convocatoria queda con un hueco. El admin lo resuelve manualmente (invitar a alguien nuevo, dejar el equipo corto, etc.).

### Lista de espera FIFO

- Orden inicial: por `joined_at` (orden de entrada al grupo como suplente).
- Suplente que jugó como reemplazo: mantiene su posición.
- Cuando un titular se baja del grupo permanentemente: primer suplente activo asciende a titular fijo, los demás suplentes se reordenan (cada uno sube un puesto).
- Cuando un jugador nuevo acepta un invite: si hay vacante de titular activa, entra directo como titular; sino, al final de la cola de suplentes (`orden = max + 1`).

### Clonar última convocatoria

Botón "Clonar última" en la pantalla de creación de convocatoria del grupo.

- Pre-llena: lugar, fecha (próximo día_semana del grupo), hora.
- Convocados pre-cargados: todos los que tuvieron `attendance_status='confirmado'` en la última convocatoria del grupo.
  - Esto incluye titulares que jugaron + suplentes que jugaron como reemplazo.
  - Excluye declinados y ausentes_sin_aviso.
- Admin revisa y crea.

### Salida permanente del grupo

Dos vías:
- **Jugador**: en `/mi-perfil`, botón "Salir del grupo X". Confirma. Su membresía pasa a `status='inactivo'`.
- **Admin**: en `/grupos/[id]`, puede remover a un miembro. Misma consecuencia.

Cuando un titular sale del grupo, el primer suplente activo asciende a titular automáticamente. Los demás suplentes corren un puesto.

---

## 5. Auth y roles

### Nuevo rol: `player`

Se suma al enum `user_role` (antes solo admin/veedor).

### Login

- Vía OTP por WhatsApp.
- Implementación: Supabase Auth con phone provider + Twilio WhatsApp Sender.
- Setup operativo previo (documentado aparte en `docs/twilio-whatsapp-setup.md`):
  1. Crear cuenta Twilio.
  2. Aprobar un WhatsApp Sender en Meta Business (lleva días, depende de Meta).
  3. Crear template de OTP aprobado por Meta.
  4. Configurar credenciales en Supabase Auth dashboard.

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
| Sus propios datos básicos | sí | sí | sí (puede editar nombre/pass/posición) |
| `internal_score`, technical/physical/mental de sí mismo | sí | sí | **NO** |
| `private_notes` de sí mismo | sí | sí | **NO** |
| Datos básicos de otros jugadores del grupo (nombre, fecha_nacimiento, edad, posición) | sí | sí | sí (solo de jugadores de sus grupos) |
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
- View con SELECT de columnas safe (id, nombre, fecha_nacimiento, role_field, position_pref, positions_possible, status).
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
| 3 | Setup Twilio WhatsApp + Supabase Auth phone provider (+ doc operativo) | Config + docs | Bloqueante operacional, depende de Meta |
| 4 | UI admin: crear/listar/editar grupos + membresías + cola FIFO | UI admin | Bundle de UI |
| 5 | UI admin: import bulk desde WA (`/grupos/[id]/importar`) | UI admin | Bundle de UI |
| 6 | Server action `createInvitation` desde convocatoria (form individual) + cola de invites pendientes | Backend admin | Backend nuevo, va separado |
| 7 | `/invite/<token>` página pública con info del partido y botones Voy/No voy | UI pública | Primera ruta pública, va separado |
| 8 | Signup OTP WA + creación de player + alta automática a grupo (titular o cola) | Auth + backend | Crítico, va separado |
| 9 | `/mi-perfil` (datos básicos editables + próxima convocatoria con "No voy" + historial + posición en cola del grupo) | UI player | Bundle de UI player |
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
3. **En paralelo** (porque depende de Meta y tarda): vos arrancás el trámite de Twilio + WhatsApp Sender mientras yo avanzo con PR 1–2 que no dependen de eso.
4. PR 3 (config Twilio) se mergea cuando vos tengas las credenciales aprobadas. PRs 4–6 pueden avanzar sin Twilio porque son UI y backend sin auth player. PR 7 (signup) bloquea hasta tener Twilio operativo.

---

## Glosario

- **Convocatoria**: evento concreto de un día específico (ej. 14/oct martes a las 20hs).
- **Grupo**: entidad recurrente que agrupa convocatorias semanales del mismo lugar/día/hora.
- **Membresía**: relación persistente jugador↔grupo, con tipo (titular o suplente) y orden (FIFO si suplente).
- **Token**: string único en `player_invitations` que actúa como capability para acceder a `/invite/<token>`.
- **Legacy player**: jugador cargado en el MVP sin phone ni auth, gestionado manualmente.
- **Cutoff de 8h**: límite antes del partido a partir del cual el self-service se bloquea y solo el admin opera.
