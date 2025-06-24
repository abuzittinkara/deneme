const fs = require('fs');
let createLogger, format, transports;

try {
  ({ createLogger, format, transports } = require('winston'));
} catch (err) {
  module.exports = {
    info: console.log,
    error: console.error
  };
  return;
}

fs.mkdirSync('logs', { recursive: true });

const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp({ format: 'HH:mm:ss' }),
    format.printf(({ timestamp, level, message }) => `${timestamp} [${level.toUpperCase()}]: ${message}`)
  ),
  transports: [
    new transports.Console(),
    new transports.File({ filename: 'logs/error.log', level: 'error' }),
    new transports.File({ filename: 'logs/combined.log' })
  ]
});

module.exports = logger;
