import { useMemo, useState } from "react";
import StatusBadge from "./StatusBadge";

function formatCurrency(value, currencyCode) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode || "USD",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

function isStaleSyncAt(syncAtString) {
  if (!syncAtString) return true;
  return Date.now() - new Date(syncAtString).getTime() > STALE_THRESHOLD_MS;
}

function isOverdue(dueDateString) {
  if (!dueDateString) return false;
  return new Date(dueDateString) < new Date();
}

export default function InvoiceDetail({
  detail,
  loading,
  actionLoading,
  onRefresh,
  onApprove,
  onReject,
  onClarify,
  onAddComment,
}) {
  const [reviewer, setReviewer] = useState("Finance Ops");
  const [comment, setComment] = useState("");
  const [exceptionReason, setExceptionReason] = useState("");

  const summaryCards = useMemo(() => {
    if (!detail) {
      return [];
    }

    return [
      { label: "Invoice number", value: detail.invoiceNumber },
      { label: "Customer", value: detail.customerName },
      { label: "Invoice total", value: formatCurrency(detail.invoiceTotal, detail.currencyCode) },
      { label: "Due date", value: detail.dueDate || "N/A" },
    ];
  }, [detail]);

  const staleSync = detail ? isStaleSyncAt(detail.lastBooksSyncAt) : false;
  const overdue = detail ? isOverdue(detail.dueDate) && detail.approvalStatus !== "Approved" && detail.approvalStatus !== "Rejected" : false;

  if (loading) {
    return (
      <div className="widget-surface p-6">
        <div className="space-y-3">
          <div className="skeleton h-8 w-56" />
          <div className="skeleton h-24 w-full" />
          <div className="skeleton h-24 w-full" />
          <div className="skeleton h-48 w-full" />
        </div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="widget-empty-state p-8">
        <h3 className="text-lg font-semibold text-slate-900">Select an invoice to review</h3>
        <p className="mt-2 text-sm text-slate-500">
          The detail panel will show Books invoice data, CRM context, approval controls, comments, and audit history.
        </p>
      </div>
    );
  }

  const submitAction = async (type) => {
    const payload = {
      reviewer,
      comment,
      exceptionReason,
    };

    if (type === "approve") {
      await onApprove(payload);
    } else if (type === "reject") {
      if (!comment.trim() || !exceptionReason.trim()) {
        throw new Error("Rejecting an invoice requires both a comment and an exception reason.");
      }
      await onReject(payload);
    } else {
      if (!comment.trim() || !exceptionReason.trim()) {
        throw new Error("Requesting clarification requires both a comment and a clarification reason.");
      }
      await onClarify(payload);
    }

    setComment("");
    setExceptionReason("");
  };

  return (
    <div className="widget-surface overflow-hidden">
      <div className="border-b border-slate-200 bg-[linear-gradient(135deg,#0f172a_0%,#1f2937_60%,#134e4a_100%)] px-6 py-6 text-white">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge label={detail.approvalStatus} />
              <StatusBadge label={detail.booksStatus} />
              <StatusBadge label={detail.paymentStatus} />
            </div>
            <h3 className="mt-4 text-2xl font-semibold tracking-tight">
              {detail.invoiceNumber}
            </h3>
            <p className="mt-2 max-w-2xl text-sm text-white/75">
              Books remains the source of truth for this invoice. Creator stores the workflow state, reviewer comments, and audit history.
            </p>
          </div>

          <button
            type="button"
            className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/15"
            onClick={onRefresh}
            disabled={actionLoading}
          >
            Refresh from Books
          </button>
        </div>
      </div>

      <div className="space-y-6 p-6">
        {staleSync && (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <span className="mt-0.5 font-bold">!</span>
            <span>
              Books snapshot is stale — last synced {detail.lastBooksSyncAt ? new Date(detail.lastBooksSyncAt).toLocaleString() : "never"}.
              Use <strong>Refresh from Books</strong> to pull the latest invoice data.
            </span>
          </div>
        )}
        {overdue && (
          <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            <span className="mt-0.5 font-bold">!</span>
            <span>
              This invoice is <strong>past its due date ({detail.dueDate})</strong> and has not been approved. Prompt action is needed.
            </span>
          </div>
        )}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((item) => (
            <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                {item.label}
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-900">{item.value}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
          <section className="space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-5">
              <h4 className="text-lg font-semibold text-slate-900">Books invoice snapshot</h4>
              <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Description</th>
                      <th className="px-4 py-3 text-left font-medium">Qty</th>
                      <th className="px-4 py-3 text-left font-medium">Rate</th>
                      <th className="px-4 py-3 text-left font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.lineItems?.length ? (
                      detail.lineItems.map((line) => (
                        <tr key={line.id} className="border-t border-slate-200 text-slate-700">
                          <td className="px-4 py-3">{line.description}</td>
                          <td className="px-4 py-3">{line.quantity}</td>
                          <td className="px-4 py-3">
                            {formatCurrency(line.rate, detail.currencyCode)}
                          </td>
                          <td className="px-4 py-3">
                            {formatCurrency(line.total, detail.currencyCode)}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr className="border-t border-slate-200">
                        <td colSpan="4" className="px-4 py-4 text-slate-500">
                          No line-item snapshot is available yet. Wire the Books detail function to enrich this section.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 text-sm text-slate-500">
                Last Books sync: {detail.lastBooksSyncAt || "Never"}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5">
              <h4 className="text-lg font-semibold text-slate-900">Comments</h4>
              <div className="mt-4 space-y-3">
                {detail.comments?.length ? (
                  detail.comments.map((entry) => (
                    <div key={entry.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-900">{entry.author}</p>
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                          {entry.type}
                        </p>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{entry.body}</p>
                      <p className="mt-3 text-xs text-slate-400">{entry.createdAt}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">No comments yet.</p>
                )}
              </div>
            </div>
          </section>

          <aside className="space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-5">
              <h4 className="text-lg font-semibold text-slate-900">CRM context</h4>
              <div className="mt-4 space-y-3 text-sm">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Account</p>
                  <p className="mt-1 font-medium text-slate-800">{detail.crmContext?.accountName || detail.crmAccountName || "No CRM account linked"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Deal</p>
                  <p className="mt-1 font-medium text-slate-800">{detail.crmContext?.dealName || detail.crmDealName || "No CRM deal linked"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Account manager</p>
                  <p className="mt-1 font-medium text-slate-800">{detail.crmContext?.accountManager || detail.crmOwnerName || "Not enriched yet"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Segment</p>
                  <p className="mt-1 font-medium text-slate-800">{detail.crmContext?.segment || "Not enriched yet"}</p>
                </div>
              </div>
              <p className="mt-4 text-sm text-slate-500">
                CRM context is read-only in v1 and should never block approval actions if unavailable.
              </p>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5">
              <h4 className="text-lg font-semibold text-slate-900">Approval controls</h4>
              <div className="mt-4 space-y-4">
                <label className="block">
                  <span className="block text-sm font-medium text-slate-700">Reviewer</span>
                  <input
                    className="mt-2 h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm text-slate-800 outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100"
                    value={reviewer}
                    onChange={(event) => setReviewer(event.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="block text-sm font-medium text-slate-700">Comment</span>
                  <textarea
                    className="mt-2 min-h-28 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-800 outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100"
                    placeholder="Add an approval note, rejection reason, or clarification request."
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="block text-sm font-medium text-slate-700">Exception / clarification reason</span>
                  <input
                    className="mt-2 h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm text-slate-800 outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100"
                    placeholder="Required for reject or clarification"
                    value={exceptionReason}
                    onChange={(event) => setExceptionReason(event.target.value)}
                  />
                </label>

                <div className="grid gap-3">
                  <button
                    type="button"
                    className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60"
                    disabled={actionLoading}
                    onClick={() => submitAction("approve")}
                  >
                    Approve invoice
                  </button>
                  <button
                    type="button"
                    className="rounded-2xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:opacity-60"
                    disabled={actionLoading}
                    onClick={() => submitAction("reject")}
                  >
                    Reject invoice
                  </button>
                  <button
                    type="button"
                    className="rounded-2xl bg-amber-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-400 disabled:opacity-60"
                    disabled={actionLoading}
                    onClick={() => submitAction("clarify")}
                  >
                    Request clarification
                  </button>
                  <button
                    type="button"
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                    disabled={actionLoading || !comment.trim()}
                    onClick={async () => {
                      await onAddComment({
                        reviewer,
                        comment,
                        type: "Internal note",
                      });
                      setComment("");
                    }}
                  >
                    Add comment only
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5">
              <h4 className="text-lg font-semibold text-slate-900">Audit trail</h4>
              <div className="mt-4 space-y-3">
                {detail.audit?.length ? (
                  detail.audit.map((entry) => (
                    <div key={entry.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-900">{entry.eventType}</p>
                        <p className="text-xs text-slate-400">{entry.createdAt}</p>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{entry.summary}</p>
                      <p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-400">
                        {entry.actor}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">No audit events yet.</p>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
