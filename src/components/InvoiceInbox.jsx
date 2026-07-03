import StatusBadge from "./StatusBadge";

function formatCurrency(value, currencyCode) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode || "USD",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatDueDate(value) {
  if (!value) {
    return "No due date";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString();
}

function isOverdue(dueDateString, approvalStatus) {
  if (!dueDateString) {
    return false;
  }

  const parsed = new Date(dueDateString);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  return (
    !["Approved", "Rejected"].includes(String(approvalStatus || "")) &&
    parsed.getTime() < Date.now()
  );
}

function getEmptyState(filters = {}) {
  if (filters.searchText?.trim()) {
    return {
      title: "No invoices found for this search.",
      message: "Try a broader search term or clear the search box.",
    };
  }

  if (
    filters.statusFilter === "Pending" &&
    filters.syncFilter === "All" &&
    filters.paymentFilter === "All" &&
    filters.priorityFilter === "All"
  ) {
    return {
      title: "No pending invoices right now.",
      message: "The pending queue is clear at the moment.",
    };
  }

  return {
    title: "No invoices match the selected filters.",
    message: "Adjust the current filters or refresh the inbox to load another set.",
  };
}

export default function InvoiceInbox({
  items,
  loading,
  selectedRecordId,
  onSelect,
  filters,
}) {
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
    const emptyState = getEmptyState(filters);

    return (
      <div className="widget-empty-state p-8">
        <h3 className="text-lg font-semibold text-slate-900">{emptyState.title}</h3>
        <p className="mt-2 text-sm text-slate-500">{emptyState.message}</p>
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
          const selected = item.approvalRecordId === selectedRecordId;
          const overdue = isOverdue(item.dueDate, item.approvalStatus);

          return (
            <button
              key={item.approvalRecordId}
              type="button"
              className={`w-full px-5 py-4 text-left transition ${
                selected ? "bg-indigo-50/80" : "bg-white hover:bg-slate-50"
              }`}
              onClick={() => onSelect(item.approvalRecordId)}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-base font-semibold text-slate-900">{item.invoiceNumber}</p>
                    <StatusBadge label={item.approvalStatus} compact />
                    <StatusBadge label={item.syncStatus || "Unknown"} compact />
                    <StatusBadge label={item.paymentStatus || "Unknown"} compact />
                    <StatusBadge label={item.priority || "Medium"} compact />
                    {item.differenceFound ? (
                      <StatusBadge label="Difference Found" compact />
                    ) : null}
                    {overdue ? <StatusBadge label="Overdue" compact /> : null}
                  </div>
                  <p className="mt-2 text-sm font-medium text-slate-700">
                    {item.customerName || "No customer name"}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-500">
                    <span className={overdue ? "font-semibold text-amber-700" : ""}>
                      Due {formatDueDate(item.dueDate)}
                    </span>
                    <span>{item.crmAccountName || "No CRM account linked"}</span>
                    <span>{item.crmDealName || "No deal linked"}</span>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-medium text-slate-500">Invoice total</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">
                    {formatCurrency(item.invoiceTotal, item.currencyCode)}
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
