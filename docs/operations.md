# Operativa del MVP

Procedimientos manuales que el admin ejecuta desde el dashboard de Supabase.
Hasta que tengamos UI propia (Fase 3+), estas son las acciones "low-tech".

---

## 1. Crear las cuentas iniciales: admin + veedor

**Cuándo:** una sola vez al inicio del MVP, antes de empezar a usar la app.

**Requisito del plan:** ≥ 1 admin **y** ≥ 1 veedor en cuentas **distintas**.
El sistema enforce `requested_by ≠ reviewed_by` en Fase 2; sin dos cuentas
diferentes, las solicitudes quedan trabadas.

### 1.1 Crear el usuario de Auth

1. Ir a https://supabase.com/dashboard/project/weuifafavgvvjtgmvkrv/auth/users
2. Click **Add user → Create new user**.
3. Email + password (anotar el password en gestor de contraseñas).
4. **Auto Confirm User: ON** (en MVP sin verificación por email).
5. Click **Create user**.

> Repetir para el segundo usuario. **Usar emails distintos**.

> Si la opción "Auto Confirm User" no aparece o no funciona, revisar que en
> **Authentication → Sign In / Up → Email** esté **Confirm email: OFF**.

### 1.2 Asignar nombre y rol al perfil

Cuando creás un usuario en Auth, el trigger `on_auth_user_created` (FUT-9)
inserta una row en `public.profiles` con `id` y `created_at`. Falta completar
`nombre` y `role`.

Abrir **SQL Editor** (https://supabase.com/dashboard/project/weuifafavgvvjtgmvkrv/sql/new)
y correr:

```sql
-- Ver los users actuales y su estado
select p.id, u.email, p.nombre, p.role
from public.profiles p
join auth.users u on u.id = p.id
order by p.created_at desc;
```

Identificar los UUIDs y correr una vez por usuario:

```sql
-- Admin
update public.profiles
set nombre = 'Tu nombre',
    role   = 'admin'
where id = '<UUID-DEL-ADMIN>';

-- Veedor
update public.profiles
set nombre = 'Nombre del veedor',
    role   = 'veedor'
where id = '<UUID-DEL-VEEDOR>';
```

### 1.3 Verificar

```sql
select u.email, p.nombre, p.role, p.created_at
from public.profiles p
join auth.users u on u.id = p.id;
```

Esperado: dos filas, ambos con `role` no nulo, una `admin` y una `veedor`.

### 1.4 Smoke test desde la app

1. `pnpm dev` (o producción).
2. Login con admin → debe entrar a `/`.
3. Logout.
4. Login con veedor → debe entrar a `/`.
5. Si alguno cae en `/sin-rol`, revisar que el `update` del paso 1.2 corrió OK.

---

## 2. Asignar / cambiar rol de un usuario existente

Solo necesario si querés sumar más admin/veedor o convertir uno en otro.

```sql
update public.profiles
set role = 'admin'   -- o 'veedor'
where id = '<UUID>';
```

> ⚠️ A partir de Fase 2 esto va a estar **prohibido** por trigger de
> inmutabilidad sobre campos sensibles. La asignación pasará por el flujo
> de `player_change_requests`. Mientras tanto (Fase 1), el SQL directo es
> el único camino.

---

## 3. Desactivar un usuario

Si alguien deja el grupo o no se usa más. Hay dos niveles:

**3.a. Suave (no puede operar pero la cuenta queda):**

```sql
update public.profiles
set role = null
where id = '<UUID>';
```

Quedará atrapado en `/sin-rol` al loguear.

**3.b. Duro (no puede ni loguear):**

Desde el dashboard Auth: https://supabase.com/dashboard/project/weuifafavgvvjtgmvkrv/auth/users
→ buscar el user → `...` → **Delete user**.

Esto cascadeará al row de `profiles` por el `on delete cascade` del FK.

---

## 4. Reset de contraseña de un usuario (operativo)

Si un usuario pierde su contraseña:

1. Dashboard → Authentication → Users → buscar el user → `...` → **Send password reset**.
2. El usuario recibe link por email y la cambia.

Alternativamente (solo si email no funciona):
3. `...` → **Send magic link** y el usuario entra por ahí, después usa `/perfil` para cambiar.

---

## 5. Rotación de secretos (al cierre de Fase 1)

Los secretos que se compartieron por chat durante el desarrollo de Fase 0 / 1
**deben rotarse** antes de pasar al auditor de la Fase 1. Lista:

- `SUPABASE_SERVICE_ROLE_KEY` — Settings → API → Project API keys → reset.
- `SUPABASE_ACCESS_TOKEN` — https://supabase.com/dashboard/account/tokens
  → revoke el anterior → generate new.
- `LINEAR_API_KEY` (opcional) — Settings → API → revoke + create new.

Después actualizar `.env.local` con los nuevos valores. `.env.local` está
gitignored, así que solo hace falta editarlo a mano.
