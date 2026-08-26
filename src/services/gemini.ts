import { GoogleGenerativeAI, type GenerativeModel, SchemaType } from "@google/generative-ai";
import { prisma } from "@/lib/prisma";
import { runLeadScout } from "./lead-scout";

// Singleton Gemini client
let _client: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  if (!_client) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY ist nicht konfiguriert.");
    _client = new GoogleGenerativeAI(key);
  }
  return _client;
}

/** Gibt ein Gemini Flash-Modell zurück (günstig + schnell für die meisten Tasks) */
export function getFlashModel(): GenerativeModel {
  return getClient().getGenerativeModel({ model: "gemini-2.0-flash" });
}

/** Gibt ein Gemini Pro-Modell zurück (für komplexere Aufgaben) */
export function getProModel(): GenerativeModel {
  return getClient().getGenerativeModel({ model: "gemini-2.0-flash" });
}

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
 * Transkribiert eine Audiodatei und analysiert sie mit Gemini.
 * @param audioBase64 - Base64-kodierte Audiodatei
 * @param mimeType - MIME-Typ der Datei (z.B. "audio/mp3")
 * @param companyName - Firmenname des Leads (für Kontext)
 */
export async function transcribeAndAnalyzeCall(
  audioBase64: string,
  mimeType: string,
  companyName?: string
): Promise<CallAnalysis> {
  const model = getFlashModel();
  const context = companyName ? `Der Call war mit ${companyName}.` : "";

  const prompt = `Du bist ein Vertriebsassistent und Rhetorik-Coach. ${context}

Analysiere diesen Verkaufscall und antworte NUR mit gültigem JSON ohne Markdown-Blöcke:

{
  "transcription": "vollständige Transkription des Calls",
  "summary": "kurze Zusammenfassung in 2-3 Sätzen",
  "nextSteps": ["konkrete nächste Schritte als Array"],
  "sentiment": "POSITIVE|NEUTRAL|NEGATIVE|MIXED",
  "extractedData": {
    "contactName": "Name des Ansprechpartners wenn erwähnt",
    "appointmentDate": "Termin wenn vereinbart",
    "objections": ["Einwände als Array"],
    "interestLevel": "HIGH|MEDIUM|LOW|NONE"
  },
  "aiFeedback": {
    "pace": "Redegeschwindigkeit und Rhythmus des Anrufers (z.B. 'Ruhig und kontrolliert', 'Etwas zu schnell')",
    "stuttering": "Verwendung von Füllwörtern wie 'äh', 'öhm' oder Stottern (z.B. 'Flüssig, kaum Füllwörter', 'Häufiges Äh-Sagen')",
    "tone": "Tonfall und Gelassenheit des Anrufers (z.B. 'Sehr gelassen und selbstbewusst', 'Etwas nervös/unsicher')",
    "tips": ["Konkrete Rhetorik-Tipps zur Verbesserung als Array (z.B. 'Mehr Sprechpausen einbauen')"]
  }
}`;

  const result = await model.generateContent([
    { text: prompt },
    {
      inlineData: {
        mimeType,
        data: audioBase64,
      },
    },
  ]);

  const text = result.response.text().trim();
  // Entferne mögliche Markdown-Blöcke
  const jsonStr = text.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "");

  try {
    return JSON.parse(jsonStr) as CallAnalysis;
  } catch {
    throw new Error(`Gemini returned invalid JSON: ${text.slice(0, 200)}`);
  }
}

// ============================================================
// AI Assistant Chat
// ============================================================

export interface CrmContext {
  totalLeads: number;
  openFollowUps: number;
  openTasks: number;
  topLeads: Array<{ name: string; status: string; score: number }>;
  recentInteractions: Array<{ leadName: string; type: string; note: string }>;
}

export async function executeAssistantTool(name: string, args: any, userId: string): Promise<any> {
  console.log(`[Assistant Tool] Executing ${name} with args:`, args);
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
    console.error(`[Assistant Tool] Error executing ${name}:`, err);
    return { error: err.message || "Fehler bei der Tool-Ausführung." };
  }
}

/**
 * Sendet eine Chat-Nachricht an Gemini mit CRM-Kontext und Tool-Calling-Support.
 */
export async function chatWithAssistant(
  message: string,
  history: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }>,
  context: CrmContext,
  userId: string
): Promise<string> {
  const model = getClient().getGenerativeModel({
    model: "gemini-2.0-flash",
    tools: [
      {
        functionDeclarations: [
          {
            name: "searchLeads",
            description: "Suche nach Leads in der Datenbank anhand eines Suchbegriffs (Name, Stadt, Telefon, Branche). Gibt bis zu 10 Übereinstimmungen zurück.",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                query: {
                  type: SchemaType.STRING,
                  description: "Der Suchbegriff für Name, Stadt, Branche oder Telefonnummer."
                }
              },
              required: ["query"]
            }
          },
          {
            name: "getLeadDetails",
            description: "Ruft alle Details, die letzten 5 Interaktionen und die letzten 5 Tasks für einen Lead anhand seiner ID ab.",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                leadId: {
                  type: SchemaType.STRING,
                  description: "Die ID des Leads."
                }
              },
              required: ["leadId"]
            }
          },
          {
            name: "updateLeadStatus",
            description: "Aktualisiert den Status eines Leads. Gültige Status-Werte: NEW, RESEARCHED, TO_CONTACT, CONTACTED, REPLIED, INTERESTED, APPOINTMENT, OFFER_SENT, FOLLOW_UP, WON, LOST, NOT_RELEVANT.",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                leadId: {
                  type: SchemaType.STRING,
                  description: "Die ID des Leads."
                },
                status: {
                  type: SchemaType.STRING,
                  description: "Der neue Status (z.B. WON, FOLLOW_UP)."
                }
              },
              required: ["leadId", "status"]
            }
          },
          {
            name: "createTask",
            description: "Erstellt eine neue Aufgabe für einen Lead oder allgemein. Kategorien: SALES, ADMIN, FOLLOW_UP, COLD_OUTREACH, OTHER. Priorität: LOW, MEDIUM, HIGH.",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                leadId: {
                  type: SchemaType.STRING,
                  description: "Die ID des verknüpften Leads (optional)."
                },
                title: {
                  type: SchemaType.STRING,
                  description: "Der Titel der Aufgabe."
                },
                category: {
                  type: SchemaType.STRING,
                  description: "Die Kategorie (SALES, ADMIN, FOLLOW_UP, COLD_OUTREACH, OTHER)."
                },
                priority: {
                  type: SchemaType.STRING,
                  description: "Die Priorität (LOW, MEDIUM, HIGH)."
                },
                dueAt: {
                  type: SchemaType.STRING,
                  description: "Optionales Fälligkeitsdatum als ISO-String (z.B. '2026-08-26T12:00:00Z')."
                }
              },
              required: ["title", "category", "priority"]
            }
          },
          {
            name: "addLeadInteraction",
            description: "Fügt ein neues Interaktionsprotokoll (Notiz, Telefonat, Mail etc.) zu einem Lead hinzu. Typen: PHONE, IN_PERSON, EMAIL, INSTAGRAM, WHATSAPP, MEETING, OFFER, NOTE.",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                leadId: {
                  type: SchemaType.STRING,
                  description: "Die ID des Leads."
                },
                type: {
                  type: SchemaType.STRING,
                  description: "Der Interaktionstyp (PHONE, IN_PERSON, EMAIL, INSTAGRAM, WHATSAPP, MEETING, OFFER, NOTE)."
                },
                note: {
                  type: SchemaType.STRING,
                  description: "Der Inhalt des Protokolls bzw. die Notiz."
                }
              },
              required: ["leadId", "type", "note"]
            }
          },
          {
            name: "runScoutSession",
            description: "Startet eine Lead-Scout-Suche über Google Places und importiert die gefundenen Leads direkt in die Datenbank.",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                category: {
                  type: SchemaType.STRING,
                  description: "Die Suchkategorie (z.B. 'Friseur', 'Barber', 'Kosmetik')."
                },
                city: {
                  type: SchemaType.STRING,
                  description: "Die Stadt (z.B. 'Wien', 'Graz')."
                },
                maxResults: {
                  type: SchemaType.INTEGER,
                  description: "Die maximale Anzahl der zu importierenden Ergebnisse (Standard ist 5)."
                }
              },
              required: ["category", "city"]
            }
          }
        ]
      }
    ]
  });

  const systemPrompt = `Du bist ein intelligenter CRM-Assistent für Scale Evo CRM. Du hilfst beim Lead-Management und der Vertriebsarbeit.

Aktueller CRM-Snapshot:
- Gesamt-Leads: ${context.totalLeads}
- Offene Follow-ups: ${context.openFollowUps}
- Offene Tasks: ${context.openTasks}
- Top-Leads: ${JSON.stringify(context.topLeads)}
- Letzte Interaktionen: ${JSON.stringify(context.recentInteractions)}

Du kannst direkt Aktionen ausführen wie Suchen, Status ändern, Interaktionen hinzufügen, Aufgaben erstellen und den Lead Scout ausführen unter Verwendung deiner Tools. 
Antworte auf Deutsch, kurz, freundlich und hilfreich.`;

  const chat = model.startChat({
    history: [
      { role: "user", parts: [{ text: systemPrompt }] },
      { role: "model", parts: [{ text: "Verstanden! Ich bin bereit dir bei deinem CRM zu helfen und Aktionen für dich auszuführen." }] },
      ...history,
    ],
  });

  let result = await chat.sendMessage(message);
  let calls = result.response.functionCalls();

  while (calls && calls.length > 0) {
    // Each function response must be sent as a Part with a `functionResponse` key.
    // Sending raw objects causes the SDK to emit role "function" which the API rejects.
    const responseParts = await Promise.all(
      calls.map(async (call) => {
        const responseData = await executeAssistantTool(call.name, call.args, userId);
        return {
          functionResponse: {
            name: call.name,
            response: { result: responseData },
          },
        };
      })
    );
    result = await chat.sendMessage(responseParts);
    calls = result.response.functionCalls();
  }

  return result.response.text();
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
  const model = getFlashModel();

  const prompt = `Du bist ein Produktivitätsassistent. Priorisiere diese Tasks für heute.

Tasks: ${JSON.stringify(tasks)}
Fällige Follow-ups: ${JSON.stringify(followUps)}

Antworte NUR mit gültigem JSON:
{
  "prioritized": ["Task 1", "Task 2", ...],
  "reasoning": "kurze Begründung der Priorisierung"
}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  const jsonStr = text.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "");

  try {
    return JSON.parse(jsonStr);
  } catch {
    return {
      prioritized: tasks.map((t) => t.title),
      reasoning: "Automatische Priorisierung nicht möglich.",
    };
  }
}
