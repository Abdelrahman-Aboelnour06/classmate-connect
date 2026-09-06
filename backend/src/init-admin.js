import "dotenv/config";
import bcrypt from "bcryptjs";
import { db } from "./db.js";

const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD || "adminpass";

if (!email) {
  console.error("Missing ADMIN_EMAIL in environment.");
  process.exit(1);
}

const hash = await bcrypt.hash(password, 12);

db.prepare(
  `INSERT INTO admins (email, password_hash)
   VALUES (?, ?)
   ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash`,
).run(email, hash);

console.log(`Admin user ready: ${email}`);
