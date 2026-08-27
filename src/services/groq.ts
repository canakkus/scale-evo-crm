/**
 * ============================================================
 * GROQ AI SERVICE
 * ============================================================
 * Ersetzt Gemini für:
 *  - Audio-Transkription (Whisper large-v3 via Groq)
 *  - Chat-Assistent (Llama 3.3 70B via Groq)
 *  - Task-Priorisierung
 *
 * Um zurück auf Gemini zu wechseln:
 *  1. In /api/ai/chat/route.ts: Import von groq zurück zu gemini ändern
 *  2. In /api/cold-calls/transcribe/route.ts: Import von groq zurück zu gemini ändern
 *  3. In /api/tasks/prioritize/route.ts: Import von groq zurück zu gemini ändern
 * ============================================================
 */

import Groq from "groq-sdk";
import { prisma } from "@/lib/prisma";
import { runLeadScout } from "./lead-scout";
import { withGroqClient } from "@/lib/groq-key-manager";

// Re-export für bequemen Import in anderen Modulen
export { getKeyManager } from "@/lib/groq-key-manager";
export type { KeyInfo, KeyStatus } from "@/lib/groq-key-manager";

// ============================================================
// Call Transcription & Analysis
// ============================================================

export interface CallAnalysis {
  transcription: string;
  summary: string;
  nextSteps: string[];
  sentiment: "POSITIVE" | "NEUTRAL" | "NEGATIVE" | "MIXED";
  extractedData: {
    contactName?: string;
    appointmentDate?: string;
    objections?: string[];
    interestLevel?: "HIGH" | "MEDIUM" | "LOW" | "NONE";
  };
  aiFeedback?: {
    pace?: string;
    stuttering?: string;
    tone?: string;
    tips?: string[];
  };
}

/**
 * Transkribiert eine Audiodatei mit Groq Whisper und analysiert sie mit Llama.
 * @param audioBuffer - Audio als Buffer
 * @param mimeType - MIME-Typ der Datei (z.B. "audio/mp3")
 * @param fileName - Dateiname (für die Groq API)
 * @param companyName - Firmenname des Leads (für Kontext)
 */
export async function transcribeAndAnalyzeCall(
  audioBuffer: Buffer,
  mimeType: string,
  fileName: string,
  companyName?: string
): Promise<CallAnalysis> {
  const context = companyName ? `Der Call war mit ${companyName}.` : "";

  // Step 1: Transkription via Whisper large-v3 (Groq) — mit automatischer Key-Rotation
  const transcription = await withGroqClient(async (client) => {
    const file = new File([new Uint8Array(audioBuffer)], fileName, { type: mimeType });
    const result = await client.audio.transcriptions.create({
      file,
      model: "whisper-large-v3",
      language: "de",
      response_format: "text",
    });
    return String(result).trim();
  });

  // Step 2: Analyse via Llama 3.3 70B — mit automatischer Key-Rotation
  const analysisPrompt = `Du bist ein Vertriebsassistent und Rhetorik-Coach. ${context}

Analysiere diese Transkription eines Verkaufscalls und antworte NUR mit gültigem JSON ohne Markdown-Blöcke:

Transkription:
"""
${transcription}
"""

Antworte mit exakt diesem JSON-Format:
{
  "summary": "kurze Zusammenfassung in 2-3 Sätzen",
  "nextSteps": ["konkrete nächste Schritte als Array"],
  "sentiment": "POSITIVE|NEUTRAL|NEGATIVE|MIXED",
  "extractedData": {
    "contactName": "Name des Ansprechpartners wenn erwähnt oder null",
    "appointmentDate": "Termin wenn vereinbart oder null",
    "objections": ["Einwände als Array"],
    "interestLevel": "HIGH|MEDIUM|LOW|NONE"
  },
  "aiFeedback": {
    "pace": "Redegeschwindigkeit und Rhythmus des Anrufers",
    "stuttering": "Verwendung von Füllwörtern wie äh, öhm oder Stottern",
    "tone": "Tonfall und Gelassenheit des Anrufers",
    "tips": ["Konkrete Rhetorik-Tipps zur Verbesserung als Array"]
  }
}`;

  const analysisText = await withGroqClient(async (client) => {
    const response = await client.chat.completions.create({
      model: "qwen/qwen3.6-27b",
      messages: [{ role: "user", content: analysisPrompt }],
      temperature: 0.3,
    });
    return (response.choices[0]?.message?.content || "").trim();
  });

  const jsonStr = analysisText.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "");

  try {
    const parsed = JSON.parse(jsonStr);
    return { transcription, ...parsed } as CallAnalysis;
  } catch {
    return {
      transcription,
      summary: "Zusammenfassung konnte nicht automatisch erstellt werden.",
      nextSteps: [],
      sentiment: "NEUTRAL",
      extractedData: {},
      aiFeedback: undefined,
    };
  }
}

// ============================================================
// AI Assistant Chat (mit Tool/Function Calling)
// ============================================================

export interface CrmContext {
  totalLeads: number;
  openFollowUps: number;
  openTasks: number;
  topLeads: Array<{ name: string; status: string; score: number }>;
  recentInteractions: Array<{ leadName: string; type: string; note: string }>;
}

export async function executeAssistantTool(name: string, args: any, userId: string): Promise<any> {
  console.log(`[Groq Assistant Tool] Executing ${name} with args:`, args);
  try {
    switch (name) {
      case "searchLeads": {
        const { query } = args;
        const leads = await prisma.lead.findMany({
          where: {
            OR: [
              { companyName: { contains: query, mode: "insensitive" } },
              { city: { contains: query, mode: "insensitive" } },
              { phone: { contains: query, mode: "insensitive" } },
              { industry: { contains: query, mode: "insensitive" } },
            ],
          },
          take: 10,
          select: { id: true, companyName: true, status: true, score: true, city: true, phone: true, industry: true },
        });
        return { success: true, count: leads.length, leads };
      }

      case "getLeadDetails": {
        const { leadId } = args;
        const lead = await prisma.lead.findUnique({
          where: { id: leadId },
          include: {
            interactions: { take: 5, orderBy: { createdAt: "desc" }, select: { type: true, note: true, createdAt: true } },
            tasks: { take: 5, orderBy: { createdAt: "desc" }, select: { title: true, status: true, priority: true } },
          },
        });
        return { success: !!lead, lead };
      }

      case "updateLeadStatus": {
        const { leadId, status } = args;
        const updated = await prisma.lead.update({
          where: { id: leadId },
          data: { status: status as any },
        });
        return { success: true, leadId: updated.id, status: updated.status };
      }

      case "createTask": {
        const { leadId, title, category, priority, dueAt } = args;
        const task = await prisma.task.create({
          data: {
            leadId: leadId || null,
            title,
            category: category as any,
            priority: priority as any,
            dueAt: dueAt ? new Date(dueAt) : null,
            userId,
          },
        });

        if (leadId && category === "FOLLOW_UP") {
          await prisma.lead.update({
            where: { id: leadId },
            data: {
              status: "FOLLOW_UP",
              ...(dueAt && { nextFollowUpAt: new Date(dueAt) }),
            },
          });
        }

        return { success: true, taskId: task.id, title: task.title };
      }

      case "addLeadInteraction": {
        const { leadId, type, note } = args;
        const interaction = await prisma.interaction.create({
          data: {
            leadId,
            type: type as any,
            note,
            createdById: userId,
          },
        });
        return { success: true, interactionId: interaction.id };
      }

      case "runScoutSession": {
        const { category, city, maxResults } = args;
        const results = await runLeadScout(
          {
            category,
            city,
            maxResults: maxResults || 5,
            minRating: 0,
            minReviews: 0,
            hasTreatwellFilter: "all",
            hasWebsiteFilter: "all",
            hasPhoneFilter: "all",
            source: "places",
          },
          userId
        );
        return {
          success: true,
          sessionId: results.sessionId,
          totalFound: results.totalFound,
          importedCount: results.results.length,
          leads: results.results.map((r) => ({
            companyName: r.venue.name,
            address: r.leadDraft.address,
            phone: r.contacts.phone,
          })),
        };
      }

      default:
        return { error: `Unbekanntes Tool: ${name}` };
    }
  } catch (err: any) {
    console.error(`[Groq Assistant Tool] Error executing ${name}:`, err);
    return { error: err.message || "Fehler bei der Tool-Ausführung." };
  }
}

const ASSISTANT_TOOLS: Groq.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "searchLeads",
      description: "Suche nach Leads in der Datenbank anhand eines Suchbegriffs (Name, Stadt, Telefon, Branche). Gibt bis zu 10 Übereinstimmungen zurück.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Der Suchbegriff für Name, Stadt, Branche oder Telefonnummer." },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getLeadDetails",
      description: "Ruft alle Details, die letzten 5 Interaktionen und die letzten 5 Tasks für einen Lead anhand seiner ID ab.",
      parameters: {
        type: "object",
        properties: {
          leadId: { type: "string", description: "Die ID des Leads." },
        },
        required: ["leadId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "updateLeadStatus",
      description: "Aktualisiert den Status eines Leads. Gültige Status-Werte: NEW, RESEARCHED, TO_CONTACT, CONTACTED, REPLIED, INTERESTED, APPOINTMENT, OFFER_SENT, FOLLOW_UP, WON, LOST, NOT_RELEVANT.",
      parameters: {
        type: "object",
        properties: {
          leadId: { type: "string", description: "Die ID des Leads." },
          status: { type: "string", description: "Der neue Status (z.B. WON, FOLLOW_UP)." },
        },
        required: ["leadId", "status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "createTask",
      description: "Erstellt eine neue Aufgabe für einen Lead oder allgemein. Kategorien: SALES, ADMIN, FOLLOW_UP, COLD_OUTREACH, OTHER. Priorität: LOW, MEDIUM, HIGH.",
      parameters: {
        type: "object",
        properties: {
          leadId: { type: "string", description: "Die ID des verknüpften Leads (optional)." },
          title: { type: "string", description: "Der Titel der Aufgabe." },
          category: { type: "string", description: "Die Kategorie (SALES, ADMIN, FOLLOW_UP, COLD_OUTREACH, OTHER)." },
          priority: { type: "string", description: "Die Priorität (LOW, MEDIUM, HIGH)." },
          dueAt: { type: "string", description: "Optionales Fälligkeitsdatum als ISO-String (z.B. '2026-08-26T12:00:00Z')." },
        },
        required: ["title", "category", "priority"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "addLeadInteraction",
      description: "Fügt ein neues Interaktionsprotokoll (Notiz, Telefonat, Mail etc.) zu einem Lead hinzu. Typen: PHONE, IN_PERSON, EMAIL, INSTAGRAM, WHATSAPP, MEETING, OFFER, NOTE.",
      parameters: {
        type: "object",
        properties: {
          leadId: { type: "string", description: "Die ID des Leads." },
          type: { type: "string", description: "Der Interaktionstyp (PHONE, IN_PERSON, EMAIL, INSTAGRAM, WHATSAPP, MEETING, OFFER, NOTE)." },
          note: { type: "string", description: "Der Inhalt des Protokolls bzw. die Notiz." },
        },
        required: ["leadId", "type", "note"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "runScoutSession",
      description: "Startet eine Lead-Scout-Suche über Google Places und importiert die gefundenen Leads direkt in die Datenbank.",
      parameters: {
        type: "object",
        properties: {
          category: { type: "string", description: "Die Suchkategorie (z.B. 'Friseur', 'Barber', 'Kosmetik')." },
          city: { type: "string", description: "Die Stadt (z.B. 'Wien', 'Graz')." },
          maxResults: { type: "integer", description: "Die maximale Anzahl der zu importierenden Ergebnisse (Standard ist 5)." },
        },
        required: ["category", "city"],
      },
    },
  },
];

/**
 * Sendet eine Chat-Nachricht an Groq Llama mit CRM-Kontext und Tool-Calling-Support.
 */
export async function chatWithAssistant(
  message: string,
  history: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }>,
  context: CrmContext,
  userId: string
): Promise<string> {
  const systemPrompt = `Du bist ein intelligenter CRM-Assistent für Scale Evo CRM. Du hilfst beim Lead-Management und der Vertriebsarbeit.

Aktueller CRM-Snapshot:
- Gesamt-Leads: ${context.totalLeads}
- Offene Follow-ups: ${context.openFollowUps}
- Offene Tasks: ${context.openTasks}
- Top-Leads: ${JSON.stringify(context.topLeads)}
- Letzte Interaktionen: ${JSON.stringify(context.recentInteractions)}

Du kannst direkt Aktionen ausführen wie Suchen, Status ändern, Interaktionen hinzufügen, Aufgaben erstellen und den Lead Scout ausführen unter Verwendung deiner Tools.
Antworte auf Deutsch, kurz, freundlich und hilfreich.`;

  // Konvertiere Gemini-History-Format zu OpenAI/Groq-Format
  const messages: Groq.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...history.map((h) => ({
      role: (h.role === "model" ? "assistant" : "user") as "assistant" | "user",
      content: h.parts.map((p) => p.text).join(""),
    })),
    { role: "user", content: message },
  ];

  // Tool-Calling Loop mit automatischer Key-Rotation und Sicherheits-Limit
  return await withGroqClient(async (client) => {
    let response = await client.chat.completions.create({
      model: "qwen/qwen3.6-27b",
      messages,
      tools: ASSISTANT_TOOLS,
      tool_choice: "auto",
      temperature: 0.5,
    });

    let iterations = 0;
    const maxIterations = 5;

    while (response.choices[0]?.finish_reason === "tool_calls" && iterations < maxIterations) {
      iterations++;
      const assistantMessage = response.choices[0].message;
      messages.push(assistantMessage);

      const toolCalls = assistantMessage.tool_calls || [];
      for (const toolCall of toolCalls) {
        const toolName = toolCall.function.name;
        const toolArgs = JSON.parse(toolCall.function.arguments || "{}");
        const toolResult = await executeAssistantTool(toolName, toolArgs, userId);

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(toolResult),
        });
      }

      response = await client.chat.completions.create({
        model: "qwen/qwen3.6-27b",
        messages,
        tools: ASSISTANT_TOOLS,
        tool_choice: "auto",
        temperature: 0.5,
      });
    }

    const content = response.choices[0]?.message?.content || "";
    // Entferne mögliche <think> Blöcke, damit die interne Kette nicht im Chat angezeigt wird
    return content.replace(/<think>[\s\S]*?<\/think>\s*/g, "");
  });
}

// ============================================================
// Task Prioritization
// ============================================================

/**
 * Generiert eine KI-priorisierte Task-Liste basierend auf offenen Tasks und Follow-ups.
 */
export async function prioritizeTasks(
  tasks: Array<{ title: string; category: string; dueAt?: string | null; priority: string }>,
  followUps: Array<{ leadName: string; dueAt: string }>
): Promise<{ prioritized: string[]; reasoning: string }> {
  const prompt = `Du bist ein Produktivitätsassistent. Priorisiere diese Tasks für heute.

Tasks: ${JSON.stringify(tasks)}
Fällige Follow-ups: ${JSON.stringify(followUps)}

Antworte NUR mit gültigem JSON:
{
  "prioritized": ["Task 1", "Task 2", ...],
  "reasoning": "kurze Begründung der Priorisierung"
}`;

  try {
    const text = await withGroqClient(async (client) => {
      const response = await client.chat.completions.create({
        model: "qwen/qwen3.6-27b",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
      });
      return (response.choices[0]?.message?.content || "").trim();
    });

    const jsonStr = text.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "");
    return JSON.parse(jsonStr);
  } catch {
    return {
      prioritized: tasks.map((t) => t.title),
      reasoning: "Automatische Priorisierung nicht möglich.",
    };
  }
}
