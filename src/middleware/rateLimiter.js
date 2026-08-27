const rateLimit = require('express-rate-limit');

// Generous limit for normal API use.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

// Tighter limit specifically on login, to slow down password guessing.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_attempts', message: 'Too many login attempts. Try again later.' },
});

module.exports = { apiLimiter, loginLimiter };
