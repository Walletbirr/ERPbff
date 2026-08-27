const { OdooError } = require('../services/odooClient');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof OdooError) {
    return res.status(err.status).json({ error: err.code, message: err.message });
  }

  // eslint-disable-next-line no-console
  console.error(err);
  return res.status(500).json({ error: 'internal_error', message: 'Something went wrong.' });
}

function notFound(req, res) {
  res.status(404).json({ error: 'not_found', message: `No route: ${req.method} ${req.originalUrl}` });
}

module.exports = { errorHandler, notFound };
