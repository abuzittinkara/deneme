/**************************************
 * server.js
 **************************************/
const http = require("http");
const express = require("express");
const socketIO = require("socket.io");
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid'); // UUID

const User = require('./models/User');   // Kullanıcı modeli
const Group = require('./models/Group'); // Grup modeli
const Channel = require('./models/Channel'); // Kanal modeli

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// MongoDB bağlantı ayarları
const uri = process.env.MONGODB_URI || "mongodb+srv://abuzorttin:19070480019Mg.@cluster0.vdrdy.mongodb.net/myappdb?retryWrites=true&w=majority";
mongoose.connect(uri)
  .then(() => console.log("MongoDB bağlantısı başarılı!"))
  .catch(err => console.error("MongoDB bağlantı hatası:", err));

// Bellek içi tablolar
// users[socket.id] = { username, currentGroup, currentRoom }
const users = {};
// groups[groupId] = { owner, name, users:[], rooms:{} }
const groups = {};

// Statik dosyalar
app.use(express.static("public"));

/* 
  1) DB'den grupları çek => groups
*/
async function loadGroupsFromDB() {
  try {
    const allGroups = await Group.find({});
    allGroups.forEach(gDoc => {
      if (!groups[gDoc.groupId]) {
        groups[gDoc.groupId] = {
          owner: gDoc.owner ? gDoc.owner.toString() : null,
          name: gDoc.name,
          users: [],
          rooms: {}
        };
      }
    });
    console.log("loadGroupsFromDB tamam: ", Object.keys(groups));
  } catch (err) {
    console.error("loadGroupsFromDB hatası:", err);
  }
}

/* 
  2) DB'den kanalları çek => groups[groupId].rooms
*/
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

loadGroupsFromDB().then(() => loadChannelsFromDB());

/* 
  Bir gruptaki tüm kanalları + kullanıcıları => "allChannelsData" ile yay
*/
function broadcastAllChannelsData(groupId) {
  if (!groups[groupId]) return;
  const channelsObj = {};
  Object.keys(groups[groupId].rooms).forEach(roomId => {
    const rm = groups[groupId].rooms[roomId];
    channelsObj[roomId] = {
      name: rm.name,
      users: rm.users.map(u => ({ id: u.id, username: u.username }))
    };
  });
  io.to(groupId).emit('allChannelsData', channelsObj);
}

/* 
  DB'den groupId'ye ait user listesi => groupUsers event
*/
async function broadcastGroupUsers(groupId) {
  if (!groupId) return;
  try {
    const groupDoc = await Group.findOne({ groupId }).populate('users');
    if (!groupDoc) return;
    const userArray = groupDoc.users.map(u => ({
      username: u.username
    }));
    io.to(groupId).emit('groupUsers', userArray);
  } catch (err) {
    console.error("broadcastGroupUsers hata:", err);
  }
}

/* 
  Kullanıcıya => groupsList event
*/
async function sendGroupsListToUser(socketId) {
  const userData = users[socketId];
  if (!userData) return;
  const userDoc = await User.findOne({ username: userData.username }).populate('groups');
  if (!userDoc) return;

  const userGroups = userDoc.groups.map(g => ({
    id: g.groupId,
    name: g.name
  }));
  io.to(socketId).emit('groupsList', userGroups);
}

/* 
  roomsList => groupId
*/
function sendRoomsListToUser(socketId, groupId) {
  const groupObj = groups[groupId];
  if (!groupObj) return;
  const roomArray = Object.keys(groupObj.rooms).map(rId => ({
    id: rId,
    name: groupObj.rooms[rId].name
  }));
  io.to(socketId).emit('roomsList', roomArray);
}

// Socket.IO
io.on("connection", (socket) => {
  console.log("Kullanıcı bağlandı:", socket.id);

  users[socket.id] = {
    username: null,
    currentGroup: null,
    currentRoom: null
  };

  // ---------------------
  // LOGIN
  // ---------------------
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

  // ---------------------
  // REGISTER
  // ---------------------
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

  // ---------------------
  // set-username
  // ---------------------
  socket.on('set-username', async (usernameVal) => {
    if (usernameVal && typeof usernameVal === 'string') {
      users[socket.id].username = usernameVal.trim();
      console.log(`User ${socket.id} => set-username => ${usernameVal}`);

      // Giriş sonrası => DB'den grup listesini gönder
      try {
        await sendGroupsListToUser(socket.id);
      } catch (err) {
        console.error("sendGroupsListToUser hata:", err);
      }
    }
  });

  // ---------------------
  // createGroup
  // ---------------------
  socket.on('createGroup', async (groupName) => {
    if (!groupName || typeof groupName !== 'string') return;
    const trimmed = groupName.trim();
    if (!trimmed) return;

    const groupId = uuidv4();
    const userName = users[socket.id].username || `(User ${socket.id})`;

    const userDoc = await User.findOne({ username: userName });
    if (!userDoc) {
      console.log("createGroup: Kullanıcı DB'de bulunamadı:", userName);
      return;
    }

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
      owner: socket.id,
      name: trimmed,
      users: [
        { id: socket.id, username: userName }
      ],
      rooms: {}
    };
    console.log(`Yeni grup oluştur: ${trimmed} (ID=${groupId})`);

    await sendGroupsListToUser(socket.id);
  });

  // ---------------------
  // joinGroupByID
  // ---------------------
  socket.on('joinGroupByID', async (groupId) => {
    try {
      const userName = users[socket.id].username || `(User ${socket.id})`;
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
      if (!groupDoc.users.includes(userDoc._id)) {
        groupDoc.users.push(userDoc._id);
        await groupDoc.save();
      }
      if (!userDoc.groups.includes(groupDoc._id)) {
        userDoc.groups.push(groupDoc._id);
        await userDoc.save();
      }
      if (!groups[groupId]) {
        groups[groupId] = {
          owner: groupDoc.owner ? groupDoc.owner.toString() : null,
          name: groupDoc.name,
          users: [],
          rooms: {}
        };
      }
      users[socket.id].currentGroup = groupId;
      users[socket.id].currentRoom = null;
      if (!groups[groupId].users.some(u => u.id === socket.id)) {
        groups[groupId].users.push({ id: socket.id, username: userName });
      }
      console.log(`User ${socket.id} => joinGroupByID => ${groupId}`);

      await sendGroupsListToUser(socket.id);
      await broadcastGroupUsers(groupId);

    } catch (err) {
      console.error("joinGroupByID hata:", err);
    }
  });

  // ---------------------
  // joinGroup (listeden)
  // => Sadece gruba "göz atma"
  // => Eski kanaldan çıkma yok
  // ---------------------
  socket.on('joinGroup', async (groupId) => {
    console.log(`joinGroup event: user=${socket.id}, groupId=${groupId}`);
    if (!groups[groupId]) {
      console.log("Geçersiz grup ID:", groupId);
      return;
    }
    // Eski group => dokunmuyoruz
    // Eski channel => dokunmuyoruz

    // Sadece bu gruba da eklensin (göz atabilsin)
    const userName = users[socket.id].username || `(User ${socket.id})`;
    if (!groups[groupId].users.some(u => u.id === socket.id)) {
      groups[groupId].users.push({ id: socket.id, username: userName });
    }
    users[socket.id].currentGroup = groupId; 
    // currentRoom => bozmuyoruz
    socket.join(groupId);

    sendRoomsListToUser(socket.id, groupId);
    broadcastAllChannelsData(groupId);
    await broadcastGroupUsers(groupId);
  });

  // ---------------------
  // createRoom
  // ---------------------
  socket.on('createRoom', async ({ groupId, roomName }) => {
    try {
      if (!groups[groupId]) return;
      if (!roomName || typeof roomName !== 'string') return;
      const trimmedRoomName = roomName.trim();
      if (!trimmedRoomName) return;

      const groupDoc = await Group.findOne({ groupId });
      if (!groupDoc) return;

      const roomId = uuidv4();
      const newChannel = new Channel({
        channelId: roomId,
        name: trimmedRoomName,
        group: groupDoc._id,
        users: []
      });
      await newChannel.save();

      groups[groupId].rooms[roomId] = {
        name: trimmedRoomName,
        users: []
      };
      console.log(`Yeni oda oluştur: Grup=${groupId}, Oda=${roomId}, Ad=${trimmedRoomName}`);

      groups[groupId].users.forEach(u => {
        sendRoomsListToUser(u.id, groupId);
      });
      broadcastAllChannelsData(groupId);
    } catch (err) {
      console.error("createRoom hata:", err);
    }
  });

  // ---------------------
  // joinRoom
  // => Burada: FARKLI bir group'a ait kanala girerse,
  //    eski group + kanaldan çıkarmak gerekir.
  // ---------------------
  socket.on('joinRoom', ({ groupId, roomId }) => {
    console.log(`joinRoom event: user=${socket.id}, groupId=${groupId}, roomId=${roomId}`);
    const groupObj = groups[groupId];
    if (!groupObj) {
      console.log("Grup yok:", groupId);
      return;
    }
    if (!groupObj.rooms[roomId]) {
      console.log("Oda yok:", roomId);
      return;
    }

    const userName = users[socket.id].username || `(User ${socket.id})`;

    // ESKI GROUP => Eger farkli bir groupdaysa => cikar
    const oldGroup = users[socket.id].currentGroup;
    const oldRoom = users[socket.id].currentRoom;
    if (oldGroup && oldGroup !== groupId) {
      // Eski group'se => odadan cikar
      if (groups[oldGroup]) {
        if (oldRoom && groups[oldGroup].rooms[oldRoom]) {
          groups[oldGroup].rooms[oldRoom].users =
            groups[oldGroup].rooms[oldRoom].users.filter(u => u.id !== socket.id);
          io.to(`${oldGroup}::${oldRoom}`).emit('roomUsers', groups[oldGroup].rooms[oldRoom].users);
          socket.leave(`${oldGroup}::${oldRoom}`);
        }
        // Eski group'tan da cikar
        groups[oldGroup].users = groups[oldGroup].users.filter(u => u.id !== socket.id);
        socket.leave(oldGroup);

        // Broadcast => o eski group da guncellensin
        broadcastAllChannelsData(oldGroup);
      }
    }

    // Bu group'a gir
    users[socket.id].currentGroup = groupId;

    // Eski kanaldan cikar (Ayni group'ta farkli oda)
    if (oldGroup === groupId && oldRoom && groupObj.rooms[oldRoom]) {
      groupObj.rooms[oldRoom].users =
        groupObj.rooms[oldRoom].users.filter(u => u.id !== socket.id);
      io.to(`${groupId}::${oldRoom}`).emit('roomUsers', groupObj.rooms[oldRoom].users);
      socket.leave(`${groupId}::${oldRoom}`);
    }

    // Bu group'ta user kaydi yoksa ekle
    if (!groupObj.users.some(u => u.id === socket.id)) {
      groupObj.users.push({ id: socket.id, username: userName });
    }

    // Yeni odaya ekle
    groupObj.rooms[roomId].users.push({ id: socket.id, username: userName });
    users[socket.id].currentRoom = roomId;

    socket.join(groupId);
    socket.join(`${groupId}::${roomId}`);

    // O odadaki herkese => 'roomUsers'
    io.to(`${groupId}::${roomId}`).emit('roomUsers', groupObj.rooms[roomId].users);

    broadcastAllChannelsData(groupId);
  });

  // ---------------------
  // leaveRoom
  // ---------------------
  socket.on('leaveRoom', ({ groupId, roomId }) => {
    console.log(`leaveRoom event: user=${socket.id}, groupId=${groupId}, roomId=${roomId}`);
    const groupObj = groups[groupId];
    if (!groupObj) return;
    if (!groupObj.rooms[roomId]) return;

    groupObj.rooms[roomId].users =
      groupObj.rooms[roomId].users.filter(u => u.id !== socket.id);
    io.to(`${groupId}::${roomId}`).emit('roomUsers', groupObj.rooms[roomId].users);
    socket.leave(`${groupId}::${roomId}`);

    users[socket.id].currentRoom = null;
    broadcastAllChannelsData(groupId);
  });

  // ---------------------
  // WebRTC Sinyal
  // ---------------------
  socket.on("signal", (data) => {
    const targetId = data.to;
    if (socket.id === targetId) return;
    if (!users[targetId]) return;

    const sG = users[socket.id].currentGroup;
    const tG = users[targetId].currentGroup;
    const sR = users[socket.id].currentRoom;
    const tR = users[targetId].currentRoom;

    // Aynı group + aynı room => sinyal
    if (sG && sG === tG && sR && sR === tR) {
      io.to(targetId).emit("signal", {
        from: socket.id,
        signal: data.signal
      });
    }
  });

  // ---------------------
  // Disconnect
  // ---------------------
  socket.on("disconnect", async () => {
    console.log("Kullanıcı ayrıldı (disconnect):", socket.id);
    const userData = users[socket.id];
    if (userData && userData.currentGroup) {
      const gId = userData.currentGroup;
      const rId = userData.currentRoom;
      if (groups[gId]) {
        if (rId && groups[gId].rooms[rId]) {
          groups[gId].rooms[rId].users =
            groups[gId].rooms[rId].users.filter(u => u.id !== socket.id);
          io.to(`${gId}::${rId}`).emit('roomUsers', groups[gId].rooms[rId].users);
        }
        groups[gId].users = groups[gId].users.filter(u => u.id !== socket.id);

        broadcastAllChannelsData(gId);
        await broadcastGroupUsers(gId);
      }
    }
    delete users[socket.id];
  });
});

// Sunucu Başlat
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
});
