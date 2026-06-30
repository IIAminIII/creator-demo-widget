import { useEffect, useMemo, useState } from "react";
import "./App.css";
import InvoiceDetail from "./components/InvoiceDetail";
import InvoiceInbox from "./components/InvoiceInbox";
import LoadingSpinner from "./components/LoadingSpinner";
import { useCreator } from "./contexts/DataContext";
import {
  createInvoiceApprovalService,
  resolveInvoiceApprovalConfig,
} from "./services/invoiceApprovalService";

function getErrorMessage(error, fallbackMessage) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  const candidates = [
    error?.message,
    error?.error,
    error?.details,
    error?.description,
    error?.response?.message,
    error?.response?.error,
    error?.data?.message,
    error?.data?.error,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return fallbackMessage;
}

function StatCard({ label, value, helper }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
      <p className="mt-1 text-sm text-slate-500">{helper}</p>
    </div>
  );
}

function toInboxItemFromDetail(detail) {
  if (!detail) {
    return null;
  }

  return {
    approvalRecordId: detail.approvalRecordId || "",
    booksInvoiceId: detail.booksInvoiceId || "",
    invoiceNumber: detail.invoiceNumber || "",
    customerName: detail.customerName || "",
    invoiceTotal: Number(detail.invoiceTotal || 0),
    currencyCode: detail.currencyCode || "USD",
    dueDate: detail.dueDate || "",
    booksStatus: detail.booksStatus || "Unknown",
    paymentStatus: detail.paymentStatus || "Unknown",
    approvalStatus: detail.approvalStatus || "New",
    priority: detail.priority || "Medium",
    crmAccountName: detail.crmAccountName || detail.crmContext?.accountName || "",
  };
}

export default function App() {
  const {
    api,
    creator,
    initData,
    initError,
    initLoading,
    widgetParams,
  } = useCreator();

  const config = useMemo(
    () => resolveInvoiceApprovalConfig(widgetParams, initData),
    [widgetParams, initData],
  );
  const service = useMemo(
    () => createInvoiceApprovalService({ api, config, creator, initData }),
    [api, config, creator, initData],
  );

  const [filters, setFilters] = useState({
    search: "",
    status: config.inboxDefaultStatusFilter || "All",
  });
  const [inboxItems, setInboxItems] = useState([]);
  const [summary, setSummary] = useState({
    total: 0,
    newCount: 0,
    underReviewCount: 0,
    clarificationCount: 0,
    approvedCount: 0,
    rejectedCount: 0,
  });
  const [selectedRecordId, setSelectedRecordId] = useState("");
  const [selectedDetail, setSelectedDetail] = useState(null);
  const [inboxLoading, setInboxLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [guardrailCheck, setGuardrailCheck] = useState(null);

  async function loadInbox(nextFilters = filters, options = {}) {
    const silent = options.silent === true;

    if (!silent) {
      setInboxLoading(true);
      setErrorMessage("");
    }

    try {
      const response = await service.loadInbox(nextFilters);
      setInboxItems(response.items);
      setSummary(response.summary);

      if (!selectedRecordId && response.items[0]) {
        setSelectedRecordId(response.items[0].approvalRecordId);
      } else if (
        selectedRecordId &&
        !response.items.some((item) => item.approvalRecordId === selectedRecordId)
      ) {
        setSelectedRecordId(response.items[0]?.approvalRecordId ?? "");
      }
    } catch (error) {
      if (!silent) {
        setErrorMessage(getErrorMessage(error, "Failed to load the invoice inbox."));
      }
    } finally {
      if (!silent) {
        setInboxLoading(false);
      }
    }
  }

  async function loadDetail(recordId, options = {}) {
    if (!recordId) {
      setSelectedDetail(null);
      setGuardrailCheck(null);
      return;
    }

    const silent = options.silent === true;

    if (!silent) {
      setDetailLoading(true);
      setErrorMessage("");
    }

    try {
      const detail = await service.loadInvoiceDetail(recordId);
      setSelectedDetail(detail);
      setGuardrailCheck(null);
    } catch (error) {
      if (!silent) {
        setErrorMessage(getErrorMessage(error, "Failed to load the invoice detail."));
      }
    } finally {
      if (!silent) {
        setDetailLoading(false);
      }
    }
  }

  useEffect(() => {
    loadInbox({
      search: "",
      status: config.inboxDefaultStatusFilter || "All",
    });
  }, [service, config.inboxDefaultStatusFilter]);

  useEffect(() => {
    if (selectedRecordId) {
      loadDetail(selectedRecordId);
    }
  }, [selectedRecordId]);

  useEffect(() => {
    const intervalMs = Number(config.autoRefreshIntervalMs || 0);

    if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      if (actionLoading || inboxLoading || detailLoading) {
        return;
      }

      void loadInbox(filters, { silent: true }).then(() => {
        if (selectedRecordId) {
          return loadDetail(selectedRecordId, { silent: true });
        }

        return undefined;
      });
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [
    actionLoading,
    config.autoRefreshIntervalMs,
    detailLoading,
    filters,
    inboxLoading,
    selectedRecordId,
  ]);

  async function runAction(action) {
    setActionLoading(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const detail = await action();
      const refreshedInboxItem = toInboxItemFromDetail(detail);
      setSelectedDetail(detail);
      setGuardrailCheck(null);
      if (refreshedInboxItem?.approvalRecordId) {
        setInboxItems((current) =>
          current.map((item) =>
            item.approvalRecordId === refreshedInboxItem.approvalRecordId
              ? { ...item, ...refreshedInboxItem }
              : item,
          ),
        );
      }
      await loadInbox();
      if (refreshedInboxItem?.approvalRecordId) {
        setInboxItems((current) =>
          current.map((item) =>
            item.approvalRecordId === refreshedInboxItem.approvalRecordId
              ? { ...item, ...refreshedInboxItem }
              : item,
          ),
        );
      }
      setSuccessMessage("Workflow action completed successfully.");
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "The workflow action could not be completed."));
    } finally {
      setActionLoading(false);
    }
  }

  function buildApprovalWarningMessage(validation) {
    const lines = [
      validation.message || "Approval has warnings that need confirmation.",
    ];

    if (validation.warningReasons?.length) {
      lines.push("", "Warnings:");
      validation.warningReasons.forEach((reason) => {
        lines.push(`- ${reason}`);
      });
    }

    lines.push("", "Continue with approval?");
    return lines.join("\n");
  }

  async function runApprovalSafetyCheck(options = {}) {
    if (!selectedRecordId) {
      return null;
    }

    const silent = options.silent === true;

    if (!silent) {
      setActionLoading(true);
      setErrorMessage("");
      setSuccessMessage("");
    }

    try {
      const validation = await service.validateInvoiceApproval(selectedRecordId);
      setGuardrailCheck(validation);

      if (!silent) {
        setSuccessMessage(
          validation.canApprove
            ? "Approval safety check completed successfully."
            : "Approval is currently blocked.",
        );
      }

      return validation;
    } catch (error) {
      if (!silent) {
        setErrorMessage(getErrorMessage(error, "Failed to validate invoice approval."));
      }
      throw error;
    } finally {
      if (!silent) {
        setActionLoading(false);
      }
    }
  }

  async function runApproveAction(payload) {
    setActionLoading(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const validation = await service.validateInvoiceApproval(selectedRecordId);
      setGuardrailCheck(validation);

      if (!validation.canApprove) {
        const blockingMessage =
          validation.blockingReasons?.join(" ") ||
          validation.message ||
          "Approval is blocked.";
        setErrorMessage(blockingMessage);
        return;
      }

      if (validation.warningReasons?.length) {
        const confirmed = window.confirm(buildApprovalWarningMessage(validation));

        if (!confirmed) {
          setSuccessMessage("Approval cancelled after warning review.");
          return;
        }
      }

      const detail = await service.approveInvoice(selectedRecordId, payload);
      const refreshedInboxItem = toInboxItemFromDetail(detail);
      setSelectedDetail(detail);
      setGuardrailCheck(null);

      if (refreshedInboxItem?.approvalRecordId) {
        setInboxItems((current) =>
          current.map((item) =>
            item.approvalRecordId === refreshedInboxItem.approvalRecordId
              ? { ...item, ...refreshedInboxItem }
              : item,
          ),
        );
      }

      await loadInbox();

      if (refreshedInboxItem?.approvalRecordId) {
        setInboxItems((current) =>
          current.map((item) =>
            item.approvalRecordId === refreshedInboxItem.approvalRecordId
              ? { ...item, ...refreshedInboxItem }
              : item,
          ),
        );
      }

      setSuccessMessage("Invoice approved successfully.");
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "The approval action could not be completed."));
    } finally {
      setActionLoading(false);
    }
  }

  if (initLoading) {
    return <LoadingSpinner label="Initializing invoice approval widget..." />;
  }

  if (initError) {
    return (
      <main className="app-shell">
        <section className="alert alert-error max-w-3xl shadow-lg">
          <span>{initError}</span>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div className="space-y-4">
          <span className="badge badge-primary badge-outline">Books + CRM + Creator</span>
          <div>
            <h1 className="text-3xl font-black tracking-tight text-slate-900">
              Invoice Approval Gateway
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
              Zoho Books stays canonical for invoice facts, Zoho Creator handles
              internal approval workflow, and Zoho CRM adds customer and deal
              context for review decisions.
            </p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <StatCard
            label="Mode"
            value={service.mode === "mock" ? "Local preview" : "Creator runtime"}
            helper={
              service.mode === "mock"
                ? "Using mock invoices until Creator forms and functions are wired."
                : "Reading approval data from Creator-backed forms."
            }
          />
          <StatCard
            label="Pending queue"
            value={summary.newCount + summary.underReviewCount + summary.clarificationCount}
            helper={`${summary.total} invoice(s) currently in the inbox`}
          />
          <StatCard
            label="Connected app"
            value={config.creatorAppName || "Current app"}
            helper="Configured through widget params or local defaults"
          />
        </div>
      </section>

      <section className="widget-surface p-5">
        <div className="flex flex-wrap items-end gap-3">
          <label className="widget-field">
            <span className="widget-label">Search invoices</span>
            <input
              className="widget-input"
              placeholder="Invoice number, customer, or CRM account"
              value={filters.search}
              onChange={(event) =>
                setFilters((current) => ({ ...current, search: event.target.value }))
              }
            />
          </label>
          <label className="widget-field">
            <span className="widget-label">Approval status</span>
            <select
              className="widget-input"
              value={filters.status}
              onChange={(event) =>
                setFilters((current) => ({ ...current, status: event.target.value }))
              }
            >
              <option value="All">All</option>
              <option value="New">New</option>
              <option value="Under Review">Under Review</option>
              <option value="Needs Clarification">Needs Clarification</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
            </select>
          </label>
          <button
            type="button"
            className="widget-primary-button"
            onClick={() => loadInbox(filters)}
            disabled={inboxLoading}
          >
            {inboxLoading ? "Refreshing..." : "Refresh inbox"}
          </button>
        </div>

        <div className="mt-5 flex flex-wrap gap-3 text-sm">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
            New: {summary.newCount}
          </span>
          <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700">
            Under review: {summary.underReviewCount}
          </span>
          <span className="rounded-full bg-rose-50 px-3 py-1 text-rose-700">
            Clarification: {summary.clarificationCount}
          </span>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">
            Approved: {summary.approvedCount}
          </span>
        </div>

        {errorMessage ? (
          <div className="alert alert-error mt-5">
            <span>{errorMessage}</span>
          </div>
        ) : null}

        {successMessage ? (
          <div className="alert alert-success mt-5">
            <span>{successMessage}</span>
          </div>
        ) : null}
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <InvoiceInbox
          items={inboxItems}
          loading={inboxLoading}
          selectedRecordId={selectedRecordId}
          onSelect={setSelectedRecordId}
        />

        <InvoiceDetail
          detail={selectedDetail}
          loading={detailLoading}
          actionLoading={actionLoading}
          guardrailCheck={guardrailCheck}
          onRefresh={() =>
            runAction(async () => {
              const refreshed = await service.refreshInvoice(selectedDetail.booksInvoiceId);
              if (selectedRecordId) {
                return service.loadInvoiceDetail(selectedRecordId);
              }
              return refreshed;
            })
          }
          onCheckApprovalSafety={() => runApprovalSafetyCheck()}
          onApprove={(payload) => runApproveAction(payload)}
          onReject={(payload) =>
            runAction(() => service.rejectInvoice(selectedRecordId, payload))
          }
          onClarify={(payload) =>
            runAction(() => service.requestClarification(selectedRecordId, payload))
          }
          onAddComment={(payload) =>
            runAction(async () => {
              await service.addComment(selectedRecordId, payload);
              return service.loadInvoiceDetail(selectedRecordId);
            })
          }
        />
      </section>

      <section className="mt-6 widget-surface p-5">
        <h3 className="font-semibold text-slate-900">Integration contract snapshot</h3>
        <p className="widget-muted mt-2 text-sm">
          This is the frontend contract and widget configuration the Creator-side
          integration layer should satisfy.
        </p>
        <pre className="mt-4 max-h-96 overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">
          {JSON.stringify(
            {
              config,
              runtimeMode: service.mode,
              requiredFunctions: [
                "listBooksInvoicesForApproval",
                "getBooksInvoiceDetails",
                "getCrmContextForInvoice",
                "validateInvoiceApproval",
                "approveInvoice",
                "rejectInvoice",
                "requestClarification",
                "addApprovalComment",
              ],
              requiredCreatorEntities: [
                "Invoice_Approval_Requests",
                "Invoice_Approval_Comments",
                "Invoice_Approval_Audit_Log",
              ],
            },
            null,
            2,
          )}
        </pre>
      </section>
    </main>
  );
}
