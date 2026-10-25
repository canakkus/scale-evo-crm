import { requireAuth } from "@/lib/auth";
import { listLeads } from "@/lib/leads-list";
import { LeadsTable } from "@/components/leads/leads-table";

export const metadata = { title: "Leads | Scale Evo CRM" };

export default async function LeadsPage({
  searchParams,
}: {
  searchParams?: Promise<{ lead?: string | string[] }>;
}) {
  const user = await requireAuth();
  const params = searchParams ? await searchParams : {};
  const leadParam = params?.lead;
  const initialLeadId = Array.isArray(leadParam) ? leadParam[0] : leadParam;

  let initialData = null;
  try {
    initialData = await listLeads(user, { page: 1, limit: 20 });
  } catch (err) {
    console.error("[Leads] Error fetching data:", err);
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 w-full max-w-full">
      {/* Header */}
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight" style={{ color: "var(--text)" }}>
          Lead-Verwaltung
        </h1>
        <p className="mt-1 text-xs" style={{ color: "var(--text-2)" }}>
          Akquise-Leads, 3-Pane Split View &amp; Pipeline-Zustände.
        </p>
      </div>

      {/* Table */}
      <LeadsTable initialData={initialData} initialLeadId={initialLeadId || null} />
    </div>
  );
}
