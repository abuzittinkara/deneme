require('dotenv').config();

const express = require('express');
const socketIO = require('socket.io');
const WebSocket = require('ws');
const http = require('http');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const store = require('./utils/sharedStore');

const { MONGODB_URI, PORT, rateLimitOptions, helmetCspOptions } = require('./config/appConfig');
const { connectToDatabase } = require('./config/database');

const User = require('./models/User');
const Group = require('./models/Group');
const Channel = require('./models/Channel');
const Message = require('./models/Message');
const DMMessage = require('./models/DmMessage');
const sfu = require('./sfu');
const registerTextChannelEvents = require('./modules/textChannel');
const registerMediaEvents = require('./modules/mediaEvents');
const registerDMChatEvents = require('./modules/dmChat');
const expressWinston = require('express-winston');
const logger = require('./utils/logger');

const authController = require("./controllers/authController");
const groupController = require("./controllers/groupController");
const friendController = require("./controllers/friendController");

const app = express();
app.set('trust proxy', 1); // Proxy güvendiğimizi belirt

app.use(express.json());

const server = http.createServer(app);

const io = socketIO(server, {
  wsEngine: WebSocket.Server
});

// In-memory Socket.IO instance

async function startServer() {
  try {
    await connectToDatabase();
    await sfu.createWorkers();
    logger.info("Mediasoup Workers hazır!");
    await groupController.loadGroupsFromDB({ Group, groups });
    await groupController.loadChannelsFromDB({ Channel, groups });
    logger.info("Uygulama başlangıç yüklemeleri tamam.");

    server.listen(PORT, () => {
      logger.info(`Sunucu çalışıyor: http://localhost:${PORT}`);
    });
  } catch (err) {
    logger.error("MongoDB bağlantı hatası:", err);
    process.exit(1);
  }
}

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

// --- Shared store backed objects --
const users = {};
const groups = {};
const onlineUsernames = new Set();
const userSessions = {};
let friendRequests = {};

// → Friend request'lerin 24 saat sonra otomatik temizlenmesi için TTL mekanizması
const FRIEND_REQUEST_TTL_MS = 24 * 60 * 60 * 1000;       // 24 saat
const FRIEND_REQUEST_CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // Her 1 saatte bir

const friendRequestCleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const username in friendRequests) {
    // Yaşayanları filtrele
    friendRequests[username] = friendRequests[username]
      .filter(req => now - new Date(req.timestamp).getTime() < FRIEND_REQUEST_TTL_MS);
    // Eğer hiç kalmadıysa tüm girişi sil
    if (friendRequests[username].length === 0) {
      delete friendRequests[username];
      store.del(store.key('friendreq', username));
    } else {
      store.setJSON(store.key('friendreq', username), friendRequests[username]);
    }
  }
}, FRIEND_REQUEST_CLEANUP_INTERVAL_MS);
friendRequestCleanupTimer.unref();

app.use(expressWinston.logger({ winstonInstance: logger, meta: false, msg: "{{req.method}} {{req.url}} - {{res.statusCode}} ({{res.responseTime}}ms)", colorize: true }));
app.use(express.static("public"));

// Basit kullanıcı API'si
app.get('/api/user/me', async (req, res) => {
  const username = req.query.username;
  if (!username) return res.status(400).json({ error: 'missing username' });
  try {
    const user = await User.findOne({ username });
    if (!user) return res.status(404).json({ error: 'not found' });
    res.json({
      displayName: user.name || '',
      username: user.username,
      email: user.email || '',
      phone: user.phone || ''
    });
  } catch (err) {
    res.status(500).json({ error: 'server error' });
  }
});

app.patch('/api/user/me', async (req, res) => {
  const username = req.query.username;
  const { field, value } = req.body || {};
  if (!username || !field) return res.status(400).json({ error: 'missing params' });
  const allowed = ['displayName', 'username', 'email', 'phone'];
  if (!allowed.includes(field)) return res.status(400).json({ error: 'invalid field' });
  try {
    const user = await User.findOne({ username });
    if (!user) return res.status(404).json({ error: 'not found' });
    if (field === 'username') {
      const newName = String(value || '').trim();
      const valid = /^[a-z0-9_]+$/.test(newName) && newName === newName.toLowerCase();
      if (!valid) {
        return res.status(400).json({ error: 'invalid_username', message: 'Username format is invalid' });
      }
      const existing = await User.findOne({ username: newName });
      if (existing) {
        return res.status(409).json({ error: 'username_taken', message: 'Username already taken' });
      }
      user.username = newName;
    } else if (field === 'displayName') {
      user.name = value;
    } else {
      user[field] = value;
    }
    await user.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'server error' });
  }
});
const context = { User, Group, Channel, Message, DMMessage, users, groups, onlineUsernames, userSessions, friendRequests, sfu, groupController, store };

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
  store.setJSON(store.key('session', socket.id), {
    username: null,
    currentGroup: null,
    currentRoom: null,
    micEnabled: true,
    selfDeafened: false,
    isScreenSharing: false,
    screenShareProducerId: null,
    hasMic: true,
    watching: [],
    watchers: []
  });
  authController(io, socket, { User, users, onlineUsernames, groupController, store, userSessions });
  groupController.register(io, socket, context);
  friendController(io, socket, context);
  registerMediaEvents(io, socket, {
    groups,
    users,
    sfu,
    broadcastAllChannelsData: groupController.broadcastAllChannelsData.bind(null, io, users, groups),
    logger,
    store
  });
  registerTextChannelEvents(socket, { Channel, Message, User });
  registerDMChatEvents(socket, { io, User, DMMessage, users, logger });
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
});

process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled Rejection: ${reason}`);
});

if (process.env.NODE_ENV !== 'test') {
  startServer();
}

module.exports = { startServer };
