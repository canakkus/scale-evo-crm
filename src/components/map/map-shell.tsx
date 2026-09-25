"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import type { AcquisitionType, LeadStatus } from "@prisma/client";
import { STATUS_LABELS } from "@/lib/constants";
import { calculateDistanceKm } from "@/lib/distance";
import { coordinateKey } from "@/lib/geo";
import { useUserLocation } from "@/lib/location-context";
import { LeadDetailModal } from "@/components/leads/lead-detail-modal";
import { useMediaQuery } from "./use-media-query";
import { EMPTY_FILTERS, MapControls, NO_INDUSTRY, type ChannelFilter, type MapFilters } from "./map-controls";
import { MapBottomSheet, MapLeadList, MapSidePanel, type SheetStage } from "./map-side-list";
import {
  byDistance,
  groupByCoordinate,
  isStale,
  toLocatedLead,
  type LocatedLead,
  type MapLead,
} from "./map-types";

/**
 * Leaflet fasst beim Import `window` an. In einer Server Component ist
 * `ssr: false` verboten, deshalb liegt der dynamische Import hier in der
 * Client-Shell und nicht in app/map/page.tsx.
 */
const LeadMapCanvas = dynamic(() => import("./lead-map-canvas"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center" style={{ background: "var(--bg)" }}>
      <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--text-3)" }} />
    </div>
  ),
});

const SEARCH_DEBOUNCE_MS = 150;
const WIDE_QUERY = "(min-width: 1024px)";

type FilterSkip = "channel" | "status" | "industry" | null;

function industryKey(lead: MapLead): string {
  return lead.industry?.trim() || NO_INDUSTRY;
}

function matchesFilters(lead: MapLead, filters: MapFilters, skip: FilterSkip): boolean {
  if (filters.search) {
    const haystack = `${lead.companyName} ${lead.address ?? ""} ${lead.city ?? ""}`.toLowerCase();
    if (!haystack.includes(filters.search)) return false;
  }
  if (skip !== "channel" && filters.channel !== "ALL" && lead.acquisitionType !== filters.channel) {
    return false;
  }
  if (skip !== "status" && filters.statuses.length > 0 && !filters.statuses.includes(lead.status)) {
    return false;
  }
  if (skip !== "industry" && filters.industries.length > 0 && !filters.industries.includes(industryKey(lead))) {
    return false;
  }
  if (filters.onlyRecent && isStale(lead.lastContactAt)) return false;
  return true;
}

export function MapShell() {
  const [allLeads, setAllLeads] = useState<MapLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [filters, setFilters] = useState<MapFilters>(EMPTY_FILTERS);

  const [hovered, setHovered] = useState<{ key: string; source: "map" | "list" } | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [detailLeadId, setDetailLeadId] = useState<string | null>(null);

  const isWide = useMediaQuery(WIDE_QUERY, true);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [sheetStage, setSheetStage] = useState<SheetStage>("peek");
  const [sheetTab, setSheetTab] = useState<"leads" | "missing">("leads");

  const { coords } = useUserLocation();

  /* ------------------------------------------------------------- Laden */
  // Bewusst als Promise-Kette statt async/await: der State wird ausschliesslich
  // aus Callbacks heraus gesetzt, nie synchron im Effekt-Rumpf.
  const load = useCallback(
    () =>
      fetch("/api/leads/map")
        .then((response) => {
          if (!response.ok) {
            throw new Error(
              response.status === 401 ? "Nicht angemeldet." : "Leads konnten nicht geladen werden.",
            );
          }
          return response.json();
        })
        .then((data: { leads?: MapLead[] }) => {
          setAllLeads(Array.isArray(data.leads) ? data.leads : []);
          setLoadError(null);
        })
        .catch((error: unknown) => {
          setLoadError(error instanceof Error ? error.message : "Leads konnten nicht geladen werden.");
        })
        .finally(() => setLoading(false)),
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  /* ------------------------------------------------- Suche entprellt */
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((prev) => ({ ...prev, search: searchInput.trim().toLowerCase() }));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  /* ----------------------------------------------------- Ableitungen */
  const filtered = useMemo(
    () => allLeads.filter((lead) => matchesFilters(lead, filters, null)),
    [allLeads, filters],
  );

  const located = useMemo<LocatedLead[]>(() => {
    const result: LocatedLead[] = [];
    for (const lead of filtered) {
      const distanceKm = calculateDistanceKm(
        { latitude: lead.latitude, longitude: lead.longitude },
        coords,
      );
      const positioned = toLocatedLead(lead, distanceKm);
      if (positioned) result.push(positioned);
    }
    return result;
  }, [filtered, coords]);

  const missing = useMemo(
    () => filtered.filter((lead) => lead.latitude === null || lead.longitude === null),
    [filtered],
  );

  const groups = useMemo(() => groupByCoordinate(located), [located]);
  const sortedList = useMemo(() => [...located].sort(byDistance), [located]);

  /**
   * Ungefiltert: Hat ueberhaupt irgendein Lead Koordinaten? Ohne diese
   * Unterscheidung meldet eine leere Karte vor dem ersten Backfill "passt zu
   * diesen Filtern", obwohl kein Filter aktiv ist — das schickt den Nutzer auf
   * die Suche nach einem Filterproblem, das es nicht gibt.
   */
  const anyLocated = useMemo(
    () => allLeads.some((lead) => lead.latitude !== null && lead.longitude !== null),
    [allLeads],
  );

  const channelCounts = useMemo(() => {
    const base = allLeads.filter((lead) => matchesFilters(lead, filters, "channel"));
    const counts: Record<ChannelFilter, number> = { ALL: base.length, CALL: 0, WALK_IN: 0, DM: 0 };
    for (const lead of base) {
      counts[lead.acquisitionType as AcquisitionType] = (counts[lead.acquisitionType as AcquisitionType] ?? 0) + 1;
    }
    return counts;
  }, [allLeads, filters]);

  const statusCounts = useMemo(() => {
    const base = allLeads.filter((lead) => matchesFilters(lead, filters, "status"));
    const tally = new Map<LeadStatus, number>();
    for (const lead of base) tally.set(lead.status, (tally.get(lead.status) ?? 0) + 1);
    // Reihenfolge aus STATUS_LABELS, damit die Liste stabil bleibt.
    return (Object.keys(STATUS_LABELS) as LeadStatus[])
      .filter((status) => tally.has(status))
      .map((status) => ({ status, count: tally.get(status) ?? 0 }));
  }, [allLeads, filters]);

  const industryCounts = useMemo(() => {
    const base = allLeads.filter((lead) => matchesFilters(lead, filters, "industry"));
    const tally = new Map<string, number>();
    for (const lead of base) {
      const key = industryKey(lead);
      tally.set(key, (tally.get(key) ?? 0) + 1);
    }
    return [...tally.entries()]
      .map(([key, count]) => ({ key, label: key === NO_INDUSTRY ? "Keine Angabe" : key, count }))
      .sort((a, b) => a.label.localeCompare(b.label, "de"));
  }, [allLeads, filters]);

  /* --------------------------------------- Auswahl aufraeumen */
  // Faellt der ausgewaehlte Pin durch einen Filterwechsel weg, darf kein Popup
  // an einer Stelle stehen bleiben, an der es keinen Pin mehr gibt. Bewusst als
  // Ableitung im Render statt als Effekt mit setState: der veraltete Key bleibt
  // im State harmlos liegen und wird schlicht nicht mehr verwendet.
  const groupKeys = useMemo(() => new Set(groups.map((group) => group.key)), [groups]);
  const activeSelectedKey = selectedKey && groupKeys.has(selectedKey) ? selectedKey : null;
  const activeHovered = hovered && groupKeys.has(hovered.key) ? hovered : null;

  const handleHover = useCallback((key: string | null, source: "map" | "list") => {
    setHovered(key ? { key, source } : null);
  }, []);

  const handleOpenLead = useCallback((leadId: string) => {
    setDetailLeadId(leadId);
    // Popup schliessen und das Sheet auf "peek" zurueckziehen: sonst steht auf
    // dem Handy eine 85dvh hohe Liste hinter dem gerade geoeffneten Modal und
    // ist beim Schliessen des Modals der erste Eindruck.
    setSelectedKey(null);
    setSheetStage("peek");
  }, []);

  const keyOf = useCallback(
    (lead: LocatedLead) => coordinateKey(lead.latitude, lead.longitude),
    [],
  );

  const list = (
    <MapLeadList
      leads={sortedList}
      hoveredKey={activeHovered?.key ?? null}
      hoverSource={activeHovered?.source ?? null}
      keyOf={keyOf}
      onHover={handleHover}
      onSelect={setSelectedKey}
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden overscroll-none">
      <MapControls
        filters={filters}
        onChange={setFilters}
        searchInput={searchInput}
        onSearchInput={setSearchInput}
        channelCounts={channelCounts}
        statusCounts={statusCounts}
        industryCounts={industryCounts}
        locatedCount={located.length}
        totalCount={filtered.length}
        missingLeads={missing}
        onOpenLead={handleOpenLead}
      />

      <div className="flex min-h-0 flex-1">
        {/*
          `isolate z-0` ist hier kein Kosmetik-Detail, sondern die Klammer um das
          ganze Stapel-Problem: `.leaflet-container` ist zwar `position: relative`,
          hat aber kein z-index und erzeugt damit KEINEN Stacking Context. Ohne
          diese Isolation konkurrieren Leaflets Panes (400–700, Popup-Pane 700)
          direkt mit der App-Chrome im Root — ein offenes Karten-Popup laege dann
          ueber dem LeadDetailModal (z-50) und ueber der Sidebar.
          Mit `isolate` bleiben alle Karten-Ebenen (Leaflet-Panes, Overlays,
          Bottom-Sheet) innerhalb dieses Containers, und der Container selbst
          sitzt als Ganzes auf z-0 — also unter FAB (z-40), Sidebar (z-50) und
          Modal (z-50). Deshalb duerfen die Werte INNERHALB weiter hoch sein: sie
          muessen nur Leaflets 700 schlagen, nicht die App.
        */}
        <div className="relative isolate z-0 min-w-0 flex-1">
          {loadError ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="text-[12px]" style={{ color: "var(--status-lost-tx)" }}>
                {loadError}
              </p>
              <button
                type="button"
                onClick={() => {
                  setLoading(true);
                  void load();
                }}
                className="rounded-lg px-4 text-[11px] font-semibold"
                style={{ height: 44, background: "var(--surface-3)", color: "var(--text)" }}
              >
                Erneut versuchen
              </button>
            </div>
          ) : (
            <>
              <LeadMapCanvas
                groups={groups}
                hoveredKey={activeHovered?.key ?? null}
                selectedKey={activeSelectedKey}
                onHover={(key) => handleHover(key, "map")}
                onSelect={setSelectedKey}
                onOpenLead={handleOpenLead}
              />

              {loading && (
                <div
                  className="pointer-events-none absolute left-1/2 top-4 z-[1000] flex -translate-x-1/2 items-center gap-2 rounded-lg px-3 py-2"
                  style={{ background: "var(--map-chrome-bg)", color: "var(--text-2)" }}
                >
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span className="text-[11px]">Leads werden geladen…</span>
                </div>
              )}

              {!loading && groups.length === 0 && (
                // z-[1000] wie das Lade-Overlay: ohne z-index liegen Leaflets Panes
                // (400–700) darueber und die Meldung ist unsichtbar. Bleibt unter
                // dem Bottom-Sheet (z-[1100]).
                <div className="pointer-events-none absolute inset-0 z-[1000] flex items-center justify-center px-6">
                  <p
                    className="rounded-xl px-4 py-3 text-center text-[12px]"
                    style={{ background: "var(--map-chrome-bg)", color: "var(--text-2)" }}
                  >
                    {allLeads.length === 0
                      ? "Noch keine Leads vorhanden."
                      : !anyLocated
                        ? `Noch keiner deiner ${allLeads.length} Leads hat einen Standort — sobald die Adressen verortet sind, erscheinen sie hier.`
                        : "Kein verorteter Lead passt zu diesen Filtern."}
                  </p>
                </div>
              )}

              {!isWide && (
                <MapBottomSheet
                  stage={sheetStage}
                  onStageChange={setSheetStage}
                  tab={sheetTab}
                  onTabChange={setSheetTab}
                  leadCount={sortedList.length}
                  missingLeads={missing}
                  onOpenLead={handleOpenLead}
                >
                  {list}
                </MapBottomSheet>
              )}
            </>
          )}
        </div>

        {isWide && (
          <MapSidePanel
            collapsed={panelCollapsed}
            onToggle={() => setPanelCollapsed((value) => !value)}
            count={sortedList.length}
          >
            {list}
          </MapSidePanel>
        )}
      </div>

      <LeadDetailModal
        leadId={detailLeadId}
        onClose={() => setDetailLeadId(null)}
        onUpdate={() => void load()}
      />
    </div>
  );
}
