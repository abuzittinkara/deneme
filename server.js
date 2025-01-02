const http = require("http");
const express = require("express");
const socketIO = require("socket.io");
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const User = require('./models/User'); // <-- Kullanıcı model (dosyanızda uygun konuma dikkat edin)

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// MongoDB Bağlantısı (İSTENEN DİZGE)
const uri = "mongodb+srv://abuzorttin:19070480019Mg.@cluster0.vdrdy.mongodb.net/myappdb?retryWrites=true&w=majority";
mongoose.connect(uri)
  .then(() => {
    console.log("MongoDB bağlantısı başarılı!");
  })
  .catch(err => {
    console.error("MongoDB bağlantı hatası:", err);
  });

// Kullanıcı verileri
// users[socket.id] = { username, currentGroup, currentRoom }
const users = {};

/**
  groups = {
    [groupUUID]: {
      owner: socket.id,
      name: "Grup Adı",
      users: [
        { id: "socketId", username: "...", online: true/false },
        ...
      ],
      rooms: {
        [roomUUID]: {
          name: "Oda Adı",
          users: [ { id, username }, ... ]
        }
      }
    }
  }
*/
const groups = {};

// Oda ismi => groupId::roomId
function getRoomSocketName(groupId, roomId) {
  return `${groupId}::${roomId}`;
}

// Gruplardaki kullanıcıların online/offline listesini yayınlamak için
function broadcastGroupUsers(groupId) {
  if (!groups[groupId]) return;
  const grp = groups[groupId];

  // Kullanıcı adlarına göre alfabetik sırala
  const sortedUsers = [...grp.users].sort((a, b) =>
    (a.username || '').localeCompare(b.username || '')
  );

  // Tüm grup üyelerine "groupUsers" event’i gönder
  io.to(groupId).emit('groupUsers', sortedUsers);
}

app.use(express.static("public")); // index.html, style.css, script.js

io.on("connection", (socket) => {
  console.log("Kullanıcı bağlandı:", socket.id);

  // Varsayılan user data
  users[socket.id] = {
    username: null,
    currentGroup: null,
    currentRoom: null
  };

  // ---------------------
  // Login
  // ---------------------
  socket.on('login', async ({ username, password }) => {
    if (!username || !password) {
      socket.emit('loginResult', { success: false, message: 'Kullanıcı adı/parola eksik.' });
      return;
    }
    try {
      const user = await User.findOne({ username });
      if (!user) {
        socket.emit('loginResult', { success: false, message: 'Kullanıcı bulunamadı.' });
        return;
      }
      const passwordMatch = await bcrypt.compare(password, user.passwordHash);
      if (!passwordMatch) {
        socket.emit('loginResult', { success: false, message: 'Kullanıcı adı/parola hatalı.' });
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
    if (!username || !name || !surname || !birthdate || !email || !phone || !password || !passwordConfirm) {
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

  // ---------------------
  // set-username
  // ---------------------
  socket.on('set-username', (usernameVal) => {
    if (usernameVal && typeof usernameVal === 'string') {
      users[socket.id].username = usernameVal.trim();
      console.log(`Kullanıcı ${socket.id} => set-username => ${usernameVal}`);
      // (Opsiyonel) “sendGroupsListToUser” gibi bir fonksiyonla sadece bu user’a grup listesi gönderebilirsiniz.
    }
  });

  // ---------------------
  // Grup Oluştur
  // ---------------------
  socket.on('createGroup', (groupName) => {
    if (!groupName || typeof groupName !== 'string') return;
    const trimmed = groupName.trim();
    if (!trimmed) return;

    const groupId = uuidv4();
    const usernameVal = users[socket.id].username || `(User ${socket.id})`;

    groups[groupId] = {
      owner: socket.id,
      name: trimmed,
      users: [
        { id: socket.id, username: usernameVal, online: true }
      ],
      rooms: {}
    };
    console.log(`Yeni grup oluşturuldu: [${groupId}] => ${trimmed}`);
  });

  // ---------------------
  // Gruba ID ile Katıl
  // ---------------------
  socket.on('joinGroupByID', (groupId) => {
    const groupObj = groups[groupId];
    if (!groupObj) {
      socket.emit('errorMessage', "Böyle bir grup ID yok.");
      return;
    }
    const usernameVal = users[socket.id].username || `(User ${socket.id})`;

    // Zaten yoksa ekle, varsa online=true
    let existing = groupObj.users.find(u => u.id === socket.id);
    if (!existing) {
      groupObj.users.push({ id: socket.id, username: usernameVal, online: true });
    } else {
      existing.online = true;
    }

    users[socket.id].currentGroup = groupId;
    socket.join(groupId);

    // Tüm gruba => groupUsers
    broadcastGroupUsers(groupId);

    console.log(`User ${socket.id} => joinGroupByID => ${groupId}`);
  });

  // ---------------------
  // Listeden Gruba Katıl
  // ---------------------
  socket.on('joinGroup', (groupId) => {
    const grp = groups[groupId];
    if (!grp) return;

    const oldGroup = users[socket.id].currentGroup;
    const oldRoom = users[socket.id].currentRoom;
    const usernameVal = users[socket.id].username || `(Kullanıcı ${socket.id})`;

    // Eski odadan çık
    if (oldGroup && groups[oldGroup]) {
      // rooms
      if (oldRoom && groups[oldGroup].rooms[oldRoom]) {
        groups[oldGroup].rooms[oldRoom].users = groups[oldGroup].rooms[oldRoom].users.filter(u => u.id !== socket.id);
        io.to(getRoomSocketName(oldGroup, oldRoom)).emit('roomUsers', groups[oldGroup].rooms[oldRoom].users);
        socket.leave(getRoomSocketName(oldGroup, oldRoom));
      }
      // Eski gruptan da çıkar
      groups[oldGroup].users = groups[oldGroup].users.filter(u => u.id !== socket.id);
      broadcastGroupUsers(oldGroup);
      socket.leave(oldGroup);
    }

    // Bu grupta yoksa ekle
    let existing = grp.users.find(u => u.id === socket.id);
    if (!existing) {
      grp.users.push({ id: socket.id, username: usernameVal, online: true });
    } else {
      existing.online = true;
    }

    users[socket.id].currentGroup = groupId;
    users[socket.id].currentRoom = null;
    socket.join(groupId);

    // Oda listesi
    const rooms = Object.keys(grp.rooms).map(rId => ({
      id: rId,
      name: grp.rooms[rId].name
    }));
    socket.emit('roomsList', rooms);

    // Tüm gruba => groupUsers
    broadcastGroupUsers(groupId);

    console.log(`User ${socket.id} => joinGroup => ${groupId}`);
  });

  // ---------------------
  // Oda Oluştur
  // ---------------------
  socket.on('createRoom', ({ groupId, roomName }) => {
    if (!groups[groupId]) return;
    if (!roomName) return;

    const rId = uuidv4();
    groups[groupId].rooms[rId] = {
      name: roomName.trim(),
      users: []
    };
    console.log(`Grup[${groupId}] => yeni oda: ${roomName} (${rId})`);

    // Grubun tüm kullanıcılarına roomsList gönder
    groups[groupId].users.forEach(usr => {
      const rmArray = Object.keys(groups[groupId].rooms).map(id => ({
        id,
        name: groups[groupId].rooms[id].name
      }));
      io.to(usr.id).emit('roomsList', rmArray);
    });
  });

  // ---------------------
  // Odaya Katıl
  // ---------------------
  socket.on('joinRoom', ({ groupId, roomId }) => {
    const grp = groups[groupId];
    if (!grp) return;
    const roomObj = grp.rooms[roomId];
    if (!roomObj) return;

    const usernameVal = users[socket.id].username || `(Kullanıcı ${socket.id})`;

    // Eski odadan çıkar
    const oldRoom = users[socket.id].currentRoom;
    if (oldRoom && grp.rooms[oldRoom]) {
      grp.rooms[oldRoom].users = grp.rooms[oldRoom].users.filter(u => u.id !== socket.id);
      io.to(getRoomSocketName(groupId, oldRoom)).emit('roomUsers', grp.rooms[oldRoom].users);
      socket.leave(getRoomSocketName(groupId, oldRoom));
    }
    // Bu odaya ekle
    roomObj.users.push({ id: socket.id, username: usernameVal });
    users[socket.id].currentRoom = roomId;
    socket.join(getRoomSocketName(groupId, roomId));

    io.to(getRoomSocketName(groupId, roomId)).emit('roomUsers', roomObj.users);
    console.log(`User ${socket.id} => joinRoom => [${groupId}/${roomId}]`);
  });

  // ---------------------
  // Odayı Terk Et
  // ---------------------
  socket.on('leaveRoom', ({ groupId, roomId }) => {
    if (!groups[groupId] || !groups[groupId].rooms[roomId]) return;
    const roomObj = groups[groupId].rooms[roomId];
    roomObj.users = roomObj.users.filter(u => u.id !== socket.id);
    io.to(getRoomSocketName(groupId, roomId)).emit('roomUsers', roomObj.users);
    socket.leave(getRoomSocketName(groupId, roomId));
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

    if (senderGroup && senderGroup === targetGroup &&
        senderRoom && senderRoom === targetRoom) {
      io.to(targetId).emit("signal", { from: socket.id, signal: data.signal });
    }
  });

  // ---------------------
  // Disconnect => offline
  // ---------------------
  socket.on("disconnect", () => {
    console.log("Kullanıcı ayrıldı:", socket.id);
    const userData = users[socket.id];
    if (userData && userData.currentGroup) {
      const gId = userData.currentGroup;
      if (groups[gId]) {
        // offline
        let found = groups[gId].users.find(u => u.id === socket.id);
        if (found) {
          found.online = false;
        }
        // Tüm gruba user listesi
        broadcastGroupUsers(gId);
      }
    }
    delete users[socket.id];
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
});
