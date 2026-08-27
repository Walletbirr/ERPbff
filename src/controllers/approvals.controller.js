const odoo = require('../services/odooClient');

/**
 * These call /bh_dashboard/mobile/approvals/approve and /reject on the Odoo
 * side, which do NOT exist yet in bh_dashboard_controller.py (only
 * get_data / whoami / login are implemented there today). Until that's
 * added, these will fail with a clean 502 `odoo_http_error` instead of a
 * silent 404 — see the README's "Known gap" section for the Odoo-side
 * controller code to add next.
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

module.exports = { approveOrder, rejectOrder };
