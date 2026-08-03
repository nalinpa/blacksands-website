import type { AppFormState } from "../../models/appConfig";
import { Input } from "../ui/FormControls";

type Props = {
  form: AppFormState;
  onChange: (patch: Partial<AppFormState>) => void;
};

export function FeaturesEditor({ form, onChange }: Props) {
  return (
    <div className="pt-2 space-y-4">
      <div className="text-sm font-medium text-slate-700">Features</div>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={form.completionEnabled}
          onChange={(e) => onChange({ completionEnabled: e.target.checked })}
        />
        Completion
      </label>
      {form.completionEnabled && (
        <div className="ml-6 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <div>
            <label className="text-xs font-medium text-slate-700">Completions collection</label>
            <Input
              value={form.completionCollection}
              onChange={(e) => onChange({ completionCollection: e.target.value })}
              placeholder="coneCompletions"
            />
          </div>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.completionMethodTick}
                onChange={(e) => onChange({ completionMethodTick: e.target.checked })}
              />
              tick
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.completionMethodCheckin}
                onChange={(e) => onChange({ completionMethodCheckin: e.target.checked })}
              />
              checkin
            </label>
          </div>
          {form.completionMethodCheckin && (
            <div>
              <label className="text-xs font-medium text-slate-700">Check-in gate radius (m)</label>
              <Input
                value={form.completionGateRadius}
                onChange={(e) => onChange({ completionGateRadius: e.target.value })}
                placeholder="80"
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-700">Field: locationId</label>
              <Input
                value={form.completionFieldLocationId}
                onChange={(e) => onChange({ completionFieldLocationId: e.target.value })}
                placeholder="coneId"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700">Field: locationSlug</label>
              <Input
                value={form.completionFieldLocationSlug}
                onChange={(e) => onChange({ completionFieldLocationSlug: e.target.value })}
                placeholder="coneSlug"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700">Field: locationName</label>
              <Input
                value={form.completionFieldLocationName}
                onChange={(e) => onChange({ completionFieldLocationName: e.target.value })}
                placeholder="coneName"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700">Field: shared</label>
              <Input
                value={form.completionFieldShared}
                onChange={(e) => onChange({ completionFieldShared: e.target.value })}
                placeholder="shareBonus"
              />
            </div>
          </div>
        </div>
      )}

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={form.itineraryEnabled}
          onChange={(e) => onChange({ itineraryEnabled: e.target.checked })}
        />
        Itinerary
      </label>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={form.pushEnabled}
          onChange={(e) => onChange({ pushEnabled: e.target.checked })}
        />
        Push
      </label>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={form.redemptionEnabled}
          onChange={(e) => onChange({ redemptionEnabled: e.target.checked })}
        />
        Redemption
      </label>
    </div>
  );
}
