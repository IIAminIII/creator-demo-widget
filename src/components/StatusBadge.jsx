const STATUS_STYLES = {
  New: "bg-sky-50 text-sky-700 border-sky-200",
  "Under Review": "bg-amber-50 text-amber-700 border-amber-200",
  "Needs Clarification": "bg-rose-50 text-rose-700 border-rose-200",
  Approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Rejected: "bg-slate-100 text-slate-700 border-slate-200",
  sent: "bg-indigo-50 text-indigo-700 border-indigo-200",
  draft: "bg-slate-100 text-slate-700 border-slate-200",
  unpaid: "bg-amber-50 text-amber-700 border-amber-200",
  paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

export default function StatusBadge({ label, compact = false }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 font-medium ${
        compact ? "text-[11px]" : "text-xs"
      } ${STATUS_STYLES[label] ?? "bg-slate-100 text-slate-700 border-slate-200"}`}
    >
      {label}
    </span>
  );
}
