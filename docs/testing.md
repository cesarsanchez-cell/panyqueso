# Tests

## Tests de DB (pgTAP)

Cubren RLS policies, triggers y funciones SECURITY DEFINER de Fase 2. Viven en
`supabase/tests/database/*.sql` y corren con el runner `supabase test db`
(internamente usa `pg_prove` contra la DB local de Supabase).

### Requisitos

- **Docker** corriendo (Supabase levanta Postgres, GoTrue, etc. en containers).
- **Supabase CLI** instalada. La version pineada en CI es `latest`.

### Correr local

```bash
# Levantar el stack local (la primera vez baja images, tarda ~1 min).
supabase start

# Aplicar las migraciones del repo a la DB local.
# (supabase start ya las aplica si la DB esta limpia)
supabase db reset

# Correr los tests.
supabase test db
```

Cada archivo `.sql` corre dentro de un `begin; ... rollback;` propio, asi que
los tests no contaminan la DB local entre corridas.

### Que cubren

- `rls_phase2.sql` — 23 asserts sobre RLS de profiles, players,
  player_change_requests y audit_log. Cubre la lista obligatoria del plan v4
  seccion 6: admin no INSERT directo en players, admin no UPDATE sensibles,
  veedor/admin no UPDATE directo en player_change_requests, trigger
  normaliza status='pending' en INSERT, request approved es inmutable,
  usuario sin rol no accede a nada.

- `functions_phase2.sql` — 18 asserts sobre las funciones SECURITY DEFINER
  `approve` / `reject` / `flag` _player_change_request_. Cubre P0001
  auth_required, P0002 request_not_found, P0003 not_a_veedor, P0005
  cannot_*_own_request, P0007 stale_request y los happy paths principales.

- `invalid_status_test.sql` — 2 asserts dedicados a P0004 invalid_status
  (approve sobre approved, flag sobre flagged). Aislado en transaction
  propio porque el row necesita estar en estado terminal sin pasar por
  un UPDATE previo en el mismo transaction.

### Bajar el stack

```bash
supabase stop
```

### CI

El job `db-tests` en `.github/workflows/ci.yml` levanta Supabase en GitHub
Actions y corre los tests en cada PR. Si fallan, el merge queda bloqueado.
