const odoo = require("../services/odooClient");

/**
 * Customer credit history (Commercial > Credit/Deposit > tap a customer).
 * Served by the Odoo module accounting_so_invoice_bridge
 * (controllers/mobile_credit.py), data from customer_credit_report.
 */
async function getCustomerCredit(req, res, next) {
  try {
    const partnerId = Number.parseInt(req.params.partnerId, 10);
    if (!Number.isInteger(partnerId) || partnerId <= 0) {
      return res.status(400).json({
        error: "missing_partner_id",
        message: "The customer could not be identified.",
      });
    }
    const data = await odoo.getCustomerCredit(req.odoo.apiKey, partnerId);
    return res.json(data);
  } catch (err) {
    return next(err);
  }
}

module.exports = { getCustomerCredit };
