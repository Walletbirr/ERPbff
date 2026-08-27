const express = require('express');
const { approveOrder, rejectOrder } = require('../controllers/approvals.controller');
const { requireAuth } = require('../middleware/auth.middleware');

const router = express.Router();

router.post('/:orderId/approve', requireAuth, approveOrder);
router.post('/:orderId/reject', requireAuth, rejectOrder);

module.exports = router;
