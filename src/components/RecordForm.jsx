import { useEffect, useMemo, useState } from "react";

const DESIGN_PREVIEW_FIELDS = [
  {
    display_name: "Full name",
    link_name: "full_name",
    field_type: "text",
    placeholder: "Avery Johnson",
  },
  {
    display_name: "Email",
    link_name: "email",
    field_type: "email",
    placeholder: "avery@example.com",
  },
  {
    display_name: "Priority",
    link_name: "priority",
    field_type: "text",
    placeholder: "High",
  },
  {
    display_name: "Notes",
    link_name: "notes",
    field_type: "textarea",
    placeholder: "Add a short project note...",
  },
];

function inferInitialValues(fields, record) {
  if (record && Object.keys(record).length) {
    return Object.fromEntries(
      Object.entries(record).filter(([key]) => key !== "ID" && key !== "id"),
    );
  }

  if (Array.isArray(fields) && fields.length) {
    return Object.fromEntries(fields.map((field) => [field.link_name, ""]));
  }

  return {};
}

function normalizeFields(fields, values) {
  if (Array.isArray(fields) && fields.length) {
    return fields;
  }

  if (!Object.keys(values).length) {
    return DESIGN_PREVIEW_FIELDS;
  }

  return Object.keys(values).map((key) => ({
    display_name: key,
    link_name: key,
    field_type: "text",
  }));
}

export default function RecordForm({
  fields,
  initialRecord,
  loading,
  onCancel,
  onSubmit,
}) {
  const seedValues = useMemo(
    () => inferInitialValues(fields, initialRecord),
    [fields, initialRecord],
  );
  const [values, setValues] = useState(seedValues);

  useEffect(() => {
    setValues(seedValues);
  }, [seedValues]);

  const normalizedFields = normalizeFields(fields, values);
  const isEditing = Boolean(initialRecord);
  const isDesignPreview =
    !isEditing && (!Array.isArray(fields) || fields.length === 0);
  const completionCount = normalizedFields.filter(
    (field) => String(values[field.link_name] ?? "").trim() !== "",
  ).length;

  function handleChange(name, value) {
    setValues((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function handleSubmit(event) {
    event.preventDefault();

    if (isDesignPreview) {
      return;
    }

    onSubmit(values);
  }

  return (
    <form
      className="overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.08)]"
      onSubmit={handleSubmit}
    >
      <div className="border-b border-slate-200/80 bg-[linear-gradient(135deg,#0f172a_0%,#1e293b_48%,#134e4a_100%)] px-6 py-6 text-white">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-white/12 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-white/80">
                {isEditing ? "Editor" : "Composer"}
              </span>
              {isDesignPreview ? (
                <span className="rounded-full bg-amber-300/20 px-3 py-1 text-xs font-semibold text-amber-100">
                  Design preview
                </span>
              ) : null}
            </div>
            <div>
              <h3 className="text-xl font-semibold tracking-tight">
                {isEditing ? "Refine record details" : "Create a polished record"}
              </h3>
              <p className="mt-1 max-w-xl text-sm text-white/72">
                {isDesignPreview
                  ? "Sample fields are shown until Zoho Creator form metadata loads, so you can preview the visual design immediately."
                  : "Field values are mapped to your Zoho Creator form and ready to submit."}
              </p>
            </div>
          </div>
          <div className="min-w-44 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-white/60">
              Completion
            </p>
            <div className="mt-2 flex items-end gap-2">
              <span className="text-3xl font-semibold">
                {completionCount}
              </span>
              <span className="pb-1 text-sm text-white/65">
                / {normalizedFields.length} fields
              </span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-300 via-cyan-300 to-emerald-300 transition-all duration-300"
                style={{
                  width: `${Math.max(
                    normalizedFields.length
                      ? (completionCount / normalizedFields.length) * 100
                      : 0,
                    8,
                  )}%`,
                }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 p-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              Soft glass UI
            </span>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
              Creator-ready layout
            </span>
            <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
              {isDesignPreview ? "Preview mode" : "Connected mode"}
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {normalizedFields.map((field) => {
              const isTextarea = field.field_type === "textarea";
              const value = values[field.link_name] ?? "";

              return (
                <label
                  key={field.link_name}
                  className={`group rounded-[1.5rem] border border-slate-200 bg-slate-50/70 p-4 transition hover:border-slate-300 hover:bg-white ${
                    isTextarea ? "md:col-span-2" : ""
                  }`}
                >
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                    {field.display_name ?? field.link_name}
                  </span>
                  {isTextarea ? (
                    <textarea
                      className="min-h-28 w-full resize-y border-0 bg-transparent p-0 text-sm text-slate-800 outline-none placeholder:text-slate-400"
                      placeholder={field.placeholder ?? "Type here..."}
                      value={value}
                      onChange={(event) =>
                        handleChange(field.link_name, event.target.value)
                      }
                    />
                  ) : (
                    <input
                      className="w-full border-0 bg-transparent p-0 text-sm text-slate-800 outline-none placeholder:text-slate-400"
                      type={field.field_type === "email" ? "email" : "text"}
                      placeholder={field.placeholder ?? "Enter a value..."}
                      value={value}
                      onChange={(event) =>
                        handleChange(field.link_name, event.target.value)
                      }
                    />
                  )}
                </label>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              className="btn border-0 bg-slate-950 text-white shadow-none hover:bg-slate-800 disabled:bg-slate-300"
              disabled={loading || isDesignPreview}
            >
              {loading
                ? "Saving..."
                : isEditing
                  ? "Update record"
                  : isDesignPreview
                    ? "Preview only"
                    : "Create record"}
            </button>
            <button
              type="button"
              className="btn btn-ghost rounded-full px-5 text-slate-600 hover:bg-slate-100"
              onClick={() => setValues(seedValues)}
              disabled={loading}
            >
              Reset
            </button>
            {isEditing ? (
              <button
                type="button"
                className="btn btn-ghost rounded-full px-5 text-slate-600 hover:bg-slate-100"
                onClick={onCancel}
              >
                Cancel edit
              </button>
            ) : null}
          </div>
        </div>

        <div className="rounded-[1.75rem] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
            Live summary
          </p>
          <div className="mt-4 space-y-4">
            {normalizedFields.map((field) => (
              <div
                key={field.link_name}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
              >
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                  {field.display_name ?? field.link_name}
                </p>
                <p className="mt-1 text-sm text-slate-700">
                  {String(values[field.link_name] ?? "").trim() ||
                    "No value entered yet"}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-2xl bg-slate-950 px-4 py-4 text-sm text-slate-200">
            {isDesignPreview
              ? "This is a visual preview state. Load Creator metadata to switch the form from sample fields to your real mapped form."
              : "Your current field values are mirrored here so it is easier to review the payload before submission."}
          </div>
        </div>
      </div>
    </form>
  );
}
