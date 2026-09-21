import rateLimit from "express-rate-limit";
import { config } from "../config.js";

export const apiLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  limit: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please slow down and try again shortly." }
});

// Tighter bound on register/login to slow down credential stuffing and
// brute-force guessing. Successful requests don't count against the limit,
// so legitimate users who eventually get their password right aren't
// penalized for a couple of typos.
export const authLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  limit: config.rateLimit.authMax,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: "Too many attempts. Please try again later." }
});

// Keyed by the targeted account (email), not the caller's IP — this is what
// catches credential stuffing spread across many source IPs against one
// account, which a purely IP-based limiter never will. Falls back to IP only
// for the edge case where no email was sent at all (which login rejects on
// its own regardless).
export const loginAccountLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  limit: config.rateLimit.loginAccountMax,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const email = typeof req.body?.email === "string" ? req.body.email.toLowerCase().trim() : "";
    return email || req.ip;
  },
  message: { error: "Too many attempts on this account. Please try again later." }
});

// Authenticated in-app lab (course lessons' "Open lab"). Keyed by user id
// when available so it follows the account rather than a shared/rotating IP.
export const labLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  limit: config.rateLimit.labMax,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user?.id ? `user:${req.user.id}` : req.ip),
  message: { error: "Too many lab commands. Please slow down." }
});

// Unauthenticated homepage demo terminal — IP-keyed, much tighter.
export const labDemoLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  limit: config.rateLimit.labDemoMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Log in to use the full lab." }
});

