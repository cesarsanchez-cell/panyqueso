# Cómo trabajamos — local-first

GitHub y producción son el **destino final de algo ya resuelto**, no el ambiente de prueba. Se desarrolla, valida, audita, registra y documenta **en local**; recién cuando la fase está cerrada se sube.

## El ciclo (una fase = una unidad cerrada)

1. **Desarrollar local** — código + checks rápidos mientras iterás.
2. **Validar el código local** — `pnpm preflight` (el hook pre-push lo fuerza). Acá cae la mayoría de los errores: tipos, lint, formato, build. **Nada se sube si esto no pasa.**
3. **Auditar** — clasificar hallazgos: **blocker / mayor / sugerencia**. Blocker o mayor ⇒ no-go (se arregla antes de seguir).
4. **Registrar + documentar** — memoria + Linear + Notion (rutina de "guarda"), _antes_ de subir.
5. **Subir + validar visual** — 1 PR por fase. El CI corre **una vez** (ya verde por el gate local). La validación **visual/DB** se hace en el **preview de Vercel** (gratis). Recién ahí: merge → migración → prod.

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

## Validación visual y de DB: preview de Vercel

En este equipo no hay DB local aislada (sin Docker por el disco; sin proyecto
Supabase de dev por el límite del free tier). No es un hueco del flujo: es límite
de hardware/plan. La validación visual/DB se hace donde es **gratis y segura**:
el **preview de Vercel** de cada PR (los previews no consumen minutos de GitHub).

- El gate local (`preflight`) ya frena el grueso de los errores antes de subir.
- El preview corre contra la DB real; validar **mirando** es seguro, evitá hacer
  mutaciones de prueba que ensucien prod.
- Los pgTAP corren en el **CI** (barato: el stack de Supabase solo se levanta si
  el PR toca `supabase/**`).

### Opción futura: Supabase 100% local (requiere Docker + disco)

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
