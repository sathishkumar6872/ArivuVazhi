import crypto from "node:crypto";
import dotenv from "dotenv";

dotenv.config();

const isProd = process.env.NODE_ENV === "production";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

function encryptionKey(): Buffer {
  if (process.env.ENCRYPTION_KEY) {
    const key = Buffer.from(process.env.ENCRYPTION_KEY, "base64");
    if (key.length !== 32) throw new Error("ENCRYPTION_KEY must be 32 bytes, base64 encoded");
    return key;
  }
  if (isProd) throw new Error("ENCRYPTION_KEY is required in production");
  // Stable local key derived from JWT secret so ChatGPT tokens can be encrypted without a new env var.
  return crypto.createHash("sha256").update(`arivuvazhi:${required("JWT_ACCESS_SECRET")}`).digest();
}

const DEMO_ADMIN_PASSWORD = "Admin@12345";
const DEMO_STUDENT_PASSWORD = "Student@12345";

const adminEmail = isProd ? required("ADMIN_EMAIL") : process.env.ADMIN_EMAIL || "admin@arivuvazhi.in";
const adminPassword = isProd ? required("ADMIN_PASSWORD") : process.env.ADMIN_PASSWORD || DEMO_ADMIN_PASSWORD;
const studentEmail = isProd ? process.env.STUDENT_EMAIL || "" : process.env.STUDENT_EMAIL || "anitha@arivuvazhi.in";
const studentPassword = isProd ? process.env.STUDENT_PASSWORD || "" : process.env.STUDENT_PASSWORD || DEMO_STUDENT_PASSWORD;

if (isProd) {
  if (adminPassword.length < 12) throw new Error("ADMIN_PASSWORD must be at least 12 characters in production");
  if (adminPassword === DEMO_ADMIN_PASSWORD) throw new Error("Refuse production boot with default ADMIN_PASSWORD");
  if ((process.env.JWT_ACCESS_SECRET || "").length < 32) throw new Error("JWT_ACCESS_SECRET must be at least 32 characters in production");
  if ((process.env.JWT_REFRESH_SECRET || "").length < 32) throw new Error("JWT_REFRESH_SECRET must be at least 32 characters in production");
}

export const config = {
  isProd,
  port: Number(process.env.PORT || 4000),
  mongoUri: required("MONGODB_URI"),
  jwtAccessSecret: required("JWT_ACCESS_SECRET"),
  jwtRefreshSecret: required("JWT_REFRESH_SECRET"),
  encryptionKey: encryptionKey(),
  corsOrigins: (process.env.CORS_ORIGINS || "http://localhost:3000,http://localhost:3001")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
  adminPortalUrl:
    process.env.ADMIN_PORTAL_URL ||
    (process.env.CORS_ORIGINS || "http://localhost:3000,http://localhost:3001")
      .split(",")
      .map((item) => item.trim())
      .find((origin) => origin.includes("3001")) ||
    "http://localhost:3001",
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  openaiModel: process.env.OPENAI_MODEL || "gpt-5-mini",
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  geminiModel: process.env.GEMINI_MODEL || "auto",
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434",
  adminEmail,
  adminPassword,
  studentEmail,
  studentPassword,
  allowDemoSeed: process.env.ALLOW_DEMO_SEED === "true",
  demoAdminPassword: DEMO_ADMIN_PASSWORD,
  demoStudentPassword: DEMO_STUDENT_PASSWORD,
};
