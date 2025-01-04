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
const Channel = require('./models/Channel'); // Kanal modeli (yeni eklendi)

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
// rooms => { roomId => { name, users:[{id,username}] } }
const groups = {};

// Statik dosyalar
app.use(express.static("public"));

/* 
  1) Sunucu başlarken DB'deki grupları belleğe ekliyoruz.
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
    console.log("loadGroupsFromDB tamamlandı. in-memory groups:", Object.keys(groups));
  } catch (err) {
    console.error("loadGroupsFromDB hatası:", err);
  }
}

/* 
  2) Sunucu başlarken DB'deki kanalları (Channel) da çekiyoruz.
     Hangi group'a aitse groups[groupId].rooms içine ekliyoruz.
*/
async function loadChannelsFromDB() {
  try {
    const allChannels = await Channel.find({}).populate('group');
    allChannels.forEach(ch => {
      if (!ch.group) return;
      const gId = ch.group.groupId; // DB'deki groupId
      if (!groups[gId]) return;
      if (!groups[gId].rooms[ch.channelId]) {
        groups[gId].rooms[ch.channelId] = {
          name: ch.name,
          users: []
        };
      }
    });
    console.log("loadChannelsFromDB tamamlandı. in-memory channels eklendi.");
  } catch (err) {
    console.error("loadChannelsFromDB hatası:", err);
  }
}

// Sunucu ilk açılırken DB'den grupları ve kanalları yükle
loadGroupsFromDB()
  .then(() => loadChannelsFromDB())
  .catch(err => console.error("DB load hata:", err));

/* 
  Bu fonksiyon, groupId için DB'den user listesini çekip
  gruptaki herkese "groupUsers" event'iyle gönderir.
  (Artık sağ panelde "Aktif Kullanıcılar" = gruba üye tüm kullanıcılar.)
*/
async function broadcastGroupUsers(groupId) {
  if (!groupId) return;
  try {
    // groupId => DB'de bul
    const groupDoc = await Group.findOne({ groupId }).populate('users');
    if (!groupDoc) return;

    // Gruptaki tüm kullanıcıların => username, name, vb. 
    const userArray = groupDoc.users.map(u => ({
      username: u.username
      // name: u.name, vb. isterseniz ekleyebilirsiniz
    }));

    // Bu groupId odasındaki herkese => groupUsers
    io.to(groupId).emit('groupUsers', userArray);
  } catch (err) {
    console.error("broadcastGroupUsers hata:", err);
  }
}

/* 
  channelsData fonksiyonu (ses kanalları + kim hangi kanalda),
  eskisi gibi. 
*/
function broadcastAllChannelsData(groupId) {
  if (!groups[groupId]) return;

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
  io.to(groupId).emit('allChannelsData', channelsObj);
}

/* Kullanıcıya DB'den group listesini gönder */
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

/* Odalar listesi => bellekten */
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

  // Yeni user verisi
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

  // set-username
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

  // createGroup
  socket.on('createGroup', async (groupName) => {
    if (!groupName || typeof groupName !== 'string') return;
    const trimmed = groupName.trim();
    if (!trimmed) return;

    const groupId = uuidv4();
    const userName = users[socket.id].username || `(User ${socket.id})`;

    // Kullanıcıyı DB'de bul
    const userDoc = await User.findOne({ username: userName });
    if (!userDoc) {
      console.log("createGroup: Kullanıcı DB'de bulunamadı:", userName);
      return;
    }

    // Yeni grup dokümanı
    const newGroup = new Group({
      groupId,
      name: trimmed,
      owner: userDoc._id,
      users: [ userDoc._id ]
    });
    await newGroup.save();

    // Kullanıcının groups alanına ekle
    userDoc.groups.push(newGroup._id);
    await userDoc.save();

    // Bellek içine ekle
    groups[groupId] = {
      owner: socket.id,
      name: trimmed,
      users: [
        { id: socket.id, username: userName }
      ],
      rooms: {}
    };
    console.log(`Yeni grup oluştur: ${trimmed} (ID=${groupId}), owner=${socket.id}`);

    // Bu user'a güncel grup listesini gönder
    await sendGroupsListToUser(socket.id);
  });

  // joinGroupByID
  socket.on('joinGroupByID', async (groupId) => {
    try {
      const userName = users[socket.id].username || `(User ${socket.id})`;
      const userDoc = await User.findOne({ username: userName });
      if (!userDoc) {
        socket.emit('errorMessage', "Kullanıcı bulunamadı (DB).");
        return;
      }

      // DB'de bu groupId var mı?
      const groupDoc = await Group.findOne({ groupId });
      if (!groupDoc) {
        socket.emit('errorMessage', "Böyle bir grup yok (DB).");
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

      // Bellekte yoksa ekle
      if (!groups[groupId]) {
        groups[groupId] = {
          owner: groupDoc.owner ? groupDoc.owner.toString() : null,
          name: groupDoc.name,
          users: [],
          rooms: {}
        };
      }

      // Katılım
      users[socket.id].currentGroup = groupId;
      users[socket.id].currentRoom = null;

      // Bellekte user kaydı yoksa ekle
      if (!groups[groupId].users.some(u => u.id === socket.id)) {
        groups[groupId].users.push({ id: socket.id, username: userName });
      }

      console.log(`User ${socket.id} => joinGroupByID => ${groupId}`);

      // Gruplar listesini tekrar gönder
      await sendGroupsListToUser(socket.id);

      // => Tüm gruba DB'den güncel user listesi (groupUsers)
      await broadcastGroupUsers(groupId);

    } catch (err) {
      console.error("joinGroupByID hata:", err);
    }
  });

  // joinGroup
  socket.on('joinGroup', async (groupId) => {
    console.log(`joinGroup event: user=${socket.id}, groupId=${groupId}`);
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
      // Eski gruptan çıkar
      groups[oldGroup].users = groups[oldGroup].users.filter(u => u.id !== socket.id);
      socket.leave(oldGroup);

      // Eski grup => allChannelsData
      broadcastAllChannelsData(oldGroup);

      // Eski grup => groupUsers
      await broadcastGroupUsers(oldGroup);
    }

    // Bu gruba ekle
    if (!groups[groupId].users.some(u => u.id === socket.id)) {
      groups[groupId].users.push({ id: socket.id, username: userName });
    }
    users[socket.id].currentGroup = groupId;
    users[socket.id].currentRoom = null;
    socket.join(groupId);

    // Odalar listesini bu kullanıcıya gönder
    sendRoomsListToUser(socket.id, groupId);

    // Tüm gruba => allChannelsData
    broadcastAllChannelsData(groupId);

    // Tüm gruba => DB'den user listesi
    await broadcastGroupUsers(groupId);

    console.log(`User ${socket.id} => joinGroup => ${groupId}`);
  });

  // createRoom
  socket.on('createRoom', async ({ groupId, roomName }) => {
    try {
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

      // DB'ye Channel ekle (opsiyonel)
      const groupDoc = await Group.findOne({ groupId });
      if (!groupDoc) {
        console.log("createRoom: DB'de group yok:", groupId);
        return;
      }
      const newChannel = new Channel({
        channelId: roomId,
        name: trimmedRoomName,
        group: groupDoc._id,
        users: []
      });
      await newChannel.save();

      // Bellekte ekle
      if (!groups[groupId].rooms) {
        groups[groupId].rooms = {};
      }
      groups[groupId].rooms[roomId] = {
        name: trimmedRoomName,
        users: []
      };
      console.log(`Yeni oda oluşturuldu: Grup=${groupId}, Oda=${roomId}, Ad=${trimmedRoomName}`);

      // O gruptaki tüm kullanıcıların => roomsList
      groups[groupId].users.forEach(u => {
        sendRoomsListToUser(u.id, groupId);
      });

      // Tüm gruba => allChannelsData
      broadcastAllChannelsData(groupId);

    } catch (err) {
      console.error("createRoom hata:", err);
    }
  });

  // joinRoom
  socket.on('joinRoom', ({ groupId, roomId }) => {
    console.log(`joinRoom event: user=${socket.id}, groupId=${groupId}, roomId=${roomId}`);
    const groupObj = groups[groupId];
    if (!groupObj) {
      console.log(`Grup bulunamadı: ${groupId}`);
      return;
    }
    if (!groupObj.rooms[roomId]) {
      console.log(`Oda (channel) bulunamadı: ${roomId}`);
      return;
    }

    const userName = users[socket.id].username || `(User ${socket.id})`;

    // Eski odadan çık
    const oldRoom = users[socket.id].currentRoom;
    if (oldRoom && groupObj.rooms[oldRoom]) {
      groupObj.rooms[oldRoom].users =
        groupObj.rooms[oldRoom].users.filter(u => u.id !== socket.id);
      io.to(`${groupId}::${oldRoom}`).emit('roomUsers', groupObj.rooms[oldRoom].users);
      socket.leave(`${groupId}::${oldRoom}`);
    }

    // Yeni odaya ekle
    groupObj.rooms[roomId].users.push({ id: socket.id, username: userName });
    users[socket.id].currentRoom = roomId;
    socket.join(`${groupId}::${roomId}`);

    // O odadaki herkese => 'roomUsers'
    io.to(`${groupId}::${roomId}`).emit('roomUsers', groupObj.rooms[roomId].users);

    // Kanalları güncelle
    broadcastAllChannelsData(groupId);

    console.log(`User ${socket.id} => joinRoom => ${groupId}/${roomId}`);
  });

  // leaveRoom
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
    console.log(`User ${socket.id} => left room => [${groupId}/${roomId}]`);

    // Kanalları güncelle
    broadcastAllChannelsData(groupId);
  });

  // WebRTC Sinyal
  socket.on("signal", (data) => {
    const targetId = data.to;
    if (socket.id === targetId) return;
    if (!users[targetId]) return;

    const senderGroup = users[socket.id].currentGroup;
    const targetGroup = users[targetId].currentGroup;
    const senderRoom = users[socket.id].currentRoom;
    const targetRoom = users[targetId].currentRoom;

    // Aynı roomdaysa sinyal
    if (senderGroup && senderGroup === targetGroup &&
        senderRoom && senderRoom === targetRoom) {
      io.to(targetId).emit("signal", {
        from: socket.id,
        signal: data.signal
      });
    }
  });

  // Disconnect
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

        // => groupUsers
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
