const { createLogger, format, transports } = require('winston');

const logger = createLogger({
  level: 'info', // info ve üstü seviyeleri loglar (info, warn, error)
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    format.splat(),
    format.json()
  ),
  transports: [
    new transports.File({ filename: 'logs/error.log', level: 'error' }), // Sadece error seviyesindeki logları buraya yazar
    new transports.File({ filename: 'logs/combined.log' }), // Tüm seviyelerdeki logları buraya yazar
  ],
});

// Geliştirme ortamındayken konsola da log atalım.
if (process.env.NODE_ENV !== 'production') {
  logger.add(new transports.Console({
    format: format.combine(
      format.colorize(),
      format.simple()
    ),
  }));
}

module.exports = logger;
