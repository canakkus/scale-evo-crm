"use client";

import { useState } from "react";
import { AlertTriangle, Check, Copy, Phone, Sparkles, AtSign } from "lucide-react";
import { CHAR_COLORS, charState, speakingSeconds } from "@/lib/score-visuals";
import { normalizeInstagramHandle } from "@/lib/utils";

type Channel = "INSTAGRAM_DM" | "PHONE";
type Tone = "CASUAL_VIENNESE" | "PROFESSIONAL_DU" | "FORMAL_SIE";
type Variant = { index: number; body: string; charCount: number; draftId?: string | null };

const TONES: Array<{ key: Tone; label: string }> = [
  { key: "CASUAL_VIENNESE", label: "Locker" },
  { key: "PROFESSIONAL_DU", label: "Professionell" },
  { key: "FORMAL_SIE", label: "Sachlich (Sie)" },
];

/**
 * Kompakte Composer-Variante fuer das Lead-Detail-Modal.
 * Nutzt dieselben Endpunkte wie die /outreach-Seite.
 */
export function OutreachLeadPanel({
  leadId,
  companyName,
  instagram,
  onSent,
}: {
  leadId: string;
  companyName: string;
  instagram: string | null;
  onSent?: () => void;
}) {
  const [channel, setChannel] = useState<Channel>(instagram ? "INSTAGRAM_DM" : "PHONE");
  const [tone, setTone] = useState<Tone>("CASUAL_VIENNESE");
  const [variants, setVariants] = useState<Variant[]>([]);
  const [selected, setSelected] = useState(0);
  const [edited, setEdited] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [receipt, setReceipt] = useState<string | null>(null);

  const handle = normalizeInstagramHandle(instagram);
  const charLimit = channel === "PHONE" ? 300 : 400;
  const text = edited[selected] ?? variants.find((variant) => variant.index === selected)?.body ?? "";

  async function generate() {
    setBusy(true); setError(null); setReceipt(null);
    try {
      const response = await fetch("/api/outreach/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, channel, tone }),
      });
      const data = await response.json();
      if (!data.ok) { setError(data.reason ?? data.error ?? "Generierung fehlgeschlagen."); setVariants([]); return; }
      setVariants(data.variants ?? []); setEdited({}); setSelected(0);
    } catch {
      setError("Netzwerkfehler bei der Generierung.");
    } finally {
      setBusy(false);
    }
  }

  async function copyAndOpen() {
    if (!text) return;
    try { await navigator.clipboard.writeText(text); }
    catch { setError("Zwischenablage nicht verfügbar — Text bitte manuell kopieren."); }
    if (channel === "INSTAGRAM_DM" && handle) window.open(`https://ig.me/m/${handle}`, "_blank", "noopener");
    setConfirmOpen(true);
  }

  async function confirmSent(skipped: boolean) {
    await fetch("/api/outreach/sent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leadId,
        text,
        channel,
        skipped,
        draftId: variants.find((variant) => variant.index === selected)?.draftId ?? null,
      }),
    });
    setConfirmOpen(false);
    if (!skipped) {
      setReceipt(`Als gesendet protokolliert · ${new Date().toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" })}`);
      onSent?.();
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl border p-1" style={{ borderColor: "var(--border)" }}>
          {(["INSTAGRAM_DM", "PHONE"] as Channel[]).map((key) => (
            <button
              key={key}
              onClick={() => { setChannel(key); setVariants([]); }}
              disabled={key === "INSTAGRAM_DM" && !handle}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold"
              style={{
                background: channel === key ? "var(--accent)" : "transparent",
                color: channel === key ? "var(--bg)" : "var(--text-2)",
                opacity: key === "INSTAGRAM_DM" && !handle ? 0.4 : 1,
              }}
              title={key === "INSTAGRAM_DM" && !handle ? "Kein Instagram-Handle hinterlegt" : undefined}
            >
              {key === "INSTAGRAM_DM" ? <AtSign className="w-3.5 h-3.5" /> : <Phone className="w-3.5 h-3.5" />}
              {key === "INSTAGRAM_DM" ? "DM" : "Telefon"}
            </button>
          ))}
        </div>
        {TONES.map((option) => (
          <button
            key={option.key}
            onClick={() => setTone(option.key)}
            className="rounded-lg border px-3 py-2 text-[11px] font-semibold"
            style={{
              background: tone === option.key ? "var(--surface-3)" : "var(--surface-2)",
              color: tone === option.key ? "var(--text)" : "var(--text-2)",
              borderColor: tone === option.key ? "var(--border-2)" : "var(--border)",
            }}
          >
            {option.label}
          </button>
        ))}
      </div>

      {error && (
        <div
          className="flex items-start gap-2 rounded-md p-3 text-xs font-medium"
          style={{ background: "var(--status-lost-bg)", color: "var(--status-lost-tx)", border: "1px solid rgba(224,104,104,0.3)" }}
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {variants.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center" style={{ borderColor: "var(--border-2)" }}>
          <Sparkles className="mx-auto mb-2 h-5 w-5" style={{ color: "var(--text-3)" }} />
          <p className="text-xs" style={{ color: "var(--text-2)" }}>
            Erstansprache für {companyName} schreiben lassen.
          </p>
          <button
            onClick={() => void generate()}
            disabled={busy}
            className="mt-3 rounded-lg px-4 py-2 text-xs font-bold"
            style={{ background: "var(--accent)", color: "var(--bg)", opacity: busy ? 0.6 : 1 }}
          >
            {busy ? "Schreibt …" : "3 Varianten schreiben"}
          </button>
        </div>
      ) : (
        <>
          <div className="flex gap-1.5">
            {variants.map((variant) => (
              <button
                key={variant.index}
                onClick={() => setSelected(variant.index)}
                className="rounded-lg border px-3 py-1.5 text-[11px] font-bold"
                style={{
                  background: selected === variant.index ? "var(--surface-3)" : "var(--surface-2)",
                  color: selected === variant.index ? "var(--text)" : "var(--text-2)",
                  borderColor: selected === variant.index ? "var(--border-2)" : "var(--border)",
                }}
              >
                {String.fromCharCode(65 + variant.index)}
              </button>
            ))}
            <button onClick={() => void generate()} className="ml-auto text-[11px] underline" style={{ color: "var(--text-3)" }}>
              Neu schreiben
            </button>
          </div>
          <textarea
            value={text}
            onChange={(event) => setEdited((prev) => ({ ...prev, [selected]: event.target.value }))}
            className="w-full rounded-lg p-4 text-sm leading-6 outline-none"
            style={{ minHeight: 160, background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" }}
          />
        </>
      )}

      {receipt ? (
        <div
          className="flex items-center gap-2 rounded-lg px-4 py-3 text-xs font-semibold"
          style={{ background: "var(--status-warm-bg)", color: "var(--status-warm-tx)" }}
        >
          <Check className="h-4 w-4" /> {receipt}
        </div>
      ) : confirmOpen ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-4 py-3"
             style={{ background: "var(--confirm-bar-bg)" }}>
          <span className="text-xs font-semibold" style={{ color: "var(--confirm-bar-tx)" }}>
            ✓ Kopiert. Tatsächlich gesendet?
          </span>
          <span className="flex gap-2">
            <button onClick={() => void confirmSent(false)} className="rounded-lg px-4 py-2 text-xs font-bold"
                    style={{ background: "var(--accent)", color: "var(--bg)" }}>
              Ja, gesendet
            </button>
            <button onClick={() => void confirmSent(true)} className="rounded-lg border px-4 py-2 text-xs font-semibold"
                    style={{ borderColor: "var(--border-2)", color: "var(--text-2)" }}>
              Übersprungen
            </button>
          </span>
        </div>
      ) : variants.length > 0 ? (
        <div className="flex items-center justify-between">
          <span className="font-mono text-[11px]" style={{ color: CHAR_COLORS[charState(text.length, charLimit)] }}>
            {channel === "PHONE" ? `~${speakingSeconds(text.length)} Sek.` : `${text.length}/${charLimit} Zeichen`}
          </span>
          <button onClick={() => void copyAndOpen()} className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold"
                  style={{ background: "var(--accent)", color: "var(--bg)" }}>
            <Copy className="h-3.5 w-3.5" />
            {channel === "PHONE" ? "Text kopieren" : "Kopieren & Instagram öffnen"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
