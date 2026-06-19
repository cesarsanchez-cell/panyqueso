# Cómo trabajamos — local-first

GitHub y producción son el **destino final de algo ya resuelto**, no el ambiente de prueba. Se desarrolla, valida, audita, registra y documenta **en local**; recién cuando la fase está cerrada se sube.

## El ciclo (una fase = una unidad cerrada)

1. **Desarrollar local** — código + checks rápidos mientras iterás.
2. **Validar local** — que ande de verdad, sin subir nada:
   - Lógica/UI: `pnpm db:start` (Supabase local con todas las migraciones) + `pnpm build && pnpm start` → app local en http://localhost:3000.
   - DB: `pnpm db:test` (pgTAP, los mismos tests que el CI).
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

## Supabase local

Requiere **Docker** corriendo.

```bash
pnpm db:start        # levanta Postgres+Auth+Storage y aplica todas las migraciones
pnpm db:reset        # reaplica migraciones desde cero (estado limpio)
pnpm db:test         # corre los pgTAP de supabase/tests/database
pnpm db:stop         # apaga el stack
```

`db:start` imprime las URLs/keys locales para poner en `.env.local` y correr la app contra la DB local.

## Reglas que no cambian

- **Migraciones de prod las aplica el usuario** en Supabase (yo dejo el `.sql` listo). En local se prueban con `db:start`/`db:reset` antes.
- No se stagea basura: se agregan archivos explícitos al commit, nunca `git add -A`.
- "guarda" dispara el wrap-up: actualizar memoria + Linear + Notion.
