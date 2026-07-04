function getEnvValue(key, fallback = "") {
  if (typeof import.meta !== "undefined" && import.meta.env && key in import.meta.env) {
    return import.meta.env[key] || fallback;
  }

  return fallback;
}

export const APP_CONFIG = {
  useMockData: false,
  autoRefreshIntervalMs: 30000,
  creatorSdkUrl:
    "https://static.zohocdn.com/creator/widgets/version/2.0/widgetsdk-min.js",
  currentReviewerName: "Finance Ops Reviewer",
  filters: {
    approvalStatuses: [
      "All",
      "New",
      "Under Review",
      "Needs Clarification",
      "Approved",
      "Rejected",
    ],
  },
  creator: {
    appLinkName: getEnvValue("VITE_CREATOR_APP_LINK_NAME", "demo14instawebworkscom"),
    reports: {
      inbox: "Pending_Invoice_Approvals",
      comments: "Invoice_Approval_Comments_Report",
      audit: "Invoice_Approval_Audit_Log_Report",
    },
    forms: {
      approvalRequests: "Invoice_Approval_Requests",
      comments: "Invoice_Approval_Comments",
      audit: "Invoice_Approval_Audit_Log",
    },
    customApis: {
      loadInbox: getEnvValue("VITE_CREATOR_GET_APPROVAL_INBOX_URL"),
      loadDashboardSummary: getEnvValue(
        "VITE_CREATOR_GET_APPROVAL_DASHBOARD_SUMMARY_URL",
        "https://www.zohoapis.com/creator/custom/demo14instawebworkscom/getApprovalDashboardSummary?publickey=QKkMpmbkxqutH7UQwfd9etr9a",
      ),
      loadInvoiceDetail: getEnvValue("VITE_CREATOR_GET_APPROVAL_DETAIL_URL"),
      loadCrmContext: getEnvValue("VITE_CREATOR_LOAD_CRM_CONTEXT_URL"),
      refreshBooksInvoiceSnapshot: getEnvValue(
        "VITE_CREATOR_REFRESH_BOOKS_INVOICE_SNAPSHOT_URL",
        "https://www.zohoapis.com/creator/custom/demo14instawebworkscom/refreshBooksInvoiceSnapshot?publickey=rCXOYFbfUJM0tT49gstx3CBuZ",
      ),
      validateInvoiceApproval: getEnvValue("VITE_CREATOR_VALIDATE_INVOICE_APPROVAL_URL"),
      approveInvoice: getEnvValue("VITE_CREATOR_APPROVE_INVOICE_URL"),
      rejectInvoice: getEnvValue("VITE_CREATOR_REJECT_INVOICE_URL"),
      requestClarification: getEnvValue("VITE_CREATOR_REQUEST_CLARIFICATION_URL"),
      addComment: getEnvValue("VITE_CREATOR_ADD_APPROVAL_COMMENT_URL"),
    },
  },
};

function isTrueLike(value) {
  return value === true || value === "true";
}

function isFalseLike(value) {
  return value === false || value === "false";
}

function buildConfig(baseConfig, widgetParams = {}, initData = {}) {
  const useMockDataParam = widgetParams.useMockData;
  const mockModeQuery =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("mock")
      : null;
  const resolvedUseMockData =
    isTrueLike(mockModeQuery) || isTrueLike(useMockDataParam)
      ? true
      : isFalseLike(useMockDataParam)
        ? false
        : baseConfig.useMockData;

  return {
    ...baseConfig,
    useMockData: resolvedUseMockData,
    autoRefreshIntervalMs:
      Number(widgetParams.autoRefreshIntervalMs || baseConfig.autoRefreshIntervalMs) > 0
        ? Number(widgetParams.autoRefreshIntervalMs || baseConfig.autoRefreshIntervalMs)
        : baseConfig.autoRefreshIntervalMs,
    currentReviewerName:
      widgetParams.currentReviewerName || baseConfig.currentReviewerName,
    creator: {
      ...baseConfig.creator,
      appLinkName:
        widgetParams.creatorAppName ||
        initData.appLinkName ||
        initData.app_name ||
        baseConfig.creator.appLinkName ||
        "",
      reports: {
        ...baseConfig.creator.reports,
        inbox:
          widgetParams.approvalRequestsReportName ||
          baseConfig.creator.reports.inbox,
        comments:
          widgetParams.commentsReportName ||
          baseConfig.creator.reports.comments,
        audit:
          widgetParams.auditLogReportName || baseConfig.creator.reports.audit,
      },
      forms: {
        ...baseConfig.creator.forms,
        approvalRequests:
          widgetParams.approvalRequestsFormName ||
          baseConfig.creator.forms.approvalRequests,
        comments:
          widgetParams.commentsFormName || baseConfig.creator.forms.comments,
        audit: widgetParams.auditLogFormName || baseConfig.creator.forms.audit,
      },
      customApis: {
        ...baseConfig.creator.customApis,
        loadInbox:
          widgetParams.loadInboxFunctionName ||
          widgetParams.getApprovalInboxFunctionName ||
          baseConfig.creator.customApis.loadInbox,
        loadDashboardSummary:
          widgetParams.loadDashboardSummaryFunctionName ||
          widgetParams.getApprovalDashboardSummaryFunctionName ||
          baseConfig.creator.customApis.loadDashboardSummary,
        loadInvoiceDetail:
          widgetParams.loadInvoiceDetailFunctionName ||
          widgetParams.getApprovalDetailFunctionName ||
          baseConfig.creator.customApis.loadInvoiceDetail,
        loadCrmContext:
          widgetParams.loadCrmContextFunctionName ||
          widgetParams.getCrmContextFunctionName ||
          baseConfig.creator.customApis.loadCrmContext,
        refreshBooksInvoiceSnapshot:
          widgetParams.refreshBooksInvoiceSnapshotFunctionName ||
          widgetParams.refreshBooksSnapshotFunctionName ||
          baseConfig.creator.customApis.refreshBooksInvoiceSnapshot,
        validateInvoiceApproval:
          widgetParams.validateInvoiceApprovalFunctionName ||
          widgetParams.validateApprovalFunctionName ||
          baseConfig.creator.customApis.validateInvoiceApproval,
        approveInvoice:
          widgetParams.approveInvoiceFunctionName ||
          baseConfig.creator.customApis.approveInvoice,
        rejectInvoice:
          widgetParams.rejectInvoiceFunctionName ||
          baseConfig.creator.customApis.rejectInvoice,
        requestClarification:
          widgetParams.requestClarificationFunctionName ||
          baseConfig.creator.customApis.requestClarification,
        addComment:
          widgetParams.addCommentFunctionName ||
          widgetParams.addApprovalCommentFunctionName ||
          baseConfig.creator.customApis.addComment,
      },
    },
  };
}

export function getRuntimeConfig(widgetParams = {}) {
  return buildConfig(APP_CONFIG, widgetParams);
}

export function hydrateRuntimeConfig(baseConfig, widgetParams = {}, initData = {}) {
  return buildConfig(baseConfig, widgetParams, initData);
}
