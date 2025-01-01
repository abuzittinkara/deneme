const http = require("http");
const express = require("express");
const socketIO = require("socket.io");
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid'); // EKLENDİ: uuid paketi

const User = require('./models/User'); // User model

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// MongoDB Bağlantısı
const uri = process.env.MONGODB_URI || "mongodb+srv://abuzorttin:19070480019Mg.@cluster0.vdrdy.mongodb.net/myappdb?retryWrites=true&w=majority";
mongoose.connect(uri)
  .then(() => {
    console.log("MongoDB bağlantısı başarılı!");
  })
  .catch(err => {
    console.error("MongoDB bağlantı hatası:", err);
  });

// Socket.IO için kullanıcıları tutan yapı
// users[socket.id] = { username, currentGroup, currentRoom }
const users = {};

// Grupları bellek içinde tutan yapı.
// Key olarak groupId (UUID), içinde name ve rooms objesi var.
const groups = {};
/**
  groups = {
    "some-group-uuid": {
      name: "Sohbet",
      users: [ { id: socketId, username }, ... ],
      rooms: {
        "some-room-uuid": {
          name: "Genel",
          users: [ { id: socketId, username }, ... ]
        },
        ...
      }
    },
    ...
  }
 */

// Yardımcı fonksiyon: Bir odanın Socket.IO ismini groupId ve roomId ile birleştirerek üretir
function getRoomSocketName(groupId, roomId) {
  return `${groupId}::${roomId}`;
}

// Grupları tüm kullanıcılara gönderir (her grup ID + isim olarak)
function sendGroupsList() {
  // Object.keys(groups) => ["groupId1", "groupId2", ...]
  // Her bir groupId için { id: groupId, name: groups[groupId].name }
  const groupArray = Object.keys(groups).map(gId => ({
    id: gId,
    name: groups[gId].name
  }));
  io.emit('groupsList', groupArray);
}

app.use(express.static("public")); // Statik dosyalar (index.html, script.js, style.css)

// Socket.IO
io.on("connection", (socket) => {
  console.log("Kullanıcı bağlandı:", socket.id);
  
  // Yeni kullanıcı için varsayılan veri
  users[socket.id] = {
    username: null,
    currentGroup: null,
    currentRoom: null
  };

  // Bağlanan kullanıcıya mevcut grup listesini gönder
  sendGroupsList();

  // ---------------------
  // Login
  // ---------------------
  socket.on('login', async ({ username, password }) => {
    if (!username || !password) {
      socket.emit('loginResult', { success: false, message: 'Kullanıcı adı veya parola eksik.' });
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
        socket.emit('loginResult', { success: false, message: 'Kullanıcı adı veya parola hatalı.' });
        return;
      }
  
      socket.emit('loginResult', { success: true, username: user.username });
    } catch (err) {
      console.error(err);
      socket.emit('loginResult', { success: false, message: 'Giriş sırasında bir hata oluştu.' });
    }
  });
  
  // ---------------------
  // Register
  // ---------------------
  socket.on('register', async (userData) => {
    const { username, name, surname, birthdate, email, phone, password, passwordConfirm } = userData;
  
    if (!username || !name || !surname || !birthdate || !email || !phone || !password || !passwordConfirm) {
      socket.emit('registerResult', { success: false, message: 'Tüm alanları doldurunuz.' });
      return;
    }
  
    if (username !== username.toLowerCase()) {
      socket.emit('registerResult', { success: false, message: 'Kullanıcı adı sadece küçük harf olmalı.' });
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
      socket.emit('registerResult', { success: false, message: 'Kayıt sırasında bir hata oluştu.' });
    }
  });

  // ---------------------
  // Username Set
  // ---------------------
  socket.on('set-username', (username) => {
    if (username && typeof username === 'string') {
      users[socket.id].username = username.trim();
      console.log(`Kullanıcı ${socket.id} için kullanıcı adı belirlendi: ${username}`);
    }
  });

  // ---------------------
  // Grup Oluştur
  // ---------------------
  socket.on('createGroup', (groupName) => {
    if (groupName && typeof groupName === 'string') {
      groupName = groupName.trim();

      // Her yeni grup için UUID
      const groupId = uuidv4();
      groups[groupId] = {
        name: groupName,
        users: [],
        rooms: {}
      };
      console.log(`Yeni grup oluşturuldu: ${groupName} [ID: ${groupId}]`);

      // Tüm kullanıcılara güncel grup listesini gönder
      sendGroupsList();
    }
  });

  // ---------------------
  // Gruba Katıl (Artık groupId ile)
  // ---------------------
  socket.on('joinGroup', (groupId) => {
    const group = groups[groupId];
    if (!group) {
      console.log("Geçersiz grup ID:", groupId);
      return;
    }

    // Kullanıcının eski grubu varsa oradan çıkar
    const oldGroup = users[socket.id].currentGroup;
    const oldRoom = users[socket.id].currentRoom;
    const username = users[socket.id].username || `(Kullanıcı ${socket.id})`;

    // Eski odadaysa çıkar
    if (oldGroup && groups[oldGroup]) {
      if (oldRoom && groups[oldGroup].rooms[oldRoom]) {
        groups[oldGroup].rooms[oldRoom].users = groups[oldGroup].rooms[oldRoom].users.filter(u => u.id !== socket.id);
        io.to(getRoomSocketName(oldGroup, oldRoom)).emit('roomUsers', groups[oldGroup].rooms[oldRoom].users);
        socket.leave(getRoomSocketName(oldGroup, oldRoom));
      }
      // Eski gruptaki users listesinden çıkar
      groups[oldGroup].users = groups[oldGroup].users.filter(u => u.id !== socket.id);
      socket.leave(oldGroup);
    }

    // Yeni gruba kullanıcı ekle
    group.users.push({ id: socket.id, username });
    users[socket.id].currentGroup = groupId;
    users[socket.id].currentRoom = null;
    socket.join(groupId);

    // Bu gruptaki odaların listesini sadece bu socket’e gönder
    const rooms = Object.keys(group.rooms).map(rId => ({
      id: rId,
      name: group.rooms[rId].name
    }));
    socket.emit('roomsList', rooms);

    console.log(`Kullanıcı ${socket.id} (${username}) gruba katıldı: ${group.name} [ID: ${groupId}]`);
  });

  // ---------------------
  // Oda (Kanal) Oluştur (Artık groupId + roomId)
  // ---------------------
  socket.on('createRoom', ({ groupId, roomName }) => {
    const group = groups[groupId];
    if (!group) {
      console.log("Böyle bir grup yok:", groupId);
      return;
    }
    if (!roomName || typeof roomName !== 'string') {
      console.log("Geçersiz oda adı:", roomName);
      return;
    }

    const trimmedRoomName = roomName.trim();
    const roomId = uuidv4(); // benzersiz ID
    group.rooms[roomId] = {
      name: trimmedRoomName,
      users: []
    };
    console.log(`Yeni oda oluşturuldu: ${trimmedRoomName} [roomId: ${roomId}] GrupID: ${groupId}`);

    // O grupta olan herkese oda listesini gönder
    const rooms = Object.keys(group.rooms).map(rId => ({
      id: rId,
      name: group.rooms[rId].name
    }));
    io.to(groupId).emit('roomsList', rooms);
  });

  // ---------------------
  // Odaya Katıl (Artık roomId ile)
  // ---------------------
  socket.on('joinRoom', ({ groupId, roomId }) => {
    const group = groups[groupId];
    if (!group) {
      console.log(`Grup bulunamadı: ${groupId}`);
      return;
    }
    const room = group.rooms[roomId];
    if (!room) {
      console.log(`Oda bulunamadı: ${roomId}`);
      return;
    }

    const username = users[socket.id].username || `(Kullanıcı ${socket.id})`;

    // Eski odadan çıkar
    const oldRoom = users[socket.id].currentRoom;
    if (oldRoom && group.rooms[oldRoom]) {
      group.rooms[oldRoom].users = group.rooms[oldRoom].users.filter(u => u.id !== socket.id);
      io.to(getRoomSocketName(groupId, oldRoom)).emit('roomUsers', group.rooms[oldRoom].users);
      socket.leave(getRoomSocketName(groupId, oldRoom));
    }

    // Yeni odaya ekle
    room.users.push({ id: socket.id, username });
    users[socket.id].currentRoom = roomId;
    socket.join(getRoomSocketName(groupId, roomId));

    // O odadaki herkese kullanıcı listesini gönder
    io.to(getRoomSocketName(groupId, roomId))
      .emit('roomUsers', room.users);

    console.log(`Kullanıcı ${socket.id} (${username}) '${group.name}' içindeki '${room.name}' odasına katıldı`);
  });

  // ---------------------
  // WebRTC Sinyal
  // ---------------------
  socket.on("signal", (data) => {
    const targetId = data.to;
    if (targetId && users[targetId]) {
      // Aynı grupta ve aynı odada mı?
      const senderGroup = users[socket.id].currentGroup;
      const targetGroup = users[targetId].currentGroup;
      const senderRoom = users[socket.id].currentRoom;
      const targetRoom = users[targetId].currentRoom;

      if (senderGroup && targetGroup && senderGroup === targetGroup &&
          senderRoom && targetRoom && senderRoom === targetRoom) {
        io.to(targetId).emit("signal", {
          from: socket.id,
          signal: data.signal,
        });
      } else {
        console.log(`Signal gönderilemedi. Kullanıcılar aynı odada değil: ${socket.id} -> ${targetId}`);
      }
    } else {
      console.log(`Hedef kullanıcı mevcut değil: ${data.to}`);
    }
  });

  // ---------------------
  // Bağlantı kesildiğinde
  // ---------------------
  socket.on("disconnect", () => {
    console.log("Kullanıcı ayrıldı:", socket.id);
    const userData = users[socket.id];
    if (userData && userData.currentGroup) {
      const grpId = userData.currentGroup;
      const rmId = userData.currentRoom;
      if (groups[grpId]) {
        // Odadan çıkar
        if (rmId && groups[grpId].rooms[rmId]) {
          groups[grpId].rooms[rmId].users = groups[grpId].rooms[rmId].users.filter(u => u.id !== socket.id);
          io.to(getRoomSocketName(grpId, rmId)).emit('roomUsers', groups[grpId].rooms[rmId].users);
        }
        // Gruptan çıkar
        groups[grpId].users = groups[grpId].users.filter(u => u.id !== socket.id);
        socket.leave(grpId);
      }
    }
    delete users[socket.id];
  });
});

// Periyodik log (opsiyonel)
setInterval(() => {
  console.log("Bağlı kullanıcılar:", users);
  console.log("Gruplar:", groups);
}, 10000);

// Sunucu Başlat
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
});
