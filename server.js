require('dotenv').config();

const express = require('express');
const socketIO = require('socket.io');
const WebSocket = require('ws');
const http = require('http');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const DOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');
const purify = DOMPurify(new JSDOM('').window);
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const store = require('./utils/sharedStore');

const { MONGODB_URI, PORT, rateLimitOptions, helmetCspOptions } = require('./config/appConfig');
const { connectToDatabase } = require('./config/database');

const User = require('./models/User');
const Group = require('./models/Group');
const Channel = require('./models/Channel');
const Category = require('./models/Category');
const Message = require('./models/Message');
const DMMessage = require('./models/DmMessage');
const GroupMember = require('./models/GroupMember');
const sfu = require('./sfu');
const registerTextChannelEvents = require('./modules/textChannel');
const registerMediaEvents = require('./modules/mediaEvents');
const registerDMChatEvents = require('./modules/dmChat');
const emitChannelUnread = require('./utils/emitChannelUnread');
const expressWinston = require('express-winston');
const logger = require('./utils/logger');
const jwt = require('./utils/jwt');

const authController = require("./controllers/authController");
const groupController = require("./controllers/groupController");
const friendController = require("./controllers/friendController");
const createUserRouter = require('./routes/user');

const app = express();
app.set('trust proxy', 1); // Proxy güvendiğimizi belirt

// Allow JSON bodies up to 1MB so avatar uploads don't trigger 413 errors
app.use(express.json({ limit: '1mb' }));
// Use provided CORS_ORIGIN or allow all origins when empty
const corsOrigin = process.env.CORS_ORIGIN || true;
app.use(cors({ origin: corsOrigin, credentials: true }));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const raw = String(req.body.userId || req.body.username || '').trim();
    const safe =
      raw &&
      /^[a-zA-Z0-9_-]+$/.test(raw) &&
      !raw.includes('..') &&
      !raw.includes('/') &&
      !raw.includes('\\')
        ? raw
        : 'anonymous';
    const dest = path.join(__dirname, 'uploads', safe);
    fs.mkdirSync(dest, { recursive: true });
    cb(null, dest);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '');
    cb(null, `${uuidv4()}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } });

app.use('/uploads', express.static('uploads'));

const server = http.createServer(app);

const io = socketIO(server, {
  wsEngine: WebSocket.Server
});

io.use((socket, next) => {
  const auth = socket.handshake.auth || {};
  const token = auth.token || (socket.handshake.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) {
    socket.user = null;
    return next();
  }
  try {
    socket.user = jwt.verify(token);
    next();
  } catch (err) {
    next(new Error('auth_error'));
  }
});

// In-memory Socket.IO instance

async function startServer() {
  try {
    await connectToDatabase();
    await sfu.createWorkers();
    logger.info("Mediasoup Workers hazır!");
    await groupController.loadGroupsFromDB({ Group, groups });
    const catCount = await groupController.loadCategoriesFromDB({ Category, groups });
    const chCount = await groupController.loadChannelsFromDB({ Channel, groups });
    const grpCount = Object.keys(groups).length;
    const totalCh = Object.values(groups).reduce((a,g)=>a+Object.keys(g.rooms).length,0);
    const channelsLoaded = chCount || totalCh;
    logger.info(`Startup: groups=${grpCount}, categories=${catCount}, channels=${channelsLoaded}`);
    logger.info("Uygulama başlangıç yüklemeleri tamam.");

    const requiredFiles = [
      path.join(__dirname, 'public', 'app.js'),
      path.join(__dirname, 'public', 'bundle.js'),
      path.join(__dirname, 'public', 'libs', 'mediasoup-client.min.js')
    ];
    const missing = requiredFiles.filter(f => !fs.existsSync(f));
    if (missing.length) {
      const names = missing.map(f => path.relative(__dirname, f)).join(', ');
      logger.error(`Missing build files: ${names}. Run \"npm run build\" or \"npm run build:react\".`);
      process.exit(1);
    }

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
    contentSecurityPolicy: helmetCspOptions
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

function verifyToken(req, res, next) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'missing_token' });
  try {
    req.user = jwt.verify(token);
    next();
  } catch (err) {
    res.status(401).json({ error: 'invalid_token' });
  }
}

app.use('/api', verifyToken);

const userRouter = createUserRouter(io);
app.use('/api/user', userRouter);

function cleanupUploadedFiles(files) {
  if (Array.isArray(files)) {
    return Promise.all(
      files.map(f => fs.promises.unlink(f.path).catch(() => {}))
    );
  }
  return Promise.resolve();
}

app.post('/api/message', (req, res) => {
  upload.array('files', 10)(req, res, async err => {
    if (err) {
      logger.error(`File upload error: ${err.message}`);
      await cleanupUploadedFiles(req.files);
      return res.status(413).json({
        error: 'file_too_large',
        message: 'Attachment exceeds 25MB limit.'
      });
    }

    const { userId, username, channelId, content } = req.body || {};
    const noContent = content === undefined || content === null || content === '';
    const noFiles = !Array.isArray(req.files) || req.files.length === 0;
    if ((!userId && !username) || !channelId || (noContent && noFiles)) {
      logger.warn('Missing required fields in /api/message', {
        userId,
        username,
        channelId
      });
      await cleanupUploadedFiles(req.files);
      return res.status(400).json({
        error: 'missing_params',
        message: 'userId or username, channelId and content or files are required.'
      });
    }

    try {
      let channelDoc = await Channel.findOne({ channelId });
      if (channelDoc && typeof channelDoc.populate === 'function') {
        channelDoc = await channelDoc.populate('group');
      }
      const userDoc = userId
        ? await User.findById(userId)
        : await User.findOne({ username });

      if (!channelDoc) {
        await cleanupUploadedFiles(req.files);
        return res.status(404).json({ error: 'channel_not_found' });
      }
      if (!userDoc) {
        await cleanupUploadedFiles(req.files);
        return res.status(404).json({ error: 'user_not_found' });
      }

      const totalSize = Array.isArray(req.files)
        ? req.files.reduce((sum, f) => sum + f.size, 0)
        : 0;
      if (totalSize > 100 * 1024 * 1024) {
        await cleanupUploadedFiles(req.files);
        return res.status(413).json({
          error: 'batch_limit_exceeded',
          message: 'Combined files exceed 100MB.'
        });
      }

      const folder = req.files[0]
        ? path.basename(path.dirname(req.files[0].path))
        : '';
      const attachments = (req.files || []).map(f => ({
        id: f.filename,
        url: `/uploads/${folder}/${f.filename}`,
        type: f.mimetype
      }));

      const clean = purify.sanitize(content, {
        ALLOWED_TAGS: [],
        ALLOWED_ATTR: []
      });
      const mentionRegex = /@([A-Za-z0-9_]+)/g;
      const mentions = [];
      let m;
      while ((m = mentionRegex.exec(clean))) {
        const uname = m[1];
        if (uname && uname !== userDoc.username && !mentions.includes(uname)) {
          mentions.push(uname);
        }
      }
      const msg = new Message({
        channel: channelDoc._id,
        user: userDoc._id,
        content: clean,
        attachments,
        timestamp: new Date()
      });
      await msg.save();

      const payload = {
        channelId,
        message: {
          content: msg.content,
          username: userDoc.username,
          timestamp: msg.timestamp,
          attachments
        }
      };

      io.to(channelId).emit('newTextMessage', payload);
      if (channelDoc.group && channelDoc.group.groupId) {
        await emitChannelUnread(
          io,
          channelDoc.group.groupId,
          channelId,
          Group,
          Channel,
          userSessions,
          GroupMember,
          users,
          mentions
        );
      }
      res.json({ success: true, message: payload });
    } catch (e) {
      logger.error('Failed to store message', {
        message: e.message,
        stack: e.stack
      });
      const response = {
        error: 'server_error',
        message: 'Unable to process message.'
      };
      if (process.env.NODE_ENV !== 'production') {
        response.detail = purify.sanitize(String(e.message || ''));
      }
      await cleanupUploadedFiles(req.files);
      res.status(500).json(response);
    }
  });
});

if (process.env.NODE_ENV !== 'production') {
  app.get('/debug/group-channel-count', (req, res) => {
    const groupCount = Object.keys(groups).length;
    const channelCount = Object.values(groups)
      .reduce((a, g) => a + Object.keys(g.rooms).length, 0);
    res.json({ groupCount, channelCount });
  });
}
const context = { User, Group, Channel, Category, Message, DMMessage, GroupMember, users, groups, onlineUsernames, userSessions, friendRequests, sfu, groupController, store };

io.on("connection", async (socket) => {
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
    watchers: [],
  });

  if (socket.user && socket.user.username) {
    users[socket.id].username = socket.user.username;
    onlineUsernames.add(socket.user.username);
    if (store) {
      store.setJSON(store.key('session', socket.id), users[socket.id]);
      store.addSetMember('onlineUsers', socket.user.username);
    }
  }
  authController(io, socket, { User, Group, GroupMember, users, onlineUsernames, groupController, store, userSessions });
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
  registerTextChannelEvents(io, socket, {
    Channel,
    Message,
    User,
    users,
    Group,
    userSessions,
    GroupMember
  });
  registerDMChatEvents(socket, { io, User, DMMessage, users, logger });
  if (socket.user && socket.user.username) {
    if (groupController && groupController.sendGroupsListToUser) {
      await groupController.sendGroupsListToUser(io, socket.id, { User, users, GroupMember });
    }
    if (socket.user.lastGroupId && groupController && groupController.sendRoomsListToUser) {
      await groupController.sendRoomsListToUser(io, socket.id, context, socket.user.lastGroupId);
    }
  }
  socket.on("disconnect", () => { groupController.handleDisconnect(io, socket, context); });
});

// 404 handler for unknown routes
app.use((req, res) => res.status(404).json({ error: 'not found' }));

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


const { setupErrorHandlers } = require('./utils/errorHandlers');
setupErrorHandlers();

if (process.env.NODE_ENV !== 'test') {
  startServer();
}

module.exports = { startServer, app };
