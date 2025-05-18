const mongoose = require('mongoose');
const { MONGODB_URI } = require('./appConfig');

async function connectToDatabase() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB bağlantısı başarılı!');
  } catch (err) {
    console.error('MongoDB bağlantı hatası:', err);
    throw err;
  }
}

module.exports = { connectToDatabase };