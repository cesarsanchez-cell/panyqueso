// Cliente Supabase para Server Components, Server Actions y Route Handlers.
// Lee y refresca cookies de sesion del request actual.
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "./database.types";
import { getSupabaseEnv } from "./env";

export async function createClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabaseEnv();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Llamado desde un Server Component: cookies() es read-only ahi.
          // El middleware refresca cookies; este catch es seguro.
        }
      },
    },
  });
}
