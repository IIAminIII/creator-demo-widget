export const ASSISTANT_QUICK_ACTIONS = [
  "Daily Briefing",
  "Failed Refreshes",
  "Review Needed",
  "Reviewer Workload",
  "Unassigned",
  "Escalations",
];

function normalizeText(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function includesAny(text, phrases) {
  return phrases.some((phrase) => text.includes(phrase));
}

function extractInvoiceNumber(message) {
  const match = String(message || "").match(/\bINV-[A-Z0-9-]+\b/i);
  return match ? match[0].toUpperCase() : "";
}

export function parseAssistantIntent(message) {
  const normalizedMessage = normalizeText(message);
  const invoiceNumber = extractInvoiceNumber(message);

  if (!normalizedMessage) {
    return { intent: "unknown", invoiceNumber: "" };
  }

  if (
    includesAny(normalizedMessage, [
      "why blocked",
      "why is blocked",
      "why is inv",
      "blocked inv",
      "blocker inv",
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
