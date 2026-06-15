import { useEffect, useState } from "react";
import "./App.css";
import LoadingSpinner from "./components/LoadingSpinner";
import RecordForm from "./components/RecordForm";
import RecordsList from "./components/RecordsList";
import { useCreator } from "./contexts/DataContext";

function normalizeFieldsResponse(response) {
  if (Array.isArray(response)) {
    return response;
  }

  if (Array.isArray(response?.fields)) {
    return response.fields;
  }

  if (Array.isArray(response?.data)) {
    return response.data;
  }

  return [];
}

function getRecordId(record) {
  return record?.ID ?? record?.id ?? record?.recordId ?? null;
}

export default function App() {
  const {
    api,
    initData,
    initError,
    initLoading,
    initParams,
    isReady,
    widgetParams,
  } = useCreator();
  const [appName, setAppName] = useState("");
  const [formName, setFormName] = useState("");
  const [reportName, setReportName] = useState("");
  const [recordsData, setRecordsData] = useState(null);
  const [fields, setFields] = useState([]);
  const [metadata, setMetadata] = useState(null);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [listLoading, setListLoading] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    if (!initData && !initParams && !widgetParams) {
      return;
    }

    if (!appName) {
      const detectedAppName =
        widgetParams?.appName ??
        widgetParams?.app_name ??
        initParams?.appLinkName ??
        initData?.app_name ??
        initData?.appName ??
        initData?.context?.app_name;

      if (detectedAppName) {
        setAppName(detectedAppName);
      }
    }

    if (!formName) {
      const detectedFormName =
        widgetParams?.formName ??
        widgetParams?.form_name ??
        widgetParams?.form ??
        initData?.form_name ??
        initData?.formName ??
        initData?.context?.form_name;

      if (detectedFormName) {
        setFormName(detectedFormName);
      }
    }

    if (!reportName) {
      const detectedReportName =
        widgetParams?.reportName ??
        widgetParams?.report_name ??
        widgetParams?.report ??
        initData?.report_name ??
        initData?.reportName ??
        initData?.context?.report_name;

      if (detectedReportName) {
        setReportName(detectedReportName);
      }
    }
  }, [appName, formName, reportName, initData, initParams, widgetParams]);

  function getApiOptions() {
    return appName ? { appName } : undefined;
  }

  async function loadFormData() {
    if (!formName) {
      setErrorMessage("Enter a Creator form name before loading metadata.");
      return;
    }

    if (!reportName) {
      setErrorMessage("Enter a Creator report name before loading records.");
      return;
    }

    setErrorMessage("");
    setSuccessMessage("");
    setListLoading(true);

    try {
      const [recordsResponse, fieldsResponse, metadataResponse] =
        await Promise.all([
          api.getRecords(reportName, getApiOptions()),
          api.getFormFields(formName, getApiOptions()),
          api.getFormMetadata(formName, getApiOptions()),
        ]);

      setRecordsData(recordsResponse);
      setFields(normalizeFieldsResponse(fieldsResponse));
      setMetadata(metadataResponse);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to load Creator data.",
      );
    } finally {
      setListLoading(false);
    }
  }

  async function handleSave(values) {
    if (!formName) {
      setErrorMessage("Enter a Creator form name before submitting data.");
      return;
    }

    if (selectedRecord && !reportName) {
      setErrorMessage("Enter a Creator report name before updating records.");
      return;
    }

    setFormLoading(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      if (selectedRecord) {
        await api.updateRecord(
          reportName,
          getRecordId(selectedRecord),
          values,
          getApiOptions(),
        );
        setSuccessMessage("Record updated successfully.");
      } else {
        await api.addRecord(formName, values, getApiOptions());
        setSuccessMessage("Record created successfully.");
      }

      setSelectedRecord(null);
      await loadFormData();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to save record.",
      );
    } finally {
      setFormLoading(false);
    }
  }

  async function handleDelete(record) {
    const recordId = getRecordId(record);

    if (!reportName) {
      setErrorMessage("Enter a Creator report name before deleting records.");
      return;
    }

    if (!recordId) {
      setErrorMessage("This record does not have a detectable ID to delete.");
      return;
    }

    setErrorMessage("");
    setSuccessMessage("");
    setListLoading(true);

    try {
      await api.deleteRecord(reportName, recordId, getApiOptions());
      setSuccessMessage("Record deleted successfully.");
      await loadFormData();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to delete record.",
      );
    } finally {
      setListLoading(false);
    }
  }

  if (initLoading) {
    return <LoadingSpinner label="Initializing Zoho Creator widget..." />;
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
          <span className="badge badge-primary badge-outline">Zoho Creator</span>
          <div>
            <h1 className="text-3xl font-black tracking-tight text-slate-900">
              Creator Demo Widget
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
              This starter widget initializes the Zoho Creator SDK, loads form
              metadata plus report records, and demonstrates a simple CRUD
              workflow you can adapt to your Creator app.
            </p>
          </div>
        </div>

        <div className="stats stats-vertical border border-slate-200 bg-white text-slate-900 shadow-sm md:stats-horizontal">
          <div className="stat">
            <div className="stat-title text-slate-500">SDK status</div>
            <div className="stat-value text-lg text-success">Ready</div>
            <div className="stat-desc text-slate-500">
              {isReady ? "ZOHO.CREATOR detected" : "Waiting"}
            </div>
          </div>
          <div className="stat">
            <div className="stat-title text-slate-500">Detected form / report</div>
            <div className="stat-value truncate text-lg">
              {formName || reportName
                ? `${formName || "?"} / ${reportName || "?"}`
                : "Not set"}
            </div>
            <div className="stat-desc text-slate-500">Override them below if needed</div>
          </div>
          <div className="stat">
            <div className="stat-title text-slate-500">Mapped app</div>
            <div className="stat-value truncate text-lg">
              {appName || "Current app"}
            </div>
            <div className="stat-desc text-slate-500">From widget params or current session</div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <div className="widget-surface p-5">
            <div className="mb-4 flex flex-wrap items-end gap-3">
              <label className="widget-field">
                <span className="widget-label">Application name</span>
                <input
                  className="widget-input"
                  type="text"
                  placeholder="Leave empty for current app"
                  value={appName}
                  onChange={(event) => setAppName(event.target.value)}
                />
              </label>
              <label className="widget-field">
                <span className="widget-label">Form name</span>
                <input
                  className="widget-input"
                  type="text"
                  placeholder="Orders"
                  value={formName}
                  onChange={(event) => setFormName(event.target.value)}
                />
              </label>
              <label className="widget-field">
                <span className="widget-label">Report name</span>
                <input
                  className="widget-input"
                  type="text"
                  placeholder="All_Orders"
                  value={reportName}
                  onChange={(event) => setReportName(event.target.value)}
                />
              </label>
              <button
                type="button"
                className="widget-primary-button"
                onClick={loadFormData}
                disabled={!isReady || listLoading}
              >
                {listLoading ? "Loading..." : "Load Creator data"}
              </button>
            </div>

            {errorMessage ? (
              <div className="alert alert-error mb-3">
                <span>{errorMessage}</span>
              </div>
            ) : null}

            {successMessage ? (
              <div className="alert alert-success">
                <span>{successMessage}</span>
              </div>
            ) : null}
          </div>

          <RecordsList
            loading={listLoading}
            recordsData={recordsData}
            onEdit={setSelectedRecord}
            onDelete={handleDelete}
          />
        </div>

        <div className="space-y-6">
          <RecordForm
            fields={fields}
            initialRecord={selectedRecord}
            loading={formLoading}
            onCancel={() => setSelectedRecord(null)}
            onSubmit={handleSave}
          />

          <div className="widget-surface p-5">
            <h3 className="font-semibold text-slate-900">Context snapshot</h3>
            <p className="widget-muted mt-2 text-sm">
              Useful while wiring this demo to your real Creator application.
            </p>
            <pre className="mt-4 max-h-80 overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">
              {JSON.stringify(
                {
                  initData,
                  initParams,
                  metadata,
                  widgetParams,
                },
                null,
                2,
              )}
            </pre>
          </div>
        </div>
      </section>
    </main>
  );
}
