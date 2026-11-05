const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const morgan = require("morgan");
const compression = require("compression");

const config = require("./config");
const { apiLimiter } = require("./middleware/rateLimiter");
const { errorHandler, notFound } = require("./middleware/errorHandler");

const authRoutes = require("./routes/auth.routes");
const dashboardRoutes = require("./routes/dashboard.routes");
const approvalsRoutes = require("./routes/approvals.routes");
const creditRoutes = require("./routes/credit.routes");
const { deviceRouter, internalRouter } = require("./routes/push.routes");

const app = express();

app.disable("x-powered-by");
app.use(helmet());
app.use(
  cors({
    origin: config.corsOrigins.length ? config.corsOrigins : false,
  }),
);
app.use(express.json({ limit: "1mb" }));
// For the speed log: how big each JSON answer is before compression, and
// how many bytes really went to the phone after it.
app.use((req, res, next) => {
  const start = req.socket.bytesWritten;
  res.locals.sentStart = start;
  const json = res.json.bind(res);
  res.json = (body) => {
    try {
      res.locals.rawBytes = Buffer.byteLength(JSON.stringify(body));
    } catch (e) {
      res.locals.rawBytes = undefined;
    }
    return json(body);
  };
  next();
});
// Smaller answers on weak networks: JSON is gzip-compressed (about 70-80%
// less data). Pictures / PDFs are left as they are.
app.use(compression());
// One line per request with its time and size (for measuring speed). Only
// method, path, status, bytes and milliseconds: no customer data, no token.
morgan.token("path-only", (req) => (req.originalUrl || "").split("?")[0]);
morgan.token("raw", (req, res) =>
  res.locals.rawBytes === undefined ? "-" : String(res.locals.rawBytes),
);
morgan.token("sent", (req, res) =>
  String(Math.max(0, req.socket.bytesWritten - (res.locals.sentStart || 0))),
);
app.use(
  morgan(
    ":date[iso] :method :path-only :status json=:raw sent=:sent :response-time ms :res[x-cache] :res[etag]",
  ),
);
app.use("/api", apiLimiter);

app.get("/health", (req, res) =>
  res.json({ status: "ok", env: config.nodeEnv }),
);

app.use("/api/auth", authRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/approvals", approvalsRoutes);
app.use("/api/credit", creditRoutes);
app.use("/api/push", deviceRouter);
// Called by Odoo (server-to-server), authenticated by a shared secret.
app.use("/internal/push", internalRouter);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
