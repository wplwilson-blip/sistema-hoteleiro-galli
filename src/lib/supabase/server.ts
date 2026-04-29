import "server-only";

import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { getPublicSupabaseEnv, getSupabaseProjectRef } from "@/lib/supabase/env";

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 7
};

export function getSupabaseAuthCookieName() {
  return `sb-${getSupabaseProjectRef()}-auth-token`;
}

export function createSupabaseServerClient() {
  const { url, anonKey } = getPublicSupabaseEnv();
  const cookieStore = cookies();

  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: true,
      storage: {
        getItem(name: string) {
          return cookieStore.get(name)?.value ?? null;
        },
        setItem(name: string, value: string) {
          try {
            cookieStore.set(name, value, cookieOptions);
          } catch {
            // Server Components podem ler cookies, mas nao gravar.
          }
        },
        removeItem(name: string) {
          try {
            cookieStore.delete(name);
          } catch {
            // Server Components podem ler cookies, mas nao gravar.
          }
        }
      }
    }
  });
}

export function clearSupabaseAuthCookies() {
  const cookieStore = cookies();
  const cookieName = getSupabaseAuthCookieName();

  cookieStore.delete(cookieName);
  cookieStore.delete(`${cookieName}.0`);
  cookieStore.delete(`${cookieName}.1`);
}
