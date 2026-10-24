const crypto = require("crypto");
const config = require("../config");
const store = require("../services/pushTokenStore");
const { sendToUsers } = require("../services/pushService");

// ── Device endpoints (Bearer auth, called by the mobile app) ──────────────

function registerDevice(req, res) {
  const { token, platform, deviceName } = req.body || {};
  if (!store.isValidToken(token)) {
    return res
      .status(400)
      .json({
        error: "invalid_push_token",
        message: "Not a valid Expo push token.",
      });
  }
  store.register(req.user.uid, token, {
    platform: typeof platform === "string" ? platform.slice(0, 20) : null,
    deviceName: typeof deviceName === "string" ? deviceName.slice(0, 80) : null,
  });
  return res.status(204).send();
}

function unregisterDevice(req, res) {
  const { token } = req.body || {};
  if (store.isValidToken(token)) store.unregister(token, req.user.uid);
  return res.status(204).send();
}

// ── Webhook (called by Odoo, server to server) ────────────────────────────

function secretMatches(provided) {
  const expected = config.push.webhookSecret;
  if (!expected || typeof provided !== "string") return false;
  // Hash first so timingSafeEqual always compares equal-length buffers.
  const a = crypto.createHash("sha256").update(provided).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

async function notifyFromOdoo(req, res) {
  if (!config.push.webhookSecret) {
    return res
      .status(503)
      .json({
        error: "push_disabled",
        message: "PUSH_WEBHOOK_SECRET is not configured.",
      });
  }
  if (!secretMatches(req.get("x-push-secret"))) {
    return res
      .status(401)
      .json({ error: "invalid_secret", message: "Invalid secret." });
  }

  const { uids, title, body, data, badge } = req.body || {};
  const ids = Array.isArray(uids)
    ? uids.map(Number).filter(Number.isInteger)
    : [];
  if (!ids.length || typeof title !== "string" || typeof body !== "string") {
    return res
      .status(400)
      .json({
        error: "bad_request",
        message: "uids[], title and body are required.",
      });
  }

  try {
    const { devices } = await sendToUsers(ids, {
      title: title.slice(0, 120),
      body: body.slice(0, 300),
      data: data && typeof data === "object" ? data : {},
      badge: Number.isInteger(badge) && badge >= 0 ? badge : undefined,
    });
    return res.json({ devices });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[push] notify failed:", err.message);
    return res
      .status(502)
      .json({ error: "push_failed", message: "Could not send." });
  }
}

module.exports = { registerDevice, unregisterDevice, notifyFromOdoo };
