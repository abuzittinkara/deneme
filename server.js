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

// Bellek içi tablolar
// users[socket.id] = { username, currentGroup, currentRoom }
const users = {};  
// groups[groupId] = {
//   name, 
//   users: [ { id, username } ], // Bu gruba sadece "kaynak" ekledik; voice kanalı -> joinRoom yapana dek
//   rooms: {
//     roomId: { name, users: [ {id, username} ] }
//   }
// }
const groups = {};

// Statik dosyalar
app.use(express.static("public"));

/* 
   1) DB'deki grupları belleğe al
   2) DB'deki kanalları da gruplara ekle
*/
async function loadGroupsFromDB() {
  try {
    const allGroups = await Group.find({});
    allGroups.forEach(gDoc => {
      if (!groups[gDoc.groupId]) {
        groups[gDoc.groupId] = {
          name: gDoc.name,
          users: [],     // browse edenler
          rooms: {}
        };
      }
    });
    console.log("loadGroupsFromDB:", Object.keys(groups));
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
  } catch (err) {
    console.error("loadChannelsFromDB hatası:", err);
  }
}
loadGroupsFromDB().then(() => loadChannelsFromDB());

/* 
   Kanallar bazında kim var => allChannelsData
*/
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
  // Tüm group odasına => allChannelsData
  io.to(groupId).emit('allChannelsData', channelsObj);
}

/* groupUsers => sağ panel */
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

/* sendGroupsListToUser */
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

/* sendRoomsListToUser */
function sendRoomsListToUser(socketId, groupId) {
  const groupObj = groups[groupId];
  if (!groupObj) return;
  const roomArray = Object.keys(groupObj.rooms).map(rId => ({
    id: rId,
    name: groupObj.rooms[rId].name
  }));
  io.to(socketId).emit('roomsList', roomArray);
}

/* Socket.IO */
io.on("connection", (socket) => {
  console.log("Kullanıcı bağlandı =>", socket.id);
  users[socket.id] = {
    username: null,
    currentGroup: null,
    currentRoom: null
  };

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
        socket.emit('loginResult', { success: false, message: 'Şifre yanlış' });
        return;
      }
      socket.emit('loginResult', { success: true, username: userDoc.username });
    } catch (err) {
      console.error(err);
      socket.emit('loginResult', { success: false, message: 'Hata.' });
    }
  });

  // register
  socket.on('register', async (userData) => {
    const { username, password, passwordConfirm } = userData;
    if (!username || !password || !passwordConfirm) {
      socket.emit('registerResult', { success: false, message: 'Eksik bilgi' });
      return;
    }
    if (password !== passwordConfirm) {
      socket.emit('registerResult', { success: false, message: 'Parolalar eşleşmiyor' });
      return;
    }
    try {
      const existing = await User.findOne({ username });
      if (existing) {
        socket.emit('registerResult', { success: false, message: 'Kullanıcı adı zaten var' });
        return;
      }
      const passwordHash = await bcrypt.hash(password, 10);
      const newUser = new User({ 
        username, 
        passwordHash,
        name: userData.name,
        surname: userData.surname,
        birthdate: new Date(userData.birthdate),
        email: userData.email,
        phone: userData.phone,
        groups: []
      });
      await newUser.save();
      socket.emit('registerResult', { success: true });
    } catch (err) {
      console.error("register hata:", err);
      socket.emit('registerResult', { success: false, message: 'Kayıt hatası' });
    }
  });

  // set-username
  socket.on('set-username', async (uname) => {
    users[socket.id].username = uname;
    try {
      await sendGroupsListToUser(socket.id);
    } catch (err) {
      console.error(err);
    }
  });

  // createGroup
  socket.on('createGroup', async (groupName) => {
    if (!groupName || typeof groupName !== 'string') return;
    const trimmed = groupName.trim();
    if (!trimmed) return;

    const userName = users[socket.id].username;
    if (!userName) return;

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
      name: trimmed,
      users: [],
      rooms: {}
    };
    console.log("Yeni grup =>", trimmed, groupId);

    // Bu kullanıcıya => groupsList
    await sendGroupsListToUser(socket.id);
  });

  // joinGroupByID (kullanıcı DB’de yoksa ekle vs. FAKAT burası da
  // asıl “gruba katılma” sayılmaz -> Discord’daki “Sunucuyu ekle” mantığı)
  socket.on('joinGroupByID', async (groupId) => {
    try {
      const userName = users[socket.id].username;
      if (!userName) return;
      const userDoc = await User.findOne({ username: userName });
      if (!userDoc) return;

      const groupDoc = await Group.findOne({ groupId });
      if (!groupDoc) return;

      // DB tarafında user => group
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
          name: groupDoc.name,
          users: [],
          rooms: {}
        };
      }

      console.log(`User ${socket.id} => joinGroupByID => (DB'ye eklendi) => groupId=${groupId}`);

      await sendGroupsListToUser(socket.id);

    } catch (err) {
      console.error("joinGroupByID hata:", err);
    }
  });

  // browseGroup => Sadece o gruptaki kanalları & user’ları gör. 
  // Kanaldan çıkma yok => yani user’in currentGroup != null kalabilir
  socket.on('browseGroup', async (groupId) => {
    console.log(`browseGroup => user=${socket.id}, groupId=${groupId}`);
    if (!groups[groupId]) {
      console.log("Geçersiz groupId =>", groupId);
      return;
    }
    // Sadece => “odalar listesi” ve “allChannelsData” ve “groupUsers”
    // => user bu gruba join() => o gruba "browse" odası?
    //   Discord benzeri => sunucuya girdi => text chat 
    //   Ama voice kanalı = durdukça kal
    // Herkese => user eklemiyoruz => browse
    socket.join(groupId);  // Bu sayede "allChannelsData" & "groupUsers" eventlerini alabilir

    sendRoomsListToUser(socket.id, groupId);
    broadcastAllChannelsData(groupId);
    await broadcastGroupUsers(groupId);
  });

  // createRoom => DB + Bellek
  socket.on('createRoom', async ({ groupId, roomName }) => {
    if (!groups[groupId]) return;
    if (!roomName) return;
    const gDoc = await Group.findOne({ groupId });
    if (!gDoc) return;

    const roomId = uuidv4();
    const newChannel = new Channel({
      channelId: roomId,
      name: roomName.trim(),
      group: gDoc._id,
      users: []
    });
    await newChannel.save();

    groups[groupId].rooms[roomId] = {
      name: roomName.trim(),
      users: []
    };
    console.log("Yeni oda =>", roomName, roomId);

    // Tüm user’lara => roomsList
    // (Kim o grubu “browse”’lıyorsa)
    io.to(groupId).emit('roomsList', Object.keys(groups[groupId].rooms).map(rId => ({
      id: rId,
      name: groups[groupId].rooms[rId].name
    })));
    broadcastAllChannelsData(groupId);
  });

  // joinRoom => mevcuttaki odadan çık, bu odaya gir
  socket.on('joinRoom', ({ groupId, roomId }) => {
    console.log(`joinRoom => user=${socket.id}, group=${groupId}, room=${roomId}`);
    if (!groups[groupId]) return;
    if (!groups[groupId].rooms[roomId]) return;

    const userName = users[socket.id].username || `(User ${socket.id})`;

    // Eski odadan çık
    const oldRoom = users[socket.id].currentRoom;
    if (oldRoom && groups[groupId].rooms[oldRoom]) {
      groups[groupId].rooms[oldRoom].users = groups[groupId].rooms[oldRoom].users.filter(u => u.id !== socket.id);
      io.to(`${groupId}::${oldRoom}`).emit('roomUsers', groups[groupId].rooms[oldRoom].users);
      socket.leave(`${groupId}::${oldRoom}`);
    }

    // Yeni odaya ekle
    groups[groupId].rooms[roomId].users.push({ id: socket.id, username: userName });
    users[socket.id].currentRoom = roomId;
    users[socket.id].currentGroup = groupId; 
    socket.join(`${groupId}::${roomId}`);

    io.to(`${groupId}::${roomId}`).emit('roomUsers', groups[groupId].rooms[roomId].users);
    broadcastAllChannelsData(groupId);
  });

  // leaveRoom => normal voice channel exit
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

  // Disconnect
  socket.on("disconnect", async () => {
    console.log("Kullanıcı ayrıldı =>", socket.id);
    const ud = users[socket.id];
    if (ud && ud.currentGroup && ud.currentRoom) {
      const gId = ud.currentGroup;
      const rId = ud.currentRoom;
      if (groups[gId] && groups[gId].rooms[rId]) {
        groups[gId].rooms[rId].users = groups[gId].rooms[rId].users.filter(u => u.id !== socket.id);
        io.to(`${gId}::${rId}`).emit('roomUsers', groups[gId].rooms[rId].users);
        broadcastAllChannelsData(gId);
      }
    }
    // DB tarafında user -> group doc’dan silmiyoruz. 
    // Yalnızca voice kanaldan / bellekten sil
    delete users[socket.id];
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Sunucu çalışıyor => http://localhost:"+PORT);
});
