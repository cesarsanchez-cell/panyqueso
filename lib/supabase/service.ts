// Cliente Supabase con SERVICE ROLE. Bypassa RLS y GRANTs.
//
// SOLO para Server Actions que ya validaron quién es el usuario y qué puede
// hacer (ej. subir su propia foto). NUNCA importar desde un Client Component:
// expondría la service key. Por eso vive separado del cliente de sesión.
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";
import { getSupabaseEnv } from "./env";

export function createServiceClient() {
  const { url } = getSupabaseEnv();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error("Falta la variable de entorno SUPABASE_SERVICE_ROLE_KEY");
  }
  return createSupabaseClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
