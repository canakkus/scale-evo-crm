import { NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { detectRestaurantMenu } from "@/lib/menu-detector";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getOptionalUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    const { id } = await params;
    const lead = await prisma.lead.findUnique({ where: { id } });

    if (!lead) {
      return NextResponse.json({ error: "Lead nicht gefunden." }, { status: 404 });
    }

    if (!lead.website) {
      const updated = await prisma.lead.update({
        where: { id },
        data: {
          hasMenu: false,
          menuUrl: null,
          menuSnippet: "Keine Website hinterlegt.",
          menuCheckedAt: new Date(),
        },
      });
      return NextResponse.json({ lead: updated, menuResult: { hasMenu: false, menuUrl: null, menuSnippet: "Keine Website hinterlegt." } });
    }

    const menuResult = await detectRestaurantMenu(lead.website);
    const updated = await prisma.lead.update({
      where: { id },
      data: {
        hasMenu: menuResult.hasMenu,
        menuUrl: menuResult.menuUrl,
        menuSnippet: menuResult.menuSnippet,
        menuCheckedAt: new Date(),
      },
    });

    return NextResponse.json({ lead: updated, menuResult });
  } catch (error: any) {
    console.error("[POST /api/leads/[id]/check-menu] Error:", error);
    return NextResponse.json(
      { error: error?.message || "Speisekarten-Prüfung fehlgeschlagen." },
      { status: 500 }
    );
  }
}
