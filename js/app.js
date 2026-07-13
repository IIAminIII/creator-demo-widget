import { getRuntimeConfig } from "./config.js";
import { createInvoiceApprovalService } from "./invoiceApprovalService.js";
import { createInvoiceApprovalAiTools } from "./aiTools.js";

const state = {
  service: null,
  runtimeInfo: null,
  aiTools: null,
  aiAssistant: {
    busy: false,
    briefing: null,
    blocker: null,
    escalation: null,
  },
  filters: {
    statusFilter: "All",
    syncFilter: "All",
    paymentFilter: "All",
    priorityFilter: "All",
    reviewerFilter: "All Reviewers",
    searchText: "",
    sortBy: "dueDate",
    sortDirection: "asc",
    page: 1,
    pageSize: 25,
  },
  inboxItems: [],
  summary: {
    total: 0,
    newCount: 0,
    underReviewCount: 0,
    clarificationCount: 0,
    approvedCount: 0,
    rejectedCount: 0,
    highPriorityCount: 0,
  },
  dashboardSummary: {
    approvalSummary: {
      totalInvoices: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
      needsClarification: 0,
    },
    syncSummary: {
      synced: 0,
      notSynced: 0,
      reviewNeeded: 0,
      manualReview: 0,
      failed: 0,
    },
    paymentSummary: {
      paid: 0,
      unpaid: 0,
      partiallyPaid: 0,
      overdue: 0,
      unknown: 0,
    },
    agingSummary: {
      dueSoon: 0,
      overdueDueDate: 0,
    },
    amountSummary: {
      pendingAmount: 0,
      approvedAmount: 0,
      reviewAmount: 0,
    },
    prioritySummary: {
      urgent: 0,
      high: 0,
    },
    generatedAt: "",
  },
  reviewerWorkload: [],
  selectedRecordId: "",
  selectedDetail: null,
  loadingInbox: false,
  loadingDetail: false,
  busyAction: false,
  inboxError: null,
  detailError: null,
  config: null,
  autoRefreshTimer: null,
  autoRefreshInFlight: false,
  guardrailCheck: null,
};

const STATUS_TABS = [
  "Pending",
  "Review Needed",
  "Manual Review",
  "Failed",
  "Approved",
  "Rejected",
  "All",
];

const SYNC_FILTERS = [
  "All",
  "Synced",
  "Review Needed",
  "Manual Review",
  "Failed",
  "Difference Found",
];
const PAYMENT_FILTERS = ["All", "Paid", "Unpaid", "Partially Paid", "Overdue"];
const PRIORITY_FILTERS = ["All", "Urgent", "High", "Medium", "Low"];
const REVIEWER_FILTER_DEFAULT = "All Reviewers";
const SORT_OPTIONS = [
  { value: "dueDate:asc", label: "Due date: soonest" },
  { value: "dueDate:desc", label: "Due date: latest" },
  { value: "invoiceTotal:desc", label: "Invoice total: high to low" },
  { value: "invoiceTotal:asc", label: "Invoice total: low to high" },
  { value: "invoiceNumber:asc", label: "Invoice number: A to Z" },
  { value: "customerName:asc", label: "Customer: A to Z" },
];

const elements = {};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatCurrency(amount, currencyCode) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode || "USD",
    maximumFractionDigits: 0,
  }).format(Number(amount || 0));
}

function formatSummaryAmount(amount, currencyCode = "USD") {
  return formatCurrency(amount, currencyCode);
}

function formatDate(value) {
  if (!value) {
    return "Not available";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

function formatShortDate(value) {
  if (!value) {
    return "No date";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString();
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

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
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

function deriveSyncCheck(approval = {}) {
  const differenceFound = normalizeDifferenceFound(
    approval.differenceFound,
    approval.differenceSummary || "",
  );
  const differenceLabel =
    differenceFound === true
      ? "Difference Found"
      : differenceFound === false
        ? "No Difference"
        : "Manual Review";

  return {
    status:
      normalizeText(approval.syncStatus) ||
      (differenceFound === true
        ? "Difference Found"
        : differenceFound === false
          ? "Synced"
          : "Manual Review"),
    lastBooksSyncAt: approval.lastBooksSyncAt || "",
    lastComparedAt: approval.lastComparedAt || "",
    differenceLabel,
    differenceSummary:
      normalizeText(approval.differenceSummary) ||
      (differenceFound === true
        ? "Difference Found"
        : differenceFound === false
          ? "No Difference"
          : "Not compared yet"),
  };
}

function deriveGuardrailCheck(detail, validation = null) {
  const approval = detail?.approval || {};
  const invoice = detail?.invoice || {};
  const differenceFound =
    validation?.differenceFound ??
    normalizeDifferenceFound(
      approval.booksSyncDifferenceFound ??
        approval.booksSnapshotDifferenceFound ??
        approval.differenceFound,
      approval.differenceSummary || "",
    );
  const blockingReasons = Array.isArray(validation?.blockingReasons)
    ? validation.blockingReasons.filter((reason) => normalizeText(reason))
    : [];
  const warningReasons = Array.isArray(validation?.warningReasons)
    ? validation.warningReasons.filter((reason) => normalizeText(reason))
    : [];
  const canApprove =
    typeof validation?.canApprove === "boolean"
      ? validation.canApprove
      : blockingReasons.length === 0;
  const resultLabel = !validation
    ? "Not Checked"
    : !canApprove
      ? "Blocked"
      : warningReasons.length
        ? "Manual Review"
        : "Safe to Approve";

  return {
    approvalStatus: validation?.approvalStatus || approval.approvalStatus || "Unknown",
    syncStatus: validation?.syncStatus || approval.syncStatus || "Unknown",
    booksPaymentStatus:
      validation?.booksPaymentStatus || invoice.paymentStatus || "Unknown",
    differenceLabel:
      differenceFound === true
        ? "Difference Found"
        : differenceFound === false
          ? "No Difference"
          : "Manual Review",
    lastBooksSyncAt: validation?.lastBooksSyncAt || approval.lastBooksSyncAt || "",
    lastComparedAt: validation?.lastComparedAt || approval.lastComparedAt || "",
    resultLabel,
    message:
      validation?.message ||
      "Checks whether this invoice is safe to approve based on Books refresh, payment status, and difference result.",
    blockingReasons,
    warningReasons,
  };
}

function getAuditEventPresentation(eventType = "") {
  const normalized = normalizeText(eventType).toLowerCase();

  if (normalized === "approved") {
    return { label: "Invoice Approved", badgeClass: "audit-success" };
  }

  if (normalized === "rejected") {
    return { label: "Invoice Rejected", badgeClass: "audit-danger" };
  }

  if (
    normalized === "clarification requested" ||
    normalized === "needs clarification"
  ) {
    return { label: "Clarification Requested", badgeClass: "audit-warning" };
  }

  if (normalized === "comment added") {
    return { label: "Comment Added", badgeClass: "audit-neutral" };
  }

  if (normalized === "books refreshed" || normalized === "books refresh") {
    return { label: "Books Snapshot Refreshed", badgeClass: "audit-info" };
  }

  if (normalized === "sync error" || normalized === "books refresh failed") {
    return { label: "Books Refresh Failed", badgeClass: "audit-danger" };
  }

  if (normalized === "status changed") {
    return { label: "Workflow Status Changed", badgeClass: "audit-neutral" };
  }

  return { label: eventType || "Activity", badgeClass: "audit-neutral" };
}

function deriveReviewerDecisionSummary(detail) {
  const approval = detail?.approval || {};
  const latestAudit = Array.isArray(detail?.audit) && detail.audit.length
    ? detail.audit[0]
    : null;

  return {
    approvalStatus: approval.approvalStatus || "Unknown",
    reviewerNotes: approval.reviewerNotes || "No reviewer notes yet.",
    approvalDecisionDate: approval.approvalDecisionDate || "",
    exceptionReason: approval.exceptionReason || "None",
    lastActionBy: approval.lastActionBy || latestAudit?.actor || "Not available",
    lastActionDate: approval.lastActionDate || latestAudit?.eventDate || "",
    lastEventType: approval.lastEventType || latestAudit?.eventType || "Not available",
  };
}

function deriveApprovalChecklist(guardrail) {
  const syncStatus = normalizeText(guardrail.syncStatus).toLowerCase();
  const paymentStatus = normalizeText(guardrail.booksPaymentStatus).toLowerCase();
  const hasFreshSync = Boolean(guardrail.lastBooksSyncAt);
  const hasCompared = Boolean(guardrail.lastComparedAt);
  const noDifference = guardrail.differenceLabel === "No Difference";
  const differenceFound = guardrail.differenceLabel === "Difference Found";
  const syncFailed = syncStatus.includes("failed");
  const manualReview = syncStatus.includes("manual") || syncStatus.includes("warning");
  const paymentNeedsReview = paymentStatus.includes("paid");

  return [
    {
      label: "Books snapshot refreshed",
      checked: hasFreshSync,
      tone: hasFreshSync ? "done" : "missing",
      helper: hasFreshSync
        ? `Last sync ${formatDate(guardrail.lastBooksSyncAt)}`
        : "Refresh from Books before approval.",
    },
    {
      label: "Snapshot compared with Creator record",
      checked: hasCompared,
      tone: hasCompared ? "done" : "missing",
      helper: hasCompared
        ? `Compared ${formatDate(guardrail.lastComparedAt)}`
        : "Comparison timestamp is missing.",
    },
    {
      label: noDifference
        ? "Books and Creator records match"
        : "Books vs Creator difference reviewed",
      checked: noDifference,
      tone: noDifference ? "done" : differenceFound ? "missing" : "warning",
      helper: noDifference
        ? "No reconciliation difference was detected."
        : differenceFound
          ? normalizeText(guardrail.message) ||
            "A mismatch was found between the latest Books invoice and the Creator approval snapshot. Refresh, compare the changed fields, and update the workflow decision only after review."
          : "Comparison result still needs reviewer confirmation.",
    },
    {
      label: "Books refresh status is healthy",
      checked: !syncFailed,
      tone: syncFailed ? "missing" : manualReview ? "warning" : "done",
      helper: syncFailed
        ? "Latest Books refresh failed."
        : manualReview
          ? "Manual review is still recommended."
          : "Sync status looks healthy.",
    },
    {
      label: "Payment status is safe for approval",
      checked: !paymentNeedsReview,
      tone: paymentNeedsReview ? "warning" : "done",
      helper: paymentNeedsReview
        ? "Books already shows paid or partial payment activity."
        : "No payment warning detected in Books.",
    },
  ];
}

function statusClass(label) {
  return `status-${String(label).toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}`;
}

function toneClass(label) {
  const normalized = normalizeText(label).toLowerCase();

  if (
    normalized.includes("approved") ||
    normalized.includes("synced") ||
    normalized === "paid"
  ) {
    return "tone-success";
  }

  if (normalized.includes("rejected") || normalized.includes("failed")) {
    return "tone-danger";
  }

  if (
    normalized.includes("clarification") ||
    normalized.includes("review needed") ||
    normalized.includes("manual review") ||
    normalized.includes("difference found") ||
    normalized.includes("overdue") ||
    normalized.includes("under review") ||
    normalized.includes("unpaid") ||
    normalized.includes("partially paid")
  ) {
    return "tone-warning";
  }

  return "tone-neutral";
}

function renderBadge(label, className) {
  return `<span class="badge ${className}">${escapeHtml(label)}</span>`;
}

function isOverdueInvoice(item) {
  if (!item?.dueDate) {
    return false;
  }

  const parsed = new Date(item.dueDate);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  const status = normalizeText(item.approvalStatus).toLowerCase();
  return !["approved", "rejected"].includes(status) && parsed.getTime() < Date.now();
}

function formatFilterCount(statusFilter) {
  return state.inboxItems.filter((item) => {
    switch (statusFilter) {
      case "Pending":
        return ["pending review", "new"].includes(
          normalizeText(item.approvalStatus).toLowerCase(),
        );
      case "Review Needed":
        return ["under review", "needs clarification"].includes(
          normalizeText(item.approvalStatus).toLowerCase(),
        );
      case "Manual Review":
        return (
          normalizeText(item.syncStatus).toLowerCase().includes("manual") ||
          normalizeText(item.syncStatus).toLowerCase().includes("warning") ||
          item.differenceFound === true
        );
      case "Failed":
        return normalizeText(item.syncStatus).toLowerCase().includes("failed");
      case "Approved":
      case "Rejected":
        return item.approvalStatus === statusFilter;
      case "All":
      default:
        return true;
    }
  }).length;
}

function getInboxEmptyState() {
  if (normalizeText(state.filters.searchText)) {
    return {
      title: "No invoices found for this search.",
      message: "Try a broader search term or clear the search box.",
    };
  }

  if (
    state.filters.statusFilter === "Pending" &&
    state.filters.syncFilter === "All" &&
    state.filters.paymentFilter === "All" &&
    state.filters.priorityFilter === "All"
  ) {
    return {
      title: "No pending invoices right now.",
      message: "The pending queue is clear at the moment.",
    };
  }

  return {
    title: "No invoices match the selected filters.",
    message: "Adjust the current filters or reset them to broaden the inbox.",
  };
}

function applyDashboardFilters(nextFilterValues = {}) {
  state.filters = {
    ...state.filters,
    statusFilter: "All",
    syncFilter: "All",
    paymentFilter: "All",
    priorityFilter: "All",
    reviewerFilter: REVIEWER_FILTER_DEFAULT,
    ...nextFilterValues,
    page: 1,
  };
  syncToolbarInputs();
  return loadInbox({ preserveSelectedRecordId: state.selectedRecordId }).then(() =>
    loadDetail(state.selectedRecordId),
  );
}

function removeToast(toast) {
  toast?.remove();
}

function showToast(message, type = "success", options = {}) {
  const toast = document.createElement("div");
  const title = options.title ? `<div class="toast-title">${escapeHtml(options.title)}</div>` : "";
  const details = Array.isArray(options.details) && options.details.length
    ? `
      <div class="toast-list">
        ${options.details
          .map((detail) => `<div class="toast-list-item">${escapeHtml(detail)}</div>`)
          .join("")}
      </div>
    `
    : "";
  const actions = Array.isArray(options.actions) && options.actions.length
    ? `
      <div class="toast-actions">
        ${options.actions
          .map(
            (action, index) => `
              <button
                type="button"
                class="toast-action ${escapeHtml(action.variant || "secondary")}"
                data-toast-action="${index}"
              >
                ${escapeHtml(action.label)}
              </button>
            `,
          )
          .join("")}
      </div>
    `
    : "";

  toast.className = `toast ${type}`;
  toast.innerHTML = `
    ${title}
    <div class="toast-message">${escapeHtml(message)}</div>
    ${details}
    ${actions}
  `;
  elements.toastRegion.appendChild(toast);

  if (options.actions?.length) {
    toast.querySelectorAll("[data-toast-action]").forEach((button) => {
      button.addEventListener("click", () => {
        const actionIndex = Number(button.getAttribute("data-toast-action"));
        const action = options.actions[actionIndex];
        action?.onClick?.();
        removeToast(toast);
      });
    });
    return toast;
  }

  const autoCloseMs =
    Number.isFinite(options.autoCloseMs) && options.autoCloseMs >= 0
      ? options.autoCloseMs
      : 3200;

  window.setTimeout(() => {
    removeToast(toast);
  }, autoCloseMs);

  return toast;
}

function showApprovalConfirmationToast(validation) {
  return new Promise((resolve) => {
    let settled = false;
    const complete = (value, toast) => {
      if (settled) {
        return;
      }
      settled = true;
      removeToast(toast);
      resolve(value);
    };

    const toast = showToast(
      validation.message || "Approval can continue, but reviewer confirmation is recommended.",
      "warning",
      {
        title: "Approval Warning",
        details: [
          ...(validation.warningReasons || []),
          "Continue with approval?",
        ],
        autoCloseMs: 0,
        actions: [
          {
            label: "Continue",
            variant: "primary",
            onClick: () => complete(true, toast),
          },
          {
            label: "Cancel",
            variant: "secondary",
            onClick: () => complete(false, toast),
          },
        ],
      },
    );
  });
}

function getReviewerFallback() {
  return state.config?.currentReviewerName?.trim() || "Reviewer";
}

function renderRetryButton(buttonId, label) {
  return `<button type="button" class="secondary-button" id="${buttonId}">${escapeHtml(
    label,
  )}</button>`;
}

function renderAssistantInvoiceList(items = [], emptyMessage) {
  if (!items.length) {
    return `<div class="section-hint">${escapeHtml(emptyMessage)}</div>`;
  }

  return `
    <div class="assistant-list">
      ${items
        .slice(0, 5)
        .map(
          (item) => `
            <div class="assistant-list-item">
              <strong>${escapeHtml(item.invoiceNumber || item.approvalRecordId)}</strong>
              <span>${escapeHtml(item.customerName || "Unknown customer")}</span>
              <span>${escapeHtml(item.syncStatus || item.approvalStatus || "Needs review")}</span>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderAiAssistantPanel() {
  const { briefing, blocker, escalation, busy } = state.aiAssistant;

  return `
    <article class="detail-card action-card">
      <div class="section-tag tag-creator">AI Operations Assistant</div>
      <h3>AI Operations Assistant</h3>
      <p>
        Use structured workflow tools to summarize, investigate, and safely prepare invoice approval actions.
      </p>
      <div class="action-buttons">
        <button type="button" class="secondary-button" id="assistant-briefing-button" ${busy ? "disabled" : ""}>
          Generate Daily Briefing
        </button>
        <button type="button" class="secondary-button" id="assistant-blockers-button" ${busy || !state.selectedRecordId ? "disabled" : ""}>
          Explain Selected Invoice Blockers
        </button>
        <button type="button" class="secondary-button" id="assistant-escalation-button" ${busy ? "disabled" : ""}>
          Prepare Escalation Briefing
        </button>
      </div>
      ${
        briefing
          ? `
            <div class="mini-card">
              <div class="mini-label">Daily Briefing</div>
              <div class="assistant-copy">${escapeHtml(briefing.summaryText)}</div>
              <div class="assistant-bullets">
                ${briefing.attentionItems
                  .map((item) => `<div>${escapeHtml(item)}</div>`)
                  .join("")}
              </div>
            </div>
            <div class="mini-card">
              <div class="mini-label">Failed Refreshes</div>
              ${renderAssistantInvoiceList(
                briefing.failedRefreshes || [],
                "No failed refreshes are currently queued.",
              )}
            </div>
          `
          : ""
      }
      ${
        blocker
          ? `
            <div class="mini-card">
              <div class="mini-label">Selected Invoice Blockers</div>
              <div class="assistant-copy">${escapeHtml(blocker.explanation)}</div>
              <div class="assistant-bullets">
                <div>Invoice ${escapeHtml(blocker.invoiceNumber)}</div>
                <div>Sync ${escapeHtml(blocker.syncStatus || "Unknown")}</div>
                <div>Payment ${escapeHtml(blocker.paymentStatus || "Unknown")}</div>
                <div>Difference ${escapeHtml(blocker.differenceSummary || "No difference summary available.")}</div>
              </div>
            </div>
          `
          : ""
      }
      ${
        escalation
          ? `
            <div class="mini-card">
              <div class="mini-label">Escalation Briefing</div>
              <div class="assistant-copy">${escapeHtml(escalation.summaryText)}</div>
            </div>
            <div class="mini-card">
              <div class="mini-label">Due Soon</div>
              ${renderAssistantInvoiceList(
                escalation.dueSoon || [],
                "No due-soon invoices need escalation review right now.",
              )}
            </div>
            <div class="mini-card">
              <div class="mini-label">Escalated</div>
              ${renderAssistantInvoiceList(
                escalation.escalated || [],
                "No escalated invoices are currently flagged.",
              )}
            </div>
          `
          : ""
      }
    </article>
  `;
}

function getErrorMessage(error, fallbackMessage) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallbackMessage;
}

function renderKpis() {
  const dashboard = state.dashboardSummary;
  const currencyCode =
    state.selectedDetail?.invoice?.currencyCode ||
    state.inboxItems[0]?.currencyCode ||
    "USD";
  const cards = [
    {
      label: "Pending Approvals",
      value: String(dashboard.approvalSummary.pending),
      helper: "Invoices waiting for reviewer pickup.",
      className: "kpi-info",
      filter: { statusFilter: "Pending" },
    },
    {
      label: "Review Needed",
      value: String(dashboard.syncSummary.reviewNeeded),
      helper: "Records still needing active reviewer attention.",
      className: "kpi-warning",
      filter: { syncFilter: "Review Needed" },
    },
    {
      label: "Manual Review",
      value: String(dashboard.syncSummary.manualReview),
      helper: "Books sync or difference checks need manual confirmation.",
      className: "kpi-warning",
      filter: { syncFilter: "Manual Review" },
    },
    {
      label: "Failed Refresh",
      value: String(dashboard.syncSummary.failed),
      helper: "Books refresh attempts that need another pass.",
      className: "kpi-danger",
      filter: { syncFilter: "Failed" },
    },
    {
      label: "Due Soon",
      value: String(dashboard.agingSummary.dueSoon),
      helper: "Open invoices due within the next 3 days.",
      className: "kpi-info",
      filter: { statusFilter: "Pending", sortBy: "dueDate", sortDirection: "asc" },
    },
    {
      label: "Overdue",
      value: String(dashboard.agingSummary.overdueDueDate),
      helper: "Invoices with due dates already past.",
      className: "kpi-danger",
      filter: { paymentFilter: "Overdue" },
    },
    {
      label: "Pending Amount",
      value: formatSummaryAmount(dashboard.amountSummary.pendingAmount, currencyCode),
      helper: "Current amount still blocked in the approval queue.",
      className: "kpi-neutral",
      filter: { statusFilter: "Pending" },
    },
    {
      label: "High Priority",
      value: String(dashboard.prioritySummary.high),
      helper: "Urgent and high-priority invoices needing attention.",
      className: "kpi-warning",
      filter: { priorityFilter: "High" },
    },
  ];

  elements.kpiGrid.innerHTML = cards
    .map(
      (card) => `
        <button type="button" class="kpi-card ${card.className || ""}" data-kpi-filter='${escapeHtml(
          JSON.stringify(card.filter || {}),
        )}'>
          <div class="kpi-label">${escapeHtml(card.label)}</div>
          <div class="kpi-value">${escapeHtml(card.value)}</div>
          <div class="kpi-helper">${escapeHtml(card.helper)}</div>
        </button>
      `,
    )
    .join("");

  elements.kpiGrid.querySelectorAll("[data-kpi-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      const filterJson = button.getAttribute("data-kpi-filter");
      if (!filterJson) {
        return;
      }

      try {
        void applyDashboardFilters(JSON.parse(filterJson));
      } catch (error) {
        console.warn("Dashboard filter parse failed:", error);
      }
    });
  });
}

function getReviewerFilterOptions() {
  const options = [
    { value: REVIEWER_FILTER_DEFAULT, label: REVIEWER_FILTER_DEFAULT },
    { value: "Unassigned", label: "Unassigned" },
  ];
  const seen = new Set();

  state.reviewerWorkload.forEach((entry) => {
    const email = normalizeText(entry.reviewerEmail);
    if (!email || seen.has(email)) {
      return;
    }
    seen.add(email);
    options.push({
      value: email,
      label: `${entry.reviewerName || email} (${email})`,
    });
  });

  return options;
}

function renderReviewerWorkload() {
  if (!elements.reviewerWorkload) {
    return;
  }

  const rows = state.reviewerWorkload.length
    ? state.reviewerWorkload
        .map(
          (entry) => `
            <tr>
              <td>${escapeHtml(entry.reviewerName || "Unassigned")}</td>
              <td>${escapeHtml(entry.reviewerEmail || "Not available")}</td>
              <td>${escapeHtml(entry.assignedCount)}</td>
              <td>${escapeHtml(entry.pendingCount)}</td>
              <td>${escapeHtml(entry.needsClarificationCount)}</td>
              <td>${escapeHtml(
                formatSummaryAmount(
                  entry.reviewAmount,
                  state.selectedDetail?.invoice?.currencyCode ||
                    state.inboxItems[0]?.currencyCode ||
                    "USD",
                ),
              )}</td>
              <td>${escapeHtml(entry.unassignedCount)}</td>
            </tr>
          `,
        )
        .join("")
    : `
      <tr>
        <td colspan="7">No reviewer workload data is available yet.</td>
      </tr>
    `;

  elements.reviewerWorkload.innerHTML = `
    <div class="table-wrap">
      <table class="snapshot-table">
        <thead>
          <tr>
            <th>Reviewer</th>
            <th>Email</th>
            <th>Assigned</th>
            <th>Pending</th>
            <th>Needs Clarification</th>
            <th>Review Amount</th>
            <th>Unassigned</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderToolbarSummary() {
  const tabs = STATUS_TABS.map(
    (status) => `
      <button
        type="button"
        class="summary-chip summary-tab ${state.filters.statusFilter === status ? "active" : ""}"
        data-status-tab="${escapeHtml(status)}"
      >
        ${escapeHtml(status)} ${formatFilterCount(status)}
      </button>
    `,
  ).join("");

  const chips = [
    `Pending ${state.summary.newCount}`,
    `Review Needed ${state.summary.underReviewCount}`,
    `Manual Review ${state.summary.clarificationCount}`,
    `Approved ${state.summary.approvedCount}`,
    `Rejected ${state.summary.rejectedCount}`,
  ]
    .map((chip) => `<span class="summary-chip">${escapeHtml(chip)}</span>`)
    .join("");

  elements.toolbarSummary.innerHTML = `
    <div class="tab-row">${tabs}</div>
    <div class="summary-chip-row">${chips}</div>
  `;

  elements.toolbarSummary.querySelectorAll("[data-status-tab]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.filters.statusFilter = button.getAttribute("data-status-tab") || "All";
      syncToolbarInputs();
      await loadInbox({ preserveSelectedRecordId: state.selectedRecordId });
      await loadDetail(state.selectedRecordId);
    });
  });
}

function toInboxItemFromDetail(detail) {
  if (!detail?.invoice || !detail?.approval) {
    return null;
  }

  return {
    approvalRecordId: detail.approvalRecordId || "",
    booksInvoiceId: detail.invoice.booksInvoiceId || "",
    invoiceNumber: detail.invoice.invoiceNumber || "",
    customerName: detail.invoice.customerName || "",
    invoiceTotal: Number(detail.invoice.invoiceTotal || 0),
    currencyCode: detail.invoice.currencyCode || "USD",
    dueDate: detail.invoice.dueDate || "",
    booksStatus: detail.invoice.booksStatus || "Unknown",
    paymentStatus: detail.invoice.paymentStatus || "Unknown",
    approvalStatus: detail.approval.approvalStatus || "Pending Review",
    priority: detail.approval.priority || "Medium",
    crmAccountName: detail.crmContext?.crmAccountName || detail.invoice.crmAccountName || "",
    crmDealName: detail.crmContext?.crmDealName || "",
    syncStatus: detail.approval.syncStatus || "Unknown",
    differenceFound: detail.approval.differenceFound === true,
  };
}

function syncInboxItemFromDetail(detail) {
  const nextItem = toInboxItemFromDetail(detail);
  if (!nextItem?.approvalRecordId) {
    return;
  }

  const index = state.inboxItems.findIndex(
    (item) => item.approvalRecordId === nextItem.approvalRecordId,
  );

  if (index === -1) {
    return;
  }

  state.inboxItems[index] = {
    ...state.inboxItems[index],
    ...nextItem,
  };
}

function renderInbox() {
  if (state.loadingInbox) {
    elements.inboxList.classList.remove("scrollable");
    elements.inboxList.innerHTML =
      '<div class="loading-state">Loading invoice inbox...</div>';
    return;
  }

  if (state.inboxError && !state.inboxItems.length) {
    elements.inboxList.classList.remove("scrollable");
    elements.inboxList.innerHTML = `
      <div class="empty-state">
        <h3>Inbox refresh failed</h3>
        <p>${escapeHtml(
          getErrorMessage(state.inboxError, "Failed to load the invoice inbox."),
        )}</p>
        <div class="action-buttons">
          ${renderRetryButton("retry-inbox-button", "Retry inbox")}
        </div>
      </div>
    `;
    wireInboxRetryButton();
    return;
  }

  if (!state.inboxItems.length) {
    const emptyState = getInboxEmptyState();
    elements.inboxList.classList.remove("scrollable");
    elements.inboxList.innerHTML = `
      <div class="empty-state">
        <h3>${escapeHtml(emptyState.title)}</h3>
        <p>${escapeHtml(emptyState.message)}</p>
    </div>
  `;
    return;
  }

  const inboxErrorMarkup = state.inboxError
    ? `
      <div class="section-hint">
        ${escapeHtml(
          getErrorMessage(state.inboxError, "Failed to refresh the invoice inbox."),
        )}
        <div class="action-buttons">
          ${renderRetryButton("retry-inbox-button", "Retry inbox")}
        </div>
      </div>
    `
    : "";

  elements.inboxList.classList.toggle("scrollable", state.inboxItems.length > 6);
  elements.inboxList.innerHTML = `
    ${inboxErrorMarkup}
    ${state.inboxItems
    .map((item) => {
      const activeClass =
        item.approvalRecordId === state.selectedRecordId ? "active" : "";
      const overdue = isOverdueInvoice(item);
      return `
        <button
          type="button"
          class="inbox-item ${activeClass}"
          data-record-id="${escapeHtml(item.approvalRecordId)}"
        >
          <div class="inbox-topline">
            <div>
              <p class="inbox-title">${escapeHtml(item.invoiceNumber)}</p>
              <div class="badge-row">
                ${renderBadge(item.approvalStatus, toneClass(item.approvalStatus))}
                ${renderBadge(item.syncStatus || "Unknown", toneClass(item.syncStatus))}
                ${renderBadge(item.paymentStatus || "Unknown", toneClass(item.paymentStatus))}
                ${renderBadge(item.priority, toneClass(item.priority))}
                ${item.differenceFound ? renderBadge("Difference Found", "tone-warning") : ""}
                ${overdue ? renderBadge("Overdue", "tone-warning") : ""}
              </div>
            </div>
            <div class="amount">${escapeHtml(
              formatCurrency(item.invoiceTotal, item.currencyCode),
            )}</div>
          </div>
          <div class="meta-row">
            <span>${escapeHtml(item.customerName || "Not available")}</span>
            <span>Due ${escapeHtml(formatShortDate(item.dueDate))}</span>
            <span>${escapeHtml(item.crmDealName || "No deal linked")}</span>
          </div>
          <div class="meta-row">
            <span>Account ${escapeHtml(item.crmAccountName || "Not linked yet")}</span>
            <span>Approval ID ${escapeHtml(item.approvalRecordId)}</span>
          </div>
        </button>
      `;
    })
    .join("")}
  `;

  elements.inboxList
    .querySelectorAll("[data-record-id]")
    .forEach((button) =>
      button.addEventListener("click", () => {
        const nextId = button.getAttribute("data-record-id");
        if (nextId && nextId !== state.selectedRecordId) {
          state.selectedRecordId = nextId;
          renderInbox();
          void loadDetail(nextId);
        }
      }),
    );

  wireInboxRetryButton();
}

function renderDetail() {
  if (state.loadingDetail) {
    elements.detailRoot.innerHTML =
      '<div class="loading-state">Loading invoice detail...</div>';
    return;
  }

  if (state.detailError && !state.selectedDetail) {
    elements.detailRoot.innerHTML = `
      <div class="empty-state">
        <h3>Detail refresh failed</h3>
        <p>${escapeHtml(
          getErrorMessage(state.detailError, "Failed to load invoice detail."),
        )}</p>
        <div class="action-buttons">
          ${renderRetryButton("retry-detail-button", "Retry detail")}
        </div>
      </div>
    `;
    wireDetailRetryButton();
    return;
  }

  if (!state.selectedDetail) {
    elements.detailRoot.innerHTML = `
      <div class="empty-state">
        <h3>Select an invoice to review</h3>
        <p>The right panel will show Books snapshot data, CRM context, Creator workflow controls, comments, and audit history.</p>
      </div>
    `;
    return;
  }

  const detail = state.selectedDetail;
  const invoice = detail.invoice;
  const approval = detail.approval;
  const crm = detail.crmContext;
  const syncCheck = deriveSyncCheck(approval);
  const guardrail = deriveGuardrailCheck(detail, state.guardrailCheck);
  const reviewerDecision = deriveReviewerDecisionSummary(detail);
  const approvalChecklist = deriveApprovalChecklist(guardrail);
  const detailErrorMarkup = state.detailError
    ? `
      <div class="section-hint">
        ${escapeHtml(
          getErrorMessage(state.detailError, "Failed to refresh invoice detail."),
        )}
        <div class="action-buttons">
          ${renderRetryButton("retry-detail-button", "Retry detail")}
        </div>
      </div>
    `
    : "";

  const lineRows = detail.lineItems.length
    ? detail.lineItems
        .map(
          (line) => `
            <tr>
              <td>${escapeHtml(line.name || "Item")}</td>
              <td>${escapeHtml(line.description)}</td>
              <td>${escapeHtml(line.quantity)}</td>
              <td>${escapeHtml(
                formatCurrency(line.rate, invoice.currencyCode),
              )}</td>
              <td>${escapeHtml(
                formatCurrency(line.discount, invoice.currencyCode),
              )}</td>
              <td>${escapeHtml(formatLineItemTax(line))}</td>
              <td>${escapeHtml(
                formatCurrency(line.total, invoice.currencyCode),
              )}</td>
            </tr>
          `,
        )
        .join("")
    : `
      <tr>
        <td colspan="7">No line items found for this invoice.</td>
      </tr>
    `;

  const commentsMarkup = detail.comments.length
    ? detail.comments
        .map(
          (comment) => `
            <article class="comment-item">
              <div class="comment-topline">
                <div class="comment-author">${escapeHtml(comment.addedBy)}</div>
                <div class="comment-date">${escapeHtml(
                  formatDate(comment.addedDate),
                )}</div>
              </div>
              <div class="comment-type">${escapeHtml(comment.commentType)}</div>
              <div class="comment-body">${escapeHtml(comment.comment)}</div>
            </article>
          `,
        )
        .join("")
    : '<div class="section-hint">No reviewer comments yet.</div>';

  const auditMarkup = detail.audit.length
    ? detail.audit
        .map(
          (entry) => {
            const eventPresentation = getAuditEventPresentation(entry.eventType);
            return `
            <article class="audit-item">
              <div class="timeline-topline">
                <div class="badge ${eventPresentation.badgeClass}">${escapeHtml(
                  eventPresentation.label,
                )}</div>
                <div class="timeline-date">${escapeHtml(
                  formatDate(entry.eventDate),
                )}</div>
              </div>
              <div class="timeline-text">${escapeHtml(entry.eventMessage)}</div>
              <div class="meta-row">
                <span>Actor ${escapeHtml(entry.actor)}</span>
                <span>Prev ${escapeHtml(entry.previousStatus || "-")}</span>
                <span>New ${escapeHtml(entry.newStatus || "-")}</span>
                <span>${escapeHtml(entry.externalSystem || "Creator")}</span>
              </div>
            </article>
          `;
          },
        )
        .join("")
    : '<div class="section-hint">No audit entries recorded yet.</div>';

  elements.detailRoot.innerHTML = `
    <section class="detail-hero">
      <div class="detail-header">
        <div>
          <div class="badge-row">
            ${renderBadge(approval.approvalStatus, statusClass(approval.approvalStatus))}
            ${renderBadge(invoice.booksStatus || "Unknown", "source-books")}
            ${renderBadge(invoice.paymentStatus || "Unknown", "source-books")}
            ${renderBadge("Creator Workflow", "source-creator")}
          </div>
          <h2>${escapeHtml(invoice.invoiceNumber)}</h2>
          <p>
            Review the read-only Books snapshot, inspect CRM context, then update
            the Creator approval workflow with comments and an audit-safe action.
          </p>
          <div class="detail-id">Approval record ${escapeHtml(
            detail.approvalRecordId,
          )}</div>
        </div>
        <div class="hero-actions">
          <button type="button" class="secondary-button" id="refresh-detail-button">
            Refresh from Books
          </button>
        </div>
      </div>
    </section>

    ${detailErrorMarkup}

    <section class="detail-grid">
      <article class="detail-card">
        <div class="section-tag tag-books">Books Snapshot</div>
        <h3>Invoice Line Items</h3>
        <p>Items and charges pulled from the linked Zoho Books invoice.</p>
        <div class="triple-grid">
          <div class="mini-card">
            <div class="mini-label">Customer</div>
            <div class="mini-value">${escapeHtml(invoice.customerName || "Not available")}</div>
          </div>
          <div class="mini-card">
            <div class="mini-label">Invoice total</div>
            <div class="mini-value">${escapeHtml(
              formatCurrency(invoice.invoiceTotal, invoice.currencyCode),
            )}</div>
          </div>
          <div class="mini-card">
            <div class="mini-label">Due date</div>
            <div class="mini-value">${escapeHtml(formatShortDate(invoice.dueDate))}</div>
          </div>
        </div>
        <div class="line-items-table-wrap">
        <table class="snapshot-table line-items-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Description</th>
              <th>Qty</th>
              <th>Rate</th>
              <th>Discount</th>
              <th>Tax</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>${lineRows}</tbody>
        </table>
        </div>
        <div class="meta-row">
          <span>Books invoice ID ${escapeHtml(invoice.booksInvoiceId)}</span>
          <span>Invoice date ${escapeHtml(formatShortDate(invoice.invoiceDate))}</span>
          <span>Last sync ${escapeHtml(formatDate(approval.lastBooksSyncAt))}</span>
        </div>
      </article>

      <article class="detail-card action-card">
        <div class="section-tag tag-creator">Reviewer Decision Summary</div>
        <h3>Reviewer Decision Summary</h3>
        <div class="meta-grid">
          <div class="mini-card">
            <div class="mini-label">Current Approval Status</div>
            <div class="mini-value">${escapeHtml(reviewerDecision.approvalStatus)}</div>
          </div>
          <div class="mini-card">
            <div class="mini-label">Reviewer Notes</div>
            <div class="mini-value">${escapeHtml(reviewerDecision.reviewerNotes)}</div>
          </div>
          <div class="mini-card">
            <div class="mini-label">Approval Decision Date</div>
            <div class="mini-value">${escapeHtml(
              formatDate(reviewerDecision.approvalDecisionDate),
            )}</div>
          </div>
          <div class="mini-card">
            <div class="mini-label">Exception Reason</div>
            <div class="mini-value">${escapeHtml(reviewerDecision.exceptionReason)}</div>
          </div>
          <div class="mini-card">
            <div class="mini-label">Last Action By</div>
            <div class="mini-value">${escapeHtml(reviewerDecision.lastActionBy)}</div>
          </div>
          <div class="mini-card">
            <div class="mini-label">Last Action Date</div>
            <div class="mini-value">${escapeHtml(
              formatDate(reviewerDecision.lastActionDate),
            )}</div>
          </div>
        </div>
        <div class="mini-card">
          <div class="mini-label">Last Event Type</div>
          <div class="mini-value">${escapeHtml(
            getAuditEventPresentation(reviewerDecision.lastEventType).label,
          )}</div>
        </div>
      </article>

      <article class="detail-card action-card">
        <div class="section-tag tag-creator">Reviewer Assignment</div>
        <h3>Reviewer Assignment</h3>
        <p>Assign or reassign this invoice to the right reviewer.</p>
        <div class="meta-grid">
          <div class="mini-card">
            <div class="mini-label">Assigned Reviewer</div>
            <div class="mini-value">${escapeHtml(approval.assignedReviewer || "Unassigned")}</div>
          </div>
          <div class="mini-card">
            <div class="mini-label">Reviewer Email</div>
            <div class="mini-value">${escapeHtml(approval.reviewerEmail || "Not available")}</div>
          </div>
          <div class="mini-card">
            <div class="mini-label">Assignment Status</div>
            <div class="mini-value">${escapeHtml(approval.assignmentStatus || "Unassigned")}</div>
          </div>
          <div class="mini-card">
            <div class="mini-label">Assigned Date</div>
            <div class="mini-value">${escapeHtml(formatDate(approval.assignedDate))}</div>
          </div>
        </div>
        <div class="mini-card">
          <div class="mini-label">Assignment Notes</div>
          <div class="mini-value">${escapeHtml(approval.assignmentNote || "No assignment note yet.")}</div>
        </div>
        <div class="action-grid">
          <label>
            <span>Reviewer Name</span>
            <input id="assign-reviewer-name-input" type="text" value="${escapeHtml(
              approval.assignedReviewer || "",
            )}" />
          </label>
          <label>
            <span>Reviewer Email</span>
            <input id="assign-reviewer-email-input" type="email" value="${escapeHtml(
              approval.reviewerEmail || "",
            )}" />
          </label>
        </div>
        <label>
          <span>Assignment Note</span>
          <textarea id="assignment-note-input" placeholder="Why is this reviewer being assigned?">${escapeHtml(
            approval.assignmentNote || "",
          )}</textarea>
        </label>
        <div class="action-buttons">
          <button type="button" class="secondary-button" id="assign-reviewer-button">
            Assign Reviewer
          </button>
        </div>
      </article>

      <article class="detail-card action-card">
        <div class="section-tag tag-creator">Approval Guardrails</div>
        <h3>Approval Guardrails</h3>
        <p>
          Checks whether this invoice is safe to approve based on Books refresh, payment status, and difference result.
        </p>
        <div class="meta-grid">
          <div class="mini-card">
            <div class="mini-label">Approval Status</div>
            <div class="mini-value">${escapeHtml(guardrail.approvalStatus)}</div>
          </div>
          <div class="mini-card">
            <div class="mini-label">Sync Status</div>
            <div class="mini-value">${escapeHtml(guardrail.syncStatus)}</div>
          </div>
          <div class="mini-card">
            <div class="mini-label">Books Payment Status</div>
            <div class="mini-value">${escapeHtml(guardrail.booksPaymentStatus)}</div>
          </div>
          <div class="mini-card">
            <div class="mini-label">Difference Found</div>
            <div class="mini-value">${escapeHtml(guardrail.differenceLabel)}</div>
          </div>
          <div class="mini-card">
            <div class="mini-label">Last Books Sync At</div>
            <div class="mini-value">${escapeHtml(
              formatDate(guardrail.lastBooksSyncAt),
            )}</div>
          </div>
          <div class="mini-card">
            <div class="mini-label">Last Compared At</div>
            <div class="mini-value">${escapeHtml(
              formatDate(guardrail.lastComparedAt),
            )}</div>
          </div>
        </div>
        <div class="mini-card">
          <div class="mini-label">Guardrail Result</div>
          <div class="mini-value">${escapeHtml(guardrail.resultLabel)}</div>
        </div>
        <div class="mini-card">
          <div class="mini-label">Approval Checklist</div>
          <div class="checklist">
            ${approvalChecklist
              .map(
                (item) => `
                  <div class="checklist-item ${item.tone}">
                    <div class="checklist-mark">${item.checked ? "✓" : item.tone === "warning" ? "!" : "○"}</div>
                    <div class="checklist-copy">
                      <div class="checklist-label">${escapeHtml(item.label)}</div>
                      <div class="checklist-helper">${escapeHtml(item.helper)}</div>
                    </div>
                  </div>
                `,
              )
              .join("")}
          </div>
        </div>
        ${
          guardrail.blockingReasons.length
            ? `
              <div class="mini-card">
                <div class="mini-label">Blocking Reasons</div>
                <div class="mini-value">${guardrail.blockingReasons
                  .map((reason) => escapeHtml(reason))
                  .join("<br />")}</div>
              </div>
            `
            : ""
        }
        ${
          guardrail.warningReasons.length
            ? `
              <div class="mini-card">
                <div class="mini-label">Warning Reasons</div>
                <div class="mini-value">${guardrail.warningReasons
                  .map((reason) => escapeHtml(reason))
                  .join("<br />")}</div>
              </div>
            `
            : ""
        }
        <div class="section-hint">${escapeHtml(guardrail.message)}</div>
        <div class="action-buttons">
          <button type="button" class="secondary-button" id="check-approval-safety-button">
            Check Approval Safety
          </button>
        </div>
      </article>

      ${renderAiAssistantPanel()}

      <article class="detail-card action-card">
        <div class="section-tag tag-creator">Creator Workflow</div>
        <h3>Approval controls</h3>
        <div class="action-grid">
          <label>
            <span>Reviewer</span>
            <input id="reviewer-input" type="text" value="${escapeHtml(
              approval.assignedReviewer || state.config.currentReviewerName,
            )}" />
          </label>
          <label>
            <span>Priority</span>
            <input type="text" value="${escapeHtml(approval.priority)}" disabled />
          </label>
        </div>
        <label>
          <span>Comment</span>
          <textarea id="comment-input" placeholder="Approve optionally with a note. Reject and clarification both require a comment.">${escapeHtml(
            approval.reviewerNotes || "",
          )}</textarea>
        </label>
        <label>
          <span>Exception or clarification reason</span>
          <input
            id="exception-input"
            type="text"
            placeholder="Required for rejection or clarification requests"
            value="${escapeHtml(approval.exceptionReason || "")}"
          />
        </label>
        <div class="action-buttons">
          <button type="button" class="primary-button" id="approve-button">
            Approve invoice
          </button>
          <button type="button" class="danger-button" id="reject-button">
            Reject invoice
          </button>
          <button type="button" class="warning-button" id="clarify-button">
            Request clarification
          </button>
          <button type="button" class="ghost-button" id="comment-button">
            Add comment only
          </button>
        </div>
        <div class="meta-row">
          <span>Status ${escapeHtml(approval.approvalStatus)}</span>
          <span>Sync ${escapeHtml(approval.syncStatus || "Unknown")}</span>
          <span>Decision date ${escapeHtml(
            approval.approvalDecisionDate
              ? formatDate(approval.approvalDecisionDate)
              : "Not decided",
          )}</span>
        </div>
      </article>

      <article class="detail-card">
        <div class="section-tag tag-books">Books Sync Check</div>
        <h3>Sync Status</h3>
        <p>
          Compare the Creator approval snapshot with the latest invoice data from Zoho Books.
        </p>
        <div class="meta-grid">
          <div class="mini-card">
            <div class="mini-label">Sync Status</div>
            <div class="mini-value">${escapeHtml(syncCheck.status)}</div>
          </div>
          <div class="mini-card">
            <div class="mini-label">Difference Found</div>
            <div class="mini-value">${escapeHtml(syncCheck.differenceLabel)}</div>
          </div>
          <div class="mini-card">
            <div class="mini-label">Last Books Sync At</div>
            <div class="mini-value">${escapeHtml(
              formatDate(syncCheck.lastBooksSyncAt),
            )}</div>
          </div>
          <div class="mini-card">
            <div class="mini-label">Last Compared At</div>
            <div class="mini-value">${escapeHtml(
              formatDate(syncCheck.lastComparedAt),
            )}</div>
          </div>
        </div>
        <div class="mini-card">
          <div class="mini-label">Difference Summary</div>
          <div class="mini-value">${escapeHtml(syncCheck.differenceSummary)}</div>
        </div>
      </article>

      <article class="detail-card">
        <div class="section-tag tag-crm">CRM Context</div>
        <h3>Read-only commercial context</h3>
        <div class="meta-grid">
          <div class="mini-card">
            <div class="mini-label">Account</div>
            <div class="mini-value">${escapeHtml(crm.crmAccountName || "Not enriched")}</div>
          </div>
          <div class="mini-card">
            <div class="mini-label">Deal</div>
            <div class="mini-value">${escapeHtml(crm.crmDealName || "Not enriched")}</div>
          </div>
          <div class="mini-card">
            <div class="mini-label">Account owner</div>
            <div class="mini-value">${escapeHtml(crm.accountOwner || "Not enriched")}</div>
          </div>
          <div class="mini-card">
            <div class="mini-label">Deal stage</div>
            <div class="mini-value">${escapeHtml(crm.dealStage || "Not enriched")}</div>
          </div>
          <div class="mini-card">
            <div class="mini-label">Risk level</div>
            <div class="mini-value">${escapeHtml(crm.riskLevel || "Unknown")}</div>
          </div>
          <div class="mini-card">
            <div class="mini-label">Last CRM activity</div>
            <div class="mini-value">${escapeHtml(
              formatShortDate(crm.lastActivityDate),
            )}</div>
          </div>
        </div>
        <p class="section-hint">
          CRM remains context-only. Approval actions should still work even if this data is delayed or missing.
        </p>
      </article>

      <article class="detail-card">
        <div class="section-tag tag-creator">Comments</div>
        <h3>Reviewer discussion</h3>
        <div class="comment-list">${commentsMarkup}</div>
      </article>

      <article class="detail-card full-span">
        <div class="section-tag tag-creator">Audit Trail</div>
        <h3>Audit Timeline</h3>
        <div class="audit-list">${auditMarkup}</div>
      </article>
    </section>
    `;

  wireDetailActions();
  wireDetailRetryButton();
}

function wireDetailActions() {
  const reviewerInput = document.getElementById("reviewer-input");
  const commentInput = document.getElementById("comment-input");
  const exceptionInput = document.getElementById("exception-input");
  const assignReviewerNameInput = document.getElementById("assign-reviewer-name-input");
  const assignReviewerEmailInput = document.getElementById("assign-reviewer-email-input");
  const assignmentNoteInput = document.getElementById("assignment-note-input");
  const refreshButton = document.getElementById("refresh-detail-button");
  const checkApprovalSafetyButton = document.getElementById(
    "check-approval-safety-button",
  );
  const assistantBriefingButton = document.getElementById("assistant-briefing-button");
  const assistantBlockersButton = document.getElementById("assistant-blockers-button");
  const assistantEscalationButton = document.getElementById("assistant-escalation-button");
  const assignReviewerButton = document.getElementById("assign-reviewer-button");
  const approveButton = document.getElementById("approve-button");
  const rejectButton = document.getElementById("reject-button");
  const clarifyButton = document.getElementById("clarify-button");
  const commentButton = document.getElementById("comment-button");

  const getPayload = (decision) => ({
    decision,
    reviewer: reviewerInput.value.trim() || getReviewerFallback(),
    comment: commentInput.value.trim(),
    exceptionReason: exceptionInput.value.trim(),
  });

  const runAssistantTask = async (task) => {
    if (!state.aiTools || state.aiAssistant.busy) {
      return;
    }

    state.aiAssistant.busy = true;
    renderDetail();

    try {
      await task();
    } catch (error) {
      showToast(getErrorMessage(error, "AI assistant action failed."), "error");
    } finally {
      state.aiAssistant.busy = false;
      renderDetail();
    }
  };

  assignReviewerButton?.addEventListener("click", async () => {
    if (!state.selectedRecordId || state.busyAction) {
      return;
    }

    const reviewerName = assignReviewerNameInput?.value.trim() || "";
    const reviewerEmail = assignReviewerEmailInput?.value.trim() || "";
    const assignmentNote = assignmentNoteInput?.value.trim() || "";

    if (!reviewerName) {
      showToast("Reviewer name is required before assignment.", "error");
      return;
    }

    state.busyAction = true;

    try {
      state.selectedDetail = await state.service.assignInvoiceReviewer(
        state.selectedRecordId,
        {
          reviewerName,
          reviewerEmail,
          assignmentNote,
        },
      );
      await loadInbox({ preserveSelectedRecordId: state.selectedRecordId });
      await loadDashboardSummary({ silent: true });
      await loadReviewerWorkload({ silent: true });
      renderDetail();
      showToast("Reviewer assignment updated successfully.");
    } catch (error) {
      showToast(getErrorMessage(error, "Failed to assign reviewer."), "error");
    } finally {
      state.busyAction = false;
    }
  });

  refreshButton?.addEventListener("click", async () => {
    if (!state.selectedRecordId) {
      return;
    }

    state.loadingDetail = true;
    renderDetail();

    try {
      state.guardrailCheck = null;
      state.selectedDetail = await state.service.refreshBooksInvoiceSnapshot(
        state.selectedRecordId,
      );
      syncInboxItemFromDetail(state.selectedDetail);
      await loadInbox({
        preserveSelectedRecordId: state.selectedRecordId,
        silent: true,
      });
      await loadDashboardSummary({ silent: true });
      await loadReviewerWorkload({ silent: true });
      if (state.selectedRecordId) {
        await loadDetailWithOptions(state.selectedRecordId, { silent: true });
        syncInboxItemFromDetail(state.selectedDetail);
      }
      state.detailError = null;
      renderInbox();
      renderDetail();
      showToast("Books snapshot refreshed.");
    } catch (error) {
      state.detailError = error;
      showToast(getErrorMessage(error, "Failed to refresh Books snapshot."), "error");
    } finally {
      state.loadingDetail = false;
      renderDetail();
    }
  });
  checkApprovalSafetyButton?.addEventListener("click", async () => {
    if (!state.selectedRecordId || state.busyAction) {
      return;
    }

    state.busyAction = true;

    try {
      state.guardrailCheck = await state.service.validateInvoiceApproval(
        state.selectedRecordId,
      );
      renderDetail();
      showToast(
        state.guardrailCheck.canApprove
          ? "Approval safety check completed."
          : "Approval is currently blocked.",
        state.guardrailCheck.canApprove ? "success" : "error",
      );
    } catch (error) {
      showToast(getErrorMessage(error, "Failed to validate approval safety."), "error");
    } finally {
      state.busyAction = false;
    }
  });

  assistantBriefingButton?.addEventListener("click", async () => {
    await runAssistantTask(async () => {
      state.aiAssistant.briefing = await state.aiTools.buildApprovalBriefing();
      showToast("Daily approval briefing generated.");
    });
  });

  assistantBlockersButton?.addEventListener("click", async () => {
    if (!state.selectedRecordId) {
      return;
    }

    await runAssistantTask(async () => {
      state.aiAssistant.blocker = await state.aiTools.explainBlockedInvoice(
        state.selectedRecordId,
      );
      showToast("Selected invoice blocker summary updated.");
    });
  });

  assistantEscalationButton?.addEventListener("click", async () => {
    await runAssistantTask(async () => {
      await state.aiTools.runApprovalEscalationCheck();
      state.aiAssistant.escalation = await state.aiTools.prepareEscalationBriefing();
      showToast("Escalation briefing prepared.");
    });
  });
  approveButton?.addEventListener("click", async () => {
    if (!state.selectedRecordId || state.busyAction) {
      return;
    }

    try {
      state.guardrailCheck = await state.service.validateInvoiceApproval(
        state.selectedRecordId,
      );
      renderDetail();

      if (!state.guardrailCheck.canApprove) {
        const blockingMessage =
          state.guardrailCheck.blockingReasons?.join(" ") ||
          state.guardrailCheck.message ||
          "Approval is blocked.";
        showToast(blockingMessage, "error");
        return;
      }

      if (state.guardrailCheck.warningReasons?.length) {
        const confirmed = await showApprovalConfirmationToast(state.guardrailCheck);

        if (!confirmed) {
          showToast("Approval cancelled after warning review.", "warning");
          return;
        }
      }

      await runAction(
        () => state.service.approveInvoice(state.selectedRecordId, getPayload("Approved")),
        "Invoice approved successfully.",
      );
    } catch (error) {
      showToast(getErrorMessage(error, "Failed to validate approval safety."), "error");
    }
  });
  rejectButton?.addEventListener("click", () =>
    void runAction(
      () => state.service.rejectInvoice(state.selectedRecordId, getPayload("Rejected")),
      "Invoice rejected successfully.",
    ),
  );
  clarifyButton?.addEventListener("click", () =>
    void runAction(
      () =>
        state.service.requestClarification(
          state.selectedRecordId,
          getPayload("Needs Clarification"),
        ),
      "Clarification request sent successfully.",
    ),
  );
  commentButton?.addEventListener("click", () =>
    void runAction(
      () =>
        state.service.addComment(state.selectedRecordId, {
          reviewer: reviewerInput.value.trim(),
          comment: commentInput.value.trim(),
          commentType: "Internal Note",
        }),
      "Comment added successfully.",
    ),
  );
}

function updateRuntimeHeader() {
  if (state.runtimeInfo?.publicCustomApiMode) {
    elements.runtimePill.textContent = "Public API Live";
    elements.headerNote.textContent =
      "Live Creator data loaded through public custom API URLs in standalone mode.";
    return;
  }

  elements.runtimePill.textContent =
    state.service?.mode === "creator" ? "Creator Live" : "Preview mode";
  elements.headerNote.textContent =
    state.service?.mode === "creator"
      ? "Live Creator environment with configured workflow APIs."
      : "Local preview data only.";
}

function wireInboxRetryButton() {
  const retryButton = document.getElementById("retry-inbox-button");
  retryButton?.addEventListener("click", async () => {
    state.inboxError = null;
    await loadInbox({ preserveSelectedRecordId: state.selectedRecordId });
    await loadDetail(state.selectedRecordId);
  });
}

function wireDetailRetryButton() {
  const retryButton = document.getElementById("retry-detail-button");
  retryButton?.addEventListener("click", () => void loadDetail(state.selectedRecordId));
}

function syncToolbarInputs() {
  if (elements.searchFilter) {
    elements.searchFilter.value = state.filters.searchText;
  }

  if (elements.syncFilter) {
    elements.syncFilter.value = state.filters.syncFilter;
  }

  if (elements.paymentFilter) {
    elements.paymentFilter.value = state.filters.paymentFilter;
  }

  if (elements.priorityFilter) {
    elements.priorityFilter.value = state.filters.priorityFilter;
  }

  if (elements.reviewerFilter) {
    const currentOptions = Array.from(elements.reviewerFilter.options).map(
      (option) => option.value,
    );
    const desiredOptions = getReviewerFilterOptions();

    if (
      currentOptions.length !== desiredOptions.length ||
      currentOptions.some((value, index) => value !== desiredOptions[index].value)
    ) {
      elements.reviewerFilter.innerHTML = "";
      desiredOptions.forEach((optionConfig) => {
        const option = document.createElement("option");
        option.value = optionConfig.value;
        option.textContent = optionConfig.label;
        elements.reviewerFilter.appendChild(option);
      });
    }

    elements.reviewerFilter.value = state.filters.reviewerFilter;
  }

  if (elements.sortFilter) {
    elements.sortFilter.value = `${state.filters.sortBy}:${state.filters.sortDirection}`;
  }
}

async function loadInbox(options = {}) {
  const preserveSelectedRecordId = options.preserveSelectedRecordId || "";
  const silent = options.silent === true;

  if (!silent) {
    state.loadingInbox = true;
    state.inboxError = null;
    renderInbox();
  }

  try {
    const response = await state.service.loadInbox(state.filters);
    state.inboxItems = response.items;
    state.summary = response.summary;

    if (preserveSelectedRecordId) {
      state.selectedRecordId = preserveSelectedRecordId;
    } else if (!state.selectedRecordId && response.items[0]) {
      state.selectedRecordId = response.items[0].approvalRecordId;
    } else if (
      state.selectedRecordId &&
      !response.items.some((item) => item.approvalRecordId === state.selectedRecordId)
    ) {
      state.selectedRecordId = response.items[0]?.approvalRecordId || "";
    }
  } catch (error) {
    state.inboxError = error;
    if (!silent) {
      showToast(getErrorMessage(error, "Failed to load the invoice inbox."), "error");
    }
  } finally {
    if (!silent) {
      state.loadingInbox = false;
    }
    renderKpis();
    renderToolbarSummary();
    renderInbox();
  }
}

async function loadDashboardSummary(options = {}) {
  const silent = options.silent === true;

  try {
    state.dashboardSummary = await state.service.loadDashboardSummary();
  } catch (error) {
    if (!silent) {
      showToast(
        getErrorMessage(error, "Failed to load the approval dashboard."),
        "error",
      );
    }
  } finally {
    renderKpis();
  }
}

async function loadReviewerWorkload(options = {}) {
  const silent = options.silent === true;

  try {
    state.reviewerWorkload = await state.service.loadReviewerWorkload();
  } catch (error) {
    if (!silent) {
      showToast(
        getErrorMessage(error, "Failed to load reviewer workload."),
        "error",
      );
    }
  } finally {
    renderReviewerWorkload();
    syncToolbarInputs();
  }
}

async function loadDetail(recordId) {
  return loadDetailWithOptions(recordId, {});
}

async function loadDetailWithOptions(recordId, options = {}) {
  if (!recordId) {
    state.selectedDetail = null;
    state.detailError = null;
    state.guardrailCheck = null;
    renderDetail();
    return;
  }

  const silent = options.silent === true;

  if (!silent) {
    state.loadingDetail = true;
    state.detailError = null;
    renderDetail();
  }

  try {
    state.selectedDetail = await state.service.loadInvoiceDetail(recordId);
    state.guardrailCheck = null;
  } catch (error) {
    state.detailError = error;
    if (!silent) {
      showToast(getErrorMessage(error, "Failed to load invoice detail."), "error");
    }
  } finally {
    if (!silent) {
      state.loadingDetail = false;
    }
    renderDetail();
  }
}

async function runAutoRefreshCycle() {
  if (
    state.autoRefreshInFlight ||
    state.loadingInbox ||
    state.loadingDetail ||
    state.busyAction
  ) {
    return;
  }

  state.autoRefreshInFlight = true;

  try {
    await loadInbox({
      preserveSelectedRecordId: state.selectedRecordId,
      silent: true,
    });

    if (state.selectedRecordId) {
      await loadDetailWithOptions(state.selectedRecordId, { silent: true });
      syncInboxItemFromDetail(state.selectedDetail);
      renderInbox();
    }
  } catch (error) {
    console.warn("Auto refresh failed:", error);
  } finally {
    state.autoRefreshInFlight = false;
  }
}

function startAutoRefresh() {
  const intervalMs = Number(state.config?.autoRefreshIntervalMs || 0);

  if (state.autoRefreshTimer) {
    window.clearInterval(state.autoRefreshTimer);
    state.autoRefreshTimer = null;
  }

  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    return;
  }

  state.autoRefreshTimer = window.setInterval(() => {
    void runAutoRefreshCycle();
  }, intervalMs);
}

async function runAction(callback, successMessage = "Workflow action completed successfully.") {
  if (state.busyAction) {
    return;
  }

  state.busyAction = true;
  const activeRecordId = state.selectedRecordId;

  try {
    const detail = await callback();
    state.selectedDetail = detail;
    state.guardrailCheck = null;
    await loadInbox({ preserveSelectedRecordId: activeRecordId });
    await loadDashboardSummary({ silent: true });
    await loadReviewerWorkload({ silent: true });
    state.selectedRecordId = activeRecordId;
    if (activeRecordId) {
      state.selectedDetail = await state.service.loadInvoiceDetail(activeRecordId);
    }
    renderDetail();
    showToast(successMessage);
  } catch (error) {
    showToast(
      getErrorMessage(error, "The workflow action could not be completed."),
      "error",
    );
  } finally {
    state.busyAction = false;
  }
}

function bindToolbar() {
  SYNC_FILTERS.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    elements.syncFilter.appendChild(option);
  });

  PAYMENT_FILTERS.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    elements.paymentFilter.appendChild(option);
  });

  PRIORITY_FILTERS.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    elements.priorityFilter.appendChild(option);
  });

  getReviewerFilterOptions().forEach((optionConfig) => {
    const option = document.createElement("option");
    option.value = optionConfig.value;
    option.textContent = optionConfig.label;
    elements.reviewerFilter.appendChild(option);
  });

  SORT_OPTIONS.forEach((optionConfig) => {
    const option = document.createElement("option");
    option.value = optionConfig.value;
    option.textContent = optionConfig.label;
    elements.sortFilter.appendChild(option);
  });

  syncToolbarInputs();

  elements.searchFilter.addEventListener("input", async (event) => {
    state.filters.searchText = event.target.value;
    state.filters.page = 1;
    await loadInbox({ preserveSelectedRecordId: state.selectedRecordId });
    await loadDetail(state.selectedRecordId);
  });

  elements.syncFilter.addEventListener("change", async (event) => {
    state.filters.syncFilter = event.target.value;
    state.filters.page = 1;
    await loadInbox({ preserveSelectedRecordId: state.selectedRecordId });
    await loadDetail(state.selectedRecordId);
  });

  elements.paymentFilter.addEventListener("change", async (event) => {
    state.filters.paymentFilter = event.target.value;
    state.filters.page = 1;
    await loadInbox({ preserveSelectedRecordId: state.selectedRecordId });
    await loadDetail(state.selectedRecordId);
  });

  elements.priorityFilter.addEventListener("change", async (event) => {
    state.filters.priorityFilter = event.target.value;
    state.filters.page = 1;
    await loadInbox({ preserveSelectedRecordId: state.selectedRecordId });
    await loadDetail(state.selectedRecordId);
  });

  elements.reviewerFilter.addEventListener("change", async (event) => {
    state.filters.reviewerFilter = event.target.value;
    state.filters.page = 1;
    await loadInbox({ preserveSelectedRecordId: state.selectedRecordId });
    await loadDetail(state.selectedRecordId);
  });

  elements.sortFilter.addEventListener("change", async (event) => {
    const [sortBy, sortDirection] = String(event.target.value || "dueDate:asc").split(":");
    state.filters.sortBy = sortBy || "dueDate";
    state.filters.sortDirection = sortDirection || "asc";
    state.filters.page = 1;
    await loadInbox({ preserveSelectedRecordId: state.selectedRecordId });
    await loadDetail(state.selectedRecordId);
  });

  elements.resetFiltersButton.addEventListener("click", async () => {
    state.filters = {
      statusFilter: "All",
      syncFilter: "All",
      paymentFilter: "All",
      priorityFilter: "All",
      reviewerFilter: REVIEWER_FILTER_DEFAULT,
      searchText: "",
      sortBy: "dueDate",
      sortDirection: "asc",
      page: 1,
      pageSize: 25,
    };
    syncToolbarInputs();
    await loadInbox({ preserveSelectedRecordId: state.selectedRecordId });
    await loadDetail(state.selectedRecordId);
  });

  elements.refreshButton.addEventListener("click", async () => {
    await loadInbox({ preserveSelectedRecordId: state.selectedRecordId });
    await loadDetail(state.selectedRecordId);
    showToast("Inbox refreshed.");
  });
}

async function bootstrap() {
  elements.kpiGrid = document.getElementById("kpi-grid");
  elements.reviewerWorkload = document.getElementById("reviewer-workload");
  elements.searchFilter = document.getElementById("search-filter");
  elements.syncFilter = document.getElementById("sync-filter");
  elements.paymentFilter = document.getElementById("payment-filter");
  elements.priorityFilter = document.getElementById("priority-filter");
  elements.reviewerFilter = document.getElementById("reviewer-filter");
  elements.sortFilter = document.getElementById("sort-filter");
  elements.resetFiltersButton = document.getElementById("reset-filters-button");
  elements.refreshButton = document.getElementById("refresh-button");
  elements.toolbarSummary = document.getElementById("toolbar-summary");
  elements.inboxList = document.getElementById("inbox-list");
  elements.detailRoot = document.getElementById("detail-root");
  elements.runtimePill = document.getElementById("runtime-pill");
  elements.headerNote = document.getElementById("header-note");
  elements.toastRegion = document.getElementById("toast-region");

  const widgetParams =
    window.ZOHO?.CREATOR?.UTIL?.getWidgetParams?.() || {};
  state.config = getRuntimeConfig(widgetParams);
  state.service = await createInvoiceApprovalService(state.config);
  state.aiTools = createInvoiceApprovalAiTools(state.service);
  window.invoiceApprovalAiTools = state.aiTools;
  state.runtimeInfo = await state.service.init();
  updateRuntimeHeader();
  bindToolbar();
  startAutoRefresh();
  renderKpis();
  renderReviewerWorkload();
  renderToolbarSummary();
  renderInbox();
  renderDetail();
  await loadDashboardSummary({ silent: true });
  await loadReviewerWorkload({ silent: true });
  await loadInbox();
  await loadDetail(state.selectedRecordId);
}

window.addEventListener("DOMContentLoaded", () => {
  void bootstrap().catch((error) => {
    showToast(
      getErrorMessage(error, "The widget could not be initialized."),
      "error",
    );
    elements.detailRoot = document.getElementById("detail-root");
    if (elements.detailRoot) {
      elements.detailRoot.innerHTML = `
        <div class="empty-state">
          <h3>Initialization failed</h3>
          <p>${escapeHtml(
            getErrorMessage(error, "The widget could not be initialized."),
          )}</p>
        </div>
      `;
    }
  });
});
