import { useEffect, useState } from "react";
import { auth } from "../firebase";
import { listApps, type AppSummary } from "../api/appsClient";

export default function AppsPage() {
  const [apps, setApps] = useState<AppSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const token = await auth.currentUser!.getIdToken();
      const { apps } = await listApps(token);
      setApps(apps);
      setLoading(false);
    })();
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Apps registry</h1>
      {loading ? <p className="mt-4 text-slate-600">Loading…</p> : (
        <ul className="mt-4 space-y-1">
          {apps.map((a) => <li key={a.appId} className="text-slate-700">{a.appId} — {a.name}</li>)}
        </ul>
      )}
    </div>
  );
}
