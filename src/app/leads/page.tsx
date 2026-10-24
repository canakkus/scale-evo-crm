import { requireAuth } from "@/lib/auth";
import { LeadsTable } from "@/components/leads/leads-table";

export const metadata = { title: "Leads | Scale Evo CRM" };

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ lead?: string | string[] }>;
}) {
  await requireAuth();
  const params = await searchParams;
  const leadParam = params.lead;
  const initialLeadId = Array.isArray(leadParam) ? leadParam[0] : leadParam;

  return (
    <div className="p-6 space-y-6 w-full max-w-full">
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
      <LeadsTable initialLeadId={initialLeadId || null} />
    </div>
  );
}
