import { requireAuth } from "@/lib/auth";
import { ColdCallsComponent } from "@/components/cold-calls/cold-calls-component";

export const metadata = { title: "Cold Calls | Scale Evo CRM" };

export default async function ColdCallsPage() {
  await requireAuth();

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight" style={{ color: "var(--text)" }}>
          Cold Calls & Gemini Audio-Transkription
        </h1>
        <p className="mt-1 text-xs" style={{ color: "var(--text-2)" }}>
          Lade Anrufaufnahmen hoch — Gemini transkribiert deine Verkaufsgespräche, extrahiert Einwände/Termine und hängt automatisch Notizen an deine Leads an.
        </p>
      </div>

      <ColdCallsComponent />
    </div>
  );
}
