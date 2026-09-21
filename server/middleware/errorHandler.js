import { logger } from "../logger.js";

export function notFoundHandler(req, res) {
  res.status(404).json({ error: "Not found" });
}

// body-parser (express.json()) throws typed errors for malformed/oversized
// input. Give those a clean, specific message instead of leaking the raw
// parser error text ("Unexpected token < in JSON at position 0", etc.).
const BODY_PARSER_MESSAGES = {
  "entity.parse.failed": "Malformed JSON in request body",
  "entity.too.large": "Request body too large",
  "encoding.unsupported": "Unsupported request body encoding"
};

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  const isServerError = status >= 500;
  const bodyParserMessage = BODY_PARSER_MESSAGES[err.type];

  if (isServerError) {
    logger.error({ err, path: req.path, method: req.method }, "Unhandled error");
  } else {
    logger.warn({ msg: err.message, type: err.type, path: req.path, method: req.method }, "Request error");
  }

  const message = isServerError ? "Internal server error" : bodyParserMessage || err.message || "Request failed";
  res.status(status).json({ error: message });
}

export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

