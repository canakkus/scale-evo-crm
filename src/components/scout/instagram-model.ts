import {
  instagramStateOf,
  type InstagramInsight,
  type InstagramState,
  type ScoutResult,
} from "@/lib/lead-scout-types";

/**
 * Reine Ableitungen fuer den Instagram-Reiter. Keine Netzwerkaufrufe,
 * keine Seiteneffekte — nur die Frage "was wissen wir ueber diese Karte".
 */

/** string = manuell gewaehltes Handle, null = "Keins davon". Fehlt der Key: keine Entscheidung. */
export type Picks = Record<string, string | null>;

export type HandleOrigin = "website" | "search" | "manual";

export type CardView = {
  result: ScoutResult;
  key: string;
  state: InstagramState;
  handle: string | null;
  origin: HandleOrigin | null;
  insight: InstagramInsight | null;
  /** Lead-ID, die fuer "Profile prüfen" genutzt werden darf. */
  leadId: string | null;
  /** In diesem Lauf als DM-Lead angelegt oder bereits als DM-Lead im CRM. */
  isDmLead: boolean;
  /** Anlegen wuerde ein Duplikat erzeugen. */
  inCrm: boolean;
  websiteUnknown: boolean;
  dmReady: boolean;
  /** Nutzer hat "Keins davon" gewaehlt. */
  manualNone: boolean;
  /** In diesem Lauf mit genau diesem Handle angelegt — Handle nicht mehr aenderbar. */
  lockedByLead: boolean;
};

/**
 * Ab wann der letzte Post als alt markiert wird. Gleicher Wert wie
 * LATEST_POST_MAX_AGE_DAYS in outreach-generator.ts (dort serverseitig,
 * nicht in den Client importierbar): aelter taugt er nicht als Aufhaenger.
 */
export const LATEST_POST_STALE_DAYS = 60;

export function buildCardView(
  result: ScoutResult,
  picks: Picks,
  insights: Record<string, InstagramInsight | null>,
  createdLeads: Record<string, string>,
): CardView {
  const key = result.venue.key;
  const picked = Object.prototype.hasOwnProperty.call(picks, key);
  const handle = picked ? picks[key] : result.instagramProfile?.handle ?? null;
  const state: InstagramState = picked ? (handle ? "found" : "none") : instagramStateOf(result.instagramProfile);
  const origin: HandleOrigin | null = !handle ? null : picked ? "manual" : result.instagramProfile?.source === "website" ? "website" : "search";

  const insight = Object.prototype.hasOwnProperty.call(insights, key) ? insights[key] : result.instagramInsight ?? null;
  // Ein Insight gehoert immer zu genau einem Handle. Nach einem Wechsel darf
  // der alte Snapshot nicht an der Karte haengen bleiben.
  const matchingInsight = insight && handle && insight.handle === handle ? insight : null;

  const createdId = createdLeads[key] ?? null;
  const crmLead = matchingInsight?.crmLead ?? null;
  const leadId = createdId ?? crmLead?.id ?? null;
  const isDmLead = Boolean(createdId) || crmLead?.acquisitionType === "DM";
  const inCrm = Boolean(createdId || crmLead) || result.duplicate.status === "fail";
  const websiteUnknown = !result.website.url && Boolean(result.website.searchFailed);
  const solid = result.website.solid ?? Boolean(result.website.url);

  return {
    result,
    key,
    state,
    handle,
    origin,
    insight: matchingInsight,
    leadId,
    isDmLead,
    inCrm,
    websiteUnknown,
    manualNone: picked && !handle,
    lockedByLead: Boolean(createdId),
    // DM-bereit = eindeutiges Profil + sicher keine eigene Website + neu + keine Kette.
    // Unbekannte Website ist NICHT "keine Website".
    dmReady:
      state === "found" && !solid && !websiteUnknown && result.duplicate.status !== "fail" &&
      !(crmLead && crmLead.acquisitionType !== "DM") && !result.chain?.suspected,
  };
}

export type IgSort = "dm" | "score" | "distance" | "rating";
export type CheckFilter = "all" | "checked" | "unchecked";

const STATE_RANK: Record<InstagramState, number> = { found: 1, choose: 2, none: 3, failed: 4 };

function scoreOf(view: CardView): number | null {
  return view.insight?.score?.score ?? null;
}

/** Geprueft zuerst, nach Score. Ungeprueft danach — nie als 0 einsortiert. */
function byScore(a: CardView, b: CardView): number {
  const sa = scoreOf(a);
  const sb = scoreOf(b);
  if (sa !== null && sb !== null) return sb - sa;
  if (sa !== null) return -1;
  if (sb !== null) return 1;
  return 0;
}

function byRating(a: CardView, b: CardView): number {
  return (b.result.venue.rating ?? 0) - (a.result.venue.rating ?? 0);
}

export function sortViews(views: CardView[], sort: IgSort): CardView[] {
  return [...views].sort((a, b) => {
    // "Suche fehlgeschlagen" steht in jeder Sortierung ganz hinten.
    const failed = Number(a.state === "failed") - Number(b.state === "failed");
    if (failed !== 0) return failed;

    if (sort === "dm") {
      const rank = (view: CardView) => (view.dmReady ? 0 : STATE_RANK[view.state]);
      return rank(a) - rank(b) || byScore(a, b) || byRating(a, b);
    }
    if (sort === "score") return byScore(a, b) || byRating(a, b);
    if (sort === "distance") {
      const da = a.result.distanceKm ?? Infinity;
      const db = b.result.distanceKm ?? Infinity;
      return da - db || byRating(a, b);
    }
    return byRating(a, b);
  });
}

export function matchesToolbar(view: CardView, igFilter: InstagramState | "all", checkFilter: CheckFilter): boolean {
  if (igFilter !== "all" && view.state !== igFilter) return false;
  const checked = Boolean(view.insight?.snapshot);
  if (checkFilter === "checked" && !checked) return false;
  if (checkFilter === "unchecked" && checked) return false;
  return true;
}

/** de-AT: "1.240 Follower". */
export function formatFollowers(count: number): string {
  return `${count.toLocaleString("de-AT")} Follower`;
}

export function relativeDays(days: number): string {
  if (days === 0) return "heute";
  if (days === 1) return "gestern";
  return `vor ${days} Tagen`;
}

export function domainOf(url: string): string {
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\/(www\.)?/, "").split("/")[0];
  }
}

const LINK_AGGREGATOR = /linktr\.ee|beacons\.ai|linkin\.bio|link\.me|taplink|bio\.link|campsite\.bio|linktree/i;

export type BioLinkState = { kind: "none" } | { kind: "linktree"; url: string } | { kind: "own"; url: string } | { kind: "unknown" };

/**
 * Tri-State fuer den Link in der Bio. "Kein Link" NUR, wenn die Quelle das
 * Feld wirklich pruefen konnte (externalUrlKnown). Sonst: unbekannt.
 */
export function bioLinkState(insight: InstagramInsight | null): BioLinkState {
  const snapshot = insight?.snapshot;
  if (!snapshot) return { kind: "unknown" };
  if (snapshot.externalUrl) {
    return LINK_AGGREGATOR.test(snapshot.externalUrl) ? { kind: "linktree", url: snapshot.externalUrl } : { kind: "own", url: snapshot.externalUrl };
  }
  return snapshot.externalUrlKnown ? { kind: "none" } : { kind: "unknown" };
}
