"use client";

import { useEffect, useState } from "react";
import { Bell, Copy, RefreshCw } from "lucide-react";

type FeedUrls = { webcalUrl: string; httpsUrl: string };

export function AppleSubscribe() {
  const [urls, setUrls] = useState<FeedUrls | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetch("/api/calendar/subscribe")
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Abo konnte nicht geladen werden.");
          setUrls(data);
        })
        .catch((err) => setError(err instanceof Error ? err.message : "Abo konnte nicht geladen werden."));
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  async function copyLink() {
    if (!urls) return;
    try {
      await navigator.clipboard.writeText(urls.webcalUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Link konnte nicht kopiert werden.");
    }
  }

  async function regenerate() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/calendar/subscribe", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Link konnte nicht erneuert werden.");
      setUrls(data);
      setConfirmRegen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Link konnte nicht erneuert werden.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border p-4 space-y-3" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2 className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--text)" }}>
            <Bell className="w-4 h-4" />
            Apple Kalender
          </h2>
          <p className="text-xs" style={{ color: "var(--text-2)" }}>
            Nur-Lese-Abo. Apple holt Änderungen zeitverzögert, nicht sofort. Standard-Erinnerung: 15 Minuten vorher.
          </p>
        </div>
        {urls && (
          <a
            href={urls.webcalUrl}
            className="inline-flex items-center justify-center rounded-md px-3 py-2 text-xs font-semibold shrink-0"
            style={{ background: "var(--accent)", color: "white" }}
          >
            Zum Apple Kalender hinzufügen
          </a>
        )}
      </div>

      {urls && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            readOnly
            value={urls.webcalUrl}
            aria-label="Kalenderabo-Link"
            className="min-w-0 flex-1 rounded-md border px-3 py-2 text-xs font-mono outline-none"
            style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
            onFocus={(event) => event.currentTarget.select()}
          />
          <button type="button" onClick={copyLink} className="inline-flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-semibold" style={{ borderColor: "var(--border)", color: "var(--text)" }}>
            <Copy className="w-3.5 h-3.5" />
            {copied ? "Kopiert" : "Kopieren"}
          </button>
        </div>
      )}

      {error && <p className="text-xs" style={{ color: "var(--status-lost-tx)" }}>{error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        {confirmRegen ? (
          <>
            <span className="text-xs" style={{ color: "var(--text-2)" }}>Der alte Link funktioniert danach nicht mehr.</span>
            <button type="button" disabled={busy} onClick={regenerate} className="text-xs font-semibold" style={{ color: "var(--status-lost-tx)" }}>
              {busy ? "Erneuert…" : "Wirklich erneuern"}
            </button>
            <button type="button" onClick={() => setConfirmRegen(false)} className="text-xs font-semibold" style={{ color: "var(--text-2)" }}>
              Abbrechen
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setConfirmRegen(true)} className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: "var(--text-2)" }}>
            <RefreshCw className="w-3.5 h-3.5" />
            Link erneuern
          </button>
        )}
      </div>

      <details className="text-xs" style={{ color: "var(--text-2)" }}>
        <summary className="cursor-pointer font-semibold" style={{ color: "var(--text)" }}>
          Auf iPhone und Mac einrichten
        </summary>
        <ol className="mt-2 list-decimal space-y-1 pl-4">
          <li>iPhone: Kalender-App öffnen, unten auf Kalender tippen.</li>
          <li>Kalender hinzufügen, dann Kalenderabo hinzufügen.</li>
          <li>Den webcal-Link einfügen und abonnieren. Am Mac: Kalender, Ablage, Neues Kalenderabo.</li>
          <li>Erinnerungen einschalten: beim Abo auf das Info-Symbol tippen und „Hinweise ignorieren“ ausschalten. Am Mac denselben Haken in den Kalenderinfos deaktivieren.</li>
        </ol>
        <p className="mt-2">
          Apple aktualisiert Abos oft erst nach einiger Zeit. Am Mac lässt sich das Intervall in den Abo-Infos auf 5 Minuten stellen. Am iPhone bestimmt Apple den Takt selbst.
        </p>
      </details>
    </section>
  );
}
