export const APP_CONFIG = {
  useMockData: false,
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
    appLinkName: "demo14instawebworkscom",
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
      loadInbox: "getApprovalInbox",
      loadInvoiceDetail: "getApprovalDetail",
      loadCrmContext: "",
      approveInvoice:
        "https://www.zohoapis.com/creator/custom/demo14instawebworkscom/approveInvoice?publickey=e8C65Z0y02m57z4nmrRGE8dnB",
      rejectInvoice:
        "https://www.zohoapis.com/creator/custom/demo14instawebworkscom/rejectInvoice?publickey=Qk8gVJSbp8uPqdVQ9DFF0U78R",
      requestClarification:
        "https://www.zohoapis.com/creator/custom/demo14instawebworkscom/requestClarification?publickey=1V3FmYUKv1vn3W43AmTkHyeXh",
      addComment:
        "https://www.zohoapis.com/creator/custom/demo14instawebworkscom/addApprovalComment?publickey=ZdQeACMaQvSjZyRMXJCUJn7EO",
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
        loadInvoiceDetail:
          widgetParams.loadInvoiceDetailFunctionName ||
          widgetParams.getApprovalDetailFunctionName ||
          baseConfig.creator.customApis.loadInvoiceDetail,
        loadCrmContext:
          widgetParams.loadCrmContextFunctionName ||
          widgetParams.getCrmContextFunctionName ||
          baseConfig.creator.customApis.loadCrmContext,
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
