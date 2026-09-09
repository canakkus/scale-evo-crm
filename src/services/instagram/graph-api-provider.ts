import { normalizeInstagramHandle, normalizeUrl } from "@/lib/utils";
import type { InstagramProfile } from "./types";

/**
 * ============================================================
 * INSTAGRAM GRAPH API — Business Discovery
 * ============================================================
 * Der offizielle Weg an fremde Profildaten. Im Gegensatz zum
 * ausgeloggten Seitenabruf liefert Meta hier genau die Felder,
 * auf denen unser Scoring beruht:
 *
 *   website          -> leer bedeutet WIRKLICH "kein Link in Bio"
 *   biography        -> "Termine per DM", Branche, Bezirk
 *   followers_count  -> Reichweite
 *   media.timestamp  -> wann zuletzt gepostet wurde
 *
 * Voraussetzungen (siehe .env.example):
 *   - Eigener Instagram-Account als Business/Creator, verknüpft
 *     mit einer Facebook-Seite
 *   - Meta-App mit Instagram-Produkt
 *   - Langlebiges Access-Token + eigene IG-Business-Account-ID
 *
 * Grenzen, die man kennen muss:
 *   - Es gibt KEINE Suche. Man fragt ein Handle ab und bekommt
 *     Daten — "finde alle Friseure in Wien" kann die API nicht.
 *     Discovery bleibt ein separater Trichter.
 *   - Nur öffentliche Business-/Creator-Accounts sind abfragbar.
 *     Privatprofile liefern einen Fehler, keinen Datensatz.
 * ============================================================
 */

const DEFAULT_VERSION = "v21.0";

export type GraphApiConfig = {
  token: string;
  businessAccountId: string;
  version: string;
};

/** Liest die Konfiguration; null, wenn die Anbindung nicht eingerichtet ist. */
export function getGraphApiConfig(): GraphApiConfig | null {
  const token = process.env.INSTAGRAM_GRAPH_TOKEN?.trim();
  const businessAccountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID?.trim();
  if (!token || !businessAccountId) return null;
  return {
    token,
    businessAccountId,
    version: process.env.INSTAGRAM_GRAPH_VERSION?.trim() || DEFAULT_VERSION,
  };
}

type GraphMedia = {
  timestamp?: string;
  caption?: string;
  like_count?: number;
  comments_count?: number;
};

type BusinessDiscovery = {
  username?: string;
  name?: string;
  biography?: string;
  website?: string;
  followers_count?: number;
  follows_count?: number;
  media_count?: number;
  media?: { data?: GraphMedia[] };
};

type GraphResponse = {
  business_discovery?: BusinessDiscovery;
  error?: { message?: string; code?: number; error_subcode?: number };
};

export class InstagramGraphApiProvider {
  constructor(
    private readonly config: GraphApiConfig,
    private readonly timeoutMs = Number(process.env.ENRICHMENT_TIMEOUT_MS ?? 12000),
  ) {}

  private empty(handle: string, note: string): InstagramProfile {
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
      daysSinceLastPost: null,
      incomplete: true,
      note,
    };
  }

  async fetchProfile(input: string): Promise<InstagramProfile> {
    const handle = normalizeInstagramHandle(input);
    if (!handle) return this.empty(String(input ?? "").slice(0, 40), "Kein gültiges Instagram-Handle.");

    const fields =
      `business_discovery.username(${handle})` +
      "{username,name,biography,website,followers_count,follows_count,media_count," +
      "media.limit(5){timestamp,caption,like_count,comments_count}}";

    const url =
      `https://graph.facebook.com/${this.config.version}/${this.config.businessAccountId}` +
      `?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(this.config.token)}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
      const payload = (await response.json()) as GraphResponse;

      if (payload.error) {
        // Code 110 / Subcode 2207013: Ziel ist kein Business-Account oder existiert nicht.
        const message = payload.error.message ?? "Unbekannter Fehler";
        const notBusiness = /not.*business|cannot be found|does not exist/i.test(message);
        return this.empty(
          handle,
          notBusiness
            ? "Kein öffentliches Business-Profil — Graph API liefert dafür keine Daten."
            : `Graph API: ${message}`,
        );
      }

      const data = payload.business_discovery;
      if (!data) return this.empty(handle, "Graph API lieferte keine Profildaten.");

      return this.map(handle, data);
    } catch (error) {
      const reason = error instanceof Error && error.name === "AbortError" ? "Zeitüberschreitung" : "nicht erreichbar";
      return this.empty(handle, `Graph API ${reason}.`);
    } finally {
      clearTimeout(timeout);
    }
  }

  private map(handle: string, data: BusinessDiscovery): InstagramProfile {
    const bio = data.biography?.trim() || null;
    const website = data.website?.trim() ? normalizeUrl(data.website.trim()) : null;

    const timestamps = (data.media?.data ?? [])
      .map((media) => (media.timestamp ? Date.parse(media.timestamp) : NaN))
      .filter((value) => Number.isFinite(value));

    const daysSinceLastPost =
      timestamps.length > 0
        ? Math.max(0, Math.floor((Date.now() - Math.max(...timestamps)) / 86_400_000))
        : null;

    return {
      handle: data.username ?? handle,
      url: `https://www.instagram.com/${data.username ?? handle}`,
      bio,
      displayName: data.name?.trim() || null,
      followerCount: data.followers_count ?? null,
      followingCount: data.follows_count ?? null,
      postCount: data.media_count ?? null,
      externalUrl: website,
      // Der entscheidende Unterschied zum Seitenabruf: Meta liefert das Feld
      // verbindlich mit. Ein leeres website-Feld heisst hier tatsaechlich
      // "kein Link in Bio" — und darf deshalb ein Score-Signal ausloesen.
      externalUrlKnown: true,
      // Wer ueber business_discovery ueberhaupt Daten zurueckgibt, IST ein
      // Business-/Creator-Account. Andere liefern einen Fehler.
      isBusinessAccount: true,
      isPrivate: false,
      daysSinceLastPost,
      incomplete: false,
      note: null,
    };
  }
}
