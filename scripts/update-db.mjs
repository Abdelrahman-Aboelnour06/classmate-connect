import process from "node:process";

const apiBase = process.env.API_BASE_URL || "http://localhost:4000";
const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD || "adminpass";

if (!email) {
  console.error("Set ADMIN_EMAIL before running this script.");
  process.exit(1);
}

const loginRes = await fetch(`${apiBase}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email, password }),
});

if (!loginRes.ok) {
  const text = await loginRes.text();
  console.error("Login failed:", text);
  process.exit(1);
}

const loginData = await loginRes.json();

const updateRes = await fetch(`${apiBase}/api/update`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    authorization: `Bearer ${loginData.token}`,
  },
});

const payload = await updateRes.json();
console.log(JSON.stringify(payload, null, 2));
if (!updateRes.ok) process.exit(1);
