const express = require("express");
const { getCustomerCredit } = require("../controllers/credit.controller");
const { requireAuth } = require("../middleware/auth.middleware");
const { cacheGet } = require("../middleware/responseCache");

const router = express.Router();

// GET /api/credit/customers/:partnerId  - one customer's credit history
router.get("/customers/:partnerId", requireAuth, cacheGet(), getCustomerCredit);

module.exports = router;
