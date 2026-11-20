import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import swaggerUi from "swagger-ui-express";
import { ZodError } from "zod";
import mongoose from "mongoose";
import { config } from "./config.js";
import { completeChatGptSignIn } from "./chatgpt-auth.js";
import { HttpError, nid } from "./http.js";
import { openApiSpec } from "./openapi.js";
import { authRouter } from "./routes/auth.js";
import { studentRouter } from "./routes/student.js";
import { learningRouter } from "./routes/learning.js";
import { adminRouter } from "./routes/admin.js";
import { getDailyMockRun, startDailyMockJob } from "./jobs.js";
import { startCurrentAffairsJob } from "./current-affairs.js";
import { filesRouter, storageAdminRouter } from "./routes/storage.js";
import { pyqAdminRouter } from "./routes/pyq-admin.js";
import { completeGoogleAuth } from "./storage/index.js";
import crypto from "node:crypto";

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function createApp() {
  const app = express();
  app.use((req, res, next) => {
    req.requestId = nid();
    res.setHeader("X-Request-Id", req.requestId);
    const started = Date.now();
    res.on("finish", () => {
      console.log(JSON.stringify({
        requestId: req.requestId,
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        ms: Date.now() - started,
      }));
    });
    next();
  });
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigins, credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  // Sign in with ChatGPT returns here (OpenAI requires 127.0.0.1 loopback on /auth/callback).
  app.get("/auth/callback", async (req, res) => {
    let params: Record<string, string>;
    try {
      const result = await completeChatGptSignIn(req.query as Record<string, unknown>);
      params = result.ok
        ? { chatgpt: result.planEnabled ? "connected" : "plan_not_allowed" }
        : { chatgpt: "error", message: result.message };
    } catch (error) {
      console.warn(`ChatGPT sign-in failed: ${error instanceof Error ? error.message : "unknown"}`);
      params = { chatgpt: "error", message: error instanceof Error ? error.message : "ChatGPT sign-in failed" };
    }
    res.redirect(`${config.adminPortalUrl}/ai?${new URLSearchParams(params)}`);
  });
  // Google Drive OAuth returns here (public; the one-time state ties it to the admin who started it).
  app.get("/api/v1/admin/storage/google/callback", async (req, res) => {
    let params: Record<string, string>;
    try {
      if (typeof req.query.error === "string") throw new Error(req.query.error === "access_denied" ? "Google access was not granted." : "Google sign-in failed.");
      const result = await completeGoogleAuth({ code: String(req.query.code || ""), state: String(req.query.state || "") });
      params = { drive: "connected", account: result.email };
    } catch (error) {
      params = { drive: "error", message: error instanceof Error ? error.message : "Google Drive connection failed" };
    }
    res.redirect(`${config.adminPortalUrl}/storage?${new URLSearchParams(params)}`);
  });
  app.use("/api/v1/admin/storage", storageAdminRouter);
  app.use("/api/v1/admin/pyq", pyqAdminRouter);
  app.use("/api/v1/files", filesRouter);
  app.use("/api/v1/auth", rateLimit({ windowMs: 15 * 60 * 1000, limit: 40, standardHeaders: true, legacyHeaders: false }));
  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openApiSpec));
  app.get("/api/v1/openapi.json", (_req, res) => res.json(openApiSpec));
  app.get("/api/v1/health", (_req, res) => {
    const db = mongoose.connection.readyState === 1 ? "up" : "down";
    res.status(db === "up" ? 200 : 503).json({ data: { status: db === "up" ? "ok" : "degraded", db, service: "arivuvazhi-api" } });
  });
  // External cron trigger for hosts that sleep at 02:00 (e.g. free tiers). Disabled unless CRON_SECRET is set.
  // The cron gets a runId back and polls GET .../daily-mocks/:runId until `finished` is true.
  const cronOnly: express.RequestHandler = (req, _res, next) => {
    const secret = config.cronSecret;
    const given = req.headers["x-cron-secret"];
    if (!secret || typeof given !== "string" || !safeEqual(given, secret)) {
      return next(new HttpError(404, "Route not found", "NOT_FOUND"));
    }
    next();
  };
  app.post("/api/v1/internal/jobs/daily-mocks", cronOnly, async (_req, res, next) => {
    try {
      const start = await startDailyMockJob("manual");
      if (start.started) {
        void start.done.catch((error) => console.warn(`Daily mock job failed: ${error?.message || error}`));
        return res.status(202).json({ data: { started: true, runId: start.runId, statusUrl: `/api/v1/internal/jobs/daily-mocks/${start.runId}` } });
      }
      res.status(200).json({ data: { started: false, reason: start.reason, runId: start.runId } });
    } catch (error) {
      next(error);
    }
  });
  // Daily current affairs for yesterday's news (call at 03:00 IST). Safe to call again: skips a published day.
  app.post("/api/v1/internal/jobs/current-affairs", cronOnly, async (_req, res, next) => {
    try {
      const start = await startCurrentAffairsJob("manual");
      res.status(start.started ? 202 : 200).json({ data: start });
    } catch (error) {
      next(error);
    }
  });
  app.get("/api/v1/internal/jobs/daily-mocks/:runId", cronOnly, async (req, res, next) => {
    try {
      const run = await getDailyMockRun(req.params.runId);
      if (!run) return next(new HttpError(404, "Job run not found", "NOT_FOUND"));
      res.json({ data: run });
    } catch (error) {
      next(error);
    }
  });
  app.use("/api/v1/auth", authRouter);
  app.use("/api/v1", studentRouter);
  app.use("/api/v1", learningRouter);
  app.use("/api/v1/admin", adminRouter);
  app.use((_req, _res, next) => next(new HttpError(404, "Route not found", "NOT_FOUND")));
  app.use((error: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: { code: "VALIDATION", message: error.issues[0]?.message || "Invalid input", requestId: req.requestId } });
    }
    if (error instanceof HttpError) {
      return res.status(error.status).json({ error: { code: error.code, message: error.message, requestId: req.requestId } });
    }
    console.error(JSON.stringify({ requestId: req.requestId, error: error instanceof Error ? error.message : "unknown" }));
    return res.status(500).json({ error: { code: "INTERNAL", message: "Something went wrong", requestId: req.requestId } });
  });
  return app;
}
