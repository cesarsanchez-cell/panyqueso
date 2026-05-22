/**
 * Seed Linear con el roadmap del MVP "Futbol de los martes".
 *
 * Uso:
 *   1. Crear Personal API Key en Linear: Settings -> API -> Personal API keys.
 *   2. Guardarla en .env.local como LINEAR_API_KEY=lin_api_xxx
 *   3. Ejecutar: pnpm seed:linear
 *
 * Idempotente: si volves a correrlo, no duplica nada.
 * - Team "Futbol de los martes" (key FUT): se crea si no existe.
 * - Project "MVP — Futbol de los martes": se crea si no existe.
 * - 22 labels: se crean las que falten.
 * - ~50 issues: se crean por titulo; si una con ese titulo ya existe en el team, se omite.
 */

import { LinearClient } from "@linear/sdk";

const API_KEY = process.env.LINEAR_API_KEY;
if (!API_KEY) {
  console.error("ERROR: falta LINEAR_API_KEY en .env.local");
  process.exit(1);
}

const TEAM_NAME = "Futbol de los martes";
const TEAM_KEY = "FUT";
const PROJECT_NAME = "MVP — Futbol de los martes";
const PROJECT_DESCRIPTION =
  "Web app responsive para organizar partidos de futbol entre amigos con armado balanceado de equipos. Roles MVP: Admin y Veedor. Referencia: plan.txt v4 del repo.";

// ----- Labels -----
type LabelDef = { name: string; color: string; group: string };

const LABELS: LabelDef[] = [
  // Fases (degrade azul -> verde)
  { name: "fase-0", color: "#1f6feb", group: "Fase" },
  { name: "fase-1", color: "#2c7be5", group: "Fase" },
  { name: "fase-2", color: "#3b82f6", group: "Fase" },
  { name: "fase-3", color: "#0ea5e9", group: "Fase" },
  { name: "fase-4", color: "#06b6d4", group: "Fase" },
  { name: "fase-5", color: "#14b8a6", group: "Fase" },
  { name: "fase-6", color: "#10b981", group: "Fase" },
  { name: "fase-7", color: "#22c55e", group: "Fase" },
  { name: "fase-8", color: "#16a34a", group: "Fase" },
  // Areas (violetas)
  { name: "area:auth", color: "#8b5cf6", group: "Area" },
  { name: "area:db", color: "#7c3aed", group: "Area" },
  { name: "area:rls", color: "#6d28d9", group: "Area" },
  { name: "area:funciones-sql", color: "#5b21b6", group: "Area" },
  { name: "area:ui", color: "#a855f7", group: "Area" },
  { name: "area:algoritmo", color: "#9333ea", group: "Area" },
  { name: "area:tests", color: "#c084fc", group: "Area" },
  { name: "area:infra", color: "#a78bfa", group: "Area" },
  // Tipos (grises)
  { name: "tipo:setup", color: "#6b7280", group: "Tipo" },
  { name: "tipo:feature", color: "#4b5563", group: "Tipo" },
  { name: "tipo:bugfix", color: "#374151", group: "Tipo" },
  { name: "tipo:test", color: "#9ca3af", group: "Tipo" },
  { name: "tipo:doc", color: "#d1d5db", group: "Tipo" },
  { name: "tipo:auditoria", color: "#1f2937", group: "Tipo" },
  // Especiales (rojos)
  { name: "gate", color: "#dc2626", group: "Especial" },
  { name: "seguridad-critica", color: "#991b1b", group: "Especial" },
];

// ----- Issues -----
type IssueDef = {
  title: string;
  description: string;
  labels: string[];
  status: "Backlog" | "Todo" | "In Progress" | "In Review" | "Done" | "Canceled";
  priority?: 0 | 1 | 2 | 3 | 4; // 0=none 1=urgent 2=high 3=medium 4=low
};

const ISSUES: IssueDef[] = [
  // ===== Fase 0 (Done) =====
  {
    title: "Setup Next.js 15 + TypeScript + Tailwind v4",
    description:
      "Bootstrap del proyecto: Next 15 App Router, React 19, TS estricto (noUncheckedIndexedAccess), Tailwind v4 via @tailwindcss/postcss. Verificado con `pnpm build`.",
    labels: ["fase-0", "area:infra", "tipo:setup"],
    status: "Done",
    priority: 3,
  },
  {
    title: "Estructura de carpetas /lib y /db",
    description:
      "Crear lib/{scoring,team-generator,change-requests,supabase,auth} y db/{migrations,functions,policies,tests} con .gitkeep. Estructura segun plan v4 seccion 1.",
    labels: ["fase-0", "area:infra", "tipo:setup"],
    status: "Done",
    priority: 4,
  },
  {
    title: "Lint, format y CI minimo",
    description:
      "ESLint flat config (next/core-web-vitals + next/typescript), Prettier, EditorConfig. Workflow CI con typecheck + lint + format:check + build en push/PR a main.",
    labels: ["fase-0", "area:infra", "tipo:setup"],
    status: "Done",
    priority: 3,
  },
  {
    title: "Fix: mover cafile a .npmrc user-level",
    description:
      "El .npmrc del repo tenia un path absoluto local que rompia CI en Ubuntu. Cafile movido a ~/.npmrc del usuario; el .npmrc del repo se elimino.",
    labels: ["fase-0", "area:infra", "tipo:bugfix"],
    status: "Done",
    priority: 2,
  },
  {
    title: "Fix: subir Node a 22 en CI",
    description:
      "pnpm@11.2.2 requiere Node >=22.13 (usa node:sqlite). CI tenia Node 20 hardcoded. Cambio a node-version-file: .nvmrc y .nvmrc actualizado a 22.",
    labels: ["fase-0", "area:infra", "tipo:bugfix"],
    status: "Done",
    priority: 2,
  },
  {
    title: "Fix: agregar format:check y build a CI",
    description:
      "CI solo validaba typecheck y lint. Agregados pnpm format:check y pnpm build para validar deploy readiness.",
    labels: ["fase-0", "area:infra", "tipo:bugfix"],
    status: "Done",
    priority: 2,
  },
  {
    title: "Audit Fase 0",
    description:
      "Auditoria externa con multiples iteraciones. Bloqueantes resueltos: .npmrc local, Node 20 vs pnpm 11, cobertura CI insuficiente. GO para Fase 1 solo cuando todos cerraron.",
    labels: ["fase-0", "tipo:auditoria", "gate"],
    status: "Done",
    priority: 1,
  },

  // ===== Fase 1 =====
  {
    title: "Cliente Supabase: server + browser helpers",
    description:
      "Crear lib/supabase/server.ts y lib/supabase/client.ts con los helpers de @supabase/ssr. Tipos generados desde la DB.",
    labels: ["fase-1", "area:auth", "tipo:setup"],
    status: "Todo",
    priority: 2,
  },
  {
    title: "Migracion: tabla profiles",
    description:
      "profiles (id FK auth.users, nombre, role enum admin|veedor, created_at). Trigger para auto-crear profile al signup. RLS: cada uno su perfil; admin+veedor leen todos.",
    labels: ["fase-1", "area:db", "tipo:feature"],
    status: "Backlog",
    priority: 2,
  },
  {
    title: "Middleware de auth y guardia de rol",
    description:
      "middleware.ts que refresca sesion y redirige a /login si no hay sesion. Helper requireRole(role) para Server Components.",
    labels: ["fase-1", "area:auth", "tipo:feature"],
    status: "Backlog",
    priority: 2,
  },
  {
    title: "Pagina /login con email + password",
    description:
      "Form simple con Zod, Server Action de login, manejo de errores. Sin signup publico.",
    labels: ["fase-1", "area:ui", "area:auth", "tipo:feature"],
    status: "Backlog",
    priority: 2,
  },
  {
    title: "Layout (app) protegido por rol",
    description:
      "Layout que valida sesion, carga profile, expone rol a children. Redirect a /login si no autenticado.",
    labels: ["fase-1", "area:ui", "area:auth", "tipo:feature"],
    status: "Backlog",
    priority: 2,
  },
  {
    title: "Pagina /perfil para cambiar password",
    description: "Form de cambio de password via Supabase Auth. No expone otros datos sensibles.",
    labels: ["fase-1", "area:ui", "area:auth", "tipo:feature"],
    status: "Backlog",
    priority: 3,
  },
  {
    title: "Crear cuentas admin y veedor (operativo)",
    description:
      "Tarea operativa: crear los 2 usuarios en Supabase Auth dashboard, asignar role en profiles. Documentar el procedimiento en docs/. Requisito del plan: 2 cuentas DISTINTAS.",
    labels: ["fase-1", "tipo:doc"],
    status: "Backlog",
    priority: 3,
  },
  {
    title: "Audit Fase 1",
    description:
      "Gate de fase. Auditoria externa verifica: login funciona, redirects por rol correctos, no hay signup publico, service_role no se filtra al cliente.",
    labels: ["fase-1", "tipo:auditoria", "gate"],
    status: "Backlog",
    priority: 1,
  },

  // ===== Fase 2 =====
  {
    title: "Migracion: tabla players",
    description:
      "Todas las columnas del plan v4 seccion 2. internal_score mantenido por trigger. INSERT directo bloqueado.",
    labels: ["fase-2", "area:db", "tipo:feature", "seguridad-critica"],
    status: "Backlog",
    priority: 2,
  },
  {
    title: "Migracion: tabla player_change_requests",
    description:
      "Estructura completa con action_type, old_values/proposed_values JSONB, CHECK reviewed_by != requested_by, status enum.",
    labels: ["fase-2", "area:db", "tipo:feature", "seguridad-critica"],
    status: "Backlog",
    priority: 2,
  },
  {
    title: "Migracion: tabla audit_log",
    description:
      "INSERT solo desde funciones SECURITY DEFINER. SELECT admin+veedor. UPDATE/DELETE bloqueado.",
    labels: ["fase-2", "area:db", "tipo:feature"],
    status: "Backlog",
    priority: 3,
  },
  {
    title: "Migracion: convocatorias + convocatoria_players",
    description:
      "Estructura del plan v4. FK a players con check de status=approved al insertar en convocatoria_players.",
    labels: ["fase-2", "area:db", "tipo:feature"],
    status: "Backlog",
    priority: 3,
  },
  {
    title: "Migracion: matches + match_teams + match_team_players + match_player_stats",
    description:
      "Estructura del plan v4 incluyendo confirmed_with_warning, balance_snapshot, algorithm_version.",
    labels: ["fase-2", "area:db", "tipo:feature"],
    status: "Backlog",
    priority: 3,
  },
  {
    title: "Funcion compute_internal_score",
    description:
      "Pura, sin acceso a tablas. Implementa la formula de factor_edad + scoring del plan v4 seccion 5.",
    labels: ["fase-2", "area:funciones-sql", "tipo:feature"],
    status: "Backlog",
    priority: 2,
  },
  {
    title: "Funcion approve_player_change_request",
    description:
      "SECURITY DEFINER atomica. Valida rol veedor, estado pending/flagged, requested_by != auth.uid(), staleness en updates, aplica cambio segun action_type, marca approved, escribe audit_log.",
    labels: ["fase-2", "area:funciones-sql", "tipo:feature", "seguridad-critica"],
    status: "Backlog",
    priority: 1,
  },
  {
    title: "Funcion reject_player_change_request",
    description:
      "Marca status=rejected con reviewed_by=auth.uid(). NO toca players. Escribe audit_log.",
    labels: ["fase-2", "area:funciones-sql", "tipo:feature", "seguridad-critica"],
    status: "Backlog",
    priority: 2,
  },
  {
    title: "Funcion flag_player_change_request",
    description:
      "Marca status=flagged. NO toca players. Permite re-aprobacion/rechazo posterior por otro veedor distinto del requester.",
    labels: ["fase-2", "area:funciones-sql", "tipo:feature", "seguridad-critica"],
    status: "Backlog",
    priority: 2,
  },
  {
    title: "Trigger: inmutabilidad de campos sensibles en players",
    description:
      "BEFORE UPDATE rechaza cambios a technical/physical/mental/edad/status/role_field/position_pref/rating_confidence si el caller no es la funcion de aprobacion.",
    labels: ["fase-2", "area:rls", "tipo:feature", "seguridad-critica"],
    status: "Backlog",
    priority: 1,
  },
  {
    title: "Trigger: normalizacion en INSERT de player_change_requests",
    description:
      "BEFORE INSERT fuerza status=pending, anula reviewed_by/reviewed_at/review_comment/created_player_id independientemente de lo que mande el cliente.",
    labels: ["fase-2", "area:rls", "tipo:feature", "seguridad-critica"],
    status: "Backlog",
    priority: 1,
  },
  {
    title: "Trigger: inmutabilidad post-decision",
    description:
      "Una vez status IN (approved, rejected), ninguna columna admite UPDATE. Flagged si puede transicionar a approved/rejected.",
    labels: ["fase-2", "area:rls", "tipo:feature", "seguridad-critica"],
    status: "Backlog",
    priority: 1,
  },
  {
    title: "RLS policies: profiles, players, player_change_requests, audit_log",
    description:
      "Policies segun plan v4 seccion 6. Insert directo en players BLOQUEADO. Update directo en change_requests BLOQUEADO.",
    labels: ["fase-2", "area:rls", "tipo:feature", "seguridad-critica"],
    status: "Backlog",
    priority: 1,
  },
  {
    title: "RLS policies: convocatorias, matches, match_*",
    description: "SELECT admin+veedor; INSERT/UPDATE solo admin; DELETE bloqueado.",
    labels: ["fase-2", "area:rls", "tipo:feature"],
    status: "Backlog",
    priority: 2,
  },
  {
    title: "Tests de RLS",
    description:
      "Lista del plan v4 seccion 6: admin no puede UPDATE sensible, admin no puede INSERT en players, veedor no aprueba la suya, anonimo no accede, request approved es inmutable.",
    labels: ["fase-2", "area:tests", "tipo:test", "seguridad-critica"],
    status: "Backlog",
    priority: 1,
  },
  {
    title: "Tests de funciones SECURITY DEFINER",
    description:
      "Por funcion: approve/reject/flag con casos OK, request inexistente, request no-pending, requester==reviewer, stale_request, rol incorrecto.",
    labels: ["fase-2", "area:tests", "tipo:test", "seguridad-critica"],
    status: "Backlog",
    priority: 1,
  },
  {
    title: "Audit Fase 2",
    description:
      "GATE CRITICO. Auditoria externa con foco en RLS, funciones SECURITY DEFINER, triggers de inmutabilidad. NO avanzar a Fase 3 si hay bloqueantes/mayores.",
    labels: ["fase-2", "tipo:auditoria", "gate", "seguridad-critica"],
    status: "Backlog",
    priority: 1,
  },

  // ===== Fase 3 =====
  {
    title: "Pantalla /jugadores (listado)",
    description:
      "Listado paginado con filtros por status (approved/inactive), role_field, position_pref. Busqueda por nombre. Muestra internal_score solo a admin/veedor.",
    labels: ["fase-3", "area:ui", "tipo:feature"],
    status: "Backlog",
    priority: 3,
  },
  {
    title: "Pantalla /jugadores/nuevo",
    description:
      "Form que NO inserta en players. Crea player_change_request action_type=create_player con motivo obligatorio. Mensaje: queda pendiente de aprobacion del veedor.",
    labels: ["fase-3", "area:ui", "tipo:feature"],
    status: "Backlog",
    priority: 2,
  },
  {
    title: "Pantalla /jugadores/[id] (detalle)",
    description:
      "Datos, score, historial de change_requests (approved/rejected/flagged), notas privadas. Banner si hay request pending.",
    labels: ["fase-3", "area:ui", "tipo:feature"],
    status: "Backlog",
    priority: 2,
  },
  {
    title: "Accion: proponer cambio sensible",
    description:
      "Modal/pagina que crea update_sensitive_fields request con motivo obligatorio. Muestra que campos estan en pending.",
    labels: ["fase-3", "area:ui", "tipo:feature"],
    status: "Backlog",
    priority: 2,
  },
  {
    title: "Accion: desactivar / reactivar jugador",
    description: "Crea deactivate_player o reactivate_player request. Motivo obligatorio.",
    labels: ["fase-3", "area:ui", "tipo:feature"],
    status: "Backlog",
    priority: 3,
  },
  {
    title: "Edicion de campos no sensibles",
    description:
      "private_notes y positions_possible: aplican directo. Cada edit escribe audit_log con actor + old/new truncado.",
    labels: ["fase-3", "area:ui", "tipo:feature"],
    status: "Backlog",
    priority: 3,
  },
  {
    title: "Audit Fase 3",
    description:
      "Gate de fase. Verifica: jugadores no se crean directo, edicion sensible solo via requests, audit_log se llena.",
    labels: ["fase-3", "tipo:auditoria", "gate"],
    status: "Backlog",
    priority: 1,
  },

  // ===== Fase 4 =====
  {
    title: "Pantalla /auditoria con tabs",
    description:
      "Tabs: Altas pendientes / Cambios de ratings / Activacion-Desactivacion / Partidos con alerta / Historial.",
    labels: ["fase-4", "area:ui", "tipo:feature"],
    status: "Backlog",
    priority: 2,
  },
  {
    title: "Acciones Aprobar / Rechazar / Flag",
    description:
      "Server Actions que invocan approve_/reject_/flag_player_change_request. Manejo de errores SQL especificos.",
    labels: ["fase-4", "area:ui", "area:auth", "tipo:feature"],
    status: "Backlog",
    priority: 2,
  },
  {
    title: "Manejo de error stale_request",
    description:
      "Modal explicativo cuando old_values ya no coincide con valores actuales. Ofrece refrescar y revisar.",
    labels: ["fase-4", "area:ui", "tipo:feature"],
    status: "Backlog",
    priority: 3,
  },
  {
    title: "Manejo de error: no podes aprobar tu propia request",
    description:
      "Mensaje claro. UI puede ocultar el boton tambien pero la funcion SQL es la linea de defensa.",
    labels: ["fase-4", "area:ui", "tipo:feature"],
    status: "Backlog",
    priority: 3,
  },
  {
    title: "Badge de pendientes en dashboard",
    description:
      "Veedor: cantidad de requests sin resolver. Admin: cantidad de sus requests en pending.",
    labels: ["fase-4", "area:ui", "tipo:feature"],
    status: "Backlog",
    priority: 3,
  },
  {
    title: "Audit Fase 4",
    description: "Gate de fase. Verifica flujo end-to-end: propuesta, aprobacion, errores.",
    labels: ["fase-4", "tipo:auditoria", "gate"],
    status: "Backlog",
    priority: 1,
  },

  // ===== Fase 5 =====
  {
    title: "Pantalla /convocatorias (listado)",
    description: "Tabs por status: abiertas / cerradas / jugadas / canceladas.",
    labels: ["fase-5", "area:ui", "tipo:feature"],
    status: "Backlog",
    priority: 3,
  },
  {
    title: "Pantalla /convocatorias/nueva",
    description: "Form: fecha, notas, seleccion inicial de jugadores (solo status=approved).",
    labels: ["fase-5", "area:ui", "tipo:feature"],
    status: "Backlog",
    priority: 2,
  },
  {
    title: "Pantalla /convocatorias/[id]",
    description:
      "Gestion de asistencia. Cambio de attendance_status. Boton generar equipos deshabilitado si confirmados < 10.",
    labels: ["fase-5", "area:ui", "tipo:feature"],
    status: "Backlog",
    priority: 2,
  },
  {
    title: "Validacion: solo jugadores approved son convocables",
    description: "DB-level CHECK + RLS + tests.",
    labels: ["fase-5", "area:rls", "tipo:test"],
    status: "Backlog",
    priority: 2,
  },
  {
    title: "Audit Fase 5",
    description: "Gate de fase.",
    labels: ["fase-5", "tipo:auditoria", "gate"],
    status: "Backlog",
    priority: 1,
  },

  // ===== Fase 6 =====
  {
    title: "Pesos w1..w7 + test cases (entregable previo a UI)",
    description:
      "GATE PREVIO. Documento con pesos iniciales con justificacion, ~8 test cases (10 jugadores 5v5, 12v12, impar 11, 0/1/2 arqueros, alerta fuerte, posiciones desbalanceadas, mayores con buen fisico). Auditoria obligatoria antes de codear UI.",
    labels: ["fase-6", "area:algoritmo", "tipo:doc", "gate"],
    status: "Backlog",
    priority: 1,
  },
  {
    title: "Audit pesos + test cases",
    description: "Auditoria del entregable previo. Sin GO no se codea UI ni librerias.",
    labels: ["fase-6", "tipo:auditoria", "gate"],
    status: "Backlog",
    priority: 1,
  },
  {
    title: "lib/scoring: compute_internal_score TS",
    description:
      "Implementacion TS + tests de paridad con compute_internal_score SQL (mismos inputs => mismo output).",
    labels: ["fase-6", "area:algoritmo", "tipo:feature"],
    status: "Backlog",
    priority: 2,
  },
  {
    title: "lib/team-generator: snake draft + swap refining",
    description:
      "Snake draft por score desc; hill climbing acotado (<=200 iter, determinista con seed). Tests unitarios.",
    labels: ["fase-6", "area:algoritmo", "tipo:feature"],
    status: "Backlog",
    priority: 2,
  },
  {
    title: "lib/team-generator: deteccion de arqueros y reemplazos",
    description:
      "Logica de 0/1/2+ arqueros y was_keeper_replacement para candidatos. Tests con cada caso.",
    labels: ["fase-6", "area:algoritmo", "tipo:feature"],
    status: "Backlog",
    priority: 2,
  },
  {
    title: "lib/team-generator: balance_meta y alertas",
    description:
      "Calculo de diff_score, diff_pct, distribucion por posicion, warnings (<5%, 5-10%, >=10%, posicion desbalanceada, sin arquero). Tests por umbral.",
    labels: ["fase-6", "area:algoritmo", "tipo:feature"],
    status: "Backlog",
    priority: 2,
  },
  {
    title: "Pantalla generador: propuesta + balance + alertas",
    description: "UI principal del generador.",
    labels: ["fase-6", "area:ui", "tipo:feature"],
    status: "Backlog",
    priority: 2,
  },
  {
    title: "Pantalla generador: botones mover a equipo X",
    description:
      "Mover jugadores con botones (mecanismo principal segun plan v4). Recalc en vivo de balance_meta.",
    labels: ["fase-6", "area:ui", "tipo:feature"],
    status: "Backlog",
    priority: 2,
  },
  {
    title: "Modal de confirmacion con alerta fuerte",
    description:
      "Si diff_pct >= 10%, modal explicito al confirmar. Setea confirmed_with_warning=true.",
    labels: ["fase-6", "area:ui", "tipo:feature"],
    status: "Backlog",
    priority: 2,
  },
  {
    title: "Persistencia: balance_snapshot + algorithm_version",
    description:
      "Al confirmar partido: guardar snapshot completo (jugadores, scores, balance, alertas, decision humana, confirmed_by, algorithm_version) en matches.",
    labels: ["fase-6", "area:db", "tipo:feature"],
    status: "Backlog",
    priority: 2,
  },
  {
    title: "Audit Fase 6",
    description: "Gate de fase.",
    labels: ["fase-6", "tipo:auditoria", "gate"],
    status: "Backlog",
    priority: 1,
  },

  // ===== Fase 7 =====
  {
    title: "Carga de resultado y goles",
    description:
      "Form post-partido: score por equipo, ganador (auto-calculado), goles por jugador en match_player_stats, notas opcionales.",
    labels: ["fase-7", "area:ui", "tipo:feature"],
    status: "Backlog",
    priority: 3,
  },
  {
    title: "Visualizacion de partido jugado",
    description:
      "Vista read-only con equipos finales, score, goles, link al balance_snapshot. Indicador confirmed_with_warning si aplica.",
    labels: ["fase-7", "area:ui", "tipo:feature"],
    status: "Backlog",
    priority: 3,
  },
  {
    title: "Audit Fase 7",
    description: "Gate de fase.",
    labels: ["fase-7", "tipo:auditoria", "gate"],
    status: "Backlog",
    priority: 1,
  },

  // ===== Fase 8 =====
  {
    title: "Mobile-first: revision exhaustiva",
    description:
      "Layouts, tap targets >=44px, breakpoints, scroll en formularios largos. Probar en celular real.",
    labels: ["fase-8", "area:ui", "tipo:feature"],
    status: "Backlog",
    priority: 3,
  },
  {
    title: "Estados vacios, errores, loading",
    description:
      "Cada listado vacio con CTA. Cada error con mensaje util. Cada async con loading state.",
    labels: ["fase-8", "area:ui", "tipo:feature"],
    status: "Backlog",
    priority: 3,
  },
  {
    title: "Revision final de privacidad",
    description:
      "Busqueda exhaustiva de filtracion de ratings/scores/notas en lugares indebidos. Auditar logs del servidor tambien.",
    labels: ["fase-8", "area:ui", "tipo:test", "seguridad-critica"],
    status: "Backlog",
    priority: 1,
  },
  {
    title: "Revision final de RLS",
    description:
      "Re-correr todos los tests de RLS contra DB con datos reales del MVP. Verificar que no se filtro nada en produccion.",
    labels: ["fase-8", "area:rls", "tipo:test", "seguridad-critica"],
    status: "Backlog",
    priority: 1,
  },
  {
    title: "Audit Fase 8 + preparacion deploy",
    description: "Gate final. Si pasa, conectar a Vercel y deployar a produccion.",
    labels: ["fase-8", "tipo:auditoria", "gate"],
    status: "Backlog",
    priority: 1,
  },
];

// ============================================================================
// Ejecucion
// ============================================================================

async function main() {
  const client = new LinearClient({ apiKey: API_KEY });

  // 1. Resolver/crear team -----------------------------------------------------
  console.log("\n[1/5] Team...");
  const teamsConn = await client.teams({ filter: { key: { eq: TEAM_KEY } } });
  let team = teamsConn.nodes[0];
  if (!team) {
    console.log(`  Team ${TEAM_KEY} no existe. Creando "${TEAM_NAME}"...`);
    const created = await client.createTeam({ name: TEAM_NAME, key: TEAM_KEY });
    const teamFromCreate = await created.team;
    if (!teamFromCreate) throw new Error("createTeam no devolvio team");
    team = teamFromCreate;
    console.log(`  ✓ Team creado: ${team.key}`);
  } else {
    console.log(`  ✓ Team existente: ${team.key} (${team.name})`);
  }

  // 2. Resolver/crear project --------------------------------------------------
  console.log("\n[2/5] Project...");
  const projectsConn = await team.projects();
  let project = projectsConn.nodes.find((p) => p.name === PROJECT_NAME);
  if (!project) {
    console.log(`  Creando project "${PROJECT_NAME}"...`);
    const created = await client.createProject({
      name: PROJECT_NAME,
      description: PROJECT_DESCRIPTION,
      teamIds: [team.id],
    });
    const projectFromCreate = await created.project;
    if (!projectFromCreate) throw new Error("createProject no devolvio project");
    project = projectFromCreate;
    console.log(`  ✓ Project creado`);
  } else {
    console.log(`  ✓ Project existente: ${project.name}`);
  }

  // 3. Resolver/crear labels ---------------------------------------------------
  console.log("\n[3/5] Labels...");
  const existingLabelsConn = await team.labels();
  const existingLabels = new Map(existingLabelsConn.nodes.map((l) => [l.name, l]));
  const labelIdByName = new Map<string, string>();

  let createdLabels = 0;
  for (const def of LABELS) {
    const existing = existingLabels.get(def.name);
    if (existing) {
      labelIdByName.set(def.name, existing.id);
      continue;
    }
    const created = await client.createIssueLabel({
      name: def.name,
      color: def.color,
      teamId: team.id,
    });
    const labelFromCreate = await created.issueLabel;
    if (!labelFromCreate) throw new Error(`createIssueLabel ${def.name} no devolvio label`);
    labelIdByName.set(def.name, labelFromCreate.id);
    createdLabels++;
  }
  console.log(
    `  ✓ Labels: ${createdLabels} creadas, ${LABELS.length - createdLabels} ya existian.`,
  );

  // 4. Resolver workflow states -----------------------------------------------
  console.log("\n[4/5] Workflow states...");
  const statesConn = await team.states();
  const stateIdByName = new Map<string, string>();
  for (const state of statesConn.nodes) {
    stateIdByName.set(state.name, state.id);
  }
  const requiredStates = ["Backlog", "Todo", "In Progress", "In Review", "Done", "Canceled"];
  const missing = requiredStates.filter((s) => !stateIdByName.has(s));
  if (missing.length) {
    throw new Error(`Faltan workflow states en el team: ${missing.join(", ")}`);
  }
  console.log(`  ✓ Workflow states OK (${requiredStates.length}).`);

  // 5. Crear issues -----------------------------------------------------------
  console.log("\n[5/5] Issues...");
  const existingIssuesConn = await team.issues({ first: 250 });
  const existingTitles = new Set(existingIssuesConn.nodes.map((i) => i.title));

  let createdIssues = 0;
  let skippedIssues = 0;
  for (const issue of ISSUES) {
    if (existingTitles.has(issue.title)) {
      skippedIssues++;
      continue;
    }
    const stateId = stateIdByName.get(issue.status);
    if (!stateId) throw new Error(`State no encontrado: ${issue.status}`);

    const labelIds = issue.labels.map((name) => {
      const id = labelIdByName.get(name);
      if (!id) throw new Error(`Label no encontrado: ${name}`);
      return id;
    });

    await client.createIssue({
      teamId: team.id,
      projectId: project.id,
      title: issue.title,
      description: issue.description,
      stateId,
      labelIds,
      priority: issue.priority,
    });
    createdIssues++;
    process.stdout.write(".");
  }
  console.log(`\n  ✓ Issues: ${createdIssues} creadas, ${skippedIssues} ya existian (omitidas).`);

  console.log("\nListo. Revisar en Linear:");
  console.log(`  https://linear.app/  (team ${team.key})`);
}

main().catch((err) => {
  console.error("\nError:", err);
  process.exit(1);
});
