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
import { runRestaurantScout } from "./restaurant-scout";
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

function cleanAndParseJson<T>(rawText: string, fallback: T): T {
  try {
    // 1. Wenn ein </think> Tag existiert, nimm nur alles danach. Andernfalls filtere <think>...</think>
    let content = rawText;
    if (content.includes("</think>")) {
      content = content.split("</think>").pop() || "";
    } else {
      content = content.replace(/<think>[\s\S]*?<\/think>/gi, "");
    }
    content = content.trim();

    // 2. Entferne Markdown-Code-Blöcke (z.B. ```json ... ```)
    const withoutMarkdown = content
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    // 3. Suche das äußerste JSON-Objekt { ... }
    const firstBrace = withoutMarkdown.indexOf("{");
    const lastBrace = withoutMarkdown.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const jsonCandidate = withoutMarkdown.substring(firstBrace, lastBrace + 1);
      return JSON.parse(jsonCandidate) as T;
    }

    return JSON.parse(withoutMarkdown) as T;
  } catch (err) {
    console.error("[Groq Service] JSON Parse Error. Raw response was:", rawText, err);
    return fallback;
  }
}

/**
 * Transkribiert eine Audiodatei mit Groq Whisper und analysiert sie mit KI (inkl. Sprechertrennung/Dialog-Formatierung).
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
  const context = companyName ? `Der Call war mit dem Lead / Unternehmen "${companyName}".` : "";

  // Step 1: Transkription via Whisper large-v3 (Groq) — mit automatischer Key-Rotation
  const rawTranscription = await withGroqClient(async (client) => {
    const file = new File([new Uint8Array(audioBuffer)], fileName, { type: mimeType });
    const result = await client.audio.transcriptions.create({
      file,
      model: "whisper-large-v3",
      language: "de",
      response_format: "text",
    });
    return String(result).trim();
  });

  // Step 2: Analyse und Dialog-Formatierung via Qwen / Groq
  const analysisPrompt = `Du bist ein präziser Vertriebsassistent und Rhetorik-Coach. ${context}

AUFGABEN:
1. Wandle die folgende rohe Audio-Transkription in ein sauberes, strukturiertes DIALOG-PROTOKOLL um:
   - Identifiziere die Gesprächspartner und trenne deren Aussagen in einzelne Absätze mit Sprecher-Kennzeichnung (z.B. '[Anrufer / Verkäufer]: ...' und '[Kunde / Ansprechpartner]: ...').
   - Korrigiere Interpunktion und Grammatik sinnvoll, ohne den Inhalt zu verändern.
2. Analysiere das Gespräch detailliert (Zusammenfassung, nächste Schritte, Stimmung, extrahierte Kontaktdaten/Einwände und Rhetorik-Coaching-Feedback).

Rohe Transkription:
"""
${rawTranscription}
"""

Antworte AUSSCHLIESSLICH im folgenden JSON-Format ohne weiteren Fließtext:
{
  "dialogueTranscription": "Vollständiges Gespräch als formatierter Dialog mit getrennten Sprecher-Absätzen (z.B. [Anrufer]: ...\\n\\n[Kunde]: ...)",
  "summary": "Prägnante Zusammenfassung des Gesprächs in 2-3 Sätzen",
  "nextSteps": ["Konkrete nächste Schritte als Liste"],
  "sentiment": "POSITIVE|NEUTRAL|NEGATIVE|MIXED",
  "extractedData": {
    "contactName": "Name des Ansprechpartners wenn genannt oder null",
    "appointmentDate": "Konkreter vereinbarter Termin oder null",
    "objections": ["Vom Kunden geäußerte Einwände als Liste"],
    "interestLevel": "HIGH|MEDIUM|LOW|NONE"
  },
  "aiFeedback": {
    "pace": "Redegeschwindigkeit und Rhythmus des Anrufers",
    "stuttering": "Verwendung von Füllwörtern wie äh, öhm oder Stottern",
    "tone": "Tonfall, Souveränität und Gelassenheit des Anrufers",
    "tips": ["Konkrete Rhetorik-Tipps zur Verbesserung als Liste"]
  }
}`;

  const analysisText = await withGroqClient(async (client) => {
    const response = await client.chat.completions.create({
      model: "qwen/qwen3.6-27b",
      messages: [{ role: "user", content: analysisPrompt }],
      temperature: 0.2,
      max_tokens: 4096,
    });
    return (response.choices[0]?.message?.content || "").trim();
  });

  const parsed = cleanAndParseJson<Partial<CallAnalysis> & { dialogueTranscription?: string }>(
    analysisText,
    {}
  );

  const finalTranscription = parsed.dialogueTranscription?.trim() || rawTranscription;

  return {
    transcription: finalTranscription,
    summary: parsed.summary || "Zusammenfassung konnte nicht automatisch erstellt werden.",
    nextSteps: Array.isArray(parsed.nextSteps) ? parsed.nextSteps : [],
    sentiment: parsed.sentiment || "NEUTRAL",
    extractedData: parsed.extractedData || {},
    aiFeedback: parsed.aiFeedback,
  };
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
      case "listLeads": {
        const {
          sortBy = "createdAt",
          sortOrder = "asc",
          status,
          olderThanDays,
          industry,
          city,
          query,
          limit = 10,
        } = args;

        const andClauses: any[] = [
          {
            OR: [
              { createdById: userId },
              { assignedToId: userId },
            ],
          },
        ];

        if (status && status !== "ALL") {
          andClauses.push({ status: status as any });
        }

        if (olderThanDays && !isNaN(Number(olderThanDays))) {
          const cutoffDate = new Date();
          cutoffDate.setDate(cutoffDate.getDate() - Number(olderThanDays));
          andClauses.push({ createdAt: { lte: cutoffDate } });
        }

        if (query?.trim()) {
          andClauses.push({
            OR: [
              { companyName: { contains: query.trim(), mode: "insensitive" } },
              { city: { contains: query.trim(), mode: "insensitive" } },
              { phone: { contains: query.trim(), mode: "insensitive" } },
              { industry: { contains: query.trim(), mode: "insensitive" } },
            ],
          });
        }

        if (city?.trim()) {
          andClauses.push({ city: { contains: city.trim(), mode: "insensitive" } });
        }

        if (industry?.trim()) {
          andClauses.push({ industry: { contains: industry.trim(), mode: "insensitive" } });
        }

        const validSortFields = ["createdAt", "updatedAt", "score", "companyName", "lastContactAt"];
        const sortField = validSortFields.includes(sortBy) ? sortBy : "createdAt";
        const orderDirection = sortOrder === "desc" ? "desc" : "asc";
        const takeLimit = Math.min(50, Math.max(1, Number(limit) || 10));

        const [leads, totalCount] = await Promise.all([
          prisma.lead.findMany({
            where: { AND: andClauses },
            orderBy: { [sortField]: orderDirection },
            take: takeLimit,
            select: {
              id: true,
              companyName: true,
              status: true,
              score: true,
              city: true,
              phone: true,
              industry: true,
              createdAt: true,
              updatedAt: true,
              lastContactAt: true,
            },
          }),
          prisma.lead.count({
            where: { AND: andClauses },
          }),
        ]);

        const now = new Date();
        const formattedLeads = leads.map((l) => {
          const createdDaysAgo = Math.floor((now.getTime() - new Date(l.createdAt).getTime()) / (1000 * 60 * 60 * 24));
          return {
            id: l.id,
            companyName: l.companyName,
            status: l.status,
            score: l.score,
            city: l.city || "k.A.",
            phone: l.phone || "k.A.",
            industry: l.industry || "k.A.",
            createdAt: l.createdAt.toISOString().split("T")[0],
            createdDaysAgo: `${createdDaysAgo} Tage her`,
            lastContactAt: l.lastContactAt ? l.lastContactAt.toISOString().split("T")[0] : "noch nicht kontaktiert",
          };
        });

        return {
          success: true,
          totalMatching: totalCount,
          returnedCount: formattedLeads.length,
          sortBy: sortField,
          sortOrder: orderDirection,
          leads: formattedLeads,
        };
      }

      case "bulkUpdateLeadStatus": {
        const { leadIds, newStatus, currentStatus, olderThanDays, query, limit = 50 } = args;

        if (!newStatus) {
          return { error: "newStatus ist erforderlich (z.B. 'NOT_RELEVANT', 'LOST', 'WON', 'NEW')." };
        }

        const andClauses: any[] = [
          {
            OR: [
              { createdById: userId },
              { assignedToId: userId },
            ],
          },
        ];

        if (Array.isArray(leadIds) && leadIds.length > 0) {
          andClauses.push({ id: { in: leadIds } });
        }

        if (currentStatus && currentStatus !== "ALL") {
          andClauses.push({ status: currentStatus as any });
        }

        if (olderThanDays && !isNaN(Number(olderThanDays))) {
          const cutoffDate = new Date();
          cutoffDate.setDate(cutoffDate.getDate() - Number(olderThanDays));
          andClauses.push({ createdAt: { lte: cutoffDate } });
        }

        if (query?.trim()) {
          andClauses.push({
            OR: [
              { companyName: { contains: query.trim(), mode: "insensitive" } },
              { city: { contains: query.trim(), mode: "insensitive" } },
              { phone: { contains: query.trim(), mode: "insensitive" } },
              { industry: { contains: query.trim(), mode: "insensitive" } },
            ],
          });
        }

        const takeLimit = Math.min(100, Math.max(1, Number(limit) || 50));

        const targetLeads = await prisma.lead.findMany({
          where: { AND: andClauses },
          take: takeLimit,
          select: { id: true, companyName: true, status: true },
        });

        if (targetLeads.length === 0) {
          return {
            success: true,
            count: 0,
            message: "Keine passenden Leads gefunden, die aktualisiert werden konnten.",
            updatedLeads: [],
          };
        }

        const idsToUpdate = targetLeads.map((l) => l.id);

        await prisma.lead.updateMany({
          where: { id: { in: idsToUpdate } },
          data: { status: newStatus as any },
        });

        return {
          success: true,
          count: idsToUpdate.length,
          newStatus,
          updatedLeads: targetLeads.map((l) => ({ id: l.id, companyName: l.companyName, previousStatus: l.status })),
        };
      }

      case "searchLeads": {
        const { query = "", status, sortBy = "createdAt", sortOrder = "desc", limit = 10 } = args;
        const andClauses: any[] = [
          {
            OR: [
              { createdById: userId },
              { assignedToId: userId },
            ],
          },
        ];

        if (query && query.trim()) {
          andClauses.push({
            OR: [
              { companyName: { contains: query.trim(), mode: "insensitive" } },
              { city: { contains: query.trim(), mode: "insensitive" } },
              { phone: { contains: query.trim(), mode: "insensitive" } },
              { industry: { contains: query.trim(), mode: "insensitive" } },
            ],
          });
        }

        if (status && status !== "ALL") {
          andClauses.push({ status: status as any });
        }

        const validSortFields = ["createdAt", "updatedAt", "score", "companyName"];
        const sortField = validSortFields.includes(sortBy) ? sortBy : "createdAt";
        const orderDirection = sortOrder === "asc" ? "asc" : "desc";

        const leads = await prisma.lead.findMany({
          where: { AND: andClauses },
          take: Math.min(50, Math.max(1, Number(limit) || 10)),
          orderBy: { [sortField]: orderDirection },
          select: { id: true, companyName: true, status: true, score: true, city: true, phone: true, industry: true, createdAt: true },
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
          select: { id: true, companyName: true, status: true },
        });
        return { success: true, leadId: updated.id, companyName: updated.companyName, status: updated.status };
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

      case "scoutRestaurants": {
        const { location, cuisineType, filterNoMenuOnly, maxResults } = args;
        const results = await runRestaurantScout(
          {
            location: location || "Wien",
            cuisineType,
            filterNoMenuOnly: Boolean(filterNoMenuOnly),
            maxResults: maxResults || 5,
          },
          userId
        );
        return {
          success: true,
          sessionId: results.sessionId,
          totalScouted: results.totalScouted,
          foundCount: results.results.length,
          restaurants: results.results.map((r) => ({
            companyName: r.companyName,
            address: r.address,
            phone: r.phone,
            hasMenu: r.hasMenu,
            menuUrl: r.menuUrl,
            menuSnippet: r.menuSnippet,
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
      name: "listLeads",
      description: "Ruft Leads mit flexibler Filterung und Sortierung ab (z.B. älteste Leads zuerst via sortBy='createdAt' & sortOrder='asc', Filter nach Status, Inaktivität in Tagen oder Stadt). Ideal um Fragen wie 'was ist der älteste Lead', 'welche Leads wurden lange nicht kontaktiert' oder 'zeige mir Leads mit Status X' sofort und präzise zu beantworten.",
      parameters: {
        type: "object",
        properties: {
          sortBy: {
            type: "string",
            enum: ["createdAt", "updatedAt", "score", "companyName", "lastContactAt"],
            description: "Feld nach dem sortiert werden soll (z.B. 'createdAt' für Erstellungsdatum).",
          },
          sortOrder: {
            type: "string",
            enum: ["asc", "desc"],
            description: "'asc' für älteste zuerst / aufsteigend, 'desc' für neueste zuerst / absteigend.",
          },
          status: {
            type: "string",
            description: "Optionaler Status-Filter (z.B. 'NEW', 'RESEARCHED', 'TO_CONTACT', 'CONTACTED', 'FOLLOW_UP', 'WON', 'LOST', 'NOT_RELEVANT', 'ALL').",
          },
          olderThanDays: {
            type: "number",
            description: "Optional: Filtert nur Leads, die vor mehr als X Tagen erstellt wurden.",
          },
          city: {
            type: "string",
            description: "Optional: Stadt-Filter.",
          },
          industry: {
            type: "string",
            description: "Optional: Branchen-Filter.",
          },
          query: {
            type: "string",
            description: "Optionaler Suchbegriff für Name, Stadt oder Branche.",
          },
          limit: {
            type: "integer",
            description: "Maximale Anzahl zurückzugebender Leads (1 bis 50, Standard 10).",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "bulkUpdateLeadStatus",
      description: "Aktualisiert den Status von mehreren Leads auf einmal. Perfekt, um alte oder irrelevante Leads direkt auf 'NOT_RELEVANT' (oder einen anderen Status) zu setzen.",
      parameters: {
        type: "object",
        properties: {
          newStatus: {
            type: "string",
            enum: ["NEW", "RESEARCHED", "TO_CONTACT", "CONTACTED", "REPLIED", "INTERESTED", "APPOINTMENT", "OFFER_SENT", "FOLLOW_UP", "WON", "LOST", "NOT_RELEVANT"],
            description: "Der neue Status (z.B. 'NOT_RELEVANT', 'LOST', 'WON').",
          },
          leadIds: {
            type: "array",
            items: { type: "string" },
            description: "Optionale Liste konkreter Lead-IDs, die aktualisiert werden sollen.",
          },
          currentStatus: {
            type: "string",
            description: "Optionaler Filter: Nur Leads aktualisieren, die aktuell diesen Status haben (z.B. 'NEW').",
          },
          olderThanDays: {
            type: "number",
            description: "Optionaler Filter: Nur Leads aktualisieren, die älter als X Tage sind.",
          },
          query: {
            type: "string",
            description: "Optionaler Suchbegriff zur Eingrenzung der zu aktualisierenden Leads.",
          },
          limit: {
            type: "integer",
            description: "Maximale Anzahl an Leads, die aktualisiert werden sollen (Standard: 50).",
          },
        },
        required: ["newStatus"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "searchLeads",
      description: "Suche nach Leads in der Datenbank anhand eines Suchbegriffs (Name, Stadt, Telefon, Branche). Gibt bis zu 10 Übereinstimmungen zurück.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Der Suchbegriff für Name, Stadt, Branche oder Telefonnummer." },
          status: { type: "string", description: "Optionaler Status-Filter." },
          sortBy: { type: "string", description: "Sortierfeld (z.B. 'createdAt', 'score')." },
          sortOrder: { type: "string", enum: ["asc", "desc"], description: "Sortierreihenfolge." },
          limit: { type: "integer", description: "Maximale Anzahl der Ergebnisse." },
        },
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
      description: "Aktualisiert den Status eines einzelnen Leads. Gültige Status-Werte: NEW, RESEARCHED, TO_CONTACT, CONTACTED, REPLIED, INTERESTED, APPOINTMENT, OFFER_SENT, FOLLOW_UP, WON, LOST, NOT_RELEVANT.",
      parameters: {
        type: "object",
        properties: {
          leadId: { type: "string", description: "Die ID des Leads." },
          status: {
            type: "string",
            enum: ["NEW", "RESEARCHED", "TO_CONTACT", "CONTACTED", "REPLIED", "INTERESTED", "APPOINTMENT", "OFFER_SENT", "FOLLOW_UP", "WON", "LOST", "NOT_RELEVANT"],
            description: "Der neue Status (z.B. 'NOT_RELEVANT', 'WON', 'FOLLOW_UP').",
          },
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
  {
    type: "function",
    function: {
      name: "scoutRestaurants",
      description: "Sucht gezielt nach Restaurants/Gastronomiebetrieben via Google Places, scannt deren Speisekarten per KI und importiert sie als Leads in die Datenbank.",
      parameters: {
        type: "object",
        properties: {
          location: { type: "string", description: "Die Stadt oder der Bezirk (z.B. 'Wien', 'München', '1010 Wien')." },
          cuisineType: { type: "string", description: "Optionale Küchenrichtung (z.B. 'Italienisch', 'Asiatisch', 'Burger', 'Pizzeria')." },
          filterNoMenuOnly: { type: "boolean", description: "Falls true, werden gezielt nur Restaurants ohne auffindbare Online-Speisekarte zurückgegeben." },
          maxResults: { type: "integer", description: "Maximale Anzahl an Ergebnissen (Standard: 5)." },
        },
        required: ["location"],
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
  const systemPrompt = `Du bist ein intelligenter und proaktiver CRM-Assistent für Scale Evo CRM. Du hilfst beim Lead-Management, Lead-Aufräumen und der Vertriebsarbeit.

Aktueller CRM-Snapshot:
- Gesamt-Leads: ${context.totalLeads}
- Offene Follow-ups: ${context.openFollowUps}
- Offene Tasks: ${context.openTasks}
- Top-Leads: ${JSON.stringify(context.topLeads)}
- Letzte Interaktionen: ${JSON.stringify(context.recentInteractions)}

Wichtige Handlungsanweisungen für Tools:
1. Wenn der Nutzer nach dem/den ältesten Leads fragt, Leads nach Datum/Alter auflisten will oder Inaktivität prüfen möchte: Nutze IMMER das Tool 'listLeads' mit sortBy="createdAt" und sortOrder="asc" (für die ältesten Leads zuerst).
2. Wenn der Nutzer alte/irrelevante Leads auf "irrelevant" (Status: NOT_RELEVANT) setzen, aussortieren oder aufräumen möchte: Nutze 'bulkUpdateLeadStatus' oder 'updateLeadStatus' mit newStatus/status="NOT_RELEVANT".
3. Du hast mächtige Tools um Leads zu durchsuchen ('listLeads', 'searchLeads'), Status zu ändern ('updateLeadStatus', 'bulkUpdateLeadStatus'), Aufgaben zu erstellen ('createTask'), Interaktionen zu dokumentieren ('addLeadInteraction') und neue Leads zu finden ('runScoutSession', 'scoutRestaurants').

Antworte auf Deutsch, präzise, freundlich und liste Firmennamen, Erstellungsdatum und Status übersichtlich und verständlich auf.`;

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

    return cleanAndParseJson<{ prioritized: string[]; reasoning: string }>(text, {
      prioritized: tasks.map((t) => t.title),
      reasoning: "Automatische Priorisierung nicht möglich.",
    });
  } catch {
    return {
      prioritized: tasks.map((t) => t.title),
      reasoning: "Automatische Priorisierung nicht möglich.",
    };
  }
}
