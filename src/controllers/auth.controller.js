const jwt = require('jsonwebtoken');
const config = require('../config');
const odoo = require('../services/odooClient');
const { createSession, destroySession } = require('../services/sessionStore');

async function login(req, res, next) {
  try {
    const { login: loginEmail, password } = req.body || {};

    if (!loginEmail || !password) {
      return res
        .status(400)
        .json({ error: 'missing_credentials', message: 'Email and password are required.' });
    }

    // This call happens server-to-server over localhost — the phone never
    // talks to Odoo directly, and never sees the api_key Odoo returns here.
    const result = await odoo.login(loginEmail, password);

    const sessionId = createSession({
      uid: result.uid,
      name: result.name,
      login: result.login,
      odooApiKey: result.api_key,
    });

    const token = jwt.sign({ sid: sessionId }, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
    });

    return res.json({
      token,
      user: { uid: result.uid, name: result.name, login: result.login },
    });
  } catch (err) {
    return next(err);
  }
}

function me(req, res) {
  // requireAuth already resolved and attached req.user
  return res.json({ user: req.user });
}

function logout(req, res) {
  destroySession(req.sessionId);
  return res.status(204).send();
}

module.exports = { login, me, logout };
