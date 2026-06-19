import StatusBadge from "./StatusBadge";

function formatCurrency(value, currencyCode) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode || "USD",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function isOverdue(dueDateString) {
  if (!dueDateString) return false;
  return new Date(dueDateString) < new Date();
}

export default function InvoiceInbox({ items, loading, selectedRecordId, onSelect }) {
  if (loading) {
    return (
      <div className="widget-surface p-5">
        <div className="space-y-3">
          <div className="skeleton h-6 w-40" />
          <div className="skeleton h-20 w-full" />
          <div className="skeleton h-20 w-full" />
          <div className="skeleton h-20 w-full" />
        </div>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="widget-empty-state p-8">
        <h3 className="text-lg font-semibold text-slate-900">No invoices in the current queue</h3>
        <p className="mt-2 text-sm text-slate-500">
          Adjust the filters or refresh the inbox to bring in pending approvals.
        </p>
      </div>
    );
  }

  return (
    <div className="widget-surface overflow-hidden">
      <div className="border-b border-slate-200 px-5 py-4">
        <h3 className="text-lg font-semibold text-slate-900">Invoice inbox</h3>
        <p className="mt-1 text-sm text-slate-500">
          Select an invoice to review Books details, CRM context, and approval actions.
        </p>
      </div>
      <div className="divide-y divide-slate-200">
        {items.map((item) => {
          const isSelected = item.approvalRecordId === selectedRecordId;
          const overdue = isOverdue(item.dueDate) && item.approvalStatus !== "Approved" && item.approvalStatus !== "Rejected";

          return (
            <button
              key={item.approvalRecordId}
              type="button"
              className={`w-full px-5 py-4 text-left transition ${
                isSelected ? "bg-indigo-50/80" : "bg-white hover:bg-slate-50"
              }`}
              onClick={() => onSelect(item.approvalRecordId)}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-base font-semibold text-slate-900">{item.invoiceNumber}</p>
                    <StatusBadge label={item.approvalStatus} compact />
                    <StatusBadge label={item.booksStatus} compact />
                    {overdue && (
                      <span className="inline-flex items-center rounded-full border border-rose-300 bg-rose-50 px-2.5 py-0.5 text-[11px] font-medium text-rose-700">
                        Overdue
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-sm font-medium text-slate-700">{item.customerName}</p>
                  <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-500">
                    <span className={overdue ? "font-semibold text-rose-600" : ""}>
                      Due {item.dueDate || "No due date"}
                    </span>
                    <span>{item.crmAccountName || "No CRM account linked"}</span>
                    <span>Payment: {item.paymentStatus}</span>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-medium text-slate-500">Invoice total</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">
                    {formatCurrency(item.invoiceTotal, item.currencyCode)}
                  </p>
                  <p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-400">
                    Priority {item.priority}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
