"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { maplibreGL } from "@maplibre/maplibre-gl-leaflet";
import "maplibre-gl/dist/maplibre-gl.css";
import { DEFAULT_VIENNA_COORDS } from "@/lib/distance";
import { MapPopupBody, MapTooltipBody } from "./map-overlays";
import { pinClassName, pinFillColor, pinHtml, pinLabel } from "./pin-icons";
import type { PinGroup } from "./map-types";

/**
 * Leaflet-Karte. Wird ausschliesslich ueber `dynamic(..., { ssr: false })`
 * geladen — Leaflet greift beim Import auf `window` zu.
 *
 * Diese Komponente wird bei Filterwechseln NICHT neu gemountet. Die Map-Instanz
 * lebt in einem Ref und wird einmal erzeugt; wechselnde Daten tauschen nur die
 * Marker im LayerGroup. Ein Remount wuerde Zoom und Position bei jedem Klick auf
 * einen Filter-Chip zuruecksetzen.
 */

/**
 * Basemap: OpenFreeMap, Stil "dark". Kein API-Key, keine Registrierung, keine
 * Request-Limits, kommerzielle Nutzung ausdruecklich erlaubt (openfreemap.org,
 * geprueft 2026-09-13). CARTO kam dafuer nicht in Frage: `basemaps.cartocdn.com`
 * blendet ohne Key inzwischen "API KEY REQUIRED" ueber jede Kachel ein.
 *
 * OpenFreeMap liefert nur Vektorkacheln — Leaflet rendert die ueber
 * @maplibre/maplibre-gl-leaflet. Das Plugin haengt sich in die tilePane, der
 * Abdunkel-Filter aus globals.css (`.leaflet-tile-pane`) greift also weiter.
 *
 * Kein SLA: der Dienst ist spendenfinanziert und kann ohne Vorwarnung enden.
 * Faellt er aus, bleibt die Karte grau, Pins und Popups funktionieren weiter.
 */
const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/dark";

/** Ungenaue Pins liegen unter den exakten — sie sollen nichts verdecken. */
const APPROX_PANE = "mapApproxPane";
const TOOLTIP_DELAY_MS = 80;
const RESIZE_DEBOUNCE_MS = 120;
/** Unsicherheitsradius fuer "nur Stadt bekannt" — grob eine Bezirksmitte. */
const UNCERTAINTY_RADIUS_M = 400;

type Props = {
  groups: PinGroup[];
  hoveredKey: string | null;
  selectedKey: string | null;
  onHover: (key: string | null) => void;
  onSelect: (key: string | null) => void;
  onOpenLead: (leadId: string) => void;
};

export default function LeadMapCanvas({
  groups,
  hoveredKey,
  selectedKey,
  onHover,
  onSelect,
  onOpenLead,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const markersRef = useRef<globalThis.Map<string, L.Marker>>(new globalThis.Map());
  const tooltipRef = useRef<L.Tooltip | null>(null);
  const popupRef = useRef<L.Popup | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const tooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didFitRef = useRef(false);

  // Handler in Refs, damit der Marker-Aufbau nicht bei jedem Render neu laeuft.
  // Die Zuweisung gehoert in einen Effekt — waehrend des Renders darf kein Ref
  // beschrieben werden.
  const handlersRef = useRef({ onHover, onSelect });
  useEffect(() => {
    handlersRef.current = { onHover, onSelect };
  }, [onHover, onSelect]);

  const [tooltipNode, setTooltipNode] = useState<HTMLDivElement | null>(null);
  const [popupNode, setPopupNode] = useState<HTMLDivElement | null>(null);

  const groupByKey = useMemo(() => {
    const index = new globalThis.Map<string, PinGroup>();
    for (const group of groups) index.set(group.key, group);
    return index;
  }, [groups]);

  const hoveredGroup = hoveredKey ? groupByKey.get(hoveredKey) ?? null : null;
  const selectedGroup = selectedKey ? groupByKey.get(selectedKey) ?? null : null;

  /* ---------------------------------------------------------------- Init */
  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    const map = L.map(container, {
      zoomControl: false,
      // Eigene Attribution ohne Leaflet-Prefix ("Leaflet | …"). Den Text liefert
      // der Kartenstil selbst — das Plugin traegt die Pflicht-Attribution
      // ("OpenFreeMap © OpenMapTiles Data from OpenStreetMap") in das Control ein.
      // Nicht zusaetzlich per addAttribution setzen, sonst steht sie doppelt da.
      attributionControl: false,
      center: [DEFAULT_VIENNA_COORDS.lat, DEFAULT_VIENNA_COORDS.lng],
      zoom: 12,
      minZoom: 10,
      maxZoom: 19,
      // Popups bleiben offen, bis der Nutzer sie schliesst.
      closePopupOnClick: false,
    });

    maplibreGL({ style: MAP_STYLE_URL }).addTo(map);
    L.control.attribution({ prefix: false, position: "bottomleft" }).addTo(map);
    L.control.zoom({ position: "bottomright" }).addTo(map);

    const pane = map.createPane(APPROX_PANE);
    pane.style.zIndex = "590"; // markerPane ist 600

    const markers = markersRef.current;
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    setTooltipNode(document.createElement("div"));
    setPopupNode(document.createElement("div"));

    // Klick auf die freie Flaeche schliesst die Auswahl.
    map.on("click", () => handlersRef.current.onSelect(null));

    /**
     * ResizeObserver statt window.resize: Beim Ein-/Ausklappen der Sidebar oder
     * der Seitenliste aendert sich die Fensterbreite NICHT — Leaflet wuerde mit
     * einer veralteten Groesse weiterrechnen und graue Kachel-Streifen zeigen.
     */
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const observer = new ResizeObserver(() => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => map.invalidateSize({ animate: false }), RESIZE_DEBOUNCE_MS);
    });
    observer.observe(container);

    return () => {
      if (debounce) clearTimeout(debounce);
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      markers.clear();
      tooltipRef.current = null;
      popupRef.current = null;
      circleRef.current = null;
      // Die neue Map-Instanz (StrictMode-Remount) muss erneut auf den Bestand
      // zoomen — sonst bleibt sie auf der Default-Mitte stehen.
      didFitRef.current = false;
    };
  }, []);

  /* ------------------------------------------------------------- Marker */
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();
    markersRef.current.clear();

    for (const group of groups) {
      const icon = L.divIcon({
        className: pinClassName(group),
        html: pinHtml(group),
        iconSize: [44, 44],
        iconAnchor: [22, 22],
        popupAnchor: [0, -16],
      });

      const marker = L.marker([group.latitude, group.longitude], {
        icon,
        // Ungenaue Positionen in die tieferliegende Pane.
        pane: group.approximate ? APPROX_PANE : undefined,
        keyboard: true,
        title: pinLabel(group),
        alt: pinLabel(group),
        riseOnHover: false,
      });

      marker.on("mouseover", () => handlersRef.current.onHover(group.key));
      marker.on("mouseout", () => handlersRef.current.onHover(null));
      marker.on("click", (event) => {
        L.DomEvent.stopPropagation(event);
        handlersRef.current.onSelect(group.key);
      });
      marker.on("keypress", (event) => {
        const original = (event as L.LeafletKeyboardEvent).originalEvent;
        if (original.key === "Enter" || original.key === " ") {
          handlersRef.current.onSelect(group.key);
        }
      });

      marker.addTo(layer);
      markersRef.current.set(group.key, marker);
    }

    // Einmalig auf den Bestand zoomen. Bei jedem Filterwechsel neu zu zoomen
    // waere ein Kartensprung mitten in der Arbeit.
    if (!didFitRef.current && groups.length > 0) {
      didFitRef.current = true;
      const bounds = L.latLngBounds(groups.map((g) => [g.latitude, g.longitude] as [number, number]));
      map.fitBounds(bounds, { padding: [48, 48], maxZoom: 15, animate: false });
    }
  }, [groups]);

  /* -------------------------------------- Hover-/Auswahl-Klassen am Pin */
  useEffect(() => {
    for (const [key, marker] of markersRef.current) {
      const element = marker.getElement();
      if (!element) continue;
      const isHovered = key === hoveredKey;
      const isSelected = key === selectedKey;
      element.classList.toggle("map-pin--hover", isHovered && !isSelected);
      element.classList.toggle("map-pin--selected", isSelected);
      // Der aktive Pin muss ueber seinen Nachbarn liegen, sonst verschwindet
      // der vergroesserte Punkt halb unter dem naechsten.
      marker.setZIndexOffset(isSelected ? 2000 : isHovered ? 1000 : 0);
    }
  }, [hoveredKey, selectedKey, groups]);

  /* ------------------------------------------------------------ Tooltip */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !tooltipNode) return;

    const closeTooltip = () => {
      if (tooltipTimerRef.current) {
        clearTimeout(tooltipTimerRef.current);
        tooltipTimerRef.current = null;
      }
      if (tooltipRef.current) {
        map.closeTooltip(tooltipRef.current);
        tooltipRef.current = null;
      }
    };

    // Nur mit echtem Zeiger. Auf Touch gibt es kein Hover — dort ist das Popup
    // die einzige Detailansicht.
    const finePointer = window.matchMedia("(pointer: fine)").matches;
    if (!finePointer || !hoveredGroup || hoveredGroup.key === selectedKey) {
      closeTooltip();
      return;
    }

    closeTooltip();
    tooltipTimerRef.current = setTimeout(() => {
      const tooltip = L.tooltip({
        className: "map-tooltip",
        direction: "auto",
        sticky: false,
        opacity: 1,
        offset: [0, -12],
      })
        .setLatLng([hoveredGroup.latitude, hoveredGroup.longitude])
        .setContent(tooltipNode);
      map.openTooltip(tooltip);
      tooltipRef.current = tooltip;
    }, TOOLTIP_DELAY_MS);

    return closeTooltip;
  }, [hoveredGroup, selectedKey, tooltipNode]);

  /* -------------------------------------------------------------- Popup */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !popupNode) return;

    if (!selectedGroup) {
      if (popupRef.current) {
        map.closePopup(popupRef.current);
        popupRef.current = null;
      }
      return;
    }

    const popup = L.popup({
      className: "map-popup",
      closeButton: false,
      closeOnClick: false,
      autoClose: false,
      autoPan: true,
      // Unten mehr Luft, damit das Popup nicht unter der Sheet-Kante landet.
      autoPanPadding: [24, 96],
      maxWidth: 280,
      minWidth: 280,
      offset: [0, -16],
    })
      .setLatLng([selectedGroup.latitude, selectedGroup.longitude])
      .setContent(popupNode);

    map.openPopup(popup);
    popupRef.current = popup;

    // Der Inhalt steht bereits im Knoten (Portal rendert vor dem Effekt), die
    // Groesse kann sich durch Schriftladen aber noch aendern.
    const raf = requestAnimationFrame(() => popup.update());

    return () => {
      cancelAnimationFrame(raf);
      map.closePopup(popup);
      if (popupRef.current === popup) popupRef.current = null;
    };
  }, [selectedGroup, popupNode]);

  /* ------------------------------------------- Unsicherheitskreis (~400m) */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (circleRef.current) {
      circleRef.current.remove();
      circleRef.current = null;
    }

    const target = selectedGroup ?? hoveredGroup;
    if (!target || !target.approximate) return;

    circleRef.current = L.circle([target.latitude, target.longitude], {
      radius: UNCERTAINTY_RADIUS_M,
      color: pinFillColor(target),
      fillColor: pinFillColor(target),
      fillOpacity: 0.08,
      stroke: false,
      interactive: false,
    }).addTo(map);
  }, [hoveredGroup, selectedGroup]);

  return (
    <>
      <div ref={containerRef} className="map-canvas absolute inset-0" />
      {tooltipNode && hoveredGroup && createPortal(<MapTooltipBody group={hoveredGroup} />, tooltipNode)}
      {popupNode &&
        selectedGroup &&
        createPortal(
          <MapPopupBody
            group={selectedGroup}
            onOpenLead={onOpenLead}
            onClose={() => handlersRef.current.onSelect(null)}
          />,
          popupNode,
        )}
    </>
  );
}
