const mongoose = require('mongoose');
const { MONGODB_URI } = require('./appConfig');
const logger = require('../utils/logger');

async function connectToDatabase() {
  try {
    await mongoose.connect(MONGODB_URI);
    logger.info('MongoDB bağlantısı başarılı!');
  } catch (err) {
    console.error('MongoDB bağlantı hatası:', err);
    throw err;
  }
}

module.exports = { connectToDatabase };
