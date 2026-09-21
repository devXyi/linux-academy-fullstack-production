import crypto from "node:crypto";
import { db } from "./db.js";
import { config } from "./config.js";

// Persistent refresh sessions are stored as hashes, never as bearer secrets.
db.exec(`
  CREATE TABLE IF NOT EXISTS auth_sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT UNIQUE NOT NULL,
    user_agent TEXT,
    ip_address TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_used_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT NOT NULL,
    revoked_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiry ON auth_sessions(expires_at);
`);

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function newOpaqueToken() {
  return crypto.randomBytes(48).toString("base64url");
}

function expiryIso() {
  return new Date(Date.now() + config.refreshTokenDays * 24 * 60 * 60 * 1000).toISOString();
}

export function createSession(userId, req) {
  const token = newOpaqueToken();
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO auth_sessions (id, user_id, token_hash, user_agent, ip_address, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, userId, hashToken(token), String(req.get("user-agent") || "").slice(0, 512), String(req.ip || "").slice(0, 64), expiryIso());
  return token;
}

export function rotateSession(token, req) {
  if (!token) return null;
  const current = db.prepare(`
    SELECT * FROM auth_sessions
    WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP
  `).get(hashToken(token));
  if (!current) return null;

  const nextToken = newOpaqueToken();
  const nextHash = hashToken(nextToken);
  const nextId = crypto.randomUUID();
  const nextExpiry = expiryIso();

  db.transaction(() => {
    db.prepare("UPDATE auth_sessions SET revoked_at = CURRENT_TIMESTAMP, last_used_at = CURRENT_TIMESTAMP WHERE id = ?").run(current.id);
    db.prepare(`
      INSERT INTO auth_sessions (id, user_id, token_hash, user_agent, ip_address, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(nextId, current.user_id, nextHash, String(req.get("user-agent") || "").slice(0, 512), String(req.ip || "").slice(0, 64), nextExpiry);
  })();

  return { token: nextToken, userId: current.user_id };
}

export function revokeSession(token) {
  if (!token) return;
  db.prepare("UPDATE auth_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE token_hash = ? AND revoked_at IS NULL").run(hashToken(token));
}

export function revokeAllSessions(userId) {
  db.prepare("UPDATE auth_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = ? AND revoked_at IS NULL").run(userId);
}

// Keep the session table bounded without a background worker.
export function pruneExpiredSessions() {
  db.prepare("DELETE FROM auth_sessions WHERE expires_at <= CURRENT_TIMESTAMP OR revoked_at IS NOT NULL AND revoked_at <= datetime('now', '-30 days')").run();
}
