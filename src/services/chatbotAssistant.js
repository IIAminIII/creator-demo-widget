export const ASSISTANT_QUICK_ACTIONS = [
  "Daily Briefing",
  "Failed Refreshes",
  "Review Needed",
  "Reviewer Workload",
  "Unassigned",
  "Escalations",
  "Run Escalation Check",
  "Refresh Selected From Books",
  "Approve Selected",
  "Reject Selected",
  "Request Clarification",
  "Explain Selected Blockers",
  "Can Selected Be Approved?",
];

function normalizeText(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function includesAny(text, phrases) {
  return phrases.some((phrase) => text.includes(phrase));
}

function extractInvoiceNumber(message) {
  const match = String(message || "").match(/\bINV-[A-Z0-9-]+\b/i);
  return match ? match[0].toUpperCase() : "";
}

function extractReviewerEmail(message) {
  const match = String(message || "").match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
  return match ? match[0].toLowerCase() : "";
}

function extractCommentAfterInvoice(message, invoiceNumber) {
  const normalizedInvoiceNumber = String(invoiceNumber || "").trim();

  if (!normalizedInvoiceNumber) {
    return "";
  }

  const expression = new RegExp(
    `add\\s+comment\\s+${normalizedInvoiceNumber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+(.+)`,
    "i",
  );
  const match = String(message || "").match(expression);
  return match?.[1]?.trim() || "";
}

export function extractActionReason(text, removableWords = []) {
  let remaining = String(text || "");

  removableWords
    .filter(Boolean)
    .sort((left, right) => String(right).length - String(left).length)
    .forEach((word) => {
      remaining = remaining.replace(new RegExp(escapeRegExp(word), "gi"), " ");
    });

  return remaining.replace(/^[\s,:;-]+/, "").replace(/\s+/g, " ").trim();
}

export function parseAssistantIntent(message) {
  const normalizedMessage = normalizeText(message);
  const invoiceNumber = extractInvoiceNumber(message);
  const reviewerEmail = extractReviewerEmail(message);

  if (!normalizedMessage) {
    return { intent: "unknown", invoiceNumber: "" };
  }

  if (["yes", "confirm", "continue", "proceed", "ok"].includes(normalizedMessage)) {
    return { intent: "confirm pending action", invoiceNumber: "" };
  }

  if (["no", "cancel", "stop"].includes(normalizedMessage)) {
    return { intent: "cancel pending action", invoiceNumber: "" };
  }

  if (
    includesAny(normalizedMessage, [
      "run escalation check",
      "check escalations now",
      "run escalations",
    ])
  ) {
    return { intent: "run escalation check", invoiceNumber: "" };
  }

  if (
    includesAny(normalizedMessage, [
      "refresh selected from books",
      "refresh selected invoice from books",
    ])
  ) {
    return {
      intent: "refresh invoice from books",
      invoiceNumber: "",
      requestedIntent: "refresh invoice from books",
    };
  }

  if (
    includesAny(normalizedMessage, [
      "refresh",
      "refresh invoice",
    ]) &&
    normalizedMessage.includes("books")
  ) {
    return {
      intent: invoiceNumber ? "refresh invoice from books" : "invoice reference required",
      invoiceNumber,
      requestedIntent: "refresh invoice from books",
    };
  }

  if (normalizedMessage.startsWith("approve")) {
    return {
      intent: invoiceNumber ? "approve_invoice" : "invoice reference required",
      invoiceNumber,
      requestedIntent: "approve",
      comment: extractActionReason(message, ["approve", invoiceNumber]),
    };
  }

  if (normalizedMessage.startsWith("reject")) {
    return {
      intent: invoiceNumber ? "reject_invoice" : "invoice reference required",
      invoiceNumber,
      requestedIntent: "reject",
      reason: extractActionReason(message, ["reject", "because", invoiceNumber]),
    };
  }

  if (
    normalizedMessage.startsWith("request clarification") ||
    normalizedMessage.startsWith("clarification request") ||
    normalizedMessage.startsWith("clarify")
  ) {
    return {
      intent: invoiceNumber ? "request_clarification" : "invoice reference required",
      invoiceNumber,
      requestedIntent: "request clarification",
      reason: extractActionReason(message, [
        "request clarification",
        "clarification request",
        "clarify",
        "because",
        invoiceNumber,
      ]),
    };
  }

  if (normalizedMessage.startsWith("add comment")) {
    const comment = extractCommentAfterInvoice(message, invoiceNumber);
    return {
      intent:
        invoiceNumber && comment ? "add comment to invoice" : "invoice reference required",
      invoiceNumber,
      requestedIntent: "add comment to invoice",
      comment,
    };
  }

  if (normalizedMessage.startsWith("assign")) {
    return {
      intent:
        invoiceNumber && reviewerEmail ? "assign reviewer" : "invoice reference required",
      invoiceNumber,
      requestedIntent: "assign reviewer",
      reviewerEmail,
    };
  }

  if (
    includesAny(normalizedMessage, [
      "why blocked",
      "why is blocked",
      "why is inv",
      "blocked inv",
      "blocker inv",
      "explain selected blockers",
    ])
  ) {
    return {
      intent: invoiceNumber ? "why blocked" : "invoice reference required",
      invoiceNumber,
      requestedIntent: "why blocked",
    };
  }

  if (
    includesAny(normalizedMessage, [
      "can approve",
      "approve inv",
      "safe to approve",
      "approval check",
      "can selected be approved",
    ])
  ) {
    return {
      intent: invoiceNumber ? "can approve" : "invoice reference required",
      invoiceNumber,
      requestedIntent: "can approve",
    };
  }

  if (
    includesAny(normalizedMessage, [
      "invoice summary",
      "summary inv",
      "summarize inv",
      "invoice brief",
    ])
  ) {
    return {
      intent: invoiceNumber ? "invoice summary" : "invoice reference required",
      invoiceNumber,
      requestedIntent: "invoice summary",
    };
  }

  if (
    includesAny(normalizedMessage, [
      "daily briefing",
      "daily brief",
      "daily update",
      "briefing",
    ])
  ) {
    return { intent: "daily briefing", invoiceNumber: "" };
  }

  if (includesAny(normalizedMessage, ["dashboard summary", "dashboard", "summary"])) {
    return { intent: "dashboard summary", invoiceNumber: "" };
  }

  if (
    includesAny(normalizedMessage, [
      "failed refreshes",
      "failed refresh",
      "refresh issues",
      "books refresh issues",
    ])
  ) {
    return { intent: "failed refreshes", invoiceNumber: "" };
  }

  if (includesAny(normalizedMessage, ["review needed", "needs review"])) {
    return { intent: "review needed", invoiceNumber: "" };
  }

  if (includesAny(normalizedMessage, ["manual review"])) {
    return { intent: "manual review", invoiceNumber: "" };
  }

  if (includesAny(normalizedMessage, ["unassigned invoices", "unassigned", "without reviewer"])) {
    return { intent: "unassigned invoices", invoiceNumber: "" };
  }

  if (includesAny(normalizedMessage, ["reviewer workload", "workload", "reviewer capacity"])) {
    return { intent: "reviewer workload", invoiceNumber: "" };
  }

  if (includesAny(normalizedMessage, ["escalation briefing", "escalations", "escalation", "due soon"])) {
    return { intent: "escalation briefing", invoiceNumber: "" };
  }

  return { intent: "unknown", invoiceNumber };
}
