import { GoogleGenerativeAI, type GenerativeModel } from "@google/generative-ai";

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

  const prompt = `Du bist ein Vertriebsassistent. ${context}

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

/**
 * Sendet eine Chat-Nachricht an Gemini mit CRM-Kontext.
 */
export async function chatWithAssistant(
  message: string,
  history: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }>,
  context: CrmContext
): Promise<string> {
  const model = getFlashModel();

  const systemPrompt = `Du bist ein intelligenter CRM-Assistent für Scale Evo CRM. Du hilfst beim Lead-Management und der Vertriebsarbeit.

Aktueller CRM-Snapshot:
- Gesamt-Leads: ${context.totalLeads}
- Offene Follow-ups: ${context.openFollowUps}
- Offene Tasks: ${context.openTasks}
- Top-Leads: ${JSON.stringify(context.topLeads)}
- Letzte Interaktionen: ${JSON.stringify(context.recentInteractions)}

Antworte auf Deutsch, kurz und hilfreich. Bei Aktionen (Status ändern, Task erstellen etc.) 
erkläre was getan werden soll, da du selbst keine Datenbankoperationen ausführen kannst.`;

  const chat = model.startChat({
    history: [
      { role: "user", parts: [{ text: systemPrompt }] },
      { role: "model", parts: [{ text: "Verstanden! Ich bin bereit dir bei deinem CRM zu helfen." }] },
      ...history,
    ],
  });

  const result = await chat.sendMessage(message);
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
