// Cliente Supabase con service_role. Bypassea RLS. Usar SOLO en server
// actions y nunca exportar el cliente al cliente. La key se lee del env
// server-only SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";
import { getSupabaseEnv } from "./env";

export function createAdminClient() {
  const { url } = getSupabaseEnv();
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRole) {
    throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en el environment.");
  }
  return createClient<Database>(url, serviceRole, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
