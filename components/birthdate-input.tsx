"use client";

import { useMemo, useRef, useState } from "react";

// Entrada de fecha de nacimiento cómoda en mobile: tres desplegables
// (Día / Mes / Año) en vez del <input type="date"> nativo, que arranca en hoy
// y obliga a scrollear muchos meses. Elegir el año directo resuelve el dolor.
// Además, un botón 📅 abre el calendario nativo para quien lo prefiera.
//
// Envía un único campo oculto `name` con formato YYYY-MM-DD (lo que esperan las
// server actions). Los <select> no tienen name (no se envían); solo manejan UI.

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

function parse(value: string | null | undefined): { y: string; m: string; d: string } {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parts = value.split("-");
    return { y: parts[0] ?? "", m: String(Number(parts[1])), d: String(Number(parts[2])) };
  }
  return { y: "", m: "", d: "" };
}

function pad(n: string | number): string {
  return String(n).padStart(2, "0");
}

function daysInMonth(y: number, m: number): number {
  // m: 1–12. Si falta el año, asumimos bisiesto (29 en febrero) para no ocultar
  // el 29; el server valida la fecha real igual.
  if (!m) return 31;
  return new Date(y || 2000, m, 0).getDate();
}

export function BirthdateInput({
  id,
  name = "fecha_nacimiento",
  defaultValue = null,
  required = false,
  className = "",
}: {
  id?: string;
  name?: string;
  defaultValue?: string | null;
  required?: boolean;
  className?: string;
}) {
  const initial = parse(defaultValue);
  const [y, setY] = useState(initial.y);
  const [m, setM] = useState(initial.m);
  const [d, setD] = useState(initial.d);
  const dateRef = useRef<HTMLInputElement>(null);

  const currentYear = new Date().getFullYear();
  const years = useMemo(() => {
    const out: number[] = [];
    for (let yr = currentYear; yr >= 1930; yr--) out.push(yr);
    return out;
  }, [currentYear]);

  const maxDay = daysInMonth(Number(y), Number(m));
  const days = useMemo(() => Array.from({ length: maxDay }, (_, i) => i + 1), [maxDay]);
  // Si el día elegido ya no existe en el mes (ej. 31 → abril), lo limpiamos.
  const dSafe = Number(d) > maxDay ? "" : d;

  const value = y && m && dSafe ? `${y}-${pad(m)}-${pad(dSafe)}` : "";

  const selectCls =
    className ||
    "w-full rounded-md border border-neutral-300 bg-white px-2 py-2 text-sm text-neutral-900 focus:border-neutral-500 focus:outline-none";

  function openCalendar() {
    const el = dateRef.current as (HTMLInputElement & { showPicker?: () => void }) | null;
    if (!el) return;
    if (typeof el.showPicker === "function") {
      try {
        el.showPicker();
        return;
      } catch {
        // algunos browsers tiran si no hay activación de usuario; caemos al focus
      }
    }
    el.focus();
    el.click();
  }

  return (
    <div className="flex items-stretch gap-2">
      <div className="grid flex-1 grid-cols-3 gap-2">
        <select
          id={id}
          aria-label="Día"
          required={required}
          value={dSafe}
          onChange={(e) => setD(e.target.value)}
          className={selectCls}
        >
          <option value="">Día</option>
          {days.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <select
          aria-label="Mes"
          required={required}
          value={m}
          onChange={(e) => setM(e.target.value)}
          className={selectCls}
        >
          <option value="">Mes</option>
          {MESES.map((nombre, i) => (
            <option key={nombre} value={i + 1}>
              {nombre}
            </option>
          ))}
        </select>
        <select
          aria-label="Año"
          required={required}
          value={y}
          onChange={(e) => setY(e.target.value)}
          className={selectCls}
        >
          <option value="">Año</option>
          {years.map((yr) => (
            <option key={yr} value={yr}>
              {yr}
            </option>
          ))}
        </select>
      </div>

      <button
        type="button"
        onClick={openCalendar}
        aria-label="Abrir calendario"
        title="Abrir calendario"
        className="shrink-0 rounded-md border border-neutral-300 bg-white px-3 text-lg leading-none text-neutral-600 transition hover:bg-neutral-50"
      >
        📅
      </button>

      {/* Valor real enviado al server. */}
      <input type="hidden" name={name} value={value} />

      {/* Calendario nativo opcional (oculto pero presente para showPicker). */}
      <input
        ref={dateRef}
        type="date"
        aria-hidden="true"
        tabIndex={-1}
        value={value}
        max={`${currentYear}-12-31`}
        onChange={(e) => {
          const p = parse(e.target.value);
          setY(p.y);
          setM(p.m);
          setD(p.d);
        }}
        className="sr-only"
      />
    </div>
  );
}
