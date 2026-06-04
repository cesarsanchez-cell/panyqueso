import { CLUBS_BY_GROUP } from "@/lib/clubs";

// Selector del club favorito (FUT-89). Native <select> agrupado por
// Argentina / Mundo, con "Ninguno" (value="") como opción por defecto. Es
// presentacional (sin estado) para poder reusarse en cualquier form, cliente o
// servidor. El value es el slug del catálogo (lib/clubs.ts); "" = sin club.
export function ClubSelect({
  id = "club_id",
  name = "club_id",
  defaultValue = "",
  className = "",
}: {
  id?: string;
  name?: string;
  defaultValue?: string | null;
  className?: string;
}) {
  return (
    <select id={id} name={name} defaultValue={defaultValue ?? ""} className={className}>
      <option value="">Ninguno</option>
      {CLUBS_BY_GROUP.map((g) => (
        <optgroup key={g.grupo} label={g.grupo}>
          {g.clubs.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
