export type InstagramProfile = {
  handle: string;
  url: string;
  /** Voller Bio-Text, falls auslesbar. */
  bio: string | null;
  displayName: string | null;
  followerCount: number | null;
  followingCount: number | null;
  postCount: number | null;
  /** Link in der Bio, falls vorhanden. */
  externalUrl: string | null;
  /**
   * true, wenn wir das Vorhandensein eines Bio-Links tatsaechlich pruefen
   * konnten. Bei false bedeutet externalUrl === null NICHT "kein Link",
   * sondern "unbekannt" — es darf daraus kein Score-Signal abgeleitet werden.
   */
  externalUrlKnown: boolean;
  isBusinessAccount: boolean | null;
  isPrivate: boolean | null;
  isVerified: boolean | null;
  /**
   * Zeitpunkt des neuesten Posts als ISO-String — ABSOLUT, nicht relativ.
   * Nur so ueberlebt ein Snapshot mehr als einen Tag: `daysSinceLastPost`
   * wuerde im Cache taeglich verrotten und teure Re-Fetches erzwingen.
   */
  lastPostAt: string | null;
  /** Tage seit dem letzten Post — abgeleitet aus `lastPostAt`, nie gecacht. */
  daysSinceLastPost: number | null;
  /**
   * Caption des neuesten Posts. FREMDER NUTZERTEXT — wandert in einen
   * LLM-Prompt und muss dort als Zitat markiert und gekuerzt werden.
   * Siehe `sanitizeCaption()` in caption.ts.
   */
  latestPostCaption: string | null;
  /** Durchschnittlicher Abstand zwischen den letzten Posts in Tagen. */
  postCadenceDays: number | null;
  /**
   * true, wenn das Profil nicht (vollstaendig) gelesen werden konnte.
   * Die UI markiert solche Leads als "manuell pruefen" statt zu raten.
   */
  incomplete: boolean;
  /** Klartext-Grund, warum Daten fehlen. Fuer die UI. */
  note: string | null;
};

/**
 * Woher die Daten stammen. Reihenfolge der Kette:
 * Graph API (offiziell, vollstaendig) -> Apify (kostenpflichtig, vollstaendig)
 * -> oeffentlicher Seitenabruf (gratis, fast nur Reichweite).
 */
export type ProfileSource = "graph-api" | "apify" | "public-page";

export type ResolvedProfile = InstagramProfile & { source: ProfileSource };

export type ScoreReason = {
  key: string;
  label: string;
  points: number;
};

export type InstagramScore = {
  score: number;
  reasons: ScoreReason[];
  tags: string[];
  /** true, wenn der Score auf unvollstaendiger Datenbasis beruht. */
  approximate: boolean;
};

/** Leeres Profil mit sprechender Begruendung — nie werfen, immer zurueckgeben. */
export function emptyProfile(handle: string, note: string): InstagramProfile {
  return {
    handle,
    url: `https://www.instagram.com/${handle}`,
    bio: null,
    displayName: null,
    followerCount: null,
    followingCount: null,
    postCount: null,
    externalUrl: null,
    externalUrlKnown: false,
    isBusinessAccount: null,
    isPrivate: null,
    isVerified: null,
    lastPostAt: null,
    daysSinceLastPost: null,
    latestPostCaption: null,
    postCadenceDays: null,
    incomplete: true,
    note,
  };
}

/** Tage seit einem absoluten Zeitpunkt. Einzige Quelle fuer daysSinceLastPost. */
export function daysSince(value: string | Date | null | undefined): number | null {
  if (!value) return null;
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(time)) return null;
  const days = Math.floor((Date.now() - time) / 86_400_000);
  return days >= 0 && days < 36_500 ? days : null;
}
