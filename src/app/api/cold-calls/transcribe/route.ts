import { NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { transcribeAndAnalyzeCall } from "@/services/gemini";

export async function POST(request: Request) {
  try {
    const user = await getOptionalUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const leadId = (formData.get("leadId") as string) || null;
    const companyNameInput = (formData.get("companyName") as string) || "";

    if (!file) {
      return NextResponse.json({ error: "Keine Audiodatei hochgeladen." }, { status: 400 });
    }

    // Ensure db User exists
    let dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (!dbUser) {
      dbUser = await prisma.user.create({
        data: { id: user.id, email: user.email ?? "user@scaleevo.at", displayName: "User" },
      });
    }

    // Get lead if provided
    let lead = null;
    if (leadId) {
      lead = await prisma.lead.findUnique({ where: { id: leadId } });
    }

    const targetCompanyName = lead?.companyName || companyNameInput || file.name;

    // Convert file to Base64
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Audio = buffer.toString("base64");
    const mimeType = file.type || "audio/mp3";

    // Transcribe & Analyze with Gemini API
    const analysis = await transcribeAndAnalyzeCall(base64Audio, mimeType, targetCompanyName);

    // Save CallRecording in database
    const recording = await prisma.callRecording.create({
      data: {
        leadId: lead?.id || null,
        createdById: dbUser.id,
        fileName: file.name,
        fileSize: file.size,
        transcription: analysis.transcription,
        aiSummary: analysis.summary,
        aiNextSteps: analysis.nextSteps,
        aiSentiment: analysis.sentiment,
        aiExtractedData: JSON.parse(JSON.stringify(analysis.extractedData)),
        aiFeedback: analysis.aiFeedback ? JSON.parse(JSON.stringify(analysis.aiFeedback)) : null,
        status: "DONE",
        audioFile: {
          create: {
            data: buffer,
            mimeType: mimeType,
          }
        }
      },
    });

    // If lead is linked, create an Interaction automatically!
    if (lead) {
      const summaryText = `📞 **Gemini Call-Transkription**: ${analysis.summary}\n\n**Nächste Schritte:** ${analysis.nextSteps.join(", ")}`;
      await prisma.interaction.create({
        data: {
          leadId: lead.id,
          type: "CALL_RECORDING",
          note: summaryText,
          createdById: dbUser.id,
          callRecordingId: recording.id,
        },
      });

      // Update lead's lastContactAt
      await prisma.lead.update({
        where: { id: lead.id },
        data: { lastContactAt: new Date() },
      });
    }

    return NextResponse.json({ recording, analysis }, { status: 201 });
  } catch (error: any) {
    console.error("[POST /api/cold-calls/transcribe] Error:", error);
    return NextResponse.json(
      { error: error?.message || "Fehler bei der Transkription." },
      { status: 500 }
    );
  }
}
