import crypto from "node:crypto";
import { audit } from "../auth.js";
import { config } from "../config.js";
import { decryptSecret, encryptSecret } from "../crypto-secret.js";
import { HttpError, nid } from "../http.js";
import { StorageConfig, StorageFolder, StoredFile } from "../models.js";
import { StorageError, mapGoogleError } from "./errors.js";
import { authUrl, exchangeCode, googleDriveProvider, oauthClient } from "./google-drive.js";
import { memoryProvider } from "./memory.js";
import type { FileKind, StorageProvider } from "./types.js";

export { StorageError } from "./errors.js";
export type { FileKind } from "./types.js";

const CONFIG_ID = "default";
const STATE_TTL_MS = 10 * 60 * 1000;
/** Allowed uploads and their size limits. */
const ALLOWED: Record<string, number> = {
  "application/pdf": 60 * 1024 * 1024,
  "image/png": 5 * 1024 * 1024,
  "image/jpeg": 5 * 1024 * 1024,
  "image/webp": 5 * 1024 * 1024,
};

/** Local verification only: STORAGE_FAKE=1 swaps Google Drive for an in-memory store (never in production). */
const fakeStorage = () => process.env.STORAGE_FAKE === "1" && !config.isProd;

export function googleRedirectUri() {
  return `${config.publicApiUrl}/api/v1/admin/storage/google/callback`;
}

async function loadConfig() {
  return (
    (await StorageConfig.findOne({ id: CONFIG_ID })) ||
    (await StorageConfig.findOneAndUpdate({ id: CONFIG_ID }, { $setOnInsert: { id: CONFIG_ID } }, { upsert: true, new: true }))!
  );
}

function credentials(doc: Awaited<ReturnType<typeof loadConfig>>) {
  if (!doc.clientIdEnc || !doc.clientSecretEnc) {
    throw new StorageError("STORAGE_NOT_CONFIGURED", "Add the Google OAuth Client ID and Client Secret first.");
  }
  return { clientId: decryptSecret(doc.clientIdEnc), clientSecret: decryptSecret(doc.clientSecretEnc) };
}

/** The active provider, or a clear error when storage is not connected. */
async function activeProvider(): Promise<{ provider: StorageProvider; folderId: string; doc: Awaited<ReturnType<typeof loadConfig>> }> {
  const doc = await loadConfig();
  if (doc.provider !== "google_drive") throw new StorageError("STORAGE_NOT_CONFIGURED", "File storage is not configured.");
  if (doc.status === "authorization_expired") throw new StorageError("STORAGE_AUTH_EXPIRED", "Google authorization expired. Reconnect the Google account in Settings → Storage.");
  if (doc.status !== "connected" || !doc.refreshTokenEnc) throw new StorageError("STORAGE_NOT_CONNECTED", "Google Drive is not connected.");
  if (fakeStorage()) return { provider: memoryProvider, folderId: doc.folderId, doc };
  const { clientId, clientSecret } = credentials(doc);
  const client = oauthClient({ clientId, clientSecret, redirectUri: googleRedirectUri(), refreshToken: decryptSecret(doc.refreshTokenEnc) });
  return { provider: googleDriveProvider(client), folderId: doc.folderId, doc };
}

/** Record auth/config failures on the connection so the admin sees the right status. */
async function noteFailure(error: unknown) {
  const mapped = mapGoogleError(error);
  if (mapped.code === "STORAGE_AUTH_EXPIRED" || mapped.code === "STORAGE_CONFIG_ERROR") {
    await StorageConfig.updateOne(
      { id: CONFIG_ID },
      { $set: { status: mapped.code === "STORAGE_AUTH_EXPIRED" ? "authorization_expired" : "configuration_error", lastError: mapped.message } },
    );
    await audit("system", mapped.code === "STORAGE_AUTH_EXPIRED" ? "storage_auth_expired" : "storage_config_error", "storage", CONFIG_ID);
  } else {
    await StorageConfig.updateOne({ id: CONFIG_ID }, { $set: { lastError: mapped.message } });
  }
  return mapped;
}

async function withProvider<T>(task: (ctx: Awaited<ReturnType<typeof activeProvider>>) => Promise<T>) {
  const ctx = await activeProvider();
  try {
    return await task(ctx);
  } catch (error) {
    throw await noteFailure(error);
  }
}

function mask(value: string) {
  return value.length <= 10 ? "••••" : `${value.slice(0, 6)}…${value.slice(-4)}`;
}

/** Safe status for the admin portal: no secrets, ever. */
export async function storageStatus() {
  const doc = await loadConfig();
  let clientId = "";
  try {
    clientId = doc.clientIdEnc ? decryptSecret(doc.clientIdEnc) : "";
  } catch {
    clientId = "";
  }
  return {
    provider: doc.provider,
    status: doc.status,
    clientIdMasked: clientId ? mask(clientId) : "",
    hasClientSecret: Boolean(doc.clientSecretEnc),
    accountEmail: doc.accountEmail,
    folderName: doc.folderName,
    folderId: doc.folderId ? mask(doc.folderId) : "",
    lastError: doc.lastError,
    connectedAt: doc.connectedAt,
    lastCheckedAt: doc.lastCheckedAt,
    redirectUri: googleRedirectUri(),
    files: await StoredFile.countDocuments({ deletedAt: null }),
  };
}

/** Save (or update) the OAuth client. Changing it requires reconnecting the account. */
export async function saveGoogleCredentials(input: { clientId: string; clientSecret: string }, actorId: string) {
  const clientId = input.clientId.trim();
  const clientSecret = input.clientSecret.trim();
  if (!/^[\w.-]+\.apps\.googleusercontent\.com$/.test(clientId)) {
    throw new HttpError(400, "Client ID should look like 1234-abc.apps.googleusercontent.com", "BAD_REQUEST");
  }
  if (clientSecret.length < 10) throw new HttpError(400, "Client Secret looks too short.", "BAD_REQUEST");
  await StorageConfig.updateOne(
    { id: CONFIG_ID },
    {
      $set: {
        provider: "google_drive",
        clientIdEnc: encryptSecret(clientId),
        clientSecretEnc: encryptSecret(clientSecret),
        refreshTokenEnc: "",
        accountEmail: "",
        status: "disconnected",
        lastError: "",
      },
    },
    { upsert: true },
  );
  await audit(actorId, "storage_credentials_update", "storage", CONFIG_ID);
  return storageStatus();
}

/** Start "Connect Google Account": returns the Google consent URL (state protects the callback). */
export async function connectGoogleDrive(actorId: string) {
  const doc = await loadConfig();
  const { clientId, clientSecret } = credentials(doc);
  const state = crypto.randomBytes(24).toString("hex");
  doc.set({ oauthState: state, oauthStateExpires: new Date(Date.now() + STATE_TTL_MS), oauthActorId: actorId });
  await doc.save();
  if (fakeStorage()) return { authUrl: `${googleRedirectUri()}?code=fake&state=${state}` };
  return { authUrl: authUrl(oauthClient({ clientId, clientSecret, redirectUri: googleRedirectUri() }), state) };
}

/** Google redirected back: verify state, store the refresh token (encrypted), make the folder. */
export async function completeGoogleAuth(input: { code: string; state: string }) {
  const doc = await loadConfig();
  if (!input.state || input.state !== doc.oauthState || !doc.oauthStateExpires || doc.oauthStateExpires < new Date()) {
    throw new HttpError(400, "This sign-in link has expired. Start Connect Google Account again.", "BAD_STATE");
  }
  const actorId = doc.oauthActorId || "admin";
  doc.set({ oauthState: "", oauthStateExpires: null, oauthActorId: "" });
  await doc.save();
  try {
    let refreshToken = "fake-refresh-token";
    let email = "fake-drive@example.com";
    let folderId = doc.folderId;
    if (!fakeStorage()) {
      const { clientId, clientSecret } = credentials(doc);
      const client = oauthClient({ clientId, clientSecret, redirectUri: googleRedirectUri() });
      const tokens = await exchangeCode(client, input.code);
      if (!tokens.refresh_token) {
        throw new StorageError("STORAGE_CONFIG_ERROR", "Google did not return a refresh token. Remove the app from your Google account's third-party access, then connect again.");
      }
      refreshToken = tokens.refresh_token;
      client.setCredentials(tokens);
      const provider = googleDriveProvider(client);
      if (!folderId) folderId = (await provider.createFolder(doc.folderName || "ArivuVazhi")).id;
      email = (await provider.test(folderId)).email;
    } else if (!folderId) {
      folderId = (await memoryProvider.createFolder(doc.folderName || "ArivuVazhi")).id;
    }
    doc.set({
      refreshTokenEnc: encryptSecret(refreshToken),
      accountEmail: email,
      folderId,
      status: "connected",
      lastError: "",
      connectedAt: new Date(),
      lastCheckedAt: new Date(),
    });
    await doc.save();
    await audit(actorId, "storage_connect", "storage", CONFIG_ID, { account: email });
    return { email };
  } catch (error) {
    const mapped = mapGoogleError(error);
    doc.set({ status: "configuration_error", lastError: mapped.message });
    await doc.save();
    await audit(actorId, "storage_connect_failed", "storage", CONFIG_ID, { code: mapped.code });
    throw mapped;
  }
}

/** Renew the access token now (googleapis also does this on demand). */
export async function refreshAccessToken() {
  const doc = await loadConfig();
  if (fakeStorage()) return { ok: true };
  const { clientId, clientSecret } = credentials(doc);
  if (!doc.refreshTokenEnc) throw new StorageError("STORAGE_NOT_CONNECTED", "Google Drive is not connected.");
  const client = oauthClient({ clientId, clientSecret, redirectUri: googleRedirectUri(), refreshToken: decryptSecret(doc.refreshTokenEnc) });
  try {
    await client.getAccessToken();
    return { ok: true };
  } catch (error) {
    throw await noteFailure(error);
  }
}

export async function testConnection(actorId: string) {
  const result = await withProvider(async ({ provider, folderId }) => provider.test(folderId));
  await StorageConfig.updateOne({ id: CONFIG_ID }, { $set: { lastCheckedAt: new Date(), lastError: "", accountEmail: result.email } });
  await audit(actorId, "storage_test", "storage", CONFIG_ID);
  return result;
}

/** Use (or create) the folder files go into. */
export async function createFolder(name: string, actorId: string) {
  const clean = name.trim().slice(0, 100);
  if (clean.length < 2) throw new HttpError(400, "Folder name is too short.", "BAD_REQUEST");
  const folder = await withProvider(({ provider }) => provider.createFolder(clean));
  await StorageConfig.updateOne({ id: CONFIG_ID }, { $set: { folderId: folder.id, folderName: clean } });
  await audit(actorId, "storage_folder_update", "storage", CONFIG_ID, { folderName: clean });
  return storageStatus();
}

export async function disconnectGoogleDrive(actorId: string) {
  const doc = await loadConfig();
  if (!fakeStorage() && doc.refreshTokenEnc && doc.clientIdEnc && doc.clientSecretEnc) {
    // Best effort: revoke at Google; local tokens are cleared either way.
    try {
      const { clientId, clientSecret } = credentials(doc);
      await oauthClient({ clientId, clientSecret, redirectUri: googleRedirectUri() }).revokeToken(decryptSecret(doc.refreshTokenEnc));
    } catch {
      /* already revoked or unreachable */
    }
  }
  doc.set({ refreshTokenEnc: "", accountEmail: "", status: "disconnected", lastError: "", connectedAt: null });
  await doc.save();
  await audit(actorId, "storage_disconnect", "storage", CONFIG_ID);
  return storageStatus();
}

/** True when uploads will work right now (used to store PYQ PDFs only when possible). */
export async function storageReady() {
  const doc = await StorageConfig.findOne({ id: CONFIG_ID }).select("provider status refreshTokenEnc").lean();
  return Boolean(doc && doc.provider === "google_drive" && doc.status === "connected" && doc.refreshTokenEnc);
}

/** Folder for a path under the root (created once, then reused). */
async function folderFor(provider: StorageProvider, rootId: string, segments: string[]) {
  let parent = rootId;
  const clean = segments.map((part) => part.replace(/[\\/:*?"<>|]+/g, "-").trim().slice(0, 80)).filter(Boolean);
  for (let depth = 1; depth <= clean.length; depth += 1) {
    const path = clean.slice(0, depth).join("/");
    const known = await StorageFolder.findOne({ rootId, path }).lean();
    if (known) {
      parent = known.providerFolderId;
      continue;
    }
    const created = await provider.createFolder(clean[depth - 1], parent);
    try {
      await StorageFolder.create({ rootId, path, providerFolderId: created.id });
      parent = created.id;
    } catch (error) {
      // Another upload created it at the same moment: use theirs.
      if ((error as { code?: number }).code !== 11000) throw error;
      parent = (await StorageFolder.findOne({ rootId, path }).lean())!.providerFolderId;
    }
  }
  return parent;
}

/** Validate and store a file; returns the StoredFile record (metadata + Drive id). */
export async function uploadFile(input: {
  buffer: Buffer;
  name: string;
  mimeType: string;
  kind: FileKind;
  ownerType: "admin" | "student" | "system";
  ownerId: string;
  visibility?: "private" | "students";
  refType?: string;
  refId?: string;
  /** Sub-folders under the storage root, e.g. ["PYQ", "TNPSC Group IV", "2023", "General Studies", "question-papers"]. */
  folderPath?: string[];
}) {
  const limit = ALLOWED[input.mimeType];
  if (!limit) throw new HttpError(415, "Only PDF, PNG, JPEG and WEBP files are allowed.", "FILE_TYPE");
  if (!input.buffer?.length) throw new HttpError(400, "The file is empty.", "BAD_REQUEST");
  if (input.buffer.length > limit) throw new HttpError(413, `File is larger than ${Math.round(limit / 1024 / 1024)} MB.`, "FILE_TOO_LARGE");
  const name = input.name.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 200) || "file";
  const stored = await withProvider(async ({ provider, folderId }) => {
    const target = input.folderPath?.length ? await folderFor(provider, folderId, input.folderPath) : folderId;
    return provider.upload({ buffer: input.buffer, name, mimeType: input.mimeType, folderId: target });
  });
  const record = await StoredFile.create({
    id: nid(),
    provider: fakeStorage() ? "memory" : "google_drive",
    providerFileId: stored.providerFileId,
    name,
    mimeType: input.mimeType,
    size: stored.size,
    sha256: crypto.createHash("sha256").update(input.buffer).digest("hex"),
    kind: input.kind,
    ownerType: input.ownerType,
    ownerId: input.ownerId,
    visibility: input.visibility || "private",
    refType: input.refType || "",
    refId: input.refId || "",
  });
  if (input.ownerType !== "system") await audit(input.ownerId, "file_upload", "file", record.id, { kind: input.kind, size: stored.size });
  return record.toObject();
}

/** Who may read a file: admins/reviewers always; students their own files or files shared with students. */
function canRead(file: { ownerType: string; ownerId: string; visibility: string }, requester: { id: string; role: string }) {
  if (requester.role === "admin" || requester.role === "reviewer") return true;
  if (file.visibility === "students") return true;
  return file.ownerType === "student" && file.ownerId === requester.id;
}

export async function getFile(fileId: string, requester: { id: string; role: string }) {
  const file = await StoredFile.findOne({ id: fileId, deletedAt: null }).lean();
  if (!file || !canRead(file, requester)) throw new HttpError(404, "File not found", "NOT_FOUND");
  return file;
}

export async function downloadFile(fileId: string, requester: { id: string; role: string }) {
  const file = await getFile(fileId, requester);
  const buffer = await withProvider(({ provider }) => provider.download(file.providerFileId));
  return { file, buffer };
}

/** Delete from storage and mark the record deleted; a file already gone in Drive is not an error. */
export async function deleteFile(fileId: string, actorId: string) {
  const file = await StoredFile.findOne({ id: fileId, deletedAt: null });
  if (!file) throw new HttpError(404, "File not found", "NOT_FOUND");
  try {
    await withProvider(({ provider }) => provider.remove(file.providerFileId));
  } catch (error) {
    if (!(error instanceof StorageError && error.code === "STORAGE_FILE_MISSING")) throw error;
  }
  file.deletedAt = new Date();
  await file.save();
  await audit(actorId, "file_delete", "file", file.id);
  return { deleted: true };
}
