import crypto from "node:crypto";
import dotenv from "dotenv";

dotenv.config();

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
  // Stable local key derived from JWT secret so ChatGPT tokens can be encrypted without a new env var.
  return crypto.createHash("sha256").update(`arivuvazhi:${required("JWT_ACCESS_SECRET")}`).digest();
}

export const config = {
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
  adminEmail: process.env.ADMIN_EMAIL || "admin@arivuvazhi.in",
  adminPassword: process.env.ADMIN_PASSWORD || "Admin@12345",
  studentEmail: process.env.STUDENT_EMAIL || "anitha@arivuvazhi.in",
  studentPassword: process.env.STUDENT_PASSWORD || "Student@12345",
};
