import { requireAuth } from "@/lib/auth";
import { LeadScoutComponent } from "@/components/scout/lead-scout-component";

export const metadata = { title: "Lead Scout 3.0 | Scale Evo CRM" };

export default async function LeadScoutPage() {
  await requireAuth();

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight" style={{ color: "var(--text)" }}>
          Lead Scout 3.0
        </h1>
        <p className="mt-1 text-xs" style={{ color: "var(--text-2)" }}>
          Scoute automatisiert Treatwell & Google Places nach Betrieben ohne eigene Website oder mit veralteten Systemen. Durchläufe werden dauerhaft gespeichert.
        </p>
      </div>

      <LeadScoutComponent />
    </div>
  );
}
