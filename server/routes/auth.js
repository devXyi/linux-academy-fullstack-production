import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "../db.js";
import { config } from "../config.js";
import { authRequired } from "../middleware/auth.js";
import { authLimiter, loginAccountLimiter } from "../middleware/rateLimiters.js";
import { isValidEmail, isValidPassword, isValidName } from "../utils/validate.js";
import { safeIcon } from "../utils/icons.js";
import { createSession, rotateSession, revokeSession, pruneExpiredSessions } from "../sessionStore.js";
import { clearRefreshCookie, getRefreshCookie, setRefreshCookie } from "../utils/authCookie.js";

export const authRouter = Router();

function signAccessToken(user) {
  return jwt.sign({ id: user.id, name: user.name, email: user.email }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn
  });
}

function issueSession(res, req, user) {
  const refreshToken = createSession(user.id, req);
  setRefreshCookie(res, refreshToken, config.refreshTokenDays * 24 * 60 * 60);
  return signAccessToken(user);
}

const DUMMY_HASH = bcrypt.hashSync("no-such-account-timing-guard", config.bcryptRounds);

function isUniqueConstraintError(err) {
  return typeof err?.code === "string" && err.code.startsWith("SQLITE_CONSTRAINT");
}

authRouter.post("/auth/register", authLimiter, (req, res) => {
  const { name, email, password } = req.body || {};
  if (!isValidName(name) || !isValidEmail(email) || !isValidPassword(password)) {
    return res.status(400).json({ error: "Name, a valid email, and a 6-72 character password are required" });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const trimmedName = name.trim();
  try {
    const hash = bcrypt.hashSync(password, config.bcryptRounds);
    const result = db.prepare("INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)").run(trimmedName, normalizedEmail, hash);
    const user = { id: result.lastInsertRowid, name: trimmedName, email: normalizedEmail };
    const token = issueSession(res, req, user);
    pruneExpiredSessions();
    res.json({ token, user });
  } catch (err) {
    if (isUniqueConstraintError(err)) return res.status(409).json({ error: "An account with that email already exists" });
    throw err;
  }
});

authRouter.post("/auth/login", authLimiter, loginAccountLimiter, (req, res) => {
  const { email, password } = req.body || {};
  const normalizedEmail = typeof email === "string" ? email.toLowerCase().trim() : "";
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(normalizedEmail);
  const hashToCheck = user ? user.password_hash : DUMMY_HASH;
  const passwordOk = bcrypt.compareSync(typeof password === "string" ? password : "", hashToCheck);

  if (!user || !passwordOk) return res.status(401).json({ error: "Invalid email or password" });

  const token = issueSession(res, req, user);
  pruneExpiredSessions();
  res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
});

// Exchanges the persistent HttpOnly device cookie for a short-lived access JWT.
// The refresh token is rotated on every successful refresh so a stolen token
// cannot be reused indefinitely.
authRouter.post("/auth/refresh", (req, res) => {
  const current = getRefreshCookie(req);
  const rotated = rotateSession(current, req);
  if (!rotated) {
    clearRefreshCookie(res);
    return res.status(401).json({ error: "Session expired. Please log in again." });
  }

  const user = db.prepare("SELECT id, name, email FROM users WHERE id = ?").get(rotated.userId);
  if (!user) {
    clearRefreshCookie(res);
    return res.status(401).json({ error: "Account no longer exists" });
  }

  setRefreshCookie(res, rotated.token, config.refreshTokenDays * 24 * 60 * 60);
  pruneExpiredSessions();
  res.json({ token: signAccessToken(user), user });
});

authRouter.post("/auth/logout", (req, res) => {
  revokeSession(getRefreshCookie(req));
  clearRefreshCookie(res);
  res.status(204).end();
});

authRouter.get("/me", authRequired, (req, res) => {
  const user = db.prepare("SELECT id, name, email, created_at FROM users WHERE id = ?").get(req.user.id);
  if (!user) return res.status(401).json({ error: "Account no longer exists" });

  const enrolled = db.prepare(`
    SELECT c.id, c.code, c.title, c.slug, c.description, c.level, c.duration, c.icon
    FROM courses c JOIN enrollments e ON e.course_id = c.id
    WHERE e.user_id = ? ORDER BY e.created_at DESC
  `).all(req.user.id).map((c) => ({ ...c, icon: safeIcon(c.icon) }));

  const certificates = db.prepare(`
    SELECT cert.id, cert.issued_at, c.title AS course_title, c.slug AS course_slug
    FROM certificates cert JOIN courses c ON c.id = cert.course_id
    WHERE cert.user_id = ? ORDER BY cert.issued_at DESC
  `).all(req.user.id).map((c) => ({ id: c.id, issuedAt: c.issued_at, courseTitle: c.course_title, courseSlug: c.course_slug }));

  res.json({ user, enrolled, certificates });
});
