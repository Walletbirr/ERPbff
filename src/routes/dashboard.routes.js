const express = require('express');
const { getDashboardData } = require('../controllers/dashboard.controller');
const { requireAuth } = require('../middleware/auth.middleware');

const router = express.Router();

// GET /api/dashboard?date_from=2026-08-01&date_to=2026-08-18
router.get('/', requireAuth, getDashboardData);

module.exports = router;
