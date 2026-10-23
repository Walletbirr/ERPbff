const jwt = require("jsonwebtoken");
const config = require("../config");
const { getSession } = require("../services/sessionStore");
const odoo = require("../services/odooClient");
const pdfPages = require("../services/pdfPages");

/**
 * These call /bh_dashboard/mobile/approvals/approve and /reject, which are
 * provided by the Odoo module `sale_credit_approval` (now "Sales Approval",
 * controllers/bh_dashboard_mobile_approvals.py). The order is decided by
 * the High-Level Manager AFTER Accounting approved the payment proof; the
 * decision itself is enforced in Odoo (sale.order.can_approve_credit).
 * Failures come back as { error, message } with a 403 / 404 / 400 / 502.
 */

async function approveOrder(req, res, next) {
  try {
    const { orderId } = req.params;
    const { note } = req.body || {};
    const result = await odoo.approveOrder(req.odoo.apiKey, orderId, note);
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

async function rejectOrder(req, res, next) {
  try {
    const { orderId } = req.params;
    const { reason } = req.body || {};
    const result = await odoo.rejectOrder(req.odoo.apiKey, orderId, reason);
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

/**
 * Payment slip viewing.
 *
 * The phone can't send an Authorization header when it opens a PDF in the
 * browser, so it first asks for a short-lived link (POST .../link, with the
 * normal Bearer token) and then opens that link. The link carries a token
 * that is valid for 2 minutes, only for that one proof, and is signed with a
 * DIFFERENT secret than the login token, so it can never be used as a
 * Bearer token for the rest of the API.
 */
const FILE_LINK_TTL = "5m"; // long enough to page through a PDF
const fileLinkSecret = () => `${config.jwt.secret}:proof-file`;

async function createProofLink(req, res, next) {
  try {
    const proofId = parseInt(req.params.proofId, 10);
    if (!Number.isInteger(proofId) || proofId <= 0) {
      return res.status(400).json({
        error: "missing_proof_id",
        message: "The payment proof could not be identified.",
      });
    }
    const token = jwt.sign(
      { typ: "proof_file", proofId, sid: req.sessionId },
      fileLinkSecret(),
      { expiresIn: FILE_LINK_TTL },
    );
    return res.json({ path: `/api/approvals/proofs/file/${token}` });
  } catch (err) {
    return next(err);
  }
}

async function streamProofFile(req, res, next) {
  try {
    let payload;
    try {
      payload = jwt.verify(req.params.token, fileLinkSecret());
    } catch (err) {
      return res
        .status(401)
        .json({ error: "link_expired", message: "This link has expired." });
    }
    if (payload.typ !== "proof_file") {
      return res
        .status(401)
        .json({ error: "invalid_token", message: "Invalid link." });
    }
    // The link only works while the manager's own session is alive.
    const session = getSession(payload.sid);
    if (!session) {
      return res
        .status(401)
        .json({ error: "session_expired", message: "Please sign in again." });
    }

    const file = await odoo.getProofFile(session.odooApiKey, payload.proofId);
    const buffer = Buffer.from(file.data || "", "base64");
    res.set({
      "Content-Type": file.mimetype || "application/octet-stream",
      "Content-Length": buffer.length,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(
        file.filename || "payment_proof",
      )}`,
      "Cache-Control": "private, no-store",
      // helmet's default is same-origin, which would block the image in a
      // browser / Expo web build.
      "Cross-Origin-Resource-Policy": "cross-origin",
    });
    return res.send(buffer);
  } catch (err) {
    return next(err);
  }
}

/**
 * PDF slips are shown inside the app as pictures: the BFF fetches the file
 * from Odoo, renders each page to a PNG and the app displays them in its own
 * viewer. The phone never opens a browser, never sees an Odoo address and
 * never receives the PDF itself. Both routes are authenticated by the same
 * short-lived link token as the file route.
 */
const PDF_CACHE_MS = 5 * 60 * 1000;
const fileCache = new Map(); // `${sid}:${proofId}` -> { file, expiresAt }
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of fileCache) {
    if (entry.expiresAt < now) fileCache.delete(key);
  }
}, 60 * 1000).unref();

// Validates the link token and the manager's session. Sends the error
// response itself and returns null when something is wrong.
function checkLink(req, res) {
  let payload;
  try {
    payload = jwt.verify(req.params.token, fileLinkSecret());
  } catch (err) {
    res
      .status(401)
      .json({ error: "link_expired", message: "This link has expired." });
    return null;
  }
  if (payload.typ !== "proof_file") {
    res.status(401).json({ error: "invalid_token", message: "Invalid link." });
    return null;
  }
  const session = getSession(payload.sid);
  if (!session) {
    res
      .status(401)
      .json({ error: "session_expired", message: "Please sign in again." });
    return null;
  }
  return { payload, session };
}

async function loadPdf(payload, session) {
  const key = `${payload.sid}:${payload.proofId}`;
  const cached = fileCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.file;
  const file = await odoo.getProofFile(session.odooApiKey, payload.proofId);
  const buffer = Buffer.from(file.data || "", "base64");
  const isPdf =
    buffer.subarray(0, 5).toString("latin1") === "%PDF-" ||
    /pdf/i.test(file.mimetype || "");
  const entry = { buffer, isPdf };
  fileCache.set(key, { file: entry, expiresAt: Date.now() + PDF_CACHE_MS });
  return entry;
}

// GET /proofs/file/:token/info  ->  { pages: n }
async function proofPdfInfo(req, res, next) {
  try {
    const ok = checkLink(req, res);
    if (!ok) return undefined;
    const file = await loadPdf(ok.payload, ok.session);
    if (!file.isPdf) {
      return res
        .status(415)
        .json({ error: "not_a_pdf", message: "This file is not a PDF." });
    }
    const pages = await pdfPages.countPages(file.buffer);
    return res.json({ pages });
  } catch (err) {
    return next(err);
  }
}

// GET /proofs/file/:token/page/:n  (n starts at 1)  ->  image/png
async function proofPdfPage(req, res, next) {
  try {
    const ok = checkLink(req, res);
    if (!ok) return undefined;
    const file = await loadPdf(ok.payload, ok.session);
    if (!file.isPdf) {
      return res
        .status(415)
        .json({ error: "not_a_pdf", message: "This file is not a PDF." });
    }
    const png = await pdfPages.renderPage(
      file.buffer,
      parseInt(req.params.page, 10) - 1,
    );
    if (!png) {
      return res
        .status(404)
        .json({ error: "page_not_found", message: "No such page." });
    }
    res.set({
      "Content-Type": "image/png",
      "Content-Length": png.length,
      "Cache-Control": "private, no-store",
      "Cross-Origin-Resource-Policy": "cross-origin",
    });
    return res.send(png);
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  approveOrder,
  rejectOrder,
  createProofLink,
  streamProofFile,
  proofPdfInfo,
  proofPdfPage,
};
