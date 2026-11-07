export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api/v1";

async function refresh(): Promise<boolean> {
  const refreshToken = localStorage.getItem("av_admin_refresh");
  if (!refreshToken) return false;
  const response = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!response.ok) return false;
  const payload = await response.json();
  localStorage.setItem("av_admin_access", payload.data.accessToken);
  localStorage.setItem("av_admin_refresh", payload.data.refreshToken);
  return true;
}

export async function api<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && options.body) headers.set("Content-Type", "application/json");
  const token = localStorage.getItem("av_admin_access");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (response.status === 401 && retry && !path.startsWith("/auth/")) {
    if (await refresh()) return api<T>(path, options, false);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || "Request failed");
  return payload.data as T;
}
