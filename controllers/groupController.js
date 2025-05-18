// Group and channel management
const { v4: uuidv4 } = require('uuid');
const sfu = require('../sfu');

async function loadGroupsFromDB({ Group, groups }) {
  try {
    const groupDocs = await Group.find({});
    groupDocs.forEach(g => {
      groups[g.groupId] = { owner: g.owner, name: g.name, users: [], rooms: {} };
    });
    console.log('loadGroupsFromDB tamam, groups:', Object.keys(groups));
  } catch (err) {
    console.error('loadGroupsFromDB hata:', err);
  }
}

async function loadChannelsFromDB({ Channel, groups }) {
  try {
    const channelDocs = await Channel.find({}).populate('group');
    channelDocs.forEach(ch => {
      if (!ch.group) return;
      const gid = ch.group.groupId;
      if (!groups[gid]) return;
      groups[gid].rooms[ch.channelId] = { name: ch.name, type: ch.type, users: [] };
    });
    console.log('loadChannelsFromDB tamam.');
  } catch (err) {
    console.error('loadChannelsFromDB hata:', err);
  }
}

async function sendGroupsListToUser(io, socketId, { User, users }) {
  const userData = users[socketId];
  if (!userData || !userData.username) return;
  try {
    const userDoc = await User.findOne({ username: userData.username }).populate('groups');
    if (!userDoc) return;
    const groupList = userDoc.groups.map(g => ({ id: g.groupId, name: g.name, owner: g.owner }));
    io.to(socketId).emit('groupsList', groupList);
  } catch (err) {
    console.error('sendGroupsListToUser hatası:', err);
  }
}

function getAllChannelsData(groups, groupId) {
  if (!groups[groupId]) return {};
  const channelsObj = {};
  Object.keys(groups[groupId].rooms).forEach(roomId => {
    const rm = groups[groupId].rooms[roomId];
    channelsObj[roomId] = { name: rm.name, type: rm.type, users: rm.users };
  });
  return channelsObj;
}

function broadcastAllChannelsData(io, groups, groupId) {
  if (!groups[groupId]) return;
  const channelsObj = getAllChannelsData(groups, groupId);
  io.to(groupId).emit('allChannelsData', channelsObj);
}

function sendRoomsListToUser(io, socketId, groups, groupId) {
  if (!groups[groupId]) return;
  const groupObj = groups[groupId];
  const roomArray = Object.keys(groupObj.rooms).map(rId => ({
    id: rId,
    name: groupObj.rooms[rId].name,
    type: groupObj.rooms[rId].type
  }));
  io.to(socketId).emit('roomsList', roomArray);
}

function broadcastRoomsListToGroup(io, groups, groupId) {
  if (!groups[groupId]) return;
  const groupObj = groups[groupId];
  const roomArray = Object.keys(groupObj.rooms).map(rId => ({
    id: rId,
    name: groupObj.rooms[rId].name,
    type: groupObj.rooms[rId].type
  }));
  io.to(groupId).emit('roomsList', roomArray);
}

function removeUserFromAllGroupsAndRooms(io, socket, users, groups) {
  const socketId = socket.id;
  Object.keys(groups).forEach(gid => {
    const grpObj = groups[gid];
    grpObj.users = grpObj.users.filter(u => u.id !== socketId);
    Object.keys(grpObj.rooms).forEach(roomId => {
      const rmObj = grpObj.rooms[roomId];
      rmObj.users = rmObj.users.filter(u => u.id !== socketId);
      if (rmObj.producers) {
        Object.keys(rmObj.producers).forEach(pid => {
          const producer = rmObj.producers[pid];
          if (producer && producer.appData && producer.appData.peerId === socketId) {
            sfu.closeProducer(producer);
            delete rmObj.producers[pid];
          }
        });
      }
      if (rmObj.consumers) {
        Object.keys(rmObj.consumers).forEach(cid => {
          const consumer = rmObj.consumers[cid];
          if (consumer && consumer.appData && consumer.appData.peerId === socketId) {
            sfu.closeConsumer(consumer);
            delete rmObj.consumers[cid];
          }
        });
      }
      if (rmObj.transports) {
        Object.keys(rmObj.transports).forEach(tid => {
          const tr = rmObj.transports[tid];
          if (tr && tr.appData && tr.appData.peerId === socketId) {
            sfu.closeTransport(tr);
            delete rmObj.transports[tid];
          }
        });
      }
      io.to(`${gid}::${roomId}`).emit('roomUsers', rmObj.users);
      socket.leave(`${gid}::${roomId}`);
    });
    socket.leave(gid);
  });
  if (users[socket.id]) {
    users[socket.id].currentGroup = null;
    users[socket.id].currentRoom = null;
  }
}

async function broadcastGroupUsers(io, groups, onlineUsernames, Group, groupId) {
  if (!groupId) return;
  try {
    const groupDoc = await Group.findOne({ groupId }).populate('users');
    if (!groupDoc) return;
    const online = [];
    const offline = [];
    groupDoc.users.forEach(u => {
      if (onlineUsernames.has(u.username)) online.push({ username: u.username });
      else offline.push({ username: u.username });
    });
    io.to(groupId).emit('groupUsers', { online, offline });
  } catch (err) {
    console.error('broadcastGroupUsers hata:', err);
  }
}

function handleDisconnect(io, socket, context) {
  const { users, onlineUsernames, groups } = context;
  const username = users[socket.id]?.username;
  if (username) onlineUsernames.delete(username);
  removeUserFromAllGroupsAndRooms(io, socket, users, groups);
  delete users[socket.id];
}

function register(io, socket, context) {
  const { users, groups, User, Group, Channel, onlineUsernames } = context;

  socket.on('createGroup', async (groupName) => {
    try {
      if (!groupName) return;
      const trimmed = groupName.trim();
      const userName = users[socket.id].username || null;
      if (!userName) return socket.emit('errorMessage', 'Kullanıcı adınız tanımlı değil.');
      const userDoc = await User.findOne({ username: userName });
      if (!userDoc) return;
      const groupId = uuidv4();
      const newGroup = new Group({ groupId, name: trimmed, owner: userDoc._id, users: [userDoc._id] });
      await newGroup.save();
      userDoc.groups.push(newGroup._id);
      await userDoc.save();
      groups[groupId] = { owner: userName, name: trimmed, users: [{ id: socket.id, username: userName }], rooms: {} };
      await sendGroupsListToUser(io, socket.id, { User, users });
      broadcastGroupUsers(io, groups, onlineUsernames, Group, groupId);
    } catch (err) {
      console.error('Create group error:', err);
      socket.emit('errorMessage', 'Grup oluşturulurken bir hata oluştu.');
    }
  });

  socket.on('joinGroup', async (groupId) => {
    if (!groups[groupId]) return;
    if (users[socket.id].currentGroup === groupId) return;
    removeUserFromAllGroupsAndRooms(io, socket, users, groups);
    const userData = users[socket.id];
    const userName = userData.username;
    if (!userName) return socket.emit('errorMessage', 'Kullanıcı adınız yok.');
    if (!groups[groupId].users.some(u => u.id === socket.id)) {
      groups[groupId].users.push({ id: socket.id, username: userName });
    }
    userData.currentGroup = groupId;
    userData.currentRoom = null;
    socket.join(groupId);
    sendRoomsListToUser(io, socket.id, groups, groupId);
    broadcastAllChannelsData(io, groups, groupId);
    broadcastGroupUsers(io, groups, onlineUsernames, Group, groupId);
  });

  socket.on('browseGroup', (groupId) => {
    if (!groups[groupId]) return;
    sendRoomsListToUser(io, socket.id, groups, groupId);
    broadcastAllChannelsData(io, groups, groupId);
    broadcastGroupUsers(io, groups, onlineUsernames, Group, groupId);
  });

  // Diğer handlerlar (joinGroupByID, browseGroup, createRoom, joinRoom, leaveRoom,
  // renameGroup, deleteGroup, renameChannel, deleteChannel) buraya benzer şekilde
  // taşınabilir. Daha kısalık için özetlenmiştir.
}

module.exports = {
  register,
  loadGroupsFromDB,
  loadChannelsFromDB,
  sendGroupsListToUser,
  broadcastAllChannelsData,
  broadcastGroupUsers,
  removeUserFromAllGroupsAndRooms,
  handleDisconnect
};