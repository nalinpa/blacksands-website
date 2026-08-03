import type { AppFormState } from "../../models/appConfig";
import { Input, PrimaryButton, SecondaryButton } from "../ui/FormControls";
import { ThemeEditor } from "./ThemeEditor";
import { FeaturesEditor } from "./FeaturesEditor";
import { LocationFieldsEditor } from "./LocationFieldsEditor";

type Props = {
  form: AppFormState;
  isEditing: boolean;
  onChange: (patch: Partial<AppFormState>) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
};

export function AppForm({ form, isEditing, onChange, onSave, onCancel, onDelete }: Props) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
      <div>
        <label className="text-xs font-medium text-slate-700">App ID</label>
        <Input
          value={form.appId}
          onChange={(e) => onChange({ appId: e.target.value })}
          disabled={isEditing}
          placeholder="cones"
        />
      </div>

      <div>
        <label className="text-xs font-medium text-slate-700">Name</label>
        <Input value={form.name} onChange={(e) => onChange({ name: e.target.value })} placeholder="Cones" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-slate-700">Firebase project</label>
          <Input
            value={form.firebaseProject}
            onChange={(e) => onChange({ firebaseProject: e.target.value })}
            placeholder="cones-app-fd230"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-700">R2 bucket</label>
          <Input value={form.r2Bucket} onChange={(e) => onChange({ r2Bucket: e.target.value })} placeholder="aklguide" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-xs font-medium text-slate-700">Collection: locations</label>
          <Input
            value={form.collectionsLocations}
            onChange={(e) => onChange({ collectionsLocations: e.target.value })}
            placeholder="cones"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-700">Collection: reviews</label>
          <Input
            value={form.collectionsReviews}
            onChange={(e) => onChange({ collectionsReviews: e.target.value })}
            placeholder="optional"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-700">Collection: itineraries</label>
          <Input
            value={form.collectionsItineraries}
            onChange={(e) => onChange({ collectionsItineraries: e.target.value })}
            placeholder="optional"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-slate-700">Map latitude</label>
          <Input value={form.mapLat} onChange={(e) => onChange({ mapLat: e.target.value })} placeholder="-36.8485" />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-700">Map longitude</label>
          <Input value={form.mapLng} onChange={(e) => onChange({ mapLng: e.target.value })} placeholder="174.7633" />
        </div>
      </div>

      <ThemeEditor rows={form.theme} onChange={(theme) => onChange({ theme })} />
      <FeaturesEditor form={form} onChange={onChange} />
      <LocationFieldsEditor rows={form.locationFields} onChange={(locationFields) => onChange({ locationFields })} />

      <div className="flex items-center justify-between pt-2">
        <div className="flex gap-2">
          <PrimaryButton type="button" onClick={onSave}>
            {isEditing ? "Save" : "Create"}
          </PrimaryButton>
          <SecondaryButton type="button" onClick={onCancel}>
            Cancel
          </SecondaryButton>
        </div>
        {isEditing && onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="text-sm rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-rose-700 hover:bg-rose-100"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
