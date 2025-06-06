require('dotenv').config();

const express = require('express');
const socketIO = require('socket.io');
const WebSocket = require('ws');
const http = require('http');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const { MONGODB_URI, PORT, rateLimitOptions, helmetCspOptions } = require('./config/appConfig');

const User = require('./models/User');
const Group = require('./models/Group');
const Channel = require('./models/Channel');
const Message = require('./models/Message');
const DMMessage = require('./models/DmMessage');
const sfu = require('./sfu');
const registerTextChannelEvents = require('./modules/textChannel');
const registerMediaEvents = require('./modules/mediaEvents');
const expressWinston = require('express-winston');
const logger = require('./utils/logger');

const authController = require("./controllers/authController");
const groupController = require("./controllers/groupController");
const friendController = require("./controllers/friendController");

const app = express();
app.set('trust proxy', 1); // Proxy güvendiğimizi belirt

const server = http.createServer(app);

const io = socketIO(server, {
  wsEngine: WebSocket.Server
});

mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log("MongoDB bağlantısı başarılı!");
    await sfu.createWorkers();
    console.log("Mediasoup Workers hazır!");
    await groupController.loadGroupsFromDB({ Group, groups });
    await groupController.loadChannelsFromDB({ Channel, groups });
    console.log("Uygulama başlangıç yüklemeleri tamam.");
  })
  .catch(err => {
    console.error("MongoDB bağlantı hatası:", err);
  });

// Helmet middleware'i özel CSP ayarları ile güncelle
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "https://cdn.socket.io"], // Socket.IO CDN
        connectSrc: ["'self'", "wss:", "https://cdn.socket.io"], // Socket.IO bağlantısı için wss:
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:"], // data: URI'larından resim yüklemeye izin ver
      },
    },
  })
);

// Rate limiting middleware'i ekle
app.use(rateLimit(rateLimitOptions));

// --- Bellek içi tablolar (aynı kaldı) ---
const users = {};
const groups = {};
const onlineUsernames = new Set();
let friendRequests = {};

// → Friend request'lerin 24 saat sonra otomatik temizlenmesi için TTL mekanizması
const FRIEND_REQUEST_TTL_MS = 24 * 60 * 60 * 1000;       // 24 saat
const FRIEND_REQUEST_CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // Her 1 saatte bir

setInterval(() => {
  const now = Date.now();
  for (const username in friendRequests) {
    // Yaşayanları filtrele
    friendRequests[username] = friendRequests[username]
      .filter(req => now - new Date(req.timestamp).getTime() < FRIEND_REQUEST_TTL_MS);
    // Eğer hiç kalmadıysa tüm girişi sil
    if (friendRequests[username].length === 0) {
      delete friendRequests[username];
    }
  }
}, FRIEND_REQUEST_CLEANUP_INTERVAL_MS);

app.use(expressWinston.logger({ winstonInstance: logger, meta: false, msg: "{{req.method}} {{req.url}} - {{res.statusCode}} ({{res.responseTime}}ms)", colorize: true }));
app.use(express.static("public"));
const context = { User, Group, Channel, Message, DMMessage, users, groups, onlineUsernames, friendRequests, sfu, groupController };

io.on("connection", (socket) => {
  logger.info(`Yeni bağlantı: ${socket.id}`);

  users[socket.id] = {
    username: null,
    currentGroup: null,
    currentRoom: null,
    micEnabled: true,
    selfDeafened: false,
    isScreenSharing: false,
    screenShareProducerId: null,
    hasMic: true,
    watching: new Set(),
    watchers: new Set()
  };
  authController(io, socket, { User, users, onlineUsernames, groupController });
  groupController.register(io, socket, context);
  friendController(io, socket, context);
  registerMediaEvents(io, socket, {
    groups,
    users,
    sfu,
    broadcastAllChannelsData: groupController.broadcastAllChannelsData.bind(null, io, users, groups),
    logger
  });
  registerTextChannelEvents(socket, { Channel, Message, User });
  socket.on("disconnect", () => { groupController.handleDisconnect(io, socket, context); });
});

// Express hata middleware'i (route'lardan sonra olacak!)
app.use(expressWinston.errorLogger({
  winstonInstance: logger
}));

// Merkezi hata yakalayıcı
app.use((err, req, res, next) => {
  logger.error(`Unhandled error: ${err.message} - URL: ${req.originalUrl} - Method: ${req.method}`); // Winston ile loglama
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Sunucu hatası'
  });
});

process.on('uncaughtException', (err) => {
  logger.error(`Uncaught Exception: ${err.message}`);
  process.exit(1); // güvenli çıkış yapalım
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error(`Unhandled Rejection: ${reason}`);
  process.exit(1); // güvenli çıkış yapalım
});

server.listen(PORT, () => {
  console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
});