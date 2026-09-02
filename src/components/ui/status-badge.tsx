import type { LeadStatus, Priority } from "@prisma/client";
import { PRIORITY_LABELS, STATUS_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<LeadStatus, { bg: string; tx: string }> = {
  NEW:          { bg: "var(--status-new-bg)", tx: "var(--status-new-tx)" },
  RESEARCHED:   { bg: "var(--status-new-bg)", tx: "var(--status-new-tx)" },
  TO_CONTACT:   { bg: "var(--status-planned-bg)", tx: "var(--status-planned-tx)" },
  CONTACTED:    { bg: "var(--status-contacted-bg)", tx: "var(--status-contacted-tx)" },
  REPLIED:      { bg: "var(--status-contacted-bg)", tx: "var(--status-contacted-tx)" },
  INTERESTED:   { bg: "var(--status-warm-bg)", tx: "var(--status-warm-tx)" },
  APPOINTMENT:  { bg: "var(--status-warm-bg)", tx: "var(--status-warm-tx)" },
  OFFER_SENT:   { bg: "var(--status-planned-bg)", tx: "var(--status-planned-tx)" },
  FOLLOW_UP:    { bg: "var(--status-planned-bg)", tx: "var(--status-planned-tx)" },
  WON:          { bg: "var(--status-warm-bg)", tx: "var(--status-warm-tx)" },
  LOST:         { bg: "var(--status-lost-bg)", tx: "var(--status-lost-tx)" },
  NOT_RELEVANT: { bg: "var(--surface-3)", tx: "var(--text-3)" },
  WALK_IN_PLANNED: { bg: "var(--status-planned-bg)", tx: "var(--status-planned-tx)" },
  VISITED_INTERESTED: { bg: "var(--status-warm-bg)", tx: "var(--status-warm-tx)" },
  VISITED_NO_INTEREST: { bg: "var(--status-lost-bg)", tx: "var(--status-lost-tx)" },
  DEMO_DISPATCHED: { bg: "var(--status-contacted-bg)", tx: "var(--status-contacted-tx)" },
};

export function StatusBadge({ status, className }: { status: LeadStatus; className?: string }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.NEW;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-semibold tracking-wide transition-colors",
        className
      )}
      style={{
        background: style.bg,
        color: style.tx,
      }}
    >
      {STATUS_LABELS[status] || status}
    </span>
  );
}

export function PriorityDot({ priority, className }: { priority: Priority; className?: string }) {
  const dotColors: Record<Priority, string> = {
    HIGH: "#E06868",
    MEDIUM: "#E0A868",
    LOW: "#6BA4E8",
  };

  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs", className)} style={{ color: "var(--text-2)" }}>
      <span
        className="w-2 h-2 rounded-full shrink-0"
        style={{ background: dotColors[priority] || dotColors.MEDIUM }}
      />
      {PRIORITY_LABELS[priority]}
    </span>
  );
}
