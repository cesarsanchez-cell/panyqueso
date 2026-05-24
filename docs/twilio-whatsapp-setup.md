# Setup operativo: OTP por WhatsApp via Twilio + Supabase Auth

Guía paso a paso para habilitar el login del jugador con código OTP enviado por WhatsApp. Este setup es **bloqueante para PR 8 (signup OTP del jugador)** y depende de aprobaciones de Meta que pueden tardar días. **Empezá lo antes posible.**

> Las decisiones técnicas y el flujo de signup están documentados en [`docs/fase-9-diseno.md`](fase-9-diseno.md) §5.

---

## 1. Resumen y costos

**Stack final:**
- Twilio como provider de mensajes.
- Twilio WhatsApp Business API como canal de envío.
- Supabase Auth (provider "phone") consumiendo Twilio.

**Costos aproximados (Argentina, mayo 2026):**
- Twilio: ~USD 0.005/mensaje WhatsApp para conversaciones de servicio.
- Sin costo fijo mensual de Twilio (paga por uso).
- WhatsApp Business API: sin costo de Meta para "service conversations" iniciadas por el usuario en las primeras 24h. Las OTPs entran en esta categoría.
- Para el MVP con ~20-30 invitaciones iniciales: USD 0.10 - 0.20 totales.

**Plan B si Meta tarda mucho:**
Si la aprobación de WhatsApp tarda > 1 semana, lanzamos con **SMS via Twilio** en lugar de WhatsApp. Setup más rápido (sin Meta), costo similar (~USD 0.04/SMS en AR), y la migración a WhatsApp después es un cambio de config sin tocar código. La sección 7 cubre este path alternativo.

---

## 2. Paso 1: cuenta de Twilio

1. Andá a [twilio.com](https://www.twilio.com) → "Sign up free".
2. Verificá tu mail y teléfono.
3. En el onboarding, Twilio te pregunta para qué lo vas a usar — elegí "Two-factor authentication" o "Verify users".
4. Cargá una tarjeta de crédito en **Console → Billing → Manage Billing**. Twilio te da créditos de trial pero para WhatsApp Production necesitás cuenta paga.
5. Anotá del Console dashboard:
   - **Account SID** (formato `AC...`)
   - **Auth Token** (clickeás "Show" para revelarlo)

**Estos dos valores van a Supabase Auth (paso 5).**

---

## 3. Paso 2: Meta Business Manager

WhatsApp Business API requiere que tu marca esté registrada en Meta Business.

1. Andá a [business.facebook.com](https://business.facebook.com).
2. Click "Create Account". Pedís:
   - Nombre del business: "Futbol de los martes" (o lo que prefieras).
   - Tu nombre y email.
3. Una vez creado, andá a **Settings → Business Info** y completá:
   - Dirección física (vale tu dirección personal).
   - País.
   - Sitio web (podés poner el URL de Vercel cuando lo tengas; si no, cualquier dominio tuyo).
4. **Verificación de business** (opcional pero recomendado para conversaciones ilimitadas): subí documentos que prueben la legitimidad del business. Para MVP con < 1000 mensajes/mes no es necesario.

**Anotá: tu Meta Business ID** (en Settings, arriba a la izquierda).

---

## 4. Paso 3: vincular Twilio con WhatsApp via Meta

Este es el paso más lento. Twilio tiene un wizard que automatiza la mayoría:

1. En Twilio Console: **Messaging → Senders → WhatsApp senders**.
2. Click "Get started" o "Add WhatsApp sender".
3. Te pide vincular con un número de teléfono para WhatsApp:
   - **Opción A (recomendada para MVP)**: usar un número de Twilio nuevo. Twilio te ofrece números de Argentina (+54) — comprá uno (~USD 1.50/mes).
   - **Opción B**: traer tu propio número. Más complejo, requiere portar.
4. Twilio te lleva al wizard de aprobación de Meta:
   - Te pide vincular con tu Business Manager (paso 2).
   - Te pide elegir el "Display name" que va a aparecer en WhatsApp para los receptores. Sugerencia: "Futbol de los martes".
   - Te pide categoría — elegí "Other" o "Sports".
5. Submit. **A partir de acá, Meta revisa. Tarda entre 1 hora y 3 días según carga.**

Mientras esperás, podés seguir con los siguientes pasos del proyecto.

---

## 5. Paso 4: aprobar un template de OTP

Mientras Meta aprueba tu sender, Twilio te pide aprobar un **mensaje template** específico para OTPs. WhatsApp no permite mandar cualquier texto: solo templates pre-aprobados.

1. En Twilio Console: **Messaging → Content Builder** (o "Content Template Builder").
2. Click "Create new content".
3. Tipo: **Authentication Template**.
4. Nombre: `futbol_otp` (sin espacios ni mayúsculas).
5. Idioma: español (es).
6. Categoría: **Authentication** (NO "Marketing" — los OTPs van en authentication).
7. Cuerpo del mensaje:
   ```
   Tu código de Futbol de los martes es {{1}}. No lo compartas con nadie. Vence en 5 minutos.
   ```
   - El `{{1}}` es el placeholder donde se inyecta el código.
8. Submit para aprobación. **Authentication templates suelen aprobarse en minutos** (no días).

**Anotá: el Content SID** del template (formato `HX...`). Lo vas a necesitar.

---

## 6. Paso 5: configurar Supabase Auth

Una vez que Twilio te confirme que el WA sender está aprobado, conectalo a Supabase:

1. Andá al dashboard de tu proyecto Supabase → **Authentication → Providers**.
2. Buscá **Phone** y abrí el panel.
3. Toggle "Enable phone signups" → **ON**.
4. SMS Provider: seleccioná **Twilio**.
5. Completá:
   - **Twilio Account SID**: el del paso 1.
   - **Twilio Auth Token**: el del paso 1.
   - **Twilio Message Service SID o Phone Number**: el número WA que aprobaste (formato `+5491155551234`).
6. Buscá la sección **"Send OTP via WhatsApp"** (debería aparecer al usar Twilio):
   - Toggle ON.
   - Pegá el **Content SID** del template del paso 4.
7. **Otp Expiry**: ponelo en 300 segundos (5 minutos), coincide con lo que dice el template.
8. **Otp Length**: 6 dígitos.
9. Save.

---

## 7. Paso 6: testear el flujo

Antes de que yo construya PR 8 (signup), validá manualmente que el envío funciona:

1. En el dashboard de Supabase → **Authentication → Users** → "Add user".
2. Phone: tu teléfono real con formato E.164 (`+5491155551234`).
3. Email: dejá vacío.
4. Click "Send invite".
5. **Te debe llegar un mensaje de WhatsApp con el código OTP en menos de 1 minuto.**
6. Si no llega, revisá:
   - Twilio Console → **Monitor → Logs → Messaging**: ves si el mensaje fue enviado y cuál fue el error.
   - Tu WhatsApp tiene que estar configurado en el mismo número.
   - Meta sender está aprobado (en Twilio Console → Senders).

Cuando esto funcione, avisame y arranco PR 8 (signup OTP).

---

## 8. Plan B: SMS en lugar de WhatsApp (si Meta tarda)

Si después de 1 semana el sender de WA sigue en revisión, switcheamos a SMS:

1. En Twilio Console: comprá un número de Argentina con capacidad SMS (~USD 1.50/mes). **No requiere aprobación de Meta.**
2. En Supabase Auth → Phone provider:
   - Mantené Twilio como provider.
   - Apuntá el "Phone Number" al número SMS.
   - Desactivá el toggle "Send OTP via WhatsApp" (si estaba activo).
3. Listo. Test con el mismo procedimiento del paso 6 — debería llegar un SMS.

**Migración a WA cuando se apruebe el sender**: solo cambiás el config de Supabase Auth (toggle ON + apuntar al número WA). Cero cambios de código.

---

## 9. Variables de entorno (tras setup)

Supabase Auth maneja Twilio internamente; **vos no agregás Twilio credentials a `.env.local`**. Lo que sí va a hacer falta en `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL` (ya existe).
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (ya existe).
- `SUPABASE_SERVICE_ROLE_KEY` (ya existe).

Para Vercel (cuando desplegues), las mismas tres variables — Twilio se maneja en el dashboard de Supabase, no en el código.

---

## 10. Checklist de done

Cuando todos estos puntos estén en verde, me avisás y arranco PR 8:

- [ ] Cuenta Twilio creada y con saldo / tarjeta cargada.
- [ ] Meta Business Manager configurado.
- [ ] WhatsApp Sender aprobado por Meta (o SMS configurado como plan B).
- [ ] Template `futbol_otp` aprobado en Twilio Content Builder.
- [ ] Supabase Auth → Phone provider → enabled + configurado con credenciales Twilio.
- [ ] Test manual exitoso: un usuario con tu teléfono recibe el OTP.
- [ ] Te llega bien el mensaje en WhatsApp (o SMS si plan B).

---

## 11. Troubleshooting común

**"El sender está en revisión hace 3 días"**
Normal. Meta a veces tarda. Si pasa 1 semana, abrí un ticket en Twilio Support. O switcheá a SMS (sección 8).

**"OTP llega pero el código no funciona"**
Verificá que el `Otp Expiry` en Supabase Auth coincida con el template (5 minutos). Y que no haya un firewall corporativo bloqueando llamadas a Twilio.

**"WhatsApp dice que el número no está registrado para Business"**
El display name de Meta todavía no se propagó. Esperá 1 hora más. Si sigue, revisá en Twilio Console → Senders el estado.

**"Twilio me cobra más de lo esperado"**
Probablemente estés mandando mensajes fuera de la ventana de 24h de servicio (que requiere templates aprobados especiales y son más caros). Para OTPs siempre es service conversation, así que es barato. Si ves cobros raros, mirá los logs de Twilio.

---

## 12. Después de aprobar todo

Cuando tengas el setup operativo, hacé un commit en el repo modificando esta línea del doc:

```
ESTADO: aprobado y funcionando desde YYYY-MM-DD con número +54XXXXXXXXXX.
```

(Reemplazá el placeholder de abajo cuando esté listo.)

**ESTADO: pendiente de aprobación de Meta.**
