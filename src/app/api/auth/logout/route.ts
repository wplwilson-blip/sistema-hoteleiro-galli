import { NextResponse } from "next/server";
import { clearSupabaseAuthCookies, createSupabaseServerClient } from "@/lib/supabase/server";
import { clearActiveUnitCookie } from "@/lib/auth/active-unit";

export async function POST() {
  const supabase = createSupabaseServerClient();

  await supabase.auth.signOut();
  clearSupabaseAuthCookies();
  clearActiveUnitCookie();

  return NextResponse.json({ ok: true });
}
