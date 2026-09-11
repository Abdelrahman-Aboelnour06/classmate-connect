// backend/auth.js
// Authentication disabled — single local user mode.
// Every middleware is a pass-through. A synthetic "local" user is attached
// to req.user so the rest of the API keeps working unchanged.

const isProduction = process.env.NODE_ENV === "production";

const sessionCookieName = isProduction ? "__Host-user_session" : "user_session";
const adminCookieName = isProduction ? "__Host-admin_session" : "admin_session";

const LOCAL_USER = Object.freeze({
  id: 0,
  email: process.env.ADMIN_EMAIL || "local@localhost",
  username: "local",
  full_name: "Local User",
  student_code: "",
  role: "admin",
});

// Legacy stubs so any leftover import doesn't crash.
export function signAdminToken() {
  return "local";
}

export function setUserSessionCookie() {}
export function clearUserSessionCookie() {}
export function setAdminSessionCookie() {}
export function clearAdminSessionCookie() {}

export function createCsrfToken() {
  return "local";
}

export function csrfProtection(_req, _res, next) {
  next();
}

export function requireAdmin(req, _res, next) {
  req.user = LOCAL_USER;
  next();
}

export function requireUser(req, _res, next) {
  req.user = LOCAL_USER;
  next();
}

export { sessionCookieName };