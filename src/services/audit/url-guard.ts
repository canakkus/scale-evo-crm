import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * SSRF-Schutz fuer den Audit: Lead-Websites sind nutzerkontrollierte URLs, der
 * Server darf damit weder interne Dienste (localhost, Metadata-Endpoints,
 * Heimnetz) abrufen noch deren Inhalt als Screenshot oeffentlich ablegen.
 */

function isPrivateIPv4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // Link-Local / Cloud-Metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224 // Multicast / reserviert
  );
}

function isPrivateIPv6(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v === "::" || v === "::1") return true;
  if (v.startsWith("fc") || v.startsWith("fd")) return true; // ULA
  if (v.startsWith("fe8") || v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb")) return true; // Link-Local
  const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return false;
}

export function isPrivateAddress(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return isPrivateIPv4(ip);
  if (kind === 6) return isPrivateIPv6(ip);
  return true;
}

/** Wirft, wenn die URL nicht http(s) ist oder auf eine nicht-oeffentliche Adresse zeigt. */
export async function assertPublicHttpUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Ungueltige URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Nur http(s) erlaubt");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("Interner Hostname nicht erlaubt");
  }
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new Error("Private IP nicht erlaubt");
    return url;
  }
  const records = await lookup(host, { all: true });
  if (records.length === 0 || records.some((r) => isPrivateAddress(r.address))) {
    throw new Error("Host loest auf nicht-oeffentliche Adresse auf");
  }
  return url;
}

/** fetch mit manuell gefolgten Redirects (max. 5), jeder Hop wird geprueft. */
export async function safeFetch(
  rawUrl: string,
  init: Omit<RequestInit, "redirect" | "signal"> & { timeoutMs: number },
): Promise<Response> {
  const { timeoutMs, ...rest } = init;
  const deadline = AbortSignal.timeout(timeoutMs);
  let current = rawUrl;
  for (let hop = 0; hop <= 5; hop++) {
    await assertPublicHttpUrl(current);
    const res = await fetch(current, { ...rest, redirect: "manual", signal: deadline });
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      current = new URL(location, current).toString();
      continue;
    }
    // res.url ist bei manuellem Redirect leer/Startwert: finale URL explizit mitgeben
    Object.defineProperty(res, "url", { value: current });
    return res;
  }
  throw new Error("Zu viele Weiterleitungen");
}
