import type { ThemeRow } from "../../models/appConfig";
import { Input, SecondaryButton } from "../ui/FormControls";

type Props = {
  rows: ThemeRow[];
  onChange: (rows: ThemeRow[]) => void;
};

export function ThemeEditor({ rows, onChange }: Props) {
  function addRow() {
    onChange([...rows, { key: "", value: "" }]);
  }
  function removeRow(i: number) {
    onChange(rows.filter((_, idx) => idx !== i));
  }
  function update(i: number, patch: Partial<ThemeRow>) {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  return (
    <div className="pt-2">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-slate-700">Theme</div>
        <SecondaryButton type="button" onClick={addRow}>Add color</SecondaryButton>
      </div>
      <div className="mt-3 space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
            <Input value={row.key} onChange={(e) => update(i, { key: e.target.value })} placeholder="primary" />
            <Input value={row.value} onChange={(e) => update(i, { value: e.target.value })} placeholder="#2c2c2a" />
            <button
              type="button"
              onClick={() => removeRow(i)}
              className="text-xs rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-rose-700 hover:bg-rose-100"
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
