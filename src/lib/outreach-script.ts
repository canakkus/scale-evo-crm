/**
 * Kanonisches Parsing und In-Place-Aktualisieren von Kaltakquise-Skripten in Lead-Notizen.
 * Verhindert Duplikate, schuetzt manuelle Notizen und trennt KI-Entwuerfe von ausgewaehlten Skripten.
 */

export const OUTREACH_SCRIPT_START = "<!-- outreach-script:start -->";
export const OUTREACH_SCRIPT_END = "<!-- outreach-script:end -->";
const SCRIPT_HEADER_PREFIX = "📞 Ausgewähltes Kaltakquise-Skript";

// Regex fuer kanonischen Block mit HTML-Kommentaren
const CANONICAL_BLOCK_REGEX = /<!-- outreach-script:start -->[\s\S]*?<!-- outreach-script:end -->/gi;

// Regex fuer Legacy-Bloecke ohne End-Marker (bis zum naechsten Trenner oder Textende)
const LEGACY_BLOCK_REGEX = /(?:^|\n\n)(?:---\n)?📞\s*Ausgewähltes Kaltakquise-Skript[^\n]*:\s*\n+([\s\S]+?)(?=\n\n---|\n\n📞|<!-- outreach-script:start -->|$)/gi;

/**
 * Extrahiert das ausgewaehlte Kaltakquise-Skript ausschließlich aus den Notizen.
 * Ignoriert unselektierte automatische Entwuerfe aus DmDraft!
 */
export function extractCustomOutreachScript(notes?: string | null): string | null {
  if (!notes) return null;

  // 1. Suche nach kanonischem Block mit Markern
  const canonicalMatches = [...notes.matchAll(/<!-- outreach-script:start -->\s*[\s\S]*?\n([\s\S]*?)<!-- outreach-script:end -->/gi)];
  if (canonicalMatches.length > 0) {
    const last = canonicalMatches[canonicalMatches.length - 1];
    if (last && last[1]?.trim()) {
      return last[1].trim();
    }
  }

  // 2. Fallback: Legacy-Bloecke (falls Altbestand ohne Endmarker vorliegt)
  const legacyMatches = [...notes.matchAll(LEGACY_BLOCK_REGEX)];
  if (legacyMatches.length > 0) {
    const last = legacyMatches[legacyMatches.length - 1];
    if (last && last[1]?.trim()) {
      return last[1].trim();
    }
  }

  return null;
}

/**
 * Erstellt den kanonischen Block fuer die Notizen.
 */
export function buildOutreachScriptBlock(scriptText: string, dateLabel?: string): string {
  const cleanScript = scriptText.trim();
  const label = dateLabel
    ? dateLabel
    : new Intl.DateTimeFormat("de-AT", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "Europe/Vienna",
      }).format(new Date()) + " Uhr";

  return [
    OUTREACH_SCRIPT_START,
    `${SCRIPT_HEADER_PREFIX} (${label}):`,
    "",
    cleanScript,
    OUTREACH_SCRIPT_END,
  ].join("\n");
}

/**
 * Aktualisiert oder fuegt das Kaltakquise-Skript in den Lead-Notizen in-place ein.
 * Konsolidiert etwaige alte/mehrfache Bloecke zu genau einem kanonischen Block.
 */
export function upsertOutreachScriptInNotes(
  existingNotes: string | null | undefined,
  scriptText: string,
  dateLabel?: string
): string {
  const block = buildOutreachScriptBlock(scriptText, dateLabel);
  const base = (existingNotes ?? "").trim();

  if (!base) {
    return block;
  }

  // Fall A: Bereits kanonische Bloecke vorhanden -> ersetzen & Duplikate entfernen
  if (CANONICAL_BLOCK_REGEX.test(base)) {
    CANONICAL_BLOCK_REGEX.lastIndex = 0;
    let replaced = false;
    const cleaned = base.replace(CANONICAL_BLOCK_REGEX, () => {
      if (!replaced) {
        replaced = true;
        return block;
      }
      return "";
    });
    return cleaned.replace(/\n{3,}/g, "\n\n").trim();
  }

  // Fall B: Legacy-Bloecke vorhanden -> durch kanonischen Block ersetzen
  if (LEGACY_BLOCK_REGEX.test(base)) {
    LEGACY_BLOCK_REGEX.lastIndex = 0;
    let replaced = false;
    const cleaned = base.replace(LEGACY_BLOCK_REGEX, () => {
      if (!replaced) {
        replaced = true;
        return `\n\n---\n${block}`;
      }
      return "";
    });
    return cleaned.replace(/\n{3,}/g, "\n\n").trim();
  }

  // Fall C: Noch kein Skript vorhanden -> hinten anhaengen
  return `${base}\n\n---\n${block}`;
}

export type ObjectionItem = {
  id: string;
  title: string;
  hook: string;
  fullText: string;
};

/**
 * Extrahiert dynamisch strukturierte Einwaende & Konter aus einem Kaltakquise-Skript,
 * um die Einwandbehandlungs-Karten im Teleprompter direkt zu befuellen.
 */
export function extractObjectionsFromScript(scriptText?: string | null): ObjectionItem[] {
  if (!scriptText) return [];

  const lines = scriptText.split("\n");
  const results: ObjectionItem[] = [];
  let inObjectionSection = false;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine) continue;

    if (
      rawLine.includes("Einwandbehandlung") ||
      rawLine.includes("Konter") ||
      rawLine.includes("🛡️")
    ) {
      inObjectionSection = true;
      continue;
    }

    // Match bullet lines: • **„Titel“:** „Text“ or - **Titel**: Text or • Titel: Text
    const match =
      rawLine.match(/^[\u2022\-\*\d\.]+\s*\*\*([^\*]+)\*\*[:\s]+(.*)$/) ||
      rawLine.match(/^[\u2022\-\*\d\.]+\s*([^:\n]+)[:]\s*(.*)$/);

    if (match && (inObjectionSection || rawLine.includes("„") || rawLine.includes("\""))) {
      let title = match[1].trim().replace(/^["„“'«»]+|["„“'«»:]+$/g, "");
      let fullText = match[2].trim().replace(/^["„“'«»]+|["„“'«»]+$/g, "");

      if (!title || !fullText || title.length > 70) continue;

      // Extract short hook for collapsed state
      const periodIdx = fullText.indexOf(". ");
      const qIdx = fullText.indexOf("? ");
      const splitCandidates = [periodIdx, qIdx].filter((idx) => idx !== -1);
      const firstSentenceEnd = splitCandidates.length > 0 ? Math.min(...splitCandidates) : -1;

      let hook = "";
      if (firstSentenceEnd !== -1 && firstSentenceEnd < 100) {
        hook = fullText.slice(0, firstSentenceEnd + 1).trim();
      } else if (fullText.length > 85) {
        hook = fullText.slice(0, 82).trim() + "…";
      } else {
        hook = fullText;
      }

      results.push({
        id: `dyn_${results.length}`,
        title: title.startsWith("🛡️") || title.startsWith("🎯") ? title : `🛡️ „${title}“`,
        hook,
        fullText: `„${fullText}“`,
      });
    }
  }

  return results;
}
