const http = require("http");
const express = require("express");
const socketIO = require("socket.io");
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid'); // UUID (zaten eklemişsiniz)

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

// Kullanıcılar
// users[socket.id] = { username, currentGroup, currentRoom }
const users = {};

// Gruplar (her grup için => owner, name, users[], rooms{})
/*
  groups = {
    [groupUUID]: {
      owner: socket.id,
      name: "Grup Adı",
      users: [
        { id: socket.id, username: "abc" },
        { id: otherSocket, username: "def" },
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

// Oda Socket.IO ismi = groupId::roomId
function getRoomSocketName(groupId, roomId) {
  return `${groupId}::${roomId}`;
}

// Sadece tek bir kullanıcıya, o kullanıcının görebileceği grupları gönder
// Mantık: user, "owner" ise veya users[] dizisinde user.id varsa görebilir.
function sendGroupsListToUser(socketId) {
  if (!users[socketId]) return; // kullanıcı yoksa çık

  const usernameVal = users[socketId].username || 'Unknown';
  console.log(`sendGroupsListToUser => ${socketId} (username:${usernameVal})`);

  const userGroups = Object.keys(groups).filter(groupId => {
    const g = groups[groupId];
    // Sahibi misin?
    if (g.owner === socketId) return true;
    // Yoksa g.users dizisinde bu user var mı?
    const isMember = g.users.some(u => u.id === socketId);
    return isMember;
  }).map(groupId => ({
    id: groupId,
    name: groups[groupId].name
  }));

  io.to(socketId).emit('groupsList', userGroups);
}

// Express Static
app.use(express.static("public")); // index.html, style.css, script.js

io.on("connection", (socket) => {
  console.log("Kullanıcı bağlandı:", socket.id);

  // Varsayılan data
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
      socket.emit('loginResult', { success: false, message: 'Kullanıcı adı veya parola boş.' });
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
      socket.emit('registerResult', { success: false, message: 'Kayıt sırasında hata.' });
    }
  });

  // ---------------------
  // set-username
  // ---------------------
  socket.on('set-username', (usernameVal) => {
    if (usernameVal && typeof usernameVal === 'string') {
      users[socket.id].username = usernameVal.trim();
      console.log(`Kullanıcı ${socket.id} => set-username => ${usernameVal}`);
      // Login sonrası, sadece bu user'a grupları gönder
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
    const usernameVal = users[socket.id].username || `(Kullanıcı ${socket.id})`;

    groups[groupId] = {
      owner: socket.id,           // Sahibi
      name: trimmed,
      users: [ { id: socket.id, username: usernameVal } ],
      rooms: {}
    };
    console.log(`Grup oluştur: [${groupId}] => '${trimmed}', owner=${socket.id}`);

    // Sadece bu user'a listesi
    sendGroupsListToUser(socket.id);
  });

  // ---------------------
  // joinGroupByID (ID ile katılma)
  // ---------------------
  socket.on('joinGroupByID', (groupId) => {
    const groupObj = groups[groupId];
    if (!groupObj) {
      socket.emit('errorMessage', "Böyle bir grup ID bulunamadı.");
      return;
    }
    const usernameVal = users[socket.id].username || `(Kullanıcı ${socket.id})`;

    // Zaten yoksa ekle
    let isInGroup = groupObj.users.some(u => u.id === socket.id);
    if (!isInGroup) {
      groupObj.users.push({ id: socket.id, username: usernameVal });
      console.log(`User ${socket.id} => joinGroupByID => ${groupId}`);
    }

    // Bu user'a gruplarını gönder
    sendGroupsListToUser(socket.id);
  });

  // ---------------------
  // joinGroup (listeden)
  // ---------------------
  socket.on('joinGroup', (groupId) => {
    const groupObj = groups[groupId];
    if (!groupObj) {
      console.log("Geçersiz grup ID:", groupId);
      return;
    }
    const oldGroup = users[socket.id].currentGroup;
    const oldRoom = users[socket.id].currentRoom;
    const usernameVal = users[socket.id].username || `(Kullanıcı ${socket.id})`;

    // Eski odadan çıkar
    if (oldGroup && groups[oldGroup]) {
      if (oldRoom && groups[oldGroup].rooms[oldRoom]) {
        groups[oldGroup].rooms[oldRoom].users = groups[oldGroup].rooms[oldRoom].users.filter(u => u.id !== socket.id);
        io.to(getRoomSocketName(oldGroup, oldRoom)).emit('roomUsers', groups[oldGroup].rooms[oldRoom].users);
        socket.leave(getRoomSocketName(oldGroup, oldRoom));
      }
      // Eski gruptan da çık
      groups[oldGroup].users = groups[oldGroup].users.filter(u => u.id !== socket.id);
      socket.leave(oldGroup);
    }

    // Bu grupta yoksa ekle
    let isInGroup = groupObj.users.some(u => u.id === socket.id);
    if (!isInGroup) {
      groupObj.users.push({ id: socket.id, username: usernameVal });
    }

    users[socket.id].currentGroup = groupId;
    users[socket.id].currentRoom = null;
    console.log(`User ${socket.id} => joinGroup => ${groupId}`);
    socket.join(groupId);

    // Odalar listesi
    const roomArray = Object.keys(groupObj.rooms).map(rId => ({
      id: rId,
      name: groupObj.rooms[rId].name
    }));
    socket.emit('roomsList', roomArray);
  });

  // ---------------------
  // createRoom
  // ---------------------
  socket.on('createRoom', ({ groupId, roomName }) => {
    const groupObj = groups[groupId];
    if (!groupObj) return;
    if (!roomName || typeof roomName !== 'string') return;

    const rId = uuidv4();
    groupObj.rooms[rId] = {
      name: roomName.trim(),
      users: []
    };
    console.log(`Grup[${groupId}] => yeni oda: ${roomName} (${rId})`);

    // Bu gruptaki tüm kullanıcılar => roomsList
    groupObj.users.forEach(usr => {
      const rmArray = Object.keys(groupObj.rooms).map(id => ({
        id,
        name: groupObj.rooms[id].name
      }));
      io.to(usr.id).emit('roomsList', rmArray);
    });
  });

  // ---------------------
  // joinRoom
  // ---------------------
  socket.on('joinRoom', ({ groupId, roomId }) => {
    const groupObj = groups[groupId];
    if (!groupObj) return;
    const roomObj = groupObj.rooms[roomId];
    if (!roomObj) return;

    const usernameVal = users[socket.id].username || `(Kullanıcı ${socket.id})`;

    // Eski odadan çıkar
    const oldRoom = users[socket.id].currentRoom;
    if (oldRoom && groupObj.rooms[oldRoom]) {
      groupObj.rooms[oldRoom].users = groupObj.rooms[oldRoom].users.filter(u => u.id !== socket.id);
      io.to(getRoomSocketName(groupId, oldRoom)).emit('roomUsers', groupObj.rooms[oldRoom].users);
      socket.leave(getRoomSocketName(groupId, oldRoom));
    }

    // Yeni odaya ekle
    roomObj.users.push({ id: socket.id, username: usernameVal });
    users[socket.id].currentRoom = roomId;
    socket.join(getRoomSocketName(groupId, roomId));
    io.to(getRoomSocketName(groupId, roomId)).emit('roomUsers', roomObj.users);

    console.log(`User ${socket.id} => joinRoom => [${groupId}/${roomId}]`);
  });

  // ---------------------
  // leaveRoom
  // ---------------------
  socket.on('leaveRoom', ({ groupId, roomId }) => {
    const groupObj = groups[groupId];
    if (!groupObj) return;
    const roomObj = groupObj.rooms[roomId];
    if (!roomObj) return;

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
          io.to(getRoomSocketName(gId, rId)).emit('roomUsers', groups[gId].rooms[rId].users);
        }
        // Gruptan çıkar
        groups[gId].users = groups[gId].users.filter(u => u.id !== socket.id);
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
});
