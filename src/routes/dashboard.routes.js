const express = require('express');
const { getDashboardData } = require('../controllers/dashboard.controller');
const { requireAuth } = require('../middleware/auth.middleware');
const { cacheGet } = require('../middleware/responseCache');

const router = express.Router();

// GET /api/dashboard?date_from=2026-08-01&date_to=2026-08-18
// cacheGet: same answer reused for 30 s per manager; ETag / 304 support.
router.get('/', requireAuth, cacheGet(), getDashboardData);

module.exports = router;
