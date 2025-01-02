const http = require("http");
const express = require("express");
const socketIO = require("socket.io");
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid'); // UUID

const User = require('./models/User'); // User model

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// MongoDB Bağlantısı
const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/myappdb";
mongoose.connect(uri)
  .then(() => console.log("MongoDB bağlantısı başarılı!"))
  .catch(err => console.error("MongoDB bağlantı hatası:", err));

// Kullanıcılar
// users[socket.id] = { username, currentGroup, currentRoom }
const users = {};

// Gruplar => groupId => { owner, name, users:[], rooms:{} }
const groups = {};

/* 
  Örnek:
  groups = {
    "some-uuid": {
      owner: "socket.id",
      name: "Grup Adı",
      users: [
        { id: "socket.id", username: "ABC" },
        ...
      ],
      rooms: {
        "room-uuid": {
          name: "Kanal Adı",
          users: [ { id, username }, ... ]
        }
      }
    },
    ...
  }
*/

app.use(express.static("public")); // index.html, script.js, style.css

// -----------------------------------------------------------------
// Fonksiyon: Bir kullanıcıya *kendisinin* görebileceği grupları gönder
// -----------------------------------------------------------------
function sendGroupsListToUser(socketId) {
  const userData = users[socketId];
  if (!userData) return;

  // Bu kullanıcı hangi gruplarda?
  // Koşul: group.owner == socketId veya group.users[].id == socketId
  const userGroups = Object.keys(groups)
    .filter(gid => {
      const g = groups[gid];
      if (g.owner === socketId) return true;
      return g.users.some(u => u.id === socketId);
    })
    .map(gid => ({
      id: gid,
      name: groups[gid].name
    }));

  io.to(socketId).emit('groupsList', userGroups);
}

// -----------------------------------------------------------------
// Fonksiyon: roomsList => Belirli bir grup için odaların listesi
// -----------------------------------------------------------------
function sendRoomsListToUser(socketId, groupId) {
  const groupObj = groups[groupId];
  if (!groupObj) return;
  const roomArray = Object.keys(groupObj.rooms).map(rId => ({
    id: rId,
    name: groupObj.rooms[rId].name
  }));
  io.to(socketId).emit('roomsList', roomArray);
}

// -----------------------------------------------------------------
// Socket.IO
// -----------------------------------------------------------------
io.on("connection", (socket) => {
  console.log("Kullanıcı bağlandı:", socket.id);

  // Yeni user
  users[socket.id] = {
    username: null,
    currentGroup: null,
    currentRoom: null
  };

  // ---------------------
  // Login
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
  // Register
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
        phone
      });
      await newUser.save();
      socket.emit('registerResult', { success: true });
    } catch (err) {
      console.error(err);
      socket.emit('registerResult', { success: false, message: 'Kayıt hatası.' });
    }
  });

  // set-username
  socket.on('set-username', (usernameVal) => {
    if (usernameVal && typeof usernameVal === 'string') {
      users[socket.id].username = usernameVal.trim();
      console.log(`User ${socket.id} => set-username => ${usernameVal}`);
      // Giriş sonrası => bu user'a kendi groupsList'i
      sendGroupsListToUser(socket.id);
    }
  });

  // ---------------------
  // createGroup
  // ---------------------
  socket.on('createGroup', (groupName) => {
    if (!groupName || typeof groupName !== 'string') return;
    const trimmed = groupName.trim();
    if (!trimmed) return;

    const groupId = uuidv4();
    const userName = users[socket.id].username || `(User ${socket.id})`;
    groups[groupId] = {
      owner: socket.id,
      name: trimmed,
      users: [
        { id: socket.id, username: userName }
      ],
      rooms: {}
    };
    console.log(`Yeni grup oluştur: ${trimmed} (ID=${groupId}), owner=${socket.id}`);

    // Sadece bu user'a => groupsList
    sendGroupsListToUser(socket.id);
  });

  // ---------------------
  // joinGroupByID
  // ---------------------
  socket.on('joinGroupByID', (groupId) => {
    if (!groups[groupId]) {
      socket.emit('errorMessage', "Böyle bir grup yok.");
      return;
    }
    const userName = users[socket.id].username || `(User ${socket.id})`;
    // Zaten yoksa ekle
    if (!groups[groupId].users.some(u => u.id === socket.id)) {
      groups[groupId].users.push({ id: socket.id, username: userName });
    }
    users[socket.id].currentGroup = groupId;
    users[socket.id].currentRoom = null;
    console.log(`User ${socket.id} => joinGroupByID => ${groupId}`);

    // Bu user'a => groupsList
    sendGroupsListToUser(socket.id);
  });

  // ---------------------
  // joinGroup (listeden)
  // ---------------------
  socket.on('joinGroup', (groupId) => {
    if (!groups[groupId]) {
      console.log("Geçersiz grup ID:", groupId);
      return;
    }
    const oldGroup = users[socket.id].currentGroup;
    const oldRoom = users[socket.id].currentRoom;
    const userName = users[socket.id].username || `(User ${socket.id})`;

    // Eski odadan çık
    if (oldGroup && groups[oldGroup]) {
      if (oldRoom && groups[oldGroup].rooms[oldRoom]) {
        groups[oldGroup].rooms[oldRoom].users =
          groups[oldGroup].rooms[oldRoom].users.filter(u => u.id !== socket.id);
        io.to(`${oldGroup}::${oldRoom}`).emit('roomUsers', groups[oldGroup].rooms[oldRoom].users);
        socket.leave(`${oldGroup}::${oldRoom}`);
      }
      // Eski gruptan da çık
      groups[oldGroup].users = groups[oldGroup].users.filter(u => u.id !== socket.id);
      socket.leave(oldGroup);
    }

    // Bu grupta yoksa ekle
    if (!groups[groupId].users.some(u => u.id === socket.id)) {
      groups[groupId].users.push({ id: socket.id, username: userName });
    }
    users[socket.id].currentGroup = groupId;
    users[socket.id].currentRoom = null;
    socket.join(groupId);

    // Odalar listesi sadece bu kullanıcıya
    sendRoomsListToUser(socket.id, groupId);

    console.log(`User ${socket.id} => joinGroup => ${groupId}`);
  });

  // ---------------------
  // createRoom
  // ---------------------
  socket.on('createRoom', ({ groupId, roomName }) => {
    if (!groups[groupId]) {
      console.log("Grup yok:", groupId);
      return;
    }
    if (!roomName || typeof roomName !== 'string') {
      console.log("Geçersiz oda adı:", roomName);
      return;
    }

    const trimmedRoomName = roomName.trim();
    const roomId = uuidv4();
    groups[groupId].rooms[roomId] = {
      name: trimmedRoomName,
      users: []
    };
    console.log(`Yeni oda oluşturuldu: Grup=${groupId}, Oda=${roomId}, Ad=${trimmedRoomName}`);

    // O gruptaki tüm kullanıcıların => roomsList güncellensin
    groups[groupId].users.forEach(u => {
      sendRoomsListToUser(u.id, groupId);
    });
  });

  // ---------------------
  // joinRoom
  // ---------------------
  socket.on('joinRoom', ({ groupId, roomId }) => {
    const groupObj = groups[groupId];
    if (!groupObj) {
      console.log(`Grup bulunamadı: ${groupId}`);
      return;
    }
    if (!groupObj.rooms[roomId]) {
      console.log(`Oda bulunamadı: ${roomId}`);
      return;
    }

    const userName = users[socket.id].username || `(User ${socket.id})`;

    // Eski odadan çık
    const oldRoom = users[socket.id].currentRoom;
    if (oldRoom && groupObj.rooms[oldRoom]) {
      groupObj.rooms[oldRoom].users = groupObj.rooms[oldRoom].users.filter(u => u.id !== socket.id);
      io.to(`${groupId}::${oldRoom}`).emit('roomUsers', groupObj.rooms[oldRoom].users);
      socket.leave(`${groupId}::${oldRoom}`);
    }

    // Bu odaya ekle
    groupObj.rooms[roomId].users.push({ id: socket.id, username: userName });
    users[socket.id].currentRoom = roomId;
    socket.join(`${groupId}::${roomId}`);

    // O odadaki herkese => 'roomUsers'
    io.to(`${groupId}::${roomId}`).emit('roomUsers', groupObj.rooms[roomId].users);
    console.log(`User ${socket.id} => joinRoom => ${groupId}/${roomId}`);
  });

  // ---------------------
  // leaveRoom
  // ---------------------
  socket.on('leaveRoom', ({ groupId, roomId }) => {
    const groupObj = groups[groupId];
    if (!groupObj) return;
    if (!groupObj.rooms[roomId]) return;

    groupObj.rooms[roomId].users = groupObj.rooms[roomId].users.filter(u => u.id !== socket.id);
    io.to(`${groupId}::${roomId}`).emit('roomUsers', groupObj.rooms[roomId].users);
    socket.leave(`${groupId}::${roomId}`);
    users[socket.id].currentRoom = null;
    console.log(`User ${socket.id} => left room => [${groupId}/${roomId}]`);
  });

  // ---------------------
  // WebRTC Sinyal
  // ---------------------
  socket.on("signal", (data) => {
    const targetId = data.to;
    if (!users[targetId]) return;

    const senderGroup = users[socket.id].currentGroup;
    const targetGroup = users[targetId].currentGroup;
    const senderRoom = users[socket.id].currentRoom;
    const targetRoom = users[targetId].currentRoom;

    // Aynı grupta & aynı odada iseler
    if (senderGroup && senderGroup === targetGroup &&
        senderRoom && senderRoom === targetRoom) {
      io.to(targetId).emit("signal", {
        from: socket.id,
        signal: data.signal
      });
    }
  });

  // ---------------------
  // Disconnect
  // ---------------------
  socket.on("disconnect", () => {
    console.log("Kullanıcı ayrıldı:", socket.id);
    const userData = users[socket.id];
    if (userData && userData.currentGroup) {
      const gId = userData.currentGroup;
      const rId = userData.currentRoom;
      if (groups[gId]) {
        // Odadan çıkar
        if (rId && groups[gId].rooms[rId]) {
          groups[gId].rooms[rId].users = groups[gId].rooms[rId].users.filter(u => u.id !== socket.id);
          io.to(`${gId}::${rId}`).emit('roomUsers', groups[gId].rooms[rId].users);
        }
        // Gruptan çıkar
        groups[gId].users = groups[gId].users.filter(u => u.id !== socket.id);
      }
    }
    delete users[socket.id];
  });
});

// Periyodik log (isteğe bağlı)
setInterval(() => {
  console.log("users:", users);
  console.log("groups:", groups);
}, 10000);

// Sunucu Başlat
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
});
