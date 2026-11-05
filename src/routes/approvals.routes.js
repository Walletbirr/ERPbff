const express = require("express");
const {
  approveOrder,
  rejectOrder,
  createProofLink,
  streamProofFile,
  proofPdfInfo,
  proofPdfPage,
} = require("../controllers/approvals.controller");
const { requireAuth } = require("../middleware/auth.middleware");
const { idempotent } = require("../middleware/idempotency");

const router = express.Router();

// idempotent: a repeated tap after a network drop is decided only once.
router.post("/:orderId/approve", requireAuth, idempotent, approveOrder);
router.post("/:orderId/reject", requireAuth, idempotent, rejectOrder);

// Payment slip: ask for a short-lived link (Bearer auth), then open it.
// The file route is authenticated by the token inside the link itself.
router.post("/proofs/:proofId/link", requireAuth, createProofLink);
router.get("/proofs/file/:token", streamProofFile);
// PDF slips, shown inside the app as page pictures (see approvals.controller).
router.get("/proofs/file/:token/info", proofPdfInfo);
router.get("/proofs/file/:token/page/:page", proofPdfPage);

module.exports = router;
