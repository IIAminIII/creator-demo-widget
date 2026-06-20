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
      record.approval.reviewerNotes =
        normalizeText(payload.comment) || record.approval.reviewerNotes;
      record.approval.approvalDecisionDate = nowIso();
      record.approval.exceptionReason = normalizeText(payload.exceptionReason);
      record.approval.syncStatus = "Pending Push";

      if (normalizeText(payload.comment)) {
        record.comments.unshift(buildActionComment(payload, "Approval Note"));
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

function unwrapCreatorApiResponse(response) {
  const possible =
    response?.result || response?.data?.result || response?.data || response;

  if (typeof possible === "string") {
    try {
      return JSON.parse(possible);
    } catch (error) {
      return {
        ok: false,
        message: "Creator Custom API returned an unparseable string response.",
        raw: possible,
      };
    }
  }

  return possible;
}

function getNestedValue(record, keys, fallback = "") {
  for (const key of keys) {
    const value = record?.[key];
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return fallback;
}

function toArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (Array.isArray(value?.data)) {
    return value.data;
  }

  if (Array.isArray(value?.result)) {
    return value.result;
  }

  return [];
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isSuccessfulResponse(response) {
  return (
    response?.ok === true ||
    response?.success === true ||
    response?.status === "success"
  );
}

function toIsoOrEmpty(value) {
  return typeof value === "string" ? value : "";
}

function mapApprovalRecord(record) {
  return {
    approvalRecordId: String(getNestedValue(record, ["ID", "id"], "")),
    booksInvoiceId: String(
      getNestedValue(record, ["Books_Invoice_ID", "booksInvoiceId"], ""),
    ),
    invoiceNumber: String(
      getNestedValue(
        record,
        ["Books_Invoice_Number", "Invoice_Number", "invoiceNumber"],
        "",
      ),
    ),
    customerName: String(
      getNestedValue(
        record,
        ["Customer_Name", "Books_Customer_Name", "customerName"],
        "",
      ),
    ),
    invoiceTotal: toNumber(getNestedValue(record, ["Invoice_Total"], 0)),
    currencyCode: String(getNestedValue(record, ["Currency_Code"], "USD")),
    dueDate: String(getNestedValue(record, ["Due_Date"], "")),
    invoiceDate: String(getNestedValue(record, ["Invoice_Date"], "")),
    booksStatus: String(
      getNestedValue(record, ["Books_Invoice_Status"], "Unknown"),
    ),
    paymentStatus: String(
      getNestedValue(record, ["Books_Payment_Status"], "Unknown"),
    ),
    approvalStatus: String(getNestedValue(record, ["Approval_Status"], "New")),
    priority: String(getNestedValue(record, ["Priority"], "Medium")),
    assignedReviewer: String(
      getNestedValue(record, ["Assigned_Reviewer"], "Unassigned"),
    ),
    exceptionReason: String(getNestedValue(record, ["Exception_Reason"], "")),
    reviewerNotes: String(getNestedValue(record, ["Reviewer_Notes"], "")),
    approvalDecisionDate: String(
      getNestedValue(record, ["Approval_Decision_Date"], ""),
    ),
    lastBooksSyncAt: String(getNestedValue(record, ["Last_Books_Sync_At"], "")),
    lastCrmEnrichmentAt: String(
      getNestedValue(record, ["Last_CRM_Enrichment_At"], ""),
    ),
    crmAccountName: String(getNestedValue(record, ["CRM_Account_Name"], "")),
    crmDealName: String(getNestedValue(record, ["CRM_Deal_Name"], "")),
    accountOwner: String(
      getNestedValue(record, ["CRM_Account_Owner", "Account_Owner"], ""),
    ),
    dealStage: String(getNestedValue(record, ["CRM_Deal_Stage"], "")),
    riskLevel: String(getNestedValue(record, ["CRM_Risk_Level"], "")),
    syncStatus: String(getNestedValue(record, ["Sync_Status"], "Unknown")),
  };
}

function mapCommentRecord(record) {
  return {
    id: String(getNestedValue(record, ["ID", "id"], `COM-${Date.now()}`)),
    commentType: String(getNestedValue(record, ["Comment_Type"], "Internal Note")),
    comment: String(getNestedValue(record, ["Comment_Body", "Comment"], "")),
    addedBy: String(getNestedValue(record, ["Author", "Created_By"], "System")),
    addedDate: toIsoOrEmpty(
      getNestedValue(record, ["Created_At", "Modified_Time"], ""),
    ),
  };
}

function mapAuditRecord(record) {
  return {
    id: String(getNestedValue(record, ["ID", "id"], `AUD-${Date.now()}`)),
    eventType: String(getNestedValue(record, ["Event_Type"], "Activity")),
    previousStatus: String(getNestedValue(record, ["Previous_Status"], "")),
    newStatus: String(getNestedValue(record, ["New_Status"], "")),
    eventMessage: String(
      getNestedValue(record, ["Event_Summary", "Summary"], "Activity logged."),
    ),
    actor: String(getNestedValue(record, ["Actor", "Created_By"], "System")),
    eventDate: toIsoOrEmpty(
      getNestedValue(record, ["Created_At", "Modified_Time"], ""),
    ),
    externalSystem: String(
      getNestedValue(record, ["External_System"], "Creator"),
    ),
    externalReferenceId: String(
      getNestedValue(record, ["External_Reference_ID", "Approval_Request_ID"], ""),
    ),
  };
}

function mapBooksDetail(detail, fallbackRecord) {
  return {
    booksInvoiceId: String(
      getNestedValue(
        detail,
        ["booksInvoiceId"],
        fallbackRecord.booksInvoiceId,
      ),
    ),
    invoiceNumber: String(
      getNestedValue(detail, ["invoiceNumber"], fallbackRecord.invoiceNumber),
    ),
    customerName: String(
      getNestedValue(detail, ["customerName"], fallbackRecord.customerName),
    ),
    invoiceTotal: toNumber(
      getNestedValue(detail, ["invoiceTotal"], fallbackRecord.invoiceTotal),
    ),
    currencyCode: String(
      getNestedValue(detail, ["currencyCode"], fallbackRecord.currencyCode),
    ),
    dueDate: String(getNestedValue(detail, ["dueDate"], fallbackRecord.dueDate)),
    invoiceDate: String(
      getNestedValue(detail, ["invoiceDate"], fallbackRecord.invoiceDate),
    ),
    booksStatus: String(
      getNestedValue(detail, ["booksStatus"], fallbackRecord.booksStatus),
    ),
    paymentStatus: String(
      getNestedValue(detail, ["paymentStatus"], fallbackRecord.paymentStatus),
    ),
    lineItems: Array.isArray(detail?.lineItems) ? detail.lineItems : [],
    lastBooksSyncAt: String(
      getNestedValue(detail, ["lastBooksSyncAt"], fallbackRecord.lastBooksSyncAt),
    ),
  };
}

async function invokeCreatorCustomApi(apiName, payload = {}) {
  if (!apiName) {
    throw new Error("Creator Custom API name is missing in widget config.");
  }

  if (!window.ZOHO?.CREATOR?.API?.invokeCustomApi) {
    throw new Error(
      "ZOHO.CREATOR.API.invokeCustomApi is not available. Test the widget inside Zoho Creator, not only local browser.",
    );
  }

  const response = await window.ZOHO.CREATOR.API.invokeCustomApi({
    api_name: apiName,
    http_method: "POST",
    content_type: "application/json",
    payload,
  });

  return unwrapCreatorApiResponse(response);
}

async function invokeCreatorDataMethod(creator, path, payload, fallbackMessage) {
  const method = path.reduce((value, key) => value?.[key], creator);

  if (typeof method !== "function") {
    throw new Error(fallbackMessage);
  }

  return method(payload);
}

async function getCreatorRecordById(config, creator, recordId) {
  const response = await invokeCreatorDataMethod(
    creator,
    ["DATA", "getRecordById"],
    {
      app_name: config.creator.appLinkName,
      report_name: config.creator.reports.inbox,
      id: recordId,
    },
    "Creator record lookup is not available in the current SDK runtime.",
  );

  const records = toArray(response);
  if (records[0]) {
    return records[0];
  }

  if (response?.data && !Array.isArray(response.data)) {
    return response.data;
  }

  return response;
}

async function getCreatorRecords(config, creator, reportName, criteria) {
  const response = await invokeCreatorDataMethod(
    creator,
    ["DATA", "getRecords"],
    {
      app_name: config.creator.appLinkName,
      report_name: reportName,
      criteria,
    },
    "Creator report lookup is not available in the current SDK runtime.",
  );

  return toArray(response);
}

function normalizeApiEnvelope(response) {
  if (isSuccessfulResponse(response)) {
    return response;
  }

  if (response?.status === "success" && response?.result) {
    return response.result;
  }

  return response;
}

function createCreatorService(config, creator, widgetContext) {
  const customApis = config.creator?.customApis || {};

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
      const response = await invokeCreatorCustomApi(customApis.loadInbox, {
        status: filters.approvalStatus || filters.status || "All",
        search: filters.search || "",
      });

      const normalized = normalizeApiEnvelope(response);
      const items = normalized?.items || normalized?.data?.items;

      if (!Array.isArray(items)) {
        throw new Error(normalized?.message || "Failed to load approval inbox.");
      }

      return {
        items,
        summary:
          normalized?.summary || normalized?.data?.summary || getSummary(items),
      };
    },

    async loadInvoiceDetail(recordId) {
      const approvalRecordRaw = await getCreatorRecordById(config, creator, recordId);
      const approvalRecord = mapApprovalRecord(approvalRecordRaw);

      if (!approvalRecord.approvalRecordId) {
        throw new Error("Failed to load the approval record from Creator.");
      }

      const booksDetailResponse = await invokeCreatorCustomApi(
        customApis.loadInvoiceDetail,
        {
          invoiceId: approvalRecord.booksInvoiceId,
          mode: "view",
        },
      );
      const booksDetail = mapBooksDetail(
        normalizeApiEnvelope(booksDetailResponse),
        approvalRecord,
      );

      let crmContext = {
        crmAccountName: approvalRecord.crmAccountName,
        crmDealName: approvalRecord.crmDealName,
        accountOwner: approvalRecord.accountOwner,
        dealStage: approvalRecord.dealStage,
        riskLevel: approvalRecord.riskLevel,
        lastActivityDate: "",
      };

      if (customApis.loadCrmContext) {
        try {
          const crmResponse = await invokeCreatorCustomApi(customApis.loadCrmContext, {
            customerId: "",
            customerName: booksDetail.customerName,
          });
          const crmData = normalizeApiEnvelope(crmResponse);
          crmContext = {
            crmAccountName:
              crmData?.accountName || approvalRecord.crmAccountName || "",
            crmDealName: crmData?.dealName || approvalRecord.crmDealName || "",
            accountOwner:
              crmData?.accountManager || approvalRecord.accountOwner || "",
            dealStage: crmData?.segment || approvalRecord.dealStage || "",
            riskLevel: approvalRecord.riskLevel || "Unknown",
            lastActivityDate: crmData?.renewalWindow || "",
          };
        } catch {
          // CRM enrichment should never block approvals.
        }
      }

      const comments = (
        await getCreatorRecords(
          config,
          creator,
          config.creator.reports.comments,
          `Approval_Request_ID == "${approvalRecord.approvalRecordId}"`,
        )
      ).map(mapCommentRecord);

      const audit = (
        await getCreatorRecords(
          config,
          creator,
          config.creator.reports.audit,
          `Approval_Request_ID == "${approvalRecord.approvalRecordId}"`,
        )
      ).map(mapAuditRecord);

      return {
        approvalRecordId: approvalRecord.approvalRecordId,
        invoice: {
          approvalRecordId: approvalRecord.approvalRecordId,
          booksInvoiceId: booksDetail.booksInvoiceId,
          invoiceNumber: booksDetail.invoiceNumber,
          customerName: booksDetail.customerName,
          invoiceTotal: booksDetail.invoiceTotal,
          currencyCode: booksDetail.currencyCode,
          dueDate: booksDetail.dueDate,
          invoiceDate: booksDetail.invoiceDate,
          booksStatus: booksDetail.booksStatus,
          paymentStatus: booksDetail.paymentStatus,
          crmAccountName: crmContext.crmAccountName,
        },
        lineItems: booksDetail.lineItems,
        crmContext,
        approval: {
          approvalStatus: approvalRecord.approvalStatus,
          assignedReviewer: approvalRecord.assignedReviewer,
          priority: approvalRecord.priority,
          exceptionReason: approvalRecord.exceptionReason,
          reviewerNotes: approvalRecord.reviewerNotes,
          approvalDecisionDate: approvalRecord.approvalDecisionDate,
          lastBooksSyncAt: booksDetail.lastBooksSyncAt,
          lastCrmEnrichmentAt: approvalRecord.lastCrmEnrichmentAt,
          syncStatus: approvalRecord.syncStatus,
        },
        comments,
        audit,
      };
    },

    async approveInvoice(recordId, payload) {
      const response = await invokeCreatorCustomApi(customApis.approveInvoice, {
        recordId,
        decision: "Approved",
        comment: payload.comment || "",
        reviewer: payload.reviewer || "",
        exceptionReason: payload.exceptionReason || "",
      });

      const normalized = normalizeApiEnvelope(response);

      if (!isSuccessfulResponse(normalized)) {
        throw new Error(normalized?.message || "Failed to approve invoice.");
      }

      return this.loadInvoiceDetail(recordId);
    },

    async rejectInvoice(recordId, payload) {
      if (!normalizeText(payload?.comment)) {
        throw new Error("Rejecting an invoice requires a comment.");
      }

      const response = await invokeCreatorCustomApi(customApis.rejectInvoice, {
        recordId,
        decision: "Rejected",
        comment: payload.comment,
        reviewer: payload.reviewer || "",
        exceptionReason: payload.exceptionReason || payload.comment,
      });

      const normalized = normalizeApiEnvelope(response);

      if (!isSuccessfulResponse(normalized)) {
        throw new Error(normalized?.message || "Failed to reject invoice.");
      }

      return this.loadInvoiceDetail(recordId);
    },

    async requestClarification(recordId, payload) {
      if (!normalizeText(payload?.comment)) {
        throw new Error("Requesting clarification requires a comment.");
      }

      const response = await invokeCreatorCustomApi(
        customApis.requestClarification,
        {
          recordId,
          decision: "Needs Clarification",
          comment: payload.comment,
          reviewer: payload.reviewer || "",
          exceptionReason: payload.exceptionReason || payload.comment,
        },
      );

      const normalized = normalizeApiEnvelope(response);

      if (!isSuccessfulResponse(normalized)) {
        throw new Error(
          normalized?.message || "Failed to request clarification.",
        );
      }

      return this.loadInvoiceDetail(recordId);
    },

    async addComment(recordId, payload) {
      if (!normalizeText(payload?.comment)) {
        throw new Error("A comment is required before adding a note.");
      }

      const response = await invokeCreatorCustomApi(customApis.addComment, {
        recordId,
        comment: payload.comment,
        reviewer: payload.reviewer || "",
        type: payload.commentType || "Internal Finance Note",
      });

      const normalized = normalizeApiEnvelope(response);

      if (!isSuccessfulResponse(normalized)) {
        throw new Error(normalized?.message || "Failed to add comment.");
      }

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

    let widgetParams = {};
    if (typeof creator.UTIL?.getWidgetParams === "function") {
      widgetParams = creator.UTIL.getWidgetParams() || {};
    }

    return {
      creator,
      initData,
      widgetParams,
      creatorReady: true,
    };
  } catch (error) {
    console.error("Creator SDK init failed:", error);

    if (config.useMockData) {
      return null;
    }

    throw new Error(
      "Zoho Creator SDK initialization failed. Open the widget inside Zoho Creator or enable mock mode for local testing.",
    );
  }
}

export async function createInvoiceApprovalService(config) {
  const runtime = await initializeCreatorRuntime(config);

  if (runtime && !config.useMockData) {
    return createCreatorService(config, runtime.creator, runtime);
  }

  if (runtime && config.useMockData) {
    return createMockService(config);
  }

  if (!runtime) {
    console.warn(
      "Zoho Creator SDK was not found. Falling back to mock preview mode.",
    );
  }

  return createMockService(config);
}
