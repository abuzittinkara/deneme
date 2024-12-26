const http = require("http");
const express = require("express");
const socketIO = require("socket.io");
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('./models/User'); // User modelini kullanıyoruz

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

// Her socket.id için kullanıcı verisi
const users = {};  
/**
 * groups yapısı:
 * {
 *   [groupName]: {
 *     users: [ { id, username }, ... ],
 *     rooms: {
 *       [roomName]: {
 *         users: [ { id, username }, ... ]
 *       }
 *     }
 *   },
 *   ...
 * }
 */
const groups = {};

app.use(express.static("public")); // Statik dosyalar (index.html, script.js, style.css)

// Yardımcı fonksiyon: Socket.IO oda ismi için (group+room)
function getRoomSocketName(groupName, roomName) {
  return `${groupName}::${roomName}`;
}

io.on("connection", (socket) => {
  console.log("Kullanıcı bağlandı:", socket.id);
  
  // Yeni bağlanan kullanıcı
  users[socket.id] = {
    username: null,
    currentGroup: null,
    currentRoom: null // YENİ
  };

  // Yeni bağlanan kullanıcıya mevcut grup listesini gönder
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
      if (!groups[groupName]) {
        groups[groupName] = {
          users: [],
          rooms: {} // YENİ
        };
        console.log(`Yeni grup oluşturuldu: ${groupName}`);
        sendGroupsList();
      }
    }
  });

  // ---------------------
  // Gruba Katıl
  // ---------------------
  socket.on('joinGroup', (groupName) => {
    if (groupName && groups[groupName]) {
      // Kullanıcının eski grubu varsa oradan çıkar
      const oldGroup = users[socket.id].currentGroup;
      const oldRoom = users[socket.id].currentRoom;
      const username = users[socket.id].username || `(Kullanıcı ${socket.id})`;

      // Eski odadaysa çıkar
      if (oldGroup && groups[oldGroup]) {
        if (oldRoom && groups[oldGroup].rooms && groups[oldGroup].rooms[oldRoom]) {
          groups[oldGroup].rooms[oldRoom].users = groups[oldGroup].rooms[oldRoom].users.filter(u => u.id !== socket.id);
          io.to(getRoomSocketName(oldGroup, oldRoom)).emit('roomUsers', groups[oldGroup].rooms[oldRoom].users);
          socket.leave(getRoomSocketName(oldGroup, oldRoom));
        }
        // Grup kullanıcı listesinden çıkar
        groups[oldGroup].users = groups[oldGroup].users.filter(u => u.id !== socket.id);
        socket.leave(oldGroup);
      }

      // Yeni grupta kullanıcı ekle
      groups[groupName].users.push({ id: socket.id, username: username });
      users[socket.id].currentGroup = groupName;
      users[socket.id].currentRoom = null; // Oda sıfırlanır
      socket.join(groupName);

      // Bu gruptaki odaların listesini sadece bu socket’e gönder (roomsList)
      const rooms = Object.keys(groups[groupName].rooms);
      socket.emit('roomsList', rooms);

      // (İsteğe bağlı) Tüm gruba groupUsers diye yayınlamak isterseniz
      // io.to(groupName).emit('groupUsers', groups[groupName].users);

      console.log(`Kullanıcı ${socket.id} (${username}) gruba katıldı: ${groupName}`);
    }
  });

  // ---------------------
  // Oda Oluştur (YENİ)
  // ---------------------
  socket.on('createRoom', ({ groupName, roomName }) => {
    if (!groups[groupName]) {
      console.log("Böyle bir grup yok:", groupName);
      return;
    }
    if (!groups[groupName].rooms) {
      groups[groupName].rooms = {};
    }
    if (!groups[groupName].rooms[roomName]) {
      groups[groupName].rooms[roomName] = { users: [] };
      console.log(`Yeni oda oluşturuldu: ${groupName}/${roomName}`);
      // Oda listesi güncellensin
      const rooms = Object.keys(groups[groupName].rooms);
      io.to(groupName).emit('roomsList', rooms);
    }
  });

  // ---------------------
  // Odaya Katıl (YENİ)
  // ---------------------
  socket.on('joinRoom', ({ groupName, roomName }) => {
    if (!groups[groupName]) {
      console.log(`Grup bulunamadı: ${groupName}`);
      return;
    }
    if (!groups[groupName].rooms[roomName]) {
      console.log(`Oda bulunamadı: ${roomName}`);
      return;
    }

    const username = users[socket.id].username || `(Kullanıcı ${socket.id})`;

    // Eski odadan çıkar
    const oldRoom = users[socket.id].currentRoom;
    if (oldRoom && groups[groupName].rooms[oldRoom]) {
      groups[groupName].rooms[oldRoom].users = groups[groupName].rooms[oldRoom].users.filter(u => u.id !== socket.id);
      io.to(getRoomSocketName(groupName, oldRoom)).emit('roomUsers', groups[groupName].rooms[oldRoom].users);
      socket.leave(getRoomSocketName(groupName, oldRoom));
    }

    // Yeni odaya ekle
    groups[groupName].rooms[roomName].users.push({ id: socket.id, username });
    users[socket.id].currentRoom = roomName;

    // Socket.IO oda join
    socket.join(getRoomSocketName(groupName, roomName));

    // O odadaki herkese kullanıcı listesini gönder
    io.to(getRoomSocketName(groupName, roomName))
      .emit('roomUsers', groups[groupName].rooms[roomName].users);

    console.log(`Kullanıcı ${socket.id} (${username}) ${groupName} içindeki ${roomName} odasına katıldı`);
  });

  // ---------------------
  // WebRTC Sinyal
  // ---------------------
  socket.on("signal", (data) => {
    const targetId = data.to;
    if (targetId && users[targetId]) {
      const senderGroup = users[socket.id].currentGroup;
      const targetGroup = users[targetId].currentGroup;
      const senderRoom = users[socket.id].currentRoom;
      const targetRoom = users[targetId].currentRoom;

      // Aynı grupta ve aynı odada mı?
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
      const grp = userData.currentGroup;
      const rm = userData.currentRoom;
      if (groups[grp]) {
        // Odadan çıkar
        if (rm && groups[grp].rooms[rm]) {
          groups[grp].rooms[rm].users = groups[grp].rooms[rm].users.filter(u => u.id !== socket.id);
          io.to(getRoomSocketName(grp, rm)).emit('roomUsers', groups[grp].rooms[rm].users);
        }
        // Gruptan çıkar
        groups[grp].users = groups[grp].users.filter(u => u.id !== socket.id);
        socket.leave(grp);
      }
    }
    delete users[socket.id];
  });
});

// Periyodik log
setInterval(() => {
  console.log("Bağlı kullanıcılar:", users);
  console.log("Gruplar:", groups);
}, 10000);

function sendGroupsList() {
  io.emit('groupsList', Object.keys(groups));
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
});
