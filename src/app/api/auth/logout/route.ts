import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST() {
  try {
    const cookieStore = await cookies();
    cookieStore.set("crm_user_session", "", {
      path: "/",
      maxAge: 0,
      expires: new Date(0),
    });
    cookieStore.delete("crm_user_session");

    try {
      const supabase = await createSupabaseServerClient();
      await supabase.auth.signOut();
    } catch {
      // ignore
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[POST /api/auth/logout] Error:", err);
    return NextResponse.json({ error: "Fehler beim Abmelden." }, { status: 500 });
  }
}
