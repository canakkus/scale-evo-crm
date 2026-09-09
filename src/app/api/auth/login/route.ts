import { NextResponse } from "next/server";
import crypto from "crypto";
import { cookies } from "next/headers";
import { createSessionToken } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

// Server-side hashed credentials for Lucario (loaded from environment variables)
const LUCARIO_USERNAME = (process.env.LUCARIO_AUTH_USERNAME || "lucario").toLowerCase();
const LUCARIO_EMAIL = (process.env.LUCARIO_AUTH_EMAIL || "lucario@scaleevo.at").toLowerCase();
const LUCARIO_UUID = process.env.LUCARIO_AUTH_UUID || "7f8a9b0c-1d2e-4f3a-8b9c-0d1e2f3a4b5c";

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

    // 1. Check Lucario Credentials Server-Side (configured via environment variables)
    const lucarioPassword = process.env.LUCARIO_AUTH_PASSWORD;
    const authSalt = process.env.AUTH_SALT || process.env.SESSION_SECRET || "scale_evo_crm_default_salt";

    if (
      (identifier === LUCARIO_USERNAME ||
        identifier === LUCARIO_EMAIL ||
        identifier === "lucas" ||
        identifier === "lucario@scale-evo.at") &&
      lucarioPassword
    ) {
      const inputHash = crypto
        .createHash("sha256")
        .update(`${password}:${authSalt}`)
        .digest("hex");

      const expectedHash = crypto
        .createHash("sha256")
        .update(`${lucarioPassword}:${authSalt}`)
        .digest("hex");

      const inputBuf = Buffer.from(inputHash);
      const expectedBuf = Buffer.from(expectedHash);

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
