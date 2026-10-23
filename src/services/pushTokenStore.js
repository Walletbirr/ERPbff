const fs = require('fs');
const path = require('path');
const config = require('../config');

/**
 * Registry of device push tokens: expoPushToken -> { uid, platform, ... }.
 *
 * Unlike sessionStore (in-memory on purpose), this must survive a BFF
 * restart: a manager should keep getting pushes even when their login
 * session is gone. A JSON file is plenty for a handful of executives; swap
 * this file for SQLite/Redis later without touching anything else (only the
 * functions exported below are used elsewhere).
 *
 * A token belongs to exactly ONE user. If another manager signs in on the
 * same phone, registering the token again re-assigns it, so the previous
 * user stops receiving this device's notifications.
 */

const TOKEN_RE = /^(Expo|Exponent)PushToken\[[^\]]+\]$/;
const storePath = path.resolve(config.push.storePath);

let tokens = load();

function load() {
  try {
    return JSON.parse(fs.readFileSync(storePath, 'utf8')) || {};
  } catch (err) {
    if (err.code !== 'ENOENT') {
      // eslint-disable-next-line no-console
      console.error(`push: could not read ${storePath}, starting empty:`, err.message);
    }
    return {};
  }
}

function save() {
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  const tmp = `${storePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(tokens, null, 2));
  fs.renameSync(tmp, storePath); // atomic: never leaves a half-written file
}

function isValidToken(token) {
  return typeof token === 'string' && TOKEN_RE.test(token);
}

function register(uid, token, { platform, deviceName } = {}) {
  tokens[token] = {
    uid,
    platform: platform || null,
    deviceName: deviceName || null,
    updatedAt: new Date().toISOString(),
  };
  save();
}

// Only the current owner may remove a token (a stale logout from the
// previous user must not delete the token the new user just registered).
function unregister(token, uid) {
  if (tokens[token] && tokens[token].uid === uid) {
    delete tokens[token];
    save();
    return true;
  }
  return false;
}

function tokensForUids(uids) {
  const wanted = new Set(uids.map(Number));
  return Object.keys(tokens).filter((t) => wanted.has(Number(tokens[t].uid)));
}

function removeTokens(list) {
  let changed = false;
  for (const t of list) {
    if (tokens[t]) {
      delete tokens[t];
      changed = true;
    }
  }
  if (changed) save();
}

module.exports = { isValidToken, register, unregister, tokensForUids, removeTokens };
