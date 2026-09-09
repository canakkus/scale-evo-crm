"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle, AtSign, Check, Copy, ExternalLink, Phone, Pin, Radar, Sparkles,
} from "lucide-react";
import { ScoreMeter, type ScoreReason } from "@/components/ui/score-meter";
import { CHAR_COLORS, TAG_LABELS, charState, speakingSeconds } from "@/lib/score-visuals";
import { normalizeInstagramHandle } from "@/lib/utils";
import { WarmupRail } from "./warmup-rail";
import type { WarmupState } from "@/lib/outreach-shared";

type QueueLead = {
  id: string; companyName: string; industry: string | null; city: string | null;
  instagram: string | null; website: string | null; score: number;
  scoreReasons: unknown; opportunityTags: unknown; interestingReason: string | null;
  status: string; googleRating: number | null; lastContactAt: string | null;
  warmupState: WarmupState; warmupDueAt: string | null;
};

const SHORTCUTS = [
  { key: "C", label: "Kopieren & Instagram öffnen" },
  { key: "Enter", label: "Ja, gesendet" },
  { key: "S", label: "Übersprungen" },
  { key: "1 2 3", label: "Variante wählen" },
  { key: "D / T", label: "Kanal DM / Telefon" },
  { key: "G", label: "Neu generieren" },
  { key: "W", label: "Warm-up erledigt" },
  { key: "← →", label: "Vorheriger / nächster Lead" },
  { key: "E", label: "In den Text springen" },
  { key: "Esc", label: "Fokus-Modus schließen" },
  { key: "?", label: "Diese Übersicht" },
];

type Variant = { index: number; body: string; charCount: number; draftId?: string | null };
type Anchor = { key: string; label: string; detail: string };
type Channel = "INSTAGRAM_DM" | "PHONE";
type Tone = "CASUAL_VIENNESE" | "PROFESSIONAL_DU" | "FORMAL_SIE";

const TONES: Array<{ key: Tone; label: string }> = [
  { key: "CASUAL_VIENNESE", label: "Locker (Wienerisch)" },
  { key: "PROFESSIONAL_DU", label: "Professionell (Du)" },
  { key: "FORMAL_SIE", label: "Sachlich (Sie)" },
];

function asReasons(value: unknown): ScoreReason[] {
  return Array.isArray(value) ? (value as ScoreReason[]) : [];
}
function asTags(value: unknown): string[] {
  return Array.isArray(value) ? (value as string[]) : [];
}

export default function OutreachPageComponent() {
  const [leads, setLeads] = useState<QueueLead[]>([]);
  const [sentToday, setSentToday] = useState(0);
  const [dailyLimit, setDailyLimit] = useState(5);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);

  const [channel, setChannel] = useState<Channel>("INSTAGRAM_DM");
  const [tone, setTone] = useState<Tone>("CASUAL_VIENNESE");
  const [variants, setVariants] = useState<Variant[]>([]);
  const [anchors, setAnchors] = useState<Anchor[]>([]);
  const [anchorUsed, setAnchorUsed] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(0);
  const [edited, setEdited] = useState<Record<number, string>>({});
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pulse, setPulse] = useState(false);
  const [receipt, setReceipt] = useState<string | null>(null);
  const confirmRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [warmupBusy, setWarmupBusy] = useState(false);

  const focusIndex = Math.max(0, leads.findIndex((lead) => lead.id === activeId));

  const updateLimit = useCallback((value: number) => {
    setDailyLimit(value);
    window.localStorage.setItem("outreach_daily_limit", String(value));
  }, []);

  const active = leads.find((lead) => lead.id === activeId) ?? null;
  const charLimit = channel === "PHONE" ? 300 : 400;

  // Bewusst ohne activeId in den Dependencies: sonst wuerde die Warteschlange
  // bei jeder Lead-Auswahl neu geladen. Die Vorauswahl passiert ueber den
  // Updater, damit eine laufende Auswahl nicht ueberschrieben wird.
  const loadQueue = useCallback(async () => {
    try {
      const response = await fetch("/api/outreach/queue");
      const data = await response.json();
      const list: QueueLead[] = data.leads ?? [];
      setLeads(list);
      setSentToday(data.sentToday ?? 0);
      setActiveId((previous) => previous ?? list[0]?.id ?? null);

      // Erst nach der Async-Grenze lesen: vermeidet Hydration-Mismatch,
      // weil der Server das Tageslimit nicht kennen kann.
      const stored = Number(window.localStorage.getItem("outreach_daily_limit"));
      if (Number.isFinite(stored) && stored > 0) setDailyLimit(stored);
    } catch {
      setLeads([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  // Der Bestaetigungs-Balken meldet sich genau einmal beim Rücksprung.
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible" && confirmOpen) {
        setPulse(true);
        confirmRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
        setTimeout(() => setPulse(false), 2600);
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [confirmOpen]);

  function resetComposer() {
    setVariants([]); setAnchors([]); setAnchorUsed(null); setEdited({});
    setExpanded(0); setGenError(null); setConfirmOpen(false); setReceipt(null);
  }

  async function generate(anchorKey?: string) {
    if (!active) return;
    setGenerating(true); setGenError(null); setReceipt(null);
    try {
      const response = await fetch("/api/outreach/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: active.id, channel, tone, anchorKey }),
      });
      const data = await response.json();
      setAnchors(data.anchors ?? []);
      if (!data.ok) {
        setGenError(data.reason ?? data.error ?? "Generierung fehlgeschlagen.");
        setVariants([]);
        return;
      }
      setVariants(data.variants ?? []);
      setAnchorUsed(data.anchorUsed ?? null);
      setEdited({});
      setExpanded(0);
    } catch {
      setGenError("Netzwerkfehler bei der Generierung.");
    } finally {
      setGenerating(false);
    }
  }

  async function markWarmupDone() {
    if (!active) return;
    setWarmupBusy(true);
    try {
      await fetch("/api/outreach/warmup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: active.id }),
      });
      await loadQueue();
    } finally {
      setWarmupBusy(false);
    }
  }

  function step(delta: number) {
    if (leads.length === 0) return;
    const next = (focusIndex + delta + leads.length) % leads.length;
    setActiveId(leads[next].id);
    resetComposer();
  }

  function currentText(): string {
    const variant = variants.find((item) => item.index === expanded);
    return edited[expanded] ?? variant?.body ?? "";
  }

  async function copyAndOpen() {
    const text = currentText();
    if (!text || !active) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      setGenError("Zwischenablage nicht verfügbar — Text bitte manuell markieren und kopieren.");
    }
    const handle = normalizeInstagramHandle(active.instagram);
    if (channel === "INSTAGRAM_DM" && handle) {
      window.open(`https://ig.me/m/${handle}`, "_blank", "noopener");
    }
    setConfirmOpen(true);
  }

  async function confirmSent(skipped: boolean) {
    if (!active) return;
    const text = currentText();
    await fetch("/api/outreach/sent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leadId: active.id,
        text,
        channel,
        skipped,
        draftId: variants.find((variant) => variant.index === expanded)?.draftId ?? null,
      }),
    });
    setConfirmOpen(false);
    if (!skipped) {
      setSentToday((value) => value + 1);
      setReceipt(
        `${channel === "PHONE" ? "Anruf" : "DM"} an ${active.companyName} protokolliert · ${new Date().toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" })} · Status → Kontaktiert`,
      );
      void loadQueue();
    }
  }

  // Shortcuts gelten nur im Fokus-Modus und niemals waehrend des Tippens.
  useEffect(() => {
    if (!focusMode) return;
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target?.tagName === "TEXTAREA" || target?.tagName === "INPUT";
      if (typing) {
        if (event.key === "Escape") target?.blur();
        return;
      }
      const key = event.key.toLowerCase();
      // Esc schliesst immer nur die oberste Ebene: erst die Kuerzel-Uebersicht,
      // danach den Fokus-Modus. Sonst fliegt man aus beidem gleichzeitig raus.
      if (key === "escape") {
        if (shortcutsOpen) { setShortcutsOpen(false); return; }
        setFocusMode(false);
        return;
      }
      if (event.key === "?") { setShortcutsOpen((value) => !value); return; }
      if (key === "enter" && confirmOpen) { event.preventDefault(); void confirmSent(false); return; }
      if (key === "c") { void copyAndOpen(); return; }
      if (key === "s") { void confirmSent(true); return; }
      if (key === "g") { void generate(); return; }
      if (key === "w") { void markWarmupDone(); return; }
      if (key === "d") { setChannel("INSTAGRAM_DM"); return; }
      if (key === "t") { setChannel("PHONE"); return; }
      if (key === "e") { event.preventDefault(); textareaRef.current?.focus(); return; }
      if (key === "arrowleft") { step(-1); return; }
      if (key === "arrowright") { step(1); return; }
      if (["1", "2", "3"].includes(event.key)) setExpanded(Number(event.key) - 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const overLimit = sentToday >= dailyLimit;

  const composer = (
      <section className="flex min-w-0 flex-1 flex-col">
        {!active ? (
          <div className="flex flex-1 items-center justify-center p-10">
            <p className="text-sm" style={{ color: "var(--text-3)" }}>Lead aus der Warteschlange wählen.</p>
          </div>
        ) : (
          <>
            <div className="touch-scroll flex-1 overflow-y-auto p-5">
              <header className="mb-4">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-base font-bold" style={{ color: "var(--text)" }}>{active.companyName}</h2>
                  {normalizeInstagramHandle(active.instagram) && (
                    <a
                      href={`https://www.instagram.com/${normalizeInstagramHandle(active.instagram)}`}
                      target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-mono text-xs hover:underline"
                      style={{ color: "var(--text-2)" }}
                    >
                      <AtSign className="h-3.5 w-3.5" />
                      @{normalizeInstagramHandle(active.instagram)}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <ScoreMeter score={active.score} size="lg" reasons={asReasons(active.scoreReasons)} />
                  {active.city && <span className="text-xs" style={{ color: "var(--text-3)" }}>{active.city}</span>}
                  {active.lastContactAt && (
                    <span className="text-xs" style={{ color: "var(--status-planned-tx)" }}>
                      Zuletzt kontaktiert: {new Date(active.lastContactAt).toLocaleDateString("de-AT")}
                    </span>
                  )}
                </div>
                {asTags(active.opportunityTags).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {asTags(active.opportunityTags).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full px-2 py-0.5 text-[11px] font-bold"
                        style={{ background: "var(--surface-3)", color: "var(--text-2)", border: "1px solid var(--border-2)" }}
                      >
                        {TAG_LABELS[tag] ?? tag}
                      </span>
                    ))}
                  </div>
                )}
                {active.interestingReason && (
                  <p className="mt-2 truncate text-xs" style={{ color: "var(--text-2)" }}>
                    „{active.interestingReason}“
                  </p>
                )}
              </header>

              {channel === "INSTAGRAM_DM" && (
                <WarmupRail
                  state={active.warmupState ?? "todo"}
                  dueAt={active.warmupDueAt}
                  onFollowed={() => void markWarmupDone()}
                  busy={warmupBusy}
                />
              )}

              {/* Kanal + Ton */}
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <div className="inline-flex rounded-xl border p-1" style={{ borderColor: "var(--border)" }}>
                  {(["INSTAGRAM_DM", "PHONE"] as Channel[]).map((key) => (
                    <button
                      key={key}
                      onClick={() => { setChannel(key); setVariants([]); setReceipt(null); }}
                      className="inline-flex items-center gap-1.5 rounded-lg px-3 text-xs font-bold"
                      style={{
                        minHeight: 36,
                        background: channel === key ? "var(--accent)" : "transparent",
                        color: channel === key ? "var(--bg)" : "var(--text-2)",
                      }}
                    >
                      {key === "INSTAGRAM_DM" ? <AtSign className="h-3.5 w-3.5" /> : <Phone className="h-3.5 w-3.5" />}
                      {key === "INSTAGRAM_DM" ? "Instagram-DM" : "Telefon-Einstieg"}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {TONES.map((option) => (
                    <button
                      key={option.key}
                      onClick={() => setTone(option.key)}
                      className="rounded-lg border px-3 text-[11px] font-semibold"
                      style={{
                        minHeight: 36,
                        background: tone === option.key ? "var(--surface-3)" : "var(--surface-2)",
                        color: tone === option.key ? "var(--text)" : "var(--text-2)",
                        borderColor: tone === option.key ? "var(--border-2)" : "var(--border)",
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Aufhänger */}
              {anchors.length > 0 && (
                <div className="mb-3 flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: "var(--surface-2)" }}>
                  <Pin className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--accent)" }} />
                  <span className="text-xs" style={{ color: "var(--text-2)" }}>Aufhänger:</span>
                  <select
                    value={anchors.find((anchor) => anchor.label === anchorUsed)?.key ?? anchors[0]?.key}
                    onChange={(event) => void generate(event.target.value)}
                    className="flex-1 bg-transparent text-xs outline-none"
                    style={{ color: "var(--text)" }}
                  >
                    {anchors.map((anchor) => (
                      <option key={anchor.key} value={anchor.key} style={{ background: "var(--surface-2)" }}>
                        {anchor.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Varianten */}
              {generating ? (
                <div className="space-y-2">
                  <div className="skeleton-line h-3 w-full" />
                  <div className="skeleton-line h-3 w-11/12" />
                  <div className="skeleton-line h-3 w-10/12" />
                  <div className="skeleton-line h-3 w-6/12" />
                </div>
              ) : genError ? (
                <div
                  className="flex items-start gap-2 rounded-md p-3 text-xs font-medium"
                  style={{ background: "var(--status-lost-bg)", color: "var(--status-lost-tx)", border: "1px solid rgba(224,104,104,0.3)" }}
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="flex-1">{genError}</span>
                  <button onClick={() => void generate()} className="underline">Nochmal versuchen</button>
                </div>
              ) : variants.length === 0 ? (
                <div
                  className="rounded-lg border border-dashed p-8 text-center"
                  style={{ borderColor: "var(--border-2)" }}
                >
                  <Sparkles className="mx-auto mb-2 h-5 w-5" style={{ color: "var(--text-3)" }} />
                  <p className="text-xs" style={{ color: "var(--text-2)" }}>
                    Kanal und Ton wählen — dann schreibt die KI 3 Varianten.
                  </p>
                  <button
                    onClick={() => void generate()}
                    className="mt-3 rounded-lg px-4 text-xs font-bold"
                    style={{ minHeight: 44, background: "var(--accent)", color: "var(--bg)" }}
                  >
                    3 Varianten schreiben
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {variants.map((variant) => {
                    const text = edited[variant.index] ?? variant.body;
                    const isOpen = expanded === variant.index;
                    if (!isOpen) {
                      return (
                        <button
                          key={variant.index}
                          onClick={() => setExpanded(variant.index)}
                          className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left"
                          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
                        >
                          <span className="min-w-0 flex-1 truncate text-xs" style={{ color: "var(--text-2)" }}>
                            {text}
                          </span>
                          <span className="font-mono text-[11px]" style={{ color: "var(--text-3)" }}>{text.length}</span>
                        </button>
                      );
                    }
                    return (
                      <div key={variant.index} className="animate-fade-in">
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--text-3)" }}>
                            Variante {variant.index + 1}
                            {edited[variant.index] !== undefined && (
                              <span className="ml-2 rounded-full px-2 py-0.5 text-[10px]" style={{ background: "var(--surface-3)", color: "var(--text-2)" }}>
                                Bearbeitet
                              </span>
                            )}
                          </span>
                          <button onClick={() => void generate()} className="text-[11px] underline" style={{ color: "var(--text-3)" }}>
                            Neu schreiben
                          </button>
                        </div>
                        <textarea
                          ref={textareaRef}
                          value={text}
                          onChange={(event) => setEdited((prev) => ({ ...prev, [variant.index]: event.target.value }))}
                          className="w-full rounded-lg p-4 text-sm leading-6 outline-none"
                          style={{
                            minHeight: 180, background: "var(--surface-2)", color: "var(--text)",
                            border: "1px solid var(--border)",
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              )}

              {receipt && (
                <div
                  className="animate-sent-sweep mt-4 flex items-center gap-2 rounded-lg px-4 py-3 text-xs font-semibold"
                  style={{ background: "var(--status-warm-bg)", color: "var(--status-warm-tx)" }}
                >
                  <Check className="h-4 w-4" /> {receipt}
                </div>
              )}
            </div>

            {/* ---- Sticky Footer / Bestätigungs-Balken ---- */}
            <div ref={confirmRef} className="shrink-0 border-t" style={{ borderColor: "var(--border)" }}>
              {confirmOpen ? (
                <div
                  className={pulse ? "animate-confirm-pulse" : undefined}
                  style={{ background: "var(--confirm-bar-bg)", minHeight: 64 }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                    <span className="text-xs font-semibold" style={{ color: "var(--confirm-bar-tx)" }}>
                      ✓ Text kopiert. {channel === "PHONE" ? "Angerufen" : `DM an ${normalizeInstagramHandle(active.instagram) ? "@" + normalizeInstagramHandle(active.instagram) : active.companyName} gesendet`}?
                    </span>
                    <span className="flex gap-2">
                      <button
                        onClick={() => void confirmSent(false)}
                        className="rounded-lg px-4 text-xs font-bold"
                        style={{ minHeight: 44, background: "var(--accent)", color: "var(--bg)" }}
                      >
                        Ja, gesendet
                      </button>
                      <button
                        onClick={() => void confirmSent(true)}
                        className="rounded-lg border px-4 text-xs font-semibold"
                        style={{ minHeight: 44, borderColor: "var(--border-2)", color: "var(--text-2)" }}
                      >
                        Übersprungen
                      </button>
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                  <span className="font-mono text-[11px]" style={{ color: CHAR_COLORS[charState(currentText().length, charLimit)] }}>
                    {channel === "PHONE"
                      ? `~${speakingSeconds(currentText().length)} Sek. Sprechzeit`
                      : `${currentText().length}/${charLimit} Zeichen`}
                    {overLimit && <span style={{ color: "var(--status-planned-tx)" }}> · über dem Tageslimit</span>}
                  </span>
                  <button
                    onClick={() => void copyAndOpen()}
                    disabled={variants.length === 0}
                    className="inline-flex items-center gap-2 rounded-lg px-4 text-xs font-bold"
                    style={{
                      minHeight: 44,
                      background: variants.length === 0 || overLimit ? "transparent" : "var(--accent)",
                      color: variants.length === 0 || overLimit ? "var(--text)" : "var(--bg)",
                      border: variants.length === 0 || overLimit ? "1px solid var(--border-2)" : "none",
                      opacity: variants.length === 0 ? 0.5 : 1,
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    {channel === "PHONE" ? "Text kopieren" : "Kopieren & Instagram öffnen"}
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </section>
  );

  if (focusMode && active) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "var(--bg)" }}>
        <div
          className="flex shrink-0 items-center justify-between gap-3 border-b px-5"
          style={{ minHeight: 56, borderColor: "var(--border)" }}
        >
          <span className="text-xs font-semibold" style={{ color: "var(--text-2)" }}>
            Lead {focusIndex + 1} von {leads.length}
          </span>
          <span className="inline-flex flex-1" style={{ gap: 2, maxWidth: 320 }}>
            {leads.map((lead, index) => (
              <span
                key={lead.id}
                className="flex-1"
                style={{ height: 6, borderRadius: 2, background: index <= focusIndex ? "var(--accent)" : "var(--score-track)" }}
              />
            ))}
          </span>
          <span className="flex items-center gap-3">
            <BudgetMeter sent={sentToday} limit={dailyLimit} onChange={updateLimit} />
            <button
              onClick={() => setShortcutsOpen((value) => !value)}
              className="font-mono text-[11px]"
              style={{ color: "var(--text-3)" }}
              title="Tastaturkürzel"
            >
              [?]
            </button>
            <button onClick={() => setFocusMode(false)} className="text-xs" style={{ color: "var(--text-2)" }}>
              [Esc] Schließen
            </button>
          </span>
        </div>

        <div className="mx-auto flex min-h-0 w-full flex-1 flex-col" style={{ maxWidth: 680 }}>
          {composer}
        </div>

        {shortcutsOpen && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: "var(--overlay)" }} onClick={() => setShortcutsOpen(false)}>
            <div
              className="rounded-2xl border p-5"
              style={{ width: 420, background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--shadow-lg)" }}
              onClick={(event) => event.stopPropagation()}
            >
              <h3 className="mb-3 text-sm font-bold" style={{ color: "var(--text)" }}>Tastaturkürzel</h3>
              {SHORTCUTS.map((entry) => (
                <div key={entry.key} className="flex items-center justify-between py-1 text-xs">
                  <span style={{ color: "var(--text-2)" }}>{entry.label}</span>
                  <kbd
                    className="rounded-md px-1.5 py-0.5 font-mono text-[11px]"
                    style={{ background: "var(--surface-3)", border: "1px solid var(--border-2)", color: "var(--text)" }}
                  >
                    {entry.key}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }


  return (
    <div className="flex h-full flex-col lg:flex-row">
      {/* ---- Warteschlange ---- */}
      <aside
        className="touch-scroll shrink-0 overflow-y-auto border-b lg:border-b-0 lg:border-r"
        style={{ width: "100%", maxWidth: "var(--outreach-queue-w)", borderColor: "var(--border)" }}
      >
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--text-3)" }}>
            Warteschlange
          </span>
          <BudgetMeter sent={sentToday} limit={dailyLimit} onChange={updateLimit} />
          <button
            onClick={() => setFocusMode(true)}
            disabled={leads.length === 0}
            className="rounded-lg border px-2 py-1 text-[11px] font-semibold"
            style={{ borderColor: "var(--border-2)", color: "var(--text-2)", opacity: leads.length === 0 ? 0.4 : 1 }}
          >
            ▶ Fokus
          </button>
        </div>
        {loading ? (
          <div className="space-y-2 px-4">
            {[0, 1, 2].map((index) => <div key={index} className="skeleton-line h-10" />)}
          </div>
        ) : leads.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <Radar className="mx-auto mb-2 h-6 w-6" style={{ color: "var(--text-3)" }} />
            <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Keine Leads mit Instagram</p>
            <p className="mt-1 text-xs" style={{ color: "var(--text-3)" }}>
              Leads mit Instagram-Handle landen hier automatisch.
            </p>
          </div>
        ) : (
          leads.map((lead) => {
            const isActive = lead.id === activeId;
            return (
              <button
                key={lead.id}
                onClick={() => { setActiveId(lead.id); resetComposer(); }}
                className="flex w-full items-center gap-2 px-4 text-left"
                style={{
                  minHeight: 56,
                  background: isActive ? "var(--surface-2)" : "transparent",
                  borderLeft: `2px solid ${isActive ? "var(--accent)" : "transparent"}`,
                }}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold" style={{ color: "var(--text)" }}>
                    {lead.companyName}
                  </span>
                  <span className="block truncate font-mono text-[11px]" style={{ color: "var(--text-3)" }}>
                    {normalizeInstagramHandle(lead.instagram) ? `@${normalizeInstagramHandle(lead.instagram)}` : "—"}
                  </span>
                </span>
                <ScoreMeter score={lead.score} />
              </button>
            );
          })
        )}
      </aside>

      {/* Composer wird in beiden Layouts identisch gerendert. */}
      {composer}
    </div>
  );
}

function BudgetMeter({ sent, limit, onChange }: { sent: number; limit: number; onChange: (value: number) => void }) {
  const [open, setOpen] = useState(false);
  const reached = sent >= limit;
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-2 rounded-full px-2 py-1"
        style={{ background: reached ? "var(--status-planned-bg)" : "transparent" }}
        title="Zurücksetzung um 00:00"
      >
        <span className="inline-flex" style={{ gap: 3 }}>
          {Array.from({ length: Math.min(limit, 8) }).map((_, index) => (
            <span key={index} style={{
              width: 7, height: 7, borderRadius: 999,
              background: index < sent ? "var(--accent)" : "var(--border-2)",
            }} />
          ))}
        </span>
        <span className="font-mono text-[11px]" style={{ color: reached ? "var(--status-planned-tx)" : "var(--text-2)" }}>
          {sent}/{limit}
        </span>
      </button>
      {open && (
        <div
          className="absolute right-0 z-10 mt-2 rounded-xl border p-4"
          style={{ width: 260, background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--shadow-md)" }}
        >
          <input
            type="range" min={1} max={20} value={limit}
            onChange={(event) => onChange(Number(event.target.value))}
            className="w-full"
          />
          <p className="mt-2 text-[11px]" style={{ color: "var(--text-3)" }}>
            Ein frischer Account hält 5–10 DMs am Tag aus. Mehr riskiert eine Sperre.
          </p>
        </div>
      )}
    </div>
  );
}
