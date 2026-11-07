import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "./config.js";
import { HttpError } from "./http.js";
import { AuditLog, User } from "./models.js";
import { nid } from "./http.js";

export interface AuthUser {
  id: string;
  email: string;
  role: "student" | "admin" | "reviewer";
  firstName: string;
  lastName: string;
  status: string;
  language: string;
  onboardingComplete: boolean;
  primaryExamId: string;
  examIds: string[];
  aiMemoryEnabled: boolean;
  preferences: { carryForward: boolean; notifications: boolean; appLanguage?: "ta" | "en" };
  streak: number;
  lastActiveDate: string;
  phone: string;
  education: Array<{ level?: string; institution?: string; year?: string }>;
  examHistory: Array<{ examName?: string; year?: string; result?: string }>;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      requestId?: string;
    }
  }
}

export function signAccess(user: { id: string; role: string }) {
  return jwt.sign({ sub: user.id, role: user.role }, config.jwtAccessSecret, { expiresIn: "15m" });
}

export function signRefresh(userId: string) {
  return jwt.sign({ sub: userId, typ: "refresh" }, config.jwtRefreshSecret, { expiresIn: "30d" });
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw new HttpError(401, "Authentication required", "UNAUTHORIZED");
    const payload = jwt.verify(header.slice(7), config.jwtAccessSecret) as { sub: string; role: string };
    const user = await User.findOne({ id: payload.sub }).lean();
    if (!user || user.status === "suspended") throw new HttpError(401, "Account is not available", "UNAUTHORIZED");
    req.user = user as unknown as AuthUser;
    next();
  } catch (error) {
    if (error instanceof HttpError) return next(error);
    next(new HttpError(401, "Invalid or expired access token", "UNAUTHORIZED"));
  }
}

export function requireRole(...roles: Array<AuthUser["role"]>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new HttpError(403, "You do not have permission for this action", "FORBIDDEN"));
    }
    next();
  };
}

export async function audit(actorId: string, action: string, entity: string, entityId = "", meta: Record<string, unknown> = {}) {
  await AuditLog.create({ id: nid(), actorId, action, entity, entityId, meta });
}

export function publicUser(user: AuthUser) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    language: user.language,
    status: user.status,
    onboardingComplete: user.onboardingComplete,
    education: user.education,
    examHistory: user.examHistory,
    preferences: user.preferences,
    aiMemoryEnabled: user.aiMemoryEnabled,
    primaryExamId: user.primaryExamId,
    examIds: user.examIds,
    streak: user.streak,
    lastActiveDate: user.lastActiveDate,
  };
}
