import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function normalizeUrl(input?: string | null): string | null {
  if (!input?.trim()) return null;
  const value = input.trim();
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return value;
  }
}

/**
 * Reservierte Instagram-Pfade, die niemals ein Profil-Handle sein können.
 */
const INSTAGRAM_RESERVED_PATHS = new Set([
  "p",
  "reel",
  "reels",
  "tv",
  "stories",
  "explore",
  "accounts",
  "directory",
  "direct",
  "about",
  "legal",
  "developer",
  "developers",
  "api",
  "help",
  "privacy",
  "terms",
  "web",
  "challenge",
  "session",
  "emails",
  "graphql",
  "ajax",
  "s",
]);

/**
 * Normalisiert jede Schreibweise eines Instagram-Handles auf das nackte,
 * kleingeschriebene Handle.
 *
 *   "@salonx"                              -> "salonx"
 *   "salonx"                               -> "salonx"
 *   "https://www.instagram.com/salonx/"    -> "salonx"
 *   "instagram.com/salonx?igshid=xyz"      -> "salonx"
 *   "www.instagram.com/salonx"             -> "salonx"
 *   "https://instagram.com/p/Cabc123/"     -> null (kein Profil)
 *
 * Gibt `null` zurück, wenn kein valides Handle abgeleitet werden kann.
 * Instagram-Handles: 1–30 Zeichen, a–z, 0–9, "." und "_".
 */
export function normalizeInstagramHandle(input?: string | null): string | null {
  if (!input) return null;

  let value = input.trim();
  if (!value) return null;

  // Protokoll abschneiden, aber merken, ob überhaupt eines da war.
  const hadProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(value);
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");

  // Enthält der Wert eine Host-Angabe, MUSS es Instagram sein. Sonst würde
  // z. B. "https://facebook.com/salonx" fälschlich zum Handle "facebook.com"
  // und zwei Leads mit Fremd-URLs würden sich als Duplikat matchen.
  const hasHost = hadProtocol || value.includes("/") || /^www\./i.test(value);
  if (hasHost) {
    const host = value.split("/")[0].toLowerCase();
    if (!/^(?:[a-z0-9-]+\.)*(?:instagram\.com|instagr\.am)$/.test(host)) return null;
  }

  value = value.replace(/^(?:[a-z0-9-]+\.)*instagram\.com\/?/i, "");
  value = value.replace(/^(?:[a-z0-9-]+\.)*instagr\.am\/?/i, "");

  // Query-String, Fragment und führendes "@" entfernen.
  value = value.split(/[?#]/)[0];
  value = value.replace(/^\/+/, "").replace(/\/+$/, "");
  value = value.replace(/^@+/, "");

  if (!value) return null;

  // Wenn nach dem Host noch ein Pfad übrig ist, zählt nur das erste Segment.
  const segments = value.split("/").filter(Boolean);
  if (segments.length === 0) return null;
  const handle = segments[0].toLowerCase();

  if (INSTAGRAM_RESERVED_PATHS.has(handle)) return null;
  if (!/^[a-z0-9._]{1,30}$/.test(handle)) return null;
  if (/^[._]+$/.test(handle)) return null;

  return handle;
}

/**
 * Baut aus beliebiger Handle-Schreibweise eine kanonische Profil-URL.
 */
export function instagramProfileUrl(input?: string | null): string | null {
  const handle = normalizeInstagramHandle(input);
  return handle ? `https://www.instagram.com/${handle}` : null;
}

export function normalizePhone(input?: string | null): string | null {
  if (!input?.trim()) return null;
  const trimmed = input.trim();
  const plus = trimmed.startsWith("+") ? "+" : "";
  return plus + trimmed.replace(/\D/g, "");
}

export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength) + "…";
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("de-AT").format(n);
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat("de-AT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(d);
  } catch {
    return "—";
  }
}

export function timeAgo(date: Date | string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);

  if (mins < 1)   return "gerade eben";
  if (mins < 60)  return `vor ${mins} Min.`;
  if (hours < 24) return `vor ${hours} Std.`;
  if (days < 7)   return `vor ${days} Tag${days === 1 ? "" : "en"}`;
  return formatDate(date);
}

export function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
