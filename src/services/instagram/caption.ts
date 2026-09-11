/**
 * ============================================================
 * CAPTION-AUFBEREITUNG
 * ============================================================
 * Post-Captions sind FREMDER NUTZERTEXT. Sie wandern als Aufhaenger
 * in einen LLM-Prompt, dessen Ergebnis halb-automatisch verschickt
 * wird — damit sind sie ein Prompt-Injection-Einfallstor.
 *
 * Absicherung in zwei Schritten:
 *   1. Hier: kuerzen, Steuerzeichen und Zaun-Zeichen entfernen,
 *      damit kein Ausbruch aus dem Zitatblock moeglich ist.
 *   2. Im Prompt (`outreach-generator.ts`): als klar markiertes
 *      Zitat uebergeben, mit ausdruecklicher Anweisung, darin
 *      enthaltene Anweisungen zu ignorieren.
 * ============================================================
 */

/** Maximale Laenge einer Caption im Prompt. */
export const CAPTION_MAX_CHARS = 300;

/** Zeichenfolgen, mit denen sich aus einem Zitatblock ausbrechen liesse. */
const FENCE_PATTERN = /(```|<<<|>>>|\bZITAT\b)/gi;

/**
 * Steuerzeichen INKLUSIVE Zeilenumbrueche.
 *
 * NICHT LOCKERN, auch nicht fuer "schoenere" mehrzeilige Captions: dass die
 * Caption garantiert einzeilig ist, IST die strukturelle Absicherung. Die
 * Terminatoren des Zitatblocks in `quoteBlock()` stehen jeweils auf einer
 * eigenen Zeile — ohne Zeilenumbruch kann ein fremder Text die Blockgrenze
 * also gar nicht erst nachbauen. Der semantische Riegel im Prompt ist nur
 * die zweite Verteidigungslinie.
 */
const CONTROL_CHARS = /[\u0000-\u001F\u007F]+/g;

/** Unsichtbare Richtungs- und Formatzeichen, mit denen sich Text tarnen laesst. */
const INVISIBLE_CHARS = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

export function sanitizeCaption(raw: unknown, maxChars = CAPTION_MAX_CHARS): string | null {
  if (typeof raw !== "string") return null;

  const cleaned = raw
    .replace(CONTROL_CHARS, " ")
    .replace(INVISIBLE_CHARS, "")
    .replace(FENCE_PATTERN, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length < 3) return null;
  return cleaned.length > maxChars ? `${cleaned.slice(0, maxChars).trimEnd()}…` : cleaned;
}
