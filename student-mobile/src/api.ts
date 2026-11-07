import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import OfflineStorage from "./offline-storage";

const API = process.env.EXPO_PUBLIC_API_URL || "http://localhost:4000/api/v1";
const memory = new Map<string, string>();
const OFFLINE_QUEUE = "av_m_offline_queue";
type OfflineQueue = {
  practiceAnswers: Array<{ sessionId: string; questionId: string; selectedKey: string }>;
  completeSessionIds: string[];
};

async function readQueue(): Promise<OfflineQueue> {
  const raw = await OfflineStorage.getItem(OFFLINE_QUEUE);
  if (!raw) return { practiceAnswers: [], completeSessionIds: [] };
  try { return JSON.parse(raw) as OfflineQueue; } catch { return { practiceAnswers: [], completeSessionIds: [] }; }
}

async function writeQueue(queue: OfflineQueue) {
  await OfflineStorage.setItem(OFFLINE_QUEUE, JSON.stringify(queue));
}

async function queueOfflineRequest(path: string, options: RequestInit): Promise<unknown | null> {
  const answer = path.match(/^\/practice\/sessions\/([^/]+)\/answers$/);
  const complete = path.match(/^\/practice\/sessions\/([^/]+)\/complete$/);
  if (!answer && !complete) return null;
  const queue = await readQueue();
  if (answer) {
    const body = JSON.parse(String(options.body || "{}"));
    queue.practiceAnswers = queue.practiceAnswers.filter((item) => item.questionId !== body.questionId);
    queue.practiceAnswers.push({ sessionId: answer[1], questionId: body.questionId, selectedKey: body.selectedKey });
    await writeQueue(queue);
    return { pendingOffline: true, selectedKey: body.selectedKey };
  }
  if (complete && !queue.completeSessionIds.includes(complete[1])) queue.completeSessionIds.push(complete[1]);
  await writeQueue(queue);
  return { pendingOffline: true };
}

export async function syncOfflineQueue() {
  const queue = await readQueue();
  if (!queue.practiceAnswers.length && !queue.completeSessionIds.length) return { applied: 0, completed: 0 };
  const token = await storageGet("av_m_access");
  if (!token) return null;
  const response = await fetch(`${API}/sync`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...queue, idempotencyKey: `mobile-${Date.now()}-${queue.practiceAnswers.length}` }),
  });
  if (!response.ok) return null;
  const payload = await response.json();
  await OfflineStorage.removeItem(OFFLINE_QUEUE);
  return payload.data;
}

export type Student = {
  id: string;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
  phone: string;
  language: "ta" | "en";
  status: string;
  onboardingComplete: boolean;
  education: Array<{ level?: string; institution?: string; year?: string }>;
  examHistory: Array<{ examName?: string; year?: string; result?: string }>;
  preferences: { carryForward: boolean; notifications: boolean; appLanguage?: "ta" | "en" };
  aiMemoryEnabled: boolean;
  primaryExamId: string;
  examIds: string[];
  streak: number;
};

export async function storageGet(key: string) {
  if (Platform.OS === "web" && typeof localStorage !== "undefined") return localStorage.getItem(key);
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return memory.get(key) || null;
  }
}

export async function storageSet(key: string, value: string) {
  if (Platform.OS === "web" && typeof localStorage !== "undefined") {
    localStorage.setItem(key, value);
    return;
  }
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    memory.set(key, value);
  }
}

export async function storageClearSession() {
  if (Platform.OS === "web" && typeof localStorage !== "undefined") {
    localStorage.removeItem("av_m_access");
    localStorage.removeItem("av_m_refresh");
  } else {
    await Promise.all([
      SecureStore.deleteItemAsync("av_m_access").catch(() => undefined),
      SecureStore.deleteItemAsync("av_m_refresh").catch(() => undefined),
    ]);
  }
  memory.delete("av_m_access");
  memory.delete("av_m_refresh");
}

export class ApiError extends Error {
  offline: boolean;
  constructor(message: string, offline = false) {
    super(message);
    this.offline = offline;
  }
}

export async function api<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body) headers.set("Content-Type", "application/json");
  const token = await storageGet("av_m_access");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, { ...options, headers });
  } catch {
    const queued = await queueOfflineRequest(path, options);
    if (queued) return queued as T;
    throw new ApiError("No connection. Check your network and try again.", true);
  }
  if (response.status === 401 && retry && !path.startsWith("/auth/")) {
    const refresh = await storageGet("av_m_refresh");
    if (refresh) {
      const refreshed = await fetch(`${API}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: refresh }),
      }).catch(() => null);
      if (refreshed?.ok) {
        const payload = await refreshed.json();
        await storageSet("av_m_access", payload.data.accessToken);
        await storageSet("av_m_refresh", payload.data.refreshToken);
        return api<T>(path, options, false);
      }
    }
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(payload?.error?.message || "Request failed");
  return payload.data as T;
}

export async function saveSession(data: { accessToken: string; refreshToken: string; user: Student }) {
  if (data.user.role !== "student") throw new ApiError("Use a student account in this app");
  await storageSet("av_m_access", data.accessToken);
  await storageSet("av_m_refresh", data.refreshToken);
  return data.user;
}

export function todayKey() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function shiftDay(day: string, delta: number) {
  const [year, month, date] = day.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, date + delta));
  return next.toISOString().slice(0, 10);
}
