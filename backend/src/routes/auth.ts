import { Router } from "express";
import argon2 from "argon2";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { config } from "../config.js";
import { AppConfig, Exam, RefreshToken, User } from "../models.js";
import { audit, publicUser, signAccess, signRefresh } from "../auth.js";
import { dayKey, HttpError, nid, sha256, wrap } from "../http.js";

export const authRouter = Router();

const registerSchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().max(60).optional().default(""),
  email: z.string().email(),
  password: z.string().min(8).regex(/[A-Za-z]/).regex(/[0-9]/),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

async function issueSession(user: { id: string; role: string }) {
  const settings = await AppConfig.findOne({ id: "app" }).lean();
  const maxSessions = settings?.maxSessions || 5;
  const active = await RefreshToken.find({ userId: user.id, revokedAt: null, expiresAt: { $gt: new Date() } }).sort({ createdAt: 1 });
  if (active.length >= maxSessions) {
    const overflow = active.slice(0, active.length - maxSessions + 1);
    await RefreshToken.updateMany({ id: { $in: overflow.map((token) => token.id) } }, { revokedAt: new Date() });
  }
  const refreshToken = signRefresh(user.id);
  await RefreshToken.create({
    id: nid(),
    userId: user.id,
    tokenHash: sha256(refreshToken),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });
  return { accessToken: signAccess(user), refreshToken };
}

authRouter.get(
  "/catalogue",
  wrap(async (_req, res) => {
    const exams = await Exam.find({ lifecycle: "published" }).select("id name authority").lean();
    res.json({ data: exams.map((exam) => ({ id: exam.id, name: exam.name, authority: exam.authority })) });
  }),
);

authRouter.post(
  "/register",
  wrap(async (req, res) => {
    const body = registerSchema.parse(req.body);
    const email = body.email.toLowerCase();
    const existing = await User.findOne({ email }).lean();
    if (existing) throw new HttpError(409, "An account with this email already exists", "EMAIL_IN_USE");
    const user = await User.create({
      id: nid(),
      email,
      passwordHash: await argon2.hash(body.password),
      role: "student",
      firstName: body.firstName,
      lastName: body.lastName,
    });
    const tokens = await issueSession(user);
    const fresh = await User.findOne({ id: user.id }).lean();
    res.status(201).json({ data: { user: publicUser(fresh as never), ...tokens } });
  }),
);

authRouter.post(
  "/login",
  wrap(async (req, res) => {
    const body = loginSchema.parse(req.body);
    const user = await User.findOne({ email: body.email.toLowerCase() }).select("+passwordHash");
    if (!user || user.status === "suspended") throw new HttpError(401, "Email or password is incorrect", "INVALID_CREDENTIALS");
    const ok = await argon2.verify(user.passwordHash, body.password);
    if (!ok) throw new HttpError(401, "Email or password is incorrect", "INVALID_CREDENTIALS");
    const today = dayKey();
    if (user.lastActiveDate !== today) {
      const yesterday = dayKey(new Date(Date.now() - 24 * 60 * 60 * 1000));
      user.streak = user.lastActiveDate === yesterday ? user.streak + 1 : 1;
      user.lastActiveDate = today;
      await user.save();
    }
    const tokens = await issueSession(user);
    const fresh = await User.findOne({ id: user.id }).lean();
    res.json({ data: { user: publicUser(fresh as never), ...tokens } });
  }),
);

authRouter.post(
  "/refresh",
  wrap(async (req, res) => {
    const token = z.object({ refreshToken: z.string().min(10) }).parse(req.body).refreshToken;
    let payload: { sub: string; typ?: string };
    try {
      payload = jwt.verify(token, config.jwtRefreshSecret) as { sub: string; typ?: string };
    } catch {
      throw new HttpError(401, "Refresh token is invalid", "UNAUTHORIZED");
    }
    if (payload.typ !== "refresh") throw new HttpError(401, "Refresh token is invalid", "UNAUTHORIZED");
    const stored = await RefreshToken.findOne({ tokenHash: sha256(token), userId: payload.sub });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new HttpError(401, "Refresh token is revoked or expired", "UNAUTHORIZED");
    }
    stored.revokedAt = new Date();
    await stored.save();
    const user = await User.findOne({ id: payload.sub }).lean();
    if (!user || user.status === "suspended") throw new HttpError(401, "Account is not available", "UNAUTHORIZED");
    const tokens = await issueSession(user);
    res.json({ data: tokens });
  }),
);

authRouter.post(
  "/logout",
  wrap(async (req, res) => {
    const token = z.object({ refreshToken: z.string().min(10) }).parse(req.body).refreshToken;
    await RefreshToken.updateOne({ tokenHash: sha256(token) }, { revokedAt: new Date() });
    res.json({ data: { loggedOut: true } });
  }),
);

authRouter.post(
  "/logout-all",
  wrap(async (req, res) => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw new HttpError(401, "Authentication required", "UNAUTHORIZED");
    const payload = jwt.verify(header.slice(7), config.jwtAccessSecret) as { sub: string };
    await RefreshToken.updateMany({ userId: payload.sub, revokedAt: null }, { revokedAt: new Date() });
    await audit(payload.sub, "logout_all", "session", payload.sub);
    res.json({ data: { loggedOut: true } });
  }),
);
