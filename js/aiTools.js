function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
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
    prepareReviewerAssignmentPreview,
    prepareEscalationBriefing,
  };
}
