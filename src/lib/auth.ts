import { createSupabaseServerClient } from "./supabase/server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { verifySessionToken } from "./session";
import type { User } from "@supabase/supabase-js";

const ALLOWED_EMAILS = (process.env.LOCALCRM_ALLOWED_USER_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

function sessionToUser(payload: { id: string; email: string; displayName: string }): User {
  return {
    id: payload.id,
    app_metadata: {},
    user_metadata: { displayName: payload.displayName },
    aud: "authenticated",
    created_at: new Date().toISOString(),
    email: payload.email,
    phone: "",
    role: "authenticated",
    updated_at: new Date().toISOString(),
  };
}

export async function requireAuth(): Promise<User> {
  const user = await getOptionalUser();

  if (!user) {
    redirect("/login");
  }

  if (
    ALLOWED_EMAILS.length > 0 &&
    !ALLOWED_EMAILS.includes(user.email?.toLowerCase() ?? "") &&
    user.email?.toLowerCase() !== "lucario@scaleevo.at"
  ) {
    redirect("/login?error=unauthorized");
  }

  return user;
}

export async function getOptionalUser(): Promise<User | null> {
  try {
    // 1. Check signed session cookie
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("crm_user_session")?.value;
    if (sessionCookie) {
      const payload = verifySessionToken(sessionCookie);
      if (payload) {
        return sessionToUser(payload);
      }
    }

    // 2. Fall back to Supabase auth session
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user;
  } catch {
    return null;
  }
}

