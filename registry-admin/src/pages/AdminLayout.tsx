import { Navigate, Outlet, NavLink } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import { useAdmin } from "../auth/useAdmin";

function TabLink({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        [
          "px-3 py-2 rounded-xl text-sm font-medium transition",
          isActive ? "bg-indigo-600 text-white" : "text-slate-700 hover:bg-slate-100",
        ].join(" ")
      }
    >
      {label}
    </NavLink>
  );
}

export default function AdminLayout() {
  const state = useAdmin();

  if (state.status === "error") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 text-left">
          <div className="font-semibold text-slate-900">Admin check failed</div>
          <div className="mt-2 text-sm text-slate-600">{state.message}</div>
          <button
            onClick={() => signOut(auth)}
            className="mt-5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  if (state.status === "loading") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-600">Loading…</div>
      </div>
    );
  }

  if (state.status === "signedOut") return <Navigate to="/login" replace />;
  if (state.status === "notAdmin") return <Navigate to="/not-admin" replace />;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="border-b border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-semibold">
              R
            </div>
            <div>
              <div className="font-semibold text-slate-900">Registry Admin</div>
              <div className="text-xs text-slate-500">Manage the apps config registry</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <TabLink to="/apps" label="Apps" />
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-xs text-slate-500">{state.user.email}</div>
            <button
              onClick={() => signOut(auth)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-6 py-6">
        <Outlet />
      </main>
    </div>
  );
}
