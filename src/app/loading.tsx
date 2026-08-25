export default function PageLoader() {
  return (
    <div
      className="flex items-center justify-center h-full min-h-64"
      aria-label="Lädt…"
    >
      <div className="flex flex-col items-center gap-3">
        <div
          className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: "var(--border-2)", borderTopColor: "var(--accent)" }}
        />
        <span className="text-xs" style={{ color: "var(--text-3)" }}>
          Lädt…
        </span>
      </div>
    </div>
  );
}
