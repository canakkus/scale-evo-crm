import { NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getOptionalUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    const { id } = await params;

    const audioFile = await prisma.audioFile.findUnique({
      where: { recordingId: id },
    });

    if (!audioFile) {
      return NextResponse.json({ error: "Audiodatei nicht gefunden." }, { status: 404 });
    }

    return new Response(audioFile.data, {
      headers: {
        "Content-Type": audioFile.mimeType || "audio/mpeg",
        "Content-Length": audioFile.data.length.toString(),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("[GET /api/cold-calls/recordings/[id]/audio] Error:", error);
    return NextResponse.json({ error: "Fehler beim Laden der Audiodatei." }, { status: 500 });
  }
}
