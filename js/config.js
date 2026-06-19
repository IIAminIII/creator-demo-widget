export const APP_CONFIG = {
  useMockData: true,
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
      loadInbox: "listInvoiceApprovalInbox",
      loadInvoiceDetail: "getInvoiceApprovalDetail",
      approveInvoice: "approveInvoice",
      rejectInvoice: "rejectInvoice",
      requestClarification: "requestClarification",
      addComment: "addApprovalComment",
    },
  },
};

export function getRuntimeConfig(widgetParams = {}) {
  return {
    ...APP_CONFIG,
    useMockData:
      widgetParams.useMockData === "false" ? false : APP_CONFIG.useMockData,
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
          widgetParams.commentsReportName || APP_CONFIG.creator.reports.comments,
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
          APP_CONFIG.creator.customApis.loadInbox,
        loadInvoiceDetail:
          widgetParams.loadInvoiceDetailFunctionName ||
          APP_CONFIG.creator.customApis.loadInvoiceDetail,
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
          APP_CONFIG.creator.customApis.addComment,
      },
    },
  };
}
