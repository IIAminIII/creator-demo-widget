import { useMemo, useState } from "react";
import StatusBadge from "./StatusBadge";

function formatCurrency(value, currencyCode) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode || "USD",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatDateTime(value) {
  if (!value) {
    return "Not available";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

function formatLineItemTax(line) {
  if (!line?.taxName && !line?.taxPercentage) {
    return "N/A";
  }

  if (line.taxName && line.taxPercentage) {
    return `${line.taxName} (${line.taxPercentage}%)`;
  }

  return line.taxName || `${line.taxPercentage}%`;
}

function normalizeDifferenceFound(value, summary = "") {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "yes", "1", "found", "difference found"].includes(normalized)) {
      return true;
    }
    if (["false", "no", "0", "none", "no difference"].includes(normalized)) {
      return false;
    }
  }

  return summary.trim().toLowerCase() === "no difference" ? false : null;
}

function deriveSyncStatus(detail) {
  const differenceFound = normalizeDifferenceFound(
    detail?.differenceFound,
    detail?.differenceSummary || "",
  );
  const fallbackSummary =
    differenceFound === true
      ? "Difference Found"
      : differenceFound === false
        ? "No Difference"
        : "Not compared yet";
  const status = detail?.syncStatus?.trim()
    || (differenceFound === true
      ? "Difference Found"
      : differenceFound === false
        ? "Synced"
        : "Manual Review");

  return {
    status,
    lastBooksSyncAt: detail?.lastBooksSyncAt || "",
    lastComparedAt: detail?.lastComparedAt || "",
    differenceLabel:
      differenceFound === true
        ? "Difference Found"
        : differenceFound === false
          ? "No Difference"
          : "Manual Review",
    differenceSummary: detail?.differenceSummary?.trim() || fallbackSummary,
  };
}

function deriveApprovalGuardrail(detail, guardrailCheck) {
  const differenceFound =
    guardrailCheck?.differenceFound ??
    normalizeDifferenceFound(
      detail?.booksSyncDifferenceFound ??
        detail?.booksSnapshotDifferenceFound ??
        detail?.differenceFound,
      detail?.differenceSummary || "",
    );
  const blockingReasons = Array.isArray(guardrailCheck?.blockingReasons)
    ? guardrailCheck.blockingReasons.filter(Boolean)
    : [];
  const warningReasons = Array.isArray(guardrailCheck?.warningReasons)
    ? guardrailCheck.warningReasons.filter(Boolean)
    : [];
  const canApprove =
    typeof guardrailCheck?.canApprove === "boolean"
      ? guardrailCheck.canApprove
      : blockingReasons.length === 0;

  return {
    approvalStatus: guardrailCheck?.approvalStatus || detail?.approvalStatus || "Unknown",
    syncStatus: guardrailCheck?.syncStatus || detail?.syncStatus || "Unknown",
    booksPaymentStatus:
      guardrailCheck?.booksPaymentStatus || detail?.paymentStatus || "Unknown",
    differenceFound:
      differenceFound === true
        ? "Difference Found"
        : differenceFound === false
          ? "No Difference"
          : "Manual Review",
    lastBooksSyncAt: guardrailCheck?.lastBooksSyncAt || detail?.lastBooksSyncAt || "",
    lastComparedAt:
      guardrailCheck?.lastComparedAt ||
      detail?.lastComparedAt ||
      detail?.lastBooksComparedAt ||
      "",
    result:
      !guardrailCheck
        ? "Not Checked"
        : !canApprove
          ? "Blocked"
          : warningReasons.length
            ? "Manual Review"
            : "Safe to Approve",
    message:
      guardrailCheck?.message ||
      "Checks whether this invoice is safe to approve based on Books refresh, payment status, and difference result.",
    blockingReasons,
    warningReasons,
  };
}

function getAuditEventPresentation(eventType = "") {
  const normalized = eventType.trim().toLowerCase();

  if (normalized === "approved") {
    return {
      label: "Invoice Approved",
      toneClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
    };
  }

  if (normalized === "rejected") {
    return {
      label: "Invoice Rejected",
      toneClass: "bg-rose-50 text-rose-700 border-rose-200",
    };
  }

  if (
    normalized === "clarification requested" ||
    normalized === "needs clarification"
  ) {
    return {
      label: "Clarification Requested",
      toneClass: "bg-amber-50 text-amber-700 border-amber-200",
    };
  }

  if (normalized === "comment added") {
    return {
      label: "Comment Added",
      toneClass: "bg-slate-100 text-slate-700 border-slate-200",
    };
  }

  if (normalized === "books snapshot refreshed" || normalized === "books refresh") {
    return {
      label: "Books Snapshot Refreshed",
      toneClass: "bg-sky-50 text-sky-700 border-sky-200",
    };
  }

  if (normalized === "books sync failed" || normalized === "books refresh failed") {
    return {
      label: "Books Refresh Failed",
      toneClass: "bg-rose-50 text-rose-700 border-rose-200",
    };
  }

  return {
    label: eventType || "Activity",
    toneClass: "bg-slate-100 text-slate-700 border-slate-200",
  };
}

function deriveReviewerDecisionSummary(detail) {
  const latestAudit = Array.isArray(detail?.audit) && detail.audit.length
    ? detail.audit[0]
    : null;

  return {
    approvalStatus: detail?.approvalStatus || "Unknown",
    reviewerNotes: detail?.reviewerNotes || "No reviewer notes yet.",
    decisionDate: detail?.decisionDate || "",
    exceptionReason: detail?.exceptionReason || "None",
    lastActionBy: detail?.lastActionBy || latestAudit?.actor || "Not available",
    lastActionDate: detail?.lastActionDate || latestAudit?.createdAt || "",
    lastEventType: detail?.lastEventType || latestAudit?.eventType || "Not available",
  };
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
  guardrailCheck,
  onRefresh,
  onCheckApprovalSafety,
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
  const syncCard = detail ? deriveSyncStatus(detail) : null;
  const approvalGuardrail = detail
    ? deriveApprovalGuardrail(detail, guardrailCheck)
    : null;
  const reviewerDecisionSummary = detail
    ? deriveReviewerDecisionSummary(detail)
    : null;

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
              <div className="inline-flex items-center rounded-full bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700">
                Books Sync Check
              </div>
              <h4 className="mt-3 text-lg font-semibold text-slate-900">Sync Status</h4>
              <p className="mt-2 text-sm text-slate-500">
                Compare the Creator approval snapshot with the latest invoice data from Zoho Books.
              </p>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Sync Status</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{syncCard.status}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Difference Found</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{syncCard.differenceLabel}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Last Books Sync At</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{formatDateTime(syncCard.lastBooksSyncAt)}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Last Compared At</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{formatDateTime(syncCard.lastComparedAt)}</p>
                </div>
              </div>

              <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Difference Summary</p>
                <p className="mt-2 text-sm leading-6 text-slate-700">{syncCard.differenceSummary}</p>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5">
              <h4 className="text-lg font-semibold text-slate-900">Invoice Line Items</h4>
              <p className="mt-2 text-sm text-slate-500">
                Items and charges pulled from the linked Zoho Books invoice.
              </p>
              <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
                <table className="min-w-[920px] w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Item</th>
                      <th className="px-4 py-3 text-left font-medium">Description</th>
                      <th className="px-4 py-3 text-left font-medium">Qty</th>
                      <th className="px-4 py-3 text-left font-medium">Rate</th>
                      <th className="px-4 py-3 text-left font-medium">Discount</th>
                      <th className="px-4 py-3 text-left font-medium">Tax</th>
                      <th className="px-4 py-3 text-left font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.lineItems?.length ? (
                      detail.lineItems.map((line) => (
                        <tr key={line.id} className="border-t border-slate-200 text-slate-700">
                          <td className="px-4 py-3 font-medium text-slate-900">
                            {line.name || "Item"}
                          </td>
                          <td className="px-4 py-3">{line.description}</td>
                          <td className="px-4 py-3">{line.quantity}</td>
                          <td className="px-4 py-3">
                            {formatCurrency(line.rate, detail.currencyCode)}
                          </td>
                          <td className="px-4 py-3">
                            {formatCurrency(line.discount, detail.currencyCode)}
                          </td>
                          <td className="px-4 py-3">{formatLineItemTax(line)}</td>
                          <td className="px-4 py-3">
                            {formatCurrency(line.total, detail.currencyCode)}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr className="border-t border-slate-200">
                        <td colSpan="7" className="px-4 py-4 text-slate-500">
                          No line items found for this invoice.
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
                      <p className="mt-3 text-xs text-slate-400">{formatDateTime(entry.createdAt)}</p>
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
              <div className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                Reviewer Decision Summary
              </div>
              <h4 className="mt-3 text-lg font-semibold text-slate-900">Reviewer Decision Summary</h4>
              <div className="mt-4 grid gap-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Current Approval Status</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{reviewerDecisionSummary.approvalStatus}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Reviewer Notes</p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{reviewerDecisionSummary.reviewerNotes}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Approval Decision Date</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{formatDateTime(reviewerDecisionSummary.decisionDate)}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Exception Reason</p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{reviewerDecisionSummary.exceptionReason}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Last Action By</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{reviewerDecisionSummary.lastActionBy}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Last Action Date</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{formatDateTime(reviewerDecisionSummary.lastActionDate)}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Last Event Type</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">
                    {getAuditEventPresentation(reviewerDecisionSummary.lastEventType).label}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5">
              <div className="inline-flex items-center rounded-full bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700">
                Approval Guardrails
              </div>
              <h4 className="mt-3 text-lg font-semibold text-slate-900">Approval Guardrails</h4>
              <p className="mt-2 text-sm text-slate-500">
                Checks whether this invoice is safe to approve based on Books refresh, payment status, and difference result.
              </p>

              <div className="mt-4 grid gap-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Approval Status</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{approvalGuardrail.approvalStatus}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Sync Status</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{approvalGuardrail.syncStatus}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Books Payment Status</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{approvalGuardrail.booksPaymentStatus}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Difference Found</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{approvalGuardrail.differenceFound}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Last Books Sync At</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{formatDateTime(approvalGuardrail.lastBooksSyncAt)}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Last Compared At</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{formatDateTime(approvalGuardrail.lastComparedAt)}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Guardrail Result</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{approvalGuardrail.result}</p>
                </div>
                {approvalGuardrail.blockingReasons.length ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-500">Blocking Reasons</p>
                    <div className="mt-2 space-y-2 text-sm text-rose-800">
                      {approvalGuardrail.blockingReasons.map((reason) => (
                        <p key={reason}>{reason}</p>
                      ))}
                    </div>
                  </div>
                ) : null}
                {approvalGuardrail.warningReasons.length ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-600">Warning Reasons</p>
                    <div className="mt-2 space-y-2 text-sm text-amber-800">
                      {approvalGuardrail.warningReasons.map((reason) => (
                        <p key={reason}>{reason}</p>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <p className="mt-4 text-sm text-slate-500">{approvalGuardrail.message}</p>
              <button
                type="button"
                className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                disabled={actionLoading}
                onClick={onCheckApprovalSafety}
              >
                Check Approval Safety
              </button>
            </div>

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
              <h4 className="text-lg font-semibold text-slate-900">Audit Timeline</h4>
              <div className="mt-4 space-y-3">
                {detail.audit?.length ? (
                  detail.audit.map((entry) => (
                    <div key={entry.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${getAuditEventPresentation(entry.eventType).toneClass}`}>
                          {getAuditEventPresentation(entry.eventType).label}
                        </div>
                        <p className="text-xs text-slate-400">{formatDateTime(entry.createdAt)}</p>
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
