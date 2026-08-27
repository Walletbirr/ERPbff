const odoo = require('../services/odooClient');

async function getDashboardData(req, res, next) {
  try {
    const { date_from: dateFrom, date_to: dateTo } = req.query;
    const data = await odoo.getDashboardData(req.odoo.apiKey, dateFrom, dateTo);
    return res.json(data);
  } catch (err) {
    return next(err);
  }
}

module.exports = { getDashboardData };
