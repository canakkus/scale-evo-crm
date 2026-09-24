"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { InstagramInsight, InstagramState, LeadScoutResponse } from "@/lib/lead-scout-types";
import { instagramProfileUrl } from "@/lib/utils";
import { InstagramCard, type SelectState } from "./instagram-card";
import { InstagramActionBar, type BarNote, type EnrichConfirm } from "./instagram-action-bar";
import {
  buildCardView,
  matchesToolbar,
  sortViews,
  type CardView,
  type CheckFilter,
  type IgSort,
  type Picks,
} from "./instagram-model";
import { ScoutFunnel } from "./scout-funnel";
import { Segment } from "./scout-ui";

const APIFY_OUTAGE_TEXT = "Apify nicht verfügbar — es wird ohne Bio-Daten weitergearbeitet.";
const CREATE_CONCURRENCY = 5;

type ApiJson = Record<string, unknown> & { error?: string; reason?: string };

async function postJson(url: string, body: unknown): Promise<{ status: number; data: ApiJson }> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as ApiJson;
  return { status: response.status, data };
}

type InsightItem = {
  key: string;
  handle: string | null;
  industry: string | null;
  city: string | null;
  website: string | null;
  websiteUnknown: boolean;
};

function insightItems(targets: CardView[]): InsightItem[] {
  return targets
    .filter((view) => view.handle)
    .map((view) => ({
      key: view.key,
      handle: view.handle,
      industry: view.result.leadDraft.industry,
      city: view.result.leadDraft.city,
      website: view.result.website.url,
      websiteUnknown: view.websiteUnknown,
    }));
}

/** Rein lesend (Snapshot-Cache + eigene Leads). null = nicht lesbar. */
async function fetchInsights(items: InsightItem[]): Promise<Record<string, InstagramInsight> | null> {
  if (items.length === 0) return {};
  try {
    const { status, data } = await postJson("/api/lead-scout/instagram", { items });
    return status === 200 ? ((data.insights ?? {}) as Record<string, InstagramInsight>) : null;
  } catch {
    return null;
  }
}

function mergeInsights(
  previous: Record<string, InstagramInsight | null>,
  items: InsightItem[],
  fresh: Record<string, InstagramInsight>,
): Record<string, InstagramInsight | null> {
  const next = { ...previous };
  for (const item of items) next[item.key] = fresh[item.key] ?? null;
  return next;
}

function selectStateOf(view: CardView): SelectState {
  if (view.handle) return { enabled: true };
  if (view.state === "choose") return { enabled: false, reason: "Erst Profil auswählen" };
  return { enabled: false, reason: "Kein Instagram-Profil" };
}

/**
 * Instagram-Reiter: zeigt GRATIS alles Vorhandene (Handle, Kandidaten,
 * Snapshot-Cache). Kosten entstehen ausschliesslich ueber die Aktionsleiste
 * -> POST /api/instagram/enrich, erst nach kostenloser Vorschau und
 * Inline-Bestaetigung. Nie pro Karte, nie bei Render/Auswahl/Reiterwechsel.
 *
 * Wird pro Antwort neu gemountet (key am Aufrufer) — Auswahl, Picks und
 * angelegte Leads gehoeren zu genau einem Suchlauf. Beim Reiterwechsel bleibt
 * die Komponente gemountet (nur versteckt), damit dieser Zustand nicht verloren
 * geht. Beim Mount wird der CRM-Abgleich (crmLead) frisch gelesen; bis dahin
 * ist "Als DM-Leads anlegen" gesperrt — sonst entstuenden Doppel-Leads aus
 * einem veralteten Stand.
 *
 * `onLockChange` meldet laufende Aktionen nach oben, damit Reiter, neue Suche
 * und Session-Laden solange gesperrt sind. `externalLock` sperrt umgekehrt die
 * Aktionen, solange oben eine Suche laeuft.
 */
export function InstagramResults({
  response,
  onLockChange,
  externalLock = false,
}: {
  response: LeadScoutResponse;
  onLockChange: (locked: boolean) => void;
  externalLock?: boolean;
}) {
  const [picks, setPicks] = useState<Picks>({});
  const [insights, setInsights] = useState<Record<string, InstagramInsight | null>>({});
  const [createdLeads, setCreatedLeads] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [enrichedKeys, setEnrichedKeys] = useState<Set<string>>(new Set());

  const [igFilter, setIgFilter] = useState<InstagramState | "all">("all");
  const [checkFilter, setCheckFilter] = useState<CheckFilter>("all");
  const [sort, setSort] = useState<IgSort>("dm");

  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [confirm, setConfirm] = useState<EnrichConfirm | null>(null);
  const [note, setNote] = useState<BarNote | null>(null);
  const [crmSync, setCrmSync] = useState<"pending" | "done" | "failed">("pending");

  const views = useMemo(
    () => response.results.map((result) => buildCardView(result, picks, insights, createdLeads)),
    [response.results, picks, insights, createdLeads],
  );
  const viewByKey = useMemo(() => new Map(views.map((view) => [view.key, view])), [views]);

  const visible = useMemo(
    () => sortViews(views.filter((view) => matchesToolbar(view, igFilter, checkFilter)), sort),
    [views, igFilter, checkFilter, sort],
  );

  const stateCounts = useMemo(() => {
    const counts: Record<InstagramState, number> = { found: 0, choose: 0, none: 0, failed: 0 };
    for (const view of views) counts[view.state] += 1;
    return counts;
  }, [views]);
  const checkedCount = views.filter((view) => view.insight?.snapshot).length;

  // Nur Karten mit bestaetigtem Handle sind waehlbar. Aendert sich das
  // (z. B. "Keins davon"), fliegt die Karte aus der Auswahl.
  const selectedViews = [...selected].map((key) => viewByKey.get(key)).filter((view): view is CardView => Boolean(view?.handle));

  // ---- Cache neu lesen (gratis) --------------------------------------------
  const reloadInsights = useCallback(async (targets: CardView[]) => {
    const items = insightItems(targets);
    const fresh = await fetchInsights(items);
    if (!fresh) return false;
    setInsights((previous) => mergeInsights(previous, items, fresh));
    return true;
  }, []);

  // Beim Mount (neue Suche, geladene Session) einmal frisch lesen: Leads, die
  // seit dem Suchlauf angelegt wurden, stehen sonst nicht als crmLead drin.
  // Bewusst nur beim Mount — `views` aendert sich mit jeder Auswahl.
  const [initialItems] = useState(() => insightItems(views));
  useEffect(() => {
    let active = true;
    fetchInsights(initialItems).then((fresh) => {
      if (!active) return;
      if (fresh) setInsights((previous) => mergeInsights(previous, initialItems, fresh));
      setCrmSync(fresh ? "done" : "failed");
    });
    return () => {
      active = false;
    };
  }, [initialItems]);

  const lockActions = (locked: boolean) => onLockChange(locked);

  // ---- Auswahl ---------------------------------------------------------------
  const closeConfirm = () => setConfirm(null);

  const toggleSelect = (key: string) => {
    closeConfirm();
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectableVisible = visible.filter((view) => view.handle);
  const allVisibleSelected = selectableVisible.length > 0 && selectableVisible.every((view) => selected.has(view.key));

  const toggleAllVisible = () => {
    closeConfirm();
    setSelected((previous) => {
      const next = new Set(previous);
      if (allVisibleSelected) selectableVisible.forEach((view) => next.delete(view.key));
      else selectableVisible.forEach((view) => next.add(view.key));
      return next;
    });
  };

  const selectDmReady = () => {
    closeConfirm();
    setSelected(new Set(visible.filter((view) => view.dmReady).map((view) => view.key)));
  };

  const clearSelection = () => {
    closeConfirm();
    setNote(null);
    setSelected(new Set());
  };

  // ---- Kandidaten-Wahl (gratis) ---------------------------------------------
  const pickHandle = (view: CardView, handle: string | null) => {
    setPicks((previous) => ({ ...previous, [view.key]: handle }));
    if (!handle) {
      setSelected((previous) => {
        const next = new Set(previous);
        next.delete(view.key);
        return next;
      });
      return;
    }
    // Nur ein Lesezugriff auf den Cache — kein Abruf, keine Kosten.
    void reloadInsights([{ ...view, handle }]);
  };

  const resetPick = (view: CardView) => {
    setPicks((previous) => {
      const next = { ...previous };
      delete next[view.key];
      return next;
    });
  };

  // ---- Schritt 1: als DM-Leads anlegen -------------------------------------
  // Clientseitiger Duplikat-Schutz: POST /api/leads prueft selbst nichts.
  //  - nicht, solange der CRM-Abgleich nicht frisch gelesen ist,
  //  - nichts, was schon im CRM oder in diesem Lauf angelegt ist,
  //  - kein Handle zweimal (zwei Karten koennen auf dasselbe Profil zeigen),
  //  - nichts mit unbekannter Website: der Lead bekaeme website:null, und nach
  //    "Profile prüfen" wuerde daraus "keine eigene Website" als Fakt,
  //  - nichts ohne geladenes Insight zum AKTUELLEN Handle: nach einer frischen
  //    Profilwahl ist der CRM-Abgleich fuer dieses Handle noch offen (oder
  //    gescheitert), ein Lead koennte also schon existieren.
  const createdHandles = new Set(views.filter((view) => view.lockedByLead).map((view) => view.handle));
  const seenHandles = new Set<string>();
  const creatable: CardView[] = [];
  let skippedInCrm = 0;
  let skippedWebsiteUnknown = 0;
  let skippedUnsynced = 0;
  for (const view of selectedViews) {
    if (view.inCrm || createdHandles.has(view.handle) || seenHandles.has(view.handle!)) skippedInCrm += 1;
    else if (view.insight === null) skippedUnsynced += 1;
    else if (view.websiteUnknown) skippedWebsiteUnknown += 1;
    else {
      seenHandles.add(view.handle!);
      creatable.push(view);
    }
  }
  const createSkipped = [
    ...(skippedInCrm > 0 ? [`${skippedInCrm} übersprungen (bereits im CRM)`] : []),
    ...(skippedWebsiteUnknown > 0 ? [`${skippedWebsiteUnknown} übersprungen (Website unbekannt)`] : []),
    ...(skippedUnsynced > 0 ? [`${skippedUnsynced} übersprungen (CRM-Abgleich ausstehend)`] : []),
  ];
  const createBlocked =
    crmSync === "pending" ? "CRM-Abgleich läuft …" : crmSync === "failed" ? "CRM-Abgleich fehlgeschlagen — Seite neu laden" : null;
  const enrichable = selectedViews.filter((view) => view.leadId);
  const createCount = createBlocked ? 0 : creatable.length;
  const step1Done = creatable.length === 0 && enrichable.length > 0;
  const step2Done = enrichable.length > 0 && enrichable.every((view) => enrichedKeys.has(view.key));

  const createLeads = async () => {
    if (createCount === 0 || busy || running || externalLock) return;
    setBusy(true);
    lockActions(true);
    setNote(null);
    const created: Record<string, string> = {};
    const failures: string[] = [];

    for (let index = 0; index < creatable.length; index += CREATE_CONCURRENCY) {
      const chunk = creatable.slice(index, index + CREATE_CONCURRENCY);
      await Promise.all(
        chunk.map(async (view) => {
          try {
            const { status, data } = await postJson("/api/leads", {
              ...view.result.leadDraft,
              // Immer das bestaetigte (ggf. manuell gewaehlte) Handle, kanonisch.
              instagram: instagramProfileUrl(view.handle),
              acquisitionType: "DM",
              preferredContactMethod: "INSTAGRAM_DM",
              status: "NEW",
              nfcDemoUrl: null,
            });
            const lead = data.lead as { id?: string } | undefined;
            if (status === 201 && lead?.id) created[view.key] = lead.id;
            else failures.push(view.result.venue.name);
          } catch {
            failures.push(view.result.venue.name);
          }
        }),
      );
    }

    setCreatedLeads((previous) => ({ ...previous, ...created }));
    const count = Object.keys(created).length;
    setNote(
      failures.length > 0
        ? { tone: "error", text: `${count} angelegt, ${failures.length} fehlgeschlagen: ${failures.slice(0, 3).join(", ")}${failures.length > 3 ? " …" : ""}` }
        : { tone: "info", text: `${count} ${count === 1 ? "DM-Lead" : "DM-Leads"} angelegt.` },
    );
    setBusy(false);
    lockActions(false);
  };

  // ---- Schritt 2: Profile pruefen (erst Vorschau, dann bezahlter Lauf) -----
  const previewEnrich = async () => {
    if (enrichable.length === 0 || busy || running || externalLock) return;
    const leadIds = [...new Set(enrichable.map((view) => view.leadId!))];
    setBusy(true);
    lockActions(true);
    setNote(null);
    try {
      const { status, data } = await postJson("/api/instagram/enrich", { leadIds, preview: true });
      if (status !== 200 || !data.ok) {
        setNote({ tone: "error", text: data.reason ?? data.error ?? "Vorschau fehlgeschlagen." });
        return;
      }
      const willFetch = Number(data.willFetch ?? 0);
      const maxBatch = Number(data.maxBatch ?? 0);
      const skipped = Array.isArray(data.skipped) ? (data.skipped as Array<{ reason: string; count: number }>) : [];
      const chain = ((data.source as { chain?: string[] } | undefined)?.chain ?? []) as string[];

      if (willFetch === 0) {
        setNote({ tone: "info", text: "Alle Profile sind aktuell — nichts zu prüfen." });
        setEnrichedKeys((previous) => new Set([...previous, ...enrichable.map((view) => view.key)]));
        await reloadInsights(views);
        return;
      }
      // Das Limit steht schon in der Vorschau — nicht erst nach der Bestaetigung ablehnen lassen.
      if (maxBatch > 0 && willFetch > maxBatch) {
        setNote({
          tone: "decide",
          text:
            `${willFetch} Profile stehen an — pro Lauf sind höchstens ${maxBatch} möglich, ` +
            "weil ein abgebrochener Lauf trotzdem abgerechnet wird. Bitte weniger auswählen.",
        });
        return;
      }
      setConfirm({ leadIds, willFetch, paid: chain.includes("apify"), skipped });
    } catch {
      setNote({ tone: "error", text: "Netzwerkfehler bei der Vorschau — es wurde nichts geprüft." });
    } finally {
      setBusy(false);
      lockActions(false);
    }
  };

  const runEnrich = async () => {
    if (!confirm || running || externalLock) return;
    // Genau die Leads aus der Vorschau — nicht die inzwischen evtl. geaenderte Auswahl.
    const { leadIds } = confirm;
    const keys = enrichable.filter((view) => leadIds.includes(view.leadId!)).map((view) => view.key);
    setConfirm(null);
    setRunning(true);
    lockActions(true);
    setNote(null);
    try {
      const { status, data } = await postJson("/api/instagram/enrich", { leadIds });
      const health = data.apify as { outage?: boolean; note?: string | null } | undefined;
      const outage = health?.outage ? (health.note ?? APIFY_OUTAGE_TEXT) : null;

      if (status === 429 || status === 400) {
        setNote({ tone: "decide", text: data.reason ?? data.error ?? "Prüfung abgelehnt." });
      } else if (status !== 200 || !data.ok) {
        setNote({ tone: "error", text: data.reason ?? data.error ?? "Anreicherung fehlgeschlagen." });
      } else {
        const updated = Array.isArray(data.updated) ? data.updated.length : 0;
        setEnrichedKeys((previous) => new Set([...previous, ...keys]));
        setNote({
          tone: outage ? "decide" : "info",
          text: `${updated} ${updated === 1 ? "Lead" : "Leads"} neu bewertet.${outage ? ` ${outage}` : ""}`,
        });
      }
    } catch {
      // Ob der Server den Lauf schon gestartet hat, wissen wir nicht. Kein
      // automatischer Retry (koennte doppelt zahlen) — Cache neu lesen zeigt,
      // was tatsaechlich angekommen ist.
      setNote({ tone: "error", text: "Netzwerkfehler bei der Anreicherung — Stand unklar, Karten werden aus dem Cache neu geladen." });
    } finally {
      // Immer neu lesen: auch ein abgelehnter/abgebrochener Lauf kann Snapshots geschrieben haben.
      const ok = await reloadInsights(views);
      if (!ok) setNote({ tone: "error", text: "Profildaten konnten nicht neu geladen werden — Seite später neu laden." });
      setRunning(false);
      lockActions(false);
    }
  };

  // Esc bricht die Bestaetigung ab (nicht den laufenden Lauf).
  useEffect(() => {
    if (!confirm) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setConfirm(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirm]);

  const count = (value: number) => <span className="font-mono">{value}</span>;
  const notices = [response.treatsWellError, ...(response.notices ?? [])].filter((notice): notice is string => Boolean(notice));

  return (
    <div className="space-y-4">
      <ScoutFunnel response={response} finalLabel="DM-Kandidaten" />

      {notices.length > 0 && (
        <ul className="space-y-1 px-2" role="status">
          {notices.map((notice) => (
            <li key={notice} className="text-[11px]" style={{ color: "var(--status-planned-tx)" }}>{notice}</li>
          ))}
        </ul>
      )}

      {response.results.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-2">
          <label className="flex items-center gap-2 pr-2 text-xs font-semibold" style={{ minHeight: 44, color: "var(--text-2)" }}>
            <input
              type="checkbox"
              checked={allVisibleSelected}
              disabled={selectableVisible.length === 0 || running}
              onChange={toggleAllVisible}
              className="accent-[var(--accent)]"
              style={{ width: 18, height: 18 }}
            />
            Alle sichtbaren ({selectableVisible.length})
          </label>
          <Segment<InstagramState | "all">
            ariaLabel="Instagram-Status filtern"
            value={igFilter}
            onChange={setIgFilter}
            options={[
              { value: "all", label: <>Alle {count(views.length)}</> },
              { value: "found", label: <>Eindeutig {count(stateCounts.found)}</> },
              { value: "choose", label: <>Zur Auswahl {count(stateCounts.choose)}</> },
              { value: "none", label: <>Keins {count(stateCounts.none)}</> },
              { value: "failed", label: <>Fehlgeschlagen {count(stateCounts.failed)}</> },
            ]}
          />
          <Segment<CheckFilter>
            ariaLabel="Nach Prüfstatus filtern"
            value={checkFilter}
            onChange={setCheckFilter}
            options={[
              { value: "all", label: "Alle" },
              { value: "checked", label: <>Geprüft {count(checkedCount)}</> },
              { value: "unchecked", label: <>Ungeprüft {count(views.length - checkedCount)}</> },
            ]}
          />
          <label className="ml-auto flex items-center gap-2 text-[11px] font-semibold" style={{ color: "var(--text-3)" }}>
            Sortierung
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as IgSort)}
              className="rounded-md border px-2.5 text-xs outline-none"
              style={{ minHeight: 44, background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
            >
              <option value="dm">DM-bereit zuerst</option>
              <option value="score">Score — geprüfte zuerst</option>
              <option value="distance">Kürzeste Distanz</option>
              <option value="rating">Beste Bewertung</option>
            </select>
          </label>
        </div>
      )}

      {visible.length > 0 ? (
        <div className="space-y-4">
          {visible.map((view) => (
            <InstagramCard
              key={view.key}
              view={view}
              selected={selected.has(view.key) && Boolean(view.handle)}
              selectState={running ? { enabled: false, reason: "Während der Prüfung nicht möglich" } : selectStateOf(view)}
              onToggleSelect={() => toggleSelect(view.key)}
              onPick={(handle) => pickHandle(view, handle)}
              onResetPick={() => resetPick(view)}
            />
          ))}
        </div>
      ) : (
        <div
          className="rounded-xl border p-12 text-center text-xs"
          style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text-3)" }}
        >
          {response.results.length === 0
            ? "Keine DM-Kandidaten — der Trichter oben zeigt, wo sie hängen bleiben."
            : "Keine Karten für diese Filter."}
        </div>
      )}

      {selectedViews.length > 0 && (
        <InstagramActionBar
          selectedCount={selectedViews.length}
          createCount={createCount}
          createSkipped={createSkipped}
          createBlocked={createBlocked}
          enrichCount={enrichable.length}
          step1Done={step1Done}
          step2Done={step2Done}
          busy={busy || externalLock}
          running={running}
          confirm={confirm}
          note={note}
          onSelectDmReady={selectDmReady}
          onClear={clearSelection}
          onCreate={() => void createLeads()}
          onPreview={() => void previewEnrich()}
          onConfirm={() => void runEnrich()}
          onCancelConfirm={closeConfirm}
        />
      )}
    </div>
  );
}

