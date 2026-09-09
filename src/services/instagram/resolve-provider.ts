import { InstagramProfileProvider } from "./profile-provider";
import { InstagramGraphApiProvider, getGraphApiConfig } from "./graph-api-provider";
import type { InstagramProfile } from "./types";

export type ProfileSource = "graph-api" | "public-page";

export type ResolvedProfile = InstagramProfile & { source: ProfileSource };

/**
 * Waehlt die beste verfuegbare Datenquelle.
 *
 * 1. Instagram Graph API, sobald konfiguriert — offiziell, vollstaendig,
 *    und nur damit ist "kein Link in Bio" eine belastbare Aussage.
 * 2. Oeffentlicher Seitenabruf als Rueckfall. Liefert im Wesentlichen nur
 *    die Reichweite; alles andere bleibt "unbekannt".
 *
 * Wenn die Graph API ein Profil nicht kennt (Privatprofil, kein Business-
 * Account), wird der Rueckfall trotzdem versucht — eine Followerzahl ist
 * besser als gar nichts.
 */
export async function fetchInstagramProfile(handleOrUrl: string): Promise<ResolvedProfile> {
  const config = getGraphApiConfig();

  if (config) {
    const profile = await new InstagramGraphApiProvider(config).fetchProfile(handleOrUrl);
    if (!profile.incomplete) return { ...profile, source: "graph-api" };

    const fallback = await new InstagramProfileProvider().fetchProfile(handleOrUrl);
    // Den aussagekraeftigeren Hinweis behalten, statt ihn zu ueberschreiben.
    return {
      ...fallback,
      note: fallback.note ?? profile.note,
      source: "public-page",
    };
  }

  const profile = await new InstagramProfileProvider().fetchProfile(handleOrUrl);
  return { ...profile, source: "public-page" };
}

/** Fuer die Oberflaeche: ist die offizielle Anbindung aktiv? */
export function isGraphApiConfigured(): boolean {
  return getGraphApiConfig() !== null;
}
