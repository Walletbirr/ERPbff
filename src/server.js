const app = require('./app');
const config = require('./config');

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`BH Dashboard BFF listening on port ${config.port}`);
  // eslint-disable-next-line no-console
  console.log(`Talking to Odoo at ${config.odoo.baseUrl}`);
});
