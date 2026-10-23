const express = require('express');
const {
  registerDevice,
  unregisterDevice,
  notifyFromOdoo,
} = require('../controllers/push.controller');
const { requireAuth } = require('../middleware/auth.middleware');

// Mounted at /api/push: the mobile app registers / removes its device token.
const deviceRouter = express.Router();
deviceRouter.post('/register', requireAuth, registerDevice);
deviceRouter.post('/unregister', requireAuth, unregisterDevice);

// Mounted at /internal/push: Odoo asks the BFF to send a notification.
// Protected by the X-Push-Secret header, not by a user session.
const internalRouter = express.Router();
internalRouter.post('/notify', notifyFromOdoo);

module.exports = { deviceRouter, internalRouter };
