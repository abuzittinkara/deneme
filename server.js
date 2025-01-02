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

// users[socket.id] = { username, currentGroup, currentRoom }
const users = {};

// groups yapısı => her group için: { name, owner, members, rooms }
const groups = {};
/*
  groups = {
    [groupUUID]: {
      name: "Sohbet",
      owner: "socketId_of_owner",
      members: ["socketId_of_owner", "socketId2", ...],
      rooms: {
        [roomUUID]: {
          name: "Oda Adı",
          users: [ { id, username }, ... ]
        }
      }
    }
  }
*/

// Oda ismi belirlemede groupId + roomId
function getRoomSocketName(groupId, roomId) {
  return `${groupId}::${roomId}`;
}

// Sadece BİR kullanıcıya, o kullanıcının görebileceği grupları gönder
function sendGroupsListToUser(socketId) {
  // Kullanıcı verisi yoksa çık
  if (!users[socketId]) return;

  const userGroups = Object.keys(groups)
    .filter(gId => {
      // Filtre: Bu grubun owner'ı socketId mi veya members array'inde mi?
      const grp = groups[gId];
      return (grp.owner === socketId || grp.members.includes(socketId));
    })
    .map(gId => ({
      id: gId,
      name: groups[gId].name
    }));

  io.to(socketId).emit('groupsList', userGroups);
}

app.use(express.static("public")); // index.html, style.css, script.js

io.on("connection", (socket) => {
  console.log("Kullanıcı bağlandı:", socket.id);

  // Varsayılan user verisi
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
      socket.emit('registerResult', { success: false, message: 'Tüm alanları doldurun.' });
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

  // set-username
  socket.on('set-username', (usernameVal) => {
    if (usernameVal && typeof usernameVal === 'string') {
      users[socket.id].username = usernameVal.trim();
      console.log(`Kullanıcı ${socket.id} => set-username => ${usernameVal}`);
      // Giriş sonrası, sadece bu user'a kendi gruplarını gönder
      sendGroupsListToUser(socket.id);
    }
  });

  // ---------------------
  // Grup Oluştur
  // ---------------------
  socket.on('createGroup', (groupName) => {
    if (!groupName || typeof groupName !== 'string') return;
    const trimmed = groupName.trim();
    if (!trimmed) return;

    // UUID ile groupId oluştur
    const groupId = uuidv4();
    groups[groupId] = {
      name: trimmed,
      owner: socket.id,           // sadece bu user
      members: [socket.id],       // kuran user da eklensin
      rooms: {}
    };
    console.log(`Yeni grup oluşturuldu: ${trimmed} [ID: ${groupId}], owner: ${socket.id}`);

    // Sadece bu user'a gruplarını gönder
    sendGroupsListToUser(socket.id);
  });

  // ---------------------
  // Gruba ID ile katıl
  // ---------------------
  socket.on('joinGroupByID', (groupId) => {
    if (!groups[groupId]) {
      socket.emit('errorMessage', "Böyle bir grup ID bulunamadı.");
      return;
    }
    // Zaten yoksa ekle
    if (!groups[groupId].members.includes(socket.id)) {
      groups[groupId].members.push(socket.id);
      console.log(`User ${socket.id} => joinGroupByID => ${groupId}`);
    }
    // Bu user'a gruplarını gönder
    sendGroupsListToUser(socket.id);
  });

  // ---------------------
  // Listeden Gruba Katıl
  // ---------------------
  socket.on('joinGroup', (groupId) => {
    if (!groups[groupId]) {
      console.log("Geçersiz grup ID:", groupId);
      return;
    }
    const oldGroup = users[socket.id].currentGroup;
    const oldRoom = users[socket.id].currentRoom;
    const usernameVal = users[socket.id].username || `(Kullanıcı ${socket.id})`;

    // Eski odadan çık
    if (oldGroup && groups[oldGroup]) {
      if (oldRoom && groups[oldGroup].rooms[oldRoom]) {
        groups[oldGroup].rooms[oldRoom].users = groups[oldGroup].rooms[oldRoom].users.filter(u => u.id !== socket.id);
        io.to(getRoomSocketName(oldGroup, oldRoom)).emit('roomUsers', groups[oldGroup].rooms[oldRoom].users);
        socket.leave(getRoomSocketName(oldGroup, oldRoom));
      }
    }
    // Bu grupta yoksa ekle
    if (!groups[groupId].members.includes(socket.id)) {
      groups[groupId].members.push(socket.id);
    }
    users[socket.id].currentGroup = groupId;
    users[socket.id].currentRoom = null;
    console.log(`User ${socket.id} => joinGroup => ${groupId}`);

    // Odalar listesini sadece bu kullanıcıya gönder
    const groupObj = groups[groupId];
    const rooms = Object.keys(groupObj.rooms).map(rId => ({
      id: rId,
      name: groupObj.rooms[rId].name
    }));
    socket.emit('roomsList', rooms);
  });

  // ---------------------
  // Oda Oluştur
  // ---------------------
  socket.on('createRoom', ({ groupId, roomName }) => {
    if (!groups[groupId]) return;
    if (!roomName || typeof roomName !== 'string') return;

    const rid = uuidv4();
    groups[groupId].rooms[rid] = {
      name: roomName.trim(),
      users: []
    };
    console.log(`Grup[${groupId}] => yeni oda: ${roomName} (${rid})`);

    // Bu gruptaki tüm members'a roomsList gönder
    groups[groupId].members.forEach(memId => {
      if (users[memId]) {
        const rmArray = Object.keys(groups[groupId].rooms).map(rId => ({
          id: rId,
          name: groups[groupId].rooms[rId].name
        }));
        io.to(memId).emit('roomsList', rmArray);
      }
    });
  });

  // ---------------------
  // Odaya Katıl
  // ---------------------
  socket.on('joinRoom', ({ groupId, roomId }) => {
    if (!groups[groupId] || !groups[groupId].rooms[roomId]) return;

    const groupObj = groups[groupId];
    const roomObj = groupObj.rooms[roomId];
    const usernameVal = users[socket.id].username || `(Kullanıcı ${socket.id})`;

    // Eski odadan çıkar
    const oldRoom = users[socket.id].currentRoom;
    if (oldRoom && groupObj.rooms[oldRoom]) {
      groupObj.rooms[oldRoom].users = groupObj.rooms[oldRoom].users.filter(u => u.id !== socket.id);
      io.to(getRoomSocketName(groupId, oldRoom)).emit('roomUsers', groupObj.rooms[oldRoom].users);
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
  // Odayı Terk Etme (Ayrıl)
  // ---------------------
  socket.on('leaveRoom', ({ groupId, roomId }) => {
    if (!groups[groupId] || !groups[groupId].rooms[roomId]) return;
    const roomObj = groups[groupId].rooms[roomId];
    roomObj.users = roomObj.users.filter(u => u.id !== socket.id);
    io.to(getRoomSocketName(groupId, roomId)).emit('roomUsers', roomObj.users);
    socket.leave(getRoomSocketName(groupId, roomId));
    users[socket.id].currentRoom = null;
    console.log(`User ${socket.id} ayrıldı odadan => ${groupId}/${roomId}`);
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

    // Aynı grup + aynı oda
    if (senderGroup && senderGroup === targetGroup &&
        senderRoom && senderRoom === targetRoom) {
      io.to(targetId).emit("signal", { from: socket.id, signal: data.signal });
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
          io.to(getRoomSocketName(gId, rId)).emit('roomUsers', groups[gId].rooms[rId].users);
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
  console.log("Bağlı kullanıcılar:", users);
  console.log("Gruplar:", groups);
}, 10000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
});
