import { requireAuth } from "@/lib/auth";
import OutreachPageComponent from "@/components/outreach/outreach-page-component";

export default async function OutreachPage() {
  await requireAuth();
  return (
    <div className="flex h-[calc(100vh-1rem)] flex-col">
      <div className="px-5 py-4">
        <h1 className="text-lg font-bold" style={{ color: "var(--text)" }}>Outreach</h1>
        <p className="text-[11px]" style={{ color: "var(--text-2)" }}>
          Instagram-DMs und Telefon-Einstiege aus echten Profildaten
        </p>
      </div>
      <div className="min-h-0 flex-1">
        <OutreachPageComponent />
      </div>
    </div>
  );
}
