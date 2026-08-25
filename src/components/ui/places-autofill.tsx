"use client";

import { Loader2, MapPin, Search, Star } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { PlaceSuggestion } from "@/lib/places";

type PlacesAutofillProps = {
  onSelect: (place: PlaceSuggestion) => void;
};

export function PlacesAutofill({ onSelect }: PlacesAutofillProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const requestSeq = useRef(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/places")
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setConfigured(Boolean(data.configured));
      })
      .catch(() => {
        if (!cancelled) setConfigured(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const seq = ++requestSeq.current;
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      setResults([]);
      setOpen(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/places?q=${encodeURIComponent(trimmed)}`);
        const data = await response.json();
        if (seq !== requestSeq.current) return;
        setConfigured(Boolean(data.configured));
        if (!response.ok) {
          setError(data.error ?? "Suche fehlgeschlagen.");
          setResults([]);
          setOpen(false);
          return;
        }
        setError("");
        setResults(data.suggestions ?? []);
        setOpen(true);
        setActiveIndex(-1);
      } catch {
        if (seq !== requestSeq.current) return;
        setError("Suche fehlgeschlagen.");
        setResults([]);
        setOpen(false);
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, []);

  function choose(place: PlaceSuggestion) {
    onSelect(place);
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + results.length) % results.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(results[activeIndex >= 0 ? activeIndex : 0]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={boxRef} className="relative">
      <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-2)" }}>
        Google Places Autofill (Firmenname + Ort)
      </label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
          style={{ color: "var(--text-3)" }}
        />
        <input
          id="places-search"
          type="text"
          className="w-full rounded-md pl-9 pr-9 py-2 text-sm border outline-none transition-colors"
          style={{
            background: "var(--surface-2)",
            borderColor: "var(--border)",
            color: "var(--text)",
          }}
          placeholder='z. B. "Friseur Haarstil Wien"'
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
        />
        {loading && (
          <Loader2
            className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin"
            style={{ color: "var(--accent)" }}
          />
        )}
      </div>

      {configured === false && (
        <p className="mt-1.5 text-xs" style={{ color: "var(--status-planned-tx)" }}>
          Google Places API Key ist nicht konfiguriert (optional).
        </p>
      )}
      {error && (
        <p className="mt-1.5 text-xs" style={{ color: "var(--status-lost-tx)" }}>
          {error}
        </p>
      )}

      {open && results.length > 0 && (
        <ul
          className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-lg border shadow-xl py-1"
          style={{
            background: "var(--surface-2)",
            borderColor: "var(--border-2)",
          }}
          role="listbox"
        >
          {results.map((place, index) => (
            <li key={place.googleMapsUri ?? place.name + index} role="option" aria-selected={index === activeIndex}>
              <button
                type="button"
                className="flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors"
                style={{
                  background: index === activeIndex ? "var(--surface-3)" : "transparent",
                }}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(place)}
              >
                <MapPin className="mt-0.5 w-4 h-4 shrink-0" style={{ color: "var(--status-new-tx)" }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold" style={{ color: "var(--text)" }}>
                    {place.name}
                  </span>
                  <span className="block truncate text-[11px]" style={{ color: "var(--text-2)" }}>
                    {place.address}
                    {place.city ? `, ${place.city}` : ""}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]" style={{ color: "var(--text-3)" }}>
                    {place.rating != null && (
                      <span className="flex items-center gap-1">
                        <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                        {place.rating.toFixed(1)}
                        {place.reviewCount != null ? ` (${place.reviewCount})` : ""}
                      </span>
                    )}
                    {place.phone && <span>{place.phone}</span>}
                    {place.industry && <span>{place.industry}</span>}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && !loading && results.length === 0 && query.trim().length >= 3 && (
        <div
          className="absolute z-30 mt-1 w-full rounded-lg border p-3 text-xs shadow-xl"
          style={{
            background: "var(--surface-2)",
            borderColor: "var(--border)",
            color: "var(--text-2)",
          }}
        >
          Keine Treffer gefunden.
        </div>
      )}
    </div>
  );
}
