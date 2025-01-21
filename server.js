/**************************************
 * server.js
 **************************************/
const http = require("http");
const express = require("express");
const socketIO = require("socket.io");
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid'); // UUID

const User = require('./models/User');
const Group = require('./models/Group');
const Channel = require('./models/Channel');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// MongoDB bağlantısı
const uri = process.env.MONGODB_URI || "mongodb+srv://abuzorttin:HWZe7uK5yEAE@cluster0.vdrdy.mongodb.net/myappdb?retryWrites=true&w=majority";
mongoose.connect(uri)
  .then(() => console.log("MongoDB bağlantısı başarılı!"))
  .catch(err => console.error("MongoDB bağlantı hatası:", err));

// Bellek içi tablolar (Anlık takip için)
const users = {};   // socket.id -> { username, currentGroup, currentRoom }
const groups = {};  // groupId -> { owner: <username>, name, users:[], rooms:{} }

// Çevrimiçi (online) olan kullanıcı adlarını tutuyoruz
const onlineUsernames = new Set();

app.use(express.static("public"));

/* 1) DB'den Grupları belleğe yükleme */
async function loadGroupsFromDB() {
  try {
    const allGroups = await Group.find({});
    allGroups.forEach(gDoc => {
      if (!groups[gDoc.groupId]) {
        groups[gDoc.groupId] = {
          owner: null, // Owner username (string) => ileride dolduracağız
          name: gDoc.name,
          users: [],
          rooms: {}
        };
      }
    });
    console.log("loadGroupsFromDB tamam, groups:", Object.keys(groups));
  } catch (err) {
    console.error("loadGroupsFromDB hatası:", err);
  }
}

/* 2) DB'den Kanal bilgilerini belleğe yükleme */
async function loadChannelsFromDB() {
  try {
    const allChannels = await Channel.find({}).populate('group');
    allChannels.forEach(ch => {
      if (!ch.group) return;
      const gId = ch.group.groupId;
      if (!groups[gId]) return;
      if (!groups[gId].rooms[ch.channelId]) {
        groups[gId].rooms[ch.channelId] = {
          name: ch.name,
          users: []
        };
      }
    });
    console.log("loadChannelsFromDB tamam.");
  } catch (err) {
    console.error("loadChannelsFromDB hatası:", err);
  }
}

// Uygulama başlarken DB'den verileri yükle
loadGroupsFromDB().then(() => loadChannelsFromDB());

/* groupId'deki Tüm Oda + Kullanıcı datasını döndürür => UI'ya "allChannelsData" için */
function getAllChannelsData(groupId) {
  if (!groups[groupId]) return {};
  const channelsObj = {};
  Object.keys(groups[groupId].rooms).forEach(roomId => {
    const rm = groups[groupId].rooms[roomId];
    channelsObj[roomId] = {
      name: rm.name,
      users: rm.users.map(u => ({
        id: u.id,
        username: u.username
      }))
    };
  });
  return channelsObj;
}

/* Tüm kanallardaki kullanıcı listesini tekrar yayınlar (roomUsers) */
function broadcastAllRoomsUsers(groupId) {
  if (!groups[groupId]) return;
  Object.keys(groups[groupId].rooms).forEach(roomId => {
    io.to(`${groupId}::${roomId}`).emit('roomUsers', groups[groupId].rooms[roomId].users);
  });
}

/* Bir kullanıcı hangi gruplarda/odalarda varsa hepsinden çıkarır (socket.leave vb.) */
function removeUserFromAllGroupsAndRooms(socket) {
  const socketId = socket.id;
  const userData = users[socketId];
  if (!userData) return;

  Object.keys(groups).forEach(gId => {
    const grpObj = groups[gId];
    if (grpObj.users.some(u => u.id === socketId)) {
      grpObj.users = grpObj.users.filter(u => u.id !== socketId);

      Object.keys(grpObj.rooms).forEach(rId => {
        grpObj.rooms[rId].users = grpObj.rooms[rId].users.filter(u => u.id !== socketId);
        io.to(`${gId}::${rId}`).emit('roomUsers', grpObj.rooms[rId].users);
      });
      io.to(gId).emit('allChannelsData', getAllChannelsData(gId));
    }
    Object.keys(grpObj.rooms).forEach(rId => {
      socket.leave(`${gId}::${rId}`);
    });
    socket.leave(gId);
  });

  users[socketId].currentGroup = null;
  users[socketId].currentRoom = null;
}

/* DB'den gruba ait kullanıcıları alıp => online/offline listesi */
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
  try {
    const { online, offline } = await getOnlineOfflineDataForGroup(groupId);
    io.to(socketId).emit('groupUsers', { online, offline });
  } catch (err) {
    console.error("sendGroupUsersToOneUser hata:", err);
  }
}

/* Tüm group'a => allChannelsData */
function broadcastAllChannelsData(groupId) {
  if (!groups[groupId]) return;
  const channelsObj = getAllChannelsData(groupId);
  io.to(groupId).emit('allChannelsData', channelsObj);
}

/* Tek user'a => allChannelsData */
function sendAllChannelsDataToOneUser(socketId, groupId) {
  if (!groups[groupId]) return;
  const channelsObj = getAllChannelsData(groupId);
  io.to(socketId).emit('allChannelsData', channelsObj);
}

/* Tek user'a => roomsList */
function sendRoomsListToUser(socketId, groupId) {
  if (!groups[groupId]) return;
  const groupObj = groups[groupId];
  const roomArray = Object.keys(groupObj.rooms).map(rId => ({
    id: rId,
    name: groupObj.rooms[rId].name
  }));
  io.to(socketId).emit('roomsList', roomArray);
}

/* Tüm kullanıcıya => roomsList */
function broadcastRoomsListToGroup(groupId) {
  if (!groups[groupId]) return;
  groups[groupId].users.forEach(u => {
    sendRoomsListToUser(u.id, groupId);
  });
}

/* Tek user'a => groupsList => (owner, id, name) */
async function sendGroupsListToUser(socketId) {
  const userData = users[socketId];
  if (!userData) return;
  const userDoc = await User.findOne({ username: userData.username }).populate('groups');
  if (!userDoc) return;

  const userGroups = [];
  for (const g of userDoc.groups) {
    let ownerUsername = null;
    const ownerUser = await User.findById(g.owner);
    if (ownerUser) {
      ownerUsername = ownerUser.username;
    }
    userGroups.push({
      id: g.groupId,
      name: g.name,
      owner: ownerUsername
    });
  }
  io.to(socketId).emit('groupsList', userGroups);
}

// Socket.IO
io.on("connection", (socket) => {
  console.log("Kullanıcı bağlandı:", socket.id);

  users[socket.id] = {
    username: null,
    currentGroup: null,
    currentRoom: null
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
      socket.emit('registerResult', { success: false, message: 'Tüm alanları doldurun.' });
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
        groups: []
      });
      await newUser.save();
      socket.emit('registerResult', { success: true });
    } catch (err) {
      console.error(err);
      socket.emit('registerResult', { success: false, message: 'Kayıt hatası.' });
    }
  });

  // set-username => kullanıcı adını belirleme
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

      // DB => hangi gruplara üye => broadcastGroupUsers
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

  // createGroup
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

  // joinGroupByID
  socket.on('joinGroupByID', async (groupId) => {
    try {
      if (users[socket.id].currentGroup === groupId) {
        return; // Aynı gruba tekrar girmesini engelle
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

      // DB relation
      if (!groupDoc.users.includes(userDoc._id)) {
        groupDoc.users.push(userDoc._id);
        await groupDoc.save();
      }
      if (!userDoc.groups.includes(groupDoc._id)) {
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
      // Fallback kaldırıldı => eğer username yoksa ekleme
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

  // browseGroup => roomsList + groupUsers
  socket.on('browseGroup', async (groupId) => {
    if (!groups[groupId]) return;
    sendRoomsListToUser(socket.id, groupId);
    sendAllChannelsDataToOneUser(socket.id, groupId);
    await sendGroupUsersToOneUser(socket.id, groupId);
  });

  // joinGroup
  socket.on('joinGroup', async (groupId) => {
    if (!groups[groupId]) return;
    if (users[socket.id].currentGroup === groupId) {
      return; // Aynı gruba tekrar girmesini engelle
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

  // createRoom
  socket.on('createRoom', async ({ groupId, roomName }) => {
    try {
      if (!groups[groupId]) return;
      if (!roomName) return;
      const trimmed = roomName.trim();
      if (!trimmed) return;

      const groupDoc = await Group.findOne({ groupId });
      if (!groupDoc) return;

      const roomId = uuidv4();
      const newChannel = new Channel({
        channelId: roomId,
        name: trimmed,
        group: groupDoc._id,
        users: []
      });
      await newChannel.save();

      groups[groupId].rooms[roomId] = {
        name: trimmed,
        users: []
      };
      console.log(`Yeni oda: group=${groupId}, room=${roomId}, name=${trimmed}`);

      broadcastRoomsListToGroup(groupId);
      broadcastAllChannelsData(groupId);
    } catch (err) {
      console.error("createRoom hata:", err);
    }
  });

  // joinRoom
  socket.on('joinRoom', ({ groupId, roomId }) => {
    if (!groups[groupId]) return;
    if (!groups[groupId].rooms[roomId]) return;

    const userData = users[socket.id];
    if (!userData.username) {
      socket.emit('errorMessage', "Kullanıcı adınız tanımsız => Kanala eklenemiyor.");
      return;
    }

    // Kullanıcı zaten bu oda + grupta mı?
    if (userData.currentGroup === groupId && userData.currentRoom === roomId) {
      return; 
    }

    // Aynı grupta fakat başka odadaysa => sadece o odadan çıkar
    if (userData.currentGroup === groupId && userData.currentRoom && groups[groupId].rooms[userData.currentRoom]) {
      groups[groupId].rooms[userData.currentRoom].users =
        groups[groupId].rooms[userData.currentRoom].users.filter(u => u.id !== socket.id);
      io.to(`${groupId}::${userData.currentRoom}`).emit('roomUsers', groups[groupId].rooms[userData.currentRoom].users);
      socket.leave(`${groupId}::${userData.currentRoom}`);
    } else {
      // Tamamen başka bir gruptan geliyorsa => oradan çık
      removeUserFromAllGroupsAndRooms(socket);
    }

    const userName = userData.username;
    if (!groups[groupId].users.some(u => u.id === socket.id)) {
      groups[groupId].users.push({ id: socket.id, username: userName });
    }
    groups[groupId].rooms[roomId].users.push({ id: socket.id, username: userName });
    userData.currentGroup = groupId;
    userData.currentRoom = roomId;

    socket.join(groupId);
    socket.join(`${groupId}::${roomId}`);

    io.to(`${groupId}::${roomId}`).emit('roomUsers', groups[groupId].rooms[roomId].users);

    broadcastAllChannelsData(groupId);
  });

  // leaveRoom
  socket.on('leaveRoom', ({ groupId, roomId }) => {
    if (!groups[groupId]) return;
    if (!groups[groupId].rooms[roomId]) return;

    groups[groupId].rooms[roomId].users =
      groups[groupId].rooms[roomId].users.filter(u => u.id !== socket.id);
    io.to(`${groupId}::${roomId}`).emit('roomUsers', groups[groupId].rooms[roomId].users);
    socket.leave(`${groupId}::${roomId}`);

    users[socket.id].currentRoom = null;
    broadcastAllChannelsData(groupId);
  });

  // renameGroup => grup ismi değiştirme
  socket.on('renameGroup', async (data) => {
    const { groupId, newName } = data;
    const userName = users[socket.id].username;
    if (!groups[groupId]) return;

    // Sadece owner rename edebilir
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

  // deleteGroup => grubu sil
  socket.on('deleteGroup', async (grpId) => {
    const userName = users[socket.id].username;
    if (!groups[grpId]) {
      socket.emit('errorMessage', "Grup bellekte yok.");
      return;
    }

    // Sadece owner silebilir
    if (groups[grpId].owner !== userName) {
      socket.emit('errorMessage', "Bu grubu silmeye yetkiniz yok.");
      return;
    }

    try {
      // 1) DB'den groupDoc bul
      const groupDoc = await Group.findOne({ groupId: grpId }).populate('users');
      if (!groupDoc) {
        socket.emit('errorMessage', "Grup DB'de bulunamadı.");
        return;
      }

      // 2) O gruba üye tüm user'lardan bu grupu çıkar (DB tarafı)
      if (groupDoc.users && groupDoc.users.length > 0) {
        for (const userId of groupDoc.users) {
          const usr = await User.findById(userId);
          if (usr && usr.groups.includes(groupDoc._id)) {
            usr.groups = usr.groups.filter(gRef => gRef.toString() !== groupDoc._id.toString());
            await usr.save();
          }
        }
      }

      // 3) DB'den groupDoc'u sil
      await Group.deleteOne({ _id: groupDoc._id });

      // 4) O grupla ilişkili kanalları sil
      await Channel.deleteMany({ group: groupDoc._id });

      // 5) Bellekten sil
      delete groups[grpId];
      console.log(`Grup silindi => ${grpId}`);

      // 6) Tüm client'lara => groupDeleted
      io.emit('groupDeleted', { groupId: grpId });
    } catch (err) {
      console.error("deleteGroup hata:", err);
      socket.emit('errorMessage', "Grup silinirken hata oluştu.");
    }
  });

  // renameChannel => kanal adını değiştirme
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

  // deleteChannel => kanalı sil
  socket.on('deleteChannel', async (channelId) => {
    try {
      if (!channelId) return;
      const chDoc = await Channel.findOne({ channelId });
      if (!chDoc) {
        socket.emit('errorMessage', "Kanal DB'de bulunamadı.");
        return;
      }
      // DB'den sil
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

  // WebRTC (signal)
  socket.on("signal", (data) => {
    const targetId = data.to;
    if (socket.id === targetId) return;
    if (!users[targetId]) return;

    const sG = users[socket.id].currentGroup;
    const tG = users[targetId].currentGroup;
    const sR = users[socket.id].currentRoom;
    const tR = users[targetId].currentRoom;

    if (sG && sG === tG && sR && sR === tR) {
      io.to(targetId).emit("signal", {
        from: socket.id,
        signal: data.signal
      });
    }
  });

  // Disconnect => Bağlantı kopunca
  socket.on("disconnect", async () => {
    console.log("disconnect:", socket.id);
    const userData = users[socket.id];
    if (userData) {
      const { username } = userData;
      if (username) {
        onlineUsernames.delete(username);

        // Kanaldan/gruplardan otomatik çıkar:
        removeUserFromAllGroupsAndRooms(socket);

        try {
          const userDoc = await User.findOne({ username }).populate('groups');
          if (userDoc && userDoc.groups.length > 0) {
            for (const gDoc of userDoc.groups) {
              broadcastAllChannelsData(gDoc.groupId);
              await broadcastGroupUsers(gDoc.groupId);
            }
          }
        } catch (err) {
          console.error("disconnect => userDoc fetch hata:", err);
        }
      }
    }
    delete users[socket.id];
  });
});

// Sunucuyu başlat
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
});
