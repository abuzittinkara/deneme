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

// MongoDB bağlantı
const uri = process.env.MONGODB_URI || "mongodb+srv://abuzorttin:19070480019Mg.@cluster0.vdrdy.mongodb.net/myappdb?retryWrites=true&w=majority"; 
mongoose.connect(uri)
  .then(() => console.log("MongoDB bağlantısı başarılı!"))
  .catch(err => console.error("MongoDB bağlantı hatası:", err));

// users[socket.id] = { username, currentGroup, currentRoom }
const users = {};
// groups[groupId] = { name, rooms:{roomId:{name,users:[]}}, users:[] } 
const groups = {};

app.use(express.static("public"));

async function loadGroupsFromDB() {
  try {
    const allGroups = await Group.find({});
    allGroups.forEach(g => {
      if (!groups[g.groupId]) {
        groups[g.groupId] = {
          name: g.name,
          users: [],
          rooms: {}
        };
      }
    });
  } catch(err) { console.error(err); }
}
async function loadChannelsFromDB() {
  try {
    const allCh = await Channel.find({}).populate('group');
    allCh.forEach(ch => {
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
  } catch(err) { console.error(err); }
}
loadGroupsFromDB().then(() => loadChannelsFromDB());

function broadcastAllChannelsData(groupId) {
  if (!groups[groupId]) return;
  const channelsObj = {};
  Object.keys(groups[groupId].rooms).forEach(rId => {
    const rm = groups[groupId].rooms[rId];
    channelsObj[rId] = {
      name: rm.name,
      users: rm.users.map(u => ({
        id: u.id,
        username: u.username
      }))
    };
  });
  io.to(groupId).emit('allChannelsData', channelsObj);
}
async function broadcastGroupUsers(groupId) {
  try {
    const gDoc = await Group.findOne({ groupId }).populate('users');
    if (!gDoc) return;
    const arr = gDoc.users.map(u => ({ username: u.username }));
    io.to(groupId).emit('groupUsers', arr);
  } catch(err) { console.error(err); }
}

async function sendGroupsListToUser(socketId) {
  const ud = users[socketId];
  if (!ud) return;
  const uDoc = await User.findOne({ username: ud.username }).populate('groups');
  if (!uDoc) return;
  const arr = uDoc.groups.map(g => ({ id: g.groupId, name: g.name }));
  io.to(socketId).emit('groupsList', arr);
}
function sendRoomsListToUser(socketId, groupId) {
  const gObj = groups[groupId];
  if (!gObj) return;
  const roomsArr = Object.keys(gObj.rooms).map(rId => ({
    id: rId,
    name: gObj.rooms[rId].name
  }));
  io.to(socketId).emit('roomsList', roomsArr);
}

io.on("connection", (socket) => {
  console.log("Kullanıcı bağlandı =>", socket.id);
  users[socket.id] = { username: null, currentGroup: null, currentRoom: null };

  // login
  socket.on('login', async ({ username, password }) => {
    try {
      const userDoc = await User.findOne({ username });
      if (!userDoc) {
        socket.emit('loginResult', { success: false, message: 'Kullanıcı yok' });
        return;
      }
      const pwMatch = await bcrypt.compare(password, userDoc.passwordHash);
      if (!pwMatch) {
        socket.emit('loginResult', { success: false, message: 'Yanlış şifre' });
        return;
      }
      socket.emit('loginResult', { success: true, username: userDoc.username });
    } catch(err) {
      console.error(err);
      socket.emit('loginResult', { success: false, message: 'Hata' });
    }
  });

  // register
  socket.on('register', async (ud) => {
    const { username, password, passwordConfirm } = ud;
    if (!username || !password || !passwordConfirm) {
      socket.emit('registerResult', { success: false, message: 'Eksik alan' });
      return;
    }
    if (password !== passwordConfirm) {
      socket.emit('registerResult', { success: false, message: 'Parola eşleşmiyor' });
      return;
    }
    try {
      const ex = await User.findOne({ username });
      if (ex) {
        socket.emit('registerResult', { success: false, message: 'Kullanıcı adı mevcut' });
        return;
      }
      const hash = await bcrypt.hash(password, 10);
      const newU = new User({
        username,
        passwordHash: hash,
        name: ud.name,
        surname: ud.surname,
        birthdate: new Date(ud.birthdate),
        email: ud.email,
        phone: ud.phone,
        groups: []
      });
      await newU.save();
      socket.emit('registerResult', { success: true });
    } catch(err) {
      console.error("register hata =>", err);
      socket.emit('registerResult', { success: false, message: 'Kayıt hatası' });
    }
  });

  // set-username
  socket.on('set-username', async (uname) => {
    users[socket.id].username = uname;
    console.log("set-username =>", socket.id, uname);
    try {
      await sendGroupsListToUser(socket.id);
    } catch(err) { console.error(err); }
  });

  // createGroup
  socket.on('createGroup', async (gName) => {
    if (!gName || typeof gName !== 'string') return;
    const trimmed = gName.trim();
    if (!trimmed) return;
    const uname = users[socket.id].username;
    if (!uname) return;
    const uDoc = await User.findOne({ username: uname });
    if (!uDoc) return;

    const gId = uuidv4();
    const newG = new Group({
      groupId: gId,
      name: trimmed,
      owner: uDoc._id,
      users: [ uDoc._id ]
    });
    await newG.save();
    uDoc.groups.push(newG._id);
    await uDoc.save();

    groups[gId] = {
      name: trimmed,
      users: [],
      rooms: {}
    };
    console.log("Yeni grup =>", trimmed, gId);
    await sendGroupsListToUser(socket.id);
  });

  // joinGroupByID => DB’de user = group ekle, bellek => groups
  socket.on('joinGroupByID', async (gIdVal) => {
    try {
      const uname = users[socket.id].username;
      if (!uname) return;
      const uDoc = await User.findOne({ username: uname });
      if (!uDoc) return;
      const gDoc = await Group.findOne({ groupId: gIdVal });
      if (!gDoc) return;

      if (!gDoc.users.includes(uDoc._id)) {
        gDoc.users.push(uDoc._id);
        await gDoc.save();
      }
      if (!uDoc.groups.includes(gDoc._id)) {
        uDoc.groups.push(gDoc._id);
        await uDoc.save();
      }

      if (!groups[gIdVal]) {
        groups[gIdVal] = {
          name: gDoc.name,
          users: [],
          rooms: {}
        };
      }
      console.log(`joinGroupByID => user=${socket.id}, group=${gIdVal}`);
      await sendGroupsListToUser(socket.id);

    } catch(err) {
      console.error("joinGroupByID hata =>", err);
    }
  });

  // browseGroup => sadece kanalları gör (Discord mantığı)
  socket.on('browseGroup', async (gId) => {
    console.log("browseGroup => user:", socket.id, " gId:", gId);
    if (!groups[gId]) {
      console.log("Geçersiz groupId =>", gId);
      return;
    }
    // Sadece => roomsList, allChannelsData, groupUsers
    socket.join(gId); // bu group'a text chat vb.
    sendRoomsListToUser(socket.id, gId);
    broadcastAllChannelsData(gId);
    await broadcastGroupUsers(gId);
  });

  // createRoom => DB + Bellek
  socket.on('createRoom', async ({ groupId, roomName }) => {
    if (!groups[groupId]) return;
    if (!roomName) return;
    const trimmed = roomName.trim();
    if (!trimmed) return;
    const gDoc = await Group.findOne({ groupId });
    if (!gDoc) return;

    const rId = uuidv4();
    const newC = new Channel({
      channelId: rId,
      name: trimmed,
      group: gDoc._id,
      users: []
    });
    await newC.save();

    groups[groupId].rooms[rId] = {
      name: trimmed,
      users: []
    };
    console.log("Yeni oda =>", trimmed, rId);
    // Tüm group => roomsList
    io.to(groupId).emit('roomsList', Object.keys(groups[groupId].rooms).map(x => ({
      id: x,
      name: groups[groupId].rooms[x].name
    })));
    broadcastAllChannelsData(groupId);
  });

  // joinRoom => voice
  socket.on('joinRoom', ({ groupId, roomId }) => {
    console.log(`joinRoom => user=${socket.id}, group=${groupId}, room=${roomId}`);
    if (!groups[groupId]) return;
    if (!groups[groupId].rooms[roomId]) return;

    const uname = users[socket.id].username || `(User ${socket.id})`;
    // Eski odadan çık
    const oldR = users[socket.id].currentRoom;
    if (oldR && groups[groupId].rooms[oldR]) {
      groups[groupId].rooms[oldR].users = groups[groupId].rooms[oldR].users.filter(u => u.id !== socket.id);
      io.to(`${groupId}::${oldR}`).emit('roomUsers', groups[groupId].rooms[oldR].users);
      socket.leave(`${groupId}::${oldR}`);
    }

    // Yeni
    groups[groupId].rooms[roomId].users.push({ id: socket.id, username: uname });
    users[socket.id].currentGroup = groupId;
    users[socket.id].currentRoom = roomId;
    socket.join(`${groupId}::${roomId}`);

    io.to(`${groupId}::${roomId}`).emit('roomUsers', groups[groupId].rooms[roomId].users);
    broadcastAllChannelsData(groupId);
  });

  // leaveRoom => voice
  socket.on('leaveRoom', ({ groupId, roomId }) => {
    console.log(`leaveRoom => user=${socket.id}, g=${groupId}, r=${roomId}`);
    if (!groups[groupId]) return;
    if (!groups[groupId].rooms[roomId]) return;

    groups[groupId].rooms[roomId].users = groups[groupId].rooms[roomId].users.filter(u => u.id !== socket.id);
    io.to(`${groupId}::${roomId}`).emit('roomUsers', groups[groupId].rooms[roomId].users);
    socket.leave(`${groupId}::${roomId}`);
    users[socket.id].currentRoom = null;
    broadcastAllChannelsData(groupId);
  });

  // WebRTC Sinyal
  socket.on("signal", (data) => {
    const targetId = data.to;
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
  socket.on("disconnect", () => {
    console.log("User disconnect =>", socket.id);
    const ud = users[socket.id];
    if (ud && ud.currentGroup && ud.currentRoom) {
      const gId = ud.currentGroup;
      const rId = ud.currentRoom;
      if (groups[gId] && groups[gId].rooms[rId]) {
        groups[gId].rooms[rId].users = groups[gId].rooms[rId].users.filter(x => x.id !== socket.id);
        io.to(`${gId}::${rId}`).emit('roomUsers', groups[gId].rooms[rId].users);
        broadcastAllChannelsData(gId);
      }
    }
    delete users[socket.id];
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Sunucu çalışıyor => http://localhost:"+PORT);
});
