import express, { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../auth.js";
import { HttpError, wrap } from "../http.js";
import { StoredFile } from "../models.js";
import {
  connectGoogleDrive,
  createFolder,
  deleteFile,
  disconnectGoogleDrive,
  downloadFile,
  getFile,
  refreshAccessToken,
  saveGoogleCredentials,
  storageStatus,
  testConnection,
  uploadFile,
} from "../storage/index.js";

/** Settings → Storage. Admins only (not reviewers): credentials and connection. */
export const storageAdminRouter = Router();
storageAdminRouter.use(requireAuth, requireRole("admin"));

storageAdminRouter.get("/", wrap(async (_req, res) => res.json({ data: await storageStatus() })));

storageAdminRouter.put(
  "/credentials",
  wrap(async (req, res) => {
    const body = z.object({ clientId: z.string().min(10).max(300), clientSecret: z.string().min(10).max(300) }).parse(req.body);
    res.json({ data: await saveGoogleCredentials(body, req.user!.id) });
  }),
);

storageAdminRouter.post("/google/connect", wrap(async (req, res) => res.json({ data: await connectGoogleDrive(req.user!.id) })));

storageAdminRouter.post("/test", wrap(async (req, res) => res.json({ data: await testConnection(req.user!.id) })));

storageAdminRouter.post("/refresh", wrap(async (_req, res) => res.json({ data: await refreshAccessToken() })));

storageAdminRouter.put(
  "/folder",
  wrap(async (req, res) => {
    const body = z.object({ folderName: z.string().min(2).max(100) }).parse(req.body);
    res.json({ data: await createFolder(body.folderName, req.user!.id) });
  }),
);

storageAdminRouter.post("/disconnect", wrap(async (req, res) => res.json({ data: await disconnectGoogleDrive(req.user!.id) })));

/** Files kept in storage. Upload/list/delete: admins; download: anyone allowed to read the file. */
export const filesRouter = Router();
filesRouter.use(requireAuth);

const rawFile = express.raw({ type: ["application/pdf", "image/png", "image/jpeg", "image/webp"], limit: "60mb" });

filesRouter.post(
  "/",
  requireRole("admin"),
  rawFile,
  wrap(async (req, res) => {
    const query = z
      .object({
        name: z.string().min(1).max(200),
        kind: z.enum(["pyq_paper", "pyq_answer_key", "study_material", "question_image", "other"]).default("other"),
        visibility: z.enum(["private", "students"]).default("private"),
        refType: z.string().max(40).optional(),
        refId: z.string().max(80).optional(),
      })
      .parse(req.query);
    const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const mimeType = String(req.headers["content-type"] || "").split(";")[0].trim();
    const file = await uploadFile({ ...query, buffer, mimeType, ownerType: "admin", ownerId: req.user!.id });
    res.status(201).json({ data: file });
  }),
);

filesRouter.get(
  "/",
  requireRole("admin", "reviewer"),
  wrap(async (req, res) => {
    const filter: Record<string, unknown> = { deletedAt: null };
    if (typeof req.query.refType === "string") filter.refType = req.query.refType;
    if (typeof req.query.refId === "string") filter.refId = req.query.refId;
    res.json({ data: await StoredFile.find(filter).sort({ createdAt: -1 }).limit(100).lean() });
  }),
);

filesRouter.get("/:id", wrap(async (req, res) => res.json({ data: await getFile(req.params.id, req.user!) })));

filesRouter.get(
  "/:id/download",
  wrap(async (req, res) => {
    const { file, buffer } = await downloadFile(req.params.id, req.user!);
    res.setHeader("Content-Type", file.mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(file.name)}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.send(buffer);
  }),
);

filesRouter.delete(
  "/:id",
  requireRole("admin"),
  wrap(async (req, res) => {
    if (!req.params.id) throw new HttpError(400, "File id required", "BAD_REQUEST");
    res.json({ data: await deleteFile(req.params.id, req.user!.id) });
  }),
);
