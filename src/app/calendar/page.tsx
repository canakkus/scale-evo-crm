import { requireAuth } from "@/lib/auth";
import { CalendarView } from "@/components/calendar/calendar-view";

export const metadata = { title: "Kalender | Scale Evo CRM" };

export default async function CalendarPage() {
  await requireAuth();

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight" style={{ color: "var(--text)" }}>
          Kalender
        </h1>
        <p className="mt-1 text-xs" style={{ color: "var(--text-2)" }}>
          Plane Cold Calls auf einen Zeitpunkt, sieh sie im Monat, in der Woche oder auf dem Board und abonniere sie im Apple Kalender.
        </p>
      </div>
      <CalendarView />
    </div>
  );
}
