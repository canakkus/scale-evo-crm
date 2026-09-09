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
  /** Tage seit dem letzten Post — null, wenn nicht ermittelbar. */
  daysSinceLastPost: number | null;
  /**
   * true, wenn das Profil nicht (vollstaendig) gelesen werden konnte.
   * Die UI markiert solche Leads als "manuell pruefen" statt zu raten.
   */
  incomplete: boolean;
  /** Klartext-Grund, warum Daten fehlen. Fuer die UI. */
  note: string | null;
};

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
