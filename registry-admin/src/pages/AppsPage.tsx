import { useEffect, useState } from "react";
import { auth } from "../firebase";
import { listApps, getApp, createApp, updateApp, deleteApp, ApiError, type AppSummary } from "../api/appsClient";
import type { AppFormState } from "../models/appConfig";
import { emptyForm, toFormState, fromFormState } from "../lib/appAdmin";
import { AppForm } from "../components/apps/AppForm";
import { SecondaryButton } from "../components/ui/FormControls";

export default function AppsPage() {
  const [apps, setApps] = useState<AppSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<AppFormState>(emptyForm);
  const [msg, setMsg] = useState("");

  async function refreshList() {
    const token = await auth.currentUser!.getIdToken();
    const { apps } = await listApps(token);
    setApps([...apps].sort((a, b) => a.appId.localeCompare(b.appId)));
    setLoading(false);
  }

  useEffect(() => {
    refreshList().catch((e) => setMsg(e instanceof Error ? e.message : "Failed to load apps"));
  }, []);

  function reset() {
    setSelectedId(null);
    setForm(emptyForm);
    setMsg("");
  }

  async function select(appId: string) {
    setMsg("");
    const token = await auth.currentUser!.getIdToken();
    try {
      const { app } = await getApp(token, appId);
      setSelectedId(appId);
      setForm(toFormState(app));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed to load app");
    }
  }

  async function save() {
    setMsg("");
    const { errors, config } = fromFormState(form);
    if (errors.length > 0) {
      setMsg(errors.join(" "));
      return;
    }

    const token = await auth.currentUser!.getIdToken();
    try {
      if (selectedId) {
        const { appId: _appId, ...rest } = config!;
        await updateApp(token, selectedId, rest);
        setMsg("Saved. Live API may take up to 5 min to pick this up (KV cache TTL).");
      } else {
        await createApp(token, config!);
        setMsg("Created. Live API may take up to 5 min to pick this up (KV cache TTL).");
      }
      await refreshList();
      reset();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setMsg("That App ID is already registered.");
      else setMsg(e instanceof Error ? e.message : "Error saving");
    }
  }

  async function remove(appId: string) {
    const ok = confirm(`Delete "${appId}"? This cannot be undone.`);
    if (!ok) return;

    setMsg("");
    const token = await auth.currentUser!.getIdToken();
    try {
      await deleteApp(token, appId);
      if (selectedId === appId) reset();
      await refreshList();
      setMsg("Deleted.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Error deleting");
    }
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Apps registry</h1>
          <p className="text-sm text-slate-600 mt-1">Every white-label app config the engine resolves by appId.</p>
        </div>
        <SecondaryButton onClick={reset}>New app</SecondaryButton>
      </div>

      {msg && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700">{msg}</div>
      )}

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2">
          {loading ? (
            <div className="text-slate-600">Loading…</div>
          ) : (
            <div className="space-y-2">
              {apps.map((a) => (
                <button
                  key={a.appId}
                  onClick={() => select(a.appId)}
                  className={[
                    "w-full text-left rounded-2xl border p-3",
                    selectedId === a.appId
                      ? "border-indigo-400 bg-indigo-50"
                      : "border-slate-200 bg-white hover:bg-slate-50",
                  ].join(" ")}
                >
                  <div className="font-medium text-slate-900">{a.name}</div>
                  <div className="text-xs text-slate-500 font-mono">{a.appId}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-3">
          <AppForm
            form={form}
            isEditing={selectedId !== null}
            onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
            onSave={save}
            onCancel={reset}
            onDelete={selectedId ? () => remove(selectedId) : undefined}
          />
        </div>
      </div>
    </div>
  );
}
