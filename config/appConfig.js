+1-1
const dotenv = require('dotenv');
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/test';
const PORT = process.env.PORT || 3000;

const rateLimitOptions = {
  windowMs: 1 * 60 * 1000,
  max: 240,
  message: 'Çok fazla istek gönderdiniz, lütfen daha sonra tekrar deneyin.'
};

const helmetCspOptions = {
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", 'https://cdn.socket.io', 'https://unpkg.com'],
    connectSrc: ["'self'", 'wss:', 'https://cdn.socket.io', 'blob:'],
    styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://unpkg.com'],
    fontSrc: ["'self'", 'https://fonts.gstatic.com'],
    imgSrc: ["'self'", 'data:', 'blob:']
  }
};

module.exports = {
  MONGODB_URI,
  PORT,
  rateLimitOptions,
  helmetCspOptions
};