import fs from "node:fs";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-only-secret-do-not-use-in-production";
process.env.DB_PATH = process.env.DB_PATH || "./data/test.db";
process.env.PORT = process.env.PORT || "0";
process.env.BCRYPT_ROUNDS = process.env.BCRYPT_ROUNDS || "4"; // low cost: faster test runs only

// Low thresholds so rate-limit tests can actually trip the limit in a
// handful of requests instead of hundreds. Production defaults are much
// higher — see .env.example.
process.env.LOGIN_ACCOUNT_RATE_LIMIT_MAX = process.env.LOGIN_ACCOUNT_RATE_LIMIT_MAX || "5";
process.env.LAB_RATE_LIMIT_MAX = process.env.LAB_RATE_LIMIT_MAX || "8";
process.env.LAB_DEMO_RATE_LIMIT_MAX = process.env.LAB_DEMO_RATE_LIMIT_MAX || "5";
// The general IP-based auth limiter stays high in tests: the functional
// suite alone makes a dozen-plus register/login calls in a single process,
// and the account-based limiter above is what the security tests actually
// exercise — this one is just a safety margin against unrelated failures.
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX || "200";

// Start every test run from a clean database.
for (const suffix of ["", "-wal", "-shm", "-journal"]) {
  try {
    fs.unlinkSync(process.env.DB_PATH + suffix);
  } catch {
    // File doesn't exist yet — nothing to clean up.
  }
}
