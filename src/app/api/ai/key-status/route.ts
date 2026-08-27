import { NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth";
import { getKeyManager } from "@/lib/groq-key-manager";

/**
 * GET /api/ai/key-status
 * Gibt den Status aller konfigurierten Groq API Keys zurück.
 */
export async function GET() {
  try {
    const user = await getOptionalUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    const manager = getKeyManager();
    const status = manager.getStatus();

    return NextResponse.json({
      provider: "groq",
      ...status,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("[GET /api/ai/key-status] Error:", error);
    return NextResponse.json(
      { error: error?.message || "Fehler beim Abrufen des Key-Status." },
      { status: 500 }
    );
  }
}
