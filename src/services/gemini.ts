import { GoogleGenerativeAI, type GenerativeModel, SchemaType } from "@google/generative-ai";
import { prisma } from "@/lib/prisma";
import { runLeadScout } from "./lead-scout";
import { runRestaurantScout } from "./restaurant-scout";

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
  return getClient().getGenerativeModel({ model: "gemini-3.6-flash" });
}

/** Gibt ein Gemini Pro-Modell zurück (für komplexere Aufgaben) */
export function getProModel(): GenerativeModel {
  return getClient().getGenerativeModel({ model: "gemini-3.6-flash" });
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
  console.log(`[Gemini Assistant Tool] Executing ${name} with args:`, args);
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
    model: "gemini-1.5-flash",
    tools: [
      {
        functionDeclarations: [
          {
            name: "listLeads",
            description: "Ruft Leads mit flexibler Filterung und Sortierung ab (z.B. älteste Leads zuerst via sortBy='createdAt' & sortOrder='asc', Filter nach Status, Inaktivität in Tagen oder Stadt). Ideal um Fragen wie 'was ist der älteste Lead', 'welche Leads wurden lange nicht kontaktiert' oder 'zeige mir Leads mit Status X' sofort und präzise zu beantworten.",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                sortBy: {
                  type: SchemaType.STRING,
                  description: "Feld nach dem sortiert werden soll ('createdAt', 'updatedAt', 'score', 'companyName', 'lastContactAt')."
                },
                sortOrder: {
                  type: SchemaType.STRING,
                  description: "'asc' für älteste zuerst / aufsteigend, 'desc' für neueste zuerst / absteigend."
                },
                status: {
                  type: SchemaType.STRING,
                  description: "Optionaler Status-Filter (z.B. 'NEW', 'RESEARCHED', 'TO_CONTACT', 'CONTACTED', 'FOLLOW_UP', 'WON', 'LOST', 'NOT_RELEVANT', 'ALL')."
                },
                olderThanDays: {
                  type: SchemaType.NUMBER,
                  description: "Optional: Filtert nur Leads, die vor mehr als X Tagen erstellt wurden."
                },
                city: {
                  type: SchemaType.STRING,
                  description: "Optional: Stadt-Filter."
                },
                industry: {
                  type: SchemaType.STRING,
                  description: "Optional: Branchen-Filter."
                },
                query: {
                  type: SchemaType.STRING,
                  description: "Optionaler Suchbegriff für Name, Stadt oder Branche."
                },
                limit: {
                  type: SchemaType.INTEGER,
                  description: "Maximale Anzahl zurückzugebender Leads (1 bis 50, Standard 10)."
                }
              }
            }
          },
          {
            name: "bulkUpdateLeadStatus",
            description: "Aktualisiert den Status von mehreren Leads auf einmal. Perfekt, um alte oder irrelevante Leads direkt auf 'NOT_RELEVANT' (oder einen anderen Status) zu setzen.",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                newStatus: {
                  type: SchemaType.STRING,
                  description: "Der neue Status (z.B. 'NOT_RELEVANT', 'LOST', 'WON')."
                },
                leadIds: {
                  type: SchemaType.ARRAY,
                  items: { type: SchemaType.STRING },
                  description: "Optionale Liste konkreter Lead-IDs, die aktualisiert werden sollen."
                },
                currentStatus: {
                  type: SchemaType.STRING,
                  description: "Optionaler Filter: Nur Leads aktualisieren, die aktuell diesen Status haben (z.B. 'NEW')."
                },
                olderThanDays: {
                  type: SchemaType.NUMBER,
                  description: "Optionaler Filter: Nur Leads aktualisieren, die älter als X Tage sind."
                },
                query: {
                  type: SchemaType.STRING,
                  description: "Optionaler Suchbegriff zur Eingrenzung der zu aktualisierenden Leads."
                },
                limit: {
                  type: SchemaType.INTEGER,
                  description: "Maximale Anzahl an Leads, die aktualisiert werden sollen (Standard: 50)."
                }
              },
              required: ["newStatus"]
            }
          },
          {
            name: "searchLeads",
            description: "Suche nach Leads in der Datenbank anhand eines Suchbegriffs (Name, Stadt, Telefon, Branche). Gibt bis zu 10 Übereinstimmungen zurück.",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                query: {
                  type: SchemaType.STRING,
                  description: "Der Suchbegriff für Name, Stadt, Branche oder Telefonnummer."
                },
                status: {
                  type: SchemaType.STRING,
                  description: "Optionaler Status-Filter."
                },
                sortBy: {
                  type: SchemaType.STRING,
                  description: "Sortierfeld (z.B. 'createdAt', 'score')."
                },
                sortOrder: {
                  type: SchemaType.STRING,
                  description: "Sortierreihenfolge ('asc' oder 'desc')."
                },
                limit: {
                  type: SchemaType.INTEGER,
                  description: "Maximale Anzahl der Ergebnisse."
                }
              }
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
                  description: "Der neue Status (z.B. WON, FOLLOW_UP, NOT_RELEVANT)."
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
          },
          {
            name: "scoutRestaurants",
            description: "Sucht gezielt nach Restaurants/Gastronomiebetrieben via Google Places, scannt deren Speisekarten per Gemini KI und importiert sie als Leads in die Datenbank.",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                location: {
                  type: SchemaType.STRING,
                  description: "Die Stadt oder der Bezirk (z.B. 'Wien', 'München', '1010 Wien')."
                },
                cuisineType: {
                  type: SchemaType.STRING,
                  description: "Optionale Küchenrichtung (z.B. 'Italienisch', 'Asiatisch', 'Burger', 'Pizzeria')."
                },
                filterNoMenuOnly: {
                  type: SchemaType.BOOLEAN,
                  description: "Falls true, werden gezielt nur Restaurants ohne auffindbare Online-Speisekarte zurückgegeben."
                },
                maxResults: {
                  type: SchemaType.INTEGER,
                  description: "Maximale Anzahl an Ergebnissen (Standard: 5)."
                }
              },
              required: ["location"]
            }
          }
        ]
      }
    ]
  });

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

  // Build the full conversation history manually.
  // We use model.generateContent() directly instead of startChat()+sendMessage()
  // because ChatSession wraps functionResponse parts with role "function" — a role
  // the new Gemini API no longer accepts (400 Bad Request).
  // By managing the contents array ourselves we control the exact role for every turn.
  const contents: any[] = [
    { role: "user", parts: [{ text: systemPrompt }] },
    { role: "model", parts: [{ text: "Verstanden! Ich bin bereit dir bei deinem CRM zu helfen und Aktionen für dich auszuführen." }] },
    ...history.map((h) => ({ role: h.role, parts: h.parts })),
    { role: "user", parts: [{ text: message }] },
  ];

  let result = await model.generateContent({ contents });
  let calls = result.response.functionCalls();

  while (calls && calls.length > 0) {
    // Append the model's tool-call turn to history
    contents.push({ role: "model", parts: result.response.candidates![0].content.parts });

    // Execute all tool calls in parallel and build the response turn
    const toolResponseParts = await Promise.all(
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

    // Append the tool responses as a "user" role turn (Gemini API requirement:
    // functionResponse parts must be sent with role "user", not "tool" or "function")
    contents.push({ role: "user", parts: toolResponseParts });

    result = await model.generateContent({ contents });
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
