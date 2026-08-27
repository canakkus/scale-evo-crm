import { NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { chatWithAssistant, type CrmContext } from "@/services/groq";

export async function GET() {
  try {
    const user = await getOptionalUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    const messages = await prisma.aiChatMessage.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      take: 50,
    });

    return NextResponse.json({ messages });
  } catch (error) {
    console.error("[GET /api/ai/chat] Error:", error);
    return NextResponse.json({ error: "Fehler beim Laden des Chatverlaufs." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getOptionalUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    const { message } = await request.json();
    if (!message?.trim()) {
      return NextResponse.json({ error: "Nachricht darf nicht leer sein." }, { status: 400 });
    }

    // Ensure db User exists
    let dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (!dbUser) {
      dbUser = await prisma.user.create({
        data: { id: user.id, email: user.email ?? "user@scaleevo.at", displayName: "User" },
      });
    }

    // Build CRM Context Snapshot
    const [totalLeads, openFollowUps, openTasks, topLeads, recentInteractions, chatHistory] = await Promise.all([
      prisma.lead.count(),
      prisma.lead.count({ where: { status: "FOLLOW_UP" } }),
      prisma.task.count({ where: { status: "OPEN", userId: dbUser.id } }),
      prisma.lead.findMany({
        take: 5,
        orderBy: { score: "desc" },
        select: { companyName: true, status: true, score: true },
      }),
      prisma.interaction.findMany({
        take: 5,
        orderBy: { createdAt: "desc" },
        include: { lead: { select: { companyName: true } } },
      }),
      prisma.aiChatMessage.findMany({
        where: { userId: dbUser.id },
        orderBy: { createdAt: "asc" },
        take: 10,
      }),
    ]);

    const context: CrmContext = {
      totalLeads,
      openFollowUps,
      openTasks,
      topLeads: topLeads.map((l) => ({ name: l.companyName, status: l.status, score: l.score })),
      recentInteractions: recentInteractions.map((i) => ({
        leadName: i.lead?.companyName || "Unbekannt",
        type: i.type,
        note: i.note.slice(0, 100),
      })),
    };

    // Format past history for Groq
    const history = chatHistory.map((m) => ({
      role: (m.role === "USER" ? "user" : "model") as "user" | "model",
      parts: [{ text: m.content }],
    }));

    // Call Groq API
    const replyText = await chatWithAssistant(message.trim(), history, context, dbUser.id);

    // Save User message and AI reply in database
    const [userMsg, aiMsg] = await prisma.$transaction([
      prisma.aiChatMessage.create({
        data: {
          userId: dbUser.id,
          role: "USER",
          content: message.trim(),
        },
      }),
      prisma.aiChatMessage.create({
        data: {
          userId: dbUser.id,
          role: "ASSISTANT",
          content: replyText,
        },
      }),
    ]);

    return NextResponse.json({ replyText, message: aiMsg }, { status: 201 });
  } catch (error: any) {
    console.error("[POST /api/ai/chat] Error:", error);
    return NextResponse.json(
      { error: error?.message || "Fehler bei der KI-Antwort." },
      { status: 500 }
    );
  }
}
