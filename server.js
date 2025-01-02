const http = require("http");
const express = require("express");
const socketIO = require("socket.io");
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

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
const users = {};  
/*
  users[socket.id] = {
    username: ...,
    currentGroup: ...,
    currentRoom: ...
  }
*/

// Gruplar
const groups = {};
/*
  groups = {
    [groupUUID]: {
      owner: socketId,
      name: "Grup Adı",
      users: [ {id, username}, ... ],
      rooms: {
        [roomUUID]: {
          name: "Oda Adı",
          users: [ { id, username }, ...]
        }
      }
    }
  }
*/

function getRoomSocketName(groupId, roomId) {
  return `${groupId}::${roomId}`;
}

// Bir gruptaki kullanıcıları alfabe sırasına göre döner
function getAlphabeticalGroupUsers(groupObj) {
  // groupObj.users => [ {id, username}, ... ]
  // Kopyasını alıp username'e göre sıralayalım
  const sorted = groupObj.users.slice().sort((a, b) => {
    return a.username.localeCompare(b.username);
  });
  return sorted;
}

// Sadece BİR kullanıcıya, grubun TÜM kullanıcılarını (alfabetik) gönder
function sendGroupUsers(socketId, groupId) {
  if (!groups[groupId]) return;
  const groupObj = groups[groupId];
  const sortedUsers = getAlphabeticalGroupUsers(groupObj);
  io.to(socketId).emit('groupUsers', sortedUsers);
}

app.use(express.static("public")); // index.html, script.js, style.css

io.on("connection", (socket) => {
  console.log("Kullanıcı bağlandı:", socket.id);
  
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
    } catch(err) {
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
        socket.emit('registerResult', { success: false, message: 'Kullanıcı adı veya e-posta alınmış.' });
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
    if (usernameVal) {
      users[socket.id].username = usernameVal.trim();
      console.log(`User ${socket.id} => set-username => ${usernameVal}`);
    }
  });

  // ---------------------
  // Grup Oluştur
  // ---------------------
  socket.on('createGroup', (groupName) => {
    if (!groupName) return;
    const gName = groupName.trim();
    if (!gName) return;

    const groupId = uuidv4();
    const userName = users[socket.id].username || `(User ${socket.id})`;

    groups[groupId] = {
      owner: socket.id,
      name: gName,
      users: [
        { id: socket.id, username: userName }
      ],
      rooms: {}
    };
    console.log(`Grup oluşturuldu: ${gName} (ID=${groupId}), owner=${socket.id}`);

    // Sadece bu user'a "groupsList" mantığını client'ta handle ediyorsanız => 
    // sendGroupsListToUser(socket.id); // YAPILABİLİR
    // Ama esas odak, group'a girince groupUsers veriyoruz vs.
  });

  // ---------------------
  // joinGroupByID
  // ---------------------
  socket.on('joinGroupByID', (groupId) => {
    if (!groups[groupId]) {
      socket.emit('errorMessage', "Grup ID bulunamadı.");
      return;
    }
    const userName = users[socket.id].username || `(User ${socket.id})`;
    const group = groups[groupId];

    // Ekli değilse ekle
    const alreadyIn = group.users.some(u => u.id === socket.id);
    if (!alreadyIn) {
      group.users.push({ id: socket.id, username: userName });
      console.log(`User ${socket.id} => joinGroupByID => ${groupId}`);
    }

    // Şu an aktif group
    users[socket.id].currentGroup = groupId;
    users[socket.id].currentRoom = null;
    // Group'a user panelinde => "groupUsers" olayı
    const sorted = getAlphabeticalGroupUsers(group);
    io.to(socket.id).emit('groupUsers', sorted);
  });

  // ---------------------
  // joinGroup (listeden)
  // ---------------------
  socket.on('joinGroup', (groupId) => {
    const group = groups[groupId];
    if (!group) return;
    
    const oldGroup = users[socket.id].currentGroup;
    const oldRoom = users[socket.id].currentRoom;
    const userName = users[socket.id].username || `(User ${socket.id})`;

    // Eski odadan çıkar
    if (oldGroup && groups[oldGroup]) {
      if (oldRoom && groups[oldGroup].rooms[oldRoom]) {
        groups[oldGroup].rooms[oldRoom].users =
          groups[oldGroup].rooms[oldRoom].users.filter(u => u.id !== socket.id);
        io.to(getRoomSocketName(oldGroup, oldRoom)).emit(
          'roomUsers', groups[oldGroup].rooms[oldRoom].users
        );
        socket.leave(getRoomSocketName(oldGroup, oldRoom));
      }
      // Eski group user listesinden çıkar
      groups[oldGroup].users = groups[oldGroup].users.filter(u => u.id !== socket.id);
      socket.leave(oldGroup);
    }

    // Bu group'ta user yoksa ekle
    if (!group.users.some(u => u.id === socket.id)) {
      group.users.push({ id: socket.id, username: userName });
    }
    users[socket.id].currentGroup = groupId;
    users[socket.id].currentRoom = null;
    socket.join(groupId);

    // Artık group'un user listesi => "groupUsers" event
    const sortedUsers = getAlphabeticalGroupUsers(group);
    io.to(socket.id).emit('groupUsers', sortedUsers);

    console.log(`User ${socket.id} => joinGroup => ${groupId}`);
  });

  // ---------------------
  // createRoom
  // ---------------------
  socket.on('createRoom', ({ groupId, roomName }) => {
    const group = groups[groupId];
    if (!group || !roomName) return;

    const rId = uuidv4();
    group.rooms[rId] = {
      name: roomName.trim(),
      users: []
    };
    console.log(`Grup[${groupId}] => yeni oda: ${roomName} (roomId=${rId})`);

    // Kim o grupta ise => roomsList
    // (ama "groupUsers" mantığına geçtik, yine isterseniz client'ta "roomsList" tutabilirsiniz.)
  });

  // ---------------------
  // joinRoom
  // ---------------------
  socket.on('joinRoom', ({ groupId, roomId }) => {
    const group = groups[groupId];
    if (!group) return;
    const roomObj = group.rooms[roomId];
    if (!roomObj) return;

    const userName = users[socket.id].username || `(User ${socket.id})`;
    // Eski odadan çıkar
    const oldRoom = users[socket.id].currentRoom;
    if (oldRoom && group.rooms[oldRoom]) {
      group.rooms[oldRoom].users =
        group.rooms[oldRoom].users.filter(u => u.id !== socket.id);
      io.to(getRoomSocketName(groupId, oldRoom)).emit(
        'roomUsers',
        group.rooms[oldRoom].users
      );
      socket.leave(getRoomSocketName(groupId, oldRoom));
    }
    // Yeni odaya gir
    roomObj.users.push({ id: socket.id, username: userName });
    users[socket.id].currentRoom = roomId;
    socket.join(getRoomSocketName(groupId, roomId));
    // (Eskiden "roomUsers" -> ama biz groupUsers'a geçtik,
    //  isterseniz "roomUsers" da yollayabilirsiniz.)
  });

  // ---------------------
  // leaveRoom
  // ---------------------
  socket.on('leaveRoom', ({ groupId, roomId }) => {
    const group = groups[groupId];
    if (!group) return;
    const roomObj = group.rooms[roomId];
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

    // Aynı grubun ve aynı odanın katılımcısı iseler...
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
          groups[gId].rooms[rId].users =
            groups[gId].rooms[rId].users.filter(u => u.id !== socket.id);
          io.to(getRoomSocketName(gId, rId)).emit('roomUsers', groups[gId].rooms[rId].users);
        }
        // Gruptan çıkar
        groups[gId].users = groups[gId].users.filter(u => u.id !== socket.id);
      }
    }
    delete users[socket.id];
  });
});

// Periodik log (opsiyonel)
setInterval(() => {
  console.log("users:", users);
  console.log("groups:", groups);
}, 10000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
});
