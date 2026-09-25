/** Herkunft der Instagram-Profildaten — bewusst dezent, kein Badge-Zoo. */
export type ProfileMeta = {
  source: "graph-api" | "apify" | "public-page";
  ageDays: number;
  stale: boolean;
  bioKnown: boolean;
  linkKnown: boolean;
  lastPostAt: string | null;
};

export const PROFILE_SOURCE_LABELS: Record<ProfileMeta["source"], string> = {
  "graph-api": "Instagram Graph API",
  apify: "Apify",
  "public-page": "Nur öffentliche Daten",
};

export function ProfileSourceLine({ meta }: { meta: ProfileMeta | null }) {
  if (!meta) {
    return (
      <span className="text-[11px]" style={{ color: "var(--text-3)" }} title="Für diesen Lead wurden noch keine Profildaten geholt.">
        Profil noch nicht geprüft
      </span>
    );
  }

  const age = meta.ageDays === 0 ? "heute geprüft" : `vor ${meta.ageDays} ${meta.ageDays === 1 ? "Tag" : "Tagen"} geprüft`;
  const known = [
    meta.bioKnown ? "Bio" : null,
    meta.linkKnown ? "Link in Bio" : "Link in Bio unbekannt",
    meta.lastPostAt ? "letzter Post" : null,
  ].filter(Boolean);

  return (
    <span
      className="text-[11px]"
      style={{ color: "var(--text-3)" }}
      title={`Bekannte Felder: ${known.join(", ")}${meta.stale ? " · Snapshot veraltet" : ""}`}
    >
      {PROFILE_SOURCE_LABELS[meta.source]} · {age}
      {meta.source === "public-page" && !meta.bioKnown ? " · Bio unbekannt" : ""}
    </span>
  );
}
