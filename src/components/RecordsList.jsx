function getNormalizedRecords(data) {
  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data?.data)) {
    return data.data;
  }

  if (Array.isArray(data?.records)) {
    return data.records;
  }

  return [];
}

function getRecordId(record) {
  return (
    record?.ID ??
    record?.id ??
    record?.recordId ??
    record?.zc_display_value ??
    null
  );
}

export default function RecordsList({
  recordsData,
  loading,
  onEdit,
  onDelete,
}) {
  const records = getNormalizedRecords(recordsData);
  const sample = records[0] ?? {};
  const columns = Object.keys(sample).slice(0, 6);

  if (loading) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="space-y-3">
          <div className="skeleton h-6 w-48" />
          <div className="skeleton h-16 w-full" />
          <div className="skeleton h-16 w-full" />
        </div>
      </div>
    );
  }

  if (!records.length) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-900 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">No records yet</h3>
        <p className="mt-2 text-sm text-slate-500">
          Load a report to preview records here.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white text-slate-900 shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <div>
          <h3 className="font-semibold text-slate-900">Records</h3>
          <p className="text-sm text-slate-500">
            Showing {records.length} fetched item(s)
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="table">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              {columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record, index) => {
              const recordId = getRecordId(record);

              return (
                <tr key={recordId ?? index} className="border-slate-200">
                  {columns.map((column) => (
                    <td key={column} className="max-w-56 truncate text-slate-700">
                      {String(record[column] ?? "")}
                    </td>
                  ))}
                  <td>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        className="btn btn-sm border-0 bg-slate-100 text-slate-700 shadow-none hover:bg-slate-200"
                        onClick={() => onEdit(record)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm border border-rose-200 bg-white text-rose-600 shadow-none hover:bg-rose-50"
                        onClick={() => onDelete(record)}
                        disabled={!recordId}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
