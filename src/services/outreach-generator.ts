/**
 * ============================================================
 * OUTREACH-GENERATOR
 * ============================================================
 * Erzeugt personalisierte Erstansprachen — wahlweise als
 * Instagram-DM oder als Telefon-/Walk-In-Gesprächseinstieg.
 *
 * Kernregel: Ohne konkreten Aufhänger wird NICHTS generiert.
 * Eine Nachricht ohne echten Bezug zum Profil ist ein Serienbrief,
 * und Serienbriefe schaden dem Absender mehr, als sie nützen.
 *
 * Nutzt Groq (primär, mit Key-Rotation) und fällt bei Ausfall auf
 * Gemini zurück — dasselbe Muster wie die Call-Analyse.
 * ============================================================
 */

import { withGroqClient } from "@/lib/groq-key-manager";
import { getFlashModel } from "./gemini";
import { TAG_LABELS } from "./instagram/score";

export type OutreachChannelKey = "INSTAGRAM_DM" | "PHONE";
export type OutreachToneKey = "CASUAL_VIENNESE" | "PROFESSIONAL_DU" | "FORMAL_SIE";

export type OutreachAnchor = {
  key: string;
  label: string;
  detail: string;
};

export type OutreachInput = {
  companyName: string;
  industry?: string | null;
  city?: string | null;
  handle?: string | null;
  bio?: string | null;
  followerCount?: number | null;
  daysSinceLastPost?: number | null;
  tags: string[];
  anchor: OutreachAnchor | null;
  channel: OutreachChannelKey;
  tone: OutreachToneKey;
  sequenceStep?: number;
};

export type OutreachVariant = {
  index: number;
  body: string;
  charCount: number;
};

export type OutreachResult =
  | { ok: true; variants: OutreachVariant[]; anchorUsed: string }
  | { ok: false; reason: string };

const TONE_INSTRUCTIONS: Record<OutreachToneKey, string> = {
  CASUAL_VIENNESE:
    'Locker und wienerisch. Du-Form, leichter Dialekt-Einschlag ("Servus", "is", "a"), maximal ein Emoji. Klingt wie eine Nachricht unter Bekannten, nicht wie Werbung.',
  PROFESSIONAL_DU:
    "Professionell, aber Du-Form. Hochdeutsch, freundlich, ohne Dialekt und ohne Emoji. Sachlich und direkt.",
  FORMAL_SIE:
    "Sachlich in der Sie-Form. Hochdeutsch, respektvoll, kein Emoji, keine Umgangssprache.",
};

const CHANNEL_INSTRUCTIONS: Record<OutreachChannelKey, string> = {
  INSTAGRAM_DM:
    "Es ist eine Instagram-Direktnachricht. Maximal 400 Zeichen, maximal 4 kurze Zeilen. Keine Anrede mit vollem Namen, keine Signatur, keine Links.",
  PHONE:
    "Es ist ein gesprochener Gesprächseinstieg für einen Telefonanruf oder einen Besuch vor Ort. Maximal 300 Zeichen. Es muss sich natürlich sprechen lassen — keine Aufzählungen, keine Emojis, keine Schriftsprache.",
};

const SEQUENCE_INSTRUCTIONS: Record<number, string> = {
  0: "Es ist die allererste Kontaktaufnahme.",
  1: "Es ist ein Follow-up nach 3 Tagen ohne Antwort. Bringe einen NEUEN Blickwinkel statt nachzuhaken, und baue eine Ausstiegsklausel ein (sinngemäß: wenn kein Interesse, meldest du dich nicht mehr).",
  2: "Es ist der letzte Kontaktversuch nach 7 Tagen. Sehr kurz, freundlich, ohne Druck, mit klarem Schlusspunkt.",
};

function buildPrompt(input: OutreachInput): string {
  const anchor = input.anchor!;
  const tagLabels = input.tags.map((tag) => TAG_LABELS[tag] ?? tag).filter(Boolean);
  const facts = [
    `Betrieb: ${input.companyName}`,
    input.industry ? `Branche: ${input.industry}` : null,
    input.city ? `Ort: ${input.city}` : null,
    input.handle ? `Instagram: @${input.handle}` : null,
    input.bio ? `Bio-Text: "${input.bio}"` : null,
    input.followerCount != null ? `Follower: ${input.followerCount}` : null,
    input.daysSinceLastPost != null ? `Letzter Post vor ${input.daysSinceLastPost} Tagen` : null,
    tagLabels.length > 0 ? `Erkannte Schwachstellen: ${tagLabels.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return `Du bist ein erfahrener Vertriebler aus Wien. Du verkaufst Websites und Online-Terminbuchung an lokale Betriebe (Friseure, Barber, Kosmetik, Nagelstudios, Gastronomie).

Schreibe DREI unterschiedliche Erstansprachen für den folgenden Betrieb.

BETRIEB:
${facts}

DER AUFHÄNGER, auf den du dich beziehen MUSST:
${anchor.label}: ${anchor.detail}

KANAL: ${CHANNEL_INSTRUCTIONS[input.channel]}
TONALITÄT: ${TONE_INSTRUCTIONS[input.tone]}
KONTEXT: ${SEQUENCE_INSTRUCTIONS[input.sequenceStep ?? 0] ?? SEQUENCE_INSTRUCTIONS[0]}

AUFBAU jeder Nachricht (4 Zeilen):
1. Hook — eine konkrete Beobachtung aus dem Aufhänger. Keine Frage, kein "Hallo, ich bin...".
2. Schmerz — benenne die Schwachstelle als Beobachtung, niemals als Vorwurf.
3. Wert — EIN konkretes Ergebnis, kein Leistungskatalog.
4. CTA — ein Mini-Commitment, das man mit Ja oder Nein beantworten kann. NIEMALS "Hast du 15 Minuten für ein Gespräch?".

ABSOLUT VERBOTEN:
- ERFUNDENE ZAHLEN. Keine Prozentangaben, keine Statistiken, keine Versprechen wie "25 % mehr Gäste", "40 % weniger Aufwand" oder "im Schnitt 30 % mehr Buchungen". Du hast keine solchen Daten. Solche Behauptungen sind nachweislich falsch und beschädigen die Glaubwürdigkeit des Absenders.
- BEHAUPTUNGEN ÜBER DINGE, DIE OBEN NICHT STEHEN. Sage nichts über das Aussehen, das Alter oder die Qualität einer Website, über Wartezeiten, über Auslastung oder über interne Abläufe, wenn es nicht ausdrücklich in den Fakten oben steht. Wenn du es nicht weißt, erwähne es nicht.
- Die Followerzahl als Kompliment ("Wow, 2400 Follower!") — das klingt sofort nach Bot.
- Floskeln wie "Ich hoffe, es geht dir gut" oder "Ich melde mich, weil...".
- Übertreibungen, Superlative, Verkaufsdruck.
- Die drei Varianten dürfen sich nicht nur im Wortlaut unterscheiden — jede braucht einen anderen Hook.

Der Wert-Satz beschreibt, WAS du baust und was es dem Betrieb im Alltag erspart — nicht, wie viel es angeblich bringt. Beispiel gut: "Ich bau für Wiener Betriebe Seiten, wo Gäste selber reservieren — das spart dir die Tipperei am Abend." Beispiel schlecht: "Das bringt euch 30 % mehr Reservierungen."

Antworte AUSSCHLIESSLICH mit diesem JSON:
{
  "variants": [
    { "body": "Text der ersten Variante" },
    { "body": "Text der zweiten Variante" },
    { "body": "Text der dritten Variante" }
  ]
}`;
}

/** Entfernt <think>-Blöcke und Markdown-Zäune, wie in groq.ts. */
function parseVariants(raw: string): string[] {
  let text = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  text = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) return [];
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as { variants?: Array<{ body?: string }> };
    return (parsed.variants ?? [])
      .map((variant) => (variant?.body ?? "").trim())
      .filter((body) => body.length > 0);
  } catch {
    return [];
  }
}

/**
 * Erzeugt drei Varianten. Gibt `ok: false` zurück, wenn kein Aufhänger
 * vorliegt oder die KI nichts Brauchbares liefert — es wird bewusst
 * nichts erfunden, um eine Nachricht produzieren zu können.
 */
export async function generateOutreachVariants(input: OutreachInput): Promise<OutreachResult> {
  if (!input.anchor) {
    return {
      ok: false,
      reason:
        "Zu wenig Profildaten für eine persönliche Nachricht. Profil manuell ansehen und einen Aufhänger auswählen.",
    };
  }

  const prompt = buildPrompt(input);
  let bodies: string[] = [];

  // 1. Groq (primär, mit automatischer Key-Rotation bei Rate-Limits)
  try {
    const raw = await withGroqClient(async (client) => {
      const response = await client.chat.completions.create({
        model: "openai/gpt-oss-120b",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.7,
        max_tokens: 2048,
      });
      return (response.choices[0]?.message?.content || "").trim();
    });
    bodies = parseVariants(raw);
  } catch (error) {
    console.error("[outreach] Groq fehlgeschlagen:", error);
  }

  // 2. Gemini als Fallback
  if (bodies.length === 0) {
    try {
      const result = await getFlashModel().generateContent(prompt);
      bodies = parseVariants(result.response.text());
    } catch (error) {
      console.error("[outreach] Gemini-Fallback fehlgeschlagen:", error);
    }
  }

  if (bodies.length === 0) {
    return { ok: false, reason: "KI-Generierung fehlgeschlagen. Bitte erneut versuchen." };
  }

  return {
    ok: true,
    anchorUsed: input.anchor.label,
    variants: bodies.slice(0, 3).map((body, index) => ({
      index,
      body,
      charCount: body.length,
    })),
  };
}

/**
 * Leitet die verfügbaren Aufhänger aus den Profildaten ab.
 * Der erste Eintrag ist der stärkste und wird vorausgewählt.
 */
export function deriveAnchors(input: {
  bio?: string | null;
  tags: string[];
  daysSinceLastPost?: number | null;
  city?: string | null;
  googleRating?: number | null;
}): OutreachAnchor[] {
  const anchors: OutreachAnchor[] = [];

  if (input.daysSinceLastPost != null && input.daysSinceLastPost <= 30) {
    anchors.push({
      key: "LAST_POST",
      label: "Letzter Post",
      detail: `Der Betrieb hat vor ${input.daysSinceLastPost} Tagen zuletzt gepostet und ist sichtbar aktiv.`,
    });
  }

  for (const tag of input.tags) {
    const label = TAG_LABELS[tag];
    if (!label) continue;
    anchors.push({
      key: `TAG_${tag}`,
      label,
      detail: TAG_DETAILS[tag] ?? label,
    });
  }

  if (input.bio && input.bio.trim().length >= 10) {
    anchors.push({
      key: "BIO",
      label: "Bio-Text",
      detail: `In der Instagram-Bio steht: "${input.bio.trim().slice(0, 200)}"`,
    });
  }

  if (input.googleRating != null && input.googleRating >= 4.3) {
    anchors.push({
      key: "RATING",
      label: "Google-Bewertung",
      detail: `Der Betrieb hat ${input.googleRating.toFixed(1)} Sterne auf Google — überdurchschnittlich gut.`,
    });
  }

  return anchors;
}

const TAG_DETAILS: Record<string, string> = {
  NO_WEBSITE: "Es gibt keinen Link in der Instagram-Bio und keine eigene Website.",
  LINKTREE_ONLY: "In der Bio führt der Link nur auf ein Linktree, nicht auf eine eigene Website.",
  DM_BOOKING: "Termine werden laut Bio ausschließlich über Instagram-Direktnachrichten vergeben.",
  ACTIVE_POSTER: "Der Account wird regelmäßig bespielt.",
};
