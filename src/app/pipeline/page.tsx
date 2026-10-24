import { requireAuth } from "@/lib/auth";
import { listLeads } from "@/lib/leads-list";
import { PipelineBoardComponent } from "@/components/pipeline/pipeline-board-component";

export const metadata = { title: "Pipeline Board | Scale Evo CRM" };

export default async function PipelinePage() {
  const user = await requireAuth();
  let initialLeads: Awaited<ReturnType<typeof listLeads>>["leads"] | null = null;
  try {
    initialLeads = (await listLeads(user, { limit: 100 })).leads;
  } catch (err) {
    console.error("[Pipeline] Error fetching data:", err);
  }

  return (
    <div className="p-6 space-y-6 max-w-full overflow-x-hidden">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight" style={{ color: "var(--text)" }}>
          Pipeline Kanban Board
        </h1>
        <p className="mt-1 text-xs" style={{ color: "var(--text-2)" }}>
          Verwalte den Fortschritt deiner Leads über alle Stufen hinweg von &bdquo;Neu&ldquo; bis &bdquo;Gewonnen&ldquo;.
        </p>
      </div>

      <PipelineBoardComponent initialLeads={initialLeads} />
    </div>
  );
}
