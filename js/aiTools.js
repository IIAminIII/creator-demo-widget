function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeCompareText(value) {
  return normalizeText(value).replace(/[^a-z0-9]/gi, "").toUpperCase();
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function firstText(...values) {
  for (const value of values) {
    const normalized = normalizeText(value);
    if (normalized) {
      return normalized;
    }
  }

  return "";
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function toBoolean(value, fallback = null) {
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

  return fallback;
}

function withResult(ok, message, extras = {}) {
  return {
    ok,
    message,
    ...extras,
  };
}

function getInvoiceSection(detail = {}) {
  return detail.invoice || detail;
}

function getApprovalSection(detail = {}) {
  return detail.approval || detail;
}

function toInboxArray(response) {
  return Array.isArray(response?.items) ? response.items : [];
}

function summarizeAttentionItems({ failedRefreshes, reviewNeeded, manualReview, unassigned }) {
  const parts = [
    `${failedRefreshes.length} failed refresh`,
    `${reviewNeeded.length} review needed`,
    `${manualReview.length} manual review`,
    `${unassigned.length} unassigned`,
  ];

  return `Attention items: ${parts.join(", ")}.`;
}

function buildDifferenceGuidance(detail, validation) {
  const approval = getApprovalSection(detail);
  const invoice = getInvoiceSection(detail);
  const differenceSummary = firstText(
    approval.differenceSummary,
    detail.differenceSummary,
    validation?.message,
  );
  const differenceFound = toBoolean(
    validation?.differenceFound ??
      approval.booksSyncDifferenceFound ??
      approval.booksSnapshotDifferenceFound ??
      approval.differenceFound,
    false,
  );

  if (!differenceFound) {
    return "No Books vs Creator difference is currently flagged.";
  }

  return firstText(
    differenceSummary,
    `A difference was detected between the latest Books invoice and the Creator approval snapshot for ${invoice.invoiceNumber || "this invoice"}. Refresh from Books, review the changed fields, and confirm the approval record still matches before approving.`,
  );
}

function normalizeBriefingItem(item = {}) {
  return {
    approvalRecordId: item.approvalRecordId || "",
    invoiceNumber: item.invoiceNumber || "",
    customerName: item.customerName || "",
    approvalStatus: item.approvalStatus || "",
    syncStatus: item.syncStatus || "",
    paymentStatus: item.paymentStatus || "",
    assignedReviewer: item.assignedReviewer || "Unassigned",
    differenceFound: item.differenceFound === true,
    dueDate: item.dueDate || "",
    invoiceTotal: Number(item.invoiceTotal || 0),
    currencyCode: item.currencyCode || "USD",
  };
}

function extractInvoiceNumber(message) {
  const match = String(message || "").match(/\bINV-[A-Z0-9-]+\b/i);
  return match ? match[0].toUpperCase() : "";
}

function extractReviewerEmail(message) {
  const match = String(message || "").match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
  return match ? match[0].toLowerCase() : "";
}

function extractCommentAfterInvoice(message, invoiceNumber) {
  const normalizedInvoiceNumber = normalizeText(invoiceNumber);

  if (!normalizedInvoiceNumber) {
    return "";
  }

  const expression = new RegExp(
    `add\\s+comment\\s+${normalizedInvoiceNumber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+(.+)`,
    "i",
  );
  const match = String(message || "").match(expression);
  return match?.[1]?.trim() || "";
}

function extractActionReason(text, removableWords = []) {
  let remaining = String(text || "");

  removableWords
    .filter(Boolean)
    .sort((left, right) => String(right).length - String(left).length)
    .forEach((word) => {
      remaining = remaining.replace(new RegExp(escapeRegExp(word), "gi"), " ");
    });

  return remaining.replace(/^[\s,:;-]+/, "").replace(/\s+/g, " ").trim();
}

function parseAssistantIntent(message) {
  const normalizedMessage = normalizeText(message).toLowerCase();
  const invoiceNumber = extractInvoiceNumber(message);

  if (!normalizedMessage) {
    return { intent: "unknown", invoiceNumber: "" };
  }

  if (normalizedMessage.startsWith("approve")) {
    return {
      intent: invoiceNumber ? "approve_invoice" : "invoice reference required",
      invoiceNumber,
      requestedIntent: "approve",
      comment: extractActionReason(message, ["approve", invoiceNumber]),
    };
  }

  if (normalizedMessage.startsWith("reject")) {
    return {
      intent: invoiceNumber ? "reject_invoice" : "invoice reference required",
      invoiceNumber,
      requestedIntent: "reject",
      reason: extractActionReason(message, ["reject", "because", invoiceNumber]),
    };
  }

  if (
    normalizedMessage.startsWith("request clarification") ||
    normalizedMessage.startsWith("clarification request") ||
    normalizedMessage.startsWith("clarify")
  ) {
    return {
      intent: invoiceNumber ? "request_clarification" : "invoice reference required",
      invoiceNumber,
      requestedIntent: "request clarification",
      reason: extractActionReason(message, [
        "request clarification",
        "clarification request",
        "clarify",
        "because",
        invoiceNumber,
      ]),
    };
  }

  return { intent: "unknown", invoiceNumber };
}

function deriveReviewerNameFromEmail(email) {
  const localPart = String(email || "")
    .split("@")[0]
    .replace(/[._-]+/g, " ")
    .trim();

  if (!localPart) {
    return "Assigned Reviewer";
  }

  return localPart
    .split(/\s+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function getAssistantReviewerName(service) {
  return firstText(
    service?.currentReviewerName,
    service?.config?.currentReviewerName,
    "AI Operations Assistant",
  );
}

function summarizeLineItems(detail = {}) {
  const invoice = getInvoiceSection(detail);
  const lineItems = Array.isArray(detail?.lineItems) ? detail.lineItems : [];

  if (!lineItems.length) {
    return {
      title: "Invoice line items",
      summary: "No line items were found for the selected invoice.",
      bullets: [],
      suggestions: ["Refresh from Books to pull the latest invoice snapshot."],
    };
  }

  return {
    title: "Invoice line items",
    summary: `${invoice.invoiceNumber || "This invoice"} currently shows ${lineItems.length} line item(s) from the linked Books snapshot.`,
    bullets: lineItems.slice(0, 5).map((line) => {
      const quantity = Number(line.quantity || 0);
      const rate = Number(line.rate || 0);
      const total = Number(line.total || line.itemTotal || 0);
      return `${line.name || "Item"}: qty ${quantity}, rate ${rate}, total ${total}.`;
    }),
    suggestions:
      lineItems.length > 5
        ? ["The reply shows the first 5 line items. Open the table for the full list."]
        : [],
  };
}

function summarizeInvoiceDetail(detail = {}, validation = null) {
  const invoice = getInvoiceSection(detail);
  const approval = getApprovalSection(detail);
  const differenceSummary = buildDifferenceGuidance(detail, validation);
  const canApprove = validation?.canApprove;

  return {
    title: "Selected invoice summary",
    summary: `${invoice.invoiceNumber || detail.approvalRecordId || "Selected invoice"} for ${invoice.customerName || "Unknown customer"} is ${approval.approvalStatus || "Unknown"} with ${approval.syncStatus || "Unknown"} sync status and ${invoice.paymentStatus || "Unknown"} payment status.`,
    bullets: [
      `Invoice total: ${Number(invoice.invoiceTotal || 0)} ${invoice.currencyCode || "USD"}.`,
      `Due date: ${invoice.dueDate || "Not available"}.`,
      `Assigned reviewer: ${approval.assignedReviewer || "Unassigned"}.`,
      `Difference review: ${differenceSummary}`,
      `Approval safety: ${canApprove === false ? "Blocked" : validation?.warningReasons?.length ? "Manual review still recommended" : "No active approval block detected"}.`,
    ],
    suggestions: [
      "Ask why approval is blocked.",
      "Ask for line items.",
      "Ask for escalation summary.",
    ],
  };
}

function summarizeWorkload(workload = []) {
  const reviewers = Array.isArray(workload) ? workload : [];

  if (!reviewers.length) {
    return {
      title: "Reviewer workload",
      summary: "No reviewer workload data is available right now.",
      bullets: [],
      suggestions: [],
    };
  }

  const top = reviewers
    .slice()
    .sort((left, right) => Number(right.pendingCount || 0) - Number(left.pendingCount || 0))
    .slice(0, 4);

  return {
    title: "Reviewer workload",
    summary: `${reviewers.length} reviewer workload record(s) were loaded from the approval workspace.`,
    bullets: top.map(
      (entry) =>
        `${entry.reviewerName || "Unassigned"}: ${entry.pendingCount || 0} pending, ${entry.needsClarificationCount || 0} clarification, review amount ${Number(entry.reviewAmount || 0)}.`,
    ),
    suggestions: ["Use the reviewer filter to focus on one reviewer from the inbox."],
  };
}

export function createInvoiceApprovalAiTools(service) {
  async function getInvoiceApprovalDashboard() {
    try {
      const data = await service.loadDashboardSummary();
      return withResult(true, "Approval dashboard loaded successfully.", { data });
    } catch (error) {
      return withResult(false, "Failed to load the approval dashboard.", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function findInvoiceApprovals(filters = {}) {
    try {
      const data = await service.loadInbox(filters);
      return withResult(true, "Invoice approvals loaded successfully.", { data });
    } catch (error) {
      return withResult(false, "Failed to load invoice approvals.", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function getInvoiceApprovalDetail(approvalRecordId) {
    try {
      const data = await service.loadInvoiceDetail(approvalRecordId);
      return withResult(true, "Invoice approval detail loaded successfully.", { data });
    } catch (error) {
      return withResult(false, "Failed to load invoice approval detail.", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function validateInvoiceApprovalSafety(approvalRecordId) {
    try {
      const data = await service.validateInvoiceApproval(approvalRecordId);
      return withResult(true, "Approval safety check completed.", {
        data,
        blockingReasons: toArray(data?.blockingReasons),
        warningReasons: toArray(data?.warningReasons),
      });
    } catch (error) {
      return withResult(false, "Approval safety check failed.", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function getReviewerWorkload() {
    try {
      const data = await service.loadReviewerWorkload();
      return withResult(true, "Reviewer workload loaded successfully.", { data });
    } catch (error) {
      return withResult(false, "Failed to load reviewer workload.", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function refreshInvoiceFromBooks(approvalRecordId) {
    try {
      const refreshMethod =
        service.refreshInvoiceFromBooks ||
        service.refreshBooksInvoiceSnapshot ||
        service.refreshInvoice;

      if (typeof refreshMethod !== "function") {
        throw new Error("Refresh from Books is not configured in the current service.");
      }

      const data = await refreshMethod.call(service, approvalRecordId);
      return withResult(true, "Books snapshot refreshed successfully.", {
        data,
        requiresConfirmation: false,
      });
    } catch (error) {
      return withResult(false, "Failed to refresh the Books snapshot.", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function runApprovalEscalationCheck() {
    try {
      const data =
        typeof service.checkApprovalEscalations === "function"
          ? await service.checkApprovalEscalations()
          : {
              ok: true,
              message:
                "No dedicated escalation API is configured. Returning filtered queue results instead.",
            };

      return withResult(true, firstText(data?.message, "Escalation check completed."), {
        data,
      });
    } catch (error) {
      return withResult(false, "Failed to run the escalation check.", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function assignInvoiceReviewer(
    approvalRecordId,
    reviewerName,
    reviewerEmail,
    assignmentNote,
  ) {
    try {
      const data = await service.assignInvoiceReviewer(approvalRecordId, {
        reviewerName,
        reviewerEmail,
        assignmentNote,
      });
      return withResult(true, "Reviewer assignment completed successfully.", {
        data,
        requiresConfirmation: true,
      });
    } catch (error) {
      return withResult(false, "Failed to assign the reviewer.", {
        error: error instanceof Error ? error.message : String(error),
        requiresConfirmation: true,
      });
    }
  }

  async function addInvoiceApprovalComment(
    approvalRecordId,
    comment,
    reviewer,
    commentType = "Internal note",
  ) {
    try {
      const data = await service.addComment(approvalRecordId, {
        comment,
        reviewer,
        type: commentType,
        commentType,
      });
      return withResult(true, "Approval comment added successfully.", {
        data,
        requiresConfirmation: true,
      });
    } catch (error) {
      return withResult(false, "Failed to add the approval comment.", {
        error: error instanceof Error ? error.message : String(error),
        requiresConfirmation: true,
      });
    }
  }

  async function approveInvoiceSafely(
    approvalRecordId,
    comment,
    reviewer,
    confirmed = false,
  ) {
    const validation = await service.validateInvoiceApproval(approvalRecordId);
    const blockingReasons = toArray(validation?.blockingReasons).filter(Boolean);
    const warningReasons = toArray(validation?.warningReasons).filter(Boolean);

    if (validation?.canApprove === false) {
      return withResult(false, firstText(validation?.message, "Approval is blocked."), {
        requiresConfirmation: true,
        blockingReasons,
        warningReasons,
        data: validation,
      });
    }

    if (warningReasons.length && !confirmed) {
      return withResult(true, firstText(validation?.message, "Approval can continue after reviewer confirmation."), {
        requiresConfirmation: true,
        blockingReasons,
        warningReasons,
        data: validation,
      });
    }

    try {
      const data = await service.approveInvoice(approvalRecordId, {
        comment,
        reviewer,
      });
      return withResult(true, "Invoice approved successfully.", {
        data,
        requiresConfirmation: true,
        blockingReasons,
        warningReasons,
      });
    } catch (error) {
      return withResult(false, "Failed to approve the invoice.", {
        error: error instanceof Error ? error.message : String(error),
        requiresConfirmation: true,
        blockingReasons,
        warningReasons,
      });
    }
  }

  async function rejectInvoiceWithReason(
    approvalRecordId,
    comment,
    reviewer,
    exceptionReason,
  ) {
    if (!normalizeText(comment) || !normalizeText(exceptionReason)) {
      return withResult(false, "Rejecting an invoice requires both a reviewer comment and a rejection reason.", {
        requiresConfirmation: true,
      });
    }

    try {
      const data = await service.rejectInvoice(approvalRecordId, {
        comment,
        reviewer,
        exceptionReason,
      });
      return withResult(true, "Invoice rejected successfully.", {
        data,
        requiresConfirmation: true,
      });
    } catch (error) {
      return withResult(false, "Failed to reject the invoice.", {
        error: error instanceof Error ? error.message : String(error),
        requiresConfirmation: true,
      });
    }
  }

  async function requestInvoiceClarification(
    approvalRecordId,
    comment,
    reviewer,
    exceptionReason,
  ) {
    if (!normalizeText(comment) || !normalizeText(exceptionReason)) {
      return withResult(false, "Requesting clarification requires both a reviewer comment and a clarification reason.", {
        requiresConfirmation: true,
      });
    }

    try {
      const data = await service.requestClarification(approvalRecordId, {
        comment,
        reviewer,
        exceptionReason,
      });
      return withResult(true, "Clarification request submitted successfully.", {
        data,
        requiresConfirmation: true,
      });
    } catch (error) {
      return withResult(false, "Failed to request clarification.", {
        error: error instanceof Error ? error.message : String(error),
        requiresConfirmation: true,
      });
    }
  }

  async function buildApprovalBriefing() {
    const [dashboard, failed, reviewNeeded, manualReview, unassigned, reviewerWorkload] =
      await Promise.all([
        service.loadDashboardSummary(),
        service.loadInbox({ syncFilter: "Failed", pageSize: 200 }),
        service.loadInbox({ syncFilter: "Review Needed", pageSize: 200 }),
        service.loadInbox({ syncFilter: "Manual Review", pageSize: 200 }),
        service.loadInbox({ reviewerFilter: "Unassigned", pageSize: 200 }),
        service.loadReviewerWorkload(),
      ]);

    const result = {
      summaryText: `Approval dashboard loaded. ${summarizeAttentionItems({
        failedRefreshes: toInboxArray(failed),
        reviewNeeded: toInboxArray(reviewNeeded),
        manualReview: toInboxArray(manualReview),
        unassigned: toInboxArray(unassigned),
      })}`,
      attentionItems: [
        `Pending approvals: ${dashboard?.approvalSummary?.pending ?? 0}`,
        `Manual review: ${dashboard?.syncSummary?.manualReview ?? 0}`,
        `Failed refreshes: ${dashboard?.syncSummary?.failed ?? 0}`,
        `Unassigned invoices: ${toInboxArray(unassigned).length}`,
      ],
      failedRefreshes: toInboxArray(failed).map(normalizeBriefingItem),
      reviewNeeded: toInboxArray(reviewNeeded).map(normalizeBriefingItem),
      manualReview: toInboxArray(manualReview).map(normalizeBriefingItem),
      unassigned: toInboxArray(unassigned).map(normalizeBriefingItem),
      reviewerWorkload: toArray(reviewerWorkload),
    };

    return result;
  }

  async function explainBlockedInvoice(approvalRecordId) {
    const [detail, validation] = await Promise.all([
      service.loadInvoiceDetail(approvalRecordId),
      service.validateInvoiceApproval(approvalRecordId),
    ]);

    const invoice = getInvoiceSection(detail);
    const approval = getApprovalSection(detail);
    const blockingReasons = toArray(validation?.blockingReasons).filter(Boolean);
    const warningReasons = toArray(validation?.warningReasons).filter(Boolean);
    const explanationParts = [];

    if (blockingReasons.length) {
      explanationParts.push(`Approval is blocked because ${blockingReasons.join(" ")}`);
    } else if (warningReasons.length) {
      explanationParts.push(`Approval is not fully clean yet because ${warningReasons.join(" ")}`);
    } else {
      explanationParts.push(firstText(validation?.message, "No current blocker was reported by the validation API."));
    }

    explanationParts.push(buildDifferenceGuidance(detail, validation));

    if (firstText(invoice.paymentStatus).toLowerCase().includes("paid")) {
      explanationParts.push(
        "Books already shows payment activity. Confirm whether approval is still appropriate before continuing.",
      );
    }

    return {
      ok: true,
      invoiceNumber: invoice.invoiceNumber || approvalRecordId,
      canApprove: validation?.canApprove !== false,
      severity: firstText(validation?.severity, blockingReasons.length ? "error" : warningReasons.length ? "warning" : "success"),
      explanation: explanationParts.join(" "),
      blockingReasons,
      warningReasons,
      booksSyncMessage: firstText(validation?.message, approval.syncStatus),
      differenceSummary: firstText(approval.differenceSummary, detail.differenceSummary, "No difference summary is available."),
      paymentStatus: firstText(validation?.booksPaymentStatus, invoice.paymentStatus, "Unknown"),
      syncStatus: firstText(validation?.syncStatus, approval.syncStatus, "Unknown"),
      lastBooksSyncAt: firstText(validation?.lastBooksSyncAt, approval.lastBooksSyncAt),
      lastComparedAt: firstText(validation?.lastComparedAt, approval.lastComparedAt),
    };
  }

  async function prepareReviewerAssignmentPreview(filters, reviewerName, reviewerEmail) {
    const inbox = await service.loadInbox({ ...filters, page: 1, pageSize: 200 });
    const items = toInboxArray(inbox).map((item) => ({
      ...normalizeBriefingItem(item),
      targetReviewerName: reviewerName,
      targetReviewerEmail: reviewerEmail,
    }));

    return {
      ok: true,
      message: `${items.length} invoice(s) are ready for reviewer assignment preview.`,
      requiresConfirmation: true,
      data: items,
    };
  }

  async function prepareEscalationBriefing() {
    const [dashboard, dueSoon, escalated, reviewerWorkload] = await Promise.all([
      service.loadDashboardSummary(),
      service.loadInbox({ slaFilter: "Due Soon", pageSize: 200, sortBy: "dueDate", sortDirection: "asc" }),
      service.loadInbox({ slaFilter: "Escalated", pageSize: 200, sortBy: "dueDate", sortDirection: "asc" }),
      service.loadReviewerWorkload(),
    ]);

    return {
      dueSoon: toInboxArray(dueSoon).map(normalizeBriefingItem),
      escalated: toInboxArray(escalated).map(normalizeBriefingItem),
      reviewerWorkload: toArray(reviewerWorkload),
      summaryText: `Dashboard refreshed with ${dashboard?.agingSummary?.dueSoon ?? 0} due soon invoice(s) and ${toInboxArray(escalated).length} escalated invoice(s).`,
    };
  }

  async function findInvoiceByNumber(invoiceNumber) {
    const normalizedInvoiceNumber = normalizeCompareText(invoiceNumber);

    if (!normalizedInvoiceNumber) {
      return null;
    }

    const inbox = await service.loadInbox({
      statusFilter: "All",
      syncFilter: "All",
      paymentFilter: "All",
      priorityFilter: "All",
      reviewerFilter: "All Reviewers",
      searchText: invoiceNumber,
      page: 1,
      pageSize: 200,
      sortBy: "invoiceNumber",
      sortDirection: "asc",
    });
    const matchedItem =
      toInboxArray(inbox).find(
        (item) => normalizeCompareText(item.invoiceNumber) === normalizedInvoiceNumber,
      ) ||
      toInboxArray(inbox).find((item) =>
        normalizeCompareText(item.invoiceNumber).includes(normalizedInvoiceNumber),
      );

    if (!matchedItem?.approvalRecordId) {
      return null;
    }

    const detail = await service.loadInvoiceDetail(matchedItem.approvalRecordId);

    return {
      approvalRecordId: matchedItem.approvalRecordId,
      detail,
      item: normalizeBriefingItem(matchedItem),
    };
  }

  async function prepareRefreshInvoiceFromBooks(invoiceNumber) {
    const matchedInvoice = await findInvoiceByNumber(invoiceNumber);

    if (!matchedInvoice) {
      return {
        ok: false,
        requiresConfirmation: false,
        message: `I could not find ${invoiceNumber}. Try the full invoice number like INV-2026-0018.`,
        pendingAction: null,
      };
    }

    return {
      ok: true,
      requiresConfirmation: true,
      message: `Ready to refresh ${matchedInvoice.detail.invoiceNumber} from Books through the Creator workflow. Reply yes to continue or no to cancel.`,
      pendingAction: {
        type: "refresh-invoice-from-books",
        label: `Refresh ${matchedInvoice.detail.invoiceNumber} from Books`,
        payload: {
          approvalRecordId: matchedInvoice.approvalRecordId,
          invoiceNumber: matchedInvoice.detail.invoiceNumber,
        },
      },
    };
  }

  function prepareRunEscalationCheck() {
    return {
      ok: true,
      requiresConfirmation: true,
      message: "Ready to run the escalation check through the Creator workflow. Reply yes to continue or no to cancel.",
      pendingAction: {
        type: "run-escalation-check",
        label: "Run escalation check",
        payload: {},
      },
    };
  }

  async function prepareAddInvoiceComment(invoiceNumber, comment) {
    const matchedInvoice = await findInvoiceByNumber(invoiceNumber);
    const normalizedComment = normalizeText(comment);

    if (!matchedInvoice) {
      return {
        ok: false,
        requiresConfirmation: false,
        message: `I could not find ${invoiceNumber}. Try the full invoice number like INV-2026-0018.`,
        pendingAction: null,
      };
    }

    if (!normalizedComment) {
      return {
        ok: false,
        requiresConfirmation: false,
        message: "Add comment requires comment text after the invoice number.",
        pendingAction: null,
      };
    }

    return {
      ok: true,
      requiresConfirmation: true,
      message: `Ready to add a comment to ${matchedInvoice.detail.invoiceNumber}: "${normalizedComment}". Reply yes to continue or no to cancel.`,
      pendingAction: {
        type: "add-invoice-comment",
        label: `Add comment to ${matchedInvoice.detail.invoiceNumber}`,
        payload: {
          approvalRecordId: matchedInvoice.approvalRecordId,
          invoiceNumber: matchedInvoice.detail.invoiceNumber,
          comment: normalizedComment,
          reviewer: "AI Operations Assistant",
          commentType: "Internal note",
        },
      },
    };
  }

  async function prepareAssignReviewer(invoiceNumber, reviewerEmail) {
    const matchedInvoice = await findInvoiceByNumber(invoiceNumber);
    const normalizedReviewerEmail = normalizeText(reviewerEmail).toLowerCase();

    if (!matchedInvoice) {
      return {
        ok: false,
        requiresConfirmation: false,
        message: `I could not find ${invoiceNumber}. Try the full invoice number like INV-2026-0018.`,
        pendingAction: null,
      };
    }

    if (!normalizedReviewerEmail) {
      return {
        ok: false,
        requiresConfirmation: false,
        message: "Assign reviewer requires a reviewer email address.",
        pendingAction: null,
      };
    }

    return {
      ok: true,
      requiresConfirmation: true,
      message: `Ready to assign ${matchedInvoice.detail.invoiceNumber} to ${normalizedReviewerEmail}. Reply yes to continue or no to cancel.`,
      pendingAction: {
        type: "assign-reviewer",
        label: `Assign ${matchedInvoice.detail.invoiceNumber} to ${normalizedReviewerEmail}`,
        payload: {
          approvalRecordId: matchedInvoice.approvalRecordId,
          invoiceNumber: matchedInvoice.detail.invoiceNumber,
          reviewerEmail: normalizedReviewerEmail,
          reviewerName: deriveReviewerNameFromEmail(normalizedReviewerEmail),
        },
      },
    };
  }

  async function prepareApproveInvoice(invoiceNumber, comment = "") {
    const matchedInvoice = await findInvoiceByNumber(invoiceNumber);
    const normalizedComment = normalizeText(comment);

    if (!matchedInvoice) {
      return {
        ok: false,
        requiresConfirmation: false,
        message: `I could not find ${invoiceNumber}. Try the full invoice number like INV-2026-0018.`,
        pendingAction: null,
        blockingReasons: [],
        warningReasons: [],
      };
    }

    const validation = await service.validateInvoiceApproval(matchedInvoice.approvalRecordId);
    const blockingReasons = toArray(validation?.blockingReasons).filter(Boolean);
    const warningReasons = toArray(validation?.warningReasons).filter(Boolean);
    const invoiceNumberLabel = matchedInvoice.detail.invoiceNumber;

    if (validation?.canApprove === false) {
      return {
        ok: false,
        requiresConfirmation: false,
        message: firstText(
          validation?.message,
          `${invoiceNumberLabel} is blocked and cannot be prepared for approval.`,
        ),
        pendingAction: null,
        blockingReasons,
        warningReasons,
        invoice: matchedInvoice.detail,
        guardrailCheck: validation,
      };
    }

    return {
      ok: true,
      requiresConfirmation: true,
      message: warningReasons.length
        ? `Ready to approve ${invoiceNumberLabel}. Warning reasons still need reviewer confirmation. Reply yes to continue or no to cancel.`
        : `Ready to approve ${invoiceNumberLabel}${normalizedComment ? ` with note "${normalizedComment}"` : ""}. Reply yes to continue or no to cancel.`,
      pendingAction: {
        type: "approve_invoice",
        label: `Approve ${invoiceNumberLabel}`,
        payload: {
          approvalRecordId: matchedInvoice.approvalRecordId,
          invoiceNumber: invoiceNumberLabel,
          comment: normalizedComment,
          reviewer: getAssistantReviewerName(service),
        },
      },
      blockingReasons,
      warningReasons,
      invoice: matchedInvoice.detail,
      guardrailCheck: validation,
    };
  }

  async function prepareRejectInvoice(invoiceNumber, reason = "") {
    const matchedInvoice = await findInvoiceByNumber(invoiceNumber);
    const normalizedReason = normalizeText(reason);

    if (!matchedInvoice) {
      return {
        ok: false,
        requiresConfirmation: false,
        message: `I could not find ${invoiceNumber}. Try the full invoice number like INV-2026-0018.`,
        pendingAction: null,
      };
    }

    if (!normalizedReason) {
      return {
        ok: false,
        requiresConfirmation: false,
        message: `Rejecting ${matchedInvoice.detail.invoiceNumber} requires a reason. Try: reject ${matchedInvoice.detail.invoiceNumber} because wrong amount.`,
        pendingAction: null,
        invoice: matchedInvoice.detail,
      };
    }

    return {
      ok: true,
      requiresConfirmation: true,
      message: `Ready to reject ${matchedInvoice.detail.invoiceNumber} with reason "${normalizedReason}". Reply yes to continue or no to cancel.`,
      pendingAction: {
        type: "reject_invoice",
        label: `Reject ${matchedInvoice.detail.invoiceNumber}`,
        payload: {
          approvalRecordId: matchedInvoice.approvalRecordId,
          invoiceNumber: matchedInvoice.detail.invoiceNumber,
          reason: normalizedReason,
          comment: normalizedReason,
          reviewer: getAssistantReviewerName(service),
        },
      },
      invoice: matchedInvoice.detail,
      reason: normalizedReason,
    };
  }

  async function prepareRequestClarification(invoiceNumber, reason = "") {
    const matchedInvoice = await findInvoiceByNumber(invoiceNumber);
    const normalizedReason = normalizeText(reason);

    if (!matchedInvoice) {
      return {
        ok: false,
        requiresConfirmation: false,
        message: `I could not find ${invoiceNumber}. Try the full invoice number like INV-2026-0018.`,
        pendingAction: null,
      };
    }

    if (!normalizedReason) {
      return {
        ok: false,
        requiresConfirmation: false,
        message: `Requesting clarification for ${matchedInvoice.detail.invoiceNumber} requires a reason. Try: request clarification ${matchedInvoice.detail.invoiceNumber} missing PO number.`,
        pendingAction: null,
        invoice: matchedInvoice.detail,
      };
    }

    return {
      ok: true,
      requiresConfirmation: true,
      message: `Ready to request clarification for ${matchedInvoice.detail.invoiceNumber} with reason "${normalizedReason}". Reply yes to continue or no to cancel.`,
      pendingAction: {
        type: "request_clarification",
        label: `Request clarification for ${matchedInvoice.detail.invoiceNumber}`,
        payload: {
          approvalRecordId: matchedInvoice.approvalRecordId,
          invoiceNumber: matchedInvoice.detail.invoiceNumber,
          reason: normalizedReason,
          comment: normalizedReason,
          reviewer: getAssistantReviewerName(service),
        },
      },
      invoice: matchedInvoice.detail,
      reason: normalizedReason,
    };
  }

  async function executePendingAssistantAction(pendingAction) {
    if (!pendingAction?.type) {
      return withResult(false, "There is no pending assistant action to run.", {
        tone: "warning",
      });
    }

    switch (pendingAction.type) {
      case "approve_invoice": {
        const validation = await service.validateInvoiceApproval(
          pendingAction.payload.approvalRecordId,
        );
        const blockingReasons = toArray(validation?.blockingReasons).filter(Boolean);
        const warningReasons = toArray(validation?.warningReasons).filter(Boolean);

        if (validation?.canApprove === false) {
          return withResult(
            false,
            firstText(
              validation?.message,
              `${pendingAction.payload.invoiceNumber} is blocked and was not approved.`,
            ),
            {
              title: "Approval blocked",
              summary: firstText(
                validation?.message,
                `${pendingAction.payload.invoiceNumber} is blocked and was not approved.`,
              ),
              bullets: [
                ...blockingReasons.map((reason) => `Blocking reason: ${reason}`),
                ...warningReasons.map((reason) => `Warning reason: ${reason}`),
              ],
              guardrailCheck: validation,
              tone: "warning",
            },
          );
        }

        await service.approveInvoice(pendingAction.payload.approvalRecordId, {
          reviewer: pendingAction.payload.reviewer,
          comment: pendingAction.payload.comment,
        });

        return withResult(
          true,
          `${pendingAction.payload.invoiceNumber} was approved through the Creator workflow.`,
          {
            approvalRecordId: pendingAction.payload.approvalRecordId,
            bullets: warningReasons.map((reason) => `Warning acknowledged: ${reason}`),
            refreshScope: {
              inbox: true,
              dashboardSummary: true,
              detail: true,
              reviewerWorkload: false,
            },
          },
        );
      }
      case "refresh-invoice-from-books": {
        const refreshMethod =
          service.refreshInvoiceFromBooks ||
          service.refreshBooksInvoiceSnapshot ||
          service.refreshInvoice;

        if (typeof refreshMethod !== "function") {
          throw new Error("Refresh from Books is not configured in the current service.");
        }

        await refreshMethod.call(service, pendingAction.payload.approvalRecordId);

        return withResult(true, `${pendingAction.payload.invoiceNumber} was refreshed from Books through Creator.`, {
          approvalRecordId: pendingAction.payload.approvalRecordId,
          refreshScope: {
            inbox: true,
            dashboardSummary: true,
            detail: true,
            reviewerWorkload: false,
          },
        });
      }
      case "run-escalation-check": {
        const escalations = await service.checkApprovalEscalations();
        const reviewerWorkload = await service.loadReviewerWorkload();
        const escalatedItems = Array.isArray(escalations?.escalatedItems)
          ? escalations.escalatedItems
          : [];
        const dueSoonItems = Array.isArray(escalations?.dueSoonItems)
          ? escalations.dueSoonItems
          : [];

        return withResult(
          true,
          firstText(
            escalations?.message,
            `Escalation check completed with ${escalatedItems.length} escalated invoices and ${dueSoonItems.length} due soon invoices.`,
          ),
          {
            title: "Escalation check completed",
            summary: firstText(
              escalations?.message,
              `Escalation check completed with ${escalatedItems.length} escalated invoices and ${dueSoonItems.length} due soon invoices.`,
            ),
            bullets: [
              `${escalatedItems.length} escalated invoice(s).`,
              `${dueSoonItems.length} due soon invoice(s).`,
            ],
            data: {
              escalated: escalatedItems.slice(0, 5).map(normalizeBriefingItem),
              dueSoon: dueSoonItems.slice(0, 5).map(normalizeBriefingItem),
              reviewerWorkload: toArray(reviewerWorkload),
            },
            refreshScope: {
              inbox: true,
              dashboardSummary: true,
              detail: false,
              reviewerWorkload: true,
            },
          },
        );
      }
      case "add-invoice-comment": {
        const addCommentMethod = service.addComment || service.addApprovalComment;

        if (typeof addCommentMethod !== "function") {
          throw new Error("Add comment is not configured in the current service.");
        }

        await addCommentMethod.call(service, pendingAction.payload.approvalRecordId, {
          reviewer: pendingAction.payload.reviewer,
          comment: pendingAction.payload.comment,
          type: pendingAction.payload.commentType,
          commentType: pendingAction.payload.commentType,
        });

        return withResult(true, `Comment added to ${pendingAction.payload.invoiceNumber}.`, {
          approvalRecordId: pendingAction.payload.approvalRecordId,
          refreshScope: {
            inbox: true,
            dashboardSummary: false,
            detail: true,
            reviewerWorkload: false,
          },
        });
      }
      case "assign-reviewer": {
        await service.assignInvoiceReviewer(pendingAction.payload.approvalRecordId, {
          reviewerName: pendingAction.payload.reviewerName,
          reviewerEmail: pendingAction.payload.reviewerEmail,
          assignmentNote: "Assigned through AI Operations Assistant confirmation flow.",
        });

        return withResult(true, `${pendingAction.payload.invoiceNumber} was assigned to ${pendingAction.payload.reviewerEmail}.`, {
          approvalRecordId: pendingAction.payload.approvalRecordId,
          refreshScope: {
            inbox: true,
            dashboardSummary: true,
            detail: true,
            reviewerWorkload: true,
          },
        });
      }
      case "reject_invoice": {
        await service.rejectInvoice(pendingAction.payload.approvalRecordId, {
          reviewer: pendingAction.payload.reviewer,
          comment: pendingAction.payload.comment,
          exceptionReason: pendingAction.payload.reason,
        });

        return withResult(
          true,
          `${pendingAction.payload.invoiceNumber} was rejected through the Creator workflow.`,
          {
            approvalRecordId: pendingAction.payload.approvalRecordId,
            refreshScope: {
              inbox: true,
              dashboardSummary: true,
              detail: true,
              reviewerWorkload: false,
            },
          },
        );
      }
      case "request_clarification": {
        await service.requestClarification(pendingAction.payload.approvalRecordId, {
          reviewer: pendingAction.payload.reviewer,
          comment: pendingAction.payload.comment,
          exceptionReason: pendingAction.payload.reason,
        });

        return withResult(
          true,
          `${pendingAction.payload.invoiceNumber} was moved to clarification requested through the Creator workflow.`,
          {
            approvalRecordId: pendingAction.payload.approvalRecordId,
            refreshScope: {
              inbox: true,
              dashboardSummary: true,
              detail: true,
              reviewerWorkload: false,
            },
          },
        );
      }
      default:
        return withResult(false, "That assistant action is not supported yet.", {
          tone: "warning",
        });
    }
  }

  async function answerReviewerQuery({ prompt, approvalRecordId }) {
    const normalizedPrompt = normalizeText(prompt).toLowerCase();
    const parsedIntent = parseAssistantIntent(prompt);
    const invoiceNumber = extractInvoiceNumber(prompt);
    const reviewerEmail = extractReviewerEmail(prompt);
    const commentText = extractCommentAfterInvoice(prompt, invoiceNumber);
    const asksForApprovalRiskSummary =
      normalizedPrompt.includes("approval risk") ||
      normalizedPrompt.includes("approval risks") ||
      normalizedPrompt.includes("risk summary") ||
      normalizedPrompt.includes("summarize approval risk") ||
      normalizedPrompt.includes("summarise approval risk");
    const asksToRefreshInvoiceFromBooks =
      normalizedPrompt.includes("refresh") &&
      normalizedPrompt.includes("books");
    const asksToRunEscalationCheck =
      normalizedPrompt.includes("run escalation check") ||
      normalizedPrompt.includes("check escalations now") ||
      normalizedPrompt.includes("run escalations");
    const asksToAddComment = normalizedPrompt.startsWith("add comment");
    const asksToAssignReviewer = normalizedPrompt.startsWith("assign");
    const asksForSelectedInvoiceSummary =
      normalizedPrompt.includes("this invoice") ||
      normalizedPrompt.includes("selected invoice") ||
      normalizedPrompt.includes("invoice summary") ||
      normalizedPrompt.includes("summarize this invoice") ||
      normalizedPrompt.includes("summarise this invoice") ||
      normalizedPrompt.includes("invoice detail");
    const needsSelectedInvoice =
      asksForApprovalRiskSummary ||
      asksForSelectedInvoiceSummary ||
      (normalizedPrompt.includes("approve") && parsedIntent.intent === "unknown") ||
      normalizedPrompt.includes("block") ||
      normalizedPrompt.includes("difference") ||
      normalizedPrompt.includes("line item") ||
      normalizedPrompt.includes("line-item") ||
      normalizedPrompt.includes("why");

    if (parsedIntent.intent === "invoice reference required") {
      return withResult(
        false,
        `Include the invoice number so I can run the ${parsedIntent.requestedIntent} request safely. Examples: approve INV-2026-0018, reject INV-2026-0018 because wrong amount, or request clarification INV-2026-0018 missing PO number.`,
        {
          title: "Invoice reference required",
          summary: `Include the invoice number so I can run the ${parsedIntent.requestedIntent} request safely.`,
          bullets: [
            "approve INV-2026-0018",
            "reject INV-2026-0018 because wrong amount",
            "request clarification INV-2026-0018 missing PO number",
          ],
          tone: "warning",
        },
      );
    }

    if (parsedIntent.intent === "approve_invoice") {
      const prepared = await prepareApproveInvoice(
        parsedIntent.invoiceNumber,
        parsedIntent.comment,
      );
      return withResult(prepared.ok, prepared.message, {
        title: prepared.ok ? "Confirmation required" : "Approval blocked",
        summary: prepared.message,
        bullets: [
          ...toArray(prepared.blockingReasons).map((reason) => `Blocking reason: ${reason}`),
          ...toArray(prepared.warningReasons).map((reason) => `Warning reason: ${reason}`),
        ],
        pendingAction: prepared.pendingAction,
        requiresConfirmation: prepared.requiresConfirmation,
        guardrailCheck: prepared.guardrailCheck,
        tone: "warning",
      });
    }

    if (parsedIntent.intent === "reject_invoice") {
      const prepared = await prepareRejectInvoice(
        parsedIntent.invoiceNumber,
        parsedIntent.reason,
      );
      return withResult(prepared.ok, prepared.message, {
        title: prepared.ok ? "Confirmation required" : "Reject unavailable",
        summary: prepared.message,
        bullets: prepared.reason ? [`Reason: ${prepared.reason}`] : [],
        pendingAction: prepared.pendingAction,
        requiresConfirmation: prepared.requiresConfirmation,
        tone: "warning",
      });
    }

    if (parsedIntent.intent === "request_clarification") {
      const prepared = await prepareRequestClarification(
        parsedIntent.invoiceNumber,
        parsedIntent.reason,
      );
      return withResult(prepared.ok, prepared.message, {
        title: prepared.ok ? "Confirmation required" : "Clarification unavailable",
        summary: prepared.message,
        bullets: prepared.reason ? [`Reason: ${prepared.reason}`] : [],
        pendingAction: prepared.pendingAction,
        requiresConfirmation: prepared.requiresConfirmation,
        tone: "warning",
      });
    }

    if (asksToRunEscalationCheck) {
      const prepared = prepareRunEscalationCheck();
      return withResult(true, prepared.message, {
        title: "Confirmation required",
        summary: prepared.message,
        pendingAction: prepared.pendingAction,
        requiresConfirmation: true,
        tone: "warning",
      });
    }

    if (asksToRefreshInvoiceFromBooks) {
      const prepared = await prepareRefreshInvoiceFromBooks(invoiceNumber);
      return withResult(prepared.ok, prepared.message, {
        title: prepared.ok ? "Confirmation required" : "Refresh unavailable",
        summary: prepared.message,
        pendingAction: prepared.pendingAction,
        requiresConfirmation: prepared.requiresConfirmation,
        tone: prepared.ok ? "warning" : "warning",
      });
    }

    if (asksToAddComment) {
      const prepared = await prepareAddInvoiceComment(invoiceNumber, commentText);
      return withResult(prepared.ok, prepared.message, {
        title: prepared.ok ? "Confirmation required" : "Comment unavailable",
        summary: prepared.message,
        pendingAction: prepared.pendingAction,
        requiresConfirmation: prepared.requiresConfirmation,
        tone: prepared.ok ? "warning" : "warning",
      });
    }

    if (asksToAssignReviewer) {
      const prepared = await prepareAssignReviewer(invoiceNumber, reviewerEmail);
      return withResult(prepared.ok, prepared.message, {
        title: prepared.ok ? "Confirmation required" : "Assignment unavailable",
        summary: prepared.message,
        pendingAction: prepared.pendingAction,
        requiresConfirmation: prepared.requiresConfirmation,
        tone: prepared.ok ? "warning" : "warning",
      });
    }

    if (needsSelectedInvoice && !approvalRecordId) {
      return withResult(false, "Select an invoice first so I can answer that with live approval data.", {
        title: "Invoice selection needed",
        suggestions: [
          "Select an invoice, then ask why it is blocked.",
          "Select an invoice, then ask for line items.",
        ],
      });
    }

    if (
      asksForSelectedInvoiceSummary ||
      normalizedPrompt.includes("selected") ||
      normalizedPrompt.includes("detail") ||
      normalizedPrompt.includes("status")
    ) {
      const [detail, validation] = await Promise.all([
        service.loadInvoiceDetail(approvalRecordId),
        approvalRecordId ? service.validateInvoiceApproval(approvalRecordId) : Promise.resolve(null),
      ]);
      const reply = summarizeInvoiceDetail(detail, validation);
      return withResult(true, reply.summary, {
        ...reply,
        data: detail,
        guardrailCheck: validation,
      });
    }

    if (
      normalizedPrompt.includes("briefing") ||
      normalizedPrompt.includes("dashboard") ||
      (normalizedPrompt.includes("summary") && !approvalRecordId) ||
      normalizedPrompt.includes("overview")
    ) {
      const briefing = await buildApprovalBriefing();
      return withResult(true, briefing.summaryText, {
        title: "Daily approval briefing",
        summary: briefing.summaryText,
        bullets: briefing.attentionItems,
        suggestions: ["Ask for escalation risks.", "Ask for reviewer workload."],
        data: briefing,
      });
    }

    if (
      normalizedPrompt.includes("escalat") ||
      normalizedPrompt.includes("due soon") ||
      normalizedPrompt.includes("overdue")
    ) {
      await runApprovalEscalationCheck();
      const escalation = await prepareEscalationBriefing();
      return withResult(true, escalation.summaryText, {
        title: "Escalation briefing",
        summary: escalation.summaryText,
        bullets: [
          `${escalation.dueSoon.length} invoice(s) are due soon.`,
          `${escalation.escalated.length} invoice(s) are escalated or at risk.`,
        ],
        suggestions: ["Ask for reviewer workload.", "Ask for the selected invoice summary."],
        data: escalation,
      });
    }

    if (
      normalizedPrompt.includes("reviewer") ||
      normalizedPrompt.includes("workload") ||
      normalizedPrompt.includes("assignee")
    ) {
      const workload = await service.loadReviewerWorkload();
      const reply = summarizeWorkload(workload);
      return withResult(true, reply.summary, {
        ...reply,
        data: workload,
      });
    }

    if (
      normalizedPrompt.includes("line item") ||
      normalizedPrompt.includes("line-item") ||
      normalizedPrompt.includes("charges") ||
      normalizedPrompt.includes("items")
    ) {
      const detail = await service.loadInvoiceDetail(approvalRecordId);
      const reply = summarizeLineItems(detail);
      return withResult(true, reply.summary, {
        ...reply,
        data: detail.lineItems,
      });
    }

    if (
      asksForApprovalRiskSummary ||
      normalizedPrompt.includes("block") ||
      normalizedPrompt.includes("why can't") ||
      normalizedPrompt.includes("why cant") ||
      normalizedPrompt.includes("safe") ||
      normalizedPrompt.includes("approve") ||
      normalizedPrompt.includes("difference")
    ) {
      const explanation = await explainBlockedInvoice(approvalRecordId);
      return withResult(true, explanation.explanation, {
        title: explanation.canApprove ? "Approval review" : "Approval blocker review",
        summary: explanation.explanation,
        bullets: [
          ...explanation.blockingReasons,
          ...explanation.warningReasons,
          `Sync status: ${explanation.syncStatus || "Unknown"}.`,
          `Books payment status: ${explanation.paymentStatus || "Unknown"}.`,
        ],
        suggestions: [
          "Refresh from Books if the sync is stale.",
          "Open the sync card to compare the changed fields.",
        ],
        data: explanation,
        guardrailCheck: {
          canApprove: explanation.canApprove,
          blockingReasons: explanation.blockingReasons,
          warningReasons: explanation.warningReasons,
          message: explanation.booksSyncMessage,
          syncStatus: explanation.syncStatus,
          booksPaymentStatus: explanation.paymentStatus,
          lastBooksSyncAt: explanation.lastBooksSyncAt,
          lastComparedAt: explanation.lastComparedAt,
        },
      });
    }

    return withResult(false, "I can answer only from live approval data. Try one of the supported questions below.", {
      title: "Supported assistant questions",
      summary:
        "Ask for a daily briefing, escalation risks, reviewer workload, line items, selected invoice summary, why the selected invoice is blocked, approve INV-2026-0018, reject INV-2026-0018 because wrong amount, request clarification INV-2026-0018 missing PO number, refresh INV-2026-0018 from Books, run escalation check, add comment INV-2026-0018 Need manager review, or assign INV-2026-0018 to finance@example.com.",
      bullets: approvalRecordId
        ? [
            "Why is this invoice blocked?",
            "Show me the line items.",
            "Summarize this invoice.",
            "Approve the selected invoice.",
          ]
        : [
            "Give me a daily briefing.",
            "Show escalation risks.",
            "Show reviewer workload.",
          ],
      suggestions: [
        approvalRecordId ? "Why is this invoice blocked?" : "Give me a daily briefing.",
        approvalRecordId ? "Show me the line items." : "Show escalation risks.",
        approvalRecordId ? "Summarize this invoice." : "Show reviewer workload.",
      ],
    });
  }

  return {
    getInvoiceApprovalDashboard,
    findInvoiceApprovals,
    getInvoiceApprovalDetail,
    validateInvoiceApprovalSafety,
    getReviewerWorkload,
    refreshInvoiceFromBooks,
    runApprovalEscalationCheck,
    assignInvoiceReviewer,
    addInvoiceApprovalComment,
    approveInvoiceSafely,
    rejectInvoiceWithReason,
    requestInvoiceClarification,
    buildApprovalBriefing,
    explainBlockedInvoice,
    prepareRefreshInvoiceFromBooks,
    prepareRunEscalationCheck,
    prepareAddInvoiceComment,
    prepareAssignReviewer,
    prepareApproveInvoice,
    prepareRejectInvoice,
    prepareRequestClarification,
    executePendingAssistantAction,
    prepareReviewerAssignmentPreview,
    prepareEscalationBriefing,
    answerReviewerQuery,
  };
}
