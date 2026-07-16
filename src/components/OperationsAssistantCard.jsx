import { useCallback, useRef, useState } from "react";

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

function getBadgeClass(value) {
  const normalized = String(value || "").toLowerCase();

  if (
    normalized.includes("approved") ||
    normalized.includes("synced") ||
    normalized.includes("paid") ||
    normalized.includes("success") ||
    normalized.includes("safe")
  ) {
    return "assistant-badge assistant-badge-success";
  }

  if (
    normalized.includes("rejected") ||
    normalized.includes("failed") ||
    normalized.includes("blocked") ||
    normalized.includes("overdue") ||
    normalized.includes("error")
  ) {
    return "assistant-badge assistant-badge-danger";
  }

  if (
    normalized.includes("review") ||
    normalized.includes("manual") ||
    normalized.includes("clarification") ||
    normalized.includes("needs") ||
    normalized.includes("pending") ||
    normalized.includes("warning")
  ) {
    return "assistant-badge assistant-badge-warning";
  }

  if (
    normalized.includes("new") ||
    normalized.includes("unassigned") ||
    normalized.includes("unknown")
  ) {
    return "assistant-badge assistant-badge-neutral";
  }

  return "assistant-badge assistant-badge-info";
}

function Badge({ label }) {
  if (!label) {
    return null;
  }

  return <span className={getBadgeClass(label)}>{label}</span>;
}

function SuggestedActions({ invoiceNumber, onSend }) {
  if (!invoiceNumber || !onSend) {
    return null;
  }

  const actions = [
    { label: "Explain Blockers", command: `why blocked ${invoiceNumber}` },
    { label: "Can Approve?", command: `can approve ${invoiceNumber}` },
    { label: "Refresh", command: `refresh ${invoiceNumber} from Books` },
    { label: "Line Items", command: `show line items ${invoiceNumber}` },
    { label: "Approve", command: `approve ${invoiceNumber}` },
    { label: "Reject", command: `reject ${invoiceNumber} because ` },
  ];

  return (
    <div className="assistant-suggested-actions">
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          className="assistant-suggested-action"
          onClick={() => onSend(action.command)}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
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
                <Badge label={item.approvalStatus} />
                <Badge label={item.syncStatus} />
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
        <div className="assistant-data-title">
          Invoice Summary
          <Badge label={invoice.approvalStatus} />
        </div>
        <div className="assistant-definition-grid">
          <div>
            <span className="assistant-definition-label">Customer</span>
            <span className="assistant-definition-value">{invoice.customerName || "Unknown"}</span>
          </div>
          <div>
            <span className="assistant-definition-label">Approval</span>
            <span className="assistant-definition-value">
              <Badge label={invoice.approvalStatus} />
            </span>
          </div>
          <div>
            <span className="assistant-definition-label">Sync</span>
            <span className="assistant-definition-value">
              <Badge label={invoice.syncStatus} />
            </span>
          </div>
          <div>
            <span className="assistant-definition-label">Payment</span>
            <span className="assistant-definition-value">
              <Badge label={invoice.paymentStatus} />
            </span>
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

function AssistantApprovalValidation({ data }) {
  const invoice = data?.invoice;
  const canApprove = data?.canApprove;
  const blockingReasons = data?.blockingReasons || [];
  const warningReasons = data?.warningReasons || [];

  return (
    <>
      <div className="assistant-data-panel">
        <div className="assistant-data-title">
          Approval Safety
          <Badge label={canApprove ? "Safe to Approve" : "Blocked"} />
        </div>
        <div className="assistant-definition-grid">
          <div>
            <span className="assistant-definition-label">Invoice</span>
            <span className="assistant-definition-value">{invoice?.invoiceNumber}</span>
          </div>
          <div>
            <span className="assistant-definition-label">Can Approve</span>
            <span className="assistant-definition-value">
              <Badge label={canApprove ? "Yes" : "No"} />
            </span>
          </div>
          <div>
            <span className="assistant-definition-label">Sync</span>
            <span className="assistant-definition-value">
              <Badge label={data?.syncStatus} />
            </span>
          </div>
          <div>
            <span className="assistant-definition-label">Payment</span>
            <span className="assistant-definition-value">
              <Badge label={data?.paymentStatus} />
            </span>
          </div>
          <div>
            <span className="assistant-definition-label">Last Sync</span>
            <span className="assistant-definition-value">
              {formatDateTime(data?.lastBooksSyncAt)}
            </span>
          </div>
          <div>
            <span className="assistant-definition-label">Last Compared</span>
            <span className="assistant-definition-value">
              {formatDateTime(data?.lastComparedAt)}
            </span>
          </div>
        </div>
      </div>
      <AssistantReasonList
        title="Blocking Reasons"
        reasons={blockingReasons}
        tone="warning"
      />
      <AssistantReasonList
        title="Warning Reasons"
        reasons={warningReasons}
        tone="warning"
      />
    </>
  );
}

function AssistantActionPreview({ data }) {
  if (!data?.actionLabel || !data?.invoiceNumber) {
    return null;
  }

  return (
    <div className="assistant-data-panel">
      <div className="assistant-data-title">{data.actionLabel}</div>
      <div className="assistant-definition-grid">
        <div>
          <span className="assistant-definition-label">Invoice</span>
          <span className="assistant-definition-value">{data.invoiceNumber}</span>
        </div>
        <div>
          <span className="assistant-definition-label">Reason</span>
          <span className="assistant-definition-value">{data.reason || "Not provided"}</span>
        </div>
      </div>
    </div>
  );
}

function AssistantLineItems({ lineItems = [], invoiceNumber = "" }) {
  if (!lineItems.length) {
    return null;
  }

  return (
    <div className="assistant-data-panel">
      <div className="assistant-data-title">
        Line Items
        <span className="assistant-inline-count">{lineItems.length}</span>
      </div>
      <div className="assistant-line-items-table-wrap">
        <table className="assistant-line-items-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Qty</th>
              <th>Rate</th>
              <th>Amount</th>
              <th>Tax</th>
            </tr>
          </thead>
          <tbody>
            {lineItems.map((line, index) => (
              <tr key={`${invoiceNumber}-line-${index}`}>
                <td>
                  <div className="assistant-line-item-name">{line.name}</div>
                  {line.description ? (
                    <div className="assistant-line-item-desc">{line.description}</div>
                  ) : null}
                </td>
                <td>{line.quantity}</td>
                <td>{formatCurrency(line.rate)}</td>
                <td className="assistant-line-item-amount">{formatCurrency(line.amount)}</td>
                <td>
                  {line.taxName ? `${line.taxName} (${line.taxPercentage}%)` : "N/A"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AssistantActionResult({ data }) {
  const tone = data?.tone === "success" ? "success" : "warning";

  return (
    <div className={`assistant-data-panel assistant-data-panel-${tone}`}>
      <div className="assistant-data-title">
        {tone === "success" ? "Action Completed" : "Action Result"}
      </div>
      <div className="assistant-definition-grid">
        {data?.approvalRecordId ? (
          <div>
            <span className="assistant-definition-label">Record</span>
            <span className="assistant-definition-value">{data.approvalRecordId}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function renderMessageData(data, onSend) {
  if (!data || typeof data !== "object") {
    return null;
  }

  const invoiceNumber = data?.invoice?.invoiceNumber || "";

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
            title="Review Needed"
            items={data.reviewNeeded || []}
            totalCount={data.reviewNeeded?.length || 0}
            emptyMessage="No invoices need review."
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
          <AssistantReviewerWorkload
            items={data.reviewerWorkload || []}
            totalCount={data.reviewerWorkload?.length || 0}
          />
        </>
      );

    case "invoice-list":
      return (
        <>
          <AssistantInvoiceList
            title={data.title}
            items={data.items || []}
            totalCount={data.totalCount || 0}
            emptyMessage={data.emptyMessage}
          />
          {invoiceNumber ? (
            <SuggestedActions invoiceNumber={invoiceNumber} onSend={onSend} />
          ) : null}
        </>
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
          <AssistantApprovalValidation data={data} />
          {invoiceNumber ? (
            <SuggestedActions invoiceNumber={invoiceNumber} onSend={onSend} />
          ) : null}
        </>
      );

    case "invoice-summary":
      return (
        <>
          <AssistantInvoiceSummary data={data} />
          {invoiceNumber ? (
            <SuggestedActions invoiceNumber={invoiceNumber} onSend={onSend} />
          ) : null}
        </>
      );

    case "approval-action-preview":
      return <AssistantActionPreview data={data} />;

    case "invoice-line-items":
      return (
        <>
          <div className="assistant-data-panel">
            <div className="assistant-data-title">Invoice Summary</div>
            <div className="assistant-definition-grid">
              <div>
                <span className="assistant-definition-label">Invoice</span>
                <span className="assistant-definition-value">{data.invoice?.invoiceNumber}</span>
              </div>
              <div>
                <span className="assistant-definition-label">Customer</span>
                <span className="assistant-definition-value">{data.invoice?.customerName || "Unknown"}</span>
              </div>
              <div>
                <span className="assistant-definition-label">Total</span>
                <span className="assistant-definition-value">
                  {formatCurrency(data.invoice?.invoiceTotal, data.invoice?.currencyCode)}
                </span>
              </div>
            </div>
          </div>
          <AssistantLineItems
            lineItems={data.lineItems || []}
            invoiceNumber={data.invoice?.invoiceNumber || ""}
          />
          {invoiceNumber ? (
            <SuggestedActions invoiceNumber={invoiceNumber} onSend={onSend} />
          ) : null}
        </>
      );

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

    case "pending-action":
      return null;

    case "action-result":
      return <AssistantActionResult data={data} />;

    case "warning":
      return null;

    case "help":
      return null;

    case "context-cleared":
      return null;

    default:
      return null;
  }
}

export default function OperationsAssistantCard({
  messages = [],
  loading = false,
  quickActions = [],
  pendingAction = null,
  chatbotContext = null,
  onSend,
}) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef(null);
  const threadRef = useRef(null);

  const handleSubmit = useCallback(
    (message) => {
      const trimmed = String(message || "").trim();
      if (!trimmed) {
        return;
      }
      onSend?.(trimmed);
      setDraft("");
    },
    [onSend],
  );

  return (
    <section className="widget-surface assistant-card">
      <div className="assistant-card-header">
        <div>
          <h2 className="assistant-card-title">AI Operations Assistant</h2>
          <p className="assistant-card-subtitle">
            Ask about approvals and stage guarded approve, reject, or clarification actions with confirmation.
          </p>
        </div>
      </div>

      {pendingAction ? (
        <div className="assistant-pending-banner">
          Pending action: {pendingAction.label}. Reply yes to continue or no to cancel.
        </div>
      ) : null}

      <div className="assistant-context-badge">
        {chatbotContext?.lastInvoiceNumber ? (
          <span className="assistant-context-badge-active">
            Current invoice: {chatbotContext.lastInvoiceNumber}
          </span>
        ) : (
          <span className="assistant-context-badge-empty">No invoice selected</span>
        )}
      </div>

      <div className="assistant-quick-actions">
        {quickActions.map((action) => (
          <button
            key={action.label}
            type="button"
            className="assistant-quick-action"
            onClick={() => {
              if (action.prefillOnly) {
                setDraft(action.prompt);
                window.requestAnimationFrame(() => {
                  inputRef.current?.focus();
                  const length = action.prompt.length;
                  inputRef.current?.setSelectionRange?.(length, length);
                });
                return;
              }

              void handleSubmit(action.prompt);
            }}
            disabled={loading || action.disabled}
          >
            {action.label}
          </button>
        ))}
      </div>

      <div className="assistant-thread" ref={threadRef}>
        {messages.map((message) => (
          <div key={message.id} className={MessageToneClass({
            role: message.role,
            tone: message.data?.tone,
          })}>
            <div className="assistant-message-role">
              {message.role === "user" ? "You" : "Assistant"}
            </div>
            <div className="assistant-message-copy">{message.content}</div>
            {message.role === "assistant" ? renderMessageData(message.data, handleSubmit) : null}
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
          ref={inputRef}
          className="assistant-input"
          placeholder="Try: approve INV-2026-0018 or reject INV-2026-0018 because wrong amount"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void handleSubmit(draft);
            }
          }}
        />
        <button
          type="button"
          className="assistant-send-button"
          disabled={loading || !draft.trim()}
          onClick={() => handleSubmit(draft)}
        >
          Send
        </button>
      </div>
    </section>
  );
}
