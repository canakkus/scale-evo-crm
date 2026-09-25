import { NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { leadScope as workspaceLeadScope } from "@/lib/workspace";

/**
 * Datenquelle der Lead-Karte. Genau EINE Query, `select`-Whitelist, kein
 * `include`, kein Paging — die Karte braucht alle Leads auf einmal, sonst
 * entstehen Luecken, die wie "kein Lead hier" aussehen.
 *
 * Diese Route geocodiert NICHT. Sie liest ausschliesslich, was bereits am Lead
 * steht. Wer hier je einen Abruf einbaut, zahlt ihn bei jedem Kartenaufruf.
 */

/** Wird 1:1 vom Client verwendet (src/components/map/*). */
export type MapLead = {
  id: string;
  companyName: string;
  latitude: number | null;
  longitude: number | null;
  status: string;
  acquisitionType: string;
  industry: string | null;
  phone: string | null;
  score: number;
  lastContactAt: string | null;
  city: string | null;
  address: string | null;
  geoPrecision: string | null;
  geoStatus: string;
};

export async function GET() {
  try {
    const user = await getOptionalUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    // Wortgleiche Mandanten-Klausel wie in GET /api/leads.
    const leads = await prisma.lead.findMany({
      where: await workspaceLeadScope(user),
      select: {
        id: true,
        companyName: true,
        latitude: true,
        longitude: true,
        status: true,
        acquisitionType: true,
        industry: true,
        phone: true,
        score: true,
        lastContactAt: true,
        city: true,
        address: true,
        geoPrecision: true,
        geoStatus: true,
      },
      orderBy: { companyName: "asc" },
    });

    const payload: MapLead[] = leads.map((lead) => ({
      ...lead,
      lastContactAt: lead.lastContactAt ? lead.lastContactAt.toISOString() : null,
    }));

    return NextResponse.json({ leads: payload });
  } catch (error) {
    console.error("[GET /api/leads/map] Error:", error);
    return NextResponse.json({ error: "Fehler beim Laden der Karten-Leads." }, { status: 500 });
  }
}
