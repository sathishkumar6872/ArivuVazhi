export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api/v1";

export type User = {
  id: string;
  email: string;
  role: "student" | "admin" | "reviewer";
  firstName: string;
  lastName: string;
  phone: string;
  language: "ta" | "en";
  status: string;
  onboardingComplete: boolean;
  education: Array<{ level?: string; institution?: string; year?: string }>;
  examHistory: Array<{ examName?: string; year?: string; result?: string }>;
  preferences: { carryForward: boolean; notifications: boolean };
  aiMemoryEnabled: boolean;
  primaryExamId: string;
  examIds: string[];
  streak: number;
};

async function refresh(): Promise<boolean> {
  const refreshToken = localStorage.getItem("av_refresh");
  if (!refreshToken) return false;
  const response = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!response.ok) {
    localStorage.removeItem("av_access");
    localStorage.removeItem("av_refresh");
    return false;
  }
  const payload = await response.json();
  localStorage.setItem("av_access", payload.data.accessToken);
  localStorage.setItem("av_refresh", payload.data.refreshToken);
  return true;
}

export async function api<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && options.body) headers.set("Content-Type", "application/json");
  const token = localStorage.getItem("av_access");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (response.status === 401 && retry && !path.startsWith("/auth/")) {
    const ok = await refresh();
    if (ok) return api<T>(path, options, false);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || "Request failed");
  return payload.data as T;
}

export function saveSession(accessToken: string, refreshToken: string) {
  localStorage.setItem("av_access", accessToken);
  localStorage.setItem("av_refresh", refreshToken);
}

export function clearSession() {
  localStorage.removeItem("av_access");
  localStorage.removeItem("av_refresh");
}
