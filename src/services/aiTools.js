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
  return { ok, message, ...extras };
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

function buildDifferenceGuidance(detail, validation) {
  const approval = getApprovalSection(detail);
  const invoice = getInvoiceSection(detail);
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
    approval.differenceSummary,
    detail.differenceSummary,
    `A difference was detected between the latest Books invoice and the Creator approval snapshot for ${invoice.invoiceNumber || "this invoice"}. Refresh from Books, review the changed fields, and confirm the approval record still matches before approving.`,
  );
}

export function createInvoiceApprovalAiTools(service) {
  return {
    async getInvoiceApprovalDashboard() {
      try {
        const data = await service.loadDashboardSummary();
        return withResult(true, "Approval dashboard loaded successfully.", { data });
      } catch (error) {
        return withResult(false, "Failed to load the approval dashboard.", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },

    async findInvoiceApprovals(filters = {}) {
      try {
        const data = await service.loadInbox(filters);
        return withResult(true, "Invoice approvals loaded successfully.", { data });
      } catch (error) {
        return withResult(false, "Failed to load invoice approvals.", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },

    async getInvoiceApprovalDetail(approvalRecordId) {
      try {
        const data = await service.loadInvoiceDetail(approvalRecordId);
        return withResult(true, "Invoice approval detail loaded successfully.", { data });
      } catch (error) {
        return withResult(false, "Failed to load invoice approval detail.", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },

    async validateInvoiceApprovalSafety(approvalRecordId) {
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
    },

    async getReviewerWorkload() {
      try {
        const data = await service.loadReviewerWorkload();
        return withResult(true, "Reviewer workload loaded successfully.", { data });
      } catch (error) {
        return withResult(false, "Failed to load reviewer workload.", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },

    async refreshInvoiceFromBooks(approvalRecordId) {
      try {
        const refreshMethod =
          service.refreshInvoiceFromBooks ||
          service.refreshBooksInvoiceSnapshot ||
          service.refreshInvoice;

        if (typeof refreshMethod !== "function") {
          throw new Error("Refresh from Books is not configured in the current service.");
        }

        const data = await refreshMethod.call(service, approvalRecordId);
        return withResult(true, "Books snapshot refreshed successfully.", { data });
      } catch (error) {
        return withResult(false, "Failed to refresh the Books snapshot.", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },

    async runApprovalEscalationCheck() {
      try {
        const data =
          typeof service.checkApprovalEscalations === "function"
            ? await service.checkApprovalEscalations()
            : { ok: true, message: "No escalation function is configured." };
        return withResult(true, firstText(data?.message, "Escalation check completed."), {
          data,
        });
      } catch (error) {
        return withResult(false, "Failed to run the escalation check.", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },

    async assignInvoiceReviewer(approvalRecordId, reviewerName, reviewerEmail, assignmentNote) {
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
    },

    async addInvoiceApprovalComment(approvalRecordId, comment, reviewer, commentType = "Internal note") {
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
    },

    async approveInvoiceSafely(approvalRecordId, comment, reviewer, confirmed = false) {
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
        const data = await service.approveInvoice(approvalRecordId, { comment, reviewer });
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
    },

    async rejectInvoiceWithReason(approvalRecordId, comment, reviewer, exceptionReason) {
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
    },

    async requestInvoiceClarification(approvalRecordId, comment, reviewer, exceptionReason) {
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
    },

    async buildApprovalBriefing() {
      const [dashboard, failed, reviewNeeded, manualReview, unassigned, reviewerWorkload] =
        await Promise.all([
          service.loadDashboardSummary(),
          service.loadInbox({ syncFilter: "Failed", pageSize: 200 }),
          service.loadInbox({ syncFilter: "Review Needed", pageSize: 200 }),
          service.loadInbox({ syncFilter: "Manual Review", pageSize: 200 }),
          service.loadInbox({ reviewerFilter: "Unassigned", pageSize: 200 }),
          service.loadReviewerWorkload(),
        ]);

      return {
        summaryText: `Approval dashboard loaded with ${dashboard?.approvalSummary?.pending ?? 0} pending invoice(s), ${toInboxArray(failed).length} failed refresh, and ${toInboxArray(unassigned).length} unassigned invoice(s).`,
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
    },

    async explainBlockedInvoice(approvalRecordId) {
      const [detail, validation] = await Promise.all([
        service.loadInvoiceDetail(approvalRecordId),
        service.validateInvoiceApproval(approvalRecordId),
      ]);
      const invoice = getInvoiceSection(detail);
      const approval = getApprovalSection(detail);
      const blockingReasons = toArray(validation?.blockingReasons).filter(Boolean);
      const warningReasons = toArray(validation?.warningReasons).filter(Boolean);

      return {
        ok: true,
        invoiceNumber: invoice.invoiceNumber || approvalRecordId,
        canApprove: validation?.canApprove !== false,
        severity: firstText(validation?.severity, blockingReasons.length ? "error" : warningReasons.length ? "warning" : "success"),
        explanation: [
          firstText(validation?.message, "Validation completed."),
          buildDifferenceGuidance(detail, validation),
        ].join(" "),
        blockingReasons,
        warningReasons,
        booksSyncMessage: firstText(validation?.message, approval.syncStatus),
        differenceSummary: firstText(approval.differenceSummary, detail.differenceSummary, "No difference summary is available."),
        paymentStatus: firstText(validation?.booksPaymentStatus, invoice.paymentStatus, "Unknown"),
        syncStatus: firstText(validation?.syncStatus, approval.syncStatus, "Unknown"),
        lastBooksSyncAt: firstText(validation?.lastBooksSyncAt, approval.lastBooksSyncAt),
        lastComparedAt: firstText(validation?.lastComparedAt, approval.lastComparedAt),
      };
    },

    async prepareReviewerAssignmentPreview(filters, reviewerName, reviewerEmail) {
      const inbox = await service.loadInbox({ ...filters, page: 1, pageSize: 200 });
      return {
        ok: true,
        message: `${toInboxArray(inbox).length} invoice(s) are ready for reviewer assignment preview.`,
        requiresConfirmation: true,
        data: toInboxArray(inbox).map((item) => ({
          ...normalizeBriefingItem(item),
          targetReviewerName: reviewerName,
          targetReviewerEmail: reviewerEmail,
        })),
      };
    },

    async prepareEscalationBriefing() {
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
    },

    async answerReviewerQuery({ prompt, approvalRecordId, filters = {} }) {
      const normalizedPrompt = normalizeText(prompt).toLowerCase();
      const needsSelectedInvoice =
        normalizedPrompt.includes("this invoice") ||
        normalizedPrompt.includes("selected invoice") ||
        normalizedPrompt.includes("approve") ||
        normalizedPrompt.includes("block") ||
        normalizedPrompt.includes("difference") ||
        normalizedPrompt.includes("line item") ||
        normalizedPrompt.includes("line-item") ||
        normalizedPrompt.includes("invoice detail") ||
        normalizedPrompt.includes("why");

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
        normalizedPrompt.includes("briefing") ||
        normalizedPrompt.includes("dashboard") ||
        normalizedPrompt.includes("summary") ||
        normalizedPrompt.includes("overview")
      ) {
        const briefing = await this.buildApprovalBriefing();
        return withResult(true, briefing.summaryText, {
          title: "Daily approval briefing",
          summary: briefing.summaryText,
          bullets: briefing.attentionItems,
          suggestions: [
            "Ask for escalation risks.",
            "Ask for reviewer workload.",
          ],
          data: briefing,
        });
      }

      if (
        normalizedPrompt.includes("escalat") ||
        normalizedPrompt.includes("due soon") ||
        normalizedPrompt.includes("overdue")
      ) {
        await this.runApprovalEscalationCheck();
        const escalation = await this.prepareEscalationBriefing();
        return withResult(true, escalation.summaryText, {
          title: "Escalation briefing",
          summary: escalation.summaryText,
          bullets: [
            `${escalation.dueSoon.length} invoice(s) are due soon.`,
            `${escalation.escalated.length} invoice(s) are escalated or at risk.`,
          ],
          suggestions: [
            "Ask for reviewer workload.",
            "Ask for the selected invoice summary.",
          ],
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
        normalizedPrompt.includes("block") ||
        normalizedPrompt.includes("why can't") ||
        normalizedPrompt.includes("why cant") ||
        normalizedPrompt.includes("safe") ||
        normalizedPrompt.includes("approve") ||
        normalizedPrompt.includes("difference")
      ) {
        const explanation = await this.explainBlockedInvoice(approvalRecordId);
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

      if (
        normalizedPrompt.includes("selected") ||
        normalizedPrompt.includes("detail") ||
        normalizedPrompt.includes("status") ||
        approvalRecordId
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

      const dashboard = await service.loadDashboardSummary();
      return withResult(true, "I pulled the latest approval dashboard summary.", {
        title: "Approval dashboard",
        summary: `There are ${dashboard?.approvalSummary?.pending ?? 0} pending approval(s), ${dashboard?.syncSummary?.failed ?? 0} failed refresh(es), and ${dashboard?.agingSummary?.dueSoon ?? 0} due-soon invoice(s).`,
        bullets: [
          `Pending: ${dashboard?.approvalSummary?.pending ?? 0}`,
          `Manual review: ${dashboard?.syncSummary?.manualReview ?? 0}`,
          `Failed refresh: ${dashboard?.syncSummary?.failed ?? 0}`,
          `Overdue: ${dashboard?.agingSummary?.overdueDueDate ?? 0}`,
        ],
        suggestions: [
          "Ask for daily briefing.",
          "Ask for escalation summary.",
          "Select an invoice and ask why it is blocked.",
        ],
        data: dashboard,
      });
    },
  };
}
