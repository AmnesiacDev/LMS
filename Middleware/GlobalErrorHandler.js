import AppErrorHelper from "../Utilities/AppErrorHelper.js";
import logger from "../Utilities/Logger.js";

const HandleCastDbError = (err) => {
  const message = `Invalid ${err.path} : ${err.value}`;
  return new AppErrorHelper(message, 400);
};

const HandelDuplicatesError = (err) => {
  const field = Object.keys(err.keyValue ?? {})[0];
  const value = field ? err.keyValue[field] : "";
  const message = `Duplicated value ${value} for this key ${field} , Please use another value`;
  return new AppErrorHelper(message, 400);
};
const HandleValidationError = (err) => {
  const errors = Object.values(err.errors).map((el) => el.message);
  const message = `Validation Error , ${errors.join(". ")}`;
  return new AppErrorHelper(message, 400);
};
const HandleJwtError = () => {
  return new AppErrorHelper("Invalid token , Please login or create an account !", 401);
};

const HandleJwtExpirationError = () => {
  return new AppErrorHelper("Token expired , Please login again", 401);
};

const DevelopmentErrorHandler = (err, req, res) => {
  logger.info(err);
  res.status(Number(err.statusCode) || 500).json({
    status: err.status,
    message: err.message,
    stack: err.stack,
    error: err,
  });
};

const ProductionErrorHandler = (err, req, res) => {
  const statusCode = Number(err.statusCode) || 500;
  if (err.isOperational) {
    res.status(statusCode).json({
      status: err.status,
      message: err.message,
    });
  } else {
    logger.error(err);
    res.status(statusCode).json({
      status: "Error",
      message: "Something went wrong !",
    });
  }
};

const normalize = (err) => {
  let normalized = { ...err, name: err.name, message: err.message, stack: err.stack };
  if (normalized.name === "CastError") normalized = HandleCastDbError(normalized);
  if (normalized.code === 11000) normalized = HandelDuplicatesError(normalized);
  if (normalized.name === "ValidationError") normalized = HandleValidationError(normalized);
  if (normalized.name === "JsonWebTokenError") normalized = HandleJwtError();
  if (normalized.name === "TokenExpiredError") normalized = HandleJwtExpirationError();
  return normalized;
};

const GlobalErrorHandler = (err, req, res, next) => {
  err.status = err.status || "fail";
  err.statusCode = err.statusCode || 500;

  const isProduction = (process.env.NODE_ENV || "development").toLowerCase() === "production";

  if (isProduction) {
    const error = normalize(err);
    ProductionErrorHandler(error, req, res);
  } else {
    const devErr = normalize(err);
    devErr.stack = err.stack;
    DevelopmentErrorHandler(devErr, req, res);
  }
};

export default GlobalErrorHandler;
