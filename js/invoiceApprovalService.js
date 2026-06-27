import { hydrateRuntimeConfig } from "./config.js";
import { createMockState } from "./mockData.js";

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeApprovalStatus(value) {
  const normalized = normalizeText(value);

  if (!normalized || normalized === "New") {
    return "Pending Review";
  }

  return normalized;
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
    if (item.priority === "High" || item.priority === "Urgent") {
      summary.highPriorityCount += 1;
    }

    if (normalizeApprovalStatus(item.approvalStatus) === "Pending Review") {
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

function createMockService() {
  const state = createMockState();

  return {
    mode: "mock",
    async init() {
      return {
        mode: "mock",
        useMockData: true,
        creatorReady: false,
        standalonePreview: !window.ZOHO?.CREATOR,
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

      return deepClone(record);
    },
  };
}

function unwrapCreatorApiResponse(response) {
  const possible =
    response?.result || response?.data?.result || response?.data || response;

  if (typeof possible === "string") {
    try {
      return JSON.parse(possible);
    } catch {
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

function hasExplicitFailure(response) {
  return (
    response?.ok === false ||
    response?.success === false ||
    response?.status === "error" ||
    response?.status === "failed" ||
    response?.error === true
  );
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
    approvalStatus: normalizeApprovalStatus(
      getNestedValue(record, ["Approval_Status"], "Pending Review"),
    ),
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
      getNestedValue(
        record,
        ["CRM_Owner_Name", "CRM_Account_Owner", "Account_Owner", "Account_Manager"],
        "",
      ),
    ),
    dealStage: String(getNestedValue(record, ["CRM_Deal_Stage"], "")),
    riskLevel: String(getNestedValue(record, ["CRM_Risk_Level"], "")),
    syncStatus: String(getNestedValue(record, ["Sync_Status"], "Unknown")),
  };
}

function mapCommentRecord(record) {
  return {
    id: String(getNestedValue(record, ["ID", "id"], `COM-${Date.now()}`)),
    commentType: String(
      getNestedValue(record, ["Comment_Type", "Type", "type"], "General"),
    ),
    comment: String(
      getNestedValue(record, ["Comment_Body", "Comment", "Notes", "body"], ""),
    ),
    addedBy: String(
      getNestedValue(record, ["Author", "Added_By", "Created_By", "author"], "System"),
    ),
    addedDate: toIsoOrEmpty(
      getNestedValue(
        record,
        ["Created_At", "Added_Date", "Added_Time", "Modified_Time", "createdAt"],
        "",
      ),
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
      getNestedValue(record, ["Event_Summary", "Summary", "summary"], "Activity logged."),
    ),
    actor: String(
      getNestedValue(record, ["Actor", "Added_By", "Created_By", "actor"], "System"),
    ),
    eventDate: toIsoOrEmpty(
      getNestedValue(
        record,
        ["Created_At", "Added_Date", "Added_Time", "Modified_Time", "createdAt"],
        "",
      ),
    ),
    externalSystem: String(
      getNestedValue(record, ["External_System"], "Creator"),
    ),
    externalReferenceId: String(
      getNestedValue(
        record,
        ["External_Reference_ID", "Approval_Request_ID", "Approval_Request"],
        "",
      ),
    ),
  };
}

function mapApiInvoiceDetail(detail) {
  const detailSource = {
    ...detail,
    ...(detail?.invoice || {}),
    ...(detail?.approval || {}),
  };
  const approvalRecord = mapApprovalRecord(detailSource);

  return {
    approvalRecordId: approvalRecord.approvalRecordId,
    invoice: {
      approvalRecordId: approvalRecord.approvalRecordId,
      booksInvoiceId: approvalRecord.booksInvoiceId,
      invoiceNumber: approvalRecord.invoiceNumber,
      customerName: approvalRecord.customerName,
      invoiceTotal: approvalRecord.invoiceTotal,
      currencyCode: approvalRecord.currencyCode,
      dueDate: approvalRecord.dueDate,
      invoiceDate: approvalRecord.invoiceDate,
      booksStatus: approvalRecord.booksStatus,
      paymentStatus: approvalRecord.paymentStatus,
      crmAccountName: String(
        getNestedValue(
          detail?.crmContext || {},
          ["accountName", "crmAccountName"],
          approvalRecord.crmAccountName,
        ),
      ),
    },
    lineItems: Array.isArray(detail?.lineItems) ? deepClone(detail.lineItems) : [],
    crmContext: {
      crmAccountName: String(
        getNestedValue(
          detail?.crmContext || {},
          ["accountName", "crmAccountName"],
          approvalRecord.crmAccountName,
        ),
      ),
      crmDealName: String(
        getNestedValue(
          detail?.crmContext || {},
          ["dealName", "crmDealName"],
          approvalRecord.crmDealName,
        ),
      ),
      accountOwner: String(
        getNestedValue(
          detail?.crmContext || {},
          ["accountManager", "accountOwner"],
          approvalRecord.accountOwner,
        ),
      ),
      dealStage: String(
        getNestedValue(
          detail?.crmContext || {},
          ["segment", "dealStage"],
          approvalRecord.dealStage,
        ),
      ),
      riskLevel: String(
        getNestedValue(
          detail?.crmContext || {},
          ["riskLevel"],
          approvalRecord.riskLevel || "",
        ),
      ),
      lastActivityDate: String(
        getNestedValue(
          detail?.crmContext || {},
          ["renewalWindow", "lastActivityDate"],
          "",
        ),
      ),
    },
    approval: {
      approvalStatus: approvalRecord.approvalStatus,
      assignedReviewer: approvalRecord.assignedReviewer,
      priority: approvalRecord.priority,
      exceptionReason: approvalRecord.exceptionReason,
      reviewerNotes: approvalRecord.reviewerNotes,
      approvalDecisionDate: String(
        getNestedValue(detail, ["decisionDate"], approvalRecord.approvalDecisionDate),
      ),
      lastBooksSyncAt: approvalRecord.lastBooksSyncAt,
      lastCrmEnrichmentAt: approvalRecord.lastCrmEnrichmentAt,
      syncStatus: approvalRecord.syncStatus,
    },
    comments: toArray(detail?.comments).map(mapCommentRecord),
    audit: toArray(detail?.audit).map(mapAuditRecord),
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

function parseCustomApiReference(apiReference) {
  const normalized = normalizeText(apiReference);

  if (!normalized) {
    return {
      apiName: "",
      appLinkName: "",
    };
  }

  if (!/^https?:\/\//i.test(normalized)) {
    return {
      apiName: normalized,
      appLinkName: "",
    };
  }

  try {
    const url = new URL(normalized);
    const segments = url.pathname.split("/").filter(Boolean);
    const customIndex = segments.findIndex((segment) => segment === "custom");

    return {
      appLinkName:
        customIndex > -1 && segments[customIndex + 1] ? segments[customIndex + 1] : "",
      apiName: segments.at(-1) || "",
    };
  } catch {
    return {
      apiName: normalized,
      appLinkName: "",
    };
  }
}

async function invokeCreatorCustomApi(apiReference, payload = {}) {
  const { apiName } = parseCustomApiReference(apiReference);

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
      app_name: resolveCreatorAppName(config),
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
      app_name: resolveCreatorAppName(config),
      report_name: reportName,
      criteria,
    },
    "Creator report lookup is not available in the current SDK runtime.",
  );

  return toArray(response);
}

function buildRelatedRecordCriteria(recordId) {
  return `Approval_Request_ID == "${recordId}" || Approval_Request == "${recordId}"`;
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

function normalizeReviewerName(value) {
  return normalizeText(value) || "Reviewer";
}

function buildActionPayload(recordId, payload = {}) {
  return {
    approvalRecordId: recordId,
    comment: payload.comment || "",
    reviewer: normalizeReviewerName(payload.reviewer),
    exceptionReason: payload.exceptionReason || "",
  };
}

function buildCommentPayload(recordId, payload = {}) {
  return {
    approvalRecordId: recordId,
    comment: payload.comment,
    reviewer: normalizeReviewerName(payload.reviewer),
    commentType: payload.commentType || "Internal Note",
  };
}

function assertActionSucceeded(response, fallbackMessage) {
  const normalized = normalizeApiEnvelope(response);

  if (hasExplicitFailure(normalized)) {
    throw new Error(normalized?.message || fallbackMessage);
  }

  return normalized;
}

function resolveCreatorAppName(config) {
  const customApiEntries = Object.values(config.creator?.customApis || {});
  const inferredAppLinkName = customApiEntries
    .map((apiReference) => parseCustomApiReference(apiReference).appLinkName)
    .find(Boolean);

  return (
    config.creator?.appLinkName ||
    inferredAppLinkName ||
    config.creator?.appName ||
    config.runtime?.widgetContext?.initData?.appLinkName ||
    config.runtime?.widgetContext?.initData?.app_name ||
    ""
  );
}

function toInboxItemFromApprovalRecord(record) {
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

async function updateCreatorRecord(config, creator, reportName, recordId, data) {
  return invokeCreatorDataMethod(
    creator,
    ["DATA", "updateRecordById"],
    {
      app_name: resolveCreatorAppName(config),
      report_name: reportName,
      id: recordId,
      payload: { data },
    },
    "Creator record update is not available in the current SDK runtime.",
  );
}

async function addCreatorRecord(config, creator, formName, data) {
  return invokeCreatorDataMethod(
    creator,
    ["DATA", "addRecords"],
    {
      app_name: resolveCreatorAppName(config),
      form_name: formName,
      payload: { data },
    },
    "Creator record creation is not available in the current SDK runtime.",
  );
}

function createCreatorService(config, creator, widgetContext) {
  const customApis = config.creator?.customApis || {};
  config.runtime = { widgetContext };

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
      if (customApis.loadInbox) {
        try {
          const response = await invokeCreatorCustomApi(customApis.loadInbox, {
            status: filters.approvalStatus || filters.status || "All",
            search: filters.search || "",
          });
          const normalized = normalizeApiEnvelope(response);
          const items = normalized?.items || normalized?.data?.items;

          if (Array.isArray(items)) {
            return {
              items: deepClone(items),
              summary:
                normalized?.summary ||
                normalized?.data?.summary ||
                getSummary(items),
            };
          }
        } catch (error) {
          console.warn("Falling back to Creator report inbox load:", error);
        }
      }

      try {
        const records = await getCreatorRecords(
          config,
          creator,
          config.creator.reports.inbox,
        );
        const allItems = records
          .map(mapApprovalRecord)
          .filter((record) => record.approvalRecordId)
          .map(toInboxItemFromApprovalRecord);
        const items = allItems.filter((item) => matchesFilters(item, filters));

        return {
          items: deepClone(items),
          summary: getSummary(allItems),
        };
      } catch (recordError) {
        const response = await invokeCreatorCustomApi(customApis.loadInbox, {
          status: filters.approvalStatus || filters.status || "All",
          search: filters.search || "",
        });

        const normalized = normalizeApiEnvelope(response);
        const items = normalized?.items || normalized?.data?.items;

        if (!Array.isArray(items)) {
          throw new Error(
            normalized?.message ||
              recordError?.message ||
              "Failed to load approval inbox from Creator.",
          );
        }

        return {
          items,
          summary:
            normalized?.summary || normalized?.data?.summary || getSummary(items),
        };
      }
    },

    async loadInvoiceDetail(recordId) {
      if (customApis.loadInvoiceDetail) {
        try {
          const response = await invokeCreatorCustomApi(customApis.loadInvoiceDetail, {
            approvalRecordId: recordId,
            recordId,
          });
          const normalized = normalizeApiEnvelope(response);
          const detail =
            normalized?.detail || normalized?.data?.detail || normalized?.data || normalized;

          if (detail && !hasExplicitFailure(detail)) {
            return mapApiInvoiceDetail(detail);
          }
        } catch (error) {
          console.warn("Falling back to Creator record detail load:", error);
        }
      }

      const approvalRecordRaw = await getCreatorRecordById(config, creator, recordId);
      const approvalRecord = mapApprovalRecord(approvalRecordRaw);

      if (!approvalRecord.approvalRecordId) {
        throw new Error("Failed to load the approval record from Creator.");
      }

      const booksDetail = mapBooksDetail({}, approvalRecord);
      const crmContext = {
        crmAccountName: approvalRecord.crmAccountName,
        crmDealName: approvalRecord.crmDealName,
        accountOwner: approvalRecord.accountOwner,
        dealStage: approvalRecord.dealStage,
        riskLevel: approvalRecord.riskLevel,
        lastActivityDate: "",
      };

      let comments = [];
      if (config.creator.reports.comments) {
        comments = (
          await getCreatorRecords(
            config,
            creator,
            config.creator.reports.comments,
            buildRelatedRecordCriteria(approvalRecord.approvalRecordId),
          )
        ).map(mapCommentRecord);
      }

      let audit = [];
      if (config.creator.reports.audit) {
        audit = (
          await getCreatorRecords(
            config,
            creator,
            config.creator.reports.audit,
            buildRelatedRecordCriteria(approvalRecord.approvalRecordId),
          )
        ).map(mapAuditRecord);
      }

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
      const reviewer = normalizeReviewerName(payload?.reviewer);

      if (customApis.approveInvoice) {
        const response = await invokeCreatorCustomApi(
          customApis.approveInvoice,
          buildActionPayload(recordId, { ...payload, reviewer }),
        );
        assertActionSucceeded(response, "Failed to approve invoice.");
      } else {
        await updateCreatorRecord(config, creator, config.creator.reports.inbox, recordId, {
          Approval_Status: "Approved",
          Reviewer_Notes: payload.comment || "",
          Assigned_Reviewer: reviewer,
          Exception_Reason: payload.exceptionReason || "",
          Approval_Decision_Date: nowIso(),
        });

        if (payload.comment && config.creator.forms.comments) {
          await addCreatorRecord(config, creator, config.creator.forms.comments, {
            Approval_Request_ID: recordId,
            Author: reviewer,
            Comment_Type: "Approval note",
            Comment_Body: payload.comment,
            Created_At: nowIso(),
          });
        }

        if (config.creator.forms.audit) {
          await addCreatorRecord(config, creator, config.creator.forms.audit, {
            Approval_Request_ID: recordId,
            Event_Type: "Approved",
            Previous_Status: "",
            New_Status: "Approved",
            Event_Summary: `Invoice approved by ${reviewer}.`,
            Actor: reviewer,
            Created_At: nowIso(),
          });
        }
      }

      return this.loadInvoiceDetail(recordId);
    },

    async rejectInvoice(recordId, payload) {
      if (!normalizeText(payload?.comment)) {
        throw new Error("Rejecting an invoice requires a comment.");
      }
      const reviewer = normalizeReviewerName(payload?.reviewer);

      if (customApis.rejectInvoice) {
        const response = await invokeCreatorCustomApi(
          customApis.rejectInvoice,
          buildActionPayload(recordId, {
            ...payload,
            reviewer,
            exceptionReason: payload.exceptionReason || payload.comment,
          }),
        );
        assertActionSucceeded(response, "Failed to reject invoice.");
      } else {
        await updateCreatorRecord(config, creator, config.creator.reports.inbox, recordId, {
          Approval_Status: "Rejected",
          Reviewer_Notes: payload.comment,
          Assigned_Reviewer: reviewer,
          Exception_Reason: payload.exceptionReason || payload.comment,
          Approval_Decision_Date: nowIso(),
        });

        if (config.creator.forms.comments) {
          await addCreatorRecord(config, creator, config.creator.forms.comments, {
            Approval_Request_ID: recordId,
            Author: reviewer,
            Comment_Type: "Rejection note",
            Comment_Body: payload.comment,
            Created_At: nowIso(),
          });
        }

        if (config.creator.forms.audit) {
          await addCreatorRecord(config, creator, config.creator.forms.audit, {
            Approval_Request_ID: recordId,
            Event_Type: "Rejected",
            Previous_Status: "",
            New_Status: "Rejected",
            Event_Summary:
              payload.exceptionReason || "Invoice rejected with reviewer comment.",
            Actor: reviewer,
            Created_At: nowIso(),
          });
        }
      }

      return this.loadInvoiceDetail(recordId);
    },

    async requestClarification(recordId, payload) {
      if (!normalizeText(payload?.comment)) {
        throw new Error("Requesting clarification requires a comment.");
      }
      const reviewer = normalizeReviewerName(payload?.reviewer);

      if (customApis.requestClarification) {
        const response = await invokeCreatorCustomApi(
          customApis.requestClarification,
          buildActionPayload(recordId, {
            ...payload,
            reviewer,
            exceptionReason: payload.exceptionReason || payload.comment,
          }),
        );
        assertActionSucceeded(response, "Failed to request clarification.");
      } else {
        await updateCreatorRecord(config, creator, config.creator.reports.inbox, recordId, {
          Approval_Status: "Needs Clarification",
          Reviewer_Notes: payload.comment,
          Assigned_Reviewer: reviewer,
          Exception_Reason: payload.exceptionReason || payload.comment,
        });

        if (config.creator.forms.comments) {
          await addCreatorRecord(config, creator, config.creator.forms.comments, {
            Approval_Request_ID: recordId,
            Author: reviewer,
            Comment_Type: "Clarification",
            Comment_Body: payload.comment,
            Created_At: nowIso(),
          });
        }

        if (config.creator.forms.audit) {
          await addCreatorRecord(config, creator, config.creator.forms.audit, {
            Approval_Request_ID: recordId,
            Event_Type: "Clarification Requested",
            Previous_Status: "",
            New_Status: "Needs Clarification",
            Event_Summary:
              payload.exceptionReason || "Clarification requested by reviewer.",
            Actor: reviewer,
            Created_At: nowIso(),
          });
        }
      }

      return this.loadInvoiceDetail(recordId);
    },

    async addComment(recordId, payload) {
      if (!normalizeText(payload?.comment)) {
        throw new Error("A comment is required before adding a note.");
      }
      const reviewer = normalizeReviewerName(payload?.reviewer);

      if (customApis.addComment) {
        const response = await invokeCreatorCustomApi(
          customApis.addComment,
          buildCommentPayload(recordId, {
            ...payload,
            reviewer,
          }),
        );
        assertActionSucceeded(response, "Failed to add comment.");
      } else {
        if (!config.creator.forms.comments) {
          throw new Error("Comments form is not configured for this widget.");
        }

        await addCreatorRecord(config, creator, config.creator.forms.comments, {
          Approval_Request_ID: recordId,
          Author: reviewer,
          Comment_Type: payload.commentType || "General",
          Comment_Body: payload.comment,
          Created_At: nowIso(),
        });

        if (config.creator.forms.audit) {
          await addCreatorRecord(config, creator, config.creator.forms.audit, {
            Approval_Request_ID: recordId,
            Event_Type: "Comment Added",
            Previous_Status: "",
            New_Status: "",
            Event_Summary: "Reviewer added a new internal comment.",
            Actor: reviewer,
            Created_At: nowIso(),
          });
        }
      }

      return this.loadInvoiceDetail(recordId);
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
  const effectiveConfig = runtime
    ? hydrateRuntimeConfig(config, runtime.widgetParams, runtime.initData)
    : config;

  if (runtime && !effectiveConfig.useMockData) {
    return createCreatorService(effectiveConfig, runtime.creator, runtime);
  }

  if (runtime && effectiveConfig.useMockData) {
    return createMockService(effectiveConfig);
  }

  if (!runtime) {
    if (effectiveConfig.useMockData) {
      console.warn("Zoho Creator SDK was not found. Running in explicit mock mode.");
      return createMockService(effectiveConfig);
    }

    console.warn(
      "Zoho Creator SDK was not found. Running in standalone preview mode; live Creator records only load inside the Creator widget runtime.",
    );
    return createMockService(effectiveConfig);
  }

  return createMockService(effectiveConfig);
}
