import "dotenv/config";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");

const NODE_ENV = process.env.NODE_ENV || "development";
const isProduction = NODE_ENV === "production";

/**
 * Reads a required env var. In production, a missing value throws (fail fast
 * on boot rather than limping along with an insecure default). In
 * development, falls back so `npm run dev` works with zero setup.
 */
function requireInProduction(name, devFallback) {
  const value = process.env[name];
  if (value && value.trim()) return value.trim();
  if (isProduction) {
    throw new Error(
      `Missing required environment variable: ${name}. Set it (see .env.example) before starting in production.`
    );
  }
  return devFallback;
}

const jwtSecret = requireInProduction("JWT_SECRET", crypto.randomBytes(32).toString("hex"));
if (!process.env.JWT_SECRET && !isProduction) {
  // eslint-disable-next-line no-console
  console.warn(
    "[config] JWT_SECRET not set — using a random secret for this process only. " +
      "Every restart will invalidate existing sessions. Set JWT_SECRET in .env to avoid that."
  );
}

function parseTrustProxy(raw) {
  if (raw === undefined || raw === "") return false;
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (/^\d+$/.test(raw)) return parseInt(raw, 10);
  return raw; // e.g. "loopback", "uniquelocal", or a specific IP/CIDR
}

export const config = {
  nodeEnv: NODE_ENV,
  isProduction,
  port: parseInt(process.env.PORT, 10) || 3000,
  host: process.env.HOST || "0.0.0.0",

  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS, 10) || 12,

  dbPath: process.env.DB_PATH
    ? path.resolve(rootDir, process.env.DB_PATH)
    : path.join(rootDir, "data", "academy.db"),

  // Unset = same-origin monolith (default). Set only if the frontend is
  // served from a different origin than this API.
  corsOrigin: process.env.CORS_ORIGIN || null,

  // The externally-visible base URL, used to build absolute links that leave
  // this server — currently just the certificate verification URL. The app
  // can't reliably infer this itself (it may be behind a proxy, TLS
  // termination, or a custom domain), so it has to be told explicitly, and
  // production refuses to boot without it — shipping certificates with a
  // localhost verification link would be a real, silent bug.
  publicBaseUrl: requireInProduction(
    "PUBLIC_BASE_URL",
    `http://localhost:${parseInt(process.env.PORT, 10) || 3000}`
  ).replace(/\/$/, ""),

  // Safe default is "don't trust any proxy". Set TRUST_PROXY=1 when this app
  // sits behind exactly one reverse proxy (the bundled nginx/Docker setup).
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 300,
    authMax: parseInt(process.env.AUTH_RATE_LIMIT_MAX, 10) || 20,
    // A single account being hammered across many IPs — IP-based limiting
    // alone wouldn't catch this. Same window as authMax by default.
    loginAccountMax: parseInt(process.env.LOGIN_ACCOUNT_RATE_LIMIT_MAX, 10) || 10,
    // Authenticated in-app lab. Generous — this is a real feature people use
    // a lot while working through a course, not just an auth endpoint.
    labMax: parseInt(process.env.LAB_RATE_LIMIT_MAX, 10) || 120,
    // Unauthenticated homepage demo terminal. Tight — it exists to give
    // anonymous visitors a taste, not to be a free public API.
    labDemoMax: parseInt(process.env.LAB_DEMO_RATE_LIMIT_MAX, 10) || 30
  },

  rootDir,
  publicDir: path.join(rootDir, "public")
};
