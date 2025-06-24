const logger = require('./logger');

function handleUncaughtException(err) {
  const msg = err && err.stack ? err.stack : err.message || err;
  logger.error(`Uncaught Exception: ${msg}`);
}

function handleUnhandledRejection(reason) {
  const msg = reason && reason.stack ? reason.stack : reason;
  logger.error(`Unhandled Rejection: ${msg}`);
}

function setupErrorHandlers() {
  process.on('uncaughtException', handleUncaughtException);
  process.on('unhandledRejection', handleUnhandledRejection);
}

module.exports = {
  setupErrorHandlers,
  handleUncaughtException,
  handleUnhandledRejection,
};
