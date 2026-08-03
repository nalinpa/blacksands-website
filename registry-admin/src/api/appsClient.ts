const BASE_URL = "https://api.blacksands.app/v1/admin";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, idToken: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json();
  if (!res.ok || !body.ok) throw new ApiError(res.status, body.error ?? "request_failed");
  return body.data as T;
}

export type AppSummary = { appId: string; name: string; theme: Record<string, string> };

export function listApps(idToken: string): Promise<{ apps: AppSummary[] }> {
  return request("/apps", idToken);
}
