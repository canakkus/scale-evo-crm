import { createSupabaseServerClient } from "./supabase/server";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";

const ALLOWED_EMAILS = (process.env.LOCALCRM_ALLOWED_USER_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export async function requireAuth(): Promise<User> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  if (
    ALLOWED_EMAILS.length > 0 &&
    !ALLOWED_EMAILS.includes(user.email?.toLowerCase() ?? "")
  ) {
    await supabase.auth.signOut();
    redirect("/login?error=unauthorized");
  }

  return user;
}

export async function getOptionalUser(): Promise<User | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user;
  } catch {
    return null;
  }
}
