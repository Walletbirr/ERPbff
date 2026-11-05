const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const config = require("../config");

/**
 * Session store: sessionId -> { uid, name, login, odooApiKey, expiresAt }
 *
 * Sessions now SURVIVE a BFF restart / redeploy, so managers stay signed
 * in. They are kept in memory as before and also saved to a file
 * (SESSION_STORE, default data/sessions.json; the data/ folder is not in
 * git). The file is ENCRYPTED (AES-256-GCM) with a key derived from
 * JWT_SECRET (or SESSION_STORE_KEY if set): the Odoo API keys inside are
 * never written in clear and never leave the server. Changing JWT_SECRET
 * makes the old file unreadable, which simply signs everyone out (their
 * tokens are invalid then anyway).
 *
 * SESSION_PERSIST=false turns the file off (old in-memory behaviour).
 * Routes / controllers only use the functions exported below.
 */

const PERSIST =
  String(process.env.SESSION_PERSIST || "true").toLowerCase() !== "false";
const storePath = path.resolve(
  process.env.SESSION_STORE || "data/sessions.json",
);
const key = crypto
  .createHash("sha256")
  .update(
    `${process.env.SESSION_STORE_KEY || config.jwt.secret}|bh-session-store`,
  )
  .digest();

const sessions = new Map();

function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return JSON.stringify({
    v: 1,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  });
}

function decrypt(raw) {
  const box = JSON.parse(raw);
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(box.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(box.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(box.data, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

function load() {
  if (!PERSIST) return;
  try {
    const entries = JSON.parse(decrypt(fs.readFileSync(storePath, "utf8")));
    const now = Date.now();
    for (const [id, session] of entries) {
      if (session && session.expiresAt > now) sessions.set(id, session);
    }
  } catch (err) {
    if (err.code !== "ENOENT") {
      // eslint-disable-next-line no-console
      console.error(
        "sessions: could not read the saved sessions, starting empty.",
      );
    }
  }
}

let saveTimer = null;
function save() {
  if (!PERSIST || saveTimer) return;
  // Several sign-ins / sign-outs close together are written once.
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.mkdirSync(path.dirname(storePath), { recursive: true });
      const tmp = `${storePath}.tmp`;
      fs.writeFileSync(tmp, encrypt(JSON.stringify([...sessions.entries()])), {
        mode: 0o600,
      });
      fs.renameSync(tmp, storePath); // atomic: never leaves a half-written file
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("sessions: could not save the sessions:", err.message);
    }
  }, 500);
  saveTimer.unref?.();
}

function createSession({ uid, name, login, odooApiKey }) {
  const sessionId = uuidv4();
  sessions.set(sessionId, {
    uid,
    name,
    login,
    odooApiKey,
    createdAt: Date.now(),
    expiresAt: Date.now() + config.sessionTtlMs,
  });
  save();
  return sessionId;
}

function getSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    sessions.delete(sessionId);
    save();
    return null;
  }
  return session;
}

function destroySession(sessionId) {
  if (sessions.delete(sessionId)) save();
}

function sessionCount() {
  return sessions.size;
}

// Periodic sweep so long-idle sessions don't sit in memory forever.
setInterval(
  () => {
    const now = Date.now();
    let changed = false;
    for (const [id, session] of sessions.entries()) {
      if (session.expiresAt < now) {
        sessions.delete(id);
        changed = true;
      }
    }
    if (changed) save();
  },
  15 * 60 * 1000,
).unref();

// Write pending changes before the process stops (nodemon / pm2 restart).
function flushNow() {
  if (!saveTimer) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  try {
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    fs.writeFileSync(
      storePath,
      encrypt(JSON.stringify([...sessions.entries()])),
      {
        mode: 0o600,
      },
    );
  } catch (err) {
    // Ignore: worst case those few managers sign in again.
  }
}
process.on("exit", flushNow);
for (const signal of ["SIGINT", "SIGTERM", "SIGUSR2"]) {
  process.once(signal, () => {
    flushNow();
    process.kill(process.pid, signal);
  });
}

load();

module.exports = { createSession, getSession, destroySession, sessionCount };
