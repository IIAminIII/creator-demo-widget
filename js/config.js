export const APP_CONFIG = {
  useMockData: false,
  creatorSdkUrl:
    "https://static.zohocdn.com/creator/widgets/version/2.0/widgetsdk-min.js",
  currentReviewerName: "Finance Ops Reviewer",
  filters: {
    approvalStatuses: [
      "All",
      "Pending Review",
      "Under Review",
      "Needs Clarification",
      "Approved",
      "Rejected",
      "Cancelled",
    ],
  },
  creator: {
    appLinkName: "",
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
      loadInbox: "listBooksInvoicesForApproval",
      loadInvoiceDetail: "getBooksInvoiceDetails",
      loadCrmContext: "getCrmContextForInvoice",
      approveInvoice: "approveInvoice",
      rejectInvoice: "rejectInvoice",
      requestClarification: "requestClarification",
      addComment: "addApprovalComment",
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
        : APP_CONFIG.useMockData;

  return {
    ...baseConfig,
    useMockData: resolvedUseMockData,
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
          widgetParams.booksListFunctionName ||
          widgetParams.getApprovalInboxFunctionName ||
          baseConfig.creator.customApis.loadInbox,
        loadInvoiceDetail:
          widgetParams.loadInvoiceDetailFunctionName ||
          widgetParams.booksDetailFunctionName ||
          widgetParams.getApprovalDetailFunctionName ||
          baseConfig.creator.customApis.loadInvoiceDetail,
        loadCrmContext:
          widgetParams.loadCrmContextFunctionName ||
          widgetParams.crmContextFunctionName ||
          widgetParams.getCrmContextFunctionName ||
          baseConfig.creator.customApis.loadCrmContext,
        approveInvoice:
          widgetParams.approveInvoiceFunctionName ||
          widgetParams.approvalActionFunctionName ||
          baseConfig.creator.customApis.approveInvoice,
        rejectInvoice:
          widgetParams.rejectInvoiceFunctionName ||
          widgetParams.approvalActionFunctionName ||
          baseConfig.creator.customApis.rejectInvoice,
        requestClarification:
          widgetParams.requestClarificationFunctionName ||
          widgetParams.approvalActionFunctionName ||
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
