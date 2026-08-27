const { v4: uuidv4 } = require('uuid');
const config = require('../config');

/**
 * In-memory session store: sessionId -> { uid, name, login, odooApiKey, expiresAt }
 *
 * Trade-off you chose: simplest possible setup, but every session is lost
 * on server restart/redeploy — the mobile app will just get a 401 and
 * bounce back to the login screen, which is expected and fine. If you
 * later want sessions to survive restarts, swap this file for a SQLite-
 * or Redis-backed version; nothing outside this file needs to change
 * since routes/controllers only call the functions below.
 */

const sessions = new Map();

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
  return sessionId;
}

function getSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    sessions.delete(sessionId);
    return null;
  }
  return session;
}

function destroySession(sessionId) {
  sessions.delete(sessionId);
}

function sessionCount() {
  return sessions.size;
}

// Periodic sweep so long-idle sessions don't sit in memory forever.
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (session.expiresAt < now) sessions.delete(id);
  }
}, 15 * 60 * 1000).unref();

module.exports = { createSession, getSession, destroySession, sessionCount };
