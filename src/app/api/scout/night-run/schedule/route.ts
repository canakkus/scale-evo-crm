import { NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getNightScoutState, startNightScoutPipeline } from "@/services/scout/night-scout-engine";

export const dynamic = "force-dynamic";

const CONFIG_QUERY = "Scout Schedule Config";

export async function GET(request: Request) {
  try {
    const user = await getOptionalUser();
    const authHeader = request.headers.get("authorization");
    const isCronAuth =
      process.env.CRON_SECRET &&
      authHeader === `Bearer ${process.env.CRON_SECRET}`;

    if (!user && !isCronAuth) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    const configSession = await prisma.scoutSession.findFirst({
      where: { searchQuery: CONFIG_QUERY },
      orderBy: { updatedAt: "desc" },
    });

    const lastRunSession = await prisma.scoutSession.findFirst({
      where: { searchQuery: { startsWith: "Night Scout Funnel" } },
      orderBy: { createdAt: "desc" },
    });

    const filters = (configSession?.filters as any) || {};

    const schedule = {
      enabled: filters.enabled ?? true,
      scheduledTime: filters.scheduledTime || "03:00",
      targetCount: filters.targetCount || 30,
      runs: filters.runs || 3,
      category: filters.category || "Gastronomie",
      districts: filters.districts || [
        "1010 Wien",
        "1020 Wien",
        "1030 Wien",
        "1070 Wien",
      ],
      lastRunAt: lastRunSession?.createdAt ? lastRunSession.createdAt.toISOString() : null,
      lastRunSessionName: lastRunSession?.name || null,
      currentState: getNightScoutState(),
    };

    return NextResponse.json({ schedule });
  } catch (error) {
    console.error("[GET /api/scout/night-run/schedule] Error:", error);
    return NextResponse.json({ error: "Fehler beim Laden des Zeitplans." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getOptionalUser();
    const authHeader = request.headers.get("authorization");
    const isCronAuth =
      process.env.CRON_SECRET &&
      authHeader === `Bearer ${process.env.CRON_SECRET}`;

    if (!user && !isCronAuth) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));

    // Trigger Mode: Sofortige Ausführung des geplanten Laufs
    if (body.trigger) {
      const currentState = getNightScoutState();
      if (currentState.running) {
        return NextResponse.json(
          { error: "Ein Lauf ist bereits aktiv.", state: currentState },
          { status: 409 }
        );
      }

      // Lade gespeicherte Konfiguration
      const configSession = await prisma.scoutSession.findFirst({
        where: { searchQuery: CONFIG_QUERY },
        orderBy: { updatedAt: "desc" },
      });
      const savedFilters = (configSession?.filters as any) || {};

      const districts = Array.isArray(body.districts) && body.districts.length > 0
        ? body.districts
        : (savedFilters.districts || ["1010 Wien", "1070 Wien", "1020 Wien"]);
      const category = body.category || savedFilters.category || "Gastronomie";
      const targetCount = Number(body.targetCount) || savedFilters.targetCount || 30;
      const runs = Math.max(1, Math.min(5, Number(body.runs) || savedFilters.runs || 1));

      // Verwende die Benutzer-ID oder den Ersteller der Config
      const runUserId = user?.id || configSession?.createdById;
      if (!runUserId) {
        return NextResponse.json({ error: "Keine Benutzer-ID für den Lauf gefunden." }, { status: 400 });
      }

      const started = await startNightScoutPipeline(
        {
          districts,
          category,
          targetCount,
          runs,
        },
        runUserId
      );

      return NextResponse.json({
        success: true,
        running: started,
        state: getNightScoutState(),
      });
    }

    // Save/Update Config Mode
    const targetUserId = user?.id;
    if (!targetUserId) {
      return NextResponse.json({ error: "Benutzer-ID erforderlich." }, { status: 400 });
    }

    const enabled = typeof body.enabled === "boolean" ? body.enabled : true;
    const scheduledTime = body.scheduledTime || "03:00";
    const targetCount = Number(body.targetCount) || 30;
    const runs = Math.max(1, Math.min(5, Number(body.runs) || 3));
    const category = body.category || "Gastronomie";
    const districts = Array.isArray(body.districts) && body.districts.length > 0
      ? body.districts
      : ["1010 Wien", "1020 Wien", "1030 Wien", "1070 Wien"];

    const existingConfig = await prisma.scoutSession.findFirst({
      where: { searchQuery: CONFIG_QUERY },
    });

    const newFilters = {
      enabled,
      scheduledTime,
      targetCount,
      runs,
      category,
      districts,
      updatedAt: new Date().toISOString(),
    };

    if (existingConfig) {
      await prisma.scoutSession.update({
        where: { id: existingConfig.id },
        data: {
          name: `Scout Schedule: ${scheduledTime} Uhr (${runs} Runs)`,
          filters: newFilters,
          city: "Wien",
        },
      });
    } else {
      await prisma.scoutSession.create({
        data: {
          name: `Scout Schedule: ${scheduledTime} Uhr (${runs} Runs)`,
          searchQuery: CONFIG_QUERY,
          city: "Wien",
          filters: newFilters,
          createdById: targetUserId,
        },
      });
    }

    return NextResponse.json({
      success: true,
      schedule: {
        enabled,
        scheduledTime,
        targetCount,
        runs,
        category,
        districts,
      },
    });
  } catch (error) {
    console.error("[POST /api/scout/night-run/schedule] Error:", error);
    return NextResponse.json({ error: "Fehler beim Speichern des Zeitplans." }, { status: 500 });
  }
}
