import crypto from "node:crypto";
import nodemailer from "nodemailer";
import QRCode from "qrcode";
import { generateSecret, generateURI, verify } from "otplib";
import { usersDb } from "./users-db.js";

const challengeLifetimeMs = 10 * 60 * 1000;
const emailCodeLifetimeMs = 5 * 60 * 1000;
const challenges = new Map();
const registrationChallenges = new Map();

const findUserTwoFactor = usersDb.prepare("SELECT id, email, username, full_name, student_code, two_factor_secret, two_factor_enabled FROM users WHERE id = ?");
const saveUserTwoFactor = usersDb.prepare("UPDATE users SET two_factor_secret = ?, two_factor_enabled = 1 WHERE id = ?");

function getTransport() {
  if (!process.env.SMTP_PASSWORD) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT || 465),
    secure: (process.env.SMTP_SECURE || "true") === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });
}

export function createTwoFactorSetup(user) {
  const secret = generateSecret();
  const uri = generateURI({ issuer: process.env.TWO_FACTOR_ISSUER || "Classmate Connect", label: user.email, secret });
  return { secret, uri };
}

export async function createQrCode(uri) {
  return QRCode.toDataURL(uri, { width: 240, margin: 1 });
}

export function enableUserTwoFactor(userId, secret, code) {
  return verify({ token: code, secret }).then((result) => {
    if (!result.valid) return false;
    saveUserTwoFactor.run(secret, userId);
    return true;
  });
}

export function getUserTwoFactor(userId) {
  return findUserTwoFactor.get(userId) || null;
}

export function createLoginChallenge(user) {
  const token = crypto.randomBytes(32).toString("base64url");
  challenges.set(token, {
    userId: user.id,
    email: user.email,
    secret: user.two_factor_secret,
    expiresAt: Date.now() + challengeLifetimeMs,
    attempts: 0,
  });
  return token;
}

function getChallenge(token) {
  const challenge = challenges.get(token);
  if (!challenge || challenge.expiresAt < Date.now()) {
    challenges.delete(token);
    return null;
  }
  return challenge;
}

export async function sendEmailCode(token) {
  const challenge = getChallenge(token);
  const transport = getTransport();
  if (!challenge || !transport || !process.env.SMTP_USER) return false;

  const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  challenge.emailCode = code;
  challenge.emailCodeExpiresAt = Date.now() + emailCodeLifetimeMs;
  await transport.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: challenge.email,
    subject: "Your Classmate Connect verification code",
    text: `Your verification code is ${code}. It expires in 5 minutes.`,
  });
  return true;
}

export async function createRegistrationChallenge(registration) {
  const token = crypto.randomBytes(32).toString("base64url");
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  registrationChallenges.set(token, {
    registration,
    code,
    expiresAt: Date.now() + emailCodeLifetimeMs,
    attempts: 0,
  });

  const transport = getTransport();
  if (!transport || !process.env.SMTP_USER) {
    registrationChallenges.delete(token);
    return null;
  }

  await transport.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: registration.email,
    subject: "Verify your Classmate Connect email",
    text: `Your verification code is ${code}. It expires in 5 minutes.`,
  });
  return token;
}

export function verifyRegistrationChallenge(token, code) {
  const challenge = registrationChallenges.get(token);
  if (!challenge || challenge.expiresAt < Date.now()) {
    registrationChallenges.delete(token);
    return null;
  }
  challenge.attempts += 1;
  if (challenge.attempts > 5 || challenge.code !== code) {
    if (challenge.attempts > 5) registrationChallenges.delete(token);
    return null;
  }
  registrationChallenges.delete(token);
  return challenge.registration;
}

export async function verifyLoginChallenge(token, method, code) {
  const challenge = getChallenge(token);
  if (!challenge) return null;
  challenge.attempts += 1;
  if (challenge.attempts > 5) {
    challenges.delete(token);
    return null;
  }

  let valid = false;
  if (method === "totp" && challenge.secret) {
    valid = (await verify({ token: code, secret: challenge.secret })).valid;
  }
  if (method === "email") {
    valid = challenge.emailCode === code && challenge.emailCodeExpiresAt > Date.now();
  }
  if (!valid) return null;

  challenges.delete(token);
  return getUserTwoFactor(challenge.userId);
}
