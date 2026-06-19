import { createMockState } from "./mockData.js";

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function findRecordIndex(state, recordId) {
  return state.findIndex((entry) => entry.approvalRecordId === recordId);
}

function toInboxItem(record) {
  return {
    approvalRecordId: record.approvalRecordId,
    booksInvoiceId: record.invoice.booksInvoiceId,
    invoiceNumber: record.invoice.invoiceNumber,
    customerName: record.invoice.customerName,
    invoiceTotal: record.invoice.invoiceTotal,
    currencyCode: record.invoice.currencyCode,
    dueDate: record.invoice.dueDate,
    booksStatus: record.invoice.booksStatus,
    paymentStatus: record.invoice.paymentStatus,
    approvalStatus: record.approval.approvalStatus,
    priority: record.approval.priority,
    crmAccountName: record.crmContext.crmAccountName,
  };
}

function matchesFilters(item, filters = {}) {
  const status = filters.approvalStatus || "All";
  const search = normalizeText(filters.search).toLowerCase();

  if (status !== "All" && item.approvalStatus !== status) {
    return false;
  }

  if (!search) {
    return true;
  }

  return [
    item.invoiceNumber,
    item.customerName,
    item.crmAccountName,
    item.booksInvoiceId,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(search);
}

function getSummary(items) {
  const summary = {
    total: items.length,
    newCount: 0,
    underReviewCount: 0,
    clarificationCount: 0,
    approvedCount: 0,
    rejectedCount: 0,
    highPriorityCount: 0,
  };

  items.forEach((item) => {
    if (item.priority === "High") {
      summary.highPriorityCount += 1;
    }

    if (item.approvalStatus === "New") {
      summary.newCount += 1;
    }
    if (item.approvalStatus === "Under Review") {
      summary.underReviewCount += 1;
    }
    if (item.approvalStatus === "Needs Clarification") {
      summary.clarificationCount += 1;
    }
    if (item.approvalStatus === "Approved") {
      summary.approvedCount += 1;
    }
    if (item.approvalStatus === "Rejected") {
      summary.rejectedCount += 1;
    }
  });

  return summary;
}

function nowIso() {
  return new Date().toISOString();
}

function buildActionComment(payload, fallbackType) {
  return {
    id: `COM-${Date.now()}`,
    commentType: payload.commentType || fallbackType,
    comment: payload.comment,
    addedBy: payload.reviewer,
    addedDate: nowIso(),
  };
}

function buildAuditEntry(record, params) {
  return {
    id: `AUD-${Date.now()}`,
    eventType: params.eventType,
    previousStatus: params.previousStatus,
    newStatus: params.newStatus,
    eventMessage: params.eventMessage,
    actor: params.actor,
    eventDate: nowIso(),
    externalSystem: params.externalSystem || "Creator",
    externalReferenceId: params.externalReferenceId || record.approvalRecordId,
  };
}

function validateActionPayload(actionName, payload) {
  if (!normalizeText(payload?.reviewer)) {
    throw new Error(`${actionName} requires a reviewer name.`);
  }

  if (
    (actionName === "reject" || actionName === "clarify") &&
    !normalizeText(payload?.comment)
  ) {
    throw new Error(
      `${actionName === "reject" ? "Rejecting" : "Requesting clarification for"} an invoice requires a comment.`,
    );
  }
}

function createMockService(config) {
  const state = createMockState();

  return {
    mode: "mock",
    async init() {
      return {
        mode: "mock",
        useMockData: true,
        creatorReady: false,
      };
    },
    async loadInbox(filters = {}) {
      const allItems = state.map(toInboxItem);
      const items = allItems.filter((item) => matchesFilters(item, filters));
      return {
        items: deepClone(items),
        summary: getSummary(allItems),
      };
    },
    async loadInvoiceDetail(recordId) {
      const record = state.find((entry) => entry.approvalRecordId === recordId);

      if (!record) {
        throw new Error("The selected invoice approval record was not found.");
      }

      return deepClone(record);
    },
    async approveInvoice(recordId, payload) {
      validateActionPayload("approve", payload);
      const index = findRecordIndex(state, recordId);

      if (index === -1) {
        throw new Error("The selected invoice approval record was not found.");
      }

      const record = state[index];
      const previousStatus = record.approval.approvalStatus;
      record.approval.approvalStatus = "Approved";
      record.approval.assignedReviewer = payload.reviewer;
      record.approval.reviewerNotes = normalizeText(payload.comment) || record.approval.reviewerNotes;
      record.approval.approvalDecisionDate = nowIso();
      record.approval.exceptionReason = normalizeText(payload.exceptionReason);
      record.approval.syncStatus = "Pending Push";

      if (normalizeText(payload.comment)) {
        record.comments.unshift(
          buildActionComment(payload, "Approval Note"),
        );
      }

      record.audit.unshift(
        buildAuditEntry(record, {
          eventType: "Approved",
          previousStatus,
          newStatus: "Approved",
          eventMessage: `Invoice approved by ${payload.reviewer}.`,
          actor: payload.reviewer,
        }),
      );

      return deepClone(record);
    },
    async rejectInvoice(recordId, payload) {
      validateActionPayload("reject", payload);
      const index = findRecordIndex(state, recordId);

      if (index === -1) {
        throw new Error("The selected invoice approval record was not found.");
      }

      const record = state[index];
      const previousStatus = record.approval.approvalStatus;
      record.approval.approvalStatus = "Rejected";
      record.approval.assignedReviewer = payload.reviewer;
      record.approval.reviewerNotes = normalizeText(payload.comment);
      record.approval.exceptionReason = normalizeText(payload.exceptionReason);
      record.approval.approvalDecisionDate = nowIso();
      record.approval.syncStatus = "Pending Rework";
      record.comments.unshift(buildActionComment(payload, "Rejection Note"));
      record.audit.unshift(
        buildAuditEntry(record, {
          eventType: "Rejected",
          previousStatus,
          newStatus: "Rejected",
          eventMessage:
            normalizeText(payload.exceptionReason) ||
            "Invoice rejected with reviewer comment.",
          actor: payload.reviewer,
        }),
      );

      return deepClone(record);
    },
    async requestClarification(recordId, payload) {
      validateActionPayload("clarify", payload);
      const index = findRecordIndex(state, recordId);

      if (index === -1) {
        throw new Error("The selected invoice approval record was not found.");
      }

      const record = state[index];
      const previousStatus = record.approval.approvalStatus;
      record.approval.approvalStatus = "Needs Clarification";
      record.approval.assignedReviewer = payload.reviewer;
      record.approval.reviewerNotes = normalizeText(payload.comment);
      record.approval.exceptionReason = normalizeText(payload.exceptionReason);
      record.approval.syncStatus = "Clarification Requested";
      record.comments.unshift(
        buildActionComment(payload, "Clarification Request"),
      );
      record.audit.unshift(
        buildAuditEntry(record, {
          eventType: "Clarification Requested",
          previousStatus,
          newStatus: "Needs Clarification",
          eventMessage:
            normalizeText(payload.exceptionReason) ||
            "Clarification requested by reviewer.",
          actor: payload.reviewer,
        }),
      );

      return deepClone(record);
    },
    async addComment(recordId, payload) {
      validateActionPayload("approve", payload);
      const index = findRecordIndex(state, recordId);

      if (index === -1) {
        throw new Error("The selected invoice approval record was not found.");
      }

      if (!normalizeText(payload.comment)) {
        throw new Error("A comment is required before adding a note.");
      }

      const record = state[index];
      record.comments.unshift(buildActionComment(payload, "Internal Note"));
      record.audit.unshift(
        buildAuditEntry(record, {
          eventType: "Comment Added",
          previousStatus: record.approval.approvalStatus,
          newStatus: record.approval.approvalStatus,
          eventMessage: "Reviewer added a new internal comment.",
          actor: payload.reviewer,
        }),
      );

      return deepClone(record.comments);
    },
  };
}

function extractDataArray(response) {
  if (Array.isArray(response)) {
    return response;
  }

  if (Array.isArray(response?.data)) {
    return response.data;
  }

  if (Array.isArray(response?.result)) {
    return response.result;
  }

  return [];
}

async function invokeCreatorFunction(creator, functionName, payload) {
  if (!functionName) {
    throw new Error("The required Creator custom API name has not been configured.");
  }

  const candidates = [
    ["FUNCTIONS", "execute"],
    ["UTIL", "executeFunction"],
    ["executeFunction"],
  ];

  for (const path of candidates) {
    const method = path.reduce((value, key) => value?.[key], creator);
    if (typeof method === "function") {
      return method({ name: functionName, payload });
    }
  }

  throw new Error(
    "The current Creator SDK runtime does not expose a function invocation method. Keep mock mode enabled until your custom API bridge is ready.",
  );
}

function mapCreatorInboxRecord(record) {
  return {
    approvalRecordId: String(record.ID || record.approvalRecordId || ""),
    booksInvoiceId: record.Books_Invoice_ID || "",
    invoiceNumber: record.Books_Invoice_Number || "",
    customerName: record.CRM_Account_Name || record.customerName || "",
    invoiceTotal: Number(record.Invoice_Total || 0),
    currencyCode: record.Currency_Code || "USD",
    dueDate: record.Due_Date || "",
    booksStatus: record.Books_Invoice_Status || "",
    paymentStatus: record.Books_Payment_Status || "",
    approvalStatus: record.Approval_Status || "New",
    priority: record.Priority || "Medium",
    crmAccountName: record.CRM_Account_Name || "",
  };
}

function createCreatorService(config, creator, widgetContext) {
  return {
    mode: "creator",
    async init() {
      return {
        mode: "creator",
        useMockData: false,
        creatorReady: true,
        widgetContext,
      };
    },
    async loadInbox(filters = {}) {
      const response = await invokeCreatorFunction(
        creator,
        config.creator.customApis.loadInbox,
        { filters },
      );
      const allItems = extractDataArray(response).map(mapCreatorInboxRecord);
      const items = allItems.filter((item) => matchesFilters(item, filters));
      return {
        items,
        summary: getSummary(allItems),
      };
    },
    async loadInvoiceDetail(recordId) {
      const response = await invokeCreatorFunction(
        creator,
        config.creator.customApis.loadInvoiceDetail,
        { recordId },
      );
      return response?.data || response;
    },
    async approveInvoice(recordId, payload) {
      await invokeCreatorFunction(
        creator,
        config.creator.customApis.approveInvoice,
        { recordId, ...payload, decision: "Approved" },
      );
      return this.loadInvoiceDetail(recordId);
    },
    async rejectInvoice(recordId, payload) {
      await invokeCreatorFunction(
        creator,
        config.creator.customApis.rejectInvoice,
        { recordId, ...payload, decision: "Rejected" },
      );
      return this.loadInvoiceDetail(recordId);
    },
    async requestClarification(recordId, payload) {
      await invokeCreatorFunction(
        creator,
        config.creator.customApis.requestClarification,
        { recordId, ...payload, decision: "Needs Clarification" },
      );
      return this.loadInvoiceDetail(recordId);
    },
    async addComment(recordId, payload) {
      await invokeCreatorFunction(
        creator,
        config.creator.customApis.addComment,
        { recordId, ...payload },
      );
      const detail = await this.loadInvoiceDetail(recordId);
      return detail.comments || [];
    },
  };
}

async function initializeCreatorRuntime(config) {
  const creator = window.ZOHO?.CREATOR;

  if (!creator || typeof creator.init !== "function") {
    return null;
  }

  try {
    const initData = await creator.init();
    const widgetParams =
      typeof creator.UTIL?.getWidgetParams === "function"
        ? creator.UTIL.getWidgetParams() || {}
        : {};

    return {
      creator,
      initData,
      widgetParams,
      creatorReady: true,
    };
  } catch {
    if (config.useMockData) {
      return null;
    }

    throw new Error(
      "Zoho Creator SDK initialization failed. Re-enable mock mode or verify the widget runtime inside Creator.",
    );
  }
}

export async function createInvoiceApprovalService(config) {
  if (config.useMockData) {
    return createMockService(config);
  }

  const runtime = await initializeCreatorRuntime(config);
  if (!runtime) {
    return createMockService(config);
  }

  return createCreatorService(config, runtime.creator, runtime);
}
