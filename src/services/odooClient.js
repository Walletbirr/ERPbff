const axios = require('axios');
const config = require('../config');

/**
 * Talks to the bh_management_dashboard Odoo controller
 * (controllers/bh_dashboard_controller.py) over JSON-RPC.
 *
 * This is the ONLY module in the BFF that knows Odoo's request/response
 * shape. Everything else (controllers, routes) just calls the plain
 * functions below and gets back plain JS objects or a thrown OdooError.
 */

const odoo = axios.create({
  baseURL: config.odoo.baseUrl,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

class OdooError extends Error {
  constructor(message, { status = 502, code = 'odoo_error' } = {}) {
    super(message);
    this.name = 'OdooError';
    this.status = status; // HTTP status the BFF should reply with
    this.code = code; // machine-readable error code
  }
}

/**
 * Calls one of Odoo's type="json" routes and unwraps the JSON-RPC envelope.
 * @param {string} path - e.g. '/bh_dashboard/mobile/login'
 * @param {object} params - params to send
 * @param {string|null} apiKey - Odoo API key to send in the API-KEY header
 */
async function callJsonRpc(path, params = {}, apiKey = null) {
  let response;
  try {
    response = await odoo.post(
      path,
      { jsonrpc: '2.0', method: 'call', params },
      { headers: apiKey ? { 'API-KEY': apiKey } : {} },
    );
  } catch (err) {
    if (err.response) {
      // Odoo route doesn't exist yet, or 500'd, etc.
      throw new OdooError(
        `Odoo returned HTTP ${err.response.status} for ${path}`,
        { status: 502, code: 'odoo_http_error' },
      );
    }
    // Network-level failure — Odoo down, wrong ODOO_BASE_URL, etc.
    throw new OdooError(`Could not reach Odoo at ${path}: ${err.message}`, {
      status: 503,
      code: 'odoo_unreachable',
    });
  }

  // Route-level exception inside Odoo shows up as response.data.error
  if (response.data?.error) {
    const message =
      response.data.error?.data?.message || 'Odoo returned an error';
    throw new OdooError(message, { status: 502, code: 'odoo_route_error' });
  }

  const result = response.data?.result;

  // Our own controller's {error: '...'} shape (invalid_credentials, etc.)
  if (result?.error) {
    throw new OdooError(result.error, { status: 401, code: result.error });
  }

  return result;
}

async function login(loginEmail, password) {
  return callJsonRpc('/bh_dashboard/mobile/login', {
    login: loginEmail,
    password,
    db: config.odoo.db,
  });
}

async function whoAmI(apiKey) {
  return callJsonRpc('/bh_dashboard/mobile/whoami', {}, apiKey);
}

async function getDashboardData(apiKey, dateFrom, dateTo) {
  return callJsonRpc(
    '/bh_dashboard/mobile/get_data',
    { date_from: dateFrom, date_to: dateTo },
    apiKey,
  );
}

// NOTE: these two Odoo-side routes don't exist yet in
// bh_dashboard_controller.py (see README's "Known gap" section). Wired up
// here so the BFF's own /api/approvals routes are ready the moment the
// Odoo controller is built — until then they'll surface as a clean
// odoo_http_error rather than a silent failure.
async function approveOrder(apiKey, orderId, note) {
  return callJsonRpc(
    '/bh_dashboard/mobile/approvals/approve',
    { order_id: orderId, note },
    apiKey,
  );
}

async function rejectOrder(apiKey, orderId, reason) {
  return callJsonRpc(
    '/bh_dashboard/mobile/approvals/reject',
    { order_id: orderId, reason },
    apiKey,
  );
}

module.exports = {
  OdooError,
  login,
  whoAmI,
  getDashboardData,
  approveOrder,
  rejectOrder,
};
