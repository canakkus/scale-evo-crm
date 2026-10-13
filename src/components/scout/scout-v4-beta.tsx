"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Sparkles,
  Search,
  Filter,
  Check,
  ChevronRight,
  MapPin,
  Clock,
  ShieldAlert,
  Globe,
  Phone,
  Star,
  ExternalLink,
  Plus,
  Loader2,
  RefreshCw,
  Layers,
  Flame,
  CheckCircle2,
} from "lucide-react";

type FunnelStats = {
  totalRawFound: number;
  droppedDuplicates: number;
  droppedModernWebsites: number;
  droppedInactiveSocial: number;
  topHotLeads: number;
};

type LeadItem = {
  companyName: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  website: string | null;
  industry: string | null;
  googleMapsUrl: string | null;
  googleRating: number | null;
  reviewCount: number | null;
  hasInstagram: boolean;
  instagramHandle: string | null;
  walkInScore: number;
  opportunityReasons: string[];
  bestVisitTime: {
    recommendedWindow: string;
    avoidWindow: string;
    reason: string;
    confidence: "high" | "medium";
  };
  websiteStatus: "missing" | "outdated" | "unsecure" | "ok";
};

const ALL_VIENNA_DISTRICTS = [
  "1010 Wien (Innere Stadt)",
  "1020 Wien (Leopoldstadt)",
  "1030 Wien (Landstraße)",
  "1040 Wien (Wieden)",
  "1050 Wien (Margareten)",
  "1060 Wien (Mariahilf)",
  "1070 Wien (Neubau)",
  "1080 Wien (Josefstadt)",
  "1090 Wien (Alsergrund)",
  "1100 Wien (Favoriten)",
  "1110 Wien (Simmering)",
  "1120 Wien (Meidling)",
  "1130 Wien (Hietzing)",
  "1140 Wien (Penzing)",
  "1150 Wien (Rudolfsheim)",
  "1160 Wien (Ottakring)",
  "1170 Wien (Hernals)",
  "1180 Wien (Währing)",
  "1190 Wien (Döbling)",
  "1200 Wien (Brigittenau)",
  "1210 Wien (Floridsdorf)",
  "1220 Wien (Donaustadt)",
  "1230 Wien (Liesing)",
];

const INDUSTRIES = [
  { label: "Alle Branchen", slug: "Alle" },
  { label: "Gastronomie & Restaurants", slug: "Gastronomie" },
  { label: "Barber & Friseure", slug: "Barber" },
  { label: "Beauty & Nagelstudios", slug: "Beauty" },
  { label: "Cafés & Bars", slug: "Café" },
  { label: "Handwerk & Bau", slug: "Handwerk" },
];

export function ScoutV4Beta() {
  const [selectedDistricts, setSelectedDistricts] = useState<string[]>(["1010 Wien (Innere Stadt)", "1070 Wien (Neubau)"]);
  const [allViennaSelected, setAllViennaSelected] = useState(false);
  const [selectedIndustry, setSelectedIndustry] = useState("Gastronomie");
  const [targetCount, setTargetCount] = useState(30);

  const [loading, setLoading] = useState(false);
  const [scoutProgress, setScoutProgress] = useState(0);
  const [scoutStep, setScoutStep] = useState<string>("Bereit");
  const [scoutError, setScoutError] = useState<string | null>(null);

  const [funnelStats, setFunnelStats] = useState<FunnelStats | null>(null);
  const [hotLeads, setHotLeads] = useState<LeadItem[]>([]);
  const [poolLeads, setPoolLeads] = useState<LeadItem[]>([]);
  const [importedCompanyNames, setImportedCompanyNames] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Umschalter: Top Walk-In Fokus vs. Gesamter Wien-Pool
  const [viewMode, setViewMode] = useState<"hot" | "pool">("hot");

  // Filter in der Pool-Ansicht
  const [poolSearch, setPoolSearch] = useState("");
  const [poolFilterWebsite, setPoolFilterWebsite] = useState<"all" | "missing" | "has">("all");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 15;

  // Hintergrund-Zustand beim Laden abfragen & Polling bei aktivem Lauf
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    let isMounted = true;

    async function checkState() {
      try {
        const res = await fetch("/api/scout/night-run");
        if (!res.ok) return;
        const data = await res.json();
        if (!isMounted) return;

        const state = data?.state;
        if (!state) return;

        if (state.running) {
          setLoading(true);
          setScoutProgress(state.progress || 10);
          setScoutStep(state.step || "Scout läuft im Hintergrund...");
          setScoutError(null);
          timer = setTimeout(checkState, 1500);
        } else {
          setLoading(false);
          setScoutProgress(state.progress || 0);
          setScoutStep(state.step || "Bereit");

          if (state.error) {
            setScoutError(state.error);
          } else if (state.leads && state.leads.length > 0) {
            setHotLeads(state.leads);
            setPoolLeads(state.allLeads && state.allLeads.length > 0 ? state.allLeads : state.leads);
            if (state.stats) {
              setFunnelStats(state.stats);
            }
          }
        }
      } catch (err) {
        console.error("Scout polling error:", err);
      }
    }

    checkState();

    return () => {
      isMounted = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  function toggleDistrict(d: string) {
    if (allViennaSelected) {
      setAllViennaSelected(false);
      setSelectedDistricts([d]);
      return;
    }
    setSelectedDistricts((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]
    );
  }

  function toggleAllVienna() {
    if (allViennaSelected) {
      setAllViennaSelected(false);
      setSelectedDistricts(["1010 Wien (Innere Stadt)"]);
    } else {
      setAllViennaSelected(true);
      setSelectedDistricts(ALL_VIENNA_DISTRICTS);
    }
  }

  async function handleStartScout() {
    setLoading(true);
    setScoutProgress(10);
    setScoutStep("Initialisiere Scout-Pipeline...");
    setScoutError(null);
    setFunnelStats(null);

    try {
      const districtsToScout = allViennaSelected
        ? ALL_VIENNA_DISTRICTS.map((d) => d.split(" ")[0] + " Wien")
        : selectedDistricts.map((d) => d.split(" ")[0] + " Wien");

      const res = await fetch("/api/scout/night-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          districts: districtsToScout,
          category: selectedIndustry === "Alle" ? "Gastronomie" : selectedIndustry,
          targetCount,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (res.status === 409 && errData.state) {
          setScoutStep(errData.state.step || "Bereits aktiv");
          setScoutProgress(errData.state.progress || 20);
        } else {
          throw new Error(errData.error || "Fehler beim Starten des Scouts.");
        }
      }

      // Reaktives Polling starten
      let isPolling = true;
      const poll = async () => {
        if (!isPolling) return;
        try {
          const pollRes = await fetch("/api/scout/night-run");
          if (pollRes.ok) {
            const data = await pollRes.json();
            const state = data?.state;
            if (state) {
              if (state.running) {
                setLoading(true);
                setScoutProgress(state.progress || 20);
                setScoutStep(state.step || "Scout läuft...");
                setTimeout(poll, 1500);
                return;
              } else {
                setLoading(false);
                setScoutProgress(100);
                setScoutStep("Fertig");
                if (state.error) {
                  setScoutError(state.error);
                } else if (state.leads) {
                  setHotLeads(state.leads);
                  setPoolLeads(state.allLeads && state.allLeads.length > 0 ? state.allLeads : state.leads);
                  if (state.stats) setFunnelStats(state.stats);
                  setViewMode("hot");
                  setToastMessage(`${state.leads.length} Hot Leads erfolgreich analysiert!`);
                  setTimeout(() => setToastMessage(null), 4000);
                }
                return;
              }
            }
          }
        } catch (e) {
          console.error("Poll error:", e);
        }
        setTimeout(poll, 2000);
      };

      setTimeout(poll, 1000);
    } catch (err: any) {
      console.error(err);
      setLoading(false);
      setScoutError(err.message || "Fehler beim Starten.");
    }
  }

  async function handleImportSingle(lead: LeadItem) {
    setImporting(true);
    try {
      const res = await fetch("/api/scout/night-run/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leads: [lead],
        }),
      });
      if (res.ok) {
        setImportedCompanyNames((prev) => new Set([...prev, lead.companyName]));
        setToastMessage(`✓ ${lead.companyName} als Walk-In Lead importiert`);
        setTimeout(() => setToastMessage(null), 3000);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setImporting(false);
    }
  }

  async function handleImportAllHot() {
    const unimported = hotLeads.filter((l) => !importedCompanyNames.has(l.companyName));
    if (unimported.length === 0) return;
    setImporting(true);
    try {
      const res = await fetch("/api/scout/night-run/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leads: unimported,
        }),
      });
      if (res.ok) {
        setImportedCompanyNames((prev) => {
          const next = new Set(prev);
          for (const l of unimported) next.add(l.companyName);
          return next;
        });
        setToastMessage(`✓ ${unimported.length} Hot Leads erfolgreich im 2-Wochen-Fokus angelegt!`);
        setTimeout(() => setToastMessage(null), 4000);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setImporting(false);
    }
  }

  // Filterung für den gesamten Pool
  const filteredPool = useMemo(() => {
    return poolLeads.filter((l) => {
      const q = poolSearch.toLowerCase();
      const matchQuery =
        !q ||
        l.companyName.toLowerCase().includes(q) ||
        (l.address && l.address.toLowerCase().includes(q));

      const matchWeb =
        poolFilterWebsite === "all" ||
        (poolFilterWebsite === "missing" && !l.website) ||
        (poolFilterWebsite === "has" && !!l.website);

      return matchQuery && matchWeb;
    });
  }, [poolLeads, poolSearch, poolFilterWebsite]);

  const paginatedPool = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredPool.slice(start, start + PAGE_SIZE);
  }, [filteredPool, page]);

  const totalPages = Math.ceil(filteredPool.length / PAGE_SIZE) || 1;

  return (
    <div className="space-y-6">
      {/* Beta Banner */}
      <div
        className="rounded-xl p-4 border flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-sm"
        style={{ background: "rgba(245, 158, 11, 0.08)", borderColor: "rgba(245, 158, 11, 0.3)" }}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400 shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-bold text-amber-300 flex items-center gap-2">
              <span>Lead Scout 4.0 Beta — Wien-Pool & Multi-Stage Walk-In Trichter</span>
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-200 border border-amber-500/30">
                Neu
              </span>
            </div>
            <p className="text-xs text-amber-200/80 mt-0.5">
              Scoutet auf Masse in ganz Wien, filtert veraltete Websites und Social-Media-Aktivität heraus und berechnet dir die perfekte Besuchszeit.
            </p>
          </div>
        </div>
      </div>

      {/* Konfigurationskarte */}
      <div className="rounded-xl border p-5 space-y-5" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        {/* Row 1: Branche & Ziel-Größe */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold mb-1.5 block" style={{ color: "var(--text-2)" }}>
              Branche auswählen
            </label>
            <select
              value={selectedIndustry}
              onChange={(e) => setSelectedIndustry(e.target.value)}
              className="w-full rounded-xl px-3 py-2 text-sm border outline-none cursor-pointer"
              style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
            >
              {INDUSTRIES.map((ind) => (
                <option key={ind.slug} value={ind.slug}>
                  {ind.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold mb-1.5 block" style={{ color: "var(--text-2)" }}>
              Ziel-Ergebnisgröße (Top Leads)
            </label>
            <div className="flex items-center gap-2">
              {[20, 30, 50].map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => setTargetCount(count)}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                    targetCount === count
                      ? "border-[var(--accent)] text-[var(--accent)] bg-[var(--surface-2)] shadow-sm"
                      : "border-[var(--border)] text-[var(--text-3)] hover:text-[var(--text)]"
                  }`}
                >
                  Top {count} Leads
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Row 2: Bezirke / Ganz Wien */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold" style={{ color: "var(--text-2)" }}>
              Gebiet in Wien eingrenzen
            </label>
            <button
              type="button"
              onClick={toggleAllVienna}
              className={`text-xs font-bold px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                allViennaSelected
                  ? "bg-[var(--accent)] text-[var(--bg)] border-transparent"
                  : "border-[var(--border)] text-[var(--text-2)] hover:text-[var(--text)]"
              }`}
            >
              {allViennaSelected ? "✓ Ganz Wien ausgewählt (23 Bezirke)" : "Ganz Wien auswählen"}
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-1.5 rounded-xl border" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
            {ALL_VIENNA_DISTRICTS.map((district) => {
              const active = allViennaSelected || selectedDistricts.includes(district);
              return (
                <button
                  key={district}
                  type="button"
                  onClick={() => toggleDistrict(district)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all border cursor-pointer ${
                    active
                      ? "bg-[var(--surface)] text-[var(--accent)] border-[var(--accent)] font-bold shadow-sm"
                      : "bg-transparent text-[var(--text-3)] border-transparent hover:text-[var(--text)] hover:bg-[var(--surface-3)]"
                  }`}
                >
                  {district.split(" ")[0]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Start Button */}
        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={handleStartScout}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold shadow-md transition-all cursor-pointer hover:opacity-90 active:scale-95 disabled:opacity-50"
            style={{ background: "var(--accent)", color: "var(--bg)" }}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Flame className="w-4 h-4" />}
            <span>{loading ? "Scout läuft im Hintergrund…" : "Scout & Trichter jetzt starten"}</span>
          </button>
        </div>
      </div>

      {/* Live Server-Background Progress Banner */}
      {loading && (
        <div
          className="rounded-xl border p-4 space-y-3 animate-fade-in shadow-sm"
          style={{ background: "rgba(59, 130, 246, 0.06)", borderColor: "rgba(59, 130, 246, 0.3)" }}
        >
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 font-bold text-blue-400">
              <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
              <span>{scoutStep}</span>
            </div>
            <span className="font-mono font-bold text-blue-300">{scoutProgress}%</span>
          </div>

          <div className="w-full bg-blue-950/40 border border-blue-500/20 h-2.5 rounded-full overflow-hidden p-0.5">
            <div
              className="bg-gradient-to-r from-blue-500 to-amber-400 h-full rounded-full transition-all duration-500 ease-out"
              style={{ width: `${Math.max(5, scoutProgress)}%` }}
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between text-[11px] text-[var(--text-3)] gap-1">
            <span>Server-Hintergrund aktiv: Du kannst den Tab wechseln oder andere CRM-Funktionen nutzen – der Scout bricht nicht ab.</span>
            <span className="text-amber-300/90 font-medium shrink-0">0€ LLM-Kosten (Reine Skripte & Heuristiken)</span>
          </div>
        </div>
      )}

      {/* Fehler-Meldung */}
      {scoutError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300 flex items-center gap-2.5 animate-fade-in">
          <ShieldAlert className="w-4 h-4 shrink-0 text-red-400" />
          <span>{scoutError}</span>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl border bg-[var(--surface)] text-[var(--text)] border-emerald-500/40 shadow-xl animate-fade-in text-xs font-semibold">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Trichter-Visualisierung */}
      {funnelStats && (
        <div
          className="rounded-xl border p-4 animate-fade-in space-y-3"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          <div className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
            Trichter-Ergebnis (Auswertung)
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
            <div className="p-3 rounded-xl border" style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}>
              <div className="text-xl font-bold font-mono" style={{ color: "var(--text)" }}>
                {funnelStats.totalRawFound}
              </div>
              <div className="text-[11px] mt-0.5" style={{ color: "var(--text-3)" }}>
                1. Roh gefunden
              </div>
            </div>

            <div className="p-3 rounded-xl border border-red-500/20 bg-red-500/5">
              <div className="text-xl font-bold font-mono text-red-400">
                −{funnelStats.droppedDuplicates}
              </div>
              <div className="text-[11px] mt-0.5 text-red-300">
                2. Duplikate / CRM
              </div>
            </div>

            <div className="p-3 rounded-xl border border-red-500/20 bg-red-500/5">
              <div className="text-xl font-bold font-mono text-red-400">
                −{funnelStats.droppedModernWebsites}
              </div>
              <div className="text-[11px] mt-0.5 text-red-300">
                3. Moderne Websites
              </div>
            </div>

            <div className="p-3 rounded-xl border border-amber-500/20 bg-amber-500/5">
              <div className="text-xl font-bold font-mono text-amber-400">
                −{funnelStats.droppedInactiveSocial}
              </div>
              <div className="text-[11px] mt-0.5 text-amber-300">
                4. Inaktiv / Kalt
              </div>
            </div>

            <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10">
              <div className="text-xl font-bold font-mono text-emerald-400">
                {funnelStats.topHotLeads}
              </div>
              <div className="text-[11px] mt-0.5 text-emerald-300 font-semibold">
                5. Hot Walk-Ins 🔥
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Ergebnis-Bereich mit Umschalter */}
      {(hotLeads.length > 0 || poolLeads.length > 0) && (
        <div className="space-y-4">
          {/* Umschalter: Hot Walk-In Fokus vs. Gesamter Wien-Pool */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3" style={{ borderColor: "var(--border)" }}>
            <div
              className="inline-flex p-0.5 rounded-xl border shadow-inner"
              style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}
            >
              <button
                type="button"
                onClick={() => setViewMode("hot")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  viewMode === "hot"
                    ? "bg-[var(--surface)] text-[var(--text)] shadow-sm"
                    : "text-[var(--text-3)] hover:text-[var(--text)]"
                }`}
              >
                <Flame className="w-3.5 h-3.5 text-amber-400" />
                <span>Hot Walk-In Fokus ({hotLeads.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setViewMode("pool")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  viewMode === "pool"
                    ? "bg-[var(--surface)] text-[var(--text)] shadow-sm"
                    : "text-[var(--text-3)] hover:text-[var(--text)]"
                }`}
              >
                <Layers className="w-3.5 h-3.5 text-blue-400" />
                <span>Gesamter Wien-Pool ({poolLeads.length})</span>
              </button>
            </div>

            {viewMode === "hot" && (
              <button
                type="button"
                onClick={handleImportAllHot}
                disabled={importing}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25 active:scale-95 disabled:opacity-50"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Alle {hotLeads.length} als Walk-Ins importieren</span>
              </button>
            )}
          </div>

          {/* Ansicht 1: Hot Walk-In Fokus Cards */}
          {viewMode === "hot" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {hotLeads.map((lead, idx) => {
                const isImported = importedCompanyNames.has(lead.companyName);

                return (
                  <div
                    key={idx}
                    className="rounded-xl border p-4 space-y-3.5 transition-all hover:border-[var(--border-2)]"
                    style={{ background: "var(--surface)", borderColor: "var(--border)" }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-bold text-base flex items-center gap-2" style={{ color: "var(--text)" }}>
                          <span>{lead.companyName}</span>
                          <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                            Score {lead.walkInScore}
                          </span>
                        </div>
                        <div className="text-xs text-[var(--text-3)] flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3" />
                          <span>{lead.address || "Wien"}</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleImportSingle(lead)}
                        disabled={isImported || importing}
                        className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-all shrink-0 cursor-pointer ${
                          isImported
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : "bg-[var(--surface-2)] text-[var(--text)] border-[var(--border)] hover:bg-[var(--surface-3)] active:scale-95"
                        }`}
                      >
                        {isImported ? "✓ Importiert" : "+ Import"}
                      </button>
                    </div>

                    {/* Beste Besuchszeit Box */}
                    {lead.bestVisitTime && (
                      <div
                        className="p-2.5 rounded-lg border text-xs space-y-1"
                        style={{ background: "rgba(59, 130, 246, 0.06)", borderColor: "rgba(59, 130, 246, 0.25)" }}
                      >
                        <div className="font-bold flex items-center gap-1.5 text-blue-400 text-[11px] uppercase tracking-wider">
                          <Clock className="w-3.5 h-3.5" />
                          <span>Beste Besuchszeit (Walk-In Slot)</span>
                        </div>
                        <div className="font-semibold text-blue-200">
                          {lead.bestVisitTime.recommendedWindow}
                        </div>
                        <div className="text-[11px] text-blue-300/80">
                          {lead.bestVisitTime.reason}
                        </div>
                      </div>
                    )}

                    {/* Walk-In Hebel */}
                    <div className="space-y-1">
                      <div className="text-[11px] font-bold text-[var(--text-3)] uppercase tracking-wider">
                        Walk-In Hebel & Mängel:
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {lead.opportunityReasons.map((reason, rIdx) => (
                          <span
                            key={rIdx}
                            className="text-[11px] px-2 py-0.5 rounded-md border font-medium bg-red-500/10 text-red-300 border-red-500/20"
                          >
                            {reason}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Meta Bar */}
                    <div className="pt-2 border-t flex items-center justify-between text-xs text-[var(--text-3)]" style={{ borderColor: "var(--border)" }}>
                      <div className="flex items-center gap-3">
                        {lead.googleRating && (
                          <span className="flex items-center gap-1 text-amber-400 font-semibold">
                            <Star className="w-3.5 h-3.5 fill-amber-400" />
                            <span>{lead.googleRating}</span>
                            <span className="text-[var(--text-3)] font-normal">({lead.reviewCount})</span>
                          </span>
                        )}
                        {lead.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            <span>{lead.phone}</span>
                          </span>
                        )}
                      </div>

                      {lead.googleMapsUrl && (
                        <a
                          href={lead.googleMapsUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:text-[var(--text)] transition-colors flex items-center gap-1"
                        >
                          <span>Maps</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Ansicht 2: Gesamter Wien-Pool Tabelle */
            <div className="space-y-3">
              {/* Filter Leiste */}
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-3)]" />
                  <input
                    type="text"
                    placeholder="Wien-Pool durchsuchen (Firma, Bezirk)..."
                    value={poolSearch}
                    onChange={(e) => {
                      setPoolSearch(e.target.value);
                      setPage(1);
                    }}
                    className="w-full pl-9 pr-3 py-1.5 rounded-xl text-xs border outline-none"
                    style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={poolFilterWebsite}
                    onChange={(e: any) => {
                      setPoolFilterWebsite(e.target.value);
                      setPage(1);
                    }}
                    className="rounded-xl px-2.5 py-1.5 text-xs border outline-none cursor-pointer"
                    style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text-2)" }}
                  >
                    <option value="all">Alle Website-Zustände</option>
                    <option value="missing">Nur ohne Website</option>
                    <option value="has">Mit Website</option>
                  </select>
                </div>
              </div>

              {/* Pool Tabelle */}
              <div className="rounded-xl border overflow-hidden shadow-sm" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                        <th className="px-4 py-3 font-semibold text-[var(--text-2)]">Firma & Adresse</th>
                        <th className="px-4 py-3 font-semibold text-[var(--text-2)]">Website</th>
                        <th className="px-4 py-3 font-semibold text-[var(--text-2)]">Google Rating</th>
                        <th className="px-4 py-3 font-semibold text-[var(--text-2)]">Beste Besuchszeit</th>
                        <th className="px-4 py-3 font-semibold text-right text-[var(--text-2)]">Aktion</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y" style={{ borderColor: "var(--border)" }}>
                      {paginatedPool.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-[var(--text-3)]">
                            Keine Betriebe im Pool gefunden.
                          </td>
                        </tr>
                      ) : (
                        paginatedPool.map((lead, pIdx) => {
                          const isImported = importedCompanyNames.has(lead.companyName);

                          return (
                            <tr key={pIdx} className="hover:bg-[var(--surface-3)] transition-colors">
                              <td className="px-4 py-3 font-medium">
                                <div className="font-bold text-[var(--text)]">{lead.companyName}</div>
                                <div className="text-[11px] text-[var(--text-3)]">{lead.address || "Wien"}</div>
                              </td>

                              <td className="px-4 py-3">
                                {lead.website ? (
                                  <a
                                    href={lead.website}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-blue-400 hover:underline flex items-center gap-1 max-w-[150px] truncate"
                                  >
                                    <Globe className="w-3 h-3 shrink-0" />
                                    <span className="truncate">{lead.website.replace(/^https?:\/\//, "")}</span>
                                  </a>
                                ) : (
                                  <span className="text-red-400 font-semibold text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 border border-red-500/20">
                                    Keine Website
                                  </span>
                                )}
                              </td>

                              <td className="px-4 py-3">
                                {lead.googleRating ? (
                                  <span className="flex items-center gap-1 font-semibold text-amber-400">
                                    <Star className="w-3 h-3 fill-amber-400" />
                                    <span>{lead.googleRating}</span>
                                    <span className="text-[var(--text-3)] font-normal">({lead.reviewCount})</span>
                                  </span>
                                ) : (
                                  <span className="text-[var(--text-3)]">—</span>
                                )}
                              </td>

                              <td className="px-4 py-3">
                                <span className="text-[11px] text-blue-300 font-medium">
                                  {lead.bestVisitTime?.recommendedWindow || "14:30 – 16:30 Uhr"}
                                </span>
                              </td>

                              <td className="px-4 py-3 text-right">
                                <button
                                  type="button"
                                  onClick={() => handleImportSingle(lead)}
                                  disabled={isImported || importing}
                                  className={`text-[11px] font-bold px-2.5 py-1 rounded-md border transition-all cursor-pointer ${
                                    isImported
                                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                      : "bg-[var(--surface-2)] text-[var(--text)] border-[var(--border)] hover:bg-[var(--surface-3)]"
                                  }`}
                                >
                                  {isImported ? "✓" : "+ Lead"}
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="p-3 border-t flex items-center justify-between text-xs" style={{ borderColor: "var(--border)" }}>
                    <span className="text-[var(--text-3)]">
                      Seite {page} von {totalPages} ({filteredPool.length} Betriebe)
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page <= 1}
                        className="px-2 py-1 rounded border disabled:opacity-40"
                        style={{ borderColor: "var(--border)", color: "var(--text)" }}
                      >
                        Zurück
                      </button>
                      <button
                        type="button"
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page >= totalPages}
                        className="px-2 py-1 rounded border disabled:opacity-40"
                        style={{ borderColor: "var(--border)", color: "var(--text)" }}
                      >
                        Weiter
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
