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

// Şu an çevrimiçi (online) olan kullanıcı adlarını tutuyoruz
// (usernames düzeyinde)
const onlineUsernames = new Set();

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
 * Bir gruba üye (DB'de) olan kullanıcıları çekiyoruz,
 * sonra her kullanıcı için "onlineUsernames" set'inde var mı yok mu bakarak
 * online / offline ayrımı yapıyoruz.
 * Ardından bu sonucu => { online: [...], offline: [...] } şeklinde emit ediyoruz.
 */
async function broadcastGroupUsers(groupId) {
  if (!groupId) return;
  try {
    const groupDoc = await Group.findOne({ groupId }).populate('users');
    if (!groupDoc) return;

    const online = [];
    const offline = [];

    groupDoc.users.forEach(u => {
      // u.username => eğer onlineUsernames'te varsa online, yoksa offline
      if (onlineUsernames.has(u.username)) {
        online.push({ username: u.username });
      } else {
        offline.push({ username: u.username });
      }
    });

    io.to(groupId).emit('groupUsers', { online, offline });
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

// Socket.IO
io.on("connection", (socket) => {
  console.log("Kullanıcı bağlandı:", socket.id);

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
      // Giriş başarılı => client'a bildir
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

  /**
   * set-username => kullanıcı adını belirleme
   * Burada user "online" olmuş oluyor => onlineUsernames'e ekliyoruz.
   * Ardından, bu kullanıcının üye olduğu tüm gruplar için broadcastGroupUsers yaparak
   * bu user "online" duruma geldiğini yansıtacağız.
   */
  socket.on('set-username', async (usernameVal) => {
    if (usernameVal && typeof usernameVal === 'string') {
      const trimmedName = usernameVal.trim();
      users[socket.id].username = trimmedName;
      console.log(`User ${socket.id} => set-username => ${trimmedName}`);

      // Bu kullanıcı artık online
      onlineUsernames.add(trimmedName);

      // Kullanıcıya gruplarını gönder
      try {
        await sendGroupsListToUser(socket.id);
      } catch (err) {
        console.error("sendGroupsListToUser hata:", err);
      }

      // Bu user DB'de hangi gruplara üye ise, o gruplara "groupUsers" broadcast edelim
      try {
        const userDoc = await User.findOne({ username: trimmedName }).populate('groups');
        if (userDoc && userDoc.groups.length > 0) {
          // Her grup için broadcastGroupUsers
          for (const gDoc of userDoc.groups) {
            // Bu user henüz fiilen "groups[gDoc.groupId].users" listesine girmemiş olabilir,
            // ama biz "online / offline" mantığı için groupUsers yayını yapacağız.
            broadcastGroupUsers(gDoc.groupId);
          }
        }
      } catch (err) {
        console.error("userDoc groups fetch hata:", err);
      }
    }
  });

  // createGroup
  socket.on('createGroup', async (groupName) => {
    if (!groupName) return;
    const trimmed = groupName.trim();
    if (!trimmed) return;

    const userName = users[socket.id].username || `(User ${socket.id})`;
    const userDoc = await User.findOne({ username: userName });
    if (!userDoc) return;

    const groupId = uuidv4();
    const newGroup = new Group({
      groupId,
      name: trimmed,
      owner: userDoc._id,
      users: [ userDoc._id ]
    });
    await newGroup.save();

    userDoc.groups.push(newGroup._id);
    await userDoc.save();

    groups[groupId] = {
      owner: socket.id,
      name: trimmed,
      users: [ { id: socket.id, username: userName } ],
      rooms: {}
    };
    console.log(`Yeni grup: ${trimmed} (ID=${groupId}), owner=${socket.id}`);

    await sendGroupsListToUser(socket.id);

    // Bu user online ise (kesin online), groupUsers yayını
    broadcastGroupUsers(groupId);
  });

  // joinGroupByID
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

      const oldGroup = users[socket.id].currentGroup;
      const oldRoom = users[socket.id].currentRoom;

      // Eski gruptan çık
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

      if (!groups[groupId].users.some(u => u.id === socket.id)) {
        groups[groupId].users.push({ id: socket.id, username: userName });
      }
      users[socket.id].currentGroup = groupId;
      users[socket.id].currentRoom = null;
      socket.join(groupId);

      console.log(`User ${socket.id} => joinGroupByID => ${groupId}`);

      sendRoomsListToUser(socket.id, groupId);
      broadcastAllChannelsData(groupId);
      await broadcastGroupUsers(groupId);

    } catch (err) {
      console.error("joinGroupByID hata:", err);
    }
  });

  // browseGroup
  socket.on('browseGroup', async (groupId) => {
    if (!groups[groupId]) return;
    sendRoomsListToUser(socket.id, groupId);
    sendAllChannelsDataToOneUser(socket.id, groupId);
    // groupUsers da user'a tek seferlik gönderelim
    await broadcastGroupUsers(groupId);
  });

  // joinGroup
  socket.on('joinGroup', async (groupId) => {
    if (!groups[groupId]) return;
    const oldGroup = users[socket.id].currentGroup;
    const oldRoom = users[socket.id].currentRoom;
    const userName = users[socket.id].username || `(User ${socket.id})`;

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

    if (!groups[groupId].users.some(u => u.id === socket.id)) {
      groups[groupId].users.push({ id: socket.id, username: userName });
    }
    users[socket.id].currentGroup = groupId;
    users[socket.id].currentRoom = null;
    socket.join(groupId);

    sendRoomsListToUser(socket.id, groupId);
    broadcastAllChannelsData(groupId);
    await broadcastGroupUsers(groupId);
  });

  // createRoom
  socket.on('createRoom', async ({ groupId, roomName }) => {
    try {
      if (!groups[groupId]) return;
      if (!roomName) return;
      const trimmed = roomName.trim();
      if (!trimmed) return;

      const groupDoc = await Group.findOne({ groupId });
      if (!groupDoc) return;

      const roomId = uuidv4();
      const newChannel = new Channel({
        channelId: roomId,
        name: trimmed,
        group: groupDoc._id,
        users: []
      });
      await newChannel.save();

      groups[groupId].rooms[roomId] = {
        name: trimmed,
        users: []
      };
      console.log(`Yeni oda: group=${groupId}, room=${roomId}, name=${trimmed}`);

      groups[groupId].users.forEach(u => {
        sendRoomsListToUser(u.id, groupId);
      });
      broadcastAllChannelsData(groupId);
    } catch (err) {
      console.error("createRoom hata:", err);
    }
  });

  // joinRoom
  socket.on('joinRoom', ({ groupId, roomId }) => {
    if (!groups[groupId]) return;
    if (!groups[groupId].rooms[roomId]) return;
    const userName = users[socket.id].username || `(User ${socket.id})`;

    const oldRoom = users[socket.id].currentRoom;
    if (oldRoom && groups[groupId].rooms[oldRoom]) {
      groups[groupId].rooms[oldRoom].users =
        groups[groupId].rooms[oldRoom].users.filter(u => u.id !== socket.id);
      io.to(`${groupId}::${oldRoom}`).emit('roomUsers', groups[groupId].rooms[oldRoom].users);
      socket.leave(`${groupId}::${oldRoom}`);
    }

    groups[groupId].rooms[roomId].users.push({ id: socket.id, username: userName });
    users[socket.id].currentRoom = roomId;
    socket.join(`${groupId}::${roomId}`);

    io.to(`${groupId}::${roomId}`).emit('roomUsers', groups[groupId].rooms[roomId].users);

    broadcastAllChannelsData(groupId);
  });

  // leaveRoom
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

  // WebRTC (signal)
  socket.on("signal", (data) => {
    const targetId = data.to;
    if (socket.id === targetId) return;
    if (!users[targetId]) return;

    const sG = users[socket.id].currentGroup;
    const tG = users[targetId].currentGroup;
    const sR = users[socket.id].currentRoom;
    const tR = users[targetId].currentRoom;

    if (sG && sG === tG && sR && sR === tR) {
      io.to(targetId).emit("signal", {
        from: socket.id,
        signal: data.signal
      });
    }
  });

  // Disconnect
  socket.on("disconnect", async () => {
    console.log("disconnect:", socket.id);
    const userData = users[socket.id];
    if (userData) {
      const { username, currentGroup, currentRoom } = userData;
      if (username) {
        // Bu kullanıcı artık offline
        onlineUsernames.delete(username);

        // DB'de bu kullanıcının üye olduğu tüm gruplar için "offline" yansıması
        try {
          const userDoc = await User.findOne({ username }).populate('groups');
          if (userDoc && userDoc.groups.length > 0) {
            for (const gDoc of userDoc.groups) {
              // eğer bu user, bellek tablo groups[gDoc.groupId].users içinde varsa => oradan da sil
              if (groups[gDoc.groupId]) {
                // eğer user orada "socket bazında" kayıtlıysa
                if (currentRoom && groups[gDoc.groupId].rooms[currentRoom]) {
                  groups[gDoc.groupId].rooms[currentRoom].users =
                    groups[gDoc.groupId].rooms[currentRoom].users.filter(u => u.id !== socket.id);
                  io.to(`${gDoc.groupId}::${currentRoom}`).emit('roomUsers', groups[gDoc.groupId].rooms[currentRoom].users);
                }
                groups[gDoc.groupId].users = groups[gDoc.groupId].users.filter(u => u.id !== socket.id);

                // broadcast
                broadcastAllChannelsData(gDoc.groupId);
                await broadcastGroupUsers(gDoc.groupId);
              }
            }
          }
        } catch (err) {
          console.error("disconnect => userDoc fetch hata:", err);
        }
      }
    }
    delete users[socket.id];
  });
});

// Start
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
});
