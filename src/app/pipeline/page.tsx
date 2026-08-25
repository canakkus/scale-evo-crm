import { requireAuth } from "@/lib/auth";
import { PipelineBoardComponent } from "@/components/pipeline/pipeline-board-component";

export const metadata = { title: "Pipeline Board | Scale Evo CRM" };

export default async function PipelinePage() {
  await requireAuth();

  return (
    <div className="p-6 space-y-6 max-w-full overflow-x-hidden">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight" style={{ color: "var(--text)" }}>
          Pipeline Kanban Board
        </h1>
        <p className="mt-1 text-xs" style={{ color: "var(--text-2)" }}>
          Verwalte den Fortschritt deiner Leads über alle Stufen hinweg von 'Neu' bis 'Gewonnen'.
        </p>
      </div>

      <PipelineBoardComponent />
    </div>
  );
}
