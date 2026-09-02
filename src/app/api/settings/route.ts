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
        sidebarConfig: dbUser?.sidebarConfig || null,
        baseAddress: dbUser?.baseAddress || null,
        baseLatitude: dbUser?.baseLatitude ?? null,
        baseLongitude: dbUser?.baseLongitude ?? null,
        preferredLocationMode: dbUser?.preferredLocationMode || "default",
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

    // Find user
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
          restaurantScoutEnabled: email === "canakkus378@gmail.com" ? false : true,
        },
      });
    }

    const updateData: any = {};

    if (body.restaurantScoutEnabled !== undefined) {
      updateData.restaurantScoutEnabled = Boolean(body.restaurantScoutEnabled);
    }

    if (body.sidebarConfig !== undefined) {
      updateData.sidebarConfig = body.sidebarConfig;
    }

    if (body.baseAddress !== undefined) {
      updateData.baseAddress = body.baseAddress ? String(body.baseAddress).trim() : null;
    }

    if (body.baseLatitude !== undefined) {
      updateData.baseLatitude = body.baseLatitude !== null ? Number(body.baseLatitude) : null;
    }

    if (body.baseLongitude !== undefined) {
      updateData.baseLongitude = body.baseLongitude !== null ? Number(body.baseLongitude) : null;
    }

    if (body.preferredLocationMode !== undefined) {
      updateData.preferredLocationMode = String(body.preferredLocationMode);
    }

    if (dbUser && Object.keys(updateData).length > 0) {
      dbUser = await prisma.user.update({
        where: { id: dbUser.id },
        data: updateData,
      });
    }

    return NextResponse.json({
      success: true,
      restaurantScoutEnabled: dbUser?.restaurantScoutEnabled,
      sidebarConfig: dbUser?.sidebarConfig,
      baseAddress: dbUser?.baseAddress,
      baseLatitude: dbUser?.baseLatitude,
      baseLongitude: dbUser?.baseLongitude,
      preferredLocationMode: dbUser?.preferredLocationMode,
    });
  } catch (error) {
    console.error("[PATCH /api/settings] Error:", error);
    return NextResponse.json({ error: "Fehler beim Aktualisieren der Einstellungen." }, { status: 500 });
  }
}
