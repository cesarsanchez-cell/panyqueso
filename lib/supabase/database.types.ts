// Tipos del schema de Supabase.
// Se regenera con (Fase 2 en adelante):
//   pnpm dlx supabase gen types typescript --project-id weuifafavgvvjtgmvkrv > lib/supabase/database.types.ts
// Por ahora vacio: el schema se define en Fase 2.

export type Database = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
