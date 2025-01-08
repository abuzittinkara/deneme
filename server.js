/**************************************
 * server.js
 **************************************/
const http = require("http");
const express = require("express");
const socketIO = require("socket.io");
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid'); // UUID

const User = require('./models/User');
const Group = require('./models/Group');
const Channel = require('./models/Channel');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// MongoDB bağlantısı
const uri = process.env.MONGODB_URI || "mongodb+srv://abuzorttin:19070480019Mg.@cluster0.vdrdy.mongodb.net/myappdb?retryWrites=true&w=majority";
mongoose.connect(uri)
  .then(() => console.log("MongoDB bağlantısı başarılı!"))
  .catch(err => console.error("MongoDB bağlantı hatası:", err));

// Bellek içi tablolar (Anlık takip için)
const users = {};   // socket.id -> { username, currentGroup, currentRoom }
const groups = {};  // groupId -> { owner, name, users:[], rooms:{} }

app.use(express.static("public"));

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
    console.log("loadGroupsFromDB tamam, groups:", Object.keys(groups));
  } catch (err) {
    console.error("loadGroupsFromDB hatası:", err);
  }
}

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

// Başlangıçta DB'deki grup ve kanalları belleğe yükle
loadGroupsFromDB().then(() => loadChannelsFromDB());

/**
 * Belirli bir gruba (groupId) ait kullanıcıları (DB'den) çekip
 * o gruba bağlı tüm socket'lere 'groupUsers' event'iyle gönderir.
 */
async function broadcastGroupUsers(groupId) {
  if (!groupId) return;
  try {
    const groupDoc = await Group.findOne({ groupId }).populate('users');
    if (!groupDoc) return;
    const userArray = groupDoc.users.map(u => ({
      username: u.username
    }));
    // Aynı groupId odasına bağlı herkese gönder
    io.to(groupId).emit('groupUsers', userArray);
  } catch (err) {
    console.error("broadcastGroupUsers hata:", err);
  }
}

/**
 * Bir gruptaki tüm kanalların
 * "oda adı" ve "oda içindeki kullanıcılar" bilgisini alır,
 * o gruba bağlı herkese ('allChannelsData') olarak gönderir.
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

/**
 * Aynı 'allChannelsData' bilgisini, sadece tek bir kullanıcıya gönderir
 * (ör. browseGroup çağrısı sonrasında istemciye göstermek için).
 */
function sendAllChannelsDataToOneUser(socketId, groupId) {
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
  // Sadece tek socket'e gönder
  io.to(socketId).emit('allChannelsData', channelsObj);
}

/**
 * Kullanıcının (socketId) DB'de üye olduğu grupları bulup
 * 'groupsList' event'iyle geri gönderir.
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

/**
 * Bir gruptaki (groupId) odaların (kanalların) listesini
 * ilgili socket'e gönderir ('roomsList' event'i).
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

/**
 * Socket.IO ana bağlantı noktası
 */
io.on("connection", (socket) => {
  console.log("Kullanıcı bağlandı:", socket.id);

  // Bağlanan kullanıcı için bellek tablosuna başlangıç kaydı
  users[socket.id] = {
    username: null,
    currentGroup: null,
    currentRoom: null
  };

  /**
   * LOGIN
   */
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

  /**
   * REGISTER (yeni kullanıcı oluşturma)
   */
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

  /**
   * Kullanıcı, front-end'de 'set-username' emit edince
   * bellek tablosunda username kaydedip,
   * bu kullanıcıya ait grupların listesini gönderiyoruz.
   */
  socket.on('set-username', async (usernameVal) => {
    if (usernameVal && typeof usernameVal === 'string') {
      users[socket.id].username = usernameVal.trim();
      console.log(`User ${socket.id} => set-username => ${usernameVal}`);
      try {
        await sendGroupsListToUser(socket.id);
      } catch (err) {
        console.error("sendGroupsListToUser hata:", err);
      }
    }
  });

  /**
   * Grup oluştur
   */
  socket.on('createGroup', async (groupName) => {
    if (!groupName) return;
    const trimmed = groupName.trim();
    if (!trimmed) return;

    const groupId = uuidv4();
    const userName = users[socket.id].username || `(User ${socket.id})`;
    const userDoc = await User.findOne({ username: userName });
    if (!userDoc) return;

    // DB'ye kaydet
    const newGroup = new Group({
      groupId,
      name: trimmed,
      owner: userDoc._id,
      users: [ userDoc._id ]
    });
    await newGroup.save();

    // User'ın grup listesine ekle
    userDoc.groups.push(newGroup._id);
    await userDoc.save();

    // Bellek içi tabloya ekle
    groups[groupId] = {
      owner: socket.id,
      name: trimmed,
      users: [ { id: socket.id, username: userName } ],
      rooms: {}
    };
    console.log(`Yeni grup: ${trimmed} (ID=${groupId}), owner=${socket.id}`);

    // Bu kullanıcıya güncel grup listesini gönder
    await sendGroupsListToUser(socket.id);
  });

  /**
   * joinGroupByID => Örneğin bir "invite link" gibi, ID ile gruba katılmak istenirse
   * (gerçekten bu gruba "join" edilecek, eski gruptan çıkılır)
   */
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

      // DB'de user <-> group ilişkisini güncelle
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

      // Sunucu tarafında da "joinGroup" mantığını uygulayalım:
      const oldGroup = users[socket.id].currentGroup;
      const oldRoom = users[socket.id].currentRoom;

      // Eski gruptan/odadan çık
      if (oldGroup && groups[oldGroup]) {
        if (oldRoom && groups[oldGroup].rooms[oldRoom]) {
          groups[oldGroup].rooms[oldRoom].users =
            groups[oldGroup].rooms[oldRoom].users.filter(u => u.id !== socket.id);
          io.to(`${oldGroup}::${oldRoom}`).emit('roomUsers', groups[oldGroup].rooms[oldRoom].users);
          socket.leave(`${oldGroup}::${oldRoom}`);
        }
        groups[oldGroup].users = groups[oldGroup].users.filter(u => u.id !== socket.id);
        socket.leave(oldGroup);

        broadcastAllChannelsData(oldGroup);
        await broadcastGroupUsers(oldGroup);
      }

      // Yeni gruba ekle
      if (!groups[groupId].users.some(u => u.id === socket.id)) {
        groups[groupId].users.push({ id: socket.id, username: userName });
      }
      users[socket.id].currentGroup = groupId;
      users[socket.id].currentRoom = null;
      socket.join(groupId);

      console.log(`User ${socket.id} => joinGroupByID => ${groupId}`);

      // Bu kullanıcıya odalar listesini gönder
      sendRoomsListToUser(socket.id, groupId);
      // Tüm kanallardaki güncel kullanıcı listesini gönder
      broadcastAllChannelsData(groupId);
      // DB'den çekilen user listesi => 'groupUsers'
      await broadcastGroupUsers(groupId);

    } catch (err) {
      console.error("joinGroupByID hata:", err);
    }
  });

  /**
   * browseGroup => Yalnızca o grubun kanallarını (roomsList) + "kanallarda kim var" verisini gönderir.
   * Sesli olarak katılma, ayrılma vs. olmaz.
   */
  socket.on('browseGroup', (groupId) => {
    if (!groups[groupId]) return;
    // Sadece oda listesini gönder
    sendRoomsListToUser(socket.id, groupId);
    // Kanallarda kim var bilgisi de tek seferde gönderilsin
    sendAllChannelsDataToOneUser(socket.id, groupId);
  });

  /**
   * joinGroup => gerçekten bu gruba geç,
   * eğer eski grupta isen oradan çık.
   */
  socket.on('joinGroup', async (groupId) => {
    if (!groups[groupId]) return;
    const oldGroup = users[socket.id].currentGroup;
    const oldRoom = users[socket.id].currentRoom;
    const userName = users[socket.id].username || `(User ${socket.id})`;

    // Eski gruptan / kanaldan ayrılma
    if (oldGroup && groups[oldGroup]) {
      if (oldRoom && groups[oldGroup].rooms[oldRoom]) {
        groups[oldGroup].rooms[oldRoom].users =
          groups[oldGroup].rooms[oldRoom].users.filter(u => u.id !== socket.id);
        io.to(`${oldGroup}::${oldRoom}`).emit('roomUsers', groups[oldGroup].rooms[oldRoom].users);
        socket.leave(`${oldGroup}::${oldRoom}`);
      }
      groups[oldGroup].users = groups[oldGroup].users.filter(u => u.id !== socket.id);
      socket.leave(oldGroup);

      broadcastAllChannelsData(oldGroup);
      await broadcastGroupUsers(oldGroup);
    }

    // Yeni gruba ekle
    if (!groups[groupId].users.some(u => u.id === socket.id)) {
      groups[groupId].users.push({ id: socket.id, username: userName });
    }
    users[socket.id].currentGroup = groupId;
    users[socket.id].currentRoom = null;
    socket.join(groupId);

    // Kullanıcıya odalar listesi gönder
    sendRoomsListToUser(socket.id, groupId);
    // Kanallardaki güncel veri
    broadcastAllChannelsData(groupId);
    // DB'den grup üyeleri listesi
    await broadcastGroupUsers(groupId);
  });

  /**
   * createRoom => Bir grup içinde yeni oda (channel) açar, DB'ye de kaydeder
   */
  socket.on('createRoom', async ({ groupId, roomName }) => {
    try {
      if (!groups[groupId]) return;
      if (!roomName) return;
      const trimmed = roomName.trim();
      if (!trimmed) return;

      const roomId = uuidv4();
      const groupDoc = await Group.findOne({ groupId });
      if (!groupDoc) return;

      // DB'ye Channel dokümanı ekle
      const newChannel = new Channel({
        channelId: roomId,
        name: trimmed,
        group: groupDoc._id,
        users: []
      });
      await newChannel.save();

      // Bellek içi tabloya ekle
      groups[groupId].rooms[roomId] = {
        name: trimmed,
        users: []
      };
      console.log(`Yeni oda: group=${groupId}, room=${roomId}, name=${trimmed}`);

      // Gruba bağlı tüm kullanıcılara odalar listesini güncelle
      groups[groupId].users.forEach(u => {
        sendRoomsListToUser(u.id, groupId);
      });
      broadcastAllChannelsData(groupId);
    } catch (err) {
      console.error("createRoom hata:", err);
    }
  });

  /**
   * joinRoom => Seçili gruptaki belirli bir odaya gir,
   * o odada kim varsa => 'roomUsers' event'iyle herkese gönder
   */
  socket.on('joinRoom', ({ groupId, roomId }) => {
    if (!groups[groupId]) return;
    if (!groups[groupId].rooms[roomId]) return;

    const userName = users[socket.id].username || `(User ${socket.id})`;

    // Eski odadan çık
    const oldRoom = users[socket.id].currentRoom;
    if (oldRoom && groups[groupId].rooms[oldRoom]) {
      groups[groupId].rooms[oldRoom].users =
        groups[groupId].rooms[oldRoom].users.filter(u => u.id !== socket.id);
      io.to(`${groupId}::${oldRoom}`).emit('roomUsers', groups[groupId].rooms[oldRoom].users);
      socket.leave(`${groupId}::${oldRoom}`);
    }

    // Yeni odaya ekle
    groups[groupId].rooms[roomId].users.push({ id: socket.id, username: userName });
    users[socket.id].currentRoom = roomId;
    socket.join(`${groupId}::${roomId}`);

    // Odadaki herkese kimler var diye bildir
    io.to(`${groupId}::${roomId}`).emit('roomUsers', groups[groupId].rooms[roomId].users);

    // Kanallardaki veriyi güncelle
    broadcastAllChannelsData(groupId);
  });

  /**
   * leaveRoom => Odadan ayrıl, peer bağlantıları client tarafında kapatılır
   */
  socket.on('leaveRoom', ({ groupId, roomId }) => {
    if (!groups[groupId]) return;
    if (!groups[groupId].rooms[roomId]) return;

    groups[groupId].rooms[roomId].users =
      groups[groupId].rooms[roomId].users.filter(u => u.id !== socket.id);
    io.to(`${groupId}::${roomId}`).emit('roomUsers', groups[groupId].rooms[roomId].users);
    socket.leave(`${groupId}::${roomId}`);

    users[socket.id].currentRoom = null;
    broadcastAllChannelsData(groupId);
  });

  /**
   * WebRTC "signal" => Tek kullanıcıdan gelen offer/answer/ice'i,
   * hedef kullanıcıya yönlendirir
   */
  socket.on("signal", (data) => {
    const targetId = data.to;
    if (socket.id === targetId) return;
    if (!users[targetId]) return;

    const sG = users[socket.id].currentGroup;
    const tG = users[targetId].currentGroup;
    const sR = users[socket.id].currentRoom;
    const tR = users[targetId].currentRoom;

    // İki tarafta aynı grup ve aynı odada iseler => sinyal ilet
    if (sG && sG === tG && sR && sR === tR) {
      io.to(targetId).emit("signal", {
        from: socket.id,
        signal: data.signal
      });
    }
  });

  /**
   * socket.disconnect => Kullanıcı tarayıcıdan çıktı/yeniden yüklendi vs.
   */
  socket.on("disconnect", async () => {
    console.log("disconnect:", socket.id);
    const userData = users[socket.id];
    if (userData && userData.currentGroup) {
      const gId = userData.currentGroup;
      const rId = userData.currentRoom;
      if (groups[gId]) {
        // Odadaysa odadan çıkar
        if (rId && groups[gId].rooms[rId]) {
          groups[gId].rooms[rId].users =
            groups[gId].rooms[rId].users.filter(u => u.id !== socket.id);
          io.to(`${gId}::${rId}`).emit('roomUsers', groups[gId].rooms[rId].users);
        }
        // Gruptan çıkar
        groups[gId].users = groups[gId].users.filter(u => u.id !== socket.id);

        // Güncel veriler
        broadcastAllChannelsData(gId);
        await broadcastGroupUsers(gId);
      }
    }
    delete users[socket.id];
  });
});

// Sunucuyu başlat
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
});
