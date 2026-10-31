const express = require("express");
const { getCustomerCredit } = require("../controllers/credit.controller");
const { requireAuth } = require("../middleware/auth.middleware");

const router = express.Router();

// GET /api/credit/customers/:partnerId  - one customer's credit history
router.get("/customers/:partnerId", requireAuth, getCustomerCredit);

module.exports = router;
