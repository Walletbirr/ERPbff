require('dotenv').config();

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  odoo: {
    baseUrl: required('ODOO_BASE_URL', 'http://localhost:8069'),
    db: process.env.ODOO_DB || undefined,
  },

  jwt: {
    secret: required('JWT_SECRET'),
    expiresIn: process.env.JWT_EXPIRES_IN || '12h',
  },

  sessionTtlMs:
    parseInt(process.env.SESSION_TTL_HOURS || '12', 10) * 60 * 60 * 1000,

  corsOrigins: (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};

if (config.jwt.secret === 'replace_this_with_a_long_random_string') {
  // eslint-disable-next-line no-console
  console.warn(
    '\n⚠️  JWT_SECRET is still the placeholder value from .env.example.\n' +
      '   Generate a real one: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"\n',
  );
}

module.exports = config;
