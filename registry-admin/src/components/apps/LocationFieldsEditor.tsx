import type { LocationFieldFormRow } from "../../models/appConfig";
import { LOCATION_FIELD_TYPES } from "../../models/appConfig";
import { Input, SecondaryButton } from "../ui/FormControls";

type Props = {
  rows: LocationFieldFormRow[];
  onChange: (rows: LocationFieldFormRow[]) => void;
};

export function LocationFieldsEditor({ rows, onChange }: Props) {
  function addRow() {
    onChange([...rows, { key: "", label: "", type: "text", required: false, options: "" }]);
  }
  function removeRow(i: number) {
    onChange(rows.filter((_, idx) => idx !== i));
  }
  function update(i: number, patch: Partial<LocationFieldFormRow>) {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  return (
    <div className="pt-2">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-slate-700">Location fields (admin form schema)</div>
        <SecondaryButton type="button" onClick={addRow}>Add field</SecondaryButton>
      </div>

      {rows.length === 0 ? (
        <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          No custom fields — the app falls back to the fixed Location fields.
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {rows.map((row, i) => (
            <div key={i} className="rounded-2xl border border-slate-200 bg-white p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="text-sm font-medium text-slate-900">Field {i + 1}</div>
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  className="text-xs rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-rose-700 hover:bg-rose-100"
                >
                  Remove
                </button>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-700">Key</label>
                  <Input value={row.key} onChange={(e) => update(i, { key: e.target.value })} placeholder="category" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-700">Label</label>
                  <Input value={row.label} onChange={(e) => update(i, { label: e.target.value })} placeholder="Category" />
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3 items-end">
                <div>
                  <label className="text-xs font-medium text-slate-700">Type</label>
                  <select
                    value={row.type}
                    onChange={(e) => update(i, { type: e.target.value as LocationFieldFormRow["type"] })}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
                  >
                    {LOCATION_FIELD_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-700 pb-2">
                  <input
                    type="checkbox"
                    checked={row.required}
                    onChange={(e) => update(i, { required: e.target.checked })}
                  />
                  Required
                </label>
              </div>

              {(row.type === "select" || row.type === "multiselect") && (
                <div className="mt-3">
                  <label className="text-xs font-medium text-slate-700">Options (comma-separated)</label>
                  <Input
                    value={row.options}
                    onChange={(e) => update(i, { options: e.target.value })}
                    placeholder="burger, pizza, asian"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
