import { NextResponse } from "next/server";
import { clearSupabaseAuthCookies, createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = createSupabaseServerClient();

  await supabase.auth.signOut();
  clearSupabaseAuthCookies();

  return NextResponse.json({ ok: true });
}
