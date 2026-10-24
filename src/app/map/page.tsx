import type { Metadata } from "next";
import { requireAuth } from "@/lib/auth";
import { listMapLeads } from "@/lib/map-leads";
import { MapShell } from "@/components/map/map-shell";

export const metadata: Metadata = {
  title: "Karte",
};

/**
 * Server Component. Der dynamische Leaflet-Import mit `ssr: false` liegt
 * bewusst eine Ebene tiefer in der Client-Shell — in einer Server Component
 * ist `ssr: false` nicht erlaubt.
 *
 * Kein `h-[calc(100vh-1rem)]`: die Shell in app/layout.tsx ist bereits
 * `flex h-screen overflow-hidden` mit `main flex-1 overflow-y-auto`.
 */
export default async function MapPage() {
  const user = await requireAuth();
  let initialLeads = null;
  try {
    initialLeads = await listMapLeads(user);
  } catch (err) {
    console.error("[Map] Error fetching data:", err);
  }
  return <MapShell initialLeads={initialLeads} />;
}
