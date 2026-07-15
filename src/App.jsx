import { useEffect, useMemo, useState } from "react";
import "./App.css";
import InvoiceDetail from "./components/InvoiceDetail";
import InvoiceInbox from "./components/InvoiceInbox";
import LoadingSpinner from "./components/LoadingSpinner";
import OperationsAssistantCard from "./components/OperationsAssistantCard";
import { useCreator } from "./contexts/DataContext";
import {
  executePendingAssistantAction,
  handleAssistantMessage,
} from "./services/approvalAssistantTools";
import { parseAssistantIntent } from "./services/chatbotAssistant";
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

function DashboardCard({ label, value, helper, tone = "neutral", onClick }) {
  const toneStyles = {
    success: "border-emerald-200 bg-emerald-50/70 text-emerald-900",
    warning: "border-amber-200 bg-amber-50/80 text-amber-900",
    danger: "border-rose-200 bg-rose-50/80 text-rose-900",
    info: "border-sky-200 bg-sky-50/80 text-sky-900",
    neutral: "border-slate-200 bg-white text-slate-900",
  };

  return (
    <button
      type="button"
      className={`w-full rounded-3xl border px-4 py-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
        toneStyles[tone] ?? toneStyles.neutral
      }`}
      onClick={onClick}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-sm text-slate-500">{helper}</p>
    </button>
  );
}

const DEFAULT_FILTERS = {
  statusFilter: "All",
  syncFilter: "All",
  paymentFilter: "All",
  priorityFilter: "All",
  reviewerFilter: "All Reviewers",
  searchText: "",
  sortBy: "dueDate",
  sortDirection: "asc",
  page: 1,
  pageSize: 25,
};

const STATUS_TABS = [
  "Pending",
  "Review Needed",
  "Manual Review",
  "Failed",
  "Approved",
  "Rejected",
  "All",
];

const SORT_OPTIONS = [
  { value: "dueDate:asc", label: "Due date: soonest" },
  { value: "dueDate:desc", label: "Due date: latest" },
  { value: "invoiceTotal:desc", label: "Invoice total: high to low" },
  { value: "invoiceTotal:asc", label: "Invoice total: low to high" },
  { value: "invoiceNumber:asc", label: "Invoice number: A to Z" },
  { value: "customerName:asc", label: "Customer: A to Z" },
];

function createDefaultFilters(defaultStatus = "All") {
  return {
    ...DEFAULT_FILTERS,
    statusFilter: defaultStatus || "All",
  };
}

function createEmptyDashboardSummary() {
  return {
    approvalSummary: {
      totalInvoices: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
      needsClarification: 0,
    },
    syncSummary: {
      synced: 0,
      notSynced: 0,
      reviewNeeded: 0,
      manualReview: 0,
      failed: 0,
    },
    paymentSummary: {
      paid: 0,
      unpaid: 0,
      partiallyPaid: 0,
      overdue: 0,
      unknown: 0,
    },
    agingSummary: {
      dueSoon: 0,
      overdueDueDate: 0,
    },
    amountSummary: {
      pendingAmount: 0,
      approvedAmount: 0,
      reviewAmount: 0,
    },
    prioritySummary: {
      urgent: 0,
      high: 0,
    },
    generatedAt: "",
  };
}

function formatSummaryAmount(value, currencyCode = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
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
    assignedReviewer: detail.assignedReviewer || "Unassigned",
    reviewerEmail: detail.reviewerEmail || "",
    crmAccountName: detail.crmAccountName || detail.crmContext?.accountName || "",
    crmDealName: detail.crmDealName || detail.crmContext?.dealName || "",
    syncStatus: detail.syncStatus || "Unknown",
    differenceFound: detail.differenceFound === true,
  };
}

function createAssistantIntroMessage() {
  return {
    id: "assistant-intro-empty",
    role: "assistant",
    content:
      "This assistant is rule-based and can safely stage approve, reject, and clarification actions with validation plus confirmation. Try prompts like can approve INV-2026-0018 or approve INV-2026-0018.",
  };
}

function createAssistantQuickActions(detail = null) {
  const selectedInvoiceNumber =
    detail?.invoiceNumber || detail?.invoice?.invoiceNumber || "";
  const hasSelectedInvoice = Boolean(selectedInvoiceNumber);

  return [
    { label: "Daily Briefing", prompt: "Daily Briefing", disabled: false },
    { label: "Failed Refreshes", prompt: "Failed Refreshes", disabled: false },
    { label: "Review Needed", prompt: "Review Needed", disabled: false },
    { label: "Reviewer Workload", prompt: "Reviewer Workload", disabled: false },
    { label: "Unassigned", prompt: "Unassigned", disabled: false },
    { label: "Escalations", prompt: "Escalations", disabled: false },
    {
      label: "Run Escalation Check",
      prompt: "run escalation check",
      disabled: false,
    },
    {
      label: "Refresh Selected From Books",
      prompt: hasSelectedInvoice
        ? `refresh ${selectedInvoiceNumber} from Books`
        : "refresh selected from books",
      disabled: !hasSelectedInvoice,
    },
    {
      label: "Approve Selected",
      prompt: hasSelectedInvoice
        ? `approve ${selectedInvoiceNumber}`
        : "approve selected",
      disabled: !hasSelectedInvoice,
    },
    {
      label: "Reject Selected",
      prompt: hasSelectedInvoice
        ? `reject ${selectedInvoiceNumber} because `
        : "reject selected because ",
      disabled: !hasSelectedInvoice,
      prefillOnly: true,
    },
    {
      label: "Request Clarification",
      prompt: hasSelectedInvoice
        ? `request clarification ${selectedInvoiceNumber} `
        : "request clarification selected ",
      disabled: !hasSelectedInvoice,
      prefillOnly: true,
    },
    {
      label: "Explain Selected Blockers",
      prompt: hasSelectedInvoice
        ? `why blocked ${selectedInvoiceNumber}`
        : "explain selected blockers",
      disabled: !hasSelectedInvoice,
    },
    {
      label: "Can Selected Be Approved?",
      prompt: hasSelectedInvoice
        ? `can approve ${selectedInvoiceNumber}`
        : "can selected be approved",
      disabled: !hasSelectedInvoice,
    },
  ];
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

  const [filters, setFilters] = useState(() =>
    createDefaultFilters(config.inboxDefaultStatusFilter),
  );
  const [inboxItems, setInboxItems] = useState([]);
  const [summary, setSummary] = useState({
    total: 0,
    newCount: 0,
    underReviewCount: 0,
    clarificationCount: 0,
    approvedCount: 0,
    rejectedCount: 0,
  });
  const [dashboardSummary, setDashboardSummary] = useState(createEmptyDashboardSummary);
  const [reviewerWorkload, setReviewerWorkload] = useState([]);
  const [selectedRecordId, setSelectedRecordId] = useState("");
  const [selectedDetail, setSelectedDetail] = useState(null);
  const [inboxLoading, setInboxLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [guardrailCheck, setGuardrailCheck] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [assistantMessages, setAssistantMessages] = useState(() => [
    createAssistantIntroMessage(),
  ]);
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [pendingAssistantAction, setPendingAssistantAction] = useState(null);

  function dismissToast(toastId) {
    setToasts((current) => current.filter((toast) => toast.id !== toastId));
  }

  function pushToast({
    type = "success",
    title = "",
    message,
    details = [],
    autoCloseMs = 3200,
    actions = [],
  }) {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const toast = { id, type, title, message, details, actions };

    setToasts((current) => [...current, toast]);

    if (actions.length || autoCloseMs <= 0) {
      return id;
    }

    window.setTimeout(() => {
      dismissToast(id);
    }, autoCloseMs);

    return id;
  }

  function showConfirmationToast(validation) {
    return new Promise((resolve) => {
      const id = pushToast({
        type: "warning",
        title: "Approval Warning",
        message:
          validation.message ||
          "Approval can continue, but reviewer confirmation is recommended.",
        details: [...(validation.warningReasons || []), "Continue with approval?"],
        autoCloseMs: 0,
        actions: [
          {
            label: "Continue",
            variant: "primary",
            onClick: () => {
              dismissToast(id);
              resolve(true);
            },
          },
          {
            label: "Cancel",
            variant: "secondary",
            onClick: () => {
              dismissToast(id);
              resolve(false);
            },
          },
        ],
      });
    });
  }

  function updateFilters(updater) {
    setFilters((current) => {
      const next =
        typeof updater === "function" ? updater(current) : { ...current, ...updater };
      return {
        ...current,
        ...next,
        page: 1,
      };
    });
  }

  function resetFilters() {
    setFilters(createDefaultFilters(config.inboxDefaultStatusFilter));
  }

  function applyDashboardFilters(nextFilterValues) {
    setFilters((current) => ({
      ...current,
      statusFilter: "All",
      syncFilter: "All",
      paymentFilter: "All",
      priorityFilter: "All",
      reviewerFilter: "All Reviewers",
      ...nextFilterValues,
      page: 1,
    }));
  }

  async function loadDashboardSummary(options = {}) {
    const silent = options.silent === true;

    try {
      const response = await service.loadDashboardSummary();
      setDashboardSummary(response);
    } catch (error) {
      if (!silent) {
        pushToast({
          type: "error",
          title: "Dashboard Refresh Failed",
          message: getErrorMessage(error, "Failed to load the approval dashboard."),
        });
      }
    }
  }

  async function loadReviewerWorkload(options = {}) {
    const silent = options.silent === true;

    try {
      const response = await service.loadReviewerWorkload();
      setReviewerWorkload(Array.isArray(response) ? response : []);
    } catch (error) {
      if (!silent) {
        pushToast({
          type: "error",
          title: "Reviewer Workload Failed",
          message: getErrorMessage(error, "Failed to load reviewer workload."),
        });
      }
    }
  }

  async function loadInbox(nextFilters = filters, options = {}) {
    const silent = options.silent === true;
    const preserveSelectedRecordId = options.preserveSelectedRecordId ?? selectedRecordId;

    if (!silent) {
      setInboxLoading(true);
    }

    try {
      const response = await service.loadInbox(nextFilters);
      setInboxItems(response.items);
      setSummary(response.summary);

      if (
        preserveSelectedRecordId &&
        response.items.some((item) => item.approvalRecordId === preserveSelectedRecordId)
      ) {
        setSelectedRecordId(preserveSelectedRecordId);
      } else if (!preserveSelectedRecordId && response.items[0]) {
        setSelectedRecordId(response.items[0].approvalRecordId);
      } else if (preserveSelectedRecordId) {
        setSelectedRecordId(response.items[0]?.approvalRecordId ?? "");
      }
    } catch (error) {
      if (!silent) {
        pushToast({
          type: "error",
          title: "Inbox Refresh Failed",
          message: getErrorMessage(error, "Failed to load the invoice inbox."),
        });
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
    }

    try {
      const detail = await service.loadInvoiceDetail(recordId);
      setSelectedDetail(detail);
      setGuardrailCheck(null);
    } catch (error) {
      if (!silent) {
        pushToast({
          type: "error",
          title: "Detail Refresh Failed",
          message: getErrorMessage(error, "Failed to load the invoice detail."),
        });
      }
    } finally {
      if (!silent) {
        setDetailLoading(false);
      }
    }
  }

  useEffect(() => {
    const nextFilters = createDefaultFilters(config.inboxDefaultStatusFilter);
    setFilters(nextFilters);
  }, [service, config.inboxDefaultStatusFilter]);

  useEffect(() => {
    loadDashboardSummary({ silent: true });
    loadReviewerWorkload({ silent: true });
  }, [service]);

  useEffect(() => {
    loadInbox(filters, { preserveSelectedRecordId: selectedRecordId });
  }, [filters, service]);

  useEffect(() => {
    if (selectedRecordId) {
      loadDetail(selectedRecordId);
    } else {
      setSelectedDetail(null);
      setGuardrailCheck(null);
    }
  }, [selectedRecordId]);

  useEffect(() => {
    setAssistantMessages([createAssistantIntroMessage()]);
    setPendingAssistantAction(null);
  }, [service.mode]);

  useEffect(() => {
    const intervalMs = Number(config.autoRefreshIntervalMs || 0);

    if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      if (actionLoading || inboxLoading || detailLoading) {
        return;
      }

      void loadInbox(filters, {
        silent: true,
        preserveSelectedRecordId: selectedRecordId,
      }).then(() => {
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
    const activeRecordId = selectedRecordId;

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
      await loadInbox(filters, { preserveSelectedRecordId: activeRecordId });
      await loadDashboardSummary({ silent: true });
      await loadReviewerWorkload({ silent: true });
      if (refreshedInboxItem?.approvalRecordId) {
        setInboxItems((current) =>
          current.map((item) =>
            item.approvalRecordId === refreshedInboxItem.approvalRecordId
              ? { ...item, ...refreshedInboxItem }
              : item,
          ),
        );
      }
      pushToast({
        type: "success",
        title: "Success",
        message: "Workflow action completed successfully.",
      });
    } catch (error) {
      pushToast({
        type: "error",
        title: "Action Failed",
        message: getErrorMessage(error, "The workflow action could not be completed."),
      });
    } finally {
      setActionLoading(false);
    }
  }

  async function runApprovalSafetyCheck(options = {}) {
    if (!selectedRecordId) {
      return null;
    }

    const silent = options.silent === true;

    if (!silent) {
      setActionLoading(true);
    }

    try {
      const validation = await service.validateInvoiceApproval(selectedRecordId);
      setGuardrailCheck(validation);

      if (!silent) {
        pushToast({
          type: validation.canApprove ? "success" : "error",
          title: validation.canApprove ? "Approval Safety" : "Approval Blocked",
          message: validation.canApprove
            ? "Approval safety check completed successfully."
            : validation.message || "Approval is currently blocked.",
          details: validation.canApprove
            ? []
            : validation.blockingReasons || [],
        });
      }

      return validation;
    } catch (error) {
      if (!silent) {
        pushToast({
          type: "error",
          title: "Guardrail Check Failed",
          message: getErrorMessage(error, "Failed to validate invoice approval."),
        });
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
    const activeRecordId = selectedRecordId;

    try {
      const validation = await service.validateInvoiceApproval(selectedRecordId);
      setGuardrailCheck(validation);

      if (!validation.canApprove) {
        pushToast({
          type: "error",
          title: "Approval Blocked",
          message: validation.message || "Approval is blocked.",
          details: validation.blockingReasons || [],
          autoCloseMs: 4800,
        });
        return;
      }

      if (validation.warningReasons?.length) {
        const confirmed = await showConfirmationToast(validation);

        if (!confirmed) {
          pushToast({
            type: "warning",
            title: "Approval Cancelled",
            message: "Approval cancelled after warning review.",
          });
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

      await loadInbox(filters, { preserveSelectedRecordId: activeRecordId });
      await loadDashboardSummary({ silent: true });
      await loadReviewerWorkload({ silent: true });

      if (refreshedInboxItem?.approvalRecordId) {
        setInboxItems((current) =>
          current.map((item) =>
            item.approvalRecordId === refreshedInboxItem.approvalRecordId
              ? { ...item, ...refreshedInboxItem }
              : item,
          ),
        );
      }

      pushToast({
        type: "success",
        title: "Invoice Approved",
        message: "Invoice approved successfully.",
      });
    } catch (error) {
      pushToast({
        type: "error",
        title: "Approval Failed",
        message: getErrorMessage(error, "The approval action could not be completed."),
      });
    } finally {
      setActionLoading(false);
    }
  }

  async function refreshAfterAssistantAction(response, fallbackApprovalRecordId = "") {
    const refreshScope = response?.data?.refreshScope || {};
    const nextApprovalRecordId =
      response?.data?.approvalRecordId || fallbackApprovalRecordId || selectedRecordId;

    if (nextApprovalRecordId) {
      setSelectedRecordId(nextApprovalRecordId);
    }

    if (refreshScope.inbox) {
      await loadInbox(filters, {
        silent: true,
        preserveSelectedRecordId: nextApprovalRecordId,
      });
    }

    if (refreshScope.dashboardSummary) {
      await loadDashboardSummary({ silent: true });
    }

    if (refreshScope.reviewerWorkload) {
      await loadReviewerWorkload({ silent: true });
    }

    if (refreshScope.detail && nextApprovalRecordId) {
      await loadDetail(nextApprovalRecordId, { silent: true });
    }
  }

  async function handleAssistantPrompt(prompt) {
    const trimmedPrompt = String(prompt || "").trim();

    if (!trimmedPrompt) {
      return;
    }

    setAssistantMessages((current) => [
      ...current,
      {
        id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        role: "user",
        content: trimmedPrompt,
      },
    ]);
    setAssistantLoading(true);

    try {
      const parsedIntent = parseAssistantIntent(trimmedPrompt);

      if (pendingAssistantAction) {
        if (parsedIntent.intent === "confirm pending action") {
          const activePendingAction = pendingAssistantAction;
          const response = await executePendingAssistantAction(service, activePendingAction);
          setPendingAssistantAction(null);
          await refreshAfterAssistantAction(
            response,
            activePendingAction.payload?.approvalRecordId,
          );

          setAssistantMessages((current) => [
            ...current,
            {
              id: `assistant-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              ...response,
            },
          ]);
          return;
        }

        if (parsedIntent.intent === "cancel pending action") {
          setPendingAssistantAction(null);
          setAssistantMessages((current) => [
            ...current,
            {
              id: `assistant-cancel-${Date.now()}`,
              role: "assistant",
              content: "Pending action cancelled.",
              data: {
                type: "help",
              },
            },
          ]);
          return;
        }

        setAssistantMessages((current) => [
          ...current,
          {
            id: `assistant-pending-${Date.now()}`,
            role: "assistant",
            content: "Reply yes to continue or no to cancel the pending action.",
            data: {
              type: "warning",
              tone: "warning",
            },
          },
        ]);
        return;
      }

      const response = await handleAssistantMessage(service, trimmedPrompt);
      const approvalRecordId = response?.data?.approvalRecordId;
      const nextGuardrailCheck = response?.data?.guardrailCheck;
      const nextPendingAction = response?.data?.pendingAction || null;
      const pendingApprovalRecordId = nextPendingAction?.payload?.approvalRecordId || "";

      if (approvalRecordId) {
        setSelectedRecordId(approvalRecordId);
      }

      if (!approvalRecordId && pendingApprovalRecordId) {
        setSelectedRecordId(pendingApprovalRecordId);
      }

      if (nextGuardrailCheck) {
        setGuardrailCheck(nextGuardrailCheck);
      }

      setPendingAssistantAction(nextPendingAction);

      setAssistantMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          ...response,
        },
      ]);
    } catch (error) {
      setAssistantMessages((current) => [
        ...current,
        {
          id: `assistant-error-${Date.now()}`,
          role: "assistant",
          content: getErrorMessage(error, "I couldn't generate that answer right now."),
          data: {
            type: "warning",
            tone: "warning",
          },
        },
      ]);
    } finally {
      setAssistantLoading(false);
    }
  }

  const selectedSortValue = `${filters.sortBy}:${filters.sortDirection}`;
  const reviewerOptions = useMemo(() => {
    const unique = new Map();
    reviewerWorkload.forEach((entry) => {
      if (entry?.reviewerEmail && !unique.has(entry.reviewerEmail)) {
        unique.set(entry.reviewerEmail, entry.reviewerName || entry.reviewerEmail);
      }
    });

    return [
      { value: "All Reviewers", label: "All Reviewers" },
      { value: "Unassigned", label: "Unassigned" },
      ...Array.from(unique.entries()).map(([value, label]) => ({
        value,
        label: `${label} (${value})`,
      })),
    ];
  }, [reviewerWorkload]);
  const summaryCurrencyCode =
    inboxItems[0]?.currencyCode ||
    selectedDetail?.currencyCode ||
    selectedDetail?.invoice?.currencyCode ||
    "USD";
  const assistantQuickActions = useMemo(
    () => createAssistantQuickActions(selectedDetail),
    [selectedDetail],
  );
  const dashboardCards = [
    {
      label: "Pending Approvals",
      value: dashboardSummary.approvalSummary.pending,
      helper: "Invoices waiting for reviewer pickup.",
      tone: "info",
      onClick: () => applyDashboardFilters({ statusFilter: "Pending" }),
    },
    {
      label: "Review Needed",
      value: dashboardSummary.syncSummary.reviewNeeded,
      helper: "Records still needing active reviewer attention.",
      tone: "warning",
      onClick: () => applyDashboardFilters({ syncFilter: "Review Needed" }),
    },
    {
      label: "Manual Review",
      value: dashboardSummary.syncSummary.manualReview,
      helper: "Books sync or difference checks need manual confirmation.",
      tone: "warning",
      onClick: () => applyDashboardFilters({ syncFilter: "Manual Review" }),
    },
    {
      label: "Failed Refresh",
      value: dashboardSummary.syncSummary.failed,
      helper: "Books refresh attempts that need another pass.",
      tone: "danger",
      onClick: () => applyDashboardFilters({ syncFilter: "Failed" }),
    },
    {
      label: "Due Soon",
      value: dashboardSummary.agingSummary.dueSoon,
      helper: "Open invoices due within the next 3 days.",
      tone: "info",
      onClick: () =>
        applyDashboardFilters({
          statusFilter: "Pending",
          sortBy: "dueDate",
          sortDirection: "asc",
        }),
    },
    {
      label: "Overdue",
      value: dashboardSummary.agingSummary.overdueDueDate,
      helper: "Invoices with due dates already past.",
      tone: "danger",
      onClick: () => applyDashboardFilters({ paymentFilter: "Overdue" }),
    },
    {
      label: "Pending Amount",
      value: formatSummaryAmount(
        dashboardSummary.amountSummary.pendingAmount,
        summaryCurrencyCode,
      ),
      helper: "Current amount still blocked in the approval queue.",
      tone: "neutral",
      onClick: () => applyDashboardFilters({ statusFilter: "Pending" }),
    },
    {
      label: "High Priority",
      value: dashboardSummary.prioritySummary.high,
      helper: "Urgent and high-priority invoices needing attention.",
      tone: "warning",
      onClick: () => applyDashboardFilters({ priorityFilter: "High" }),
    },
  ];

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
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Approval Dashboard</h2>
            <p className="mt-1 text-sm text-slate-500">
              Live overview of invoice approval workload, Books refresh health, and
              payment status.
            </p>
          </div>
          <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
            {dashboardSummary.generatedAt
              ? `Generated ${new Date(dashboardSummary.generatedAt).toLocaleString()}`
              : "Loading summary"}
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {dashboardCards.map((card) => (
            <DashboardCard key={card.label} {...card} />
          ))}
        </div>
      </section>

      <section className="widget-surface p-5">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Reviewer Workload</h2>
          <p className="mt-1 text-sm text-slate-500">
            Track active invoice approval workload by assigned reviewer.
          </p>
        </div>

        <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200">
          <table className="min-w-[920px] w-full text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Reviewer</th>
                <th className="px-4 py-3 text-left font-medium">Email</th>
                <th className="px-4 py-3 text-left font-medium">Assigned</th>
                <th className="px-4 py-3 text-left font-medium">Pending</th>
                <th className="px-4 py-3 text-left font-medium">Needs Clarification</th>
                <th className="px-4 py-3 text-left font-medium">Review Amount</th>
                <th className="px-4 py-3 text-left font-medium">Unassigned</th>
              </tr>
            </thead>
            <tbody>
              {reviewerWorkload.length ? (
                reviewerWorkload.map((entry) => (
                  <tr
                    key={`${entry.reviewerEmail || entry.reviewerName}`}
                    className="border-t border-slate-200 text-slate-700"
                  >
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {entry.reviewerName || "Unassigned"}
                    </td>
                    <td className="px-4 py-3">
                      {entry.reviewerEmail || "Not available"}
                    </td>
                    <td className="px-4 py-3">{entry.assignedCount}</td>
                    <td className="px-4 py-3">{entry.pendingCount}</td>
                    <td className="px-4 py-3">{entry.needsClarificationCount}</td>
                    <td className="px-4 py-3">
                      {formatSummaryAmount(entry.reviewAmount, summaryCurrencyCode)}
                    </td>
                    <td className="px-4 py-3">{entry.unassignedCount}</td>
                  </tr>
                ))
              ) : (
                <tr className="border-t border-slate-200">
                  <td colSpan="7" className="px-4 py-4 text-slate-500">
                    No reviewer workload data is available yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="widget-surface p-5">
        <div className="flex flex-wrap gap-2">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
                filters.statusFilter === tab
                  ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                  : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
              }`}
              onClick={() => updateFilters({ statusFilter: tab })}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="widget-field">
            <span className="widget-label">Search invoices</span>
            <input
              className="widget-input"
              placeholder="Search invoice, customer, deal..."
              value={filters.searchText}
              onChange={(event) =>
                updateFilters({ searchText: event.target.value })
              }
            />
          </label>
          <label className="widget-field">
            <span className="widget-label">Sync</span>
            <select
              className="widget-input"
              value={filters.syncFilter}
              onChange={(event) =>
                updateFilters({ syncFilter: event.target.value })
              }
            >
              <option value="All">All</option>
              <option value="Synced">Synced</option>
              <option value="Review Needed">Review Needed</option>
              <option value="Manual Review">Manual Review</option>
              <option value="Failed">Failed</option>
              <option value="Difference Found">Difference Found</option>
            </select>
          </label>
          <label className="widget-field">
            <span className="widget-label">Payment</span>
            <select
              className="widget-input"
              value={filters.paymentFilter}
              onChange={(event) =>
                updateFilters({ paymentFilter: event.target.value })
              }
            >
              <option value="All">All</option>
              <option value="Paid">Paid</option>
              <option value="Unpaid">Unpaid</option>
              <option value="Partially Paid">Partially Paid</option>
              <option value="Overdue">Overdue</option>
            </select>
          </label>
          <label className="widget-field">
            <span className="widget-label">Priority</span>
            <select
              className="widget-input"
              value={filters.priorityFilter}
              onChange={(event) =>
                updateFilters({ priorityFilter: event.target.value })
              }
            >
              <option value="All">All</option>
              <option value="Urgent">Urgent</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
          </label>
          <label className="widget-field">
            <span className="widget-label">Reviewer</span>
            <select
              className="widget-input"
              value={filters.reviewerFilter}
              onChange={(event) =>
                updateFilters({ reviewerFilter: event.target.value })
              }
            >
              {reviewerOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="widget-field">
            <span className="widget-label">Sort</span>
            <select
              className="widget-input"
              value={selectedSortValue}
              onChange={(event) => {
                const [sortBy, sortDirection] = event.target.value.split(":");
                updateFilters({ sortBy, sortDirection });
              }}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="widget-secondary-button"
            onClick={resetFilters}
          >
            Reset filters
          </button>
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
            Pending: {summary.newCount}
          </span>
          <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700">
            Review needed: {summary.underReviewCount}
          </span>
          <span className="rounded-full bg-rose-50 px-3 py-1 text-rose-700">
            Manual review: {summary.clarificationCount}
          </span>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">
            Approved: {summary.approvedCount}
          </span>
          <span className="rounded-full bg-red-50 px-3 py-1 text-red-700">
            Rejected: {summary.rejectedCount}
          </span>
        </div>
      </section>

      <OperationsAssistantCard
        messages={assistantMessages}
        loading={assistantLoading}
        quickActions={assistantQuickActions}
        pendingAction={pendingAssistantAction}
        onSend={handleAssistantPrompt}
      />

      <section className="mt-6 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <InvoiceInbox
          items={inboxItems}
          loading={inboxLoading}
          selectedRecordId={selectedRecordId}
          onSelect={setSelectedRecordId}
          filters={filters}
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
          onAssignReviewer={async (payload) => {
            setActionLoading(true);
            const activeRecordId = selectedRecordId;

            try {
              const detail = await service.assignInvoiceReviewer(selectedRecordId, payload);
              setSelectedDetail(detail);
              setGuardrailCheck(null);
              await loadInbox(filters, { preserveSelectedRecordId: activeRecordId });
              await loadDashboardSummary({ silent: true });
              await loadReviewerWorkload({ silent: true });
              pushToast({
                type: "success",
                title: "Reviewer Assigned",
                message: "Reviewer assignment updated successfully.",
              });
            } catch (error) {
              pushToast({
                type: "error",
                title: "Assignment Failed",
                message: getErrorMessage(error, "Failed to assign reviewer."),
              });
            } finally {
              setActionLoading(false);
            }
          }}
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
                "getUnifiedApprovalInbox",
                "getUnifiedApprovalDetail",
                "refreshUnifiedInvoiceSnapshot",
                "getUnifiedApprovalDashboardSummary",
                "getUnifiedReviewerWorkloadSummary",
                "listBooksInvoicesForApproval",
                "getBooksInvoiceDetails",
                "getCrmContextForInvoice",
                "getApprovalDashboardSummary",
                "getReviewerWorkloadSummary",
                "validateInvoiceApproval",
                "assignInvoiceReviewer",
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

      <div className="widget-toast-region">
        {toasts.map((toast) => (
          <div key={toast.id} className={`widget-toast widget-toast-${toast.type}`}>
            {toast.title ? <div className="widget-toast-title">{toast.title}</div> : null}
            <div className="widget-toast-message">{toast.message}</div>
            {toast.details?.length ? (
              <div className="widget-toast-list">
                {toast.details.map((detail) => (
                  <div key={`${toast.id}-${detail}`} className="widget-toast-list-item">
                    {detail}
                  </div>
                ))}
              </div>
            ) : null}
            {toast.actions?.length ? (
              <div className="widget-toast-actions">
                {toast.actions.map((action) => (
                  <button
                    key={`${toast.id}-${action.label}`}
                    type="button"
                    className={`widget-toast-action widget-toast-action-${action.variant || "secondary"}`}
                    onClick={action.onClick}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </main>
  );
}
