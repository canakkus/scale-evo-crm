/**
 * ============================================================
 * GROQ KEY MANAGER — Automatisches API-Key-Rotation-System
 * ============================================================
 *
 * Konfiguration in .env / Vercel Environment Variables:
 *   GROQ_API_KEY_1=gsk_xxx   ← Primärer Key
 *   GROQ_API_KEY_2=gsk_yyy   ← Backup Key #1
 *   GROQ_API_KEY_3=gsk_zzz   ← Backup Key #2
 *   (oder einfach GROQ_API_KEY für nur einen Key)
 *
 * Features:
 *  - Automatischer Wechsel bei 429 Rate Limit
 *  - Cooldown-Tracking pro Key (Standard: 65 Sekunden)
 *  - getStatus() für den /api/ai/key-status Endpoint
 *  - Retry-Logik: versucht alle verfügbaren Keys bevor es aufgibt
 * ============================================================
 */

import Groq from "groq-sdk";

export type KeyStatus = "available" | "rate_limited" | "no_quota" | "error";

export interface KeyInfo {
  index: number;
  maskedKey: string;
  status: KeyStatus;
  rateLimitedUntil?: number; // Unix timestamp (ms)
  requestCount: number;
  lastUsed?: number;
  lastError?: string;
}

const COOLDOWN_MS = 65_000; // 65 Sekunden Cooldown nach 429

class GroqKeyManager {
  private keys: string[] = [];
  private clients: Map<string, Groq> = new Map();
  private keyInfos: Map<string, KeyInfo> = new Map();
  private currentIndex = 0;

  constructor() {
    this.loadKeys();
  }

  private loadKeys() {
    const foundKeys: string[] = [];

    // Versuche nummerierte Keys zu laden: GROQ_API_KEY_1, GROQ_API_KEY_2, ...
    for (let i = 1; i <= 10; i++) {
      const key = process.env[`GROQ_API_KEY_${i}`];
      if (key?.trim()) foundKeys.push(key.trim());
    }

    // Fallback: GROQ_API_KEY (einzelner Key ohne Nummer)
    if (foundKeys.length === 0) {
      const single = process.env.GROQ_API_KEY;
      if (single?.trim()) foundKeys.push(single.trim());
    }

    if (foundKeys.length === 0) {
      throw new Error(
        "Kein Groq API Key gefunden. Setze GROQ_API_KEY_1 (oder GROQ_API_KEY) in den Environment Variables."
      );
    }

    this.keys = foundKeys;

    // Initialisiere Clients und Info-Objekte
    foundKeys.forEach((key, index) => {
      this.clients.set(key, new Groq({ apiKey: key }));
      this.keyInfos.set(key, {
        index: index + 1,
        maskedKey: this.maskKey(key),
        status: "available",
        requestCount: 0,
      });
    });

    console.log(`[GroqKeyManager] ${foundKeys.length} Key(s) geladen.`);
  }

  private maskKey(key: string): string {
    if (key.length < 12) return "***";
    return `${key.slice(0, 7)}...${key.slice(-4)}`;
  }

  /** Gibt den nächsten verfügbaren Groq-Client zurück */
  getAvailableClient(): { client: Groq; key: string } | null {
    const now = Date.now();

    // Versuche ab currentIndex reihum alle Keys
    for (let attempt = 0; attempt < this.keys.length; attempt++) {
      const idx = (this.currentIndex + attempt) % this.keys.length;
      const key = this.keys[idx];
      const info = this.keyInfos.get(key)!;

      // Cooldown abgelaufen? Dann wieder freigeben
      if (info.status === "rate_limited" && info.rateLimitedUntil && now >= info.rateLimitedUntil) {
        info.status = "available";
        info.rateLimitedUntil = undefined;
        console.log(`[GroqKeyManager] Key #${info.index} (${info.maskedKey}) ist wieder verfügbar.`);
      }

      if (info.status === "available") {
        this.currentIndex = idx;
        return { client: this.clients.get(key)!, key };
      }
    }

    return null; // Alle Keys sind limitiert
  }

  /** Markiert einen Key als rate-limited für COOLDOWN_MS */
  markRateLimited(key: string, retryAfterMs?: number) {
    const info = this.keyInfos.get(key);
    if (!info) return;

    const cooldown = retryAfterMs ?? COOLDOWN_MS;
    info.status = "rate_limited";
    info.rateLimitedUntil = Date.now() + cooldown;
    info.lastError = `429 Rate Limited (Cooldown bis ${new Date(info.rateLimitedUntil).toLocaleTimeString("de-AT")})`;

    console.warn(
      `[GroqKeyManager] Key #${info.index} (${info.maskedKey}) rate-limited. Nächster Versuch in ${Math.ceil(cooldown / 1000)}s.`
    );

    // Wechsle zum nächsten Key
    this.currentIndex = (this.keys.indexOf(key) + 1) % this.keys.length;
  }

  /** Markiert einen Key als fehlerhaft (z.B. ungültig) */
  markError(key: string, error: string) {
    const info = this.keyInfos.get(key);
    if (!info) return;
    info.status = "error";
    info.lastError = error;
    console.error(`[GroqKeyManager] Key #${info.index} (${info.maskedKey}) hat einen Fehler: ${error}`);
  }

  /** Erhöht den Request-Counter für einen Key */
  recordRequest(key: string) {
    const info = this.keyInfos.get(key);
    if (!info) return;
    info.requestCount++;
    info.lastUsed = Date.now();
  }

  /** Gibt den Status aller Keys zurück (für den Status-Endpoint) */
  getStatus(): {
    totalKeys: number;
    availableKeys: number;
    keys: KeyInfo[];
    nextAvailableIn?: number; // Sekunden bis der nächste Key verfügbar ist
  } {
    const now = Date.now();
    const infos = Array.from(this.keyInfos.values());

    const availableCount = infos.filter(
      (k) => k.status === "available" || (k.status === "rate_limited" && k.rateLimitedUntil && now >= k.rateLimitedUntil)
    ).length;

    // Berechne wann der nächste Rate-Limited Key wieder verfügbar ist
    const nextAvailable = infos
      .filter((k) => k.status === "rate_limited" && k.rateLimitedUntil)
      .map((k) => k.rateLimitedUntil! - now)
      .filter((ms) => ms > 0)
      .sort((a, b) => a - b)[0];

    return {
      totalKeys: this.keys.length,
      availableKeys: availableCount,
      keys: infos.map((k) => ({
        ...k,
        // Füge verbleibende Cooldown-Zeit hinzu
        cooldownRemainingSeconds:
          k.status === "rate_limited" && k.rateLimitedUntil
            ? Math.max(0, Math.ceil((k.rateLimitedUntil - now) / 1000))
            : undefined,
      })) as KeyInfo[],
      ...(nextAvailable !== undefined && {
        nextAvailableIn: Math.ceil(nextAvailable / 1000),
      }),
    };
  }
}

// Singleton-Instanz (wird einmalig pro Server-Prozess erstellt)
let _keyManager: GroqKeyManager | null = null;

export function getKeyManager(): GroqKeyManager {
  if (!_keyManager) {
    _keyManager = new GroqKeyManager();
  }
  return _keyManager;
}

/**
 * Führt eine Groq-Operation mit automatischem Key-Rotation bei Rate Limits aus.
 * Probiert alle verfügbaren Keys durch bevor es aufgibt.
 *
 * @param operation - Eine Funktion, die einen Groq-Client entgegennimmt
 */
export async function withGroqClient<T>(
  operation: (client: Groq, key: string) => Promise<T>
): Promise<T> {
  const manager = getKeyManager();
  const maxAttempts = 10; // Sicherheitslimit

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const available = manager.getAvailableClient();

    if (!available) {
      const status = manager.getStatus();
      const waitSec = status.nextAvailableIn ?? 65;
      throw new Error(
        `⚠️ Alle ${status.totalKeys} Groq API Keys sind aktuell rate-limited. ` +
        `Bitte warte ~${waitSec} Sekunden und versuche es erneut.`
      );
    }

    const { client, key } = available;
    manager.recordRequest(key);

    try {
      const result = await operation(client, key);
      return result;
    } catch (err: any) {
      const status = err?.status ?? err?.statusCode;
      const message = err?.message ?? String(err);

      if (status === 429) {
        // Extrahiere retry-after Header falls vorhanden
        const retryAfterHeader = err?.headers?.["retry-after"];
        const retryAfterMs = retryAfterHeader
          ? parseInt(retryAfterHeader, 10) * 1000 + 2000
          : COOLDOWN_MS;

        manager.markRateLimited(key, retryAfterMs);

        // Versuche sofort den nächsten Key
        console.log(`[GroqKeyManager] Wechsle Key nach 429 (Versuch ${attempt + 1}/${maxAttempts})...`);
        continue;
      }

      if (status === 401 || status === 403) {
        // Ungültiger Key – dauerhaft markieren
        manager.markError(key, `HTTP ${status}: ${message}`);
        continue;
      }

      // Anderer Fehler – nicht key-bezogen, direkt weiterwerfen
      throw err;
    }
  }

  throw new Error("Maximale Anzahl an Key-Rotation-Versuchen erreicht.");
}
