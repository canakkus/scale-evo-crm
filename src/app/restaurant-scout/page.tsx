"use client";

import { useState } from "react";
import {
  UtensilsCrossed,
  Search,
  MapPin,
  Globe,
  Phone,
  Star,
  ExternalLink,
  RefreshCw,
  Eye,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Filter,
  Sparkles,
  ChevronRight,
  X,
  Layers,
  ArrowUpRight,
  SlidersHorizontal,
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { LeadDetailModal } from "@/components/leads/lead-detail-modal";
import type { RestaurantScoutLeadItem } from "@/services/restaurant-scout";

const CUISINES = [
  { value: "", label: "Alle Küchen (Gastronomie)" },
  { value: "Italienisch", label: "Italienisch & Pizzeria" },
  { value: "Asiatisch", label: "Asiatisch, Sushi & Ramen" },
  { value: "Burger", label: "Burger & Fast Casual" },
  { value: "Österreichisch", label: "Gutbürgerlich & Österreichisch" },
  { value: "Griechisch", label: "Griechisch & Mediterran" },
  { value: "Mexikanisch", label: "Mexikanisch & Tacos" },
  { value: "Indisch", label: "Indisch & Curry" },
  { value: "Cafe", label: "Café, Bistro & Brunch" },
  { value: "Steakhouse", label: "Steakhouse & Grill" },
];

const LOCATION_PRESETS = ["Wien", "1010 Wien", "1070 Wien", "Graz", "Linz", "Salzburg", "München", "Berlin"];

export default function RestaurantScoutPage() {
  const [location, setLocation] = useState("Wien");
  const [cuisineType, setCuisineType] = useState("");
  const [maxResults, setMaxResults] = useState(10);
  const [filterNoMenuOnly, setFilterNoMenuOnly] = useState(false);

  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const [results, setResults] = useState<RestaurantScoutLeadItem[]>([]);
  const [hasScouted, setHasScouted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter panel collapse on tablet/mobile
  const [showFilters, setShowFilters] = useState(true);

  // Preview Drawer State
  const [selectedLead, setSelectedLead] = useState<RestaurantScoutLeadItem | null>(null);
  const [checkingMenuId, setCheckingMenuId] = useState<string | null>(null);

  // Full Lead Detail Modal
  const [fullModalLeadId, setFullModalLeadId] = useState<string | null>(null);

  async function handleStartScout(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!location.trim()) return;

    setLoading(true);
    setError(null);
    setLoadingStep("1/3: Google Places Daten abrufen...");

    try {
      // simulate progress steps for visual feedback
      const stepTimer1 = setTimeout(() => {
        setLoadingStep("2/3: Restaurant-Websites scannen...");
      }, 1500);
      const stepTimer2 = setTimeout(() => {
        setLoadingStep("3/3: Speisekarten mit Gemini KI analysieren...");
      }, 3500);

      const res = await fetch("/api/scout/restaurants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location: location.trim(),
          cuisineType: cuisineType || undefined,
          maxResults,
          filterNoMenuOnly,
        }),
      });

      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Fehler beim Ausführen des Restaurant Scouts.");
      }

      const data = await res.json();
      setResults(data.results || []);
      setHasScouted(true);
      if (data.results && data.results.length > 0) {
        setSelectedLead(data.results[0]);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Unerwarteter Fehler beim Restaurant Scout.");
    } finally {
      setLoading(false);
      setLoadingStep("");
    }
  }

  async function handleSingleCheckMenu(lead: RestaurantScoutLeadItem) {
    if (!lead.id) return;
    setCheckingMenuId(lead.id);

    try {
      const res = await fetch(`/api/leads/${lead.id}/check-menu`, {
        method: "POST",
      });

      if (res.ok) {
        const data = await res.json();
        const updatedMenu = data.menuResult;

        setResults((prev) =>
          prev.map((item) =>
            item.id === lead.id
              ? {
                  ...item,
                  hasMenu: updatedMenu.hasMenu,
                  menuUrl: updatedMenu.menuUrl,
                  menuSnippet: updatedMenu.menuSnippet,
                  menuCheckedAt: new Date().toISOString(),
                }
              : item
          )
        );

        if (selectedLead?.id === lead.id) {
          setSelectedLead((prev) =>
            prev
              ? {
                  ...prev,
                  hasMenu: updatedMenu.hasMenu,
                  menuUrl: updatedMenu.menuUrl,
                  menuSnippet: updatedMenu.menuSnippet,
                  menuCheckedAt: new Date().toISOString(),
                }
              : null
          );
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCheckingMenuId(null);
    }
  }

  // Stats calculation
  const totalCount = results.length;
  const countWithMenu = results.filter((r) => r.hasMenu && r.website).length;
  const countNoMenu = results.filter((r) => !r.hasMenu && r.website).length;
  const countNoWebsite = results.filter((r) => !r.website).length;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden select-none md:select-auto" style={{ background: "var(--bg)" }}>
      {/* Top Header Bar */}
      <div
        className="px-4 md:px-6 py-3.5 border-b shrink-0 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="flex items-center justify-center w-10 h-10 rounded-xl shrink-0 shadow-sm"
              style={{ background: "linear-gradient(135deg, var(--accent) 0%, #ff8c00 100%)", color: "#000" }}
            >
              <UtensilsCrossed size={20} strokeWidth={2.5} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-heading text-base md:text-lg font-bold" style={{ color: "var(--text)" }}>
                  Restaurant Scout & Menü-Radar
                </h1>
                <span
                  className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider"
                  style={{ background: "var(--surface-2)", color: "var(--accent)", border: "1px solid var(--border)" }}
                >
                  Gemini 1.5 KI
                </span>
              </div>
              <p className="text-xs hidden sm:block" style={{ color: "var(--text-2)" }}>
                Finde Gastronomiebetriebe automatisiert via Google Places & erkenne fehlende Speisekarten zur Akquise.
              </p>
            </div>
          </div>

          {/* Toggle Filter Button on Tablet/iPad Portrait */}
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className="lg:hidden flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold shadow-xs"
            style={{
              background: showFilters ? "var(--accent)" : "var(--surface-2)",
              color: showFilters ? "#000" : "var(--text)",
              borderColor: "var(--border)",
            }}
          >
            <SlidersHorizontal size={14} />
            <span>{showFilters ? "Filter verbergen" : "Filter öffnen"}</span>
          </button>
        </div>

        {hasScouted && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0" style={{ WebkitOverflowScrolling: "touch" }}>
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs whitespace-nowrap shrink-0"
              style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}
            >
              <span style={{ color: "var(--text-3)" }}>Ergebnisse:</span>
              <span className="font-bold" style={{ color: "var(--text)" }}>
                {totalCount}
              </span>
              <span className="text-zinc-500">•</span>
              <span className="text-emerald-400 font-medium">{countWithMenu} mit Karte</span>
              <span className="text-zinc-500">•</span>
              <span className="text-amber-400 font-medium">{countNoMenu} ohne Karte</span>
            </div>
          </div>
        )}
      </div>

      {/* Main Content Layout */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left Filter & Action Panel */}
        {showFilters && (
          <div
            className="w-full lg:w-80 border-b lg:border-b-0 lg:border-r shrink-0 flex flex-col p-4 md:p-5 overflow-y-auto space-y-4 md:space-y-5"
            style={{ background: "var(--surface)", borderColor: "var(--border)", WebkitOverflowScrolling: "touch" }}
          >
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
              <div className="flex items-center gap-2">
                <SlidersHorizontal size={14} />
                <span>Scout Parameter</span>
              </div>
            </div>

          <form onSubmit={handleStartScout} className="space-y-4">
            {/* Location Input */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold" style={{ color: "var(--text-2)" }}>
                Standort / Stadt / Bezirk
              </label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--text-3)" }} />
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="z.B. Wien, 1010 Wien, Graz"
                  required
                  className="w-full pl-9 pr-3 py-2 rounded-lg text-xs border outline-none font-medium transition-all"
                  style={{
                    background: "var(--surface-2)",
                    borderColor: "var(--border)",
                    color: "var(--text)",
                  }}
                />
              </div>

              {/* Quick Preset Buttons */}
              <div className="flex flex-wrap gap-1 pt-1">
                {LOCATION_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setLocation(preset)}
                    className={cn(
                      "px-2 py-0.5 rounded text-[10px] font-medium border transition-colors",
                      location === preset
                        ? "bg-[var(--accent)] text-black border-transparent font-bold"
                        : "hover:bg-[var(--surface-3)] text-[var(--text-2)] border-[var(--border)]"
                    )}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Cuisine Selector */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold" style={{ color: "var(--text-2)" }}>
                Küche / Kategorie
              </label>
              <select
                value={cuisineType}
                onChange={(e) => setCuisineType(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-xs border outline-none font-medium cursor-pointer"
                style={{
                  background: "var(--surface-2)",
                  borderColor: "var(--border)",
                  color: "var(--text)",
                }}
              >
                {CUISINES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Max Results */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold" style={{ color: "var(--text-2)" }}>
                  Anzahl Restaurants
                </span>
                <span className="font-mono font-bold" style={{ color: "var(--accent)" }}>
                  {maxResults} Treffer
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {[5, 10, 15, 20].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setMaxResults(num)}
                    className={cn(
                      "py-1.5 rounded text-xs font-medium border transition-all text-center",
                      maxResults === num
                        ? "bg-[var(--accent)] text-black border-transparent font-bold"
                        : "hover:bg-[var(--surface-3)] text-[var(--text-2)] border-[var(--border)]"
                    )}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>

            {/* Checkbox: Filter No Menu Only */}
            <div
              className="p-3 rounded-lg border flex items-start gap-2.5 cursor-pointer transition-colors hover:bg-[var(--surface-2)]"
              style={{
                borderColor: filterNoMenuOnly ? "var(--accent)" : "var(--border)",
                background: filterNoMenuOnly ? "rgba(255, 170, 0, 0.05)" : "var(--surface-2)",
              }}
              onClick={() => setFilterNoMenuOnly(!filterNoMenuOnly)}
            >
              <input
                type="checkbox"
                id="filterNoMenuOnly"
                checked={filterNoMenuOnly}
                onChange={(e) => setFilterNoMenuOnly(e.target.checked)}
                className="mt-0.5 cursor-pointer accent-[var(--accent)]"
              />
              <div className="space-y-0.5">
                <label htmlFor="filterNoMenuOnly" className="text-xs font-bold block cursor-pointer" style={{ color: "var(--text)" }}>
                  Nur ohne Speisekarte anzeigen
                </label>
                <p className="text-[11px] leading-tight" style={{ color: "var(--text-3)" }}>
                  Filtert gezielt Betriebe heraus, die keine Speisekarte online haben (perfekt für Akquise!).
                </p>
              </div>
            </div>

            {/* Trigger Button */}
            <button
              type="submit"
              disabled={loading || !location.trim()}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: "linear-gradient(135deg, var(--accent) 0%, #ff8c00 100%)",
                color: "#000",
              }}
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Scout läuft...</span>
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  <span>Restaurant Scout starten</span>
                </>
              )}
            </button>
          </form>

          {/* Loading status indicator */}
          {loading && (
            <div
              className="p-3.5 rounded-xl border animate-pulse space-y-2"
              style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}
            >
              <div className="flex items-center gap-2 text-xs font-bold" style={{ color: "var(--accent)" }}>
                <Sparkles size={14} className="animate-spin" />
                <span>Automatisierte Analyse</span>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: "var(--text-2)" }}>
                {loadingStep || "Suche nach Restaurants..."}
              </p>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Scout Feature Explanations */}
          <div className="pt-2 border-t space-y-2 text-[11px]" style={{ borderColor: "var(--border)", color: "var(--text-3)" }}>
            <div className="font-semibold text-xs mb-1" style={{ color: "var(--text-2)" }}>
              Funktionsweise:
            </div>
            <div className="flex items-start gap-1.5">
              <span>1.</span>
              <span>Google Places liefert verifizierte Betriebe, Adressen & Maps-Daten.</span>
            </div>
            <div className="flex items-start gap-1.5">
              <span>2.</span>
              <span>HTML-Parser durchsucht Unterseiten nach Speisekarten, PDFs & Lieferlinks.</span>
            </div>
            <div className="flex items-start gap-1.5">
              <span>3.</span>
              <span>Gemini 1.5 Flash validiert das Menü und fasst das Angebot zusammen.</span>
            </div>
            <div className="flex items-start gap-1.5">
              <span>4.</span>
              <span>Automatische Speicherung als Lead in der CRM-Pipeline.</span>
            </div>
          </div>
          </div>
        )}

        {/* Center / Right: Results List + Detail Side-Panel */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Main Results Table Area */}
          <div className="flex-1 flex flex-col overflow-y-auto p-6 space-y-4">
            {!hasScouted && !loading && (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-12 space-y-3">
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center border shadow-inner mb-2"
                  style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}
                >
                  <UtensilsCrossed size={30} style={{ color: "var(--accent)" }} />
                </div>
                <h3 className="font-heading text-base font-bold" style={{ color: "var(--text)" }}>
                  Keine Suche aktiv
                </h3>
                <p className="text-xs max-w-sm" style={{ color: "var(--text-3)" }}>
                  Wähle Standort und Küche auf der linken Seite aus und klicke auf{" "}
                  <strong style={{ color: "var(--text)" }}>„Restaurant Scout starten“</strong>.
                </p>
              </div>
            )}

            {loading && results.length === 0 && (
              <div className="flex-1 flex flex-col items-center justify-center p-12 space-y-4">
                <div className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
                <div className="text-center space-y-1">
                  <div className="text-xs font-semibold" style={{ color: "var(--text)" }}>
                    {loadingStep || "Analysiere Restaurants..."}
                  </div>
                  <p className="text-[11px]" style={{ color: "var(--text-3)" }}>
                    Google Places API + Gemini SDK arbeiten im Hintergrund
                  </p>
                </div>
              </div>
            )}

            {results.length > 0 && (
              <div className="space-y-4">
                {/* Result Cards / Table */}
                <div
                  className="rounded-xl border overflow-hidden shadow-sm"
                  style={{ background: "var(--surface)", borderColor: "var(--border)" }}
                >
                  <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: "touch" }}>
                    <div className="min-w-[620px]">
                      <div
                        className="grid grid-cols-12 gap-3 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider border-b"
                        style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text-3)" }}
                      >
                        <div className="col-span-4">Restaurant & Küche</div>
                        <div className="col-span-3">Standort & Kontakt</div>
                        <div className="col-span-3">Speisekarte (KI)</div>
                        <div className="col-span-2 text-right">Aktion</div>
                      </div>

                      <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                    {results.map((lead) => {
                      const isSelected = selectedLead?.id === lead.id;
                      const isChecking = checkingMenuId === lead.id;

                      return (
                        <div
                          key={lead.id || lead.companyName}
                          onClick={() => setSelectedLead(lead)}
                          className={cn(
                            "grid grid-cols-12 gap-3 px-4 py-3 text-xs items-center cursor-pointer transition-colors",
                            isSelected
                              ? "bg-[var(--surface-2)] border-l-2 border-l-[var(--accent)]"
                              : "hover:bg-[var(--surface-3)]"
                          )}
                        >
                          {/* Name & Rating */}
                          <div className="col-span-4 space-y-1">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold truncate" style={{ color: "var(--text)" }}>
                                {lead.companyName}
                              </span>
                              {lead.isExistingLead && (
                                <span
                                  className="px-1.5 py-0.2 rounded text-[9px] font-semibold uppercase"
                                  style={{ background: "rgba(0, 150, 255, 0.1)", color: "#38bdf8" }}
                                >
                                  Im CRM
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-[11px]" style={{ color: "var(--text-3)" }}>
                              <span className="font-medium text-amber-400 flex items-center gap-0.5">
                                <Star size={11} className="fill-amber-400" />
                                {lead.googleRating ? lead.googleRating.toFixed(1) : "–"}
                              </span>
                              {lead.googleReviewCount != null && <span>({lead.googleReviewCount} Rez.)</span>}
                              <span>•</span>
                              <span>{lead.industry || "Restaurant"}</span>
                            </div>
                          </div>

                          {/* Address & Links */}
                          <div className="col-span-3 space-y-1">
                            <div className="flex items-center gap-1 truncate text-[11px]" style={{ color: "var(--text-2)" }}>
                              <MapPin size={11} className="shrink-0" style={{ color: "var(--text-3)" }} />
                              <span className="truncate">{lead.address || lead.city || "–"}</span>
                            </div>
                            <div className="flex items-center gap-3 text-[11px]">
                              {lead.phone && (
                                <a
                                  href={`tel:${lead.phone}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="flex items-center gap-1 hover:underline truncate font-mono text-[10px]"
                                  style={{ color: "var(--accent)" }}
                                >
                                  <Phone size={10} />
                                  <span>{lead.phone}</span>
                                </a>
                              )}
                              {lead.website && (
                                <a
                                  href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="flex items-center gap-1 hover:underline truncate text-[10px]"
                                  style={{ color: "var(--text-3)" }}
                                >
                                  <Globe size={10} />
                                  <span>Website</span>
                                </a>
                              )}
                            </div>
                          </div>

                          {/* Menu Status */}
                          <div className="col-span-3 space-y-1">
                            {lead.hasMenu ? (
                              <div className="flex flex-col gap-0.5">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 w-fit">
                                  <CheckCircle2 size={11} />
                                  <span>Speisekarte online</span>
                                </span>
                                {lead.menuUrl && (
                                  <a
                                    href={lead.menuUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="flex items-center gap-1 text-[10px] hover:underline truncate mt-0.5"
                                    style={{ color: "var(--accent)" }}
                                  >
                                    <ExternalLink size={9} />
                                    <span>Karte ansehen</span>
                                  </a>
                                )}
                              </div>
                            ) : lead.website ? (
                              <div className="flex flex-col gap-0.5">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20 w-fit">
                                  <XCircle size={11} />
                                  <span>Keine Karte gefunden</span>
                                </span>
                                <span className="text-[10px] font-medium" style={{ color: "var(--accent)" }}>
                                  🎯 Potenzial-Lead
                                </span>
                              </div>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-zinc-500/10 text-zinc-400 border border-zinc-500/20 w-fit">
                                <AlertTriangle size={11} />
                                <span>Keine Website</span>
                              </span>
                            )}
                          </div>

                          {/* Quick Actions */}
                          <div className="col-span-2 flex items-center justify-end gap-1.5">
                            {lead.id && lead.website && (
                              <button
                                type="button"
                                title="Speisekarte neu prüfen"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSingleCheckMenu(lead);
                                }}
                                disabled={isChecking}
                                className="p-1.5 rounded-lg border transition-colors hover:bg-[var(--surface-3)]"
                                style={{ borderColor: "var(--border)", color: "var(--text-2)" }}
                              >
                                <RefreshCw size={12} className={cn(isChecking && "animate-spin text-[var(--accent)]")} />
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (lead.id) setFullModalLeadId(lead.id);
                              }}
                              className="px-2 py-1 rounded-md text-[11px] font-bold border transition-colors hover:bg-[var(--surface-3)]"
                              style={{ borderColor: "var(--border-2)", color: "var(--text)" }}
                            >
                              CRM
                            </button>
                          </div>
                        </div>
                      );
                    })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Detail Preview Panel */}
          {selectedLead && (
            <div
              className="w-full md:w-96 border-l shrink-0 flex flex-col p-5 overflow-y-auto space-y-4"
              style={{ background: "var(--surface)", borderColor: "var(--border)" }}
            >
              <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-center gap-2">
                  <UtensilsCrossed size={16} style={{ color: "var(--accent)" }} />
                  <h3 className="font-heading text-sm font-bold truncate" style={{ color: "var(--text)" }}>
                    Lead Preview
                  </h3>
                </div>
                <button
                  onClick={() => setSelectedLead(null)}
                  className="p-1 rounded hover:bg-[var(--surface-3)] text-zinc-400"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Title & Badge */}
              <div className="space-y-1">
                <div className="text-base font-bold" style={{ color: "var(--text)" }}>
                  {selectedLead.companyName}
                </div>
                <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-3)" }}>
                  <span className="font-medium text-amber-400 flex items-center gap-0.5">
                    <Star size={12} className="fill-amber-400" />
                    {selectedLead.googleRating ? selectedLead.googleRating.toFixed(1) : "–"}
                  </span>
                  {selectedLead.googleReviewCount != null && <span>({selectedLead.googleReviewCount} Bewertungen)</span>}
                  <span>•</span>
                  <span>{selectedLead.city || "Gastro"}</span>
                </div>
              </div>

              {/* Speisekarten KI-Box */}
              <div
                className="p-4 rounded-xl border space-y-3"
                style={{
                  background: "var(--surface-2)",
                  borderColor: selectedLead.hasMenu ? "rgba(16, 185, 129, 0.3)" : "rgba(245, 158, 11, 0.3)",
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold" style={{ color: "var(--text)" }}>
                    <Sparkles size={14} style={{ color: "var(--accent)" }} />
                    <span>Gemini Menü-Check</span>
                  </div>

                  {selectedLead.hasMenu ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      🟢 Speisekarte Online
                    </span>
                  ) : selectedLead.website ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20">
                      🔴 Keine Karte
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-zinc-500/10 text-zinc-400 border border-zinc-500/20">
                      ⚠️ Keine Website
                    </span>
                  )}
                </div>

                {selectedLead.menuSnippet ? (
                  <p className="text-xs leading-relaxed" style={{ color: "var(--text-2)" }}>
                    {selectedLead.menuSnippet}
                  </p>
                ) : (
                  <p className="text-xs leading-relaxed italic" style={{ color: "var(--text-3)" }}>
                    {selectedLead.website
                      ? "Keine strukturierte Menükarte auf der Homepage erkannt."
                      : "Website fehlt für Speisekarten-Prüfung."}
                  </p>
                )}

                {selectedLead.menuUrl && (
                  <a
                    href={selectedLead.menuUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 text-xs font-bold hover:underline"
                    style={{ color: "var(--accent)" }}
                  >
                    <ExternalLink size={12} />
                    <span>Gefundene Speisekarte öffnen</span>
                  </a>
                )}

                {selectedLead.menuCheckedAt && (
                  <div className="text-[10px]" style={{ color: "var(--text-3)" }}>
                    Zuletzt geprüft: {formatDate(selectedLead.menuCheckedAt)}
                  </div>
                )}

                {/* Re-Check Button */}
                {selectedLead.id && selectedLead.website && (
                  <button
                    type="button"
                    onClick={() => handleSingleCheckMenu(selectedLead)}
                    disabled={checkingMenuId === selectedLead.id}
                    className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-bold border transition-colors hover:bg-[var(--surface-3)]"
                    style={{ borderColor: "var(--border)", color: "var(--text)" }}
                  >
                    <RefreshCw size={12} className={cn(checkingMenuId === selectedLead.id && "animate-spin text-[var(--accent)]")} />
                    <span>{checkingMenuId === selectedLead.id ? "Analysiere Website..." : "🔄 Speisekarte neu prüfen"}</span>
                  </button>
                )}
              </div>

              {/* Contact and Info Details */}
              <div className="space-y-3 pt-2 text-xs">
                {selectedLead.address && (
                  <div className="flex flex-col gap-0.5">
                    <span className="font-semibold" style={{ color: "var(--text-3)" }}>
                      Adresse:
                    </span>
                    <div className="flex items-start gap-1.5" style={{ color: "var(--text)" }}>
                      <MapPin size={13} className="shrink-0 mt-0.5" style={{ color: "var(--text-3)" }} />
                      <span>{selectedLead.address}</span>
                    </div>
                  </div>
                )}

                {selectedLead.phone && (
                  <div className="flex flex-col gap-0.5">
                    <span className="font-semibold" style={{ color: "var(--text-3)" }}>
                      Telefon:
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Phone size={13} className="shrink-0" style={{ color: "var(--text-3)" }} />
                      <a
                        href={`tel:${selectedLead.phone}`}
                        className="hover:underline font-mono"
                        style={{ color: "var(--accent)" }}
                      >
                        {selectedLead.phone}
                      </a>
                    </div>
                  </div>
                )}

                {selectedLead.website && (
                  <div className="flex flex-col gap-0.5">
                    <span className="font-semibold" style={{ color: "var(--text-3)" }}>
                      Website:
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Globe size={13} className="shrink-0" style={{ color: "var(--text-3)" }} />
                      <a
                        href={selectedLead.website.startsWith("http") ? selectedLead.website : `https://${selectedLead.website}`}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:underline truncate"
                        style={{ color: "var(--accent)" }}
                      >
                        {selectedLead.website.replace(/^https?:\/\//, "")}
                      </a>
                    </div>
                  </div>
                )}

                {selectedLead.googleMapsUrl && (
                  <div className="flex flex-col gap-0.5">
                    <span className="font-semibold" style={{ color: "var(--text-3)" }}>
                      Google Maps Eintrag:
                    </span>
                    <div className="flex items-center gap-1.5">
                      <ArrowUpRight size={13} className="shrink-0" style={{ color: "var(--accent)" }} />
                      <a
                        href={selectedLead.googleMapsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:underline truncate"
                        style={{ color: "var(--accent)" }}
                      >
                        Auf Google Maps öffnen
                      </a>
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t space-y-2 mt-auto" style={{ borderColor: "var(--border)" }}>
                {selectedLead.id && (
                  <button
                    type="button"
                    onClick={() => setFullModalLeadId(selectedLead.id!)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold border transition-colors hover:bg-[var(--surface-3)]"
                    style={{ background: "var(--surface-2)", borderColor: "var(--border-2)", color: "var(--text)" }}
                  >
                    <Eye size={14} />
                    <span>Vollständiges Lead-Profil öffnen</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Full CRM Lead Modal */}
      {fullModalLeadId && (
        <LeadDetailModal
          leadId={fullModalLeadId}
          onClose={() => setFullModalLeadId(null)}
          onUpdate={() => {
            // refresh data if needed
          }}
        />
      )}
    </div>
  );
}
