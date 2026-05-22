# Tutorial de Linear — paso a paso para Futbol de los martes

Pensado para alguien que no usó Linear antes (o muy poco). Te lleva desde
cero hasta tener el MVP cargado y empezar a trabajar en Fase 1.

> Conceptos primero (sección 1–4) → setup (5–7) → operativa diaria (8–10).

---

## 1. Conceptos básicos de Linear

Linear organiza el trabajo en una jerarquía simple:

```
Workspace                ← "tu cuenta" / tu compañía
  └── Team               ← un equipo (ej: "Futbol de los martes")
        ├── Issues       ← unidad de trabajo, equivalente a una tarea
        ├── Cycles       ← sprints semanales/quincenales (opcionales)
        ├── Projects     ← agrupación de issues con un objetivo concreto
        └── Views        ← filtros guardados (ej: "todo lo de Fase 2")
```

Aplicado a nuestro caso:

- **Workspace**: tu cuenta de Linear.
- **Team**: "Futbol de los martes" (prefijo `FUT`).
- **Project**: "MVP — Futbol de los martes" agrupa TODAS las issues del MVP.
- **Issues**: cada tarea concreta del roadmap (`FUT-1`, `FUT-2`, …).
- **Labels**: etiquetas para categorizar (fase, área, tipo, gate).
- **Cycles**: NO los vamos a usar al principio. Los explico abajo y decidimos después.

### ¿Project o Team?

Confusión común. Team es **estructural** (quién hace el trabajo); Project es
**objetivo** (qué se está construyendo). Un team puede tener varios projects.
Acá un solo team y un solo project porque sos el único dev.

### ¿Cycle sí o no?

Un Cycle es un sprint (típicamente 1 o 2 semanas). Vos arrastrás issues a un
cycle y el cycle te muestra qué se completó vs lo prometido.

**Mi recomendación para vos: NO usar cycles todavía.** Razón: las fases del
plan ya son tu cronograma. Sumar cycles encima es ruido. Si después querés
disciplinar entregas por tiempo, los activás.

---

## 2. Estados del issue (workflow)

Cuando creás una issue, tiene un **status**. Linear viene con estos por defecto:

| Status | Cuándo usarlo |
|---|---|
| `Backlog` | Pendiente, no priorizado todavía. Default de las issues nuevas en este proyecto. |
| `Todo` | Próxima en arrancar. Tiene que estar listo lo que la bloquea. |
| `In Progress` | La estás trabajando ahora. |
| `In Review` | Lista para revisar (PR abierto, esperando auditoría, etc.). |
| `Done` | Terminada y mergeada. |
| `Canceled` | Descartada (no se hace). |

### Flujo típico

```
Backlog → Todo → In Progress → In Review → Done
                                        ↘ Canceled
```

### Atajos para mover entre estados

Estando con una issue abierta (o seleccionada en una lista):

- **0** → Backlog
- **1** → Todo
- **2** → In Progress
- **3** → In Review
- **4** → Done
- **5** → Canceled

---

## 3. Integración con GitHub (lo importante)

Cuando vincules el repo (paso 6.3 abajo), Linear hace 3 cosas automáticas:

### 3.1 Auto-linkeo de branches

Si tu branch incluye el ID de la issue, Linear lo detecta:

```bash
git checkout -b cesar/FUT-7-supabase-clients
```

Apenas pusheás ese branch, Linear muestra una pestaña "GitHub" en la issue
`FUT-7` con el branch enlazado.

### 3.2 Auto-cambio de estado por PR

- Abrir un PR que mencione `FUT-7` → la issue pasa a `In Review`.
- Mergear ese PR → la issue pasa a `Done`.

Para que mergee la issue, el cuerpo del PR debe incluir una de estas frases:

```
Closes FUT-7
Fixes FUT-7
Resolves FUT-7
```

### 3.3 Comentarios cruzados

Comentarios del PR aparecen en la issue de Linear (resumidos), y un link a
la issue aparece en el PR. Útil para no perder contexto.

---

## 4. Labels — para qué sirven

En Linear, las labels son **transversales**: una issue puede tener varias.
Las usamos para 4 cosas:

1. **Fase** (`fase-0` a `fase-8`) → en qué etapa del plan está.
2. **Área** (`area:db`, `area:ui`, …) → de qué parte técnica es.
3. **Tipo** (`tipo:feature`, `tipo:test`, …) → naturaleza del trabajo.
4. **Especiales** (`gate`, `seguridad-critica`) → flags importantes.

Después podés filtrar por label desde cualquier vista. Ejemplo: "mostrame
todo lo `seguridad-critica` que está en `In Progress`".

---

## 5. Crear el Workspace y Team (si no existen)

Si ya tenés el workspace y team creados, saltá al paso 6.

### 5.1 Workspace

Si abrís linear.app por primera vez te lleva a un wizard. Nombre del
workspace: lo que prefieras (puede ser tu nombre, "Personal", etc.).

### 5.2 Team

Sidebar izquierda → click en el ícono de team → **Create team**:

- **Name**: `Futbol de los martes`
- **Identifier** (prefijo): `FUT` ← se usa para los IDs (`FUT-1`, `FUT-2`, …)
- **Workflow**: dejá el default (Backlog/Todo/In Progress/In Review/Done/Canceled).

---

## 6. Setup del proyecto en Linear

### 6.1 Crear labels (~5 minutos)

**Settings (`⌘ ,` o engranaje arriba a la derecha) → Team `FUT` → Labels →
+ New label**.

Creá estos 22 labels con sus colores sugeridos:

**Fases (azules, degradé):**
```
fase-0   fase-1   fase-2   fase-3   fase-4
fase-5   fase-6   fase-7   fase-8
```

**Áreas (violetas):**
```
area:auth       area:db          area:rls       area:funciones-sql
area:ui         area:algoritmo   area:tests     area:infra
```

**Tipos (grises):**
```
tipo:setup   tipo:feature   tipo:bugfix
tipo:test    tipo:doc       tipo:auditoria
```

**Especiales (rojos):**
```
gate                  ← bloquea avance a la siguiente fase
seguridad-critica     ← RLS, funciones SECURITY DEFINER, privacidad
```

> **Tip**: dejá la pestaña de Settings → Labels abierta y creá uno detrás
> de otro. Cada label tarda ~10 segundos.

### 6.2 Crear el Project

Sidebar izquierda → **Projects** (debajo del nombre del team) → **+ New project**:

| Campo | Valor |
|---|---|
| **Name** | `MVP — Futbol de los martes` |
| **Description** | Copiá el primer párrafo de `plan.txt` (sección "Product goal" del CLAUDE.md) |
| **Lead** | Vos |
| **Status** | `In progress` |
| **Target date** | (vacío) |
| **Priority** | High |

### 6.3 Conectar GitHub

**Settings → Integrations → GitHub → Connect**:

1. Autorizar la cuenta de GitHub.
2. Seleccionar la organización donde está el repo (probablemente tu cuenta personal `cesarsanchez-cell`).
3. Permitir acceso al repo `Futbol-de-los-martes`.

Después, en **Settings del team → GitHub → Repositories**, agregar
`cesarsanchez-cell/Futbol-de-los-martes` como repo del team.

---

## 7. Cargar las issues del roadmap

Ahora cargás las ~50 issues que están en [linear-roadmap.md](linear-roadmap.md).

### 7.1 Crear una issue (paso a paso, ejemplo concreto)

Tomemos `Cliente Supabase: server + browser helpers` de Fase 1 como ejemplo.

1. Apretá **C** (atajo "create") desde cualquier pantalla.
2. Te abre un panel a la derecha.
3. **Title**: pegá `Cliente Supabase: server + browser helpers`.
4. **Description**: pegá el texto del roadmap.md:
   ```
   Crear lib/supabase/server.ts y lib/supabase/client.ts con los helpers
   de @supabase/ssr. Tipos generados desde la DB.
   ```
5. **Labels**: apretá **L** dentro del form, escribí `fase-1`, Enter. Repetí
   con `area:auth` y `tipo:setup`.
6. **Project**: apretá **P**, escribí `MVP`, Enter para seleccionar
   `MVP — Futbol de los martes`.
7. **Status**: apretá **S**, elegí `Todo` (porque es la primera de Fase 1
   que vamos a tocar).
8. **Priority**: apretá **Shift+P**, elegí `High`.
9. **Assignee**: apretá **A**, te asignás a vos.
10. **Ctrl+Enter** para crear.

La issue queda con ID, por ejemplo `FUT-12`.

### 7.2 Cargar el resto

Para ir rápido, podés mantener el panel de "Create issue" abierto y crear
una atrás de otra. **Tip**: después de **Ctrl+Enter** apretá **C** otra
vez sin cerrar nada.

### 7.3 Orden recomendado de carga

1. **Fase 0** (5 issues + 1 audit) — status **Done**. Sirven de histórico.
2. **Fase 1** (8 issues) — status **Backlog**, excepto la primera (`Cliente Supabase: server + browser helpers`) que va en **Todo**.
3. **Fases 2 a 8** — status **Backlog**.

### 7.4 Marcar las `gate` issues

Las issues con label `gate` (los "Audit Fase N") son los checkpoints
externos. Marcalas con:

- **Priority**: `Urgent` (las identifica visualmente).
- **Estimate** (si usás): 0 puntos (no es trabajo de implementación).
- **Assignee**: dejala sin assignee, o asignala a vos como "owner del checkpoint".

---

## 8. Vistas útiles que conviene crear

Las views son filtros guardados. Te ahorran tiempo todos los días.

**Sidebar del team → Views → + New view**

### 8.1 "Fase actual"

Filtro:
- Project = `MVP — Futbol de los martes`
- Label = `fase-1` (la fase activa)
- Status ≠ `Done`, ≠ `Canceled`

Cuando avancemos a Fase 2, editás el filtro a `fase-2`.

### 8.2 "Gates pendientes"

Filtro:
- Label = `gate`
- Status ≠ `Done`

Te muestra cuántas auditorías quedan pendientes. Es tu mapa de progreso.

### 8.3 "Seguridad crítica"

Filtro:
- Label = `seguridad-critica`

Útil cuando estés en Fase 2 y quieras tener visibilidad de TODO lo
sensible que toca RLS o funciones SECURITY DEFINER.

---

## 9. Operativa diaria

### 9.1 Cuando arrancás una issue

1. Mové la issue a `In Progress` (atajo **2** estando seleccionada).
2. Creá la branch en local con el ID:
   ```bash
   git checkout -b cesar/FUT-12-supabase-clients
   ```
3. Trabajá normalmente. Commits con el ID:
   ```bash
   git commit -m "feat(supabase): FUT-12 server + browser helpers"
   ```

### 9.2 Cuando estás por terminar

1. Pusheás el branch:
   ```bash
   git push -u origin cesar/FUT-12-supabase-clients
   ```
2. Abrís PR en GitHub. En el body del PR poné:
   ```
   Closes FUT-12
   ```
3. Linear automáticamente mueve la issue a `In Review`.
4. Cuando se mergea el PR → Linear mueve a `Done`.

### 9.3 Cuando una fase termina

1. Mové la issue `Audit Fase N` a `In Review`.
2. Pasame el detalle al auditor externo.
3. Cuando el auditor diga GO, mové la issue a `Done`.
4. Mové la primera issue de la fase siguiente a `Todo`.

---

## 10. Atajos imprescindibles

Linear es muy keyboard-driven. Los que vas a usar todo el tiempo:

| Atajo | Acción |
|---|---|
| **C** | Crear issue (desde cualquier pantalla) |
| **G + I** | Ir a "My issues" |
| **G + V** | Ir a Views |
| **G + P** | Ir a Projects |
| **Ctrl/⌘ + K** | Command palette (hacé todo desde acá si no te acordás un atajo) |
| **0 a 5** | Cambiar status (con issue seleccionada o abierta) |
| **L** | Labels |
| **P** | Project |
| **S** | Status |
| **A** | Assignee |
| **D** | Due date |
| **Shift + P** | Priority |
| **/** | Foco en search |
| **?** | Mostrar todos los atajos (la cheat sheet completa) |

### Pro tip
Antes de aprenderte la lista, usá **Ctrl+K** para todo. Te abre el command
palette y desde ahí buscás por texto cualquier acción ("create issue",
"go to project", "change status to done", etc.). Es el plan B universal.

---

## 11. Checklist de cierre del setup

Cuando termines, verificá:

- [ ] Team `Futbol de los martes` con prefijo `FUT` existe.
- [ ] Project `MVP — Futbol de los martes` creado.
- [ ] 22 labels creadas (9 fases + 8 áreas + 6 tipos + 2 especiales).
- [ ] Integración GitHub activa, repo `Futbol-de-los-martes` vinculado.
- [ ] Issues de Fase 0 cargadas con status `Done`.
- [ ] Issues de Fase 1 cargadas con status `Backlog`, salvo "Cliente Supabase…" en `Todo`.
- [ ] Issues de Fases 2 a 8 cargadas con status `Backlog`.
- [ ] Vistas "Fase actual" y "Gates pendientes" guardadas.
- [ ] Sabés el ID de la primera issue de Fase 1 (algo tipo `FUT-7` o `FUT-12`).

---

## 12. Cuando termines — qué me pasás

Avisame y pegame:

1. **El ID exacto** de la issue "Cliente Supabase: server + browser helpers" — lo necesito para nombrar branch y commits cuando arranquemos Fase 1.
2. (Opcional) Una captura de la vista "Fase actual" para que veas cómo se ve todo cargado. Si querés feedback de la estructura, dale.

Después arrancamos Fase 1.

---

## Apéndice: ¿Querés acelerar con la API?

Cargar ~50 issues a mano lleva 30-45 minutos. Si te resulta tedioso,
podemos hacer un script Node.js que las crea vía la API de Linear:

1. Te crearás un Personal API Key (Settings → API → Personal API keys).
2. Te paso un script que lee `linear-roadmap.md` y crea todo.
3. Vos lo ejecutás (yo no tengo acceso a tu API key).

Si te interesa esa ruta, decímelo. Si no, manual está bien.
