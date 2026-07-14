import { useState } from "react";
import { ASSISTANT_QUICK_ACTIONS } from "../services/chatbotAssistant";

function formatCurrency(value, currencyCode) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode || "USD",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatDateTime(value) {
  if (!value) {
    return "N/A";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

function MessageToneClass({ role, tone }) {
  if (role === "user") {
    return "assistant-bubble assistant-bubble-user";
  }

  if (tone === "warning") {
    return "assistant-bubble assistant-bubble-warning";
  }

  if (tone === "success") {
    return "assistant-bubble assistant-bubble-success";
  }

  return "assistant-bubble assistant-bubble-assistant";
}

function AssistantMiniStatGrid({ stats = [] }) {
  if (!stats.length) {
    return null;
  }

  return (
    <div className="assistant-stats-grid">
      {stats.map((stat) => (
        <div key={stat.label} className="assistant-stat-tile">
          <div className="assistant-stat-label">{stat.label}</div>
          <div className="assistant-stat-value">{stat.value}</div>
          {stat.helper ? <div className="assistant-stat-helper">{stat.helper}</div> : null}
        </div>
      ))}
    </div>
  );
}

function AssistantReasonList({ title, reasons = [], tone = "neutral" }) {
  if (!reasons.length) {
    return null;
  }

  return (
    <div className={`assistant-data-panel assistant-data-panel-${tone}`}>
      <div className="assistant-data-title">{title}</div>
      <div className="assistant-reason-list">
        {reasons.map((reason) => (
          <div key={`${title}-${reason}`} className="assistant-reason-item">
            {reason}
          </div>
        ))}
      </div>
    </div>
  );
}

function AssistantInvoiceList({ title, items = [], totalCount = 0, emptyMessage = "" }) {
  return (
    <div className="assistant-data-panel">
      <div className="assistant-data-title">
        {title}
        {totalCount ? <span className="assistant-inline-count">{totalCount}</span> : null}
      </div>
      {items.length ? (
        <div className="assistant-list">
          {items.map((item) => (
            <div key={item.approvalRecordId || item.invoiceNumber} className="assistant-list-row">
              <div className="assistant-list-row-main">
                <div className="assistant-list-row-title">{item.invoiceNumber}</div>
                <div className="assistant-list-row-subtitle">{item.customerName || "Unknown customer"}</div>
              </div>
              <div className="assistant-list-row-meta">
                <span>{item.approvalStatus}</span>
                <span>{item.syncStatus}</span>
                <span>{formatCurrency(item.invoiceTotal, item.currencyCode)}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="assistant-empty-copy">{emptyMessage || "No invoices found."}</div>
      )}
    </div>
  );
}

function AssistantReviewerWorkload({ items = [], totalCount = 0 }) {
  return (
    <div className="assistant-data-panel">
      <div className="assistant-data-title">
        Reviewer Workload
        {totalCount ? <span className="assistant-inline-count">{totalCount}</span> : null}
      </div>
      {items.length ? (
        <div className="assistant-list">
          {items.map((item) => (
            <div key={item.reviewerEmail || item.reviewerName} className="assistant-list-row">
              <div className="assistant-list-row-main">
                <div className="assistant-list-row-title">{item.reviewerName}</div>
                <div className="assistant-list-row-subtitle">
                  {item.reviewerEmail || "No email recorded"}
                </div>
              </div>
              <div className="assistant-list-row-meta">
                <span>{item.pendingCount} pending</span>
                <span>{item.needsClarificationCount} clarification</span>
                <span>{formatCurrency(item.reviewAmount, "USD")}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="assistant-empty-copy">No reviewer workload data is available.</div>
      )}
    </div>
  );
}

function AssistantAuditSummary({ items = [] }) {
  if (!items.length) {
    return null;
  }

  return (
    <div className="assistant-data-panel">
      <div className="assistant-data-title">Recent Audit Events</div>
      <div className="assistant-list">
        {items.map((item) => (
          <div key={item.id || `${item.eventType}-${item.createdAt}`} className="assistant-list-row">
            <div className="assistant-list-row-main">
              <div className="assistant-list-row-title">{item.eventType}</div>
              <div className="assistant-list-row-subtitle">{item.summary || "No summary available"}</div>
            </div>
            <div className="assistant-list-row-meta">
              <span>{item.actor || "System"}</span>
              <span>{formatDateTime(item.createdAt)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AssistantInvoiceSummary({ data }) {
  const invoice = data?.invoice;

  if (!invoice) {
    return null;
  }

  return (
    <>
      <div className="assistant-data-panel">
        <div className="assistant-data-title">Invoice Summary</div>
        <div className="assistant-definition-grid">
          <div>
            <span className="assistant-definition-label">Customer</span>
            <span className="assistant-definition-value">{invoice.customerName || "Unknown"}</span>
          </div>
          <div>
            <span className="assistant-definition-label">Approval</span>
            <span className="assistant-definition-value">{invoice.approvalStatus}</span>
          </div>
          <div>
            <span className="assistant-definition-label">Sync</span>
            <span className="assistant-definition-value">{invoice.syncStatus}</span>
          </div>
          <div>
            <span className="assistant-definition-label">Payment</span>
            <span className="assistant-definition-value">{invoice.paymentStatus}</span>
          </div>
          <div>
            <span className="assistant-definition-label">Reviewer</span>
            <span className="assistant-definition-value">{invoice.assignedReviewer}</span>
          </div>
          <div>
            <span className="assistant-definition-label">Total</span>
            <span className="assistant-definition-value">
              {formatCurrency(invoice.invoiceTotal, invoice.currencyCode)}
            </span>
          </div>
          <div>
            <span className="assistant-definition-label">Line Items</span>
            <span className="assistant-definition-value">{invoice.lineItemCount}</span>
          </div>
          <div>
            <span className="assistant-definition-label">Last Event</span>
            <span className="assistant-definition-value">{invoice.lastEventType || "N/A"}</span>
          </div>
        </div>
        {invoice.differenceSummary ? (
          <div className="assistant-inline-note">{invoice.differenceSummary}</div>
        ) : null}
      </div>
      <AssistantReasonList title="Blocking Reasons" reasons={data?.blockingReasons} tone="warning" />
      <AssistantReasonList title="Warning Reasons" reasons={data?.warningReasons} tone="warning" />
      <AssistantAuditSummary items={data?.recentAudit || []} />
    </>
  );
}

function renderMessageData(data) {
  if (!data || typeof data !== "object") {
    return null;
  }

  switch (data.type) {
    case "dashboard-summary":
      return <AssistantMiniStatGrid stats={data.stats || []} />;
    case "daily-briefing":
      return (
        <>
          <AssistantMiniStatGrid stats={data.stats || []} />
          <AssistantInvoiceList
            title="Failed Refreshes"
            items={data.failedRefreshes || []}
            totalCount={data.failedRefreshes?.length || 0}
            emptyMessage="No failed refreshes are in the queue."
          />
          <AssistantInvoiceList
            title="Manual Review"
            items={data.manualReview || []}
            totalCount={data.manualReview?.length || 0}
            emptyMessage="No invoices are in manual review."
          />
          <AssistantInvoiceList
            title="Unassigned Invoices"
            items={data.unassignedInvoices || []}
            totalCount={data.unassignedInvoices?.length || 0}
            emptyMessage="No unassigned invoices are waiting."
          />
        </>
      );
    case "invoice-list":
      return (
        <AssistantInvoiceList
          title={data.title}
          items={data.items || []}
          totalCount={data.totalCount || 0}
          emptyMessage={data.emptyMessage}
        />
      );
    case "reviewer-workload":
      return (
        <AssistantReviewerWorkload
          items={data.items || []}
          totalCount={data.totalCount || 0}
        />
      );
    case "approval-check":
      return (
        <>
          <div className="assistant-data-panel">
            <div className="assistant-data-title">Approval Safety</div>
            <div className="assistant-definition-grid">
              <div>
                <span className="assistant-definition-label">Invoice</span>
                <span className="assistant-definition-value">{data.invoice?.invoiceNumber}</span>
              </div>
              <div>
                <span className="assistant-definition-label">Can Approve</span>
                <span className="assistant-definition-value">
                  {data.canApprove ? "Yes" : "No"}
                </span>
              </div>
              <div>
                <span className="assistant-definition-label">Sync</span>
                <span className="assistant-definition-value">{data.syncStatus}</span>
              </div>
              <div>
                <span className="assistant-definition-label">Payment</span>
                <span className="assistant-definition-value">{data.paymentStatus}</span>
              </div>
              <div>
                <span className="assistant-definition-label">Last Sync</span>
                <span className="assistant-definition-value">
                  {formatDateTime(data.lastBooksSyncAt)}
                </span>
              </div>
              <div>
                <span className="assistant-definition-label">Last Compared</span>
                <span className="assistant-definition-value">
                  {formatDateTime(data.lastComparedAt)}
                </span>
              </div>
            </div>
          </div>
          <AssistantReasonList
            title="Blocking Reasons"
            reasons={data.blockingReasons || []}
            tone="warning"
          />
          <AssistantReasonList
            title="Warning Reasons"
            reasons={data.warningReasons || []}
            tone="warning"
          />
        </>
      );
    case "invoice-summary":
      return <AssistantInvoiceSummary data={data} />;
    case "escalation-briefing":
      return (
        <>
          <AssistantInvoiceList
            title="Escalations"
            items={data.escalatedItems || []}
            totalCount={data.escalatedItems?.length || 0}
            emptyMessage="No escalations were returned."
          />
          <AssistantInvoiceList
            title="Due Soon"
            items={data.dueSoonItems || []}
            totalCount={data.dueSoonItems?.length || 0}
            emptyMessage="No invoices are currently due soon."
          />
          <AssistantReviewerWorkload
            items={data.reviewerWorkload || []}
            totalCount={data.reviewerWorkload?.length || 0}
          />
        </>
      );
    default:
      return null;
  }
}

export default function OperationsAssistantCard({
  messages = [],
  loading = false,
  onSend,
}) {
  const [draft, setDraft] = useState("");

  async function submitMessage(message) {
    const trimmed = String(message || "").trim();

    if (!trimmed) {
      return;
    }

    await onSend?.(trimmed);
    setDraft("");
  }

  return (
    <section className="widget-surface assistant-card">
      <div className="assistant-card-header">
        <div>
          <h2 className="assistant-card-title">AI Operations Assistant</h2>
          <p className="assistant-card-subtitle">
            Ask about invoice approvals, blockers, workload, Books refresh issues, and escalations.
          </p>
        </div>
      </div>

      <div className="assistant-quick-actions">
        {ASSISTANT_QUICK_ACTIONS.map((action) => (
          <button
            key={action}
            type="button"
            className="assistant-quick-action"
            onClick={() => submitMessage(action)}
            disabled={loading}
          >
            {action}
          </button>
        ))}
      </div>

      <div className="assistant-thread">
        {messages.map((message) => (
          <div key={message.id} className={MessageToneClass({
            role: message.role,
            tone: message.data?.tone,
          })}>
            <div className="assistant-message-role">
              {message.role === "user" ? "You" : "Assistant"}
            </div>
            <div className="assistant-message-copy">{message.content}</div>
            {message.role === "assistant" ? renderMessageData(message.data) : null}
          </div>
        ))}

        {loading ? (
          <div className="assistant-bubble assistant-bubble-assistant">
            <div className="assistant-message-role">Assistant</div>
            <div className="assistant-message-copy">
              Checking the Creator-backed approval workspace now.
            </div>
          </div>
        ) : null}
      </div>

      <div className="assistant-compose">
        <input
          className="assistant-input"
          placeholder="Try: can approve INV-2026-0018"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submitMessage(draft);
            }
          }}
        />
        <button
          type="button"
          className="assistant-send-button"
          disabled={loading || !draft.trim()}
          onClick={() => submitMessage(draft)}
        >
          Send
        </button>
      </div>
    </section>
  );
}
