"use client";

import { useState, useCallback } from "react";
import { ChevronDown, ChevronRight, Loader2, RefreshCw, ShieldAlert } from "lucide-react";

type Issue = {
  id: string;
  category: string;
  severity: "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  title: string;
  description?: string | null;
  snippet?: string | null;
};

type AuditMeta = {
  auditStatus: string;
  auditSeverity: number | null;
  auditAttemptedAt: string | null;
  website: string | null;
};

const SEVERITY_STYLE: Record<Issue["severity"], { label: string; color: string }> = {
  CRITICAL: { label: "Kritisch", color: "#ef4444" },
  HIGH: { label: "Hoch", color: "#f97316" },
  MEDIUM: { label: "Mittel", color: "#eab308" },
  LOW: { label: "Niedrig", color: "#60a5fa" },
  INFO: { label: "Info", color: "#9ca3af" },
};

const CATEGORY_LABEL: Record<string, string> = {
  SECURITY: "Security",
  TLS: "HTTPS / TLS",
  OUTDATED: "Veraltet",
  BROKEN: "Fehler",
  PERFORMANCE: "Performance",
  SEO: "SEO",
  LEGAL: "Rechtliches",
};

const SEVERITY_ORDER: Issue["severity"][] = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];

export function LeadAuditSection({
  leadId,
  initialStatus,
  initialSeverity,
  onChanged,
}: {
  leadId: string;
  initialStatus?: string | null;
  initialSeverity?: number | null;
  onChanged?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [meta, setMeta] = useState<AuditMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rerunning, setRerunning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/leads/${leadId}/audit`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler beim Laden.");
      setIssues(data.issues ?? []);
      setMeta(data.audit ?? null);
      setLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Laden.");
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !loaded) void load();
  };

  const rerun = async () => {
    setRerunning(true);
    setError(null);
    try {
      const res = await fetch(`/api/leads/${leadId}/audit`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler beim Starten.");
      setMeta((prev) => (prev ? { ...prev, auditStatus: "pending" } : prev));
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Starten.");
    } finally {
      setRerunning(false);
    }
  };

  const status = meta?.auditStatus ?? initialStatus ?? "idle";
  const severity = meta?.auditSeverity ?? initialSeverity ?? null;
  const busy = status === "pending" || status === "running";

  if (status === "idle" && !loaded && !open && severity == null && !initialStatus) {
    return null;
  }

  const sorted = [...issues].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
  );
  const scoreColor =
    severity == null ? "var(--text-3)" : severity >= 60 ? "#ef4444" : severity >= 30 ? "#eab308" : "#22c55e";

  return (
    <div
      className="rounded-xl border"
      style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}
    >
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center gap-2 px-4 py-3 text-left"
        aria-expanded={open}
      >
        {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        <ShieldAlert className="size-4" style={{ color: scoreColor }} />
        <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>
          Website-Probleme &amp; Audit
        </span>
        <span className="ml-auto text-xs font-semibold" style={{ color: scoreColor }}>
          {busy ? "Scan läuft..." : severity != null ? `Risiko ${severity}/100` : status === "failed" ? "Fehlgeschlagen" : "-"}
        </span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          {loading && (
            <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-3)" }}>
              <Loader2 className="size-3.5 animate-spin" /> Lade Audit...
            </div>
          )}
          {error && <p className="text-xs text-red-400">{error}</p>}

          {loaded && sorted.length === 0 && !busy && (
            <p className="text-xs" style={{ color: "var(--text-3)" }}>
              {status === "skipped" ? "Keine Website hinterlegt." : "Keine Probleme gefunden."}
            </p>
          )}

          {sorted.map((issue) => {
            const sev = SEVERITY_STYLE[issue.severity];
            return (
              <div
                key={issue.id}
                className="rounded-lg border p-3 space-y-1.5"
                style={{ borderColor: "var(--border)", background: "var(--surface)" }}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase"
                    style={{ background: `${sev.color}26`, color: sev.color }}
                  >
                    {sev.label}
                  </span>
                  <span className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-3)" }}>
                    {CATEGORY_LABEL[issue.category] ?? issue.category}
                  </span>
                </div>
                <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
                  {issue.title}
                </p>
                {issue.description && (
                  <p className="text-xs" style={{ color: "var(--text-2)" }}>
                    {issue.description}
                  </p>
                )}
                {issue.snippet && (
                  <pre
                    className="text-[11px] rounded-md p-2 overflow-x-auto whitespace-pre-wrap break-all"
                    style={{ background: "var(--surface-3)", color: "var(--text-2)" }}
                  >
                    <code>{issue.snippet}</code>
                  </pre>
                )}
              </div>
            );
          })}

          <button
            type="button"
            onClick={rerun}
            disabled={rerunning || busy}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50"
            style={{ background: "var(--surface-3)", color: "var(--text)" }}
          >
            <RefreshCw className={`size-3 ${rerunning || busy ? "animate-spin" : ""}`} />
            Neu scannen
          </button>
          {busy && (
            <button
              type="button"
              onClick={load}
              className="ml-2 text-xs underline"
              style={{ color: "var(--text-3)" }}
            >
              Status aktualisieren
            </button>
          )}
        </div>
      )}
    </div>
  );
}
