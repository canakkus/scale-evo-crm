import { NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const authUser = await getOptionalUser();
    if (!authUser) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    const email = (authUser.email || "").toLowerCase();
    const isCan = email === "canakkus378@gmail.com";

    // Find or create user record in Prisma
    let dbUser = await prisma.user.findFirst({
      where: {
        OR: [
          { id: authUser.id },
          ...(email ? [{ email: { equals: email, mode: "insensitive" as const } }] : []),
        ],
      },
    });

    if (!dbUser && email) {
      dbUser = await prisma.user.create({
        data: {
          id: authUser.id,
          email: authUser.email || "user@scaleevo.at",
          displayName: authUser.user_metadata?.displayName || email.split("@")[0],
          restaurantScoutEnabled: isCan ? false : true,
        },
      });
    }

    let settings = await prisma.aISettings.findFirst();
    if (!settings) {
      settings = await prisma.aISettings.create({
        data: { geminiEnabled: true },
      });
    }

    const allowedEmails = process.env.LOCALCRM_ALLOWED_USER_EMAILS || "";
    const restaurantScoutEnabled = dbUser ? dbUser.restaurantScoutEnabled : (isCan ? false : true);

    return NextResponse.json({
      settings,
      currentUser: {
        id: authUser.id,
        email: authUser.email,
        displayName: dbUser?.displayName || authUser.user_metadata?.displayName || email.split("@")[0] || "Benutzer",
        restaurantScoutEnabled,
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

export async function PATCH(request: Request) {
  try {
    const authUser = await getOptionalUser();
    if (!authUser) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    const body = await request.json();
    const email = (authUser.email || "").toLowerCase();

    if (body.restaurantScoutEnabled !== undefined) {
      const enabled = Boolean(body.restaurantScoutEnabled);

      // Find user
      const dbUser = await prisma.user.findFirst({
        where: {
          OR: [
            { id: authUser.id },
            ...(email ? [{ email: { equals: email, mode: "insensitive" as const } }] : []),
          ],
        },
      });

      if (dbUser) {
        await prisma.user.update({
          where: { id: dbUser.id },
          data: { restaurantScoutEnabled: enabled },
        });
      } else if (email) {
        await prisma.user.create({
          data: {
            id: authUser.id,
            email: authUser.email || "user@scaleevo.at",
            displayName: authUser.user_metadata?.displayName || email.split("@")[0],
            restaurantScoutEnabled: enabled,
          },
        });
      }

      return NextResponse.json({
        success: true,
        restaurantScoutEnabled: enabled,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[PATCH /api/settings] Error:", error);
    return NextResponse.json({ error: "Fehler beim Aktualisieren der Einstellungen." }, { status: 500 });
  }
}
