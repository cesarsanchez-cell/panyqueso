# Cómo trabajamos — local-first

GitHub y producción son el **destino final de algo ya resuelto**, no el ambiente de prueba. Se desarrolla, valida, audita, registra y documenta **en local**; recién cuando la fase está cerrada se sube.

## El ciclo (una fase = una unidad cerrada)

1. **Desarrollar local** — código + checks rápidos mientras iterás.
2. **Validar local** — que ande de verdad, sin subir nada:
   - Lógica/UI: `pnpm build && pnpm start` → app local en http://localhost:3000, apuntando a la **Supabase de dev** (proyecto sandbox en la nube, NO prod). Esquiva el `next dev` roto.
   - DB: los pgTAP corren en el **CI** (en este equipo no levantamos Supabase local; ver más abajo).
3. **Auditar** — clasificar hallazgos: **blocker / mayor / sugerencia**. Blocker o mayor ⇒ no-go (se arregla antes de seguir).
4. **Registrar + documentar** — memoria + Linear + Notion (rutina de "guarda"), _antes_ de subir.
5. **Subir** — 1 PR por fase. El CI corre **una vez** (ya verde porque pasó el gate local). Merge → migración → prod.

## El gate local

```bash
pnpm preflight       # typecheck + lint + format:check + build  (lo que corre el CI 'verify')
pnpm db:test         # pgTAP  (requiere Docker + pnpm db:start)
pnpm preflight:db    # preflight + db:test, todo junto
```

El hook **pre-push** corre `preflight` automáticamente y aborta el push si algo falla. Activarlo una vez por repo:

```bash
git config core.hooksPath .githooks
```

(Emergencia puntual: `git push --no-verify`.)

## La base para validar local: Supabase de **dev** (en la nube)

En este equipo (disco/CPU justos) no levantamos Supabase local con Docker. En su
lugar usamos un **segundo proyecto Supabase, "panyqueso-dev"**, separado de prod:
un sandbox con el mismo esquema donde validar sin tocar producción.

- `.env.local` apunta al proyecto **dev** (URL + anon key + service_role key del
  dev; `NEXT_PUBLIC_SITE_URL=http://localhost:3000`).
- Las migraciones se aplican a dev con `pnpm supabase db push` (linkeado a dev),
  antes de mandarlas a prod.
- Validás con `pnpm build && pnpm start` contra esa base dev.

### Opción futura: Supabase 100% local (requiere Docker)

Si en otra máquina hay Docker + disco, el stack offline completo:

```bash
pnpm db:start   # Postgres+Auth+Storage local + todas las migraciones
pnpm db:reset   # reaplica desde cero
pnpm db:test    # pgTAP local
pnpm db:stop
```

## Reglas que no cambian

- **Migraciones de prod las aplica el usuario** en Supabase (yo dejo el `.sql` listo). Antes se prueban en **dev** (`db push` a dev) o con `db:start`/`db:reset` si hay Docker.
- No se stagea basura: se agregan archivos explícitos al commit, nunca `git add -A`.
- "guarda" dispara el wrap-up: actualizar memoria + Linear + Notion.
