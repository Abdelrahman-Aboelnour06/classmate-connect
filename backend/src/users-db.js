import Database from "better-sqlite3";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const dbPath = process.env.USERS_DB_PATH || path.join(process.cwd(), "backend", "data", "users.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const usersDb = new Database(dbPath);
usersDb.pragma("foreign_keys = ON");
usersDb.pragma("journal_mode = WAL");
usersDb.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    username TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL DEFAULT '',
    student_code TEXT NOT NULL DEFAULT '',
    two_factor_secret TEXT,
    two_factor_enabled INTEGER NOT NULL DEFAULT 0,
    password_hash TEXT NOT NULL,
    terms_accepted_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS user_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_user_sessions_token_hash ON user_sessions(token_hash);
  CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);
`);

for (const column of [
  "ALTER TABLE users ADD COLUMN full_name TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE users ADD COLUMN student_code TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE users ADD COLUMN two_factor_secret TEXT",
  "ALTER TABLE users ADD COLUMN two_factor_enabled INTEGER NOT NULL DEFAULT 0",
]) {
  try {
    usersDb.exec(column);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("duplicate column name")) throw error;
  }
}

const insertSession = usersDb.prepare(`
  INSERT INTO user_sessions (user_id, token_hash, expires_at)
  VALUES (?, ?, ?)
`);
const findSession = usersDb.prepare(`
  SELECT u.id, u.email, u.username, u.full_name, u.student_code
  FROM user_sessions s
  JOIN users u ON u.id = s.user_id
  WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP
`);
const deleteUserSessions = usersDb.prepare("DELETE FROM user_sessions WHERE user_id = ?");
const deleteSession = usersDb.prepare("DELETE FROM user_sessions WHERE token_hash = ?");

function hashSessionToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function createUserSession(userId, maxAgeMs = 12 * 60 * 60 * 1000) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + maxAgeMs).toISOString();
  deleteUserSessions.run(userId);
  insertSession.run(userId, hashSessionToken(token), expiresAt);
  return { token, expiresAt };
}

export function findUserBySession(token) {
  if (!token) return null;
  return findSession.get(hashSessionToken(token)) || null;
}

export function deleteUserSession(token) {
  if (token) deleteSession.run(hashSessionToken(token));
}

export function purgeExpiredSessions() {
  usersDb.prepare("DELETE FROM user_sessions WHERE expires_at <= CURRENT_TIMESTAMP").run();
}

export { hashSessionToken };
