import { parseAssistantIntent } from "./chatbotAssistant";

const MAX_LIST_ITEMS = 5;
const MAX_WORKLOAD_ITEMS = 5;

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeCompareText(value) {
  return normalizeText(value).replace(/[^a-z0-9]/gi, "").toUpperCase();
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

function toSentenceCaseFromEmail(email) {
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

function createAssistantMessage(content, data) {
  return {
    role: "assistant",
    content,
    ...(data ? { data } : {}),
  };
}

function toInboxItems(response) {
  return Array.isArray(response?.items) ? response.items : [];
}

function normalizeInvoiceItem(item = {}) {
  return {
    approvalRecordId: item.approvalRecordId || "",
    booksInvoiceId: item.booksInvoiceId || "",
    invoiceNumber: item.invoiceNumber || "",
    customerName: item.customerName || "",
    approvalStatus: item.approvalStatus || "Unknown",
    syncStatus: item.syncStatus || "Unknown",
    paymentStatus: item.paymentStatus || "Unknown",
    assignedReviewer: item.assignedReviewer || "Unassigned",
    dueDate: item.dueDate || "",
    invoiceTotal: Number(item.invoiceTotal || 0),
    currencyCode: item.currencyCode || "USD",
    differenceFound: item.differenceFound === true,
  };
}

function normalizeReviewerWorkloadItem(item = {}) {
  return {
    reviewerName: item.reviewerName || "Unassigned",
    reviewerEmail: item.reviewerEmail || "",
    assignedCount: Number(item.assignedCount || 0),
    pendingCount: Number(item.pendingCount || 0),
    needsClarificationCount: Number(item.needsClarificationCount || 0),
    reviewAmount: Number(item.reviewAmount || 0),
    unassignedCount: Number(item.unassignedCount || 0),
  };
}

function normalizeAuditItem(item = {}) {
  return {
    id: item.id || "",
    eventType: item.eventType || "Status Changed",
    summary: item.summary || "",
    actor: item.actor || "",
    createdAt: item.createdAt || "",
  };
}

function buildStat(label, value, helper = "") {
  return { label, value, helper };
}

function buildInvoiceListData(title, items, emptyMessage) {
  return {
    type: "invoice-list",
    title,
    items: items.slice(0, MAX_LIST_ITEMS).map(normalizeInvoiceItem),
    totalCount: items.length,
    emptyMessage,
  };
}

function buildApprovalCheckContent(invoiceNumber, validation) {
  const blockingReasons = Array.isArray(validation?.blockingReasons)
    ? validation.blockingReasons.filter(Boolean)
    : [];
  const warningReasons = Array.isArray(validation?.warningReasons)
    ? validation.warningReasons.filter(Boolean)
    : [];

  if (blockingReasons.length) {
    return `${invoiceNumber} is blocked right now. Review the blocking reasons before anyone approves it.`;
  }

  if (warningReasons.length) {
    return `${invoiceNumber} is not hard-blocked, but the approval safety check still returned warnings that need reviewer confirmation.`;
  }

  return `${invoiceNumber} is currently safe to approve based on the latest Creator validation result.`;
}

async function getDashboardSummaryMessage(service) {
  const summary = await service.loadDashboardSummary();
  const pending = Number(summary?.approvalSummary?.pending || 0);
  const failed = Number(summary?.syncSummary?.failed || 0);
  const manualReview = Number(summary?.syncSummary?.manualReview || 0);
  const dueSoon = Number(summary?.agingSummary?.dueSoon || 0);

  return createAssistantMessage(
    `Dashboard summary: ${pending} pending approvals, ${failed} failed refreshes, ${manualReview} invoices in manual review, and ${dueSoon} due soon.`,
    {
      type: "dashboard-summary",
      stats: [
        buildStat("Pending", pending, "Approval queue"),
        buildStat("Failed Refreshes", failed, "Books refresh issues"),
        buildStat("Manual Review", manualReview, "Reviewer confirmation needed"),
        buildStat("Due Soon", dueSoon, "Needs near-term attention"),
      ],
      generatedAt: summary?.generatedAt || "",
    },
  );
}

async function getInvoiceListMessage(service, title, filters, emptyMessage, contentBuilder) {
  const response = await service.loadInbox({
    statusFilter: "All",
    paymentFilter: "All",
    priorityFilter: "All",
    reviewerFilter: "All Reviewers",
    page: 1,
    pageSize: 200,
    sortBy: "dueDate",
    sortDirection: "asc",
    ...filters,
  });
  const items = toInboxItems(response);

  return createAssistantMessage(
    contentBuilder(items.length),
    buildInvoiceListData(title, items, emptyMessage),
  );
}

export async function getDailyBriefing(service) {
  const [dashboardSummary, failedRefreshes, reviewNeeded, manualReview, unassigned, escalations, reviewerWorkload] =
    await Promise.all([
      service.loadDashboardSummary(),
      service.loadInbox({ syncFilter: "Failed", page: 1, pageSize: 200, sortBy: "dueDate", sortDirection: "asc" }),
      service.loadInbox({ syncFilter: "Review Needed", page: 1, pageSize: 200, sortBy: "dueDate", sortDirection: "asc" }),
      service.loadInbox({ syncFilter: "Manual Review", page: 1, pageSize: 200, sortBy: "dueDate", sortDirection: "asc" }),
      service.loadInbox({ reviewerFilter: "Unassigned", page: 1, pageSize: 200, sortBy: "dueDate", sortDirection: "asc" }),
      service.checkApprovalEscalations(),
      service.loadReviewerWorkload(),
    ]);

  const failedItems = toInboxItems(failedRefreshes);
  const reviewNeededItems = toInboxItems(reviewNeeded);
  const manualReviewItems = toInboxItems(manualReview);
  const unassignedItems = toInboxItems(unassigned);
  const escalatedItems = Array.isArray(escalations?.escalatedItems) ? escalations.escalatedItems : [];

  return createAssistantMessage(
    `Daily briefing: ${Number(dashboardSummary?.approvalSummary?.pending || 0)} pending approvals, ${failedItems.length} failed refreshes, ${manualReviewItems.length} invoices in manual review, ${unassignedItems.length} unassigned invoices, and ${escalatedItems.length} escalations.`,
    {
      type: "daily-briefing",
      stats: [
        buildStat("Pending", Number(dashboardSummary?.approvalSummary?.pending || 0)),
        buildStat("Failed Refreshes", failedItems.length),
        buildStat("Review Needed", reviewNeededItems.length),
        buildStat("Manual Review", manualReviewItems.length),
        buildStat("Unassigned", unassignedItems.length),
        buildStat("Escalations", escalatedItems.length),
      ],
      failedRefreshes: failedItems.slice(0, MAX_LIST_ITEMS).map(normalizeInvoiceItem),
      reviewNeeded: reviewNeededItems.slice(0, MAX_LIST_ITEMS).map(normalizeInvoiceItem),
      manualReview: manualReviewItems.slice(0, MAX_LIST_ITEMS).map(normalizeInvoiceItem),
      unassignedInvoices: unassignedItems.slice(0, MAX_LIST_ITEMS).map(normalizeInvoiceItem),
      escalations: escalatedItems.slice(0, MAX_LIST_ITEMS).map(normalizeInvoiceItem),
      reviewerWorkload: (Array.isArray(reviewerWorkload) ? reviewerWorkload : [])
        .slice(0, MAX_WORKLOAD_ITEMS)
        .map(normalizeReviewerWorkloadItem),
      checkedAt: escalations?.checkedAt || dashboardSummary?.generatedAt || "",
    },
  );
}

export async function findInvoiceByNumber(service, invoiceNumber) {
  const normalizedInvoiceNumber = normalizeCompareText(invoiceNumber);

  if (!normalizedInvoiceNumber) {
    return null;
  }

  const response = await service.loadInbox({
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

  const items = toInboxItems(response);
  const matchedItem =
    items.find(
      (item) => normalizeCompareText(item.invoiceNumber) === normalizedInvoiceNumber,
    ) ||
    items.find((item) =>
      normalizeCompareText(item.invoiceNumber).includes(normalizedInvoiceNumber),
    );

  if (!matchedItem?.approvalRecordId) {
    return null;
  }

  const detail = await service.loadInvoiceDetail(matchedItem.approvalRecordId);

  return {
    approvalRecordId: matchedItem.approvalRecordId,
    item: normalizeInvoiceItem(matchedItem),
    detail,
  };
}

export async function prepareRefreshInvoiceFromBooks(service, invoiceNumber) {
  const matchedInvoice = await findInvoiceByNumber(service, invoiceNumber);

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

export function prepareRunEscalationCheck() {
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

export async function prepareAddInvoiceComment(service, invoiceNumber, comment) {
  const matchedInvoice = await findInvoiceByNumber(service, invoiceNumber);
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

export async function prepareAssignReviewer(service, invoiceNumber, reviewerEmail) {
  const matchedInvoice = await findInvoiceByNumber(service, invoiceNumber);
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
        reviewerName: toSentenceCaseFromEmail(normalizedReviewerEmail),
      },
    },
  };
}

export async function executePendingAssistantAction(service, pendingAction) {
  if (!pendingAction?.type) {
    return createAssistantMessage("There is no pending assistant action to run.", {
      type: "warning",
      tone: "warning",
    });
  }

  switch (pendingAction.type) {
    case "refresh-invoice-from-books": {
      const refreshMethod =
        service.refreshBooksInvoice ||
        service.refreshBooksInvoiceSnapshot ||
        service.refreshInvoiceFromBooks ||
        service.refreshInvoice;

      if (typeof refreshMethod !== "function") {
        throw new Error("Refresh from Books is not configured in the current service.");
      }

      await refreshMethod.call(service, pendingAction.payload.approvalRecordId);

      return createAssistantMessage(
        `${pendingAction.payload.invoiceNumber} was refreshed from Books through Creator.`,
        {
          type: "action-result",
          tone: "success",
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
    case "run-escalation-check": {
      const escalations = await service.checkApprovalEscalations();
      const reviewerWorkload = await service.loadReviewerWorkload();
      const escalatedItems = Array.isArray(escalations?.escalatedItems)
        ? escalations.escalatedItems
        : [];
      const dueSoonItems = Array.isArray(escalations?.dueSoonItems)
        ? escalations.dueSoonItems
        : [];

      return createAssistantMessage(
        firstText(
          escalations?.message,
          `Escalation check completed with ${escalatedItems.length} escalated invoices and ${dueSoonItems.length} due soon invoices.`,
        ),
        {
          type: "escalation-briefing",
          tone: "success",
          escalatedItems: escalatedItems.slice(0, MAX_LIST_ITEMS).map(normalizeInvoiceItem),
          dueSoonItems: dueSoonItems.slice(0, MAX_LIST_ITEMS).map(normalizeInvoiceItem),
          reviewerWorkload: (Array.isArray(reviewerWorkload) ? reviewerWorkload : [])
            .slice(0, MAX_WORKLOAD_ITEMS)
            .map(normalizeReviewerWorkloadItem),
          checkedAt: escalations?.checkedAt || "",
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

      return createAssistantMessage(
        `Comment added to ${pendingAction.payload.invoiceNumber}.`,
        {
          type: "action-result",
          tone: "success",
          approvalRecordId: pendingAction.payload.approvalRecordId,
          refreshScope: {
            inbox: true,
            dashboardSummary: false,
            detail: true,
            reviewerWorkload: false,
          },
        },
      );
    }
    case "assign-reviewer": {
      await service.assignInvoiceReviewer(pendingAction.payload.approvalRecordId, {
        reviewerName: pendingAction.payload.reviewerName,
        reviewerEmail: pendingAction.payload.reviewerEmail,
        assignmentNote: "Assigned through AI Operations Assistant confirmation flow.",
      });

      return createAssistantMessage(
        `${pendingAction.payload.invoiceNumber} was assigned to ${pendingAction.payload.reviewerEmail}.`,
        {
          type: "action-result",
          tone: "success",
          approvalRecordId: pendingAction.payload.approvalRecordId,
          refreshScope: {
            inbox: true,
            dashboardSummary: true,
            detail: true,
            reviewerWorkload: true,
          },
        },
      );
    }
    default:
      return createAssistantMessage("That assistant action is not supported yet.", {
        type: "warning",
        tone: "warning",
      });
  }
}

export async function explainBlockedInvoice(service, invoiceNumber) {
  const matchedInvoice = await findInvoiceByNumber(service, invoiceNumber);

  if (!matchedInvoice) {
    return createAssistantMessage(
      `I could not find ${invoiceNumber}. Try the full invoice number like INV-2026-0018.`,
      {
        type: "warning",
      },
    );
  }

  const validation = await service.validateInvoiceApproval(matchedInvoice.approvalRecordId);
  const detail = matchedInvoice.detail;
  const blockingReasons = Array.isArray(validation?.blockingReasons)
    ? validation.blockingReasons.filter(Boolean)
    : [];
  const warningReasons = Array.isArray(validation?.warningReasons)
    ? validation.warningReasons.filter(Boolean)
    : [];

  return createAssistantMessage(
    buildApprovalCheckContent(detail.invoiceNumber || invoiceNumber, validation),
    {
      type: "approval-check",
      approvalRecordId: detail.approvalRecordId,
      invoice: normalizeInvoiceItem(detail),
      canApprove: validation?.canApprove !== false,
      blockingReasons,
      warningReasons,
      syncStatus: detail.syncStatus || validation?.syncStatus || "Unknown",
      paymentStatus: detail.paymentStatus || validation?.booksPaymentStatus || "Unknown",
      differenceFound: validation?.differenceFound === true || detail.differenceFound === true,
      lastBooksSyncAt: validation?.lastBooksSyncAt || detail.lastBooksSyncAt || "",
      lastComparedAt: validation?.lastComparedAt || detail.lastComparedAt || "",
      guardrailCheck: validation,
      tone: blockingReasons.length ? "warning" : "neutral",
    },
  );
}

export async function canApproveInvoice(service, invoiceNumber) {
  const matchedInvoice = await findInvoiceByNumber(service, invoiceNumber);

  if (!matchedInvoice) {
    return createAssistantMessage(
      `I could not find ${invoiceNumber}. Try the full invoice number like INV-2026-0018.`,
      {
        type: "warning",
      },
    );
  }

  const validation = await service.validateInvoiceApproval(matchedInvoice.approvalRecordId);
  const invoice = normalizeInvoiceItem(matchedInvoice.detail);

  return createAssistantMessage(
    buildApprovalCheckContent(invoice.invoiceNumber || invoiceNumber, validation),
    {
      type: "approval-check",
      approvalRecordId: matchedInvoice.approvalRecordId,
      invoice,
      canApprove: validation?.canApprove !== false,
      blockingReasons: Array.isArray(validation?.blockingReasons)
        ? validation.blockingReasons.filter(Boolean)
        : [],
      warningReasons: Array.isArray(validation?.warningReasons)
        ? validation.warningReasons.filter(Boolean)
        : [],
      syncStatus: validation?.syncStatus || matchedInvoice.detail.syncStatus || "Unknown",
      paymentStatus:
        validation?.booksPaymentStatus || matchedInvoice.detail.paymentStatus || "Unknown",
      differenceFound:
        validation?.differenceFound === true || matchedInvoice.detail.differenceFound === true,
      lastBooksSyncAt: validation?.lastBooksSyncAt || matchedInvoice.detail.lastBooksSyncAt || "",
      lastComparedAt: validation?.lastComparedAt || matchedInvoice.detail.lastComparedAt || "",
      guardrailCheck: validation,
      tone: validation?.canApprove === false ? "warning" : "success",
    },
  );
}

export async function getInvoiceSummary(service, invoiceNumber) {
  const matchedInvoice = await findInvoiceByNumber(service, invoiceNumber);

  if (!matchedInvoice) {
    return createAssistantMessage(
      `I could not find ${invoiceNumber}. Try the full invoice number like INV-2026-0018.`,
      {
        type: "warning",
      },
    );
  }

  const validation = await service.validateInvoiceApproval(matchedInvoice.approvalRecordId);
  const detail = matchedInvoice.detail;

  return createAssistantMessage(
    `${detail.invoiceNumber} for ${detail.customerName || "the selected customer"} is ${detail.approvalStatus || "Unknown"} with ${detail.syncStatus || "Unknown"} sync status.`,
    {
      type: "invoice-summary",
      approvalRecordId: detail.approvalRecordId,
      invoice: {
        ...normalizeInvoiceItem(detail),
        booksStatus: detail.booksStatus || "Unknown",
        assignmentNote: detail.assignmentNote || "",
        differenceSummary: detail.differenceSummary || "",
        lineItemCount: Array.isArray(detail.lineItems) ? detail.lineItems.length : 0,
        lastActionBy: detail.lastActionBy || "",
        lastActionDate: detail.lastActionDate || "",
        lastEventType: detail.lastEventType || "",
      },
      recentAudit: Array.isArray(detail.audit)
        ? detail.audit.slice(0, 3).map(normalizeAuditItem)
        : [],
      blockingReasons: Array.isArray(validation?.blockingReasons)
        ? validation.blockingReasons.filter(Boolean)
        : [],
      warningReasons: Array.isArray(validation?.warningReasons)
        ? validation.warningReasons.filter(Boolean)
        : [],
      guardrailCheck: validation,
    },
  );
}

export async function getEscalationBriefing(service) {
  const [escalations, reviewerWorkload] = await Promise.all([
    service.checkApprovalEscalations(),
    service.loadReviewerWorkload(),
  ]);

  const escalatedItems = Array.isArray(escalations?.escalatedItems)
    ? escalations.escalatedItems
    : [];
  const dueSoonItems = Array.isArray(escalations?.dueSoonItems) ? escalations.dueSoonItems : [];

  return createAssistantMessage(
    `Escalation briefing: ${escalatedItems.length} escalated invoices and ${dueSoonItems.length} due soon invoices need attention.`,
    {
      type: "escalation-briefing",
      escalatedItems: escalatedItems.slice(0, MAX_LIST_ITEMS).map(normalizeInvoiceItem),
      dueSoonItems: dueSoonItems.slice(0, MAX_LIST_ITEMS).map(normalizeInvoiceItem),
      reviewerWorkload: (Array.isArray(reviewerWorkload) ? reviewerWorkload : [])
        .slice(0, MAX_WORKLOAD_ITEMS)
        .map(normalizeReviewerWorkloadItem),
      checkedAt: escalations?.checkedAt || "",
    },
  );
}

export async function handleAssistantMessage(service, message) {
  const parsedIntent = parseAssistantIntent(message);

  switch (parsedIntent.intent) {
    case "confirm pending action":
      return createAssistantMessage("Reply yes only when you want to execute the pending action.", {
        type: "help",
      });
    case "cancel pending action":
      return createAssistantMessage("The pending action was not executed.", {
        type: "help",
      });
    case "daily briefing":
      return getDailyBriefing(service);
    case "dashboard summary":
      return getDashboardSummaryMessage(service);
    case "failed refreshes":
      return getInvoiceListMessage(
        service,
        "Failed Refreshes",
        { syncFilter: "Failed" },
        "No failed Books refreshes are in the queue right now.",
        (count) =>
          count
            ? `${count} invoice(s) currently have failed Books refreshes.`
            : "No failed Books refreshes are in the queue right now.",
      );
    case "review needed":
      return getInvoiceListMessage(
        service,
        "Review Needed",
        { syncFilter: "Review Needed" },
        "No invoices are currently marked as review needed.",
        (count) =>
          count
            ? `${count} invoice(s) still need reviewer attention.`
            : "No invoices are currently marked as review needed.",
      );
    case "manual review":
      return getInvoiceListMessage(
        service,
        "Manual Review",
        { syncFilter: "Manual Review" },
        "No invoices are currently in manual review.",
        (count) =>
          count
            ? `${count} invoice(s) are in manual review.`
            : "No invoices are currently in manual review.",
      );
    case "unassigned invoices":
      return getInvoiceListMessage(
        service,
        "Unassigned Invoices",
        { reviewerFilter: "Unassigned" },
        "Every open invoice currently has a reviewer assigned.",
        (count) =>
          count
            ? `${count} invoice(s) are still unassigned.`
            : "Every open invoice currently has a reviewer assigned.",
      );
    case "reviewer workload": {
      const workload = await service.loadReviewerWorkload();
      const items = Array.isArray(workload) ? workload : [];
      return createAssistantMessage(
        items.length
          ? `Reviewer workload loaded for ${items.length} reviewer record(s).`
          : "No reviewer workload data is available right now.",
        {
          type: "reviewer-workload",
          items: items
            .slice(0, MAX_WORKLOAD_ITEMS)
            .map(normalizeReviewerWorkloadItem),
          totalCount: items.length,
        },
      );
    }
    case "escalation briefing":
      return getEscalationBriefing(service);
    case "run escalation check": {
      const prepared = prepareRunEscalationCheck();
      return createAssistantMessage(prepared.message, {
        type: "pending-action",
        tone: "warning",
        pendingAction: prepared.pendingAction,
      });
    }
    case "refresh invoice from books": {
      const prepared = await prepareRefreshInvoiceFromBooks(service, parsedIntent.invoiceNumber);
      return createAssistantMessage(prepared.message, {
        type: prepared.ok ? "pending-action" : "warning",
        tone: prepared.ok ? "warning" : "warning",
        ...(prepared.pendingAction ? { pendingAction: prepared.pendingAction } : {}),
      });
    }
    case "add comment to invoice": {
      const prepared = await prepareAddInvoiceComment(
        service,
        parsedIntent.invoiceNumber,
        parsedIntent.comment,
      );
      return createAssistantMessage(prepared.message, {
        type: prepared.ok ? "pending-action" : "warning",
        tone: prepared.ok ? "warning" : "warning",
        ...(prepared.pendingAction ? { pendingAction: prepared.pendingAction } : {}),
      });
    }
    case "assign reviewer": {
      const prepared = await prepareAssignReviewer(
        service,
        parsedIntent.invoiceNumber,
        parsedIntent.reviewerEmail,
      );
      return createAssistantMessage(prepared.message, {
        type: prepared.ok ? "pending-action" : "warning",
        tone: prepared.ok ? "warning" : "warning",
        ...(prepared.pendingAction ? { pendingAction: prepared.pendingAction } : {}),
      });
    }
    case "why blocked":
      return explainBlockedInvoice(service, parsedIntent.invoiceNumber);
    case "can approve":
      return canApproveInvoice(service, parsedIntent.invoiceNumber);
    case "invoice summary":
      return getInvoiceSummary(service, parsedIntent.invoiceNumber);
    case "invoice reference required":
      return createAssistantMessage(
        `Include the invoice number so I can run the ${parsedIntent.requestedIntent} check safely. Example: ${parsedIntent.requestedIntent} INV-2026-0018.`,
        {
          type: "warning",
        },
      );
    default:
      return createAssistantMessage(
        "Try a quick action or ask one of these: daily briefing, failed refreshes, reviewer workload, escalation briefing, why blocked INV-2026-0018, can approve INV-2026-0018, invoice summary INV-2026-0018, refresh INV-2026-0018 from Books, run escalation check, add comment INV-2026-0018 Need manager review, or assign INV-2026-0018 to finance@example.com.",
        {
          type: "help",
        },
      );
  }
}
