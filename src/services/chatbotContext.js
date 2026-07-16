export function createEmptyChatContext() {
  return {
    lastInvoiceNumber: "",
    lastApprovalRecordId: "",
    lastInvoice: null,
    lastIntent: "",
    lastResult: null,
    lastUpdatedAt: null,
  };
}

export function updateChatContextFromResult(context, result, intent) {
  const invoiceNumber =
    result?.data?.invoice?.invoiceNumber ||
    result?.data?.approvalRecordId && "" ||
    "";

  const approvalRecordId =
    result?.data?.approvalRecordId ||
    result?.data?.invoice?.approvalRecordId ||
    "";

  const invoice = result?.data?.invoice || null;

  return {
    ...context,
    lastInvoiceNumber: invoiceNumber || context.lastInvoiceNumber,
    lastApprovalRecordId: approvalRecordId || context.lastApprovalRecordId,
    lastInvoice: invoice || context.lastInvoice,
    lastIntent: intent || context.lastIntent,
    lastResult: result || context.lastResult,
    lastUpdatedAt: Date.now(),
  };
}

export function updateChatContextFromSelection(context, invoiceNumber, approvalRecordId, invoice) {
  return {
    ...context,
    lastInvoiceNumber: invoiceNumber || context.lastInvoiceNumber,
    lastApprovalRecordId: approvalRecordId || context.lastApprovalRecordId,
    lastInvoice: invoice || context.lastInvoice,
    lastUpdatedAt: Date.now(),
  };
}

export function getContextInvoiceNumber(context) {
  return context?.lastInvoiceNumber || "";
}

export function getContextApprovalRecordId(context) {
  return context?.lastApprovalRecordId || "";
}

export function hasInvoiceContext(context) {
  return Boolean(context?.lastInvoiceNumber || context?.lastApprovalRecordId);
}

export function clearChatContext() {
  return createEmptyChatContext();
}
