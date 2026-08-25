import { requireAuth } from "@/lib/auth";
import { LeadsTable } from "@/components/leads/leads-table";

export const metadata = { title: "Leads | Scale Evo CRM" };

export default async function LeadsPage() {
  await requireAuth();

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight" style={{ color: "var(--text)" }}>
          Lead-Verwaltung
        </h1>
        <p className="mt-1 text-xs" style={{ color: "var(--text-2)" }}>
          Verwalte deine Akquise-Leads, ändere Pipeline-Zustände und nutze Google Places Autofill.
        </p>
      </div>

      {/* Table */}
      <LeadsTable />
    </div>
  );
}
