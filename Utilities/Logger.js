import winston from "winston";

const isProduction = process.env.NODE_ENV === "production";

// Always log to stdout/stderr so logs survive on free PaaS hosts (Render, Fly).
// Local file transports vanish on every redeploy when the disk is ephemeral.
const logger = winston.createLogger({
  level: isProduction ? "warn" : "debug",
  format: isProduction
    ? winston.format.combine(winston.format.timestamp(), winston.format.json())
    : winston.format.combine(winston.format.colorize(), winston.format.simple()),
  transports: [new winston.transports.Console()],
});

export default logger;
