/**
 * Short per-manager cache for read routes (dashboard, credit history).
 *
 * Several screens / managers opening the app at the same time do not each
 * make Odoo rebuild the same figures: an answer is reused for `ttlMs`
 * (default 30 s) for the SAME session and the SAME URL, and identical
 * requests that arrive while Odoo is still working wait for that one
 * answer. Each session has its own entries (data never crosses managers).
 * A manager's own Approve / Reject clears their entries at once
 * (clearSession), so they never see their own decision missing.
 *
 * Express then adds an ETag: a phone that already has this exact version
 * gets a tiny "304 Not Modified" instead of the whole payload.
 */

const MAX_ENTRIES = 500;
const entries = new Map(); // key -> { body, expiresAt }
const inflight = new Map(); // key -> Promise (resolves when the first is done)

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of entries) {
    if (entry.expiresAt < now) entries.delete(key);
  }
}, 60 * 1000).unref();

function clearSession(sessionId) {
  const prefix = `${sessionId}|`;
  for (const key of entries.keys()) {
    if (key.startsWith(prefix)) entries.delete(key);
  }
}

function cacheGet({ ttlMs = 30 * 1000 } = {}) {
  return async function responseCache(req, res, next) {
    if (req.method !== "GET" || !req.sessionId) return next();
    const key = `${req.sessionId}|${req.originalUrl}`;

    const waiting = inflight.get(key);
    if (waiting) {
      try {
        await waiting;
      } catch (e) {
        // The first request failed: this one asks Odoo itself below.
      }
    }

    const hit = entries.get(key);
    if (hit && hit.expiresAt > Date.now()) {
      res.set("X-Cache", "hit");
      return res.json(hit.body);
    }

    let done;
    inflight.set(key, new Promise((resolve) => (done = resolve)));
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode === 200) {
        if (entries.size >= MAX_ENTRIES) {
          entries.delete(entries.keys().next().value);
        }
        entries.set(key, { body, expiresAt: Date.now() + ttlMs });
      }
      return originalJson(body);
    };
    res.on("finish", () => {
      inflight.delete(key);
      done();
    });
    res.on("close", () => {
      inflight.delete(key);
      done();
    });
    return next();
  };
}

module.exports = { cacheGet, clearSession };
