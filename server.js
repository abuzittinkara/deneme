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
const Message = require('./models/Message');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// MongoDB
const uri = process.env.MONGODB_URI || 
  "mongodb+srv://abuzorttin:HWZe7uK5yEAE@cluster0.vdrdy.mongodb.net/myappdb?retryWrites=true&w=majority";

mongoose.connect(uri, {
  serverSelectionTimeoutMS: 30000
})
  .then(() => console.log("MongoDB bağlantısı başarılı!"))
  .catch(err => console.error("MongoDB bağlantı hatası:", err));

/** 
 * Bellek içi tablolar 
 * (Opsiyonel => Asıl veriler DB'de duruyor; 
 *  bu 'groups' vs. real-time izleme ve webrtc logic için)
 */
const users = {};   // socket.id -> { username, currentGroup, currentRoom }
const groups = {};  // groupId -> { owner, name, users:[], rooms:{} }
const onlineUsernames = new Set();

app.use(express.static("public"));

/** loadGroupsFromDB => server açılınca groups{}'u yükler */
async function loadGroupsFromDB() {
  try {
    const allGroups = await Group.find({});
    for (const gDoc of allGroups) {
      if (!groups[gDoc.groupId]) {
        groups[gDoc.groupId] = {
          owner: null,
          name: gDoc.name,
          users: [],
          rooms: {}
        };
      }
      if (gDoc.owner) {
        const ownerUser = await User.findById(gDoc.owner);
        if (ownerUser) {
          groups[gDoc.groupId].owner = ownerUser.username;
        }
      }
    }
    console.log("loadGroupsFromDB tamam, groups:", Object.keys(groups));
  } catch (err) {
    console.error("loadGroupsFromDB hatası:", err);
  }
}

/** loadChannelsFromDB => server açılınca channel'ları groups{}'a işler */
async function loadChannelsFromDB() {
  try {
    const allChannels = await Channel.find({}).populate('group');
    for (const ch of allChannels) {
      if (!ch.group) continue;
      const gId = ch.group.groupId;
      if (!groups[gId]) continue;
      if (!groups[gId].rooms[ch.channelId]) {
        groups[gId].rooms[ch.channelId] = {
          name: ch.name,
          users: [],
          type: ch.type || 'voice'
        };
      }
    }
    console.log("loadChannelsFromDB tamam.");
  } catch (err) {
    console.error("loadChannelsFromDB hatası:", err);
  }
}

loadGroupsFromDB().then(() => loadChannelsFromDB());

/** getAllChannelsData => groupId'ye ait rooms verileri */
function getAllChannelsData(groupId) {
  if (!groups[groupId]) return {};
  const channelsObj = {};
  Object.keys(groups[groupId].rooms).forEach(roomId => {
    const rm = groups[groupId].rooms[roomId];
    channelsObj[roomId] = {
      name: rm.name,
      users: (rm.type === 'voice') ? rm.users : [],
      type: rm.type || 'voice'
    };
  });
  return channelsObj;
}

/** removeUserFromAllVoiceChannels => user'ı her voice kanaldan çıkarır */
function removeUserFromAllVoiceChannels(socketId) {
  for (const gId of Object.keys(groups)) {
    const grpObj = groups[gId];
    Object.keys(grpObj.rooms).forEach(rId => {
      const rm = grpObj.rooms[rId];
      if (rm.type === 'voice') {
        const beforeLen = rm.users.length;
        rm.users = rm.users.filter(u => u.id !== socketId);
        if (rm.users.length !== beforeLen) {
          io.to(`${gId}::${rId}`).emit('roomUsers', rm.users);
        }
      }
    });
    io.to(gId).emit('allChannelsData', getAllChannelsData(gId));
  }
}

/** getOnlineOfflineDataForGroup => online/offline user listesi döndür */
async function getOnlineOfflineDataForGroup(groupId) {
  const groupDoc = await Group.findOne({ groupId }).populate('users');
  if (!groupDoc) return { online: [], offline: [] };

  const online = [];
  const offline = [];

  groupDoc.users.forEach(u => {
    if (onlineUsernames.has(u.username)) {
      online.push({ username: u.username });
    } else {
      offline.push({ username: u.username });
    }
  });
  return { online, offline };
}

/** broadcastGroupUsers => gruptaki online/offline bilgisini odaya gönderir */
async function broadcastGroupUsers(groupId) {
  if (!groupId) return;
  try {
    const { online, offline } = await getOnlineOfflineDataForGroup(groupId);
    io.to(groupId).emit('groupUsers', { online, offline });
  } catch (err) {
    console.error("broadcastGroupUsers hata:", err);
  }
}

/** broadcastAllChannelsData => groupId'deki kanallar verisini yeniler */
function broadcastAllChannelsData(groupId) {
  if (!groups[groupId]) return;
  const channelsObj = getAllChannelsData(groupId);
  io.to(groupId).emit('allChannelsData', channelsObj);
}

/** sendAllChannelsDataToOneUser => tek kullanıcıya rooms/channels datası */
function sendAllChannelsDataToOneUser(socketId, groupId) {
  if (!groups[groupId]) return;
  const channelsObj = getAllChannelsData(groupId);
  io.to(socketId).emit('allChannelsData', channelsObj);
}

/** sendRoomsListToUser => groupId => roomsList event */
function sendRoomsListToUser(socketId, groupId) {
  if (!groups[groupId]) return;
  const groupObj = groups[groupId];
  const roomArray = Object.keys(groupObj.rooms).map(rId => ({
    id: rId,
    name: groupObj.rooms[rId].name,
    type: groupObj.rooms[rId].type || 'voice'
  }));
  io.to(socketId).emit('roomsList', roomArray);
}

/** sendGroupsListToUser => user'ın kayıtlı olduğu grupları çeker */
async function sendGroupsListToUser(socketId) {
  const userData = users[socketId];
  if (!userData) return;
  const userDoc = await User.findOne({ username: userData.username }).populate('groups');
  if (!userDoc) return;

  const userGroups = [];
  for (const g of userDoc.groups) {
    let ownerUsername = null;
    const ownerUser = await User.findById(g.owner);
    if (ownerUser) {
      ownerUsername = ownerUser.username;
    }
    userGroups.push({
      id: g.groupId,
      name: g.name,
      owner: ownerUsername
    });
  }
  io.to(socketId).emit('groupsList', userGroups);
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
      const trimmedName = usernameVal.trim();
      users[socket.id].username = trimmedName;
      console.log(`User ${socket.id} => set-username => ${trimmedName}`);

      onlineUsernames.add(trimmedName);

      try {
        await sendGroupsListToUser(socket.id);
      } catch (err) {
        console.error("sendGroupsListToUser hata:", err);
      }

      // user'ın üye olduğu gruplara => groupUsers broadcast
      try {
        const userDoc = await User.findOne({ username: trimmedName }).populate('groups');
        if (userDoc && userDoc.groups.length > 0) {
          for (const gDoc of userDoc.groups) {
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
      owner: userName,
      name: trimmed,
      users: [ { id: socket.id, username: userName } ],
      rooms: {}
    };
    console.log(`Yeni grup: ${trimmed} (ID=${groupId}), owner=${userName}`);

    // Kullanıcının groupsList güncellenmesi:
    await sendGroupsListToUser(socket.id);
    broadcastGroupUsers(groupId);
  });

  // joinGroupByID => user new group
  socket.on('joinGroupByID', async (grpIdVal) => {
    try {
      const userName = users[socket.id].username || `(User ${socket.id})`;
      const userDoc = await User.findOne({ username: userName });
      if (!userDoc) {
        socket.emit('errorMessage', "Kullanıcı yok (DB).");
        return;
      }
      const groupDoc = await Group.findOne({ groupId: grpIdVal });
      if (!groupDoc) {
        socket.emit('errorMessage', "Böyle bir grup yok (DB).");
        return;
      }

      // DB => group'a ekle
      if (!groupDoc.users.includes(userDoc._id)) {
        groupDoc.users.push(userDoc._id);
        await groupDoc.save();
      }
      if (!userDoc.groups.includes(groupDoc._id)) {
        userDoc.groups.push(groupDoc._id);
        await userDoc.save();
      }

      // Bellek => groups
      if (!groups[grpIdVal]) {
        let ownerUsername = null;
        const ownerUser = await User.findById(groupDoc.owner);
        if (ownerUser) {
          ownerUsername = ownerUser.username;
        }
        groups[grpIdVal] = {
          owner: ownerUsername,
          name: groupDoc.name,
          users: [],
          rooms: {}
        };
      }

      console.log(`User ${socket.id} => joinGroupByID => ${grpIdVal}`);

      // Hemen user'a groupsList güncelle
      await sendGroupsListToUser(socket.id);

      // groupUsers broadcast
      broadcastGroupUsers(grpIdVal);

    } catch (err) {
      console.error("joinGroupByID hata:", err);
    }
  });

  // browseGroup => user => group'taki kanalları & user'ları görsün
  socket.on('browseGroup', async (groupId) => {
    if (!groups[groupId]) return;
    sendRoomsListToUser(socket.id, groupId);
    sendAllChannelsDataToOneUser(socket.id, groupId);
    await broadcastGroupUsers(groupId);
  });

  // joinGroup => user voice channel'lara girmeden group'a ekle
  socket.on('joinGroup', async (groupId) => {
    if (!groups[groupId]) return;

    removeUserFromAllVoiceChannels(socket.id);

    const userData = users[socket.id];
    const userName = userData.username || `(User ${socket.id})`;
    if (!groups[groupId].users.some(u => u.id === socket.id)) {
      groups[groupId].users.push({ id: socket.id, username: userName });
    }
    userData.currentGroup = groupId;
    userData.currentRoom = null;
    socket.join(groupId);

    sendRoomsListToUser(socket.id, groupId);
    broadcastAllChannelsData(groupId);
    await broadcastGroupUsers(groupId);
  });

  // createRoom => channel (voice/text)
  socket.on('createRoom', async ({ groupId, roomName, roomType }) => {
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
        users: [],
        type: (roomType === 'text') ? 'text' : 'voice'
      });
      await newChannel.save();

      groups[groupId].rooms[roomId] = {
        name: trimmed,
        users: [],
        type: (roomType === 'text') ? 'text' : 'voice'
      };
      console.log(`Yeni oda: group=${groupId}, room=${roomId}, name=${trimmed}, type=${roomType}`);

      // Tüm group user'larına => roomsList & allChannelsData
      groups[groupId].users.forEach(u => {
        sendRoomsListToUser(u.id, groupId);
      });
      broadcastAllChannelsData(groupId);

    } catch (err) {
      console.error("createRoom hata:", err);
    }
  });

  // joinRoom => voice / text
  socket.on('joinRoom', async ({ groupId, roomId }) => {
    if (!groups[groupId]) return;
    if (!groups[groupId].rooms[roomId]) return;

    const channelType = groups[groupId].rooms[roomId].type || 'voice';

    if (channelType === 'voice') {
      removeUserFromAllVoiceChannels(socket.id);

      const userData = users[socket.id];
      const userName = userData.username || `(User ${socket.id})`;
      if (!groups[groupId].users.some(u => u.id === socket.id)) {
        groups[groupId].users.push({ id: socket.id, username: userName });
      }
      groups[groupId].rooms[roomId].users.push({ id: socket.id, username: userName });
      userData.currentGroup = groupId;
      userData.currentRoom = roomId;

      socket.join(groupId);
      socket.join(`${groupId}::${roomId}`);

      io.to(`${groupId}::${roomId}`).emit('roomUsers', groups[groupId].rooms[roomId].users);

      broadcastAllChannelsData(groupId);
    } else {
      // text channel => user ekleme yok
      try {
        const groupDoc = await Group.findOne({ groupId });
        if (!groupDoc) return;
        const channelDoc = await Channel.findOne({ channelId: roomId, group: groupDoc._id });
        if (!channelDoc) return;

        const messages = await Message.find({ channel: channelDoc._id })
          .populate('user', 'username')
          .sort({ timestamp: 1 });

        socket.emit('previousMessages', messages.map(m => ({
          user: m.user.username,
          content: m.content,
          timestamp: m.timestamp
        })));
      } catch (err) {
        console.error("joinRoom => fetch text messages hata:", err);
      }
    }
  });

  // leaveRoom => voice
  socket.on('leaveRoom', ({ groupId, roomId }) => {
    if (!groups[groupId]) return;
    if (!groups[groupId].rooms[roomId]) return;

    const channelType = groups[groupId].rooms[roomId].type || 'voice';
    if (channelType === 'voice') {
      const rm = groups[groupId].rooms[roomId];
      rm.users = rm.users.filter(u => u.id !== socket.id);
      io.to(`${groupId}::${roomId}`).emit('roomUsers', rm.users);

      socket.leave(`${groupId}::${roomId}`);
      users[socket.id].currentRoom = null;
      broadcastAllChannelsData(groupId);
    }
  });

  // renameGroup
  socket.on('renameGroup', async ({ groupId, newName }) => {
    const userName = users[socket.id].username;
    if (!groups[groupId]) return;

    if (groups[groupId].owner !== userName) {
      socket.emit('errorMessage', "Bu grubu değiştirme yetkiniz yok.");
      return;
    }

    try {
      const groupDoc = await Group.findOne({ groupId });
      if (!groupDoc) {
        socket.emit('errorMessage', "Grup DB'de yok.");
        return;
      }
      groupDoc.name = newName;
      await groupDoc.save();

      groups[groupId].name = newName;

      io.to(groupId).emit('groupRenamed', { groupId, newName });
      console.log(`Grup rename => ${groupId}, yeni isim=${newName}`);
    } catch (err) {
      console.error("renameGroup hata:", err);
      socket.emit('errorMessage', "Grup ismi değiştirilirken hata oluştu.");
    }
  });

  // deleteGroup
  socket.on('deleteGroup', async (grpId) => {
    const userName = users[socket.id].username;
    if (!groups[grpId]) {
      socket.emit('errorMessage', "Grup bellekte yok.");
      return;
    }
    if (groups[grpId].owner !== userName) {
      socket.emit('errorMessage', "Bu grubu silmeye yetkiniz yok.");
      return;
    }

    try {
      const groupDoc = await Group.findOne({ groupId: grpId });
      if (!groupDoc) {
        socket.emit('errorMessage', "Grup DB'de bulunamadı.");
        return;
      }
      await Group.deleteOne({ _id: groupDoc._id });
      await Channel.deleteMany({ group: groupDoc._id });
      await Message.deleteMany({ channel: { $in: [] } }); 
      // (Opsiyonel: Yukarıdaki satırı isterseniz channel bellek vs. ile silmek isterseniz)

      delete groups[grpId];
      console.log(`Grup silindi => ${grpId}`);

      io.emit('groupDeleted', { groupId: grpId });
    } catch (err) {
      console.error("deleteGroup hata:", err);
      socket.emit('errorMessage', "Grup silinirken hata oluştu.");
    }
  });

  // renameChannel => ...
  socket.on('renameChannel', async ({ groupId, channelId, newName }) => {
    const userName = users[socket.id].username;
    if (!groups[groupId]) return;

    if (groups[groupId].owner !== userName) {
      socket.emit('errorMessage', "Bu kanalı değiştirme yetkiniz yok.");
      return;
    }

    try {
      const groupDoc = await Group.findOne({ groupId });
      if (!groupDoc) {
        socket.emit('errorMessage', "Grup DB'de yok.");
        return;
      }
      const channelDoc = await Channel.findOne({ channelId, group: groupDoc._id });
      if (!channelDoc) {
        socket.emit('errorMessage', "Kanal DB'de bulunamadı.");
        return;
      }

      channelDoc.name = newName;
      await channelDoc.save();

      if (groups[groupId].rooms[channelId]) {
        groups[groupId].rooms[channelId].name = newName;
      }

      io.to(groupId).emit('channelRenamed', { groupId, channelId, newName });
      console.log(`Kanal rename => channelId=${channelId}, newName=${newName}`);
    } catch (err) {
      console.error("renameChannel hata:", err);
      socket.emit('errorMessage', "Kanal ismi değiştirilirken hata oluştu.");
    }
  });

  // deleteChannel => ...
  socket.on('deleteChannel', async ({ groupId, channelId }) => {
    const userName = users[socket.id].username;
    if (!groups[groupId]) return;

    if (groups[groupId].owner !== userName) {
      socket.emit('errorMessage', "Bu kanalı silmeye yetkiniz yok.");
      return;
    }

    try {
      const groupDoc = await Group.findOne({ groupId });
      if (!groupDoc) {
        socket.emit('errorMessage', "Grup DB'de yok.");
        return;
      }
      const channelDoc = await Channel.findOne({ channelId, group: groupDoc._id });
      if (!channelDoc) {
        socket.emit('errorMessage', "Kanal DB'de bulunamadı.");
        return;
      }
      await Channel.deleteOne({ _id: channelDoc._id });

      delete groups[groupId].rooms[channelId];

      console.log(`Kanal silindi => channelId=${channelId}, groupId=${groupId}`);

      io.to(groupId).emit('channelDeleted', { groupId, channelId });
    } catch (err) {
      console.error("deleteChannel hata:", err);
      socket.emit('errorMessage', "Kanal silinirken hata oluştu.");
    }
  });

  // sendMessage => text channel
  socket.on('sendMessage', async ({ groupId, channelId, content }) => {
    const userData = users[socket.id];
    if (!userData || !groups[groupId]) return;
    const rm = groups[groupId].rooms[channelId];
    if (!rm) return;
    if (rm.type !== 'text') return;

    try {
      const groupDoc = await Group.findOne({ groupId });
      if (!groupDoc) return;
      const channelDoc = await Channel.findOne({ channelId, group: groupDoc._id });
      if (!channelDoc) return;

      const userDoc = await User.findOne({ username: userData.username });
      if (!userDoc) return;

      const newMsg = new Message({
        channel: channelDoc._id,
        user: userDoc._id,
        content
      });
      await newMsg.save();

      io.to(groupId).emit('newMessage', {
        user: userDoc.username,
        content,
        timestamp: newMsg.timestamp
      });
      console.log(`Text msg => channelId=${channelId}, user=${userDoc.username}, content=${content}`);
    } catch (err) {
      console.error("sendMessage hata:", err);
    }
  });

  // WebRTC => signal
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
      const { username } = userData;
      if (username) {
        onlineUsernames.delete(username);
        removeUserFromAllVoiceChannels(socket.id);

        // user'ı groups[] içinden de çıkar
        for (const gId of Object.keys(groups)) {
          groups[gId].users = groups[gId].users.filter(u => u.id !== socket.id);
          broadcastAllChannelsData(gId);
          await broadcastGroupUsers(gId);
        }
      }
    }
    delete users[socket.id];
  });
});

// Start
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
});
