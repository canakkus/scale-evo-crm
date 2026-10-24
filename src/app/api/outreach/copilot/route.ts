import { NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { leadScope } from "@/lib/workspace";
import { withGroqClient } from "@/lib/groq-key-manager";
import { getFlashModel } from "@/services/gemini";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const SYSTEM_PROMPT = `Du bist ein absoluter Kaltakquise- und Vertriebs-Profi für ScaleEvo in Wien (Österreich).
Du erstellst praxisnahe, authentische Kaltakquise-Skripte und Telefon-/Walk-In-Leitfäden für lokale Betriebe (Friseure, Barber, Physio/Beauty/Kosmetik, Gastronomie, Handwerk, Dienstleister).
Ziel der Ansprache ist IMMER der Verkauf von modernen Websites, Online-Terminbuchungssystemen oder NFC-Demo-Tools.

DEINE REGELN:
1. Keine leeren Floskeln ("Hoffe es geht gut", "Ich bin Can von...", "Störe ich?").
2. ECHTER HOOK: Nutze den Betriebskontext (z. B. "Über uns", Gründergeschichte, Spezialisierungen) und echte Website-Audit-Befunde als konkreten, glaubwürdigen Aufhänger in Sekunde 5.
3. WENN DER NUTZER TEXT REINKOPIERT (z. B. Über-uns-Seiten, Speisekarten, Kundenrezensionen):
   - Erkenne reinkopierten Website-Text automatisch als Kontext.
   - Extrahiere sofort den stärksten Hebel und die Identität des Betriebs (z. B. "Familienbetrieb seit 1985", "Spezialist für Locken", "keine Online-Preise").
   - Baue daraus direkt einen maßgeschneiderten Opener, ohne dass der Nutzer extra Erklärungen tippen muss.
4. SPRACHE & TONALITÄT:
   - Authentisches Deutsch / Österreichisch.
   - Wienerisch / Locker: Natürlicher Wiener Schmäh, direkt, auf Augenhöhe, kein peinlicher oder aufgesetzter Slang.
   - Professionelles Du: Direkt, dynamisch, modern.
   - Sie: Respektvoll, sachlich, lösungsorientiert.
5. KEIN TECH-JARGON: Übersetze technische Probleme in den echten Geschäftsschmerz des Inhabers (z. B. "Kunden springen mobil ab", "Termine gehen verloren", "Rezeption ist mit Telefonaten überlastet", niemals sterile Quelltext-Audit-Vorträge wie "WordPress 5.8 Vulnerability").
6. EINWAND "WIR HABEN GENUG KUNDEN / SIND VOLL":
   - Niemals mit "Wachstum / mehr Umsatz" antworten!
   - Volle Praxen/Salons wollen ENTLASTUNG: "Telefon-Klingeln während der Behandlung stoppen", "1–2 Stunden Rezeptionsarbeit pro Tag sparen", "No-Shows / Terminausfälle eliminieren".
7. FORMATIERUNG (AM TELEFON SOFORT LESBAR):
   - KEINE Markdown-Tabellen (| col | col |)! Am Telefon sind Tabellen unbrauchbar.
   - Nutze klare, direkt lesbare Dialog-Blöcke mit Sprechpausen:
     **Du:** „...“ *(Sprechpause)*
     **Empfang / Inhaber:** „...“
   - Struktur:
     **🎯 Einstieg & Hook** (Sekunde 0–10)
     **💥 Problem / Beobachtung**
     **💡 Entlastung & Pitch**
     **🤝 Call-to-Action (CTA)** (z. B. 2-Minuten WhatsApp-Demo oder kurzer Walk-In)
     **🛡️ Schnelle Einwandbehandlung**
   - Namen-Platzhalter wie [Dein Name] oder [Ansprechpartner] sauber in eckigen Klammern kennzeichnen.
8. ITERATIONEN & REFINEMENT:
   - Wenn der Nutzer Folgefragen stellt oder Anpassungen wünscht ("Kürzer", "Frecher", "Anderer Einstieg", "Fokussier auf X"), passe das Skript sofort präzise und direkt an – ohne lange Erklärungen oder Preamble!`;

export async function POST(request: Request) {
  try {
    const user = await getOptionalUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    const body = await request.json();
    const {
      leadId,
      contextText = "",
      messages = [],
      channel = "PHONE",
      tone = "CASUAL_VIENNESE",
    } = body as {
      leadId?: string;
      contextText?: string;
      messages?: ChatMessage[];
      channel?: "PHONE" | "WALK_IN" | "INSTAGRAM_DM";
      tone?: "CASUAL_VIENNESE" | "PROFESSIONAL_DU" | "FORMAL_SIE";
    };

    let leadInfo = "";
    if (leadId) {
      const lead = await prisma.lead.findFirst({
        where: { id: leadId, ...(await leadScope(user)) },
        select: {
          companyName: true,
          industry: true,
          city: true,
          address: true,
          phone: true,
          website: true,
          contactPerson: true,
          instagram: true,
          auditIssues: {
            where: {
              severity: { in: ["CRITICAL", "HIGH", "MEDIUM"] },
            },
            select: {
              title: true,
              category: true,
              severity: true,
            },
            take: 6,
          },
        },
      });

      if (lead) {
        const auditText = lead.auditIssues?.length
          ? `\nECHTE WEBSITE-AUDIT-BEFUNDE:\n${lead.auditIssues.map((a) => `- [${a.severity}] ${a.title}`).join("\n")}`
          : "";

        leadInfo = `
LEAD-DATEN:
- Betrieb: ${lead.companyName}
- Branche: ${lead.industry || "Unbekannt"}
- Ort: ${lead.city || "Wien"}
- Ansprechpartner: ${lead.contactPerson || "Inhaber / Geschäftsführung"}
- Telefon: ${lead.phone || "Nicht hinterlegt"}
- Website: ${lead.website || "Keine"}
- Instagram: ${lead.instagram || "Keines"}${auditText}
`;
      }
    }

    const toneInstruction =
      tone === "CASUAL_VIENNESE"
        ? "Tonalität: Locker, authentisch wienerisch, auf Augenhöhe, vertriebsstark."
        : tone === "PROFESSIONAL_DU"
        ? "Tonalität: Professionelles Du, modern, dynamisch, direkt."
        : "Tonalität: Sachliches, respektvolles Sie, B2B-orientiert.";

    const channelInstruction =
      channel === "PHONE"
        ? "Kanal: Telefon-Kaltakquise (Call Script mit Sprechpausen und Leitfaden)."
        : channel === "WALK_IN"
        ? "Kanal: Persönlicher Walk-In (kurzer Vor-Ort-Einstieg im Geschäft)."
        : "Kanal: Instagram DM (knackige Direktnachricht mit Call to Action).";

    const contextInstruction = contextText.trim()
      ? `GEFÜTTERTE "ÜBER UNS" / WEBSITE-INFOS:\n"""\n${contextText.trim()}\n"""`
      : "Keine zusätzlichen 'Über uns'-Texte angegeben. Nutze die Basis-Fakten.";

    const formattedMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      {
        role: "system",
        content: `${SYSTEM_PROMPT}\n\n${leadInfo}\n${channelInstruction}\n${toneInstruction}\n${contextInstruction}`,
      },
      ...messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    ];

    // Primär Groq (Llama / GPT-OSS 120B) mit automatischer Key-Rotation
    try {
      const reply = await withGroqClient(async (client) => {
        const response = await client.chat.completions.create({
          model: "openai/gpt-oss-120b",
          messages: formattedMessages,
          temperature: 0.6,
          max_tokens: 1800,
        });
        return response.choices[0]?.message?.content || "";
      });

      if (reply) {
        return NextResponse.json({ reply });
      }
    } catch (groqError) {
      console.warn("[Groq Outreach Copilot] Groq failed, trying fallback...", groqError);
    }

    // Fallback: Gemini Flash
    try {
      const flash = getFlashModel();
      const combinedHistory = formattedMessages
        .map((m) => `${m.role.toUpperCase()}:\n${m.content}`)
        .join("\n\n");
      const res = await flash.generateContent(combinedHistory);
      const geminiReply = res.response.text();
      return NextResponse.json({ reply: geminiReply });
    } catch (geminiError) {
      console.error("[Groq Outreach Copilot] Both Groq and Gemini failed:", geminiError);
      return NextResponse.json(
        { error: "KI-Service aktuell nicht erreichbar. Bitte kurz erneut versuchen." },
        { status: 503 }
      );
    }
  } catch (error) {
    console.error("[POST /api/outreach/copilot] Error:", error);
    return NextResponse.json({ error: "Fehler beim Verarbeiten der Anfrage." }, { status: 500 });
  }
}
