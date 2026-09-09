function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET environment variable is missing in production.");
    }
    return "dev-local-session-secret-change-in-production";
  }
  return secret;
}

export interface SessionPayload {
  id: string;
  email: string;
  displayName: string;
  exp: number; // Unix timestamp in seconds
}

function base64UrlEncode(str: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(str).toString("base64url");
  }
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(str, "base64url").toString("utf-8");
  }
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  return atob(base64);
}

async function getHmacKey(): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    enc.encode(getSessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function createSessionToken(payload: Omit<SessionPayload, "exp">): Promise<string> {
  const fullPayload: SessionPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30, // 30 days session
  };

  const payloadB64 = base64UrlEncode(JSON.stringify(fullPayload));
  const enc = new TextEncoder();
  const key = await getHmacKey();
  const signatureBuf = await crypto.subtle.sign("HMAC", key, enc.encode(payloadB64));

  const sigBytes = new Uint8Array(signatureBuf);
  let binary = "";
  for (let i = 0; i < sigBytes.byteLength; i++) {
    binary += String.fromCharCode(sigBytes[i]);
  }
  const signatureB64 = base64UrlEncode(binary);

  return `${payloadB64}.${signatureB64}`;
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  if (!token || !token.includes(".")) return null;

  try {
    const [payloadB64, signatureB64] = token.split(".");
    if (!payloadB64 || !signatureB64) return null;

    const enc = new TextEncoder();
    const key = await getHmacKey();

    // Decode signature
    const binarySig = base64UrlDecode(signatureB64);
    const sigBytes = new Uint8Array(binarySig.length);
    for (let i = 0; i < binarySig.length; i++) {
      sigBytes[i] = binarySig.charCodeAt(i);
    }

    const isValid = await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes,
      enc.encode(payloadB64)
    );

    if (!isValid) return null;

    const payload: SessionPayload = JSON.parse(base64UrlDecode(payloadB64));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
