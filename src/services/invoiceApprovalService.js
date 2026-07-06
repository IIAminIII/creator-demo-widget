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
  return (
    record?.ID ??
    record?.id ??
    record?.recordId ??
    record?.approvalRecordId ??
    record?.Approval_Request_ID ??
    null
  );
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toBooleanLike(value, fallback = null) {
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

function normalizeFilterValue(value, fallback = "All") {
  return getFirstString(value, fallback);
}

function normalizeInboxFilters(filters = {}) {
  return {
    statusFilter: normalizeFilterValue(filters.statusFilter ?? filters.status, "All"),
    syncFilter: normalizeFilterValue(filters.syncFilter, "All"),
    paymentFilter: normalizeFilterValue(filters.paymentFilter, "All"),
    priorityFilter: normalizeFilterValue(filters.priorityFilter, "All"),
    reviewerFilter: normalizeFilterValue(filters.reviewerFilter, "All Reviewers"),
    searchText: getFirstString(filters.searchText, filters.search),
    sortBy: getFirstString(filters.sortBy, "dueDate"),
    sortDirection: getFirstString(filters.sortDirection, "asc"),
    page: Math.max(1, Number(filters.page) || 1),
    pageSize: Math.max(1, Number(filters.pageSize) || 25),
  };
}

function normalizeBadgeValue(value) {
  return getFirstString(value).toLowerCase();
}

function isOverdueInvoice(item) {
  if (!item?.dueDate) {
    return false;
  }

  const dueDate = new Date(item.dueDate);
  if (Number.isNaN(dueDate.getTime())) {
    return false;
  }

  const status = normalizeBadgeValue(item.approvalStatus);
  return !["approved", "rejected"].includes(status) && dueDate.getTime() < Date.now();
}

function isPendingApprovalItem(item = {}) {
  const approvalStatus = normalizeStatus(item.approvalStatus).toLowerCase();
  return ["new", "pending review"].includes(approvalStatus);
}

function isReviewNeededItem(item = {}) {
  const approvalStatus = normalizeStatus(item.approvalStatus).toLowerCase();
  const syncStatus = normalizeBadgeValue(item.syncStatus);
  return (
    ["under review", "needs clarification"].includes(approvalStatus) ||
    syncStatus.includes("review needed")
  );
}

function isManualReviewItem(item = {}) {
  const syncStatus = normalizeBadgeValue(item.syncStatus);
  return (
    syncStatus.includes("manual") ||
    syncStatus.includes("warning") ||
    item.differenceFound === true
  );
}

function isFailedRefreshItem(item = {}) {
  return normalizeBadgeValue(item.syncStatus).includes("failed");
}

function isHighPriorityItem(item = {}) {
  return ["urgent", "high"].includes(normalizeBadgeValue(item.priority));
}

function isDueSoonItem(item = {}) {
  if (!item?.dueDate || isOverdueInvoice(item)) {
    return false;
  }

  const dueDate = new Date(item.dueDate);
  if (Number.isNaN(dueDate.getTime())) {
    return false;
  }

  const daysUntilDue = (dueDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
  return daysUntilDue <= 3;
}

function matchesStatusTab(item, statusFilter) {
  if (!statusFilter || statusFilter === "All") {
    return true;
  }

  const approvalStatus = normalizeStatus(item.approvalStatus);
  const normalizedStatus = approvalStatus.toLowerCase();
  const syncStatus = normalizeBadgeValue(item.syncStatus);

  switch (statusFilter) {
    case "Pending":
      return ["new", "pending review"].includes(normalizedStatus);
    case "Review Needed":
      return ["under review", "needs clarification"].includes(normalizedStatus);
    case "Manual Review":
      return (
        syncStatus.includes("manual") ||
        syncStatus.includes("warning") ||
        item.differenceFound === true
      );
    case "Failed":
      return syncStatus.includes("failed");
    case "Approved":
    case "Rejected":
      return approvalStatus === statusFilter;
    default:
      return (
        approvalStatus === statusFilter ||
        normalizedStatus === statusFilter.toLowerCase()
      );
  }
}

function matchesSelectFilter(itemValue, filterValue) {
  if (!filterValue || filterValue === "All") {
    return true;
  }

  return normalizeBadgeValue(itemValue) === normalizeBadgeValue(filterValue);
}

function matchesSyncFilter(item, syncFilter) {
  if (!syncFilter || syncFilter === "All") {
    return true;
  }

  if (syncFilter === "Review Needed") {
    return isReviewNeededItem(item);
  }

  if (syncFilter === "Difference Found") {
    return item.differenceFound === true;
  }

  return matchesSelectFilter(item.syncStatus, syncFilter);
}

function matchesPaymentFilter(item, paymentFilter) {
  if (!paymentFilter || paymentFilter === "All") {
    return true;
  }

  if (paymentFilter === "Overdue") {
    return isOverdueInvoice(item);
  }

  return matchesSelectFilter(item.paymentStatus, paymentFilter);
}

function matchesPriorityFilter(item, priorityFilter) {
  return matchesSelectFilter(item.priority, priorityFilter);
}

function matchesReviewerFilter(item, reviewerFilter) {
  if (!reviewerFilter || reviewerFilter === "All" || reviewerFilter === "All Reviewers") {
    return true;
  }

  const assignedReviewer = getFirstString(item.assignedReviewer, "Unassigned");
  const reviewerEmail = getFirstString(item.reviewerEmail);

  if (reviewerFilter === "Unassigned") {
    return normalizeBadgeValue(assignedReviewer) === "unassigned" && !reviewerEmail;
  }

  return normalizeBadgeValue(reviewerEmail) === normalizeBadgeValue(reviewerFilter);
}

function matchesSearchText(item, searchText) {
  const search = searchText?.trim().toLowerCase();

  if (!search) {
    return true;
  }

  const haystack = [
    item.invoiceNumber,
    item.customerName,
    item.crmAccountName,
    item.crmDealName,
    item.booksInvoiceId,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(search);
}

function matchesFilter(item, filters) {
  const normalizedFilters = normalizeInboxFilters(filters);

  return (
    matchesStatusTab(item, normalizedFilters.statusFilter) &&
    matchesSyncFilter(item, normalizedFilters.syncFilter) &&
    matchesPaymentFilter(item, normalizedFilters.paymentFilter) &&
    matchesPriorityFilter(item, normalizedFilters.priorityFilter) &&
    matchesReviewerFilter(item, normalizedFilters.reviewerFilter) &&
    matchesSearchText(item, normalizedFilters.searchText)
  );
}

function compareText(left, right) {
  return String(left || "").localeCompare(String(right || ""), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function compareDates(left, right) {
  const leftTime = left ? new Date(left).getTime() : Number.POSITIVE_INFINITY;
  const rightTime = right ? new Date(right).getTime() : Number.POSITIVE_INFINITY;
  return leftTime - rightTime;
}

function sortInboxItems(items, filters = {}) {
  const normalizedFilters = normalizeInboxFilters(filters);
  const direction = normalizedFilters.sortDirection === "desc" ? -1 : 1;
  const sorted = [...items].sort((left, right) => {
    switch (normalizedFilters.sortBy) {
      case "invoiceTotal":
        return (toNumber(left.invoiceTotal) - toNumber(right.invoiceTotal)) * direction;
      case "invoiceNumber":
        return compareText(left.invoiceNumber, right.invoiceNumber) * direction;
      case "customerName":
        return compareText(left.customerName, right.customerName) * direction;
      case "approvalStatus":
        return compareText(left.approvalStatus, right.approvalStatus) * direction;
      case "priority":
        return compareText(left.priority, right.priority) * direction;
      case "dueDate":
      default:
        return compareDates(left.dueDate, right.dueDate) * direction;
    }
  });

  const start = (normalizedFilters.page - 1) * normalizedFilters.pageSize;
  return sorted.slice(start, start + normalizedFilters.pageSize);
}

function toBackendStatusFilter(statusFilter) {
  switch (statusFilter) {
    case "Approved":
    case "Rejected":
      return statusFilter;
    case "Under Review":
    case "Needs Clarification":
    case "Pending Review":
      return statusFilter;
    default:
      return "All";
  }
}

function buildInboxPayload(filters = {}) {
  const normalized = normalizeInboxFilters(filters);
  const backendStatusFilter = toBackendStatusFilter(normalized.statusFilter);

  return {
    statusFilter: backendStatusFilter,
    syncFilter: "All",
    paymentFilter: "All",
    priorityFilter: "All",
    reviewerFilter:
      normalized.reviewerFilter === "All Reviewers" ? "All" : normalized.reviewerFilter,
    searchText: normalized.searchText,
    sortBy: normalized.sortBy,
    sortDirection: normalized.sortDirection,
    page: normalized.page,
    pageSize: normalized.pageSize,
    status: backendStatusFilter,
    search: normalized.searchText,
  };
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

function normalizeDashboardSummaryValue(value) {
  return toNumber(value);
}

function buildDashboardSummaryFromItems(items = []) {
  const summaryItems = Array.isArray(items) ? items : [];
  const approvalSummary = {
    totalInvoices: summaryItems.length,
    pending: 0,
    approved: 0,
    rejected: 0,
    needsClarification: 0,
  };
  const syncSummary = {
    synced: 0,
    notSynced: 0,
    reviewNeeded: 0,
    manualReview: 0,
    failed: 0,
  };
  const paymentSummary = {
    paid: 0,
    unpaid: 0,
    partiallyPaid: 0,
    overdue: 0,
    unknown: 0,
  };
  const agingSummary = {
    dueSoon: 0,
    overdueDueDate: 0,
  };
  const amountSummary = {
    pendingAmount: 0,
    approvedAmount: 0,
    reviewAmount: 0,
  };
  const prioritySummary = {
    urgent: 0,
    high: 0,
  };

  for (const item of summaryItems) {
    const approvalStatus = normalizeStatus(item.approvalStatus);
    const paymentStatus = normalizeBadgeValue(item.paymentStatus);
    const amount = toNumber(item.invoiceTotal);

    if (isPendingApprovalItem(item)) {
      approvalSummary.pending += 1;
      amountSummary.pendingAmount += amount;
    }

    if (approvalStatus === "Approved") {
      approvalSummary.approved += 1;
      amountSummary.approvedAmount += amount;
    }

    if (approvalStatus === "Rejected") {
      approvalSummary.rejected += 1;
    }

    if (approvalStatus === "Needs Clarification") {
      approvalSummary.needsClarification += 1;
    }

    if (normalizeBadgeValue(item.syncStatus).includes("synced")) {
      syncSummary.synced += 1;
    } else {
      syncSummary.notSynced += 1;
    }

    if (isReviewNeededItem(item)) {
      syncSummary.reviewNeeded += 1;
      amountSummary.reviewAmount += amount;
    }

    if (isManualReviewItem(item)) {
      syncSummary.manualReview += 1;
    }

    if (isFailedRefreshItem(item)) {
      syncSummary.failed += 1;
    }

    if (paymentStatus === "paid") {
      paymentSummary.paid += 1;
    } else if (paymentStatus === "unpaid") {
      paymentSummary.unpaid += 1;
    } else if (paymentStatus.includes("partial")) {
      paymentSummary.partiallyPaid += 1;
    } else {
      paymentSummary.unknown += 1;
    }

    if (isOverdueInvoice(item)) {
      paymentSummary.overdue += 1;
      agingSummary.overdueDueDate += 1;
    } else if (isDueSoonItem(item)) {
      agingSummary.dueSoon += 1;
    }

    if (normalizeBadgeValue(item.priority) === "urgent") {
      prioritySummary.urgent += 1;
    }

    if (isHighPriorityItem(item)) {
      prioritySummary.high += 1;
    }
  }

  return {
    approvalSummary,
    syncSummary,
    paymentSummary,
    agingSummary,
    amountSummary,
    prioritySummary,
    generatedAt: new Date().toISOString(),
  };
}

function normalizeDashboardSummary(rawSummary = {}) {
  const data = rawSummary?.data && typeof rawSummary.data === "object"
    ? rawSummary.data
    : rawSummary;

  return {
    approvalSummary: {
      totalInvoices: normalizeDashboardSummaryValue(data?.approvalSummary?.totalInvoices),
      pending: normalizeDashboardSummaryValue(data?.approvalSummary?.pending),
      approved: normalizeDashboardSummaryValue(data?.approvalSummary?.approved),
      rejected: normalizeDashboardSummaryValue(data?.approvalSummary?.rejected),
      needsClarification: normalizeDashboardSummaryValue(
        data?.approvalSummary?.needsClarification,
      ),
    },
    syncSummary: {
      synced: normalizeDashboardSummaryValue(data?.syncSummary?.synced),
      notSynced: normalizeDashboardSummaryValue(data?.syncSummary?.notSynced),
      reviewNeeded: normalizeDashboardSummaryValue(data?.syncSummary?.reviewNeeded),
      manualReview: normalizeDashboardSummaryValue(data?.syncSummary?.manualReview),
      failed: normalizeDashboardSummaryValue(data?.syncSummary?.failed),
    },
    paymentSummary: {
      paid: normalizeDashboardSummaryValue(data?.paymentSummary?.paid),
      unpaid: normalizeDashboardSummaryValue(data?.paymentSummary?.unpaid),
      partiallyPaid: normalizeDashboardSummaryValue(data?.paymentSummary?.partiallyPaid),
      overdue: normalizeDashboardSummaryValue(data?.paymentSummary?.overdue),
      unknown: normalizeDashboardSummaryValue(data?.paymentSummary?.unknown),
    },
    agingSummary: {
      dueSoon: normalizeDashboardSummaryValue(data?.agingSummary?.dueSoon),
      overdueDueDate: normalizeDashboardSummaryValue(data?.agingSummary?.overdueDueDate),
    },
    amountSummary: {
      pendingAmount: normalizeDashboardSummaryValue(data?.amountSummary?.pendingAmount),
      approvedAmount: normalizeDashboardSummaryValue(data?.amountSummary?.approvedAmount),
      reviewAmount: normalizeDashboardSummaryValue(data?.amountSummary?.reviewAmount),
    },
    prioritySummary: {
      urgent: normalizeDashboardSummaryValue(data?.prioritySummary?.urgent),
      high: normalizeDashboardSummaryValue(data?.prioritySummary?.high),
    },
    generatedAt: getFirstString(data?.generatedAt, rawSummary?.generatedAt),
  };
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
    crmDealName: record.crmDealName,
    syncStatus: record.syncStatus,
    differenceFound: toBooleanLike(record.differenceFound, false),
  };
}

function normalizeCreatorRecord(record) {
  return {
    approvalRecordId: String(getRecordId(record) ?? ""),
    booksInvoiceId: getFirstString(
      record.Books_Invoice_ID,
      record.books_invoice_id,
      record.booksInvoiceId,
    ),
    invoiceNumber: getFirstString(
      record.Books_Invoice_Number,
      record.Invoice_Number,
      record.invoiceNumber,
    ),
    customerName: getFirstString(
      record.Books_Customer_Name,
      record.Customer_Name,
      record.customerName,
    ),
    invoiceTotal: toNumber(record.Invoice_Total ?? record.invoiceTotal ?? record.total),
    currencyCode: getFirstString(record.Currency_Code, record.currencyCode, "USD"),
    dueDate: getFirstString(record.Due_Date, record.dueDate),
    invoiceDate: getFirstString(record.Invoice_Date, record.invoiceDate),
    booksStatus: getFirstString(
      record.Books_Invoice_Status,
      record.booksStatus,
      record.status,
      "sent",
    ),
    paymentStatus: getFirstString(
      record.Books_Payment_Status,
      record.paymentStatus,
      "unpaid",
    ),
    approvalStatus: normalizeStatus(
      getFirstString(record.Approval_Status, record.approvalStatus),
    ),
    priority: getFirstString(record.Priority, "Medium"),
    crmAccountName: getFirstString(record.CRM_Account_Name, record.crmAccountName),
    crmDealName: getFirstString(record.CRM_Deal_Name, record.crmDealName),
    crmOwnerName: getFirstString(record.CRM_Owner_Name, record.Account_Manager),
    assignedReviewer: getFirstString(record.Assigned_Reviewer, "Unassigned"),
    reviewerEmail: getFirstString(record.Reviewer_Email, record.reviewerEmail),
    assignmentStatus: getFirstString(record.Assignment_Status, record.assignmentStatus),
    assignedDate: getFirstString(record.Assigned_Date, record.assignedDate),
    assignmentNote: getFirstString(record.Assignment_Note, record.assignmentNote),
    exceptionReason: getFirstString(record.Exception_Reason),
    reviewerNotes: getFirstString(record.Reviewer_Notes),
    decisionDate: getFirstString(record.Approval_Decision_Date),
    lastActionBy: getFirstString(record.Last_Action_By, record.lastActionBy),
    lastActionDate: getFirstString(record.Last_Action_Date, record.lastActionDate),
    lastEventType: getFirstString(record.Last_Event_Type, record.lastEventType),
    lastBooksSyncAt: getFirstString(record.Last_Books_Sync_At),
    lastCrmEnrichmentAt: getFirstString(record.Last_CRM_Enrichment_At),
    lastComparedAt: getFirstString(
      record.Last_Compared_At,
      record.lastComparedAt,
      record.lastBooksComparedAt,
    ),
    differenceFound: toBooleanLike(
      record.Books_Sync_Difference_Found ??
        record.Difference_Found ??
        record.differenceFound ??
        record.booksSyncDifferenceFound ??
        record.booksSnapshotDifferenceFound,
    ),
    differenceSummary: getFirstString(
      record.Difference_Summary,
      record.differenceSummary,
    ),
    syncStatus: getFirstString(record.Sync_Status, record.syncStatus),
  };
}

function normalizeReviewerWorkloadRecord(record = {}) {
  return {
    reviewerName: getFirstString(
      record.reviewerName,
      record.reviewer,
      record.Reviewer_Name,
      "Unassigned",
    ),
    reviewerEmail: getFirstString(
      record.reviewerEmail,
      record.Reviewer_Email,
    ),
    assignedCount: toNumber(record.assignedCount ?? record.Assigned_Count),
    pendingCount: toNumber(record.pendingCount ?? record.Pending_Count),
    needsClarificationCount: toNumber(
      record.needsClarificationCount ?? record.Needs_Clarification_Count,
    ),
    reviewAmount: toNumber(record.reviewAmount ?? record.Review_Amount),
    unassignedCount: toNumber(record.unassignedCount ?? record.Unassigned_Count),
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
    eventType: getFirstString(record.Event_Type, record.eventType, "Event"),
    summary: getFirstString(record.Event_Summary, record.Summary, "Activity logged."),
    actor: getFirstString(record.Actor, record.Created_By, "System"),
    createdAt: getFirstString(record.Created_At, record.Added_Time, new Date().toISOString()),
  };
}

function getLatestAuditSummary(audit = []) {
  const latest = Array.isArray(audit) && audit.length ? audit[0] : null;

  return {
    lastActionBy: latest?.actor || "",
    lastActionDate: latest?.createdAt || "",
    lastEventType: latest?.eventType || "",
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
  record.lastActionBy = audit.actor;
  record.lastActionDate = audit.createdAt;
  record.lastEventType = audit.eventType;
  return audit;
}

function buildMockReviewerWorkload(store = []) {
  const workloadMap = new Map();
  let unassignedCount = 0;

  store.forEach((record) => {
    const reviewerName = getFirstString(record.assignedReviewer, "Unassigned");
    const reviewerEmail = getFirstString(record.reviewerEmail);
    const pendingLike = !["approved", "rejected"].includes(
      normalizeBadgeValue(record.approvalStatus),
    );

    if (normalizeBadgeValue(reviewerName) === "unassigned" && !reviewerEmail) {
      if (pendingLike) {
        unassignedCount += 1;
      }
      return;
    }

    const key = reviewerEmail || reviewerName;
    const existing = workloadMap.get(key) || {
      reviewerName,
      reviewerEmail,
      assignedCount: 0,
      pendingCount: 0,
      needsClarificationCount: 0,
      reviewAmount: 0,
      unassignedCount: 0,
    };

    existing.assignedCount += 1;
    if (pendingLike) {
      existing.pendingCount += 1;
      existing.reviewAmount += toNumber(record.invoiceTotal);
    }
    if (normalizeBadgeValue(record.approvalStatus) === "needs clarification") {
      existing.needsClarificationCount += 1;
    }

    workloadMap.set(key, existing);
  });

  return Array.from(workloadMap.values())
    .map((entry) => ({ ...entry, unassignedCount }))
    .sort((left, right) => right.pendingCount - left.pendingCount);
}

function buildGuardrailValidationFromSource(source = {}, fallback = {}) {
  const approvalStatus = getFirstString(
    source.approvalStatus,
    source.Approval_Status,
    fallback.approvalStatus,
  );
  const syncStatus = getFirstString(
    source.syncStatus,
    source.Sync_Status,
    fallback.syncStatus,
  );
  const booksPaymentStatus = getFirstString(
    source.booksPaymentStatus,
    source.Books_Payment_Status,
    source.paymentStatus,
    fallback.booksPaymentStatus,
  );
  const differenceFound = toBooleanLike(
    source.booksSyncDifferenceFound ??
      source.booksSnapshotDifferenceFound ??
      source.differenceFound ??
      source.Difference_Found ??
      source.Books_Sync_Difference_Found,
    fallback.differenceFound ?? null,
  );
  const lastBooksSyncAt = getFirstString(
    source.lastBooksSyncAt,
    source.Last_Books_Sync_At,
    fallback.lastBooksSyncAt,
  );
  const lastComparedAt = getFirstString(
    source.lastComparedAt,
    source.Last_Compared_At,
    source.lastBooksComparedAt,
    fallback.lastComparedAt,
  );
  const blockingReasons = Array.isArray(source.blockingReasons)
    ? source.blockingReasons.filter((reason) => getFirstString(reason))
    : [];
  const warningReasons = Array.isArray(source.warningReasons)
    ? source.warningReasons.filter((reason) => getFirstString(reason))
    : [];

  if (!blockingReasons.length && !warningReasons.length) {
    if (!lastBooksSyncAt) {
      blockingReasons.push("Refresh from Books before approving this invoice.");
    }

    if (!lastComparedAt) {
      warningReasons.push("Comparison timestamp is missing. Review the latest Books snapshot.");
    }

    if (differenceFound === true) {
      blockingReasons.push("Books comparison found differences that must be reviewed first.");
    }

    const normalizedPayment = booksPaymentStatus.toLowerCase();
    if (normalizedPayment.includes("paid")) {
      warningReasons.push("Invoice already shows a paid or partially paid status in Books.");
    }

    const normalizedSync = syncStatus.toLowerCase();
    if (normalizedSync.includes("failed")) {
      blockingReasons.push("The latest Books sync failed. Refresh and compare again before approving.");
    } else if (
      normalizedSync.includes("manual") ||
      normalizedSync.includes("warning")
    ) {
      warningReasons.push("Books sync status suggests manual review is still recommended.");
    }

    if (lastBooksSyncAt) {
      const syncedAt = new Date(lastBooksSyncAt);

      if (!Number.isNaN(syncedAt.getTime())) {
        const ageMs = Date.now() - syncedAt.getTime();
        if (ageMs > 24 * 60 * 60 * 1000) {
          warningReasons.push("Books snapshot is older than 24 hours.");
        }
      }
    }
  }

  const canApprove =
    typeof source.canApprove === "boolean"
      ? source.canApprove
      : blockingReasons.length === 0;
  const severity =
    getFirstString(source.severity) ||
    (canApprove
      ? warningReasons.length
        ? "warning"
        : "success"
      : "error");
  const message =
    getFirstString(source.message) ||
    (canApprove
      ? warningReasons.length
        ? "Approval can continue with reviewer confirmation."
        : "Invoice is safe to approve."
      : "Approval is blocked until the listed issues are resolved.");

  return {
    ok: source.ok !== false,
    canApprove,
    severity,
    message,
    blockingReasons,
    warningReasons,
    approvalRecordId: String(
      source.approvalRecordId ?? fallback.approvalRecordId ?? "",
    ),
    approvalStatus,
    syncStatus,
    booksPaymentStatus,
    differenceFound,
    lastBooksSyncAt,
    lastComparedAt,
  };
}

function createMockService() {
  return {
    mode: "mock",
    async loadDashboardSummary() {
      return normalizeDashboardSummary(buildDashboardSummaryFromItems(mockStore));
    },
    async loadReviewerWorkload() {
      return buildMockReviewerWorkload(mockStore);
    },
    async loadInbox(filters = {}) {
      const allItems = mockStore.map(normalizeMockInboxItem);
      const filtered = allItems.filter((item) => matchesFilter(item, filters));

      return {
        items: sortInboxItems(filtered, filters),
        summary: buildSummary(allItems),
      };
    },

    async loadInvoiceDetail(approvalRecordId) {
      const record = mockStore.find((item) => item.approvalRecordId === approvalRecordId);

      if (!record) {
        throw new Error("Approval record not found in the local preview store.");
      }

      return clone(record);
    },

    async validateInvoiceApproval(recordId) {
      const record = mockStore.find((item) => item.approvalRecordId === recordId);

      if (!record) {
        throw new Error("Approval record not found.");
      }

      return buildGuardrailValidationFromSource(
        {
          approvalRecordId: record.approvalRecordId,
          approvalStatus: record.approvalStatus,
          syncStatus: record.syncStatus,
          booksPaymentStatus: record.paymentStatus,
          differenceFound: record.differenceFound,
          lastBooksSyncAt: record.lastBooksSyncAt,
          lastComparedAt: record.lastComparedAt,
        },
        { approvalRecordId: recordId },
      );
    },

    async refreshInvoice(invoiceId) {
      const record = mockStore.find((item) => item.booksInvoiceId === invoiceId);

      if (!record) {
        throw new Error("Books invoice not found in the local preview store.");
      }

      record.lastBooksSyncAt = new Date().toISOString();
      addMockAudit(record, "Books Snapshot Refreshed", "Invoice snapshot refreshed from the local preview source.", "System");

      return clone(record);
    },

    async assignInvoiceReviewer(recordId, payload) {
      const record = mockStore.find((item) => item.approvalRecordId === recordId);

      if (!record) {
        throw new Error("Approval record not found.");
      }

      const reviewerName = getFirstString(payload?.reviewerName, payload?.reviewer, "Reviewer");
      const reviewerEmail = getFirstString(payload?.reviewerEmail);
      const assignmentNote = getFirstString(payload?.assignmentNote);

      record.assignedReviewer = reviewerName;
      record.reviewerEmail = reviewerEmail;
      record.assignmentStatus = "Assigned";
      record.assignedDate = new Date().toISOString();
      record.assignmentNote = assignmentNote;
      if (assignmentNote) {
        record.reviewerNotes = assignmentNote;
      }

      addMockAudit(
        record,
        "Comment Added",
        `Invoice assigned to ${reviewerName}${reviewerEmail ? ` (${reviewerEmail})` : ""}.`,
        reviewerName,
      );

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
      addMockAudit(record, "Clarification Requested", `Clarification requested: ${payload.exceptionReason || "No reason provided"}.`, payload.reviewer || "Reviewer");

      return clone(record);
    },

    async addComment(recordId, payload) {
      const record = mockStore.find((item) => item.approvalRecordId === recordId);

      if (!record) {
        throw new Error("Approval record not found.");
      }

      addMockComment(record, payload);
      addMockAudit(record, "Comment Added", "Reviewer added a comment.", payload.reviewer || "Reviewer");

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

    async loadDashboardSummary() {
      if (config.loadDashboardSummaryFunctionName) {
        try {
          const response = await tryInvokeCreatorFunction(
            api,
            config.loadDashboardSummaryFunctionName,
            {},
          );
          const result = response?.data?.result ?? response?.result ?? response?.data ?? response;
          return normalizeDashboardSummary(result);
        } catch (error) {
          console.warn("Falling back to Creator-derived dashboard summary:", error);
        }
      }

      const recordsResponse = await api.getRecords(config.approvalRequestsReportName, {
        appName: config.creatorAppName,
      });
      const normalizedItems = (
        Array.isArray(recordsResponse?.data) ? recordsResponse.data : recordsResponse
      ).map(normalizeCreatorRecord);
      return normalizeDashboardSummary(buildDashboardSummaryFromItems(normalizedItems));
    },

    async loadReviewerWorkload() {
      if (config.loadReviewerWorkloadFunctionName) {
        try {
          const response = await tryInvokeCreatorFunction(
            api,
            config.loadReviewerWorkloadFunctionName,
            {},
          );
          const result = response?.data?.result ?? response?.result ?? response?.data ?? response;
          const rawItems = Array.isArray(result)
            ? result
            : Array.isArray(result?.items)
              ? result.items
              : Array.isArray(result?.data?.items)
                ? result.data.items
                : Array.isArray(result?.reviewers)
                  ? result.reviewers
                  : [];

          if (rawItems.length) {
            return rawItems.map(normalizeReviewerWorkloadRecord);
          }
        } catch (error) {
          console.warn("Falling back to Creator-derived reviewer workload:", error);
        }
      }

      const recordsResponse = await api.getRecords(config.approvalRequestsReportName, {
        appName: config.creatorAppName,
      });
      const normalizedItems = (
        Array.isArray(recordsResponse?.data) ? recordsResponse.data : recordsResponse
      ).map(normalizeCreatorRecord);
      return buildMockReviewerWorkload(normalizedItems);
    },

    async loadInbox(filters = {}) {
      if (config.loadInboxFunctionName) {
        try {
          const response = await tryInvokeCreatorFunction(
            api,
            config.loadInboxFunctionName,
            buildInboxPayload(filters),
          );
          const result = response?.data?.result ?? response?.result ?? response?.data ?? response;
          const rawItems = Array.isArray(result?.items)
            ? result.items
            : Array.isArray(result?.data?.items)
              ? result.data.items
              : null;

          if (Array.isArray(rawItems)) {
            const normalizedItems = rawItems.map(normalizeCreatorRecord);
            const filteredItems = normalizedItems.filter((item) =>
              matchesFilter(item, filters),
            );

            return {
              items: sortInboxItems(filteredItems, filters),
              summary: buildSummary(normalizedItems),
            };
          }
        } catch (error) {
          console.warn("Falling back to Creator report inbox load:", error);
        }
      }

      const recordsResponse = await api.getRecords(config.approvalRequestsReportName, {
        appName: config.creatorAppName,
      });

      const normalizedItems = (
        Array.isArray(recordsResponse?.data) ? recordsResponse.data : recordsResponse
      ).map(normalizeCreatorRecord);
      const items = normalizedItems.filter((item) => matchesFilter(item, filters));

      return {
        items: sortInboxItems(items, filters),
        summary: buildSummary(normalizedItems),
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
      const lastAuditSummary = getLatestAuditSummary(audit);

      return {
        ...invoice,
        lastComparedAt: invoice.lastComparedAt,
        differenceFound: invoice.differenceFound,
        differenceSummary: invoice.differenceSummary,
        syncStatus: invoice.syncStatus,
        lastActionBy: invoice.lastActionBy || lastAuditSummary.lastActionBy,
        lastActionDate: invoice.lastActionDate || lastAuditSummary.lastActionDate,
        lastEventType: invoice.lastEventType || lastAuditSummary.lastEventType,
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

    async validateInvoiceApproval(recordId) {
      if (config.validateInvoiceApprovalFunctionName) {
        const response = await tryInvokeCreatorFunction(
          api,
          config.validateInvoiceApprovalFunctionName,
          { approvalRecordId: recordId },
        );
        const result = response?.data?.result ?? response?.result ?? response?.data ?? response;

        return buildGuardrailValidationFromSource(result, {
          approvalRecordId: recordId,
        });
      }

      const detail = await this.loadInvoiceDetail(recordId);

      return buildGuardrailValidationFromSource(
        {
          approvalRecordId: detail.approvalRecordId,
          approvalStatus: detail.approvalStatus,
          syncStatus: detail.syncStatus,
          booksPaymentStatus: detail.paymentStatus,
          differenceFound: detail.differenceFound,
          lastBooksSyncAt: detail.lastBooksSyncAt,
          lastComparedAt: detail.lastComparedAt,
        },
        { approvalRecordId: recordId },
      );
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

    async assignInvoiceReviewer(recordId, payload) {
      const assignmentPayload = {
        approvalRecordId: recordId,
        reviewerName: getFirstString(payload?.reviewerName, payload?.reviewer, "Reviewer"),
        reviewerEmail: getFirstString(payload?.reviewerEmail),
        assignmentNote: getFirstString(payload?.assignmentNote),
      };

      if (config.assignInvoiceReviewerFunctionName) {
        const response = await tryInvokeCreatorFunction(
          api,
          config.assignInvoiceReviewerFunctionName,
          assignmentPayload,
        );
        const result = response?.data?.result ?? response?.result ?? response?.data ?? response;

        if (result?.ok === false) {
          throw new Error(result?.message || "Failed to assign reviewer.");
        }

        return this.loadInvoiceDetail(recordId);
      }

      await api.updateRecord(config.approvalRequestsReportName, recordId, {
        appName: config.creatorAppName,
        data: {
          Assigned_Reviewer: assignmentPayload.reviewerName,
          Reviewer_Email: assignmentPayload.reviewerEmail,
          Assignment_Status: "Assigned",
          Assigned_Date: new Date().toISOString(),
          Assignment_Note: assignmentPayload.assignmentNote,
        },
      });

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
    loadInboxFunctionName: getFirstString(
      widgetParams.loadInboxFunctionName,
      widgetParams.getApprovalInboxFunctionName,
      "getApprovalInbox",
    ),
    loadDashboardSummaryFunctionName: getFirstString(
      widgetParams.loadDashboardSummaryFunctionName,
      widgetParams.getApprovalDashboardSummaryFunctionName,
      "getApprovalDashboardSummary",
    ),
    validateInvoiceApprovalFunctionName: getFirstString(
      widgetParams.validateInvoiceApprovalFunctionName,
      widgetParams.validateApprovalFunctionName,
      "validateInvoiceApproval",
    ),
    loadReviewerWorkloadFunctionName: getFirstString(
      widgetParams.loadReviewerWorkloadFunctionName,
      widgetParams.getReviewerWorkloadSummaryFunctionName,
      "getReviewerWorkloadSummary",
    ),
    assignInvoiceReviewerFunctionName: getFirstString(
      widgetParams.assignInvoiceReviewerFunctionName,
      "assignInvoiceReviewer",
    ),
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
