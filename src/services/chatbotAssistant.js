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

export function isContextReference(text) {
  const normalized = normalizeText(text);
  return includesAny(normalized, [
    "it",
    "this",
    "that",
    "the selected",
    "the current",
  ]);
}

export function resolveInvoiceNumberFromContext(intent, context) {
  if (intent?.invoiceNumber) {
    return intent.invoiceNumber;
  }

  if (intent?.needsContext && context?.lastInvoiceNumber) {
    return context.lastInvoiceNumber;
  }

  return "";
}

export function parseAssistantIntent(message) {
  const normalizedMessage = normalizeText(message);
  const invoiceNumber = extractInvoiceNumber(message);
  const reviewerEmail = extractReviewerEmail(message);

  if (!normalizedMessage) {
    return { intent: "unknown", invoiceNumber: "", originalText: message };
  }

  if (["yes", "confirm", "continue", "proceed", "ok"].includes(normalizedMessage)) {
    return { intent: "confirm pending action", invoiceNumber: "", originalText: message };
  }

  if (["no", "cancel", "stop"].includes(normalizedMessage)) {
    return { intent: "cancel pending action", invoiceNumber: "", originalText: message };
  }

  if (
    includesAny(normalizedMessage, [
      "clear context",
      "forget invoice",
      "reset chat context",
      "clear invoice",
    ])
  ) {
    return { intent: "clear context", invoiceNumber: "", originalText: message };
  }

  if (
    includesAny(normalizedMessage, [
      "run escalation check",
      "check escalations now",
      "run escalations",
    ])
  ) {
    return { intent: "run escalation check", invoiceNumber: "", originalText: message };
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
      originalText: message,
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
      originalText: message,
    };
  }

  if (
    includesAny(normalizedMessage, [
      "refresh it",
      "refresh this",
      "refresh that",
    ])
  ) {
    return {
      intent: "refresh invoice from books",
      invoiceNumber: "",
      requestedIntent: "refresh invoice from books",
      needsContext: true,
      originalText: message,
    };
  }

  if (normalizedMessage.startsWith("approve")) {
    if (
      includesAny(normalizedMessage, [
        "approve it",
        "approve this",
        "approve that",
      ])
    ) {
      return {
        intent: "approve_invoice",
        invoiceNumber: "",
        requestedIntent: "approve",
        comment: "",
        needsContext: true,
        originalText: message,
      };
    }

    return {
      intent: invoiceNumber ? "approve_invoice" : "invoice reference required",
      invoiceNumber,
      requestedIntent: "approve",
      comment: extractActionReason(message, ["approve", invoiceNumber]),
      originalText: message,
    };
  }

  if (normalizedMessage.startsWith("reject")) {
    return {
      intent: invoiceNumber ? "reject_invoice" : "invoice reference required",
      invoiceNumber,
      requestedIntent: "reject",
      reason: extractActionReason(message, ["reject", "because", invoiceNumber]),
      originalText: message,
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
      originalText: message,
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
      originalText: message,
    };
  }

  if (normalizedMessage.startsWith("assign")) {
    return {
      intent:
        invoiceNumber && reviewerEmail ? "assign reviewer" : "invoice reference required",
      invoiceNumber,
      requestedIntent: "assign reviewer",
      reviewerEmail,
      originalText: message,
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
    ]) ||
    includesAny(normalizedMessage, [
      "why is it blocked",
      "why blocked",
      "what is blocking",
    ])
  ) {
    if (
      includesAny(normalizedMessage, [
        "why is it blocked",
        "what is blocking it",
        "what is blocking this",
      ]) && !invoiceNumber
    ) {
      return {
        intent: "why blocked",
        invoiceNumber: "",
        requestedIntent: "why blocked",
        needsContext: true,
        originalText: message,
      };
    }

    return {
      intent: invoiceNumber ? "why blocked" : "invoice reference required",
      invoiceNumber,
      requestedIntent: "why blocked",
      originalText: message,
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
    if (
      includesAny(normalizedMessage, [
        "can it be approved",
        "can this be approved",
        "is it safe to approve",
      ]) && !invoiceNumber
    ) {
      return {
        intent: "can approve",
        invoiceNumber: "",
        requestedIntent: "can approve",
        needsContext: true,
        originalText: message,
      };
    }

    return {
      intent: invoiceNumber ? "can approve" : "invoice reference required",
      invoiceNumber,
      requestedIntent: "can approve",
      originalText: message,
    };
  }

  if (
    includesAny(normalizedMessage, [
      "show line items",
      "line items",
      "show items",
      "what items",
      "list items",
    ])
  ) {
    if (
      includesAny(normalizedMessage, [
        "show line items",
        "what items",
        "list items",
      ]) && !invoiceNumber
    ) {
      return {
        intent: "invoice_line_items",
        invoiceNumber: "",
        requestedIntent: "show line items",
        needsContext: true,
        originalText: message,
      };
    }

    return {
      intent: invoiceNumber ? "invoice_line_items" : "invoice reference required",
      invoiceNumber,
      requestedIntent: "show line items",
      originalText: message,
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
    if (
      includesAny(normalizedMessage, [
        "summarize it",
        "summarize this",
        "summary of it",
        "summary of this",
      ]) && !invoiceNumber
    ) {
      return {
        intent: "invoice summary",
        invoiceNumber: "",
        requestedIntent: "invoice summary",
        needsContext: true,
        originalText: message,
      };
    }

    return {
      intent: invoiceNumber ? "invoice summary" : "invoice reference required",
      invoiceNumber,
      requestedIntent: "invoice summary",
      originalText: message,
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
    return { intent: "daily briefing", invoiceNumber: "", originalText: message };
  }

  if (includesAny(normalizedMessage, ["dashboard summary", "dashboard", "summary"])) {
    return { intent: "dashboard summary", invoiceNumber: "", originalText: message };
  }

  if (
    includesAny(normalizedMessage, [
      "failed refreshes",
      "failed refresh",
      "refresh issues",
      "books refresh issues",
    ])
  ) {
    return { intent: "failed refreshes", invoiceNumber: "", originalText: message };
  }

  if (includesAny(normalizedMessage, ["review needed", "needs review"])) {
    return { intent: "review needed", invoiceNumber: "", originalText: message };
  }

  if (includesAny(normalizedMessage, ["manual review"])) {
    return { intent: "manual review", invoiceNumber: "", originalText: message };
  }

  if (includesAny(normalizedMessage, ["unassigned invoices", "unassigned", "without reviewer"])) {
    return { intent: "unassigned invoices", invoiceNumber: "", originalText: message };
  }

  if (includesAny(normalizedMessage, ["reviewer workload", "workload", "reviewer capacity"])) {
    return { intent: "reviewer workload", invoiceNumber: "", originalText: message };
  }

  if (includesAny(normalizedMessage, ["escalation briefing", "escalations", "escalation", "due soon"])) {
    return { intent: "escalation briefing", invoiceNumber: "", originalText: message };
  }

  return { intent: "unknown", invoiceNumber, originalText: message };
}
