/** What every storage backend (Google Drive now, Cloudflare R2 later) must provide. */
export interface StorageProvider {
  readonly name: "google_drive" | "memory";
  upload(input: { buffer: Buffer; name: string; mimeType: string; folderId: string }): Promise<{ providerFileId: string; size: number }>;
  download(providerFileId: string): Promise<Buffer>;
  get(providerFileId: string): Promise<{ name: string; size: number; mimeType: string; trashed: boolean }>;
  remove(providerFileId: string): Promise<void>;
  createFolder(name: string, parentId?: string): Promise<{ id: string }>;
  /** Cheap authenticated call; returns the account email. */
  test(folderId: string): Promise<{ email: string; usedBytes?: number; limitBytes?: number }>;
}

export type FileKind = "pyq_paper" | "pyq_answer_key" | "study_material" | "student_document" | "question_image" | "other";
