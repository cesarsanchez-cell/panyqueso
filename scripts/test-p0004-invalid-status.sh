#!/usr/bin/env bash
# ============================================================================
# Test manual: P0004 invalid_status para approve y flag.
# ----------------------------------------------------------------------------
# No usa pgTAP. Razon: aun usando _try (EXECUTE), _call_approve/_call_flag
# (PERFORM), o aislando el test en archivo aparte, la exception escapa del
# EXCEPTION WHEN OTHERS de cualquier wrapper PL/pgSQL cuando approve/flag
# hacen FOR UPDATE sobre un row en estado terminal (approved/rejected/
# flagged). El comportamiento es 100% reproducible en pg_prove 3.36 + pgtap
# y no encontramos workaround dentro de pgTAP.
#
# Estrategia: cada llamado a psql es una conexion independiente. Si la
# funcion raisea, psql sale con codigo != 0 y el mensaje queda en stderr.
# Lo verificamos con grep.
# ============================================================================

set -uo pipefail

DB_URL="${DB_URL:-postgresql://postgres:postgres@localhost:54322/postgres}"

# Cada caso: descripcion + SQL completo (setup + call) + mensaje esperado.
# Todo dentro de un begin/rollback para no contaminar la DB.

run_case() {
  local description=$1
  local sql=$2
  local expected=$3

  echo "==> $description"

  set +e
  output=$(psql "$DB_URL" -v ON_ERROR_STOP=1 <<SQL 2>&1
$sql
SQL
  )
  rc=$?
  set -e

  if [ $rc -eq 0 ]; then
    echo "  FAIL: psql exit 0; se esperaba error con '$expected'"
    echo "  Output:"
    echo "$output" | sed 's/^/    /'
    return 1
  fi

  if echo "$output" | grep -q "$expected"; then
    echo "  PASS: psql fallo con '$expected'"
    return 0
  fi

  echo "  FAIL: no aparece '$expected' en stderr"
  echo "  Output:"
  echo "$output" | sed 's/^/    /'
  return 1
}

# Setup comun (seed + claim ids) y luego la llamada que debe fallar.
# Usamos UUIDs distintos por caso para evitar interferencia.

APPROVE_SQL=$(cat <<'EOF'
begin;
insert into auth.users (
  id, instance_id, email, encrypted_password,
  aud, role, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-000000000000',
   'admin@p0004.local', '', 'authenticated', 'authenticated',
   now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a2',
   '00000000-0000-0000-0000-000000000000',
   'veedor@p0004.local', '', 'authenticated', 'authenticated',
   now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

update public.profiles set role='admin', nombre='Admin' where id='00000000-0000-0000-0000-0000000000a1';
update public.profiles set role='veedor', nombre='Veedor' where id='00000000-0000-0000-0000-0000000000a2';

insert into public.players (
  id, nombre, edad, role_field, position_pref,
  technical, physical, mental, status, created_by
) values (
  '00000000-0000-0000-0000-0000000000b1',
  'P', 30, 'jugador_campo', 'mediocampista',
  6, 6, 6, 'approved',
  '00000000-0000-0000-0000-0000000000a1'
);

alter table public.player_change_requests disable trigger player_change_requests_normalize_insert;
insert into public.player_change_requests
  (id, player_id, action_type, requested_by, proposed_values, reason,
   status, reviewed_by, reviewed_at)
values
  ('00000000-0000-0000-0000-0000000000c1',
   '00000000-0000-0000-0000-0000000000b1',
   'update_sensitive_fields',
   '00000000-0000-0000-0000-0000000000a1',
   jsonb_build_object('technical', 8),
   'seed approved',
   'approved',
   '00000000-0000-0000-0000-0000000000a2',
   now());
alter table public.player_change_requests enable trigger player_change_requests_normalize_insert;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);

select public.approve_player_change_request('00000000-0000-0000-0000-0000000000c1'::uuid);
EOF
)

FLAG_SQL=$(cat <<'EOF'
begin;
insert into auth.users (
  id, instance_id, email, encrypted_password,
  aud, role, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-000000000000',
   'admin@p0004.local', '', 'authenticated', 'authenticated',
   now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a2',
   '00000000-0000-0000-0000-000000000000',
   'veedor@p0004.local', '', 'authenticated', 'authenticated',
   now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

update public.profiles set role='admin', nombre='Admin' where id='00000000-0000-0000-0000-0000000000a1';
update public.profiles set role='veedor', nombre='Veedor' where id='00000000-0000-0000-0000-0000000000a2';

insert into public.players (
  id, nombre, edad, role_field, position_pref,
  technical, physical, mental, status, created_by
) values (
  '00000000-0000-0000-0000-0000000000b1',
  'P', 30, 'jugador_campo', 'mediocampista',
  6, 6, 6, 'approved',
  '00000000-0000-0000-0000-0000000000a1'
);

alter table public.player_change_requests disable trigger player_change_requests_normalize_insert;
insert into public.player_change_requests
  (id, player_id, action_type, requested_by, proposed_values, reason,
   status, reviewed_by, reviewed_at)
values
  ('00000000-0000-0000-0000-0000000000e1',
   '00000000-0000-0000-0000-0000000000b1',
   'deactivate_player',
   '00000000-0000-0000-0000-0000000000a1',
   '{}'::jsonb,
   'seed flagged',
   'flagged',
   '00000000-0000-0000-0000-0000000000a2',
   now());
alter table public.player_change_requests enable trigger player_change_requests_normalize_insert;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);

select public.flag_player_change_request('00000000-0000-0000-0000-0000000000e1'::uuid);
EOF
)

failures=0
run_case "approve sobre request approved -> P0004 invalid_status" \
  "$APPROVE_SQL" "invalid_status" || failures=$((failures+1))
run_case "flag sobre request flagged -> P0004 invalid_status" \
  "$FLAG_SQL" "invalid_status" || failures=$((failures+1))

if [ "$failures" -gt 0 ]; then
  echo
  echo "Resultado: $failures caso(s) fallaron"
  exit 1
fi

echo
echo "Resultado: 2/2 casos OK"
