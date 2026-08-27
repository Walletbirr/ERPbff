const jwt = require('jsonwebtoken');
const config = require('../config');
const { getSession } = require('../services/sessionStore');

/**
 * Verifies the Bearer JWT, then resolves it to a live server-side session
 * (which holds the real Odoo API key). Attaches:
 *   req.user   -> { uid, name, login }
 *   req.odoo   -> { apiKey }   (only thing downstream controllers need)
 */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res
      .status(401)
      .json({ error: 'missing_token', message: 'Authorization header missing or malformed.' });
  }

  let payload;
  try {
    payload = jwt.verify(token, config.jwt.secret);
  } catch (err) {
    const code = err.name === 'TokenExpiredError' ? 'token_expired' : 'invalid_token';
    return res.status(401).json({ error: code, message: 'Please sign in again.' });
  }

  const session = getSession(payload.sid);
  if (!session) {
    // JWT itself was valid, but the server-side session behind it is gone
    // (server restarted, TTL passed, or user logged out elsewhere).
    return res
      .status(401)
      .json({ error: 'session_expired', message: 'Your session has expired. Please sign in again.' });
  }

  req.user = { uid: session.uid, name: session.name, login: session.login };
  req.odoo = { apiKey: session.odooApiKey };
  req.sessionId = payload.sid;

  next();
}

module.exports = { requireAuth };
