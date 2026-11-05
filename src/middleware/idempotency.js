const { clearSession } = require("./responseCache");

/**
 * Approve / Reject on a weak network.
 *
 * The app sends an "Idempotency-Key" header (one random id per decision the
 * manager opens). If the phone loses the answer and the manager taps again,
 * the same id comes back: the BFF replies with the FIRST result instead of
 * sending the decision to Odoo a second time. A retry that arrives while
 * the first is still running waits for it. Results are kept 10 minutes,
 * per session. Server/network failures (5xx) are not kept, so a real retry
 * can still go through.
 *
 * A successful decision also clears the manager's short read cache, so the
 * next dashboard load shows it.
 */

const TTL_MS = 10 * 60 * 1000;
const results = new Map(); // key -> { status, body, expiresAt }
const inflight = new Map(); // key -> Promise

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of results) {
    if (entry.expiresAt < now) results.delete(key);
  }
}, 60 * 1000).unref();

function idempotent(req, res, next) {
  const id = String(req.get("Idempotency-Key") || "").slice(0, 100);
  const sessionId = req.sessionId;

  const original = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode < 300 && sessionId) clearSession(sessionId);
    return original(body);
  };
  if (!id || !sessionId) return next();

  const key = `${sessionId}|${req.method}|${req.originalUrl}|${id}`;
  return (async () => {
    const waiting = inflight.get(key);
    if (waiting) await waiting.catch(() => {});

    const stored = results.get(key);
    if (stored && stored.expiresAt > Date.now()) {
      res.set("Idempotent-Replay", "true");
      return res.status(stored.status).json(stored.body);
    }

    let done;
    inflight.set(key, new Promise((resolve) => (done = resolve)));
    const withClear = res.json;
    res.json = (body) => {
      if (res.statusCode < 500) {
        results.set(key, {
          status: res.statusCode,
          body,
          expiresAt: Date.now() + TTL_MS,
        });
      }
      return withClear(body);
    };
    const finish = () => {
      inflight.delete(key);
      done();
    };
    res.on("finish", finish);
    res.on("close", finish);
    return next();
  })();
}

module.exports = { idempotent };
