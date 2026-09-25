"use client";

import { Fragment, type ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { PREFILTER_LABELS, type LeadScoutResponse, type PrefilterReason } from "@/lib/lead-scout-types";
import { Chip } from "./scout-ui";

const BUDGET_TOOLTIP =
  "Pro Suche höchstens 40 Betriebe und 3 Places-Abfragen. Enger suchen: Kategorie statt ‚Alle', Umkreis statt Stadt.";

function Num({ children }: { children: ReactNode }) {
  return <span className="font-mono text-[13px] font-bold" style={{ color: "var(--text)" }}>{children}</span>;
}

function Label({ children }: { children: ReactNode }) {
  return <span className="text-[11px]" style={{ color: "var(--text-3)" }}>{children}</span>;
}

function Arrow() {
  return <span aria-hidden className="text-[11px]" style={{ color: "var(--text-3)" }}>→</span>;
}

/**
 * Ehrlicher Trichter statt "X nach Filter": zeigt, wo die Betriebe
 * haengen bleiben. Rein informativ, nicht interaktiv. Fuer alte Sessions
 * ohne gespeicherten Trichter faellt er auf die Trefferzahl zurueck.
 */
export function ScoutFunnel({ response, finalLabel }: { response: LeadScoutResponse; finalLabel: string }) {
  const { funnel, budget } = response;

  const prefilterTitle = funnel
    ? Object.entries(funnel.prefiltered.byReason)
        .filter(([, count]) => (count ?? 0) > 0)
        .map(([reason, count]) => `${count}× ${PREFILTER_LABELS[reason as PrefilterReason]}`)
        .join(" · ")
    : "";

  // Die letzte "keep"-Stufe wird zur Abschluss-Pille ("8 neu"); endet der
  // Trichter mit einer Abzugsstufe, bleibt sie ein normaler Schritt.
  const lastStage = funnel?.stages.at(-1);
  const pillStage = lastStage?.kind === "keep" ? lastStage : null;
  const stepStages = funnel ? (pillStage ? funnel.stages.slice(0, -1) : funnel.stages) : [];

  const steps: ReactNode[] = [];
  if (funnel) {
    steps.push(<span key="found"><Num>{funnel.found}</Num> <Label>gefunden</Label></span>);
    if (funnel.prefiltered.total > 0) {
      steps.push(
        <span key="pre" title={`Vor dem Prüfen gratis aussortiert: ${prefilterTitle}`}>
          <Num>−{funnel.prefiltered.total}</Num> <Label>vorab</Label>
        </span>,
      );
    }
    steps.push(<span key="scouted"><Num>{funnel.scouted}</Num> <Label>geprüft</Label></span>);
    for (const stage of stepStages) {
      steps.push(
        stage.kind === "remove" ? (
          <span key={stage.key}><Num>−{stage.removed}</Num> <Label>{stage.label}</Label></span>
        ) : (
          <span key={stage.key}>
            <Num>{stage.count}</Num> <Label>{stage.label}</Label>
            {stage.instagram && (
              <Label>
                {" "}({stage.instagram.found} eindeutig · {stage.instagram.choose} zur Auswahl
                {stage.instagram.failed > 0 ? ` · ${stage.instagram.failed} unklar` : ""})
              </Label>
            )}
          </span>
        ),
      );
    }
  }

  const finalCount = funnel ? funnel.final : response.results.length;
  const finalText = pillStage?.label ?? finalLabel;

  const failedSearches = funnel?.instagram.failed ?? 0;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5" aria-label="Trichter">
        {steps.map((step, index) => (
          <Fragment key={index}>
            {step}
            <Arrow />
          </Fragment>
        ))}
        <span className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: "var(--surface-3)", color: "var(--text)" }}>
          <span className="font-mono text-[13px]">{finalCount}</span> {finalText}
        </span>

        {(failedSearches > 0 || budget?.exhausted) && (
          <span aria-hidden className="mx-1 h-4 w-px" style={{ background: "var(--border)" }} />
        )}
        {failedSearches > 0 && (
          <span className="text-[11px] font-semibold" style={{ color: "var(--status-lost-tx)" }}>
            {failedSearches}× IG-Suche fehlgeschlagen
          </span>
        )}
        {budget?.exhausted && (
          <Chip tone="decide" title={BUDGET_TOOLTIP}>
            {finalCount} von {budget.target} gefunden — Budget erschöpft ({budget.scouted} geprüft)
          </Chip>
        )}
      </div>

      {response.sourceUrl && (
        <a
          href={response.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 text-xs font-semibold hover:underline"
          style={{ color: "var(--status-new-tx)", minHeight: 44 }}
        >
          Quelle öffnen <ExternalLink className="w-3 h-3" />
        </a>
      )}
    </div>
  );
}
