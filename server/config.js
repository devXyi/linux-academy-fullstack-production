import "dotenv/config";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");

const NODE_ENV = process.env.NODE_ENV || "development";
const isProduction = NODE_ENV === "production";

function requireInProduction(name, devFallback) {
  const value = process.env[name];
  if (value && value.trim()) return value.trim();
  if (isProduction) throw new Error(`Missing required environment variable: ${name}. Set it (see .env.example) before starting in production.`);
  return devFallback;
}

const jwtSecret = requireInProduction("JWT_SECRET", crypto.randomBytes(32).toString("hex"));
if (!process.env.JWT_SECRET && !isProduction) {
  console.warn("[config] JWT_SECRET not set — using a random secret for this process only. Every restart will invalidate existing sessions. Set JWT_SECRET in .env to avoid that.");
}

function parseTrustProxy(raw) {
  if (raw === undefined || raw === "") return false;
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (/^\d+$/.test(raw)) return parseInt(raw, 10);
  return raw;
}

function parsePositiveInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

export const config = {
  nodeEnv: NODE_ENV,
  isProduction,
  port: parsePositiveInt("PORT", 3000),
  host: process.env.HOST || "0.0.0.0",
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "15m",
  refreshTokenDays: parsePositiveInt("REFRESH_TOKEN_DAYS", 30),
  bcryptRounds: parsePositiveInt("BCRYPT_ROUNDS", 12),
  dbPath: process.env.DB_PATH ? path.resolve(rootDir, process.env.DB_PATH) : path.join(rootDir, "data", "academy.db"),
  corsOrigin: process.env.CORS_ORIGIN || null,
  publicBaseUrl: requireInProduction("PUBLIC_BASE_URL", `http://localhost:${parseInt(process.env.PORT, 10) || 3000}`).replace(/\/$/, ""),
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  rateLimit: {
    windowMs: parsePositiveInt("RATE_LIMIT_WINDOW_MS", 15 * 60 * 1000),
    max: parsePositiveInt("RATE_LIMIT_MAX", 300),
    authMax: parsePositiveInt("AUTH_RATE_LIMIT_MAX", 20),
    loginAccountMax: parsePositiveInt("LOGIN_ACCOUNT_RATE_LIMIT_MAX", 10),
    labMax: parsePositiveInt("LAB_RATE_LIMIT_MAX", 120),
    labDemoMax: parsePositiveInt("LAB_DEMO_RATE_LIMIT_MAX", 30)
  },
  rootDir,
  publicDir: path.join(rootDir, "public")
};
