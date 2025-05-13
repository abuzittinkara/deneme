/**************************************
 * server.js
 **************************************/
require('dotenv').config();

const http = require('http');
const express = require('express');
const socketIO = require('socket.io');
const WebSocket = require('ws');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const helmet = require('helmet');
const { body, validationResult } = require('express-validator');
const DOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');
const rateLimit = require('express-rate-limit');

const window = new JSDOM('').window;
const purify = DOMPurify(window);

const User = require('./models/User');
const Group = require('./models/Group');
const Channel = require('./models/Channel');
const Message = require('./models/Message');
const DMMessage = require('./models/DMMessage');
const sfu = require('./sfu');
const registerTextChannelEvents = require('./modules/textChannel');
const expressWinston = require('express-winston');
const logger = require('./utils/logger');

const app = express();
const server = http.createServer(app);

const io = socketIO(server, {
  wsEngine: WebSocket.Server
});

const uri = process.env.MONGODB_URI;
mongoose.connect(uri)
  .then(async () => {
    console.log("MongoDB bağlantısı başarılı!");
    await sfu.createWorkers();
    console.log("Mediasoup Workers hazır!");
    await loadGroupsFromDB();
    await loadChannelsFromDB();
    console.log("Uygulama başlangıç yüklemeleri tamam.");
  })
  .catch(err => {
    console.error("MongoDB bağlantı hatası:", err);
  });

// Helmet middleware'i ekle
app.use(helmet());

// Rate limiting middleware'i ekle
app.use(rateLimit({
  windowMs: 1 * 60 * 1000, // 1 dakika
  max: 60, // 1 dakikada maksimum 60 istek
  message: "Çok fazla istek gönderdiniz, lütfen daha sonra tekrar deneyin."
}));

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


async function loadGroupsFromDB() {
  try {
    const groupDocs = await Group.find({});
    groupDocs.forEach(groupDoc => {
      groups[groupDoc.groupId] = {
        owner: groupDoc.owner,
        name: groupDoc.name,
        users: [],
        rooms: {}
      };
    });
    console.log("loadGroupsFromDB tamam, groups:", Object.keys(groups));
  } catch (err) {
    console.error("loadGroupsFromDB hata:", err);
  }
}

async function loadChannelsFromDB() {
  try {
    const channelDocs = await Channel.find({}).populate('group');
    channelDocs.forEach(ch => {
      if (!ch.group) return;
      const groupId = ch.group.groupId;
      if (!groups[groupId]) return;
      groups[groupId].rooms[ch.channelId] = {
        name: ch.name,
        type: ch.type,
        users: []
      };
    });
    console.log("loadChannelsFromDB tamam.");
  } catch (err) {
    console.error("loadChannelsFromDB hata:", err);
  }
}

// Güncellenmiş sendGroupsListToUser fonksiyonu: Kullanıcının DB'deki gruplarını çekip socket'e gönderiyor.
async function sendGroupsListToUser(socketId) {
  const userData = users[socketId];
  if (!userData || !userData.username) return;
  try {
    const userDoc = await User.findOne({ username: userData.username }).populate('groups');
    if (!userDoc) return;
    const groupList = userDoc.groups.map(g => ({
      id: g.groupId,
      name: g.name,
      owner: g.owner
    }));
    io.to(socketId).emit('groupsList', groupList);
  } catch (err) {
    console.error("sendGroupsListToUser hatası:", err);
  }
}

function getAllChannelsData(groupId) {
  if (!groups[groupId]) return {};
  const channelsObj = {};
  Object.keys(groups[groupId].rooms).forEach(roomId => {
    const rm = groups[groupId].rooms[roomId];
    channelsObj[roomId] = {
      name: rm.name,
      type: rm.type,
      users: rm.users
    };
  });
  return channelsObj;
}

function broadcastAllRoomsUsers(groupId) {
  if (!groups[groupId]) return;
  Object.keys(groups[groupId].rooms).forEach(roomId => {
    io.to(`${groupId}::${roomId}`).emit('roomUsers', groups[groupId].rooms[roomId].users);
  });
}

async function getOnlineOfflineDataForGroup(groupId) {
  const groupDoc = await Group.findOne({ groupId }).populate('users');
  if (!groupDoc) return { online: [], offline: [] };
  const online = [];
  const offline = [];
  groupDoc.users.forEach(u => {
    if (onlineUsernames.has(u.username)) {
      online.push({ username: u.username });
    } else {
      offline.push({ username: u.username });
    }
  });
  return { online, offline };
}

async function broadcastGroupUsers(groupId) {
  if (!groupId) return;
  try {
    const { online, offline } = await getOnlineOfflineDataForGroup(groupId);
    io.to(groupId).emit('groupUsers', { online, offline });
  } catch (err) {
    console.error("broadcastGroupUsers hata:", err);
  }
}

async function sendGroupUsersToOneUser(socketId, groupId) {
  if (!groupId) return;
  try {
    const { online, offline } = await getOnlineOfflineDataForGroup(groupId);
    io.to(socketId).emit('groupUsers', { online, offline });
  } catch (err) {
    console.error("sendGroupUsersToOneUser hata:", err);
  }
}

function broadcastAllChannelsData(groupId) {
  if (!groups[groupId]) return;
  const channelsObj = getAllChannelsData(groupId);
  io.to(groupId).emit('allChannelsData', channelsObj);
}

function sendRoomsListToUser(socketId, groupId) {
  if (!groups[groupId]) return;
  const groupObj = groups[groupId];
  const roomArray = Object.keys(groupObj.rooms).map(rId => ({
    id: rId,
    name: groupObj.rooms[rId].name,
    type: groupObj.rooms[rId].type
  }));
  io.to(socketId).emit('roomsList', roomArray);
}

function broadcastRoomsListToGroup(groupId) {
  if (!groups[groupId]) return;
  const groupObj = groups[groupId];
  const roomArray = Object.keys(groupObj.rooms).map(rId => ({
    id: rId,
    name: groupObj.rooms[rId].name,
    type: groupObj.rooms[rId].type
  }));
  io.to(groupId).emit('roomsList', roomArray);
}

function sendAllChannelsDataToOneUser(socketId, groupId) {
  if (!groups[groupId]) return;
  const channelsObj = getAllChannelsData(groupId);
  io.to(socketId).emit('allChannelsData', channelsObj);
}

function removeUserFromAllGroupsAndRooms(socket) {
  const socketId = socket.id;
  Object.keys(groups).forEach(groupId => {
    const grpObj = groups[groupId];
    grpObj.users = grpObj.users.filter(u => u.id !== socketId);
    Object.keys(grpObj.rooms).forEach(roomId => {
      const rmObj = grpObj.rooms[roomId];
      rmObj.users = rmObj.users.filter(u => u.id !== socketId);
      if (rmObj.producers) {
        Object.keys(rmObj.producers).forEach(pid => {
          const producer = rmObj.producers[pid];
          if (producer && producer.appData && producer.appData.peerId === socketId) {
            sfu.closeProducer(producer);
            delete rmObj.producers[pid];
          }
        });
      }
      if (rmObj.consumers) {
        Object.keys(rmObj.consumers).forEach(cid => {
          const consumer = rmObj.consumers[cid];
          if (consumer && consumer.appData && consumer.appData.peerId === socketId) {
            sfu.closeConsumer(consumer);
            delete rmObj.consumers[cid];
          }
        });
      }
      if (rmObj.transports) {
        Object.keys(rmObj.transports).forEach(tid => {
          const tr = rmObj.transports[tid];
          if (tr && tr.appData && tr.appData.peerId === socketId) {
            sfu.closeTransport(tr);
            delete rmObj.transports[tid];
          }
        });
      }
      io.to(`${groupId}::${roomId}`).emit('roomUsers', rmObj.users);
      socket.leave(`${groupId}::${roomId}`);
    });
    socket.leave(groupId);
  });
  if (users[socket.id]) {
    users[socket.id].currentGroup = null;
    users[socket.id].currentRoom = null;
  }
}

app.use(expressWinston.logger({
  winstonInstance: logger,
  meta: false, // Ayrıntılı meta bilgilerini kapatır
  msg: "{{req.method}} {{req.url}} - {{res.statusCode}} ({{res.responseTime}}ms)",
  colorize: true,
}));
app.use(express.static("public"));

// Örnek bir giriş endpoint'i için express-validator entegrasyonu
app.post('/login', [
  body('username').isString().isLength({ min: 3, max: 20 }).trim(),
  body('password').isString().isLength({ min: 6 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { username, password } = req.body;
  // Mevcut kod...
});

io.on('connection', (socket) => {
  logger.info(`Yeni bağlantı: ${socket.id}`);
  users[socket.id] = {
    username: null,
    currentGroup: null,
    currentRoom: null,
    micEnabled: true,
    selfDeafened: false,
    isScreenSharing: false,
    screenShareProducerId: null
  };

  // LOGIN
  socket.on('login', async ({ username, password }) => {
    try {
      if (!username || !password) {
        socket.emit('loginResult', { success: false, message: 'Eksik bilgiler' });
        logger.warn('Login attempt failed (eksik bilgi): %s', username);
        return;
      }
      const user = await User.findOne({ username });
      if (!user) {
        socket.emit('loginResult', { success: false, message: 'Kullanıcı bulunamadı.' });
        logger.warn('Login attempt failed (kullanıcı bulunamadı): %s', username);
        return;
      }
      const pwMatch = await bcrypt.compare(password, user.passwordHash);
      if (!pwMatch) {
        socket.emit('loginResult', { success: false, message: 'Yanlış parola.' });
        logger.warn('Login attempt failed (yanlış parola): %s', username);
        return;
      }
      socket.emit('loginResult', { success: true, username: user.username });
      logger.info('User logged in: %s', username);
    } catch (err) {
      logger.error('Login error: %o', err);
      socket.emit('loginResult', { success: false, message: 'Giriş hatası.' });
    }
  });

  // REGISTER — **GÜNCELLEME BAŞLADI**
  socket.on('register', async (userData) => {
    const { username, name, surname, birthdate, email, phone, password, passwordConfirm } = userData;

    try {
      // 1) Zorunlu alan kontrolü
      if (!username || !name || !surname || !birthdate || !email || !phone || !password || !passwordConfirm) {
        socket.emit('registerResult', { success: false, message: 'Tüm alanları doldurunuz.' });
        logger.warn('Register attempt failed (eksik bilgi): %s', username);
        return;
      }
      // 2) Kullanıcı adı küçük harf olmalı
      if (username !== username.toLowerCase()) {
        socket.emit('registerResult', { success: false, message: 'Kullanıcı adı küçük harf olmalı.' });
        logger.warn('Register attempt failed (kullanıcı adı küçük harf değil): %s', username);
        return;
      }
      // 3) Parola eşleşme kontrolü
      if (password !== passwordConfirm) {
        socket.emit('registerResult', { success: false, message: 'Parolalar eşleşmiyor.' });
        logger.warn('Register attempt failed (parolalar eşleşmiyor): %s', username);
        return;
      }
      // 4) Parola karmaşıklık kontrolü
      //    En az 8 karakter, bir büyük harf, bir küçük harf, bir rakam ve bir özel karakter
      const complexityRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
      if (!complexityRegex.test(password)) {
        socket.emit('registerResult', {
          success: false,
          message: 'Parola en az 8 karakter, bir büyük harf, bir küçük harf, bir rakam ve bir özel karakter içermeli.'
        });
        logger.warn('Register attempt failed (parola karmaşıklığı yetersiz): %s', username);
        return;
      }

      const existingUser = await User.findOne({ $or: [{ username }, { email }] });
      if (existingUser) {
        socket.emit('registerResult', { success: false, message: 'Kullanıcı adı veya e-posta zaten alınmış.' });
        logger.warn('Register attempt failed (kullanıcı adı/e-posta alınmış): %s', username);
        return;
      }
      const passwordHash = await bcrypt.hash(password, 12);
      const newUser = new User({
        username,
        passwordHash,
        name,
        surname,
        birthdate: new Date(birthdate),
        email,
        phone,
        groups: [],
        friends: []
      });
      await newUser.save();
      socket.emit('registerResult', { success: true });
      logger.info('User registered: %s', username);
    } catch (err) {
      logger.error('Register error: %o', err);
      socket.emit('registerResult', { success: false, message: 'Kayıt hatası.' });
    }
  });

  // set-username
  socket.on('set-username', async (usernameVal) => {
    if (usernameVal && typeof usernameVal === 'string') {
      const trimmedName = usernameVal.trim();
      users[socket.id].username = trimmedName;
      console.log(`User ${socket.id} => set-username => ${trimmedName}`);
      onlineUsernames.add(trimmedName);
      try {
        await sendGroupsListToUser(socket.id);
      } catch (err) {
        console.error("sendGroupsListToUser hata:", err);
      }
      try {
        const userDoc = await User.findOne({ username: trimmedName }).populate('groups');
        if (userDoc && userDoc.groups.length > 0) {
          for (const gDoc of userDoc.groups) {
            broadcastGroupUsers(gDoc.groupId);
          }
        }
      } catch (err) {
        console.error("userDoc groups fetch hata:", err);
      }
    }
  });

  socket.on('audioStateChanged', ({ micEnabled, selfDeafened }) => {
    if (!users[socket.id]) return;
    users[socket.id].micEnabled = micEnabled;
    users[socket.id].selfDeafened = selfDeafened;
    const gId = users[socket.id].currentGroup;
    if (gId) {
      broadcastAllChannelsData(gId);
    }
  });

  socket.on('screenShareStatusChanged', ({ isScreenSharing }) => {
    if (users[socket.id]) {
      users[socket.id].isScreenSharing = isScreenSharing;
      const gId = users[socket.id].currentGroup;
      if (gId) {
        broadcastAllChannelsData(gId);
      }
    }
  });

  socket.on('screenShareStarted', ({ producerId }) => {
    if (users[socket.id]) {
      users[socket.id].screenShareProducerId = producerId;
      const gId = users[socket.id].currentGroup;
      if (gId) {
        broadcastAllChannelsData(gId);
      }
    }
  });

  socket.on('screenShareEnded', () => {
    const userData = users[socket.id];
    if (userData && userData.currentGroup && userData.currentRoom) {
      socket.to(`${userData.currentGroup}::${userData.currentRoom}`).emit('screenShareEnded', { userId: socket.id });
    }
  });

  socket.on('typing', (data) => {
    socket.to(data.channel).emit('typing', data);
  });
  socket.on('stop typing', (data) => {
    socket.to(data.channel).emit('stop typing', data);
  });

  socket.on('createGroup', async (groupName) => {
    try {
      if (!groupName) {
        logger.warn('Create group attempt failed (grup adı yok)');
        return;
      }
      const trimmed = groupName.trim();
      if (!trimmed) {
        logger.warn('Create group attempt failed (grup adı boş)');
        return;
      }
      const userName = users[socket.id].username || null;
      if (!userName) {
        socket.emit('errorMessage', "Kullanıcı adınız tanımlı değil.");
        logger.warn('Create group attempt failed (kullanıcı adı tanımsız)');
        return;
      }
      const userDoc = await User.findOne({ username: userName });
      if (!userDoc) {
        logger.warn('Create group attempt failed (kullanıcı DB\'de yok): %s', userName);
        return;
      }
      const groupId = uuidv4();
      const newGroup = new Group({
        groupId,
        name: trimmed,
        owner: userDoc._id,
        users: [ userDoc._id ]
      });
      await newGroup.save();
      userDoc.groups.push(newGroup._id);
      await userDoc.save();
      groups[groupId] = {
        owner: userName, 
        name: trimmed,
        users: [ { id: socket.id, username: userName } ],
        rooms: {}
      };
      logger.info(`Yeni grup: ${trimmed} (ID=${groupId}), owner=${userName}`);
      await sendGroupsListToUser(socket.id);
      broadcastGroupUsers(groupId);
    } catch (err) {
      logger.error('Create group error: %o', err);
      socket.emit('errorMessage', 'Grup oluşturulurken bir hata oluştu.');
    }
  });

  socket.on('joinGroupByID', async (groupId) => {
    try {
      if (users[socket.id].currentGroup === groupId) {
        logger.info('User %s already in group %s', users[socket.id].username, groupId);
        return;
      }
      const userName = users[socket.id].username || null;
      if (!userName) {
        socket.emit('errorMessage', "Kullanıcı adınız tanımlı değil.");
        logger.warn('Join group by ID failed (kullanıcı adı tanımsız)');
        return;
      }
      const userDoc = await User.findOne({ username: userName });
      if (!userDoc) {
        socket.emit('errorMessage', "Kullanıcı yok (DB).");
        logger.warn('Join group by ID failed (kullanıcı DB\'de yok): %s', userName);
        return;
      }
      const groupDoc = await Group.findOne({ groupId });
      if (!groupDoc) {
        socket.emit('errorMessage', "Böyle bir grup yok (DB).");
        logger.warn('Join group by ID failed (grup DB\'de yok): %s', groupId);
        return;
      }
      if (!groupDoc.users.some(u => u.toString() === userDoc._id.toString())) {
        groupDoc.users.push(userDoc._id);
        await groupDoc.save();
      }
      if (!userDoc.groups.some(g => g.toString() === groupDoc._id.toString())) {
        userDoc.groups.push(groupDoc._id);
        await userDoc.save();
      }
      if (!groups[groupId]) {
        const ownerUser = await User.findById(groupDoc.owner);
        let ownerUsername = ownerUser ? ownerUser.username : null;
        groups[groupId] = {
          owner: ownerUsername,
          name: groupDoc.name,
          users: [],
          rooms: {}
        };
      }
      removeUserFromAllGroupsAndRooms(socket);
      const userData = users[socket.id];
      if (!userData.username) {
        socket.emit('errorMessage', "Kullanıcı adınız yok, kanala eklenemiyorsunuz.");
        return;
      }
      if (!groups[groupId].users.some(u => u.id === socket.id)) {
        groups[groupId].users.push({ id: socket.id, username: userData.username });
      }
      userData.currentGroup = groupId;
      userData.currentRoom = null;
      socket.join(groupId);
      logger.info(`User ${socket.id} (${userName}) => joinGroupByID => ${groupId}`);
      await sendGroupsListToUser(socket.id);
      sendRoomsListToUser(socket.id, groupId);
      broadcastAllChannelsData(groupId);
      await broadcastGroupUsers(groupId);
    } catch (err) {
      logger.error("joinGroupByID hata: %o", err);
      socket.emit('errorMessage', 'Gruba katılırken bir hata oluştu.');
    }
  });

  socket.on('browseGroup', async (groupId) => {
    if (!groups[groupId]) return;
    socket.join(groupId);
    sendRoomsListToUser(socket.id, groupId);
    sendAllChannelsDataToOneUser(socket.id, groupId);
    await sendGroupUsersToOneUser(socket.id, groupId);
  });

  socket.on('joinGroup', async (groupId) => {
    if (!groups[groupId]) return;
    if (users[socket.id].currentGroup === groupId) {
      return;
    }
    removeUserFromAllGroupsAndRooms(socket);
    const userData = users[socket.id];
    const userName = userData.username;
    if (!userName) {
      socket.emit('errorMessage', "Kullanıcı adınız yok.");
      return;
    }
    if (!groups[groupId].users.some(u => u.id === socket.id)) {
      groups[groupId].users.push({ id: socket.id, username: userName });
    }
    userData.currentGroup = groupId;
    userData.currentRoom = null;
    socket.join(groupId);
    sendRoomsListToUser(socket.id, groupId);
    broadcastAllChannelsData(groupId);
    await broadcastGroupUsers(groupId);
  });

  socket.on('createRoom', async ({ groupId, roomName, channelType }) => {
    try {
      if (!groups[groupId]) {
        logger.warn('Create room failed (grup bellekte yok): %s', groupId);
        return;
      }
      if (!roomName) {
        logger.warn('Create room failed (oda adı yok)');
        return;
      }
      const trimmed = roomName.trim();
      if (!trimmed) {
        logger.warn('Create room failed (oda adı boş)');
        return;
      }
      channelType = channelType || 'text';
      const groupDoc = await Group.findOne({ groupId });
      if (!groupDoc) return;
      const roomId = uuidv4();
      const newChannel = new Channel({
        channelId: roomId,
        name: trimmed,
        group: groupDoc._id,
        type: channelType,
        users: []
      });
      await newChannel.save();
      if (channelType === 'voice') {
        const router = await sfu.createRouter(roomId);
        groups[groupId].rooms[roomId] = {
          name: trimmed,
          type: channelType,
          users: [],
          router: router,
          producers: {},
          consumers: {},
          transports: {}
        };
      } else {
        groups[groupId].rooms[roomId] = {
          name: trimmed,
          type: channelType,
          users: []
        };
      }
      logger.info(`Yeni oda: group=${groupId}, room=${roomId}, name=${trimmed}, type=${channelType}`);
      sendRoomsListToUser(socket.id, groupId);
      broadcastRoomsListToGroup(groupId);
      broadcastAllChannelsData(groupId);
    } catch (err) {
      logger.error("createRoom hata: %o", err);
      socket.emit('errorMessage', 'Oda oluşturulurken bir hata oluştu.');
    }
  });

  socket.on('joinRoom', async ({ groupId, roomId }) => {
    try {
      if (!groups[groupId]) {
        logger.warn('Join room failed (grup bellekte yok): %s', groupId);
        return;
      }
      if (!groups[groupId].rooms[roomId]) {
        logger.warn('Join room failed (oda bellekte yok): %s/%s', groupId, roomId);
        return;
      }
      const userData = users[socket.id];
      if (!userData.username) {
        socket.emit('errorMessage', "Kullanıcı adınız tanımsız => Kanala eklenemiyor.");
        logger.warn('Join room failed (kullanıcı adı tanımsız)');
        return;
      }
      if (userData.currentGroup === groupId && userData.currentRoom === roomId) {
        return; 
      }
      if (userData.isScreenSharing) {
        socket.emit('screenShareEnded');
        userData.isScreenSharing = false;
        userData.screenShareProducerId = null;
      }
      if (userData.currentGroup === groupId && userData.currentRoom && groups[groupId].rooms[userData.currentRoom]) {
        const prevRoom = groups[groupId].rooms[userData.currentRoom];
        prevRoom.users = prevRoom.users.filter(u => u.id !== socket.id);
        io.to(`${groupId}::${userData.currentRoom}`).emit('roomUsers', prevRoom.users);
        socket.leave(`${groupId}::${userData.currentRoom}`);
        if (prevRoom.producers) {
          Object.keys(prevRoom.producers).forEach(pid => {
            const producer = prevRoom.producers[pid];
            if (producer && producer.appData && producer.appData.peerId === socket.id) {
              sfu.closeProducer(producer);
              delete prevRoom.producers[pid];
            }
          });
        }
        userData.isScreenSharing = false;
        userData.screenShareProducerId = null;
        io.to(`${groupId}::${userData.currentRoom}`).emit('screenShareEnded', { userId: socket.id });
      } else {
        removeUserFromAllGroupsAndRooms(socket);
      }
      const rmObj = groups[groupId].rooms[roomId];
      if (rmObj.type === 'voice' && !rmObj.router) {
        console.log(`joinRoom => oda ${roomId} için router yok, şimdi oluşturuyoruz...`);
        const router = await sfu.createRouter(roomId);
        rmObj.router = router;
        rmObj.producers = rmObj.producers || {};
        rmObj.consumers = rmObj.consumers || {};
        rmObj.transports = rmObj.transports || {};
      }
      const userName = userData.username;
      if (!groups[groupId].users.some(u => u.id === socket.id)) {
        groups[groupId].users.push({ id: socket.id, username: userName });
      }
      rmObj.users.push({ id: socket.id, username: userName });
      userData.currentGroup = groupId;
      userData.currentRoom = roomId;
      users[socket.id].isScreenSharing = false;
      users[socket.id].screenShareProducerId = null;
      socket.join(groupId);
      socket.join(`${groupId}::${roomId}`);
      logger.info('User %s joined room %s/%s', userName, groupId, roomId);
      io.to(`${groupId}::${roomId}`).emit('roomUsers', rmObj.users);
      broadcastAllChannelsData(groupId);
      socket.emit('joinRoomAck', { groupId, roomId });
    } catch (err) {
      logger.error('Join room error: %o', err);
      socket.emit('errorMessage', 'Odaya katılırken bir hata oluştu.');
    }
  });

  socket.on('leaveRoom', ({ groupId, roomId }) => {
    if (!groups[groupId]) return;
    if (!groups[groupId].rooms[roomId]) return;
    const rmObj = groups[groupId].rooms[roomId];
    if (rmObj.producers) {
      Object.keys(rmObj.producers).forEach(pid => {
        const producer = rmObj.producers[pid];
        if (producer && producer.appData && producer.appData.peerId === socket.id) {
          sfu.closeProducer(producer);
          delete rmObj.producers[pid];
        }
      });
    }
    if (rmObj.consumers) {
      Object.keys(rmObj.consumers).forEach(cid => {
        const consumer = rmObj.consumers[cid];
        if (consumer && consumer.appData && consumer.appData.peerId === socket.id) {
          sfu.closeConsumer(consumer);
          delete rmObj.consumers[cid];
        }
      });
    }
    if (rmObj.transports) {
      Object.keys(rmObj.transports).forEach(tid => {
        const tr = rmObj.transports[tid];
        if (tr && tr.appData && tr.appData.peerId === socket.id) {
          sfu.closeTransport(tr);
          delete rmObj.transports[tid];
        }
      });
    }
    rmObj.users = rmObj.users.filter(u => u.id !== socket.id);
    io.to(`${groupId}::${roomId}`).emit('roomUsers', rmObj.users);
    socket.leave(`${groupId}::${roomId}`);
    users[socket.id].currentRoom = null;
    broadcastAllChannelsData(groupId);
  });

  socket.on('renameGroup', async (data) => {
    const { groupId, newName } = data;
    const userName = users[socket.id].username;
    try {
      if (!groups[groupId]) {
        logger.warn('Rename group failed (grup bellekte yok): %s', groupId);
        return;
      }
      if (groups[groupId].owner !== userName) {
        socket.emit('errorMessage', "Bu grubu değiştirme yetkiniz yok.");
        logger.warn('Rename group failed (yetki yok): %s by %s', groupId, userName);
        return;
      }
      const groupDoc = await Group.findOne({ groupId });
      if (!groupDoc) {
        socket.emit('errorMessage', "Grup DB'de yok.");
        logger.warn('Rename group failed (grup DB\'de yok): %s', groupId);
        return;
      }
      groupDoc.name = newName;
      await groupDoc.save();
      groups[groupId].name = newName;
      io.to(groupId).emit('groupRenamed', { groupId, newName });
      logger.info(`Grup rename => ${groupId}, yeni isim=${newName}`);
    } catch (err) {
      logger.error("renameGroup hata: %o", err);
      socket.emit('errorMessage', "Grup ismi değiştirilirken hata oluştu.");
    }
  });

  socket.on('deleteGroup', async (grpId) => {
    const userName = users[socket.id].username;
    try {
      if (!groups[grpId]) {
        socket.emit('errorMessage', "Grup bellekte yok.");
        logger.warn('Delete group failed (grup bellekte yok): %s', grpId);
        return;
      }
      if (groups[grpId].owner !== userName) {
        socket.emit('errorMessage', "Bu grubu silmeye yetkiniz yok.");
        logger.warn('Delete group failed (yetki yok): %s by %s', grpId, userName);
        return;
      }
      const groupDoc = await Group.findOne({ groupId: grpId }).populate('users');
      if (!groupDoc) {
        socket.emit('errorMessage', "Grup DB'de bulunamadı.");
        logger.warn('Delete group failed (grup DB\'de yok): %s', grpId);
        return;
      }
      if (groupDoc.users && groupDoc.users.length > 0) {
        for (const userId of groupDoc.users) {
          const usr = await User.findById(userId);
          if (usr && usr.groups.includes(groupDoc._id)) {
            usr.groups = usr.groups.filter(gRef => gRef.toString() !== groupDoc._id.toString());
            await usr.save();
          }
        }
      }
      await Group.deleteOne({ _id: groupDoc._id });
      await Channel.deleteMany({ group: groupDoc._id });
      delete groups[grpId];
      logger.info(`Grup silindi => ${grpId}`);
      io.emit('groupDeleted', { groupId: grpId });
    } catch (err) {
      logger.error("deleteGroup hata: %o", err);
      socket.emit('errorMessage', "Grup silinirken hata oluştu.");
    }
  });

  socket.on('renameChannel', async (payload) => {
    try {
      const { channelId, newName } = payload;
      if (!channelId || !newName) {
        logger.warn('Rename channel failed (eksik parametre)');
        return;
      }
      const chDoc = await Channel.findOne({ channelId });
      if (!chDoc) {
        socket.emit('errorMessage', "Kanal DB'de bulunamadı.");
        logger.warn('Rename channel failed (kanal DB\'de yok): %s', channelId);
        return;
      }
      chDoc.name = newName;
      await chDoc.save();
      const groupDoc = await Group.findById(chDoc.group);
      if (!groupDoc) return;
      const gId = groupDoc.groupId;
      if (!groups[gId] || !groups[gId].rooms[channelId]) {
        logger.warn('Rename channel failed (grup/oda bellekte yok): %s/%s', gId, channelId);
        return;
      }
      groups[gId].rooms[channelId].name = newName;
      broadcastRoomsListToGroup(gId);
      broadcastAllRoomsUsers(gId);
      broadcastAllChannelsData(gId);
      logger.info(`Kanal rename => ${channelId} => ${newName}`);
    } catch (err) {
      logger.error("renameChannel hata: %o", err);
      socket.emit('errorMessage', "Kanal ismi değiştirilirken hata oluştu.");
    }
  });

  socket.on('deleteChannel', async (channelId) => {
    try {
      if (!channelId) {
        logger.warn('Delete channel failed (kanal ID yok)');
        return;
      }
      const chDoc = await Channel.findOne({ channelId });
      if (!chDoc) {
        socket.emit('errorMessage', "Kanal DB'de bulunamadı.");
        logger.warn('Delete channel failed (kanal DB\'de yok): %s', channelId);
        return;
      }
      await Channel.deleteOne({ _id: chDoc._id });
      const groupDoc = await Group.findById(chDoc.group);
      if (!groupDoc) return;
      const gId = groupDoc.groupId;
      if (groups[gId] && groups[gId].rooms[channelId]) {
        delete groups[gId].rooms[channelId];
      }
      broadcastRoomsListToGroup(gId);
      broadcastAllRoomsUsers(gId);
      broadcastAllChannelsData(gId);
      logger.info(`Kanal silindi => ${channelId}`);
    } catch (err) {
      logger.error("deleteChannel hata: %o", err);
      socket.emit('errorMessage', "Kanal silinirken hata oluştu.");
    }
  });

  socket.on('createWebRtcTransport', async ({ groupId, roomId }, callback) => {
    try {
      if (!groups[groupId] || !groups[groupId].rooms[roomId]) {
        logger.warn('createWebRtcTransport failed (grup/oda bellekte yok): %s/%s', groupId, roomId);
        return callback({ error: "Group/Room bulunamadı" });
      }
      const rmObj = groups[groupId].rooms[roomId];
      const router = rmObj.router;
      if (!router) {
        logger.warn('createWebRtcTransport failed (router yok): %s/%s', groupId, roomId);
        return callback({ error: "Router tanımsız (room'da yok)" });
      }
      const transport = await sfu.createWebRtcTransport(router);
      transport.appData = { peerId: socket.id };
      rmObj.transports = rmObj.transports || {};
      rmObj.transports[transport.id] = transport;
      callback({
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
        routerRtpCapabilities: router.rtpCapabilities
      });
      logger.info('WebRTC transport created for user %s in room %s/%s', users[socket.id]?.username, groupId, roomId);
    } catch (err) {
      logger.error("createWebRtcTransport error: %o", err);
      callback({ error: err.message });
    }
  });

  socket.on('connectTransport', async ({ groupId, roomId, transportId, dtlsParameters }, callback) => {
    try {
      const rmObj = groups[groupId]?.rooms[roomId];
      if (!rmObj) {
        logger.warn('connectTransport failed (oda bellekte yok): %s/%s', groupId, roomId);
        return callback({ error: "Room bulunamadı" });
      }
      const transport = rmObj.transports?.[transportId];
      if (!transport) {
        logger.warn('connectTransport failed (transport bellekte yok): %s/%s, transportId: %s', groupId, roomId, transportId);
        return callback({ error: "Transport bulunamadı" });
      }
      await sfu.connectTransport(transport, dtlsParameters);
      callback({ connected: true });
      logger.info('Transport connected for user %s in room %s/%s, transportId: %s', users[socket.id]?.username, groupId, roomId, transportId);
    } catch (err) {
      logger.error("connectTransport error: %o", err);
      callback({ error: err.message });
    }
  });

  socket.on('produce', async ({ groupId, roomId, transportId, kind, rtpParameters }, callback) => {
    try {
      const rmObj = groups[groupId]?.rooms[roomId];
      if (!rmObj) {
        logger.warn('Produce failed (oda bellekte yok): %s/%s', groupId, roomId);
        return callback({ error: "Room bulunamadı" });
      }
      const transport = rmObj.transports?.[transportId];
      if (!transport) {
        logger.warn('Produce failed (transport bellekte yok): %s/%s, transportId: %s', groupId, roomId, transportId);
        return callback({ error: "Transport bulunamadı" });
      }
      const producer = await sfu.produce(transport, kind, rtpParameters);
      producer.appData = { peerId: socket.id };
      rmObj.producers = rmObj.producers || {};
      rmObj.producers[producer.id] = producer;
      socket.broadcast.to(`${groupId}::${roomId}`).emit('newProducer', { producerId: producer.id });
      callback({ producerId: producer.id });
      logger.info('Producer created for user %s in room %s/%s, kind: %s', users[socket.id]?.username, groupId, roomId, kind);
    } catch (err) {
      logger.error("produce error: %o", err);
      callback({ error: err.message });
    }
  });

  socket.on('consume', async ({ groupId, roomId, transportId, producerId }, callback) => {
    try {
      const rmObj = groups[groupId]?.rooms[roomId];
      if (!rmObj) {
        logger.warn('Consume failed (oda bellekte yok): %s/%s', groupId, roomId);
        return callback({ error: "Room bulunamadı" });
      }
      const router = rmObj.router;
      if (!router) {
        logger.warn('Consume failed (router yok): %s/%s', groupId, roomId);
        return callback({ error: "Router yok" });
      }
      const transport = rmObj.transports?.[transportId];
      if (!transport) {
        logger.warn('Consume failed (transport bellekte yok): %s/%s, transportId: %s', groupId, roomId, transportId);
        return callback({ error: "Transport bulunamadı" });
      }
      const producer = rmObj.producers?.[producerId];
      if (!producer) {
        logger.warn('Consume failed (producer bellekte yok): %s/%s, producerId: %s', groupId, roomId, producerId);
        return callback({ error: "Producer bulunamadı" });
      }
      const consumer = await sfu.consume(router, transport, producer);
      consumer.appData = { peerId: producer.appData.peerId };
      rmObj.consumers = rmObj.consumers || {};
      rmObj.consumers[consumer.id] = consumer;
      const { producerId: prId, id, kind, rtpParameters } = consumer;
      callback({
        producerId: prId,
        id,
        kind,
        rtpParameters,
        producerPeerId: producer.appData.peerId
      });
      logger.info('Consumer created for user %s in room %s/%s, consuming producerId: %s', users[socket.id]?.username, groupId, roomId, producerId);
    } catch (err) {
      logger.error("consume error: %o", err);
      callback({ error: err.message });
    }
  });

  socket.on('listProducers', ({ groupId, roomId }, callback) => {
    try {
      const rmObj = groups[groupId]?.rooms[roomId];
      if (!rmObj || !rmObj.producers) {
        return callback([]);
      }
      const producers = Object.values(rmObj.producers).map(producer => ({
        id: producer.id,
        peerId: (producer.appData && producer.appData.peerId) ? producer.appData.peerId : null
      }));
      callback(producers);
    } catch (err) {
      console.error("listProducers error:", err);
      callback([]);
    }
  });

  // Text channel olayları
  registerTextChannelEvents(socket, { Channel, Message, User });

  // ***** EK: Arkadaşlık isteği event handler’ları *****
  socket.on('sendFriendRequest', (data, callback) => {
    const fromUsername = users[socket.id]?.username;
    try {
      if (!fromUsername) {
        logger.warn('Send friend request failed (gönderen kullanıcı adı tanımsız)');
        return callback({ success: false, message: 'Kullanıcı adı tanımlı değil.' });
      }
      const targetUsername = data.to;
      if (!targetUsername) {
        logger.warn('Send friend request failed (hedef kullanıcı adı yok)');
        return callback({ success: false, message: 'Hedef kullanıcı adı belirtilmedi.' });
      }
      if (!friendRequests[targetUsername]) {
        friendRequests[targetUsername] = [];
      }
      const exists = friendRequests[targetUsername].some(req => req.from === fromUsername);
      if (exists) {
        logger.warn('Send friend request failed (istek zaten var): %s -> %s', fromUsername, targetUsername);
        return callback({ success: false, message: 'Zaten arkadaşlık isteği gönderildi.' });
      }
      friendRequests[targetUsername].push({ from: fromUsername, timestamp: new Date() });
      callback({ success: true });
      logger.info('Friend request sent: %s -> %s', fromUsername, targetUsername);
    } catch (err) {
      logger.error('Send friend request error: %o', err);
      callback({ success: false, message: 'Arkadaşlık isteği gönderilirken bir hata oluştu.' });
    }
  });

  socket.on('getPendingFriendRequests', (data, callback) => {
    const username = users[socket.id]?.username;
    if (!username) {
      return callback({ success: false, message: 'Kullanıcı adı tanımlı değil.' });
    }
    const requests = friendRequests[username] || [];
    callback({ success: true, requests });
  });

  socket.on('getOutgoingFriendRequests', (data, callback) => {
    try {
      const username = users[socket.id]?.username;
      if (!username) {
        return callback({ success: false, message: 'Kullanıcı adı tanımlı değil.' });
      }
      const outgoing = [];
      for (const target in friendRequests) {
        friendRequests[target].forEach(req => {
          if (req.from === username) {
            outgoing.push({ to: target, timestamp: req.timestamp });
          }
        });
      }
      callback({ success: true, requests: outgoing });
    } catch (err) {
      console.error("getOutgoingFriendRequests error:", err);
      callback({ success: false, message: 'Gönderilen istekler alınırken hata oluştu.' });
    }
  });

  socket.on('acceptFriendRequest', async (data, callback) => {
    try {
      const username = users[socket.id]?.username;
      if (!username) {
        logger.warn('Accept friend request failed (kullanıcı adı tanımsız)');
        return callback({ success: false, message: 'Kullanıcı adı tanımlı değil.' });
      }
      const fromUsername = data.from;
      if (!fromUsername) {
        logger.warn('Accept friend request failed (istek gönderen kullanıcı adı yok)');
        return callback({ success: false, message: 'Kimin isteği kabul edileceği belirtilmedi.' });
      }
      
      // Remove pending friend request in memory
      if (friendRequests[username]) {
        friendRequests[username] = friendRequests[username].filter(req => req.from !== fromUsername);
      }
      
      // Get both user documents from DB
      const userDoc = await User.findOne({ username });
      const friendDoc = await User.findOne({ username: fromUsername });
      if (!userDoc || !friendDoc) {
        logger.warn('Accept friend request failed (kullanıcılar DB\'de yok): %s, %s', username, fromUsername);
        return callback({ success: false, message: 'Kullanıcılar bulunamadı.' });
      }
      
      // Check if friend already added, if not, add them
      if (!userDoc.friends.includes(friendDoc._id)) {
        userDoc.friends.push(friendDoc._id);
      }
      if (!friendDoc.friends.includes(userDoc._id)) {
        friendDoc.friends.push(userDoc._id);
      }
      
      await userDoc.save();
      await friendDoc.save();
      
      callback({ success: true });
      logger.info('Friend request accepted: %s <- %s', username, fromUsername);
    } catch (err) {
      logger.error("acceptFriendRequest error: %o", err);
      callback({ success: false, message: 'Arkadaşlık isteği kabul edilirken hata oluştu.' });
    }
  });

  socket.on('rejectFriendRequest', (data, callback) => {
    const username = users[socket.id]?.username;
    try {
      if (!username) {
        logger.warn('Reject friend request failed (kullanıcı adı tanımsız)');
        return callback({ success: false, message: 'Kullanıcı adı tanımlı değil.' });
      }
      const fromUsername = data.from;
      if (!fromUsername) {
        logger.warn('Reject friend request failed (istek gönderen kullanıcı adı yok)');
        return callback({ success: false, message: 'Kimin isteği reddedileceği belirtilmedi.' });
      }
      if (friendRequests[username]) {
        friendRequests[username] = friendRequests[username].filter(req => req.from !== fromUsername);
      }
      callback({ success: true });
      logger.info('Friend request rejected: %s <- %s', username, fromUsername);
    } catch (err) {
      logger.error('Reject friend request error: %o', err);
      callback({ success: false, message: 'Arkadaşlık isteği reddedilirken bir hata oluştu.' });
    }
  });

  socket.on('cancelFriendRequest', (data, callback) => {
    const fromUsername = users[socket.id]?.username;
    try {
      if (!fromUsername) {
        logger.warn('Cancel friend request failed (gönderen kullanıcı adı tanımsız)');
        return callback({ success: false, message: 'Kullanıcı adı tanımlı değil.' });
      }
      const targetUsername = data.to;
      if (!targetUsername) {
        logger.warn('Cancel friend request failed (hedef kullanıcı adı yok)');
        return callback({ success: false, message: 'Hedef kullanıcı adı belirtilmedi.' });
      }
      if (friendRequests[targetUsername]) {
        friendRequests[targetUsername] = friendRequests[targetUsername].filter(req => req.from !== fromUsername);
      }
      callback({ success: true });
      logger.info('Friend request cancelled: %s -> %s', fromUsername, targetUsername);
    } catch (err) {
      logger.error('Cancel friend request error: %o', err);
      callback({ success: false, message: 'Arkadaşlık isteği iptal edilirken bir hata oluştu.' });
    }
  });

  socket.on('removeFriend', async (data, callback) => {
    const username = users[socket.id]?.username;
    try {
      if (!username) {
        logger.warn('Remove friend failed (kullanıcı adı tanımsız)');
        return callback({ success: false, message: 'Kullanıcı adı tanımlı değil.' });
      }
      const friendUsername = data.friendUsername;
      if (!friendUsername) {
        logger.warn('Remove friend failed (arkadaş kullanıcı adı yok)');
        return callback({ success: false, message: 'Arkadaş kullanıcı adı belirtilmedi.' });
      }
      const userDoc = await User.findOne({ username });
      const friendDoc = await User.findOne({ username: friendUsername });
      if (!userDoc || !friendDoc) {
        logger.warn('Remove friend failed (kullanıcılar DB\'de yok): %s, %s', username, friendUsername);
        return callback({ success: false, message: 'Kullanıcılar bulunamadı.' });
      }
      userDoc.friends = userDoc.friends.filter(friendId => friendId.toString() !== friendDoc._id.toString());
      friendDoc.friends = friendDoc.friends.filter(friendId => friendId.toString() !== userDoc._id.toString());
      await userDoc.save();
      await friendDoc.save();
      callback({ success: true });
      logger.info('Friend removed: %s <-> %s', username, friendUsername);
    } catch (err) {
      logger.error('Remove friend error: %o', err);
      callback({ success: false, message: 'Arkadaş silinirken bir hata oluştu.' });
    }
  });

  socket.on('blockUser', async (data, callback) => {
    const username = users[socket.id]?.username;
    try {
      if (!username) {
        logger.warn('Block user failed (kullanıcı adı tanımsız)');
        return callback({ success: false, message: 'Kullanıcı adı tanımlı değil.' });
      }
      const targetUsername = data.targetUsername;
      if (!targetUsername) {
        logger.warn('Block user failed (hedef kullanıcı adı yok)');
        return callback({ success: false, message: 'Hedef kullanıcı adı belirtilmedi.' });
      }
      const userDoc = await User.findOne({ username });
      const targetDoc = await User.findOne({ username: targetUsername });
      if (!userDoc || !targetDoc) {
        logger.warn('Block user failed (kullanıcılar DB\'de yok): %s, %s', username, targetUsername);
        return callback({ success: false, message: 'Kullanıcılar bulunamadı.' });
      }
      if (!userDoc.blockedUsers.includes(targetDoc._id)) {
        userDoc.blockedUsers.push(targetDoc._id);
        await userDoc.save();
      }
      callback({ success: true });
      logger.info('User blocked: %s -> %s', username, targetUsername);
    } catch (err) {
      logger.error('Block user error: %o', err);
      callback({ success: false, message: 'Kullanıcı engellenirken bir hata oluştu.' });
    }
  });

  socket.on('unblockUser', async (data, callback) => {
    const username = users[socket.id]?.username;
    try {
      if (!username) {
        logger.warn('Unblock user failed (kullanıcı adı tanımsız)');
        return callback({ success: false, message: 'Kullanıcı adı tanımlı değil.' });
      }
      const targetUsername = data.targetUsername;
      if (!targetUsername) {
        logger.warn('Unblock user failed (hedef kullanıcı adı yok)');
        return callback({ success: false, message: 'Hedef kullanıcı adı belirtilmedi.' });
      }
      const userDoc = await User.findOne({ username });
      const targetDoc = await User.findOne({ username: targetUsername });
      if (!userDoc || !targetDoc) {
        logger.warn('Unblock user failed (kullanıcılar DB\'de yok): %s, %s', username, targetUsername);
        return callback({ success: false, message: 'Kullanıcılar bulunamadı.' });
      }
      userDoc.blockedUsers = userDoc.blockedUsers.filter(userId => userId.toString() !== targetDoc._id.toString());
      await userDoc.save();
      callback({ success: true });
      logger.info('User unblocked: %s -> %s', username, targetUsername);
    } catch (err) {
      logger.error('Unblock user error: %o', err);
      callback({ success: false, message: 'Kullanıcı engeli kaldırılırken bir hata oluştu.' });
    }
  });

  socket.on('getFriendsList', async (data, callback) => {
    const username = users[socket.id]?.username;
    try {
      if (!username) {
        logger.warn('Get friends list failed (kullanıcı adı tanımsız)');
        return callback({ success: false, message: 'Kullanıcı adı tanımlı değil.' });
      }
      const userDoc = await User.findOne({ username }).populate('friends');
      if (!userDoc) {
        logger.warn('Get friends list failed (kullanıcı DB\'de yok): %s', username);
        return callback({ success: false, message: 'Kullanıcı bulunamadı.' });
      }
      const friends = userDoc.friends.map(friend => ({
        username: friend.username,
        isOnline: onlineUsernames.has(friend.username) 
      }));
      callback({ success: true, friends });
    } catch (err) {
      logger.error('Get friends list error: %o', err);
      callback({ success: false, message: 'Arkadaş listesi alınırken bir hata oluştu.' });
    }
  });

  socket.on('getBlockedUsersList', async (data, callback) => {
    const username = users[socket.id]?.username;
    try {
      if (!username) {
        logger.warn('Get blocked users list failed (kullanıcı adı tanımsız)');
        return callback({ success: false, message: 'Kullanıcı adı tanımlı değil.' });
      }
      const userDoc = await User.findOne({ username }).populate('blockedUsers');
      if (!userDoc) {
        logger.warn('Get blocked users list failed (kullanıcı DB\'de yok): %s', username);
        return callback({ success: false, message: 'Kullanıcı bulunamadı.' });
      }
      const blockedUsers = userDoc.blockedUsers.map(user => ({
        username: user.username
      }));
      callback({ success: true, blockedUsers });
    } catch (err) {
      logger.error('Get blocked users list error: %o', err);
      callback({ success: false, message: 'Engellenen kullanıcı listesi alınırken bir hata oluştu.' });
    }
  });

  socket.on('sendDM', async (data, callback) => {
    const fromUsername = users[socket.id]?.username;
    try {
      if (!fromUsername) {
        logger.warn('Send DM failed (gönderen kullanıcı adı tanımsız)');
        return callback({ success: false, message: 'Kullanıcı adı tanımlı değil.' });
      }
      const { toUsername, content } = data;
      if (!toUsername || !content) {
        logger.warn('Send DM failed (eksik parametre): from %s to %s', fromUsername, toUsername);
        return callback({ success: false, message: 'Eksik parametre.' });
      }
      const fromUserDoc = await User.findOne({ username: fromUsername });
      const toUserDoc = await User.findOne({ username: toUsername });
      if (!fromUserDoc || !toUserDoc) {
        logger.warn('Send DM failed (kullanıcılar DB\'de yok): from %s to %s', fromUsername, toUsername);
        return callback({ success: false, message: 'Kullanıcılar bulunamadı.' });
      }
      // Check if sender is blocked by receiver
      if (toUserDoc.blockedUsers.includes(fromUserDoc._id)) {
          logger.warn('Send DM failed (gönderen engellenmiş): from %s to %s', fromUsername, toUsername);
          return callback({ success: false, message: 'Bu kullanıcıya mesaj gönderemezsiniz.' });
      }
      const dmMessage = new DMMessage({
        from: fromUserDoc._id,
        to: toUserDoc._id,
        content: content
      });
      await dmMessage.save();
      // Emit to receiver if online
      Object.keys(users).forEach(socketId => {
        if (users[socketId].username === toUsername) {
          io.to(socketId).emit('receiveDM', {
            from: fromUsername,
            content: content,
            timestamp: dmMessage.timestamp
          });
        }
      });
      callback({ success: true, timestamp: dmMessage.timestamp });
      logger.info('DM sent: %s -> %s', fromUsername, toUsername);
    } catch (err) {
      logger.error('Send DM error: %o', err);
      callback({ success: false, message: 'DM gönderilirken bir hata oluştu.' });
    }
  });

  socket.on('getDMMessages', async (data, callback) => {
    const username = users[socket.id]?.username;
    try {
      if (!username) {
        logger.warn('Get DM messages failed (kullanıcı adı tanımsız)');
        return callback({ success: false, message: 'Kullanıcı adı tanımlı değil.' });
      }
      const otherUsername = data.otherUsername;
      if (!otherUsername) {
        logger.warn('Get DM messages failed (diğer kullanıcı adı yok): %s', username);
        return callback({ success: false, message: 'Diğer kullanıcı adı belirtilmedi.' });
      }
      const userDoc = await User.findOne({ username });
      const otherUserDoc = await User.findOne({ username: otherUsername });
      if (!userDoc || !otherUserDoc) {
        logger.warn('Get DM messages failed (kullanıcılar DB\'de yok): %s, %s', username, otherUsername);
        return callback({ success: false, message: 'Kullanıcılar bulunamadı.' });
      }
      const messages = await DMMessage.find({
        $or: [
          { from: userDoc._id, to: otherUserDoc._id },
          { from: otherUserDoc._id, to: userDoc._id }
        ]
      }).sort({ timestamp: 1 }).populate('from', 'username');

      callback({ success: true, messages: messages.map(m => ({ 
          from: m.from.username, 
          content: m.content, 
          timestamp: m.timestamp 
      }))});
    } catch (err) {
      logger.error('Get DM messages error: %o', err);
      callback({ success: false, message: 'DM mesajları alınırken bir hata oluştu.' });
    }
  });

  // Socket.IO input sanitizasyonu
  socket.on('sendMessage', async ({ message }) => {
    const safeMessage = purify.sanitize(message);
    // Veritabanına güvenli mesajı kaydet
  });

  socket.on("disconnect", async () => {
    logger.info('Kullanıcı bağlantıyı sonlandırdı: %s, username: %s', socket.id, users[socket.id]?.username);
    const userData = users[socket.id];
    if (userData) {
      const { username } = userData;
      if (username) {
        onlineUsernames.delete(username);
      }
    }
    removeUserFromAllGroupsAndRooms(socket);
    delete users[socket.id];
  });
});

// Express hata middleware’i (route'lardan sonra olacak!)
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
});