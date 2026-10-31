const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const morgan = require("morgan");

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
app.use(morgan(config.nodeEnv === "production" ? "combined" : "dev"));
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
