const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email) {
  return typeof email === "string" && email.length <= 254 && EMAIL_RE.test(email);
}

// bcrypt (and bcryptjs) silently truncate input beyond 72 bytes, so capping
// here avoids a password that "works" at registration but behaves oddly if
// the truncation boundary ever shifts (e.g. a future bcrypt implementation
// swap). 6 chars is the original minimum; kept as-is rather than inventing a
// new complexity policy nobody asked for.
export function isValidPassword(password) {
  return typeof password === "string" && password.length >= 6 && password.length <= 72;
}

export function isValidName(name) {
  return typeof name === "string" && name.trim().length >= 1 && name.trim().length <= 100;
}

export function toPositiveInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}
