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

    const totalSize = audioFile.data.length;
    const range = request.headers.get("range");

    if (range) {
      const match = range.match(/bytes=(\d+)-(\d*)/);
      if (match) {
        const start = parseInt(match[1], 10);
        const end = match[2] ? parseInt(match[2], 10) : totalSize - 1;

        if (!isNaN(start) && start < totalSize && end >= start) {
          const chunk = audioFile.data.subarray(start, Math.min(end + 1, totalSize));
          return new Response(chunk, {
            status: 206,
            headers: {
              "Content-Range": `bytes ${start}-${Math.min(end, totalSize - 1)}/${totalSize}`,
              "Accept-Ranges": "bytes",
              "Content-Length": chunk.length.toString(),
              "Content-Type": audioFile.mimeType || "audio/mpeg",
              "Cache-Control": "public, max-age=31536000, immutable",
            },
          });
        }
      }
    }

    return new Response(audioFile.data, {
      status: 200,
      headers: {
        "Content-Type": audioFile.mimeType || "audio/mpeg",
        "Content-Length": totalSize.toString(),
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("[GET /api/cold-calls/recordings/[id]/audio] Error:", error);
    return NextResponse.json({ error: "Fehler beim Laden der Audiodatei." }, { status: 500 });
  }
}
