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
2. Nutze den gefütterten Kontext (z.B. "Über uns", Gründergeschichte, Speisekarte, Spezialisierungen) als echten, persönlichen HOOK.
3. Sprache: Authentisches Deutsch / Österreichisch (bei Wienerisch: natürlicher Wiener Schmäh / lockeres Denglisch ohne peinlich zu wirken; bei "Du": direkt & Augenhöhe; bei "Sie": professionell, respektvoll, modern).
4. KEIN TECH-JARGON: Niemals Web-Begriffe wie "Bootstrap-Theme", "Contact Form 7", "React", "Plugin", "Theme von 2023" erwähnen! Inhaber verstehen das nicht und werten es als Spam. Formuliere Schmerzen immer aus Sicht von Patienten/Kunden & Empfangsentlastung (z.B. "Wer am Wochenende mit Schmerzen buchen will, muss warten", "Telefon klingelt während Behandlung", "Rezeption tippt Termine manuell ein").
5. Einwand "Wir haben schon genug Kunden / Wir sind voll": Niemals mit "Wachstum unterstützen" antworten! Volle Praxen/Salons wollen kein Wachstum – sie wollen ENTLASTUNG: "Telefon-Chaos stoppen, Rezeption 1–2h pro Tag entlasten, Terminausfälle (No-Shows) eliminieren".
6. FORMATIERUNG (WICHTIG):
   - KEINE Markdown-Tabellen (| col | col |)! Am Telefon sind Tabellen unbrauchbar.
   - Verwende stattdessen saubere, direkt lesbare Dialog-Blöcke mit klaren Rollen und Sprechpausen:
     **Du (wenn Inhaber erreichbar):** „...“ *(2s Pause)*
     **Sie (Empfang / formell):** „...“ *(2s Pause)*
   - Struktur:
     **🎯 Hook & Einstieg**
     **💥 Pain & Beobachtung**
     **💡 Value / Pitch**
     **🤝 Call-to-Action (CTA)** (z.B. 2-Minuten WhatsApp-Demo)
     **🛡️ Einwandbehandlung (Quick Rebuttals)**
   - Kennzeichne Namen-Platzhalter wie [Dein Name] oder [Ansprechpartner] sauber in eckigen Klammern.

Wenn der Nutzer Folgefragen stellt oder Anpassungen wünscht (z.B. "Mach es kürzer", "Fokussier auf X", "Anderer Einwand"), passe das Skript sofort präzise und direkt an!`;

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
        },
      });

      if (lead) {
        leadInfo = `
LEAD-DATEN:
- Betrieb: ${lead.companyName}
- Branche: ${lead.industry || "Unbekannt"}
- Ort: ${lead.city || "Wien"}
- Ansprechpartner: ${lead.contactPerson || "Inhaber / Geschäftsführung"}
- Telefon: ${lead.phone || "Nicht hinterlegt"}
- Website: ${lead.website || "Keine"}
- Instagram: ${lead.instagram || "Keines"}
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
