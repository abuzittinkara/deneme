/**************************************
 * server.js
 **************************************/
require('dotenv').config();

const http = require('http');
const express = require('express');
const socketIO = require('socket.io');
const WebSocket = require('ws'); // ws paketini dahil ettik
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid'); // UUID

const User = require('./models/User');
const Group = require('./models/Group');
const Channel = require('./models/Channel');
const Message = require('./models/Message'); // EK: Mesaj modeli
const DmMessage = require('./models/DmMessage'); // EK: DM mesaj modeli
const sfu = require('./sfu'); // Mediasoup SFU fonksiyonları

// Yeni: Text channel ile ilgili socket olaylarını yönetecek modül:
const registerTextChannelEvents = require('./modules/textChannel');

const app = express();
const server = http.createServer(app);

const io = socketIO(server, {
  wsEngine: WebSocket.Server
});

const uri = process.env.MONGODB_URI || "mongodb+srv://abuzorttin:HWZe7uK5yEAE@cluster0.vdrdy.mongodb.net/myappdb?retryWrites=true&w=majority";

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

// Bellek içi tablolar
const users = {};   // socket.id -> { username, currentGroup, currentRoom, micEnabled, selfDeafened, isScreenSharing, screenShareProducerId }
const groups = {};  // groupId -> { owner, name, users:[], rooms:{} }
const onlineUsernames = new Set();

// ***** EK: Arkadaşlık isteği ve arkadaş listesi için in‑memory veri yapıları *****
let friendRequests = {};  // key: hedef kullanıcı adı, value: [ { from, timestamp }, ... ]
// Eski in-memory "friends" yapısı kaldırıldı; kabul edilen arkadaşlıklar artık DB üzerinden tutulacak.
// ************************************************************************************

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

app.use(express.static("public"));

io.on('connection', (socket) => {
  console.log('Kullanıcı bağlandı:', socket.id);
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
        return;
      }
      const user = await User.findOne({ username });
      if (!user) {
        socket.emit('loginResult', { success: false, message: 'Kullanıcı bulunamadı.' });
        return;
      }
      const pwMatch = await bcrypt.compare(password, user.passwordHash);
      if (!pwMatch) {
        socket.emit('loginResult', { success: false, message: 'Yanlış parola.' });
        return;
      }
      socket.emit('loginResult', { success: true, username: user.username });
    } catch (err) {
      console.error(err);
      socket.emit('loginResult', { success: false, message: 'Giriş hatası.' });
    }
  });

  // REGISTER
  socket.on('register', async (userData) => {
    const { username, name, surname, birthdate, email, phone, password, passwordConfirm } = userData;
    if (!username || !name || !surname || !birthdate || !email || !phone ||
        !password || !passwordConfirm) {
      socket.emit('registerResult', { success: false, message: 'Tüm alanları doldurunuz.' });
      return;
    }
    if (username !== username.toLowerCase()) {
      socket.emit('registerResult', { success: false, message: 'Kullanıcı adı küçük harf olmalı.' });
      return;
    }
    if (password !== passwordConfirm) {
      socket.emit('registerResult', { success: false, message: 'Parolalar eşleşmiyor.' });
      return;
    }
    try {
      const existingUser = await User.findOne({ $or: [ { username }, { email } ] });
      if (existingUser) {
        socket.emit('registerResult', { success: false, message: 'Kullanıcı adı veya e-posta zaten alınmış.' });
        return;
      }
      const passwordHash = await bcrypt.hash(password, 10);
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
    } catch (err) {
      console.error(err);
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
    if (!groupName) return;
    const trimmed = groupName.trim();
    if (!trimmed) return;
    const userName = users[socket.id].username || null;
    if (!userName) {
      socket.emit('errorMessage', "Kullanıcı adınız tanımlı değil.");
      return;
    }
    const userDoc = await User.findOne({ username: userName });
    if (!userDoc) return;
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
    console.log(`Yeni grup: ${trimmed} (ID=${groupId}), owner=${userName}`);
    await sendGroupsListToUser(socket.id);
    broadcastGroupUsers(groupId);
  });

  socket.on('joinGroupByID', async (groupId) => {
    try {
      if (users[socket.id].currentGroup === groupId) {
        return;
      }
      const userName = users[socket.id].username || null;
      if (!userName) {
        socket.emit('errorMessage', "Kullanıcı adınız tanımlı değil.");
        return;
      }
      const userDoc = await User.findOne({ username: userName });
      if (!userDoc) {
        socket.emit('errorMessage', "Kullanıcı yok (DB).");
        return;
      }
      const groupDoc = await Group.findOne({ groupId });
      if (!groupDoc) {
        socket.emit('errorMessage', "Böyle bir grup yok (DB).");
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
      console.log(`User ${socket.id} => joinGroupByID => ${groupId}`);
      await sendGroupsListToUser(socket.id);
      sendRoomsListToUser(socket.id, groupId);
      broadcastAllChannelsData(groupId);
      await broadcastGroupUsers(groupId);
    } catch (err) {
      console.error("joinGroupByID hata:", err);
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
      if (!groups[groupId]) return;
      if (!roomName) return;
      const trimmed = roomName.trim();
      if (!trimmed) return;
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
      console.log(`Yeni oda: group=${groupId}, room=${roomId}, name=${trimmed}, type=${channelType}`);
      sendRoomsListToUser(socket.id, groupId);
      broadcastRoomsListToGroup(groupId);
      broadcastAllChannelsData(groupId);
    } catch (err) {
      console.error("createRoom hata:", err);
    }
  });

  socket.on('joinRoom', async ({ groupId, roomId }) => {
    if (!groups[groupId]) return;
    if (!groups[groupId].rooms[roomId]) return;
    const userData = users[socket.id];
    if (!userData.username) {
      socket.emit('errorMessage', "Kullanıcı adınız tanımsız => Kanala eklenemiyor.");
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
    io.to(`${groupId}::${roomId}`).emit('roomUsers', rmObj.users);
    broadcastAllChannelsData(groupId);
    socket.emit('joinRoomAck', { groupId, roomId });
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
    if (!groups[groupId]) return;
    if (groups[groupId].owner !== userName) {
      socket.emit('errorMessage', "Bu grubu değiştirme yetkiniz yok.");
      return;
    }
    try {
      const groupDoc = await Group.findOne({ groupId });
      if (!groupDoc) {
        socket.emit('errorMessage', "Grup DB'de yok.");
        return;
      }
      groupDoc.name = newName;
      await groupDoc.save();
      groups[groupId].name = newName;
      io.to(groupId).emit('groupRenamed', { groupId, newName });
      console.log(`Grup rename => ${groupId}, yeni isim=${newName}`);
    } catch (err) {
      console.error("renameGroup hata:", err);
      socket.emit('errorMessage', "Grup ismi değiştirilirken hata oluştu.");
    }
  });

  socket.on('deleteGroup', async (grpId) => {
    const userName = users[socket.id].username;
    if (!groups[grpId]) {
      socket.emit('errorMessage', "Grup bellekte yok.");
      return;
    }
    if (groups[grpId].owner !== userName) {
      socket.emit('errorMessage', "Bu grubu silmeye yetkiniz yok.");
      return;
    }
    try {
      const groupDoc = await Group.findOne({ groupId: grpId }).populate('users');
      if (!groupDoc) {
        socket.emit('errorMessage', "Grup DB'de bulunamadı.");
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
      console.log(`Grup silindi => ${grpId}`);
      io.emit('groupDeleted', { groupId: grpId });
    } catch (err) {
      console.error("deleteGroup hata:", err);
      socket.emit('errorMessage', "Grup silinirken hata oluştu.");
    }
  });

  socket.on('renameChannel', async (payload) => {
    try {
      const { channelId, newName } = payload;
      if (!channelId || !newName) return;
      const chDoc = await Channel.findOne({ channelId });
      if (!chDoc) {
        socket.emit('errorMessage', "Kanal DB'de bulunamadı.");
        return;
      }
      chDoc.name = newName;
      await chDoc.save();
      const groupDoc = await Group.findById(chDoc.group);
      if (!groupDoc) return;
      const gId = groupDoc.groupId;
      if (!groups[gId] || !groups[gId].rooms[channelId]) return;
      groups[gId].rooms[channelId].name = newName;
      broadcastRoomsListToGroup(gId);
      broadcastAllRoomsUsers(gId);
      broadcastAllChannelsData(gId);
      console.log(`Kanal rename => ${channelId} => ${newName}`);
    } catch (err) {
      console.error("renameChannel hata:", err);
      socket.emit('errorMessage', "Kanal ismi değiştirilirken hata oluştu.");
    }
  });

  socket.on('deleteChannel', async (channelId) => {
    try {
      if (!channelId) return;
      const chDoc = await Channel.findOne({ channelId });
      if (!chDoc) {
        socket.emit('errorMessage', "Kanal DB'de bulunamadı.");
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
      console.log(`Kanal silindi => ${channelId}`);
    } catch (err) {
      console.error("deleteChannel hata:", err);
      socket.emit('errorMessage', "Kanal silinirken hata oluştu.");
    }
  });

  socket.on('createWebRtcTransport', async ({ groupId, roomId }, callback) => {
    try {
      if (!groups[groupId] || !groups[groupId].rooms[roomId]) {
        return callback({ error: "Group/Room bulunamadı" });
      }
      const rmObj = groups[groupId].rooms[roomId];
      const router = rmObj.router;
      if (!router) {
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
    } catch (err) {
      console.error("createWebRtcTransport error:", err);
      callback({ error: err.message });
    }
  });

  socket.on('connectTransport', async ({ groupId, roomId, transportId, dtlsParameters }, callback) => {
    try {
      const rmObj = groups[groupId]?.rooms[roomId];
      if (!rmObj) return callback({ error: "Room bulunamadı" });
      const transport = rmObj.transports?.[transportId];
      if (!transport) return callback({ error: "Transport bulunamadı" });
      await sfu.connectTransport(transport, dtlsParameters);
      callback({ connected: true });
    } catch (err) {
      console.error("connectTransport error:", err);
      callback({ error: err.message });
    }
  });

  socket.on('produce', async ({ groupId, roomId, transportId, kind, rtpParameters }, callback) => {
    try {
      const rmObj = groups[groupId]?.rooms[roomId];
      if (!rmObj) return callback({ error: "Room bulunamadı" });
      const transport = rmObj.transports?.[transportId];
      if (!transport) return callback({ error: "Transport bulunamadı" });
      const producer = await sfu.produce(transport, kind, rtpParameters);
      producer.appData = { peerId: socket.id };
      rmObj.producers = rmObj.producers || {};
      rmObj.producers[producer.id] = producer;
      socket.broadcast.to(`${groupId}::${roomId}`).emit('newProducer', { producerId: producer.id });
      callback({ producerId: producer.id });
    } catch (err) {
      console.error("produce error:", err);
      callback({ error: err.message });
    }
  });

  socket.on('consume', async ({ groupId, roomId, transportId, producerId }, callback) => {
    try {
      const rmObj = groups[groupId]?.rooms[roomId];
      if (!rmObj) return callback({ error: "Room bulunamadı" });
      const router = rmObj.router;
      if (!router) return callback({ error: "Router yok" });
      const transport = rmObj.transports?.[transportId];
      if (!transport) return callback({ error: "Transport bulunamadı" });
      const producer = rmObj.producers?.[producerId];
      if (!producer) return callback({ error: "Producer bulunamadı" });
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
    } catch (err) {
      console.error("consume error:", err);
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

  // --- EK: DM sohbet event handler'ları ---
  socket.on('joinDM', async (data, callback) => {
    // data: { friend: friendUsername }
    const currentUsername = users[socket.id]?.username;
    if (!currentUsername) {
      return callback({ success: false, message: 'Kullanıcı tanınamadı.' });
    }
    try {
      const messages = await DmMessage.find({
        $or: [
          { from: currentUsername, to: data.friend },
          { from: data.friend, to: currentUsername }
        ]
      }).sort({ timestamp: 1 }).lean();
      callback({ success: true, messages });
    } catch (err) {
      console.error("joinDM error:", err);
      callback({ success: false, message: 'DM mesajları alınırken hata oluştu.' });
    }
  });

  socket.on('dmMessage', async (data, callback) => {
    // data: { friend: friendUsername, content: messageContent }
    const senderUsername = users[socket.id]?.username;
    if (!senderUsername) {
      return callback({ success: false, message: 'Gönderen kullanıcı bulunamadı.' });
    }
    try {
      const newDmMsg = new DmMessage({
        from: senderUsername,
        to: data.friend,
        content: data.content,
        timestamp: new Date()
      });
      await newDmMsg.save();

      // Gönderen kullanıcıya mesajı ilet
      socket.emit('newDMMessage', { friend: data.friend, message: { username: senderUsername, content: data.content, timestamp: newDmMsg.timestamp } });

      // Hedef kullanıcı online ise mesajı ilet
      let targetSocketId = null;
      for (const id in users) {
        if (users[id].username === data.friend) {
          targetSocketId = id;
          break;
        }
      }
      if (targetSocketId) {
        io.to(targetSocketId).emit('newDMMessage', { friend: senderUsername, message: { username: senderUsername, content: data.content, timestamp: newDmMsg.timestamp } });
      }
      callback({ success: true });
    } catch (err) {
      console.error("dmMessage error:", err);
      callback({ success: false, message: 'Mesaj gönderilirken hata oluştu.' });
    }
  });
  // --- EK: DM sohbet event handler'ları sonu ---

  socket.on("disconnect", async () => {
    console.log("disconnect:", socket.id);
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

const PORT = process.env.PORT || 80;
server.listen(PORT, () => {
  console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
});
