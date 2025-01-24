/**************************************
 * socket/socket.js
 **************************************/
const socketIO = require("socket.io");
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

// Modeller
const User = require('../models/User');
const Group = require('../models/Group');
const Channel = require('../models/Channel');

// Bellek içi tablolar
// socket.id -> { username, currentGroup, currentRoom, micEnabled, selfDeafened }
const users = {};
// groupId -> { owner, name, users:[], rooms:{} }
const groups = {};
// Çevrimiçi (online) olan kullanıcı adlarını tutalım
const onlineUsernames = new Set();

// Grupları DB'den belleğe yükleme
async function loadGroupsFromDB() {
  try {
    const allGroups = await Group.find({});
    allGroups.forEach(gDoc => {
      if (!groups[gDoc.groupId]) {
        groups[gDoc.groupId] = {
          owner: null,
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

// Kanal bilgilerini DB'den belleğe yükleme
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

// Bir gruptaki tüm kanalların (rooms) verisini döndürür
function getAllChannelsData(groupId) {
  if (!groups[groupId]) return {};
  const channelsObj = {};
  Object.keys(groups[groupId].rooms).forEach(roomId => {
    const rm = groups[groupId].rooms[roomId];
    // rm.users => { id, username }
    // Her user => micEnabled / selfDeafened durumu eklenecek
    const userListWithAudio = rm.users.map(u => ({
      id: u.id,
      username: u.username,
      micEnabled: (users[u.id] && users[u.id].micEnabled !== undefined)
        ? users[u.id].micEnabled
        : true,
      selfDeafened: (users[u.id] && users[u.id].selfDeafened !== undefined)
        ? users[u.id].selfDeafened
        : false
    }));
    channelsObj[roomId] = {
      name: rm.name,
      users: userListWithAudio
    };
  });
  return channelsObj;
}

// Tüm kanallardaki kullanıcı listesini tekrar yayınlar (roomUsers)
function broadcastAllRoomsUsers(io, groupId) {
  if (!groups[groupId]) return;
  Object.keys(groups[groupId].rooms).forEach(roomId => {
    io.to(`${groupId}::${roomId}`).emit('roomUsers', groups[groupId].rooms[roomId].users);
  });
}

// Bir kullanıcı hangi gruplarda/odalarda varsa hepsinden çıkarır
function removeUserFromAllGroupsAndRooms(io, socket) {
  const socketId = socket.id;
  const userData = users[socketId];
  if (!userData) return;

  Object.keys(groups).forEach(gId => {
    const grpObj = groups[gId];
    if (grpObj.users.some(u => u.id === socketId)) {
      grpObj.users = grpObj.users.filter(u => u.id !== socketId);

      Object.keys(grpObj.rooms).forEach(rId => {
        grpObj.rooms[rId].users = grpObj.rooms[rId].users.filter(u => u.id !== socketId);
        io.to(`${gId}::${rId}`).emit('roomUsers', grpObj.rooms[rId].users);
      });
      io.to(gId).emit('allChannelsData', getAllChannelsData(gId));
    }
    Object.keys(grpObj.rooms).forEach(rId => {
      socket.leave(`${gId}::${rId}`);
    });
    socket.leave(gId);
  });

  users[socketId].currentGroup = null;
  users[socketId].currentRoom = null;
}

// DB'den gruba ait kullanıcıları alıp => online/offline listesi döndürür
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

// Tüm gruba => groupUsers
async function broadcastGroupUsers(io, groupId) {
  if (!groupId) return;
  try {
    const { online, offline } = await getOnlineOfflineDataForGroup(groupId);
    io.to(groupId).emit('groupUsers', { online, offline });
  } catch (err) {
    console.error("broadcastGroupUsers hata:", err);
  }
}

// Tek kullanıcıya => groupUsers
async function sendGroupUsersToOneUser(io, socketId, groupId) {
  try {
    const { online, offline } = await getOnlineOfflineDataForGroup(groupId);
    io.to(socketId).emit('groupUsers', { online, offline });
  } catch (err) {
    console.error("sendGroupUsersToOneUser hata:", err);
  }
}

// Tüm gruba => allChannelsData
function broadcastAllChannelsData(io, groupId) {
  if (!groups[groupId]) return;
  const channelsObj = getAllChannelsData(groupId);
  io.to(groupId).emit('allChannelsData', channelsObj);
}

// Tek kullanıcıya => allChannelsData
function sendAllChannelsDataToOneUser(io, socketId, groupId) {
  if (!groups[groupId]) return;
  const channelsObj = getAllChannelsData(groupId);
  io.to(socketId).emit('allChannelsData', channelsObj);
}

// Tek kullanıcıya => roomsList
function sendRoomsListToUser(io, socketId, groupId) {
  if (!groups[groupId]) return;
  const groupObj = groups[groupId];
  const roomArray = Object.keys(groupObj.rooms).map(rId => ({
    id: rId,
    name: groupObj.rooms[rId].name
  }));
  io.to(socketId).emit('roomsList', roomArray);
}

// Tüm kullanıcıya => roomsList
function broadcastRoomsListToGroup(io, groupId) {
  if (!groups[groupId]) return;
  groups[groupId].users.forEach(u => {
    sendRoomsListToUser(io, u.id, groupId);
  });
}

// Tek kullanıcıya => groupsList => (owner, id, name)
async function sendGroupsListToUser(io, socketId) {
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

// initSocket fonksiyonu => server.js içinden çağrılacak
async function initSocket(server) {
  const io = socketIO(server);

  // Sunucu ilk açıldığında DB'den grup/kanal verilerini belleğe aktar
  await loadGroupsFromDB();
  await loadChannelsFromDB();

  // Bağlanan her kullanıcı için
  io.on("connection", (socket) => {
    console.log("Kullanıcı bağlandı:", socket.id);

    // Varsayılan kullanıcı dataları
    users[socket.id] = {
      username: null,
      currentGroup: null,
      currentRoom: null,
      micEnabled: true,
      selfDeafened: false
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
          await sendGroupsListToUser(io, socket.id);
        } catch (err) {
          console.error("sendGroupsListToUser hata:", err);
        }

        // DB => hangi gruplara üye => broadcastGroupUsers
        try {
          const userDoc = await User.findOne({ username: trimmedName }).populate('groups');
          if (userDoc && userDoc.groups.length > 0) {
            for (const gDoc of userDoc.groups) {
              broadcastGroupUsers(io, gDoc.groupId);
            }
          }
        } catch (err) {
          console.error("userDoc groups fetch hata:", err);
        }
      }
    });

    // audioStateChanged => client => sunucu => kaydet => broadcast
    socket.on('audioStateChanged', ({ micEnabled, selfDeafened }) => {
      if (!users[socket.id]) return;
      users[socket.id].micEnabled = micEnabled;
      users[socket.id].selfDeafened = selfDeafened;
      const gId = users[socket.id].currentGroup;
      if (gId) {
        broadcastAllChannelsData(io, gId);
      }
    });

    // createGroup
    socket.on('createGroup', async (groupName) => {
      if (!groupName) return;
      const trimmed = groupName.trim();
      if (!trimmed) return;

      const userName = users[socket.id].username || null;
      if (!userName) {
        socket.emit('errorMessage', "Kullanıcı adınız tanımlı değil.");
        return;
      }
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

      await sendGroupsListToUser(io, socket.id);
      broadcastGroupUsers(io, groupId);
    });

    // joinGroupByID
    socket.on('joinGroupByID', async (groupId) => {
      try {
        if (users[socket.id].currentGroup === groupId) {
          return;
        }
        const userName = users[socket.id].username || null;
        if (!userName) {
          socket.emit('errorMessage', "Kullanıcı adınız tanımlı değil.");
          return;
        }
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

        if (!groupDoc.users.includes(userDoc._id)) {
          groupDoc.users.push(userDoc._id);
          await groupDoc.save();
        }
        if (!userDoc.groups.includes(groupDoc._id)) {
          userDoc.groups.push(groupDoc._id);
          await userDoc.save();
        }

        if (!groups[groupId]) {
          const ownerUser = await User.findById(groupDoc.owner);
          let ownerUsername = ownerUser ? ownerUser.username : null;
          groups[groupId] = {
            owner: ownerUsername,
            name: groupDoc.name,
            users: [],
            rooms: {}
          };
        }

        removeUserFromAllGroupsAndRooms(io, socket);

        const userData = users[socket.id];
        if (!userData.username) {
          socket.emit('errorMessage', "Kullanıcı adınız yok, kanala eklenemiyorsunuz.");
          return;
        }
        if (!groups[groupId].users.some(u => u.id === socket.id)) {
          groups[groupId].users.push({ id: socket.id, username: userData.username });
        }
        userData.currentGroup = groupId;
        userData.currentRoom = null;
        socket.join(groupId);

        console.log(`User ${socket.id} => joinGroupByID => ${groupId}`);

        await sendGroupsListToUser(io, socket.id);

        sendRoomsListToUser(io, socket.id, groupId);
        broadcastAllChannelsData(io, groupId);
        await broadcastGroupUsers(io, groupId);

      } catch (err) {
        console.error("joinGroupByID hata:", err);
      }
    });

    // browseGroup
    socket.on('browseGroup', async (groupId) => {
      if (!groups[groupId]) return;
      sendRoomsListToUser(io, socket.id, groupId);
      sendAllChannelsDataToOneUser(io, socket.id, groupId);
      await sendGroupUsersToOneUser(io, socket.id, groupId);
    });

    // joinGroup
    socket.on('joinGroup', async (groupId) => {
      if (!groups[groupId]) return;
      if (users[socket.id].currentGroup === groupId) {
        return;
      }

      removeUserFromAllGroupsAndRooms(io, socket);

      const userData = users[socket.id];
      const userName = userData.username;
      if (!userName) {
        socket.emit('errorMessage', "Kullanıcı adınız yok.");
        return;
      }
      if (!groups[groupId].users.some(u => u.id === socket.id)) {
        groups[groupId].users.push({ id: socket.id, username: userName });
      }
      userData.currentGroup = groupId;
      userData.currentRoom = null;
      socket.join(groupId);

      sendRoomsListToUser(io, socket.id, groupId);
      broadcastAllChannelsData(io, groupId);
      await broadcastGroupUsers(io, groupId);
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

        broadcastRoomsListToGroup(io, groupId);
        broadcastAllChannelsData(io, groupId);
      } catch (err) {
        console.error("createRoom hata:", err);
      }
    });

    // joinRoom
    socket.on('joinRoom', ({ groupId, roomId }) => {
      if (!groups[groupId]) return;
      if (!groups[groupId].rooms[roomId]) return;

      const userData = users[socket.id];
      if (!userData.username) {
        socket.emit('errorMessage', "Kullanıcı adınız tanımsız => Kanala eklenemiyor.");
        return;
      }
      if (userData.currentGroup === groupId && userData.currentRoom === roomId) {
        return;
      }
      if (userData.currentGroup === groupId && userData.currentRoom && groups[groupId].rooms[userData.currentRoom]) {
        groups[groupId].rooms[userData.currentRoom].users =
          groups[groupId].rooms[userData.currentRoom].users.filter(u => u.id !== socket.id);
        io.to(`${groupId}::${userData.currentRoom}`).emit('roomUsers', groups[groupId].rooms[userData.currentRoom].users);
        socket.leave(`${groupId}::${userData.currentRoom}`);
      } else {
        removeUserFromAllGroupsAndRooms(io, socket);
      }

      const userName = userData.username;
      if (!groups[groupId].users.some(u => u.id === socket.id)) {
        groups[groupId].users.push({ id: socket.id, username: userName });
      }
      groups[groupId].rooms[roomId].users.push({ id: socket.id, username: userName });
      userData.currentGroup = groupId;
      userData.currentRoom = roomId;

      socket.join(groupId);
      socket.join(`${groupId}::${roomId}`);

      io.to(`${groupId}::${roomId}`).emit('roomUsers', groups[groupId].rooms[roomId].users);

      broadcastAllChannelsData(io, groupId);
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
      broadcastAllChannelsData(io, groupId);
    });

    // renameGroup
    socket.on('renameGroup', async (data) => {
      const { groupId, newName } = data;
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
        await group
