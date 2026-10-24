import { NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth";
import { loadDashboard } from "@/lib/dashboard-data";

export async function GET() {
  try {
    const user = await getOptionalUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    const data = await loadDashboard(user, { includeTeam: true });
    return NextResponse.json(data);
  } catch (error) {
    console.error("[GET /api/dashboard] Error:", error);
    return NextResponse.json({ error: "Fehler beim Laden des Dashboards." }, { status: 500 });
  }
}
