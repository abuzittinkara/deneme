/**************************************
 * server.js
 **************************************/
const http = require("http");
const express = require("express");
const socketIO = require("socket.io");
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const User = require('./models/User');
const Group = require('./models/Group');
const Channel = require('./models/Channel');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const uri = process.env.MONGODB_URI || "mongodb+srv://abuzorttin:19070480019Mg.@cluster0.vdrdy.mongodb.net/myappdb?retryWrites=true&w=majority";
mongoose.connect(uri)
  .then(() => console.log("MongoDB bağlantısı başarılı!"))
  .catch(err => console.error("MongoDB bağlantı hatası:", err));

// Bellek içi tablolar
// users[socket.id] = { username, currentGroup, currentRoom }
// groups[groupId] = { owner, name, users:[], rooms:{} }
const users = {};
const groups = {};

app.use(express.static("public"));

/* ----------------------------------
   loadGroupsFromDB & loadChannelsFromDB
-------------------------------------*/
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
    console.log("loadGroupsFromDB ->", Object.keys(groups));
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
// Sunucu başlarken DB yükle
loadGroupsFromDB().then(() => loadChannelsFromDB());

/* ----------------------------------
   broadcastAllChannelsData(groupId)
-------------------------------------*/
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

/* ----------------------------------
   broadcastGroupUsers(groupId)
-------------------------------------*/
async function broadcastGroupUsers(groupId) {
  try {
    const groupDoc = await Group.findOne({ groupId }).populate('users');
    if (!groupDoc) return;
    const userArray = groupDoc.users.map(u => ({ username: u.username }));
    io.to(groupId).emit('groupUsers', userArray);
  } catch (err) {
    console.error("broadcastGroupUsers hata:", err);
  }
}

/* ----------------------------------
   sendGroupsListToUser(socketId)
-------------------------------------*/
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

/* ----------------------------------
   sendRoomsListToUser(socketId, groupId)
-------------------------------------*/
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

  // ---------------------
  // LOGIN
  // ---------------------
  socket.on('login', async ({ username, password }) => {
    try {
      if (!username || !password) {
        socket.emit('loginResult', { success: false, message: 'Eksik bilgiler' });
        return;
      }
      const userDoc = await User.findOne({ username });
      if (!userDoc) {
        socket.emit('loginResult', { success: false, message: 'Kullanıcı bulunamadı.' });
        return;
      }
      const pwMatch = await bcrypt.compare(password, userDoc.passwordHash);
      if (!pwMatch) {
        socket.emit('loginResult', { success: false, message: 'Yanlış parola.' });
        return;
      }
      socket.emit('loginResult', { success: true, username: userDoc.username });
    } catch (err) {
      console.error(err);
      socket.emit('loginResult', { success: false, message: 'Giriş hatası.' });
    }
  });

  // ---------------------
  // REGISTER
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
        groups: []
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
  socket.on('set-username', async (usernameVal) => {
    if (usernameVal && typeof usernameVal === 'string') {
      users[socket.id].username = usernameVal.trim();
      console.log(`User ${socket.id} => set-username => ${usernameVal}`);

      // Giriş sonrası => bu user'a groupsList
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
    const userDoc = await User.findOne({ username: userName });
    if (!userDoc) return;

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

    // Bu user'a => groupsList
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
        socket.emit('errorMessage', "Kullanıcı yok (DB).");
        return;
      }
      const groupDoc = await Group.findOne({ groupId });
      if (!groupDoc) {
        socket.emit('errorMessage', "Böyle bir grup yok (DB).");
        return;
      }

      // DB: groupDoc.users
      if (!groupDoc.users.includes(userDoc._id)) {
        groupDoc.users.push(userDoc._id);
        await groupDoc.save();
      }
      if (!userDoc.groups.includes(groupDoc._id)) {
        userDoc.groups.push(groupDoc._id);
        await userDoc.save();
      }

      // Bellek
      if (!groups[groupId]) {
        groups[groupId] = {
          owner: groupDoc.owner ? groupDoc.owner.toString() : null,
          name: groupDoc.name,
          users: [],
          rooms: {}
        };
      }

      // user => bu gruba (sadece göz atma)
      users[socket.id].currentGroup = groupId;
      users[socket.id].currentRoom = null;
      if (!groups[groupId].users.some(u => u.id === socket.id)) {
        groups[groupId].users.push({ id: socket.id, username: userName });
      }

      console.log(`User ${socket.id} => joinGroupByID => ${groupId}`);

      // client => groupsList + groupUsers
      await sendGroupsListToUser(socket.id);
      await broadcastGroupUsers(groupId);

    } catch (err) {
      console.error("joinGroupByID hata:", err);
    }
  });

  // ---------------------
  // joinGroup (listeden)
  // => Başka bir gruba TIKLAYINCA
  // => Eski kanaldan ÇIKARMAK istemiyoruz EĞER
  //    sadece "grubu göz atma" ise
  // => BU KISIMI DEĞİŞTİRİYORUZ
  // ---------------------
  socket.on('joinGroup', async (groupId) => {
    console.log(`joinGroup event: user=${socket.id}, newGroup=${groupId}`);
    const oldGroup = users[socket.id].currentGroup;
    // oldRoom => KALDIRMIYORUZ => user kalmaya devam etsin
    // eskiden oldRoom + oldGroup'dan user'ı siliyorduk
    // AMA bu => "avatar kaybolma" sorununa yol açıyordu
    // Dolayısıyla => user, "farklı gruba" baksın => eski kanalda KALSIN

    // Tek yaptığımız => "Bu gruba da join()" => user "göz atma"
    if (!groups[groupId]) {
      console.log("Geçersiz groupId:", groupId);
      return;
    }
    const userName = users[socket.id].username || `(User ${socket.id})`;
    if (!groups[groupId].users.some(u => u.id === socket.id)) {
      groups[groupId].users.push({ id: socket.id, username: userName });
    }

    users[socket.id].currentGroup = groupId;
    // currentRoom => DOKUNMA => user, eski kanalda kalmayı sürdürür
    socket.join(groupId);

    // Rooms list & channels
    sendRoomsListToUser(socket.id, groupId);
    broadcastAllChannelsData(groupId);

    // groupUsers
    await broadcastGroupUsers(groupId);
  });

  // ---------------------
  // createRoom
  // ---------------------
  socket.on('createRoom', async ({ groupId, roomName }) => {
    if (!groups[groupId]) return;
    if (!roomName || typeof roomName !== 'string') return;

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
    console.log(`Yeni oda: G=${groupId}, Oda=${roomId}, Ad=${trimmed}`);

    groups[groupId].users.forEach(u => {
      sendRoomsListToUser(u.id, groupId);
    });
    broadcastAllChannelsData(groupId);
  });

  // ---------------------
  // joinRoom => Eski gruptaki (veya kanaldaki) user'ı çıkar
  // => Yalnız FARKLI bir gruptaki kanala girmek istersen => 
  //    o zaman eski kanaldan AYRIL
  // ---------------------
  socket.on('joinRoom', ({ groupId, roomId }) => {
    console.log(`joinRoom: user=${socket.id}, groupId=${groupId}, roomId=${roomId}`);
    if (!groups[groupId]) return;
    if (!groups[groupId].rooms[roomId]) return;

    const userName = users[socket.id].username || `(User ${socket.id})`;

    // 1) FARKLI bir group'ta kanala giriliyorsa => 
    //    eski group + kanaldan çıkar
    const oldGroup = users[socket.id].currentGroup;
    const oldRoom = users[socket.id].currentRoom;
    if (oldGroup && oldGroup !== groupId) {
      // Eski gruptaki odadan => çıkar
      if (oldRoom && groups[oldGroup] && groups[oldGroup].rooms[oldRoom]) {
        groups[oldGroup].rooms[oldRoom].users =
          groups[oldGroup].rooms[oldRoom].users.filter(u => u.id !== socket.id);
        io.to(`${oldGroup}::${oldRoom}`).emit('roomUsers', groups[oldGroup].rooms[oldRoom].users);
        socket.leave(`${oldGroup}::${oldRoom}`);
      }
      // Eski gruptan user'ı sil
      if (groups[oldGroup]) {
        groups[oldGroup].users = groups[oldGroup].users.filter(u => u.id !== socket.id);
        broadcastAllChannelsData(oldGroup);
      }
    }

    // 2) Şimdi => groupId'deki bu room'a gir
    // Eski odadan => eğer aynı grupta isek => normalde 
    // oldRoom => filter => user
    const oldR = users[socket.id].currentRoom;
    if (oldR && oldGroup === groupId) {
      // Aynı grupta => sadece odadan çıkar
      if (groups[groupId].rooms[oldR]) {
        groups[groupId].rooms[oldR].users =
          groups[groupId].rooms[oldR].users.filter(u => u.id !== socket.id);
        io.to(`${groupId}::${oldR}`).emit('roomUsers', groups[groupId].rooms[oldR].users);
        socket.leave(`${groupId}::${oldR}`);
      }
    }

    // 3) user => bu odaya ekle
    groups[groupId].rooms[roomId].users.push({ id: socket.id, username: userName });
    users[socket.id].currentGroup = groupId;
    users[socket.id].currentRoom = roomId;
    socket.join(`${groupId}::${roomId}`);

    // broadcast => roomUsers + allChannels
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

  // renameGroup & deleteGroup (opsiyonel)
  socket.on('renameGroup', async ({ groupId, newName }) => {
    if (!groupId || !newName) return;
    const groupDoc = await Group.findOne({ groupId });
    if (!groupDoc) return;
    groupDoc.name = newName;
    await groupDoc.save();
    if (groups[groupId]) {
      groups[groupId].name = newName;
    }
    const members = groups[groupId].users;
    for (const m of members) {
      await sendGroupsListToUser(m.id);
    }
    broadcastAllChannelsData(groupId);
    await broadcastGroupUsers(groupId);
  });

  socket.on('deleteGroup', async ({ groupId }) => {
    if (!groupId) return;
    const groupDoc = await Group.findOne({ groupId });
    if (!groupDoc) return;
    await Group.deleteOne({ _id: groupDoc._id });
    await Channel.deleteMany({ group: groupDoc._id });
    if (groups[groupId]) {
      const memArr = groups[groupId].users;
      memArr.forEach(u => {
        if (users[u.id]) {
          if (users[u.id].currentGroup === groupId) {
            users[u.id].currentGroup = null;
            users[u.id].currentRoom = null;
          }
          io.to(u.id).socketsLeave(groupId);
        }
      });
      delete groups[groupId];
    }
    console.log(`Group (ID=${groupId}) silindi.`);
  });

  // WebRTC Sinyal
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
    console.log("Kullanıcı ayrıldı:", socket.id);
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
        await broadcastGroupUsers(gId);
      }
    }
    delete users[socket.id];
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
});
