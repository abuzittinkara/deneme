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

const uri = process.env.MONGODB_URI || "mongodb+srv://abuzorttin:HWZe7uK5yEAE@cluster0.vdrdy.mongodb.net/myappdb?retryWrites=true&w=majority";
mongoose.connect(uri)
  .then(() => console.log("MongoDB bağlantısı başarılı!"))
  .catch(err => console.error("MongoDB bağlantı hatası:", err));

app.use(express.static("public"));

// Bellek içi veri: (gerekirse)
const users = {};   // socket.id -> { username, currentGroup, currentRoom }
const onlineUsernames = new Set();

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
      const existingUser = await User.findOne({
        $or: [
          { username },
          { email }
        ]
      });
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
  socket.on('set-username', (usernameVal) => {
    if (usernameVal) {
      users[socket.id].username = usernameVal.trim();
      onlineUsernames.add(usernameVal.trim());
    }
  });

  // createGroup
  socket.on('createGroup', async (groupName) => {
    if (!groupName) return;
    const userName = users[socket.id].username;
    if (!userName) return;

    try {
      // User'ı bul
      const userDoc = await User.findOne({ username: userName });
      if (!userDoc) {
        return;
      }
      // Yeni Group
      const groupId = uuidv4();
      const newGroup = new Group({
        groupId,
        name: groupName,
        owner: userDoc._id,
        users: [ userDoc._id ]
      });
      await newGroup.save();
      // User'ın groups alanına ekle
      userDoc.groups.push(newGroup._id);
      await userDoc.save();

      console.log("Yeni grup oluşturuldu:", groupName, "Owner (DB):", userDoc.username);

      // Client'a => groupsList
      sendGroupsList(socket.id);
    } catch(err) {
      console.error("createGroup hata:", err);
    }
  });

  // joinGroupByID
  socket.on('joinGroupByID', async (grpIdVal) => {
    const userName = users[socket.id].username;
    if (!userName) {
      socket.emit('errorMessage', "Önce login olmalısınız.");
      return;
    }
    try {
      // 1) groupDoc
      const groupDoc = await Group.findOne({ groupId: grpIdVal });
      if (!groupDoc) {
        socket.emit('errorMessage', "Böyle bir grup yok (DB).");
        return;
      }
      // 2) userDoc
      const userDoc = await User.findOne({ username: userName });
      if (!userDoc) {
        socket.emit('errorMessage', "Kullanıcı DB'de yok.");
        return;
      }
      // 3) groupDoc.users'e ekle
      if (!groupDoc.users.includes(userDoc._id)) {
        groupDoc.users.push(userDoc._id);
        await groupDoc.save();
      }
      // 4) userDoc.groups'e ekle
      if (!userDoc.groups.includes(groupDoc._id)) {
        userDoc.groups.push(groupDoc._id);
        await userDoc.save();
      }
      // Socket => memory
      users[socket.id].currentGroup = grpIdVal;
      socket.join(grpIdVal);

      // Client'a => groupsList & roomsList
      sendGroupsList(socket.id);
      sendRoomsList(socket.id, grpIdVal);
      // Tüm Channel datası (allChannelsData)
      sendAllChannelsData(socket.id, grpIdVal);

      // groupUsers
      broadcastGroupUsers(grpIdVal);

    } catch(err) {
      console.error("joinGroupByID hata:", err);
    }
  });

  // browseGroup => roomsList + groupUsers + allChannelsData
  socket.on('browseGroup', async (gId) => {
    sendRoomsList(socket.id, gId);
    sendAllChannelsData(socket.id, gId);
    await sendGroupUsersToOne(socket.id, gId);
  });

  // createRoom
  socket.on('createRoom', async (data) => {
    const { groupId, roomName } = data;
    if (!groupId || !roomName) return;
    try {
      // DB'de groupDoc bul
      const groupDoc = await Group.findOne({ groupId });
      if (!groupDoc) return;
      const channelId = uuidv4();
      const newChannel = new Channel({
        channelId,
        name: roomName,
        group: groupDoc._id,
        users: []
      });
      await newChannel.save();
      console.log("Yeni Channel DB kaydedildi:", roomName);

      // memory => Sadece anlık UI test. DB asıl kaynaktır
      // Tüm user'a => roomsList + allChannelsData
      sendRoomsListToGroup(groupId);
      broadcastAllChannelsData(groupId);
    } catch(err) {
      console.error("createRoom hata:", err);
    }
  });

  // renameChannel
  socket.on('renameChannel', async (data) => {
    const { groupId, channelId, newName } = data;
    if (!groupId || !channelId || !newName) return;
    const userName = users[socket.id].username;
    if (!userName) return;

    try {
      // groupDoc => owner check
      const groupDoc = await Group.findOne({ groupId });
      if (!groupDoc) return;

      // groupDoc.owner => userDoc
      const ownerUser = await User.findById(groupDoc.owner);
      if (!ownerUser) return;
      if (ownerUser.username !== userName) {
        socket.emit('errorMessage', "Bu kanalı değiştirme yetkin yok (owner değilsin).");
        return;
      }
      // Channel DB => findOne
      const channelDoc = await Channel.findOne({ channelId });
      if (!channelDoc) {
        socket.emit('errorMessage', "Kanal DB'de yok.");
        return;
      }
      channelDoc.name = newName;
      await channelDoc.save();
      console.log("renameChannel => DB updated channel name:", newName);

      // Tüm client => channelRenamed
      io.emit('channelRenamed', { groupId, channelId, newName });
    } catch(err) {
      console.error("renameChannel hata:", err);
    }
  });

  // deleteChannel
  socket.on('deleteChannel', async (data) => {
    const { groupId, channelId } = data;
    if (!groupId || !channelId) return;
    const userName = users[socket.id].username;
    if (!userName) return;

    try {
      const groupDoc = await Group.findOne({ groupId });
      if (!groupDoc) return;
      const ownerUser = await User.findById(groupDoc.owner);
      if (!ownerUser) return;
      if (ownerUser.username !== userName) {
        socket.emit('errorMessage', "Kanalı silme yetkin yok (owner değilsin).");
        return;
      }
      const channelDoc = await Channel.findOne({ channelId });
      if (!channelDoc) {
        socket.emit('errorMessage', "Kanal DB'de bulunamadı.");
        return;
      }
      await Channel.deleteOne({ _id: channelDoc._id });
      console.log("deleteChannel => Kanal silindi, id:", channelId);

      io.emit('channelDeleted', { groupId, channelId });
    } catch(err) {
      console.error("deleteChannel hata:", err);
    }
  });

  // renameGroup
  socket.on('renameGroup', async (data) => {
    const { groupId, newName } = data;
    if (!groupId || !newName) return;
    const userName = users[socket.id].username;
    if (!userName) return;

    try {
      const groupDoc = await Group.findOne({ groupId });
      if (!groupDoc) {
        socket.emit('errorMessage', "Grup DB'de yok.");
        return;
      }
      const ownerUser = await User.findById(groupDoc.owner);
      if (!ownerUser || ownerUser.username !== userName) {
        socket.emit('errorMessage', "Bu grubu değiştirme yetkin yok (owner değilsin).");
        return;
      }
      groupDoc.name = newName;
      await groupDoc.save();
      console.log("renameGroup => DB updated group name:", newName);

      io.emit('groupRenamed', { groupId, newName });
    } catch(err) {
      console.error("renameGroup hata:", err);
    }
  });

  // deleteGroup
  socket.on('deleteGroup', async (grpIdVal) => {
    const userName = users[socket.id].username;
    if (!grpIdVal || !userName) return;

    try {
      const groupDoc = await Group.findOne({ groupId: grpIdVal });
      if (!groupDoc) {
        socket.emit('errorMessage', "Grup yok (DB).");
        return;
      }
      const ownerUser = await User.findById(groupDoc.owner);
      if (!ownerUser || ownerUser.username !== userName) {
        socket.emit('errorMessage', "Bu grubu silme yetkin yok (owner değilsin).");
        return;
      }
      // Sil
      await Channel.deleteMany({ group: groupDoc._id });
      await Group.deleteOne({ _id: groupDoc._id });
      console.log("Grup silindi => groupId:", grpIdVal);

      io.emit('groupDeleted', { groupId: grpIdVal });
    } catch(err) {
      console.error("deleteGroup hata:", err);
    }
  });

  // joinRoom
  socket.on('joinRoom', async ({ groupId, roomId }) => {
    // Normalde memory / DB side: remove user from old room, add to new
    // Demo
    socket.join(groupId);
    socket.join(`${groupId}::${roomId}`);
    console.log("joinRoom => user:", socket.id, "groupId:", groupId, "roomId:", roomId);
    // Tüm client => roomUsers vb. fetch edebilir
  });

  // leaveRoom
  socket.on('leaveRoom', async ({ groupId, roomId }) => {
    socket.leave(`${groupId}::${roomId}`);
    console.log("leaveRoom => user:", socket.id, "groupId:", groupId, "roomId:", roomId);
  });

  // browseGroup
  socket.on('browseGroup', async (gId) => {
    sendRoomsList(socket.id, gId);
    sendAllChannelsData(socket.id, gId);
    await sendGroupUsersToOne(socket.id, gId);
  });

  // disconnect
  socket.on("disconnect", () => {
    console.log("disconnect:", socket.id);
    const userData = users[socket.id];
    if (userData) {
      const { username } = userData;
      if (username) {
        onlineUsernames.delete(username);
      }
    }
    delete users[socket.id];
  });
});

/* Yardımcı Fonksiyonlar */
async function sendGroupsList(socketId) {
  try {
    const userData = users[socketId];
    if (!userData) return;
    const userDoc = await User.findOne({ username: userData.username }).populate('groups');
    if (!userDoc) return;

    const groupArray = [];
    for (const g of userDoc.groups) {
      // owner = username
      const ownerUser = await User.findById(g.owner);
      const ownerName = ownerUser ? ownerUser.username : "(OwnerBulunamadı)";
      groupArray.push({
        id: g.groupId,
        name: g.name,
        owner: ownerName
      });
    }
    io.to(socketId).emit('groupsList', groupArray);
  } catch(err) {
    console.error("sendGroupsList hata:", err);
  }
}

async function sendRoomsList(socketId, groupId) {
  try {
    const groupDoc = await Group.findOne({ groupId }).populate('users');
    if (!groupDoc) return;

    const channels = await Channel.find({ group: groupDoc._id });
    const roomsArray = channels.map(ch => ({
      id: ch.channelId,
      name: ch.name
    }));
    io.to(socketId).emit('roomsList', roomsArray);
  } catch(err) {
    console.error("sendRoomsList hata:", err);
  }
}

async function sendRoomsListToGroup(groupId) {
  try {
    const groupDoc = await Group.findOne({ groupId }).populate('users');
    if (!groupDoc) return;
    const channels = await Channel.find({ group: groupDoc._id });
    const roomsArray = channels.map(ch => ({
      id: ch.channelId,
      name: ch.name
    }));
    // Tüm user'lar
    groupDoc.users.forEach(uId => {
      // user => userDoc => socket yok => bu demoda memory 'users' tablosu var
      // (gerçek projede userDoc -> socketID eşleştirmesi lazımdı.)
    });
    // Kısaca broadcast
    io.to(groupId).emit('roomsList', roomsArray);
  } catch(err) {
    console.error("sendRoomsListToGroup hata:", err);
  }
}

async function sendAllChannelsData(socketId, groupId) {
  try {
    const groupDoc = await Group.findOne({ groupId }).populate('users');
    if (!groupDoc) return;
    const channels = await Channel.find({ group: groupDoc._id });
    const channelsObj = {};
    for (const ch of channels) {
      // ch.users -> arrayOf ObjectId => populate user to get username => basit şekilde
      const userRefs = ch.users || [];
      const userList = [];
      for (const uRef of userRefs) {
        const userDoc = await User.findById(uRef);
        if (userDoc) {
          userList.push({ id: `unknownSocket`, username: userDoc.username });
          // Bu kısımda "unknownSocket" sadece demo. Gerçekte user <-> socket mapping.
        }
      }
      channelsObj[ch.channelId] = {
        name: ch.name,
        users: userList
      };
    }
    io.to(socketId).emit('allChannelsData', channelsObj);
  } catch(err) {
    console.error("sendAllChannelsData hata:", err);
  }
}

async function broadcastAllChannelsData(groupId) {
  try {
    const groupDoc = await Group.findOne({ groupId }).populate('users');
    if (!groupDoc) return;
    const channels = await Channel.find({ group: groupDoc._id });
    const channelsObj = {};
    for (const ch of channels) {
      const userList = [];
      for (const uRef of ch.users || []) {
        const userDoc = await User.findById(uRef);
        if (userDoc) {
          userList.push({ id: `unknownSocket`, username: userDoc.username });
        }
      }
      channelsObj[ch.channelId] = {
        name: ch.name,
        users: userList
      };
    }
    io.to(groupId).emit('allChannelsData', channelsObj);
  } catch(err) {
    console.error("broadcastAllChannelsData hata:", err);
  }
}

async function sendGroupUsersToOne(socketId, groupId) {
  try {
    const groupDoc = await Group.findOne({ groupId }).populate('users');
    if (!groupDoc) return;
    const online = [];
    const offline = [];
    for (const uRef of groupDoc.users) {
      const uName = uRef.username;
      if (onlineUsernames.has(uName)) {
        online.push({ username: uName });
      } else {
        offline.push({ username: uName });
      }
    }
    io.to(socketId).emit('groupUsers', { online, offline });
  } catch(err) {
    console.error("sendGroupUsersToOne hata:", err);
  }
}

async function broadcastGroupUsers(groupId) {
  try {
    const groupDoc = await Group.findOne({ groupId }).populate('users');
    if (!groupDoc) return;
    const online = [];
    const offline = [];
    for (const uRef of groupDoc.users) {
      const uName = uRef.username;
      if (onlineUsernames.has(uName)) {
        online.push({ username: uName });
      } else {
        offline.push({ username: uName });
      }
    }
    io.to(groupId).emit('groupUsers', { online, offline });
  } catch(err) {
    console.error("broadcastGroupUsers hata:", err);
  }
}

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
});
