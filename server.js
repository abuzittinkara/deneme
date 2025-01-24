/**************************************
 * server.js (Sadeleştirilmiş)
 **************************************/
require('dotenv').config();              // .env dosyasındaki değişkenler (isteğe bağlı)
const http = require('http');
const path = require('path');
const express = require('express');

// Veritabanı bağlantısını başlat (Mongoose)
require('./config/database');

const { initSocket } = require('./socket/socket');

const app = express();

// Public klasörünü statik sunalım
app.use(express.static(path.join(__dirname, 'public')));

// HTTP Sunucusu oluştur
const server = http.createServer(app);

// Socket.IO kur ve eventleri başlat
initSocket(server);

// Sunucuyu dinlemeye aç
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
});
