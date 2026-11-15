import { nid } from "../http.js";
import { StorageError } from "./errors.js";
import type { StorageProvider } from "./types.js";

/** Local verification only (STORAGE_FAKE=1, never in production): an in-process "Drive". */
const files = new Map<string, { name: string; mimeType: string; buffer: Buffer }>();

export const memoryProvider: StorageProvider = {
  name: "memory",
  async upload({ buffer, name, mimeType }) {
    const id = `mem-${nid()}`;
    files.set(id, { name, mimeType, buffer: Buffer.from(buffer) });
    return { providerFileId: id, size: buffer.length };
  },
  async download(id) {
    const file = files.get(id);
    if (!file) throw new StorageError("STORAGE_FILE_MISSING", "The file no longer exists in storage.");
    return file.buffer;
  },
  async get(id) {
    const file = files.get(id);
    if (!file) throw new StorageError("STORAGE_FILE_MISSING", "The file no longer exists in storage.");
    return { name: file.name, size: file.buffer.length, mimeType: file.mimeType, trashed: false };
  },
  async remove(id) {
    files.delete(id);
  },
  async createFolder() {
    return { id: `mem-folder-${nid()}` };
  },
  async test() {
    return { email: "fake-drive@example.com", usedBytes: 0, limitBytes: 0 };
  },
};
