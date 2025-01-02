const http = require("http");
const express = require("express");
const socketIO = require("socket.io");
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid'); // UUID

const User = require('./models/User');  // User model
const Group = require('./models/Group'); // <-- Yeni eklediğimiz Group model

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// MongoDB Bağlantısı
const uri = process.env.MONGODB_URI || "mongodb+srv://abuzorttin:19070480019Mg.@cluster0.vdrdy.mongodb.net/myappdb?retryWrites=true&w=majority";
mongoose.connect(uri)
  .then(() => console.log("MongoDB bağlantısı başarılı!"))
  .catch(err => console.error("MongoDB bağlantı hatası:", err));

// Kullanıcılar (Bellek içi)
const users = {};

// Gruplar (Bellek içi) => groupId => { owner, name, users:[], rooms:{} }
const groups = {};

/*
  Artık gruplar aynı zamanda MongoDB'de saklanıyor (Group model).
  Bellek içi "groups" yapısı hâlâ gerçek zamanlı işlev için varlığını koruyor,
  fakat kullanıcı her girişte veritabanındaki grup kayıtlarını da alabilecek.
*/

// ----------------------------------------------------------
// Bir kullanıcıya, veritabanında kayıtlı (katıldığı/oluşturduğu) grupları gönder
// ----------------------------------------------------------
async function sendGroupsListToUser(socketId) {
  const userData = users[socketId];
  if (!userData) return;

  // Kullanıcının username'i ile DB'deki kaydını bul
  const userDoc = await User.findOne({ username: userData.username })
    .populate('groups'); // groups alanını doldur (ref:'Group')

  if (!userDoc) return;

  // DB'den gelen userDoc.groups dizisi içindeki Group dokümanlarını map'liyoruz
  const userGroups = userDoc.groups.map(g => ({
    id: g.groupId,  // groupId (UUID)
    name: g.name
  }));

  // İstemciye gönder
  io.to(socketId).emit('groupsList', userGroups);
}

// ----------------------------------------------------------
// roomsList => Bellek içi "groups" objesinden hala okunuyor
// ----------------------------------------------------------
function sendRoomsListToUser(socketId, groupId) {
  const groupObj = groups[groupId];
  if (!groupObj) return;
  const roomArray = Object.keys(groupObj.rooms).map(rId => ({
    id: rId,
    name: groupObj.rooms[rId].name
  }));
  io.to(socketId).emit('roomsList', roomArray);
}

app.use(express.static("public")); // index.html, script.js, style.css

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
        phone,
        groups: [] // Başlangıçta boş dizi
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
      users[socket.id].username = usernameVal.trim();
      console.log(`User ${socket.id} => set-username => ${usernameVal}`);

      // Giriş sonrası => bu user'a, DB'den grup listesini gönder
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

    // Veritabanından kullanıcıyı bul
    const userDoc = await User.findOne({ username: userName });
    if (!userDoc) {
      console.log("createGroup: Kullanıcı DB'de bulunamadı:", userName);
      return;
    }

    // Yeni Group dokümanı oluştur
    const newGroup = new Group({
      groupId,
      name: trimmed,
      owner: userDoc._id,
      users: [ userDoc._id ]
    });
    await newGroup.save();

    // Kullanıcının groups alanına bu yeni group'u ekle
    userDoc.groups.push(newGroup._id);
    await userDoc.save();

    // Bellek içinde de sakla (gerçek zamanlı logic için)
    groups[groupId] = {
      owner: socket.id,
      name: trimmed,
      users: [
        { id: socket.id, username: userName }
      ],
      rooms: {}
    };
    console.log(`Yeni grup oluştur: ${trimmed} (ID=${groupId}), owner=${socket.id}`);

    // Sadece bu user'a => güncel grup listesini DB'den çekip gönder
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
        socket.emit('errorMessage', "Kullanıcı bulunamadı (DB).");
        return;
      }

      const groupDoc = await Group.findOne({ groupId });
      if (!groupDoc) {
        socket.emit('errorMessage', "Böyle bir grup yok.");
        return;
      }

      // Gruba henüz ekli değilse DB'ye ekle
      if (!groupDoc.users.includes(userDoc._id)) {
        groupDoc.users.push(userDoc._id);
        await groupDoc.save();
      }

      // Kullanıcının groups listesine ekle
      if (!userDoc.groups.includes(groupDoc._id)) {
        userDoc.groups.push(groupDoc._id);
        await userDoc.save();
      }

      users[socket.id].currentGroup = groupId;
      users[socket.id].currentRoom = null;
      console.log(`User ${socket.id} => joinGroupByID => ${groupId}`);

      // Bellek tarafında da yoksa ekle
      if (!groups[groupId]) {
        groups[groupId] = {
          owner: groupDoc.owner.toString(), // veya memory'de tam socket.id eşleme opsiyonel
          name: groupDoc.name,
          users: [],
          rooms: {}
        };
      }
      if (!groups[groupId].users.some(u => u.id === socket.id)) {
        groups[groupId].users.push({ id: socket.id, username: userName });
      }

      // Bu user'a => DB'den grup listesini tekrar gönder
      await sendGroupsListToUser(socket.id);

    } catch (err) {
      console.error("joinGroupByID hata:", err);
    }
  });

  // ---------------------
  // joinGroup (listeden)
  // ---------------------
  socket.on('joinGroup', async (groupId) => {
    if (!groups[groupId]) {
      console.log("Geçersiz grup ID (in-memory):", groupId);
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
      // Eski gruptan da çıkar (bellek tarafında)
      groups[oldGroup].users = groups[oldGroup].users.filter(u => u.id !== socket.id);
      socket.leave(oldGroup);
    }

    // Bu grupta yoksa bellek tarafında ekle
    if (!groups[groupId].users.some(u => u.id === socket.id)) {
      groups[groupId].users.push({ id: socket.id, username: userName });
    }
    users[socket.id].currentGroup = groupId;
    users[socket.id].currentRoom = null;
    socket.join(groupId);

    // Odalar listesi sadece bu kullanıcıya (in-memory)
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
        // Gruptan çıkar (bellek tarafı)
        groups[gId].users = groups[gId].users.filter(u => u.id !== socket.id);
      }
    }
    delete users[socket.id];
  });
});

// Periyodik log (opsiyonel)
setInterval(() => {
  console.log("users (in-memory):", users);
  console.log("groups (in-memory):", groups);
}, 10000);

// Sunucu Başlat
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
});
