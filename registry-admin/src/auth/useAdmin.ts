import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "../firebase";
import { listApps, ApiError } from "../api/appsClient";

export type AdminState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "notAdmin"; user: User }
  | { status: "admin"; user: User }
  | { status: "error"; message: string; user?: User };

export function useAdmin(): AdminState {
  const [state, setState] = useState<AdminState>({ status: "loading" });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setState({ status: "signedOut" });
        return;
      }

      try {
        const idToken = await user.getIdToken();
        await listApps(idToken);
        setState({ status: "admin", user });
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          setState({ status: "notAdmin", user });
          return;
        }
        console.error("useAdmin check failed:", e);
        setState({
          status: "error",
          message: e instanceof Error ? e.message : "Failed to check admin status",
          user,
        });
      }
    });

    return () => unsub();
  }, []);

  return state;
}
