import log from "winston";
import AppErrorHelper from "../Utilities/AppErrorHelper.js";
import logger from "../Utilities/Logger.js";

const HandleCastDbError = (err) => {
  const message = `Invalid ${err.path} : ${err.value}`;
  return new AppErrorHelper(message, 400);
};

const HandelDuplicatesError = (err) => {
  const field = Object.keys(err.KeyValue)[0];
  const value = err.KeyValue[field];
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
  res.status(parseInt(err.statusCode)).json({
    status: err.status,
    message: err.message,
    stack: err.stack,
    error: err,
  });
};

const ProductionErrorHandler = (err, req, res) => {
  if (err.isOperational) {
    res.status(err.statusCode).json({
      status: err.status,
      message: err.message,
    });
  } else {
    logger.error(err);
    res.status(parseInt(err.statusCode)).json({
      status: "Error",
      message: "Something went wrong !",
    });
  }
};

const GlobalErrorHandler = (err, req, res, next) => {
  err.status = err.status || "fail";
  err.statusCode = err.statusCode || "500";

  // Default to Development mode if NODE_ENV is not set
  const environment = process.env.NODE_ENV || "Development";

  if (environment === "Development") {
    let devErr = { ...err, name: err.name, message: err.message, stack: err.stack };
    if (devErr.name === "CastError") devErr = HandleCastDbError(devErr);
    if (devErr.code === 11000) devErr = HandelDuplicatesError(devErr);
    if (devErr.name === "ValidationError") devErr = HandleValidationError(devErr);
    if (devErr.name === "JsonWebTokenError") devErr = HandleJwtError();
    if (devErr.name === "TokenExpiredError") devErr = HandleJwtExpirationError();
    
    // Ensure we keep the original stack for debugging in dev
    devErr.stack = err.stack;
    
    DevelopmentErrorHandler(devErr, req, res);
  } else {
    const error = { ...err };

    if (error.name === "CastError") error = HandleCastDbError(error);
    if (error.code === 11000) error = HandelDuplicatesError(error);
    if (error.name === "ValidationError") error = HandleValidationError(error);
    if (error.name === "JsonWebTokenError") error = HandleJwtError();
    if (error.name === "TokenExpiredError") error = HandleJwtExpirationError();

    ProductionErrorHandler(error, req, res);
  }
};

export default GlobalErrorHandler;
