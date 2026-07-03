function resolveTone(label = "") {
  const normalized = String(label).trim().toLowerCase();

  if (
    normalized.includes("approved") ||
    normalized.includes("synced") ||
    normalized === "paid"
  ) {
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  }

  if (
    normalized.includes("rejected") ||
    normalized.includes("failed")
  ) {
    return "bg-rose-50 text-rose-700 border-rose-200";
  }

  if (
    normalized.includes("clarification") ||
    normalized.includes("review needed") ||
    normalized.includes("manual review") ||
    normalized.includes("overdue") ||
    normalized.includes("difference found") ||
    normalized.includes("under review") ||
    normalized.includes("unpaid") ||
    normalized.includes("partially paid")
  ) {
    return "bg-amber-50 text-amber-700 border-amber-200";
  }

  if (normalized.includes("books")) {
    return "bg-indigo-50 text-indigo-700 border-indigo-200";
  }

  return "bg-slate-100 text-slate-700 border-slate-200";
}

export default function StatusBadge({ label, compact = false }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 font-medium ${
        compact ? "text-[11px]" : "text-xs"
      } ${resolveTone(label)}`}
    >
      {label}
    </span>
  );
}
