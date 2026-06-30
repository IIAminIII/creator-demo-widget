import { createMockInvoiceStore } from "./mockInvoiceData";

const mockStore = createMockInvoiceStore();

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function getFirstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function normalizeStatus(value) {
  return getFirstString(value, "New");
}

function getRecordId(record) {
  return record?.ID ?? record?.id ?? record?.recordId ?? record?.Approval_Request_ID ?? null;
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeLineItem(record = {}) {
  return {
    id: String(record.id ?? record.ID ?? `LINE-${Date.now()}`),
    name: getFirstString(record.name, record.itemName),
    description: getFirstString(record.description),
    quantity: toNumber(record.quantity),
    rate: toNumber(record.rate),
    discount: toNumber(record.discount ?? record.discountAmount),
    taxName: getFirstString(record.taxName, record.tax_name),
    taxPercentage: toNumber(record.taxPercentage ?? record.tax_percentage),
    total: toNumber(record.itemTotal ?? record.total),
  };
}

function extractLineItems(detail = {}) {
  const source =
    (Array.isArray(detail?.invoice?.lineItems) && detail.invoice.lineItems) ||
    (Array.isArray(detail?.lineItems) && detail.lineItems) ||
    (Array.isArray(detail?.booksLineItems) && detail.booksLineItems) ||
    [];

  return source.map(normalizeLineItem);
}

function matchesFilter(item, filters) {
  const statusMatches =
    !filters.status || filters.status === "All" || item.approvalStatus === filters.status;
  const search = filters.search?.trim().toLowerCase();

  if (!search) {
    return statusMatches;
  }

  const haystack = [
    item.invoiceNumber,
    item.customerName,
    item.crmAccountName,
    item.crmDealName,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return statusMatches && haystack.includes(search);
}

function buildSummary(items) {
  const summary = {
    total: items.length,
    newCount: 0,
    underReviewCount: 0,
    clarificationCount: 0,
    approvedCount: 0,
    rejectedCount: 0,
  };

  for (const item of items) {
    switch (item.approvalStatus) {
      case "New":
        summary.newCount += 1;
        break;
      case "Under Review":
        summary.underReviewCount += 1;
        break;
      case "Needs Clarification":
        summary.clarificationCount += 1;
        break;
      case "Approved":
        summary.approvedCount += 1;
        break;
      case "Rejected":
        summary.rejectedCount += 1;
        break;
      default:
        break;
    }
  }

  return summary;
}

function normalizeMockInboxItem(record) {
  return {
    approvalRecordId: record.approvalRecordId,
    booksInvoiceId: record.booksInvoiceId,
    invoiceNumber: record.invoiceNumber,
    customerName: record.customerName,
    invoiceTotal: record.invoiceTotal,
    currencyCode: record.currencyCode,
    dueDate: record.dueDate,
    booksStatus: record.booksStatus,
    paymentStatus: record.paymentStatus,
    approvalStatus: record.approvalStatus,
    priority: record.priority,
    crmAccountName: record.crmAccountName,
  };
}

function normalizeCreatorRecord(record) {
  return {
    approvalRecordId: String(getRecordId(record) ?? ""),
    booksInvoiceId: getFirstString(record.Books_Invoice_ID, record.books_invoice_id),
    invoiceNumber: getFirstString(record.Books_Invoice_Number, record.Invoice_Number),
    customerName: getFirstString(
      record.Books_Customer_Name,
      record.Customer_Name,
      record.customerName,
    ),
    invoiceTotal: toNumber(record.Invoice_Total ?? record.invoiceTotal ?? record.total),
    currencyCode: getFirstString(record.Currency_Code, record.currencyCode, "USD"),
    dueDate: getFirstString(record.Due_Date, record.dueDate),
    invoiceDate: getFirstString(record.Invoice_Date, record.invoiceDate),
    booksStatus: getFirstString(record.Books_Invoice_Status, record.booksStatus, record.status, "sent"),
    paymentStatus: getFirstString(record.Books_Payment_Status, "unpaid"),
    approvalStatus: normalizeStatus(record.Approval_Status),
    priority: getFirstString(record.Priority, "Medium"),
    crmAccountName: getFirstString(record.CRM_Account_Name),
    crmDealName: getFirstString(record.CRM_Deal_Name),
    crmOwnerName: getFirstString(record.CRM_Owner_Name, record.Account_Manager),
    assignedReviewer: getFirstString(record.Assigned_Reviewer, "Unassigned"),
    exceptionReason: getFirstString(record.Exception_Reason),
    reviewerNotes: getFirstString(record.Reviewer_Notes),
    decisionDate: getFirstString(record.Approval_Decision_Date),
    lastBooksSyncAt: getFirstString(record.Last_Books_Sync_At),
    lastCrmEnrichmentAt: getFirstString(record.Last_CRM_Enrichment_At),
    lastComparedAt: getFirstString(record.Last_Compared_At, record.lastComparedAt),
    differenceFound: record.Difference_Found ?? record.differenceFound ?? null,
    differenceSummary: getFirstString(
      record.Difference_Summary,
      record.differenceSummary,
    ),
    syncStatus: getFirstString(record.Sync_Status, record.syncStatus),
  };
}

function normalizeComment(record) {
  return {
    id: String(getRecordId(record) ?? crypto.randomUUID?.() ?? Math.random()),
    author: getFirstString(record.Author, record.Created_By, "System"),
    type: getFirstString(record.Comment_Type, "Internal note"),
    body: getFirstString(record.Comment_Body, record.Notes, record.Comment),
    createdAt: getFirstString(record.Created_At, record.Added_Time, new Date().toISOString()),
  };
}

function normalizeAudit(record) {
  return {
    id: String(getRecordId(record) ?? crypto.randomUUID?.() ?? Math.random()),
    eventType: getFirstString(record.Event_Type, "Event"),
    summary: getFirstString(record.Event_Summary, record.Summary, "Activity logged."),
    actor: getFirstString(record.Actor, record.Created_By, "System"),
    createdAt: getFirstString(record.Created_At, record.Added_Time, new Date().toISOString()),
  };
}

function addMockComment(record, payload) {
  const comment = {
    id: `COM-${Date.now()}`,
    author: payload.reviewer || "Current Reviewer",
    type: payload.type || "Internal note",
    body: payload.comment,
    createdAt: new Date().toISOString(),
  };

  record.comments.unshift(comment);
  return comment;
}

function addMockAudit(record, eventType, summary, actor) {
  const audit = {
    id: `AUD-${Date.now()}`,
    eventType,
    summary,
    actor,
    createdAt: new Date().toISOString(),
  };

  record.audit.unshift(audit);
  return audit;
}

function createMockService() {
  return {
    mode: "mock",
    async loadInbox(filters = {}) {
      const filtered = mockStore
        .filter((item) => matchesFilter(item, filters))
        .map(normalizeMockInboxItem);

      return {
        items: filtered,
        summary: buildSummary(mockStore.map(normalizeMockInboxItem)),
      };
    },

    async loadInvoiceDetail(approvalRecordId) {
      const record = mockStore.find((item) => item.approvalRecordId === approvalRecordId);

      if (!record) {
        throw new Error("Approval record not found in the local preview store.");
      }

      return clone(record);
    },

    async refreshInvoice(invoiceId) {
      const record = mockStore.find((item) => item.booksInvoiceId === invoiceId);

      if (!record) {
        throw new Error("Books invoice not found in the local preview store.");
      }

      record.lastBooksSyncAt = new Date().toISOString();
      addMockAudit(record, "Books refresh", "Invoice snapshot refreshed from the local preview source.", "System");

      return clone(record);
    },

    async approveInvoice(recordId, payload) {
      const record = mockStore.find((item) => item.approvalRecordId === recordId);

      if (!record) {
        throw new Error("Approval record not found.");
      }

      record.approvalStatus = "Approved";
      record.reviewerNotes = payload.comment || record.reviewerNotes;
      record.assignedReviewer = payload.reviewer || record.assignedReviewer;
      record.decisionDate = new Date().toISOString();
      if (payload.comment) {
        addMockComment(record, { ...payload, type: "Approval note" });
      }
      addMockAudit(record, "Approved", `Invoice approved by ${payload.reviewer || "reviewer"}.`, payload.reviewer || "Reviewer");

      return clone(record);
    },

    async rejectInvoice(recordId, payload) {
      const record = mockStore.find((item) => item.approvalRecordId === recordId);

      if (!record) {
        throw new Error("Approval record not found.");
      }

      record.approvalStatus = "Rejected";
      record.exceptionReason = payload.exceptionReason || record.exceptionReason;
      record.reviewerNotes = payload.comment || record.reviewerNotes;
      record.assignedReviewer = payload.reviewer || record.assignedReviewer;
      record.decisionDate = new Date().toISOString();
      addMockComment(record, { ...payload, type: "Rejection note" });
      addMockAudit(record, "Rejected", `Invoice rejected: ${payload.exceptionReason || "Reason not provided"}.`, payload.reviewer || "Reviewer");

      return clone(record);
    },

    async requestClarification(recordId, payload) {
      const record = mockStore.find((item) => item.approvalRecordId === recordId);

      if (!record) {
        throw new Error("Approval record not found.");
      }

      record.approvalStatus = "Needs Clarification";
      record.exceptionReason = payload.exceptionReason || record.exceptionReason;
      record.reviewerNotes = payload.comment || record.reviewerNotes;
      record.assignedReviewer = payload.reviewer || record.assignedReviewer;
      addMockComment(record, { ...payload, type: "Clarification" });
      addMockAudit(record, "Needs Clarification", `Clarification requested: ${payload.exceptionReason || "No reason provided"}.`, payload.reviewer || "Reviewer");

      return clone(record);
    },

    async addComment(recordId, payload) {
      const record = mockStore.find((item) => item.approvalRecordId === recordId);

      if (!record) {
        throw new Error("Approval record not found.");
      }

      addMockComment(record, payload);
      addMockAudit(record, "Comment added", "Reviewer added a comment.", payload.reviewer || "Reviewer");

      return clone(record.comments);
    },
  };
}

async function tryInvokeCreatorFunction(api, functionName, payload) {
  if (!functionName) {
    throw new Error("Required Creator function is not configured.");
  }

  if (typeof api.invokeFunction !== "function") {
    throw new Error(
      "Creator function invocation is not available in the current widget SDK wrapper. Wire the configured Creator-side function manually or extend src/services/creatorApi.js.",
    );
  }

  return api.invokeFunction(functionName, payload);
}

function createCreatorService(api, config) {
  return {
    mode: "creator",

    async loadInbox(filters = {}) {
      const recordsResponse = await api.getRecords(config.approvalRequestsReportName, {
        appName: config.creatorAppName,
      });

      const items = (Array.isArray(recordsResponse?.data) ? recordsResponse.data : recordsResponse)
        .map(normalizeCreatorRecord)
        .filter((item) => matchesFilter(item, filters));

      return {
        items,
        summary: buildSummary(items),
      };
    },

    async loadInvoiceDetail(approvalRecordId) {
      const recordResponse = await api.getRecord(
        config.approvalRequestsReportName,
        approvalRecordId,
        { appName: config.creatorAppName },
      );

      const record = Array.isArray(recordResponse?.data)
        ? recordResponse.data[0]
        : recordResponse?.data ?? recordResponse;

      if (!record) {
        throw new Error("Approval record could not be loaded from Creator.");
      }

      let comments = [];
      let audit = [];

      if (config.commentsReportName) {
        const commentsResponse = await api.getRecords(config.commentsReportName, {
          appName: config.creatorAppName,
          criteria: `Approval_Request_ID == "${approvalRecordId}"`,
        });
        const records = Array.isArray(commentsResponse?.data)
          ? commentsResponse.data
          : commentsResponse;
        comments = Array.isArray(records) ? records.map(normalizeComment) : [];
      }

      if (config.auditLogReportName) {
        const auditResponse = await api.getRecords(config.auditLogReportName, {
          appName: config.creatorAppName,
          criteria: `Approval_Request_ID == "${approvalRecordId}"`,
        });
        const records = Array.isArray(auditResponse?.data) ? auditResponse.data : auditResponse;
        audit = Array.isArray(records) ? records.map(normalizeAudit) : [];
      }

      const invoice = normalizeCreatorRecord(record);

      return {
        ...invoice,
        lastComparedAt: invoice.lastComparedAt,
        differenceFound: invoice.differenceFound,
        differenceSummary: invoice.differenceSummary,
        syncStatus: invoice.syncStatus,
        lineItems: extractLineItems(record),
        crmContext: {
          accountName: invoice.crmAccountName,
          dealName: invoice.crmDealName,
          accountManager: invoice.crmOwnerName,
          segment: "",
          renewalWindow: "",
        },
        comments,
        audit,
      };
    },

    async refreshInvoice(invoiceId) {
      const response = await tryInvokeCreatorFunction(api, config.booksDetailFunctionName, {
        invoiceId,
        mode: "refresh",
      });
      return response?.data ?? response;
    },

    async approveInvoice(recordId, payload) {
      const updates = {
        Approval_Status: "Approved",
        Reviewer_Notes: payload.comment,
        Assigned_Reviewer: payload.reviewer,
        Approval_Decision_Date: new Date().toISOString(),
      };

      await api.updateRecord(config.approvalRequestsReportName, recordId, updates, {
        appName: config.creatorAppName,
      });

      if (payload.comment && config.commentsFormName) {
        await api.addRecord(
          config.commentsFormName,
          {
            Approval_Request_ID: recordId,
            Author: payload.reviewer,
            Comment_Type: "Approval note",
            Comment_Body: payload.comment,
          },
          { appName: config.creatorAppName },
        );
      }

      if (config.auditLogFormName) {
        await api.addRecord(
          config.auditLogFormName,
          {
            Approval_Request_ID: recordId,
            Event_Type: "Approved",
            Event_Summary: "Invoice approved in Creator widget.",
            Actor: payload.reviewer,
          },
          { appName: config.creatorAppName },
        );
      }

      if (config.approvalActionFunctionName) {
        await tryInvokeCreatorFunction(api, config.approvalActionFunctionName, {
          recordId,
          decision: "Approved",
          comment: payload.comment,
          reviewer: payload.reviewer,
        });
      }

      return this.loadInvoiceDetail(recordId);
    },

    async rejectInvoice(recordId, payload) {
      const updates = {
        Approval_Status: "Rejected",
        Reviewer_Notes: payload.comment,
        Assigned_Reviewer: payload.reviewer,
        Exception_Reason: payload.exceptionReason,
        Approval_Decision_Date: new Date().toISOString(),
      };

      await api.updateRecord(config.approvalRequestsReportName, recordId, updates, {
        appName: config.creatorAppName,
      });

      if (config.commentsFormName) {
        await api.addRecord(
          config.commentsFormName,
          {
            Approval_Request_ID: recordId,
            Author: payload.reviewer,
            Comment_Type: "Rejection note",
            Comment_Body: payload.comment,
          },
          { appName: config.creatorAppName },
        );
      }

      if (config.auditLogFormName) {
        await api.addRecord(
          config.auditLogFormName,
          {
            Approval_Request_ID: recordId,
            Event_Type: "Rejected",
            Event_Summary: `Invoice rejected: ${payload.exceptionReason || "No reason supplied"}.`,
            Actor: payload.reviewer,
          },
          { appName: config.creatorAppName },
        );
      }

      if (config.approvalActionFunctionName) {
        await tryInvokeCreatorFunction(api, config.approvalActionFunctionName, {
          recordId,
          decision: "Rejected",
          comment: payload.comment,
          reviewer: payload.reviewer,
          exceptionReason: payload.exceptionReason,
        });
      }

      return this.loadInvoiceDetail(recordId);
    },

    async requestClarification(recordId, payload) {
      const updates = {
        Approval_Status: "Needs Clarification",
        Reviewer_Notes: payload.comment,
        Assigned_Reviewer: payload.reviewer,
        Exception_Reason: payload.exceptionReason,
      };

      await api.updateRecord(config.approvalRequestsReportName, recordId, updates, {
        appName: config.creatorAppName,
      });

      if (config.commentsFormName) {
        await api.addRecord(
          config.commentsFormName,
          {
            Approval_Request_ID: recordId,
            Author: payload.reviewer,
            Comment_Type: "Clarification",
            Comment_Body: payload.comment,
          },
          { appName: config.creatorAppName },
        );
      }

      if (config.auditLogFormName) {
        await api.addRecord(
          config.auditLogFormName,
          {
            Approval_Request_ID: recordId,
            Event_Type: "Needs Clarification",
            Event_Summary: `Clarification requested: ${payload.exceptionReason || "No reason supplied"}.`,
            Actor: payload.reviewer,
          },
          { appName: config.creatorAppName },
        );
      }

      if (config.approvalActionFunctionName) {
        await tryInvokeCreatorFunction(api, config.approvalActionFunctionName, {
          recordId,
          decision: "Needs Clarification",
          comment: payload.comment,
          reviewer: payload.reviewer,
          exceptionReason: payload.exceptionReason,
        });
      }

      return this.loadInvoiceDetail(recordId);
    },

    async addComment(recordId, payload) {
      if (!config.commentsFormName) {
        throw new Error("Comments form name is not configured for this widget.");
      }

      await api.addRecord(
        config.commentsFormName,
        {
          Approval_Request_ID: recordId,
          Author: payload.reviewer,
          Comment_Type: payload.type || "Internal note",
          Comment_Body: payload.comment,
        },
        { appName: config.creatorAppName },
      );

      if (config.auditLogFormName) {
        await api.addRecord(
          config.auditLogFormName,
          {
            Approval_Request_ID: recordId,
            Event_Type: "Comment added",
            Event_Summary: "Reviewer added a new comment.",
            Actor: payload.reviewer,
          },
          { appName: config.creatorAppName },
        );
      }

      const detail = await this.loadInvoiceDetail(recordId);
      return detail.comments;
    },
  };
}

export function resolveInvoiceApprovalConfig(widgetParams = {}, initData = {}) {
  const parsedAutoRefreshIntervalMs = Number(widgetParams.autoRefreshIntervalMs);

  return {
    creatorAppName: getFirstString(
      widgetParams.creatorAppName,
      widgetParams.appName,
      initData.app_name,
    ),
    approvalRequestsFormName: getFirstString(
      widgetParams.approvalRequestsFormName,
      "Invoice_Approval_Requests",
    ),
    approvalRequestsReportName: getFirstString(
      widgetParams.approvalRequestsReportName,
      "Pending_Invoice_Approvals",
    ),
    commentsFormName: getFirstString(widgetParams.commentsFormName, "Invoice_Approval_Comments"),
    commentsReportName: getFirstString(widgetParams.commentsReportName, "Invoice_Approval_Comments_Report"),
    auditLogFormName: getFirstString(widgetParams.auditLogFormName, "Invoice_Approval_Audit_Log"),
    auditLogReportName: getFirstString(widgetParams.auditLogReportName, "Invoice_Approval_Audit_Log_Report"),
    booksListFunctionName: getFirstString(widgetParams.booksListFunctionName, "listBooksInvoicesForApproval"),
    booksDetailFunctionName: getFirstString(widgetParams.booksDetailFunctionName, "getBooksInvoiceDetails"),
    crmContextFunctionName: getFirstString(widgetParams.crmContextFunctionName, "getCrmContextForInvoice"),
    approvalActionFunctionName: getFirstString(widgetParams.approvalActionFunctionName, "approveInvoice"),
    inboxDefaultStatusFilter: getFirstString(widgetParams.inboxDefaultStatusFilter, "All"),
    autoRefreshIntervalMs:
      Number.isFinite(parsedAutoRefreshIntervalMs) && parsedAutoRefreshIntervalMs > 0
        ? parsedAutoRefreshIntervalMs
        : 30000,
  };
}

export function createInvoiceApprovalService({ api, config, creator, initData }) {
  // initData is only populated when the SDK is running inside an actual Creator page.
  // The SDK script loads in local dev too, so `creator` being truthy is not enough.
  const creatorReady =
    creator &&
    initData &&
    (initData.appLinkName || initData.app_name || initData.accountOwner) &&
    config.approvalRequestsReportName;

  if (!creatorReady) {
    return createMockService();
  }

  return createCreatorService(api, config);
}
