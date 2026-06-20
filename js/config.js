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

export function getRuntimeConfig(widgetParams = {}) {
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
    ...APP_CONFIG,
    useMockData: resolvedUseMockData,
    currentReviewerName:
      widgetParams.currentReviewerName || APP_CONFIG.currentReviewerName,
    creator: {
      ...APP_CONFIG.creator,
      appLinkName:
        widgetParams.creatorAppName || APP_CONFIG.creator.appLinkName || "",
      reports: {
        ...APP_CONFIG.creator.reports,
        inbox:
          widgetParams.approvalRequestsReportName ||
          APP_CONFIG.creator.reports.inbox,
        comments:
          widgetParams.commentsReportName ||
          APP_CONFIG.creator.reports.comments,
        audit:
          widgetParams.auditLogReportName || APP_CONFIG.creator.reports.audit,
      },
      forms: {
        ...APP_CONFIG.creator.forms,
        approvalRequests:
          widgetParams.approvalRequestsFormName ||
          APP_CONFIG.creator.forms.approvalRequests,
        comments:
          widgetParams.commentsFormName || APP_CONFIG.creator.forms.comments,
        audit: widgetParams.auditLogFormName || APP_CONFIG.creator.forms.audit,
      },
      customApis: {
        ...APP_CONFIG.creator.customApis,
        loadInbox:
          widgetParams.loadInboxFunctionName ||
          widgetParams.getApprovalInboxFunctionName ||
          APP_CONFIG.creator.customApis.loadInbox,
        loadInvoiceDetail:
          widgetParams.loadInvoiceDetailFunctionName ||
          widgetParams.getApprovalDetailFunctionName ||
          APP_CONFIG.creator.customApis.loadInvoiceDetail,
        loadCrmContext:
          widgetParams.loadCrmContextFunctionName ||
          widgetParams.getCrmContextFunctionName ||
          APP_CONFIG.creator.customApis.loadCrmContext,
        approveInvoice:
          widgetParams.approveInvoiceFunctionName ||
          APP_CONFIG.creator.customApis.approveInvoice,
        rejectInvoice:
          widgetParams.rejectInvoiceFunctionName ||
          APP_CONFIG.creator.customApis.rejectInvoice,
        requestClarification:
          widgetParams.requestClarificationFunctionName ||
          APP_CONFIG.creator.customApis.requestClarification,
        addComment:
          widgetParams.addCommentFunctionName ||
          widgetParams.addApprovalCommentFunctionName ||
          APP_CONFIG.creator.customApis.addComment,
      },
    },
  };
}
