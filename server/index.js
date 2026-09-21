import express from "express";
import path from "node:path";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import pinoHttp from "pino-http";

import { config } from "./config.js";
import { logger } from "./logger.js";
import { db } from "./db.js";
import { apiLimiter } from "./middleware/rateLimiters.js";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler.js";

import { healthRouter } from "./routes/health.js";
import { coursesRouter } from "./routes/courses.js";
import { authRouter } from "./routes/auth.js";
import { enrollmentsRouter } from "./routes/enrollments.js";
import { progressRouter } from "./routes/progress.js";
import { quizzesRouter } from "./routes/quizzes.js";
import { certificatesRouter } from "./routes/certificates.js";
import { labRouter } from "./routes/lab.js";

export const app = express();

// Only meaningful once TRUST_PROXY is set for your actual topology (see
// .env.example) — it controls how req.ip and rate limiting interpret
// X-Forwarded-For.
app.set("trust proxy", config.trustProxy);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        // Inline style="" attributes remain in the markup (not a script
        // injection vector), so style-src keeps 'unsafe-inline' rather than
        // forcing a full CSS-class rewrite of the original design.
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"]
      }
    }
  })
);

if (config.corsOrigin) {
  app.use(cors({ origin: config.corsOrigin, credentials: true }));
}

app.use(compression());
app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === "/healthz" } }));

// Health check first: no rate limit, no JSON body parsing needed for a GET.
app.use(healthRouter);

app.use(
  express.static(config.publicDir, {
    maxAge: config.isProduction ? "1h" : 0,
    extensions: ["html"]
  })
);

app.use(express.json({ limit: "100kb" }));

app.use("/api", apiLimiter);
app.use("/api", coursesRouter);
app.use("/api", authRouter);
app.use("/api", enrollmentsRouter);
app.use("/api", progressRouter);
app.use("/api", quizzesRouter);
app.use("/api", certificatesRouter);
app.use("/api", labRouter);
app.use("/api", notFoundHandler);

// SPA fallback for every other GET route. A RegExp route (rather than the
// "*" string wildcard) sidesteps Express's path-to-regexp wildcard syntax
// entirely and lets it precisely exclude /api/*.
app.get(/^\/(?!api\/).*/, (req, res) => {
  res.sendFile(path.join(config.publicDir, "index.html"));
});

app.use(errorHandler);

/* c8 ignore start -- exercised via a running process, not unit tests */
if (process.env.NODE_ENV !== "test") {
  const server = app.listen(config.port, config.host, () => {
    logger.info(`Linux Academy listening on http://${config.host}:${config.port} (${config.nodeEnv})`);
  });

  const shutdown = (signal) => {
    logger.info({ signal }, "Shutting down");
    server.close(() => {
      db.close();
      process.exit(0);
    });
    // Don't hang forever waiting for in-flight requests to drain.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("unhandledRejection", (reason) => {
    logger.error({ reason }, "Unhandled promise rejection");
  });
  process.on("uncaughtException", (err) => {
    logger.fatal({ err }, "Uncaught exception — exiting");
    process.exit(1);
  });
}
/* c8 ignore stop */

export default app;
