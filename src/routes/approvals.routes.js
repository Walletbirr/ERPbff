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

const router = express.Router();

router.post("/:orderId/approve", requireAuth, approveOrder);
router.post("/:orderId/reject", requireAuth, rejectOrder);

// Payment slip: ask for a short-lived link (Bearer auth), then open it.
// The file route is authenticated by the token inside the link itself.
router.post("/proofs/:proofId/link", requireAuth, createProofLink);
router.get("/proofs/file/:token", streamProofFile);
// PDF slips, shown inside the app as page pictures (see approvals.controller).
router.get("/proofs/file/:token/info", proofPdfInfo);
router.get("/proofs/file/:token/page/:page", proofPdfPage);

module.exports = router;
