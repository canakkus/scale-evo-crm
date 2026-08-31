import { NextResponse } from "next/server";
import crypto from "crypto";
import { cookies } from "next/headers";
import { createSessionToken } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

// Server-side hashed credentials for Lucario (never sent to client)
const LUCARIO_USERNAME = "lucario";
const LUCARIO_EMAIL = "lucario@scaleevo.at";
const LUCARIO_UUID = "7f8a9b0c-1d2e-4f3a-8b9c-0d1e2f3a4b5c";

// Password hash computed with SHA-256 + salt
// Salted hash of "Pudorf12AMK"
const AUTH_SALT = "scale_evo_crm_auth_salt_2026";
const EXPECTED_PWD_HASH = crypto
  .createHash("sha256")
  .update(`Pudorf12AMK:${AUTH_SALT}`)
  .digest("hex");

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const identifier = String(body.username || body.email || "").trim().toLowerCase();
    const password = String(body.password || "");

    if (!identifier || !password) {
      return NextResponse.json(
        { error: "Bitte Benutzername/E-Mail und Passwort eingeben." },
        { status: 400 }
      );
    }

    // 1. Check Lucario Credentials Server-Side
    if (
      identifier === LUCARIO_USERNAME ||
      identifier === LUCARIO_EMAIL ||
      identifier === "lucas" ||
      identifier === "lucario@scale-evo.at"
    ) {
      const inputHash = crypto
        .createHash("sha256")
        .update(`${password}:${AUTH_SALT}`)
        .digest("hex");

      const inputBuf = Buffer.from(inputHash);
      const expectedBuf = Buffer.from(EXPECTED_PWD_HASH);

      const isValid =
        inputBuf.length === expectedBuf.length &&
        crypto.timingSafeEqual(inputBuf, expectedBuf);

      if (isValid) {
        // Ensure user exists in database
        await prisma.user.upsert({
          where: { id: LUCARIO_UUID },
          update: { displayName: "Lucario", active: true },
          create: {
            id: LUCARIO_UUID,
            email: LUCARIO_EMAIL,
            displayName: "Lucario",
            active: true,
          },
        });

        const token = await createSessionToken({
          id: LUCARIO_UUID,
          email: LUCARIO_EMAIL,
          displayName: "Lucario",
        });

        const cookieStore = await cookies();
        cookieStore.set("crm_user_session", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: 60 * 60 * 24 * 30, // 30 days
        });

        return NextResponse.json({
          success: true,
          user: {
            id: LUCARIO_UUID,
            email: LUCARIO_EMAIL,
            displayName: "Lucario",
          },
        });
      }

      return NextResponse.json(
        { error: "Ungültige Anmeldedaten." },
        { status: 401 }
      );
    }

    // 2. Fallback to Supabase Auth for other registered users
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: identifier,
      password: password,
    });

    if (error || !data.user) {
      return NextResponse.json(
        { error: error?.message || "Ungültige Anmeldedaten." },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      user: {
        id: data.user.id,
        email: data.user.email,
        displayName: data.user.user_metadata?.displayName || data.user.email,
      },
    });
  } catch (err) {
    console.error("[POST /api/auth/login] Error:", err);
    return NextResponse.json(
      { error: "Fehler beim Anmelden." },
      { status: 500 }
    );
  }
}
