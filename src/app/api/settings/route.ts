import { NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await getOptionalUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    let settings = await prisma.aISettings.findFirst();
    if (!settings) {
      settings = await prisma.aISettings.create({
        data: { geminiEnabled: true },
      });
    }

    const allowedEmails = process.env.LOCALCRM_ALLOWED_USER_EMAILS || "";

    return NextResponse.json({
      settings,
      currentUser: {
        id: user.id,
        email: user.email,
        displayName: user.user_metadata?.displayName || user.email?.split("@")[0] || "Benutzer",
      },
      allowedEmails: allowedEmails.split(",").map((e) => e.trim()).filter(Boolean),
      hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
      hasPlacesKey: Boolean(process.env.GOOGLE_PLACES_API_KEY),
    });
  } catch (error) {
    console.error("[GET /api/settings] Error:", error);
    return NextResponse.json({ error: "Fehler beim Laden der Einstellungen." }, { status: 500 });
  }
}
