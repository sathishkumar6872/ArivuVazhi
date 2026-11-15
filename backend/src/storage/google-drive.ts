import { Readable } from "node:stream";
import { google } from "googleapis";
import { mapGoogleError } from "./errors.js";
import type { StorageProvider } from "./types.js";

/** Least privilege: only files and folders this app creates. */
export const DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive.file"];

export function oauthClient(input: { clientId: string; clientSecret: string; redirectUri: string; refreshToken?: string }) {
  const client = new google.auth.OAuth2(input.clientId, input.clientSecret, input.redirectUri);
  // googleapis renews the access token from the refresh token automatically.
  if (input.refreshToken) client.setCredentials({ refresh_token: input.refreshToken });
  return client;
}

export function authUrl(client: ReturnType<typeof oauthClient>, state: string) {
  // offline + consent: Google returns a refresh token every time the admin connects.
  return client.generateAuthUrl({ access_type: "offline", prompt: "consent", scope: DRIVE_SCOPES, state, include_granted_scopes: true });
}

export async function exchangeCode(client: ReturnType<typeof oauthClient>, code: string) {
  try {
    const { tokens } = await client.getToken(code);
    return tokens;
  } catch (error) {
    throw mapGoogleError(error);
  }
}

export function googleDriveProvider(client: ReturnType<typeof oauthClient>): StorageProvider {
  const drive = google.drive({ version: "v3", auth: client });
  const run = async <T>(task: () => Promise<T>) => {
    try {
      return await task();
    } catch (error) {
      throw mapGoogleError(error);
    }
  };
  return {
    name: "google_drive",
    upload: ({ buffer, name, mimeType, folderId }) =>
      run(async () => {
        const res = await drive.files.create({
          requestBody: { name, ...(folderId ? { parents: [folderId] } : {}) },
          media: { mimeType, body: Readable.from(buffer) },
          fields: "id,size",
        });
        return { providerFileId: res.data.id || "", size: Number(res.data.size || buffer.length) };
      }),
    download: (id) =>
      run(async () => {
        const res = await drive.files.get({ fileId: id, alt: "media" }, { responseType: "arraybuffer" });
        return Buffer.from(res.data as ArrayBuffer);
      }),
    get: (id) =>
      run(async () => {
        const res = await drive.files.get({ fileId: id, fields: "id,name,size,mimeType,trashed" });
        return { name: res.data.name || "", size: Number(res.data.size || 0), mimeType: res.data.mimeType || "", trashed: Boolean(res.data.trashed) };
      }),
    remove: (id) =>
      run(async () => {
        await drive.files.delete({ fileId: id });
      }),
    createFolder: (name, parentId) =>
      run(async () => {
        const res = await drive.files.create({
          requestBody: { name, mimeType: "application/vnd.google-apps.folder", ...(parentId ? { parents: [parentId] } : {}) },
          fields: "id",
        });
        return { id: res.data.id || "" };
      }),
    test: (folderId) =>
      run(async () => {
        const about = await drive.about.get({ fields: "user(emailAddress),storageQuota(limit,usage)" });
        if (folderId) await drive.files.get({ fileId: folderId, fields: "id,trashed" });
        return {
          email: about.data.user?.emailAddress || "",
          usedBytes: Number(about.data.storageQuota?.usage || 0),
          limitBytes: Number(about.data.storageQuota?.limit || 0),
        };
      }),
  };
}
