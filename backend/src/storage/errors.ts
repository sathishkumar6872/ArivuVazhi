import { HttpError } from "../http.js";

export type StorageErrorCode =
  | "STORAGE_NOT_CONFIGURED"
  | "STORAGE_NOT_CONNECTED"
  | "STORAGE_AUTH_EXPIRED"
  | "STORAGE_CONFIG_ERROR"
  | "STORAGE_PERMISSION"
  | "STORAGE_QUOTA"
  | "STORAGE_RATE_LIMIT"
  | "STORAGE_NETWORK"
  | "STORAGE_FILE_MISSING"
  | "STORAGE_ERROR";

const STATUS: Record<StorageErrorCode, number> = {
  STORAGE_NOT_CONFIGURED: 409,
  STORAGE_NOT_CONNECTED: 409,
  STORAGE_AUTH_EXPIRED: 409,
  STORAGE_CONFIG_ERROR: 409,
  STORAGE_PERMISSION: 403,
  STORAGE_QUOTA: 507,
  STORAGE_RATE_LIMIT: 429,
  STORAGE_NETWORK: 503,
  STORAGE_FILE_MISSING: 404,
  STORAGE_ERROR: 502,
};

/** Admin-facing storage error: clear message, never credentials or raw provider payloads. */
export class StorageError extends HttpError {
  constructor(code: StorageErrorCode, message: string) {
    super(STATUS[code], message, code);
  }
}

type GoogleLike = {
  code?: number | string;
  status?: number;
  message?: string;
  response?: { status?: number; data?: { error?: string | { message?: string; errors?: Array<{ reason?: string }> }; error_description?: string } };
  errors?: Array<{ reason?: string }>;
};

/**
 * Map a Google API / OAuth / network failure to a StorageError. Pure, so it is unit-tested.
 */
export function mapGoogleError(error: unknown): StorageError {
  if (error instanceof StorageError) return error;
  const e = (error || {}) as GoogleLike;
  const data = e.response?.data;
  const oauthError = typeof data?.error === "string" ? data.error : "";
  const reasons = [
    ...(e.errors || []),
    ...(typeof data?.error === "object" ? data.error?.errors || [] : []),
  ].map((item) => item.reason || "");
  const status = Number(e.response?.status || e.status || (typeof e.code === "number" ? e.code : 0));
  const text = `${e.message || ""} ${oauthError}`.toLowerCase();
  const netCode = typeof e.code === "string" ? e.code : "";

  if (oauthError === "invalid_grant" || text.includes("invalid_grant") || text.includes("token has been expired or revoked")) {
    return new StorageError("STORAGE_AUTH_EXPIRED", "Google authorization expired or was revoked. Reconnect the Google account.");
  }
  if (oauthError === "invalid_client" || oauthError === "unauthorized_client" || text.includes("invalid_client")) {
    return new StorageError("STORAGE_CONFIG_ERROR", "Google rejected the OAuth Client ID or Client Secret. Check the credentials.");
  }
  if (["ENOTFOUND", "ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "EAI_AGAIN"].includes(netCode)) {
    return new StorageError("STORAGE_NETWORK", "Could not reach Google Drive. Check the network and try again.");
  }
  if (reasons.includes("storageQuotaExceeded") || reasons.includes("quotaExceeded")) {
    return new StorageError("STORAGE_QUOTA", "Google Drive storage is full. Free up space or use another account.");
  }
  if (status === 429 || reasons.includes("rateLimitExceeded") || reasons.includes("userRateLimitExceeded")) {
    return new StorageError("STORAGE_RATE_LIMIT", "Google Drive is rate-limiting requests. Try again in a minute.");
  }
  if (status === 401) {
    return new StorageError("STORAGE_AUTH_EXPIRED", "Google authorization is no longer valid. Reconnect the Google account.");
  }
  if (status === 403 || reasons.includes("insufficientPermissions") || reasons.includes("forbidden")) {
    return new StorageError("STORAGE_PERMISSION", "The connected Google account does not have permission for this file or folder.");
  }
  if (status === 404) {
    return new StorageError("STORAGE_FILE_MISSING", "The file no longer exists in Google Drive.");
  }
  return new StorageError("STORAGE_ERROR", "Google Drive request failed. Try again.");
}
