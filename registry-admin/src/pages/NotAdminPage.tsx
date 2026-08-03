import { useAdmin } from "../auth/useAdmin";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";

export default function NotAdminPage() {
  const state = useAdmin();
  if (state.status !== "notAdmin") return null;

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-xl bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
        <h1 className="text-xl font-semibold text-slate-900">Access denied</h1>
        <p className="text-sm text-slate-600 mt-1">
          This account is signed in, but doesn't carry the admin claim.
        </p>

        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-sm text-slate-700 font-medium">Your email</div>
          <div className="mt-1 font-mono text-sm text-slate-900 break-all">{state.user.email}</div>
          <div className="mt-3 text-sm text-slate-600">
            Grant it from <code className="px-1 py-0.5 rounded bg-white border border-slate-200">enginev1/api</code>:
            <div className="mt-2 font-mono text-xs bg-white border border-slate-200 rounded-lg p-3">
              GOOGLE_APPLICATION_CREDENTIALS=./blacksands-service-account.json \<br />
              &nbsp;&nbsp;node scripts/grant-admin.mjs {state.user.email}
            </div>
            Then sign out and back in.
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            onClick={() => signOut(auth)}
            className="rounded-xl bg-slate-900 px-4 py-2 text-white font-medium hover:bg-slate-800"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
