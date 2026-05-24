# Onboarding del jugador — flujo manual via WhatsApp

Plan A para Fase 9: cero integración con WhatsApp Business / Twilio / SMS. El admin reparte los links de invitación copiándolos al WhatsApp grupal (o al privado) a mano. Cada jugador hace signup desde su link y crea su propio password en el primer acceso.

> Las decisiones de modelo de datos, RLS y reglas operativas viven en [`docs/fase-9-diseno.md`](fase-9-diseno.md). Este doc cubre solamente cómo se onboardea al jugador en producción.

---

## 1. Resumen

**Stack final (Fase 9):**
- Sin Twilio, sin Meta Business, sin OTP por WhatsApp ni SMS.
- Identidad del jugador: **celular en E.164** (1 cel = 1 jugador).
- Distribución del link: **WhatsApp común**, manual. El admin pega los links generados por el sistema en el chat grupal o en privados.
- Auth: Supabase Auth con email + password. El email del jugador es **sintético** y se deriva de su celular: `+5491155551234@phone.fdlm.local`. El jugador nunca lo ve ni lo tipea — se loguea con celular + password.

**Costo:** USD 0. No hay terceros pagos involucrados.

**Trade-offs aceptados:**
- Más fricción operativa para el admin: tiene que copiar/pegar cada link manualmente.
- Sin verificación automática del número (no hay OTP). Si el admin pega bien el celular en el import bulk, el invite llega al jugador correcto; si lo pega mal, llega al equivocado o no llega. **Mitigación**: el admin manda el link al privado del jugador en WA, así si el celular es válido el link va a la persona correcta por construcción.
- Recovery de password: si el jugador lo olvida, por ahora se resuelve por canal externo (avisa al admin → admin resetea desde la consola de Supabase). En una fase futura agregamos magic link por email si el jugador cargó un email opcional.

**Plan futuro (no en Fase 9):** si el grupo crece o el ruido operativo molesta, retomamos Twilio + WhatsApp Business API. El diseño deja el celular como clave única para que migrar a OTP por WA sea un cambio de capa de auth sin tocar datos.

---

## 2. Flujo end-to-end del onboarding

```
Admin → /grupos/[id]/importar
  Pega lista: "+5491155551234,Juan Pérez" (uno por línea, 12-50 entradas típico).
  Submit.

Sistema:
  Por cada línea válida (E.164 + nombre):
    - Si phone ya existe en players.phone → skip con warning.
    - Sino → crea row en player_invitations (token único, phone, nombre_tentativo, grupo_id, expires_at).
  Devuelve tabla con:
    - Aceptadas: nombre + link "https://app.tld/invite/<token>" copiable.
    - Salteadas: nombre + razón.

Admin:
  Copia cada link.
  Lo pega en el chat privado de WhatsApp con el jugador, o lo arma como mensaje individual del chat grupal.
  (Sugerencia de texto: "Hola Juan, te sumo al grupo del martes. Confirmá acá: <link>")

Jugador en WhatsApp:
  Recibe el link.
  Click → abre /invite/<token> en el navegador.

/invite/<token> (página pública, sin login):
  Sistema valida token (vía función get_invite_by_token, SECURITY DEFINER).
  Muestra: día, hora, lugar, mapa, cupos ocupados/libres.
  Botones grandes: "Voy" / "No voy".

  "No voy" → marca declined_at en el invite, fin.

  "Voy" → flujo de signup en una sola pantalla:
    - Celular (read-only, viene del token).
    - Nombre (pre-cargado con nombre_tentativo, editable).
    - Fecha de nacimiento.
    - Rol (arquero / jugador de campo / mixto).
    - Posición preferida.
    - Password (nuevo, mín 8 chars). Confirmación.
    - Email (opcional — útil para recovery futuro).
    - Submit.

Sistema (server action):
  - Verifica token vigente.
  - Construye email sintético: lower(phone) + "@phone.fdlm.local".
  - Crea user en auth.users (admin API o supabase.auth.signUp) con email sintético + password.
  - Crea row en players: phone, auth_user_id, nombre, fecha_nacimiento, role_field, position_pref, email (si lo cargó), status='pending', sin ratings.
  - Crea row en profiles vinculada al auth_user_id, role='player'.
  - Agrega membresía al grupo según vacante:
      * Hay cupo libre titular → tipo='titular'.
      * Sino → al final de la cola de suplentes (tipo='suplente', orden = max+1).
  - Si hay convocatoria activa para ese grupo en los próximos 7 días → inserta convocatoria_players con attendance='confirmado'.
  - Marca invite.used_at, used_by_player_id.
  - Loguea al jugador (set session).
  - Redirect a /mi-perfil.

Admin:
  Ve en su cola "Jugadores sin ratings" al recién registrado.
  Le asigna técnica/físico/mental/rating_confidence.
  Sistema crea player_change_request action_type='assign_initial_ratings'.

Veedor en /auditoria:
  Aprueba → players.status pasa a 'approved'.
  Jugador queda convocable para próximas semanas.
```

---

## 3. Login del jugador (segunda vez y siguientes)

Página `/login` ya existe para admin/veedor (email + password). Para el jugador agregamos un toggle o una página gemela `/login` que acepta **celular + password**.

Implementación (PR 8):
1. Frontend recibe celular en formato libre, normaliza a E.164.
2. Server action arma email sintético: `<phone>@phone.fdlm.local`.
3. Llama `supabase.auth.signInWithPassword({ email: emailSintetico, password })`.
4. Si funciona, redirect a `/mi-perfil`.
5. Si falla, mensaje genérico "Celular o contraseña incorrectos" (no diferenciar para evitar enumeration).

El jugador **nunca tipea** ni ve el email sintético. Si en el futuro carga su email real desde `/mi-perfil`, ese queda en `players.email` y sirve solo para recovery / contacto — no es su login.

---

## 4. Recovery de password (Fase 9)

Para el MVP de Fase 9 no hay self-service de recovery por mail (porque hace falta SMTP configurado en Supabase Auth, y queremos cero terceros).

Flujo manual:
1. Jugador avisa al admin por WhatsApp: "no me acuerdo la pass".
2. Admin entra a Supabase Dashboard → Authentication → Users → busca por el email sintético (o por phone si el dashboard lo permite) → setea una pass temporal.
3. Admin avisa la pass temporal al jugador por WA. Jugador entra, va a `/mi-perfil` → Cambiar password.

Es feo pero es para un grupo de 30 personas y un admin involucrado; no justifica setup de SMTP todavía.

**Plan B futuro** (post-Fase 9): si el jugador cargó email real en `players.email`, ofrecer reset por magic link a ese email (requiere configurar SMTP en Supabase — Resend, Postmark, etc. — pero ya no bloquea el arranque).

---

## 5. Variables de entorno

No agrega ninguna nueva. Las que ya están:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (necesaria en PR 8 para crear users desde server action sin pasar por OTP).

---

## 6. Sugerencia de mensaje para el admin al copiar el link

Plantilla para pegar en WhatsApp privado o grupal:

```
Hola {{nombre}}, te invito al grupo "{{grupo}}".
Confirmá tu lugar y completá tus datos acá:
{{link}}

(Si no podés esta semana, igual entrá al link y elegí "No voy", así sé que lo viste.)
```

El link es de un solo uso por jugador. Si el invite expira (cupo lleno o pasaron 8h del partido), el botón "Voy" se desactiva en la página pública con un mensaje claro.

---

## 7. Checklist de done para Fase 9 (con este flujo)

Cuando todos estos puntos estén implementados y mergeados, el onboarding manual está operativo:

- [ ] PR 5 — `/grupos/[id]/importar` con textarea + bulk creation de `player_invitations`.
- [ ] PR 6 — Server action `createInvitation` individual desde el detalle de convocatoria + cola de invites pendientes en la UI admin.
- [ ] PR 7 — Página pública `/invite/<token>` con info del partido + botones Voy / No voy.
- [ ] PR 8 — Signup en `/invite/<token>` (form de datos básicos + password) + creación de auth user con email sintético + alta a `players` + membresía de grupo + login automático.
- [ ] PR 8 — Modificación de `/login` para aceptar también celular + password (traduce a email sintético internamente).
- [ ] PR 9 — `/mi-perfil` con cambio de password + edición de datos básicos + lista de próximas convocatorias.

---

## 8. Cuándo retomar Twilio/WhatsApp Business

Disparadores que justificarían reactivar el plan original:
- Grupo crece > 80 jugadores y el copy/paste de links se vuelve insostenible.
- Aparecen muchos casos de "no recibí el link" → un OTP automático elimina esa fricción.
- El admin se cansa de resetear passwords manualmente.
- Hay demanda de notificaciones automáticas (recordatorio de partido, "fuiste promovido a titular", etc.) — entonces WhatsApp Business deja de ser solo OTP y se vuelve un canal de notificación.

Si llega ese momento, el cambio es de capa de auth (Supabase phone provider + Twilio) sin tocar el modelo de datos. El diseño actual ya tiene `players.phone` como clave única y `auth_user_id` linkeable a cualquier provider.

---

## 9. Estado

**Plan A: onboarding manual por WhatsApp común. Sin terceros pagos.**
Fecha de decisión: 2026-05-24.
