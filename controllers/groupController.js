// Group and channel management
const { v4: uuidv4 } = require('uuid');
const sfu = require('../sfu');
const store = require('../utils/sharedStore');
const GroupMember = require('../models/GroupMember');

async function ensureUserDoc(doc) {
  if (doc && typeof doc.populate === 'function' &&
      (!Array.isArray(doc.groups) || !doc._id)) {
    doc = await doc.populate();
  }
  return doc;
}

async function loadGroupsFromDB({ Group, groups }) {
  try {
    const groupDocs = await Group.find({}).populate('owner', 'username');
    groupDocs.forEach(g => {
      const ownerName = g.owner ? g.owner.username : null;
      groups[g.groupId] = { owner: ownerName, name: g.name, users: [], rooms: {} };
      store.setJSON(store.key('group', g.groupId), groups[g.groupId]);
    });
    console.log('loadGroupsFromDB tamam, groups:', Object.keys(groups));
  } catch (err) {
    console.error('loadGroupsFromDB hata:', err);
  }
}

async function loadChannelsFromDB({ Channel, groups }) {
  try {
    const channelDocs = await Channel.find({}).sort({ order: 1 }).populate('group');
    channelDocs.forEach(ch => {
      if (!ch.group) return;
      const gid = ch.group.groupId;
      if (!groups[gid]) return;
      groups[gid].rooms[ch.channelId] = { name: ch.name, type: ch.type, users: [], order: ch.order || 0 };
      store.setJSON(store.key('group', gid), groups[gid]);
    });
    console.log('loadChannelsFromDB tamam.');
  } catch (err) {
    console.error('loadChannelsFromDB hata:', err);
  }
}

async function sendGroupsListToUser(io, socketId, { User, users, GroupMember }) {
  const userData = users[socketId];
  if (!userData || !userData.username) return;
  try {
    const userDoc = await User.findOne({ username: userData.username })
      .populate({ path: 'groups', populate: { path: 'owner', select: 'username' } });
    if (!userDoc) return;
    const groupList = await Promise.all(
      userDoc.groups.map(async g => {
        const gm = await GroupMember.findOne({ user: userDoc._id, group: g._id });
        let unread = 0;
        if (gm && gm.channelUnreads) {
          const values =
            typeof gm.channelUnreads.values === 'function'
              ? Array.from(gm.channelUnreads.values())
              : Object.values(gm.channelUnreads);
          unread = values.reduce((a, b) => a + (Number(b) || 0), 0);
        }
        return {
          id: g.groupId,
          name: g.name,
          owner: g.owner?.username || null,
          unreadCount: unread
        };
      })
    );
    io.to(socketId).emit('groupsList', groupList);
  } catch (err) {
    console.error('sendGroupsListToUser hatası:', err);
  }
}

function getAllChannelsData(groups, users, groupId) {
  if (!groups[groupId]) return {};
  const channelsObj = {};
  Object.keys(groups[groupId].rooms).forEach(roomId => {
    const rm = groups[groupId].rooms[roomId];
    const userInfos = rm.users.map(u => {
      const info = users[u.id] || {};
      return {
        id: u.id,
        username: u.username,
        micEnabled: info.micEnabled,
        selfDeafened: info.selfDeafened,
        hasMic: info.hasMic,
        isScreenSharing: info.isScreenSharing,
        screenShareProducerId: info.screenShareProducerId
      };
    });
    channelsObj[roomId] = { name: rm.name, type: rm.type, users: userInfos };
  });
  return channelsObj;
}

function broadcastAllChannelsData(io, users, groups, groupId) {
  if (!groups[groupId]) return;
  const channelsObj = getAllChannelsData(groups, users, groupId);
  io.to(groupId).emit('allChannelsData', channelsObj);
}

async function sendRoomsListToUser(io, socketId, context, groupId) {
  const { groups, users, Group, User, GroupMember } = context;
  if (!groups[groupId]) return;
  let channelUnreads = {};
  if (users && Group && User && GroupMember) {
    try {
      const username = users[socketId]?.username;
      if (username) {
        const [userDoc, groupDoc] = await Promise.all([
          User.findOne({ username }),
          Group.findOne({ groupId })
        ]);
        if (userDoc && groupDoc) {
          const gm = await GroupMember.findOne({ user: userDoc._id, group: groupDoc._id });
          if (gm && gm.channelUnreads) {
            const entries = typeof gm.channelUnreads.entries === 'function'
              ? Array.from(gm.channelUnreads.entries())
              : Object.entries(gm.channelUnreads);
            channelUnreads = Object.fromEntries(entries);
          }
        }
      }
    } catch (err) {
      console.error('sendRoomsListToUser error:', err);
    }
  }
  const groupObj = groups[groupId];
  const roomArray = Object.entries(groupObj.rooms)
    .sort((a, b) => (a[1].order || 0) - (b[1].order || 0))
    .map(([rId, rm]) => ({
      id: rId,
      name: rm.name,
      type: rm.type,
      unreadCount: Number(channelUnreads[rId] || 0)
    }));
  io.to(socketId).emit('roomsList', roomArray);
}

function broadcastRoomsListToGroup(io, groups, groupId) {
  if (!groups[groupId]) return;
  const groupObj = groups[groupId];
  const roomArray = Object.entries(groupObj.rooms)
    .sort((a, b) => (a[1].order || 0) - (b[1].order || 0))
    .map(([rId, rm]) => ({
      id: rId,
      name: rm.name,
      type: rm.type,
      unreadCount: 0
    }));
  io.to(groupId).emit('roomsList', roomArray);
}

function cleanupWatchingRelations(io, users, userId) {
  const user = users[userId];
  if (!user) return;
  if (user.watching && user.watching.size > 0) {
    user.watching.forEach(targetId => {
      if (users[targetId]) {
        users[targetId].watchers.delete(userId);
        const names = Array.from(users[targetId].watchers)
          .map(id => users[id]?.username)
          .filter(Boolean);
        io.to(targetId).emit('screenShareWatchers', names);
      }
    });
    user.watching.clear();
  }
  if (user.watchers && user.watchers.size > 0) {
    user.watchers.forEach(viewerId => {
      if (users[viewerId]) {
        users[viewerId].watching.delete(userId);
      }
    });
    user.watchers.clear();
    io.to(userId).emit('screenShareWatchers', []);
  }
}

function removeUserFromRoom(io, socket, users, groups, groupId, roomId, store) {
  const rmObj = groups[groupId]?.rooms[roomId];
  if (!rmObj) return;
  cleanupWatchingRelations(io, users, socket.id);
  const socketId = socket.id;
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
  socket.leave(`${groupId}::${roomId}`);
  io.to(`${groupId}::${roomId}`).emit('roomUsers', rmObj.users);
  if (users[socket.id]) {
    users[socket.id].currentRoom = null;
  }
  broadcastAllChannelsData(io, users, groups, groupId);
  if (store) store.setJSON(store.key('group', groupId), groups[groupId]);
}


function removeUserFromAllGroupsAndRooms(io, socket, users, groups, store) {
  const socketId = socket.id;
  Object.keys(groups).forEach(gid => {
    const grpObj = groups[gid];
    grpObj.users = grpObj.users.filter(u => u.id !== socketId);
    Object.keys(grpObj.rooms).forEach(roomId => {
      removeUserFromRoom(io, socket, users, groups, gid, roomId, store);
    });
    socket.leave(gid);
    if (store) store.setJSON(store.key('group', gid), groups[gid]);
  });
  if (users[socket.id]) {
    users[socket.id].currentGroup = null;
    users[socket.id].currentRoom = null;
    users[socket.id].currentTextChannel = null;
  }
  cleanupWatchingRelations(io, users, socket.id);
}

async function broadcastGroupUsers(io, groups, onlineUsernames, Group, groupId) {
  if (!groupId) return;
  try {
    const groupDoc = await Group.findOne({ groupId }).populate('users');
    if (!groupDoc) return;
    const online = [];
    const offline = [];
    groupDoc.users.forEach(u => {
      const info = { username: u.username, avatar: u.avatar };
      if (onlineUsernames.has(u.username)) online.push(info);
      else offline.push(info);
    });
    io.to(groupId).emit('groupUsers', { online, offline });
  } catch (err) {
    console.error('broadcastGroupUsers hata:', err);
  }
}

function handleDisconnect(io, socket, context) {
  const { users, onlineUsernames, groups, store, userSessions } = context;
  const username = users[socket.id]?.username;
  if (username) {
    onlineUsernames.delete(username);
    if (userSessions && userSessions[username] === socket.id) {
      delete userSessions[username];
    }
    if (store) store.removeSetMember('onlineUsers', username);
  }
  removeUserFromAllGroupsAndRooms(io, socket, users, groups, store);
  cleanupWatchingRelations(io, users, socket.id);
  delete users[socket.id];
  if (store) store.del(store.key('session', socket.id));
}

async function handleLeaveGroup(io, socket, context, groupId) {
  const { users, groups, User, Group, onlineUsernames, store } = context;
  if (!groups[groupId]) return;
  const userData = users[socket.id];
  if (!userData || !userData.username) return;

  Object.keys(groups[groupId].rooms).forEach(roomId => {
    if (groups[groupId].rooms[roomId].users.some(u => u.id === socket.id)) {
      removeUserFromRoom(io, socket, users, groups, groupId, roomId, store);
    }
  });

  groups[groupId].users = groups[groupId].users.filter(u => u.id !== socket.id);
  socket.leave(groupId);
  if (userData.currentGroup === groupId) {
    userData.currentGroup = null;
    userData.currentRoom = null;
    userData.currentTextChannel = null;
    if (store) store.setJSON(store.key('session', socket.id), userData);
  }

  try {
    let userDoc = await User.findOne({ username: userData.username });
    const groupDoc = await Group.findOne({ groupId });
    userDoc = await ensureUserDoc(userDoc);
    if (userDoc && groupDoc) {
      userDoc.groups = userDoc.groups.filter(gid => gid.toString() !== groupDoc._id.toString());
      await userDoc.save();
      groupDoc.users = groupDoc.users.filter(uid => uid.toString() !== userDoc._id.toString());
      await groupDoc.save();
    }
  } catch (err) {
    console.error('leaveGroup error:', err);
  }

  await sendGroupsListToUser(io, socket.id, { User, users, GroupMember });
  broadcastGroupUsers(io, groups, onlineUsernames, Group, groupId);
  if (store) store.setJSON(store.key('group', groupId), groups[groupId]);
}

function register(io, socket, context) {
  const { users, groups, User, Group, Channel, onlineUsernames, GroupMember } = context;

  socket.on('createGroup', async ({ groupName, channelName }) => {
    try {
      if (!groupName || !channelName) return;
      const trimmed = groupName.trim();
      const chanTrimmed = channelName.trim();
      if (!trimmed || !chanTrimmed) return;
      const userName = users[socket.id].username || null;
      if (!userName) return socket.emit('errorMessage', 'Kullanıcı adınız tanımlı değil.');
      let userDoc = await User.findOne({ username: userName });
      userDoc = await ensureUserDoc(userDoc);
      if (!userDoc) return;
      const groupId = uuidv4();
      const newGroup = new Group({ groupId, name: trimmed, owner: userDoc._id, users: [userDoc._id] });
      await newGroup.save();
      await GroupMember.create({
        user: userDoc._id,
        group: newGroup._id,
        unread: 0,
        channelUnreads: {}
      });
      userDoc.groups.push(newGroup._id);
      await userDoc.save();
      groups[groupId] = { owner: userName, name: trimmed, users: [{ id: socket.id, username: userName }], rooms: {} };
      if (context.store) {
        context.store.setJSON(context.store.key('group', groupId), groups[groupId]);
      }

      const channelId = uuidv4();
      const order = 0;
      const newChannel = new Channel({ channelId, name: chanTrimmed, group: newGroup._id, type: 'text', order });
      await newChannel.save();
      groups[groupId].rooms[channelId] = { name: chanTrimmed, type: 'text', users: [], order };
      if (context.store) {
        context.store.setJSON(context.store.key('group', groupId), groups[groupId]);
      }

      await sendGroupsListToUser(io, socket.id, { User, users, GroupMember });
      broadcastGroupUsers(io, groups, onlineUsernames, Group, groupId);
    } catch (err) {
      console.error('Create group error:', err);
      socket.emit('errorMessage', 'Grup oluşturulurken bir hata oluştu.');
    }
  });

  socket.on('joinGroup', async (groupId) => {
    try {
      if (!groups[groupId]) return;
      if (users[socket.id].currentGroup === groupId) return;

      removeUserFromAllGroupsAndRooms(io, socket, users, groups, context.store);
      const userData = users[socket.id];
      const userName = userData.username;
      if (!userName) return socket.emit('errorMessage', 'Kullanıcı adınız yok.');

      let [userDoc, groupDoc] = await Promise.all([
        User.findOne({ username: userName }),
        Group.findOne({ groupId })
      ]);
      userDoc = await ensureUserDoc(userDoc);

      if (userDoc && groupDoc) {
        if (!userDoc.groups.some(gid => gid.toString() === groupDoc._id.toString())) {
          userDoc.groups.push(groupDoc._id);
          await userDoc.save();
        }
        if (!groupDoc.users.some(uid => uid.toString() === userDoc._id.toString())) {
          groupDoc.users.push(userDoc._id);
          await groupDoc.save();
        }
        await GroupMember.updateOne(
          { user: userDoc._id, group: groupDoc._id },
          { $setOnInsert: { unread: 0, channelUnreads: {} } },
          { upsert: true }
        );
      }

      if (!groups[groupId].users.some(u => u.id === socket.id)) {
        groups[groupId].users.push({ id: socket.id, username: userName });
        if (context.store) context.store.setJSON(context.store.key('group', groupId), groups[groupId]);
      }
      userData.currentGroup = groupId;
      userData.currentRoom = null;
      userData.currentTextChannel = null;
      if (context.store) context.store.setJSON(context.store.key('session', socket.id), userData);
      socket.join(groupId);
      await sendRoomsListToUser(io, socket.id, { groups, users, Group, User, GroupMember }, groupId);
      await sendGroupsListToUser(io, socket.id, { User, users, GroupMember });
      broadcastAllChannelsData(io, users, groups, groupId);
      broadcastGroupUsers(io, groups, onlineUsernames, Group, groupId);
    } catch (err) {
      console.error('joinGroup error:', err);
    }
  });

  socket.on('browseGroup', async (groupId) => {
    if (!groups[groupId]) return;
    await sendRoomsListToUser(io, socket.id, { groups, users, Group, User, GroupMember }, groupId);
    broadcastAllChannelsData(io, users, groups, groupId);
    broadcastGroupUsers(io, groups, onlineUsernames, Group, groupId);
  });

  socket.on('leaveGroup', async (groupId) => {
    await handleLeaveGroup(io, socket, { users, groups, User, Group, onlineUsernames }, groupId);
  });

  socket.on('joinRoom', async ({ groupId, roomId }) => {
    try {
      if (!groups[groupId] || !groups[groupId].rooms[roomId]) return;
      const userData = users[socket.id];
      const userName = userData?.username;
      if (!userName) return socket.emit('errorMessage', 'Kullanıcı adınız yok.');
      // Kullanıcı başka bir odadaysa önce o odadan çıkar
      if (userData.currentRoom &&
          (userData.currentRoom !== roomId || userData.currentGroup !== groupId)) {
        const prevGroupId = userData.currentGroup;
        const prevRoomId = userData.currentRoom;
        if (groups[prevGroupId] && groups[prevGroupId].rooms[prevRoomId]) {
          removeUserFromRoom(io, socket, users, groups, prevGroupId, prevRoomId);
        }
      }
      const rmObj = groups[groupId].rooms[roomId];
      if (!rmObj.router) {
        rmObj.router = await sfu.createRouter(roomId);
      }
      if (!rmObj.users.some(u => u.id === socket.id)) {
        rmObj.users.push({ id: socket.id, username: userName });
      }
      if (!groups[groupId].users.some(u => u.id === socket.id)) {
        groups[groupId].users.push({ id: socket.id, username: userName });
        if (context.store) context.store.setJSON(context.store.key('group', groupId), groups[groupId])
      }
      userData.currentGroup = groupId;
      userData.currentRoom = roomId;
      if (context.store) context.store.setJSON(context.store.key('session', socket.id), userData);
      socket.join(groupId);
      socket.join(`${groupId}::${roomId}`);
      socket.emit('joinRoomAck', { groupId, roomId });
      io.to(`${groupId}::${roomId}`).emit('roomUsers', rmObj.users);
      broadcastAllChannelsData(io, users, groups, groupId);
      broadcastGroupUsers(io, groups, onlineUsernames, Group, groupId);
    } catch (err) {
      console.error('joinRoom error:', err);
    }
  });

  socket.on('moveUser', async ({ userId, groupId, roomId }) => {
    try {
      const targetSocket = io.sockets.sockets.get(userId);
      if (!targetSocket) return;
      if (!groups[groupId] || !groups[groupId].rooms[roomId]) return;
      const userData = users[userId];
      const userName = userData?.username;
      if (!userName) return;
      if (
        userData.currentRoom &&
        (userData.currentRoom !== roomId || userData.currentGroup !== groupId)
      ) {
        const prevGroupId = userData.currentGroup;
        const prevRoomId = userData.currentRoom;
        if (groups[prevGroupId] && groups[prevGroupId].rooms[prevRoomId]) {
          removeUserFromRoom(io, targetSocket, users, groups, prevGroupId, prevRoomId, context.store);
        }
      }
      const rmObj = groups[groupId].rooms[roomId];
      if (!rmObj.router) {
        rmObj.router = await sfu.createRouter(roomId);
      }
      if (!rmObj.users.some(u => u.id === userId)) {
        rmObj.users.push({ id: userId, username: userName });
      }
      if (!groups[groupId].users.some(u => u.id === userId)) {
        groups[groupId].users.push({ id: userId, username: userName });
        if (context.store) context.store.setJSON(context.store.key('group', groupId), groups[groupId]);
      }
      userData.currentGroup = groupId;
      userData.currentRoom = roomId;
      if (context.store) context.store.setJSON(context.store.key('session', userId), userData);
      targetSocket.join(groupId);
      targetSocket.join(`${groupId}::${roomId}`);
      io.to(userId).emit('joinRoomAck', { groupId, roomId });
      io.to(`${groupId}::${roomId}`).emit('roomUsers', rmObj.users);
      broadcastAllChannelsData(io, users, groups, groupId);
      broadcastGroupUsers(io, groups, onlineUsernames, Group, groupId);
    } catch (err) {
      console.error('moveUser error:', err);
    }
  });
  
  socket.on('leaveRoom', ({ groupId, roomId }) => {
    if (!groups[groupId] || !groups[groupId].rooms[roomId]) return;
    removeUserFromRoom(io, socket, users, groups, groupId, roomId);
  });

  socket.on('createChannel', async ({ groupId, name, type }) => {
    try {
      if (!groupId || !name) return;
      const trimmed = name.trim();
      const groupDoc = await Group.findOne({ groupId });
      if (!groupDoc) return;
      const channelId = uuidv4();
      const order = Object.keys(groups[groupId]?.rooms || {}).length;
      const resolvedType = type === 'voice' ? 'voice' : 'text';
      const newChannel = new Channel({
        channelId,
        name: trimmed,
        group: groupDoc._id,
        type: resolvedType,
        order
      });
      await newChannel.save();
      if (groups[groupId]) {
        groups[groupId].rooms[channelId] = { name: trimmed, type: resolvedType, users: [], order };
        io.to(groupId).emit('channelCreated', { id: channelId, name: trimmed, type: resolvedType, order });
        broadcastRoomsListToGroup(io, groups, groupId);
      }
    } catch (err) {
      console.error('createChannel error:', err);
    }
  });

  socket.on('renameChannel', async ({ channelId, newName }) => {
    try {
      if (!channelId || !newName) return;
      const chDoc = await Channel.findOneAndUpdate(
        { channelId },
        { name: newName.trim() }
      );
      if (chDoc && typeof chDoc.populate === 'function') {
        await chDoc.populate('group');
      }
      if (!chDoc || !chDoc.group) return;
      const gid = chDoc.group.groupId;
      if (groups[gid] && groups[gid].rooms[channelId]) {
        groups[gid].rooms[channelId].name = newName.trim();
        io.to(gid).emit('channelRenamed', { channelId, newName: newName.trim() });
        broadcastRoomsListToGroup(io, groups, gid);
      }
    } catch (err) {
      console.error('renameChannel error:', err);
    }
  });

  socket.on('reorderChannel', async ({ groupId, channelId, newIndex }) => {
    try {
      if (!groupId || !channelId || typeof newIndex !== 'number') return;
      const grp = groups[groupId];
      if (!grp || !grp.rooms[channelId]) return;

      const entries = Object.entries(grp.rooms).sort((a, b) => (a[1].order || 0) - (b[1].order || 0));
      const oldIndex = entries.findIndex(([id]) => id === channelId);
      if (oldIndex === -1 || newIndex < 0 || newIndex >= entries.length) return;

      const [moved] = entries.splice(oldIndex, 1);
      entries.splice(newIndex, 0, moved);
      for (let i = 0; i < entries.length; i++) {
        const [cid, room] = entries[i];
        room.order = i;
        await Channel.findOneAndUpdate({ channelId: cid }, { order: i });
      }
      grp.rooms = Object.fromEntries(entries);
      if (context.store) context.store.setJSON(context.store.key('group', groupId), grp);
      broadcastRoomsListToGroup(io, groups, groupId);
      broadcastAllChannelsData(io, users, groups, groupId);
    } catch (err) {
      console.error('reorderChannel error:', err);
    }
  });
  
  socket.on('deleteChannel', async channelId => {
    try {
      if (!channelId) return;
      
      // Kanalı silmeden önce belgeyi ve grubunu bul
      const chDoc = await Channel.findOne({ channelId });
      if (chDoc && typeof chDoc.populate === 'function') {
        await chDoc.populate('group');
      }
      if (!chDoc || !chDoc.group) return;

      const gid = chDoc.group.groupId;

      // Gruptaki metin kanalı sayısını kontrol et
      const textCount = Object.values(groups[gid]?.rooms || {})
        .filter(r => r.type === 'text').length;

      let resolvedType = chDoc.type;
      if (!resolvedType) {
        resolvedType = groups[gid]?.rooms?.[channelId]?.type;
      }

      if (resolvedType === 'text' && textCount === 1) {
        socket.emit('errorMessage', 'Grubun son metin kanalı silinemez.');
        return;
      }

      await Channel.findOneAndDelete({ channelId });
      if (groups[gid]) {
        delete groups[gid].rooms[channelId];
        io.to(gid).emit('channelDeleted', { channelId });
        broadcastRoomsListToGroup(io, groups, gid);
      }
    } catch (err) {
      console.error('deleteChannel error:', err);
    }
  });
  
  socket.on('markGroupRead', async groupId => {
    try {
      if (!groupId) return;
      const username = users[socket.id]?.username;
      if (!username) return;
      const [userDoc, groupDoc] = await Promise.all([
        User.findOne({ username }),
        Group.findOne({ groupId })
      ]);
      if (!userDoc || !groupDoc) return;
      await GroupMember.updateOne(
        { user: userDoc._id, group: groupDoc._id },
        { $set: { unread: 0, channelUnreads: {} } },
        { upsert: true }
      );
      io.to(socket.id).emit('groupUnreadReset', { groupId });
    } catch (err) {
      console.error('markGroupRead error:', err);
    }
  });

  socket.on('muteGroup', async ({ groupId, duration }) => {
    try {
      if (!groupId) return;
      const username = users[socket.id]?.username;
      if (!username) return;
      const [userDoc, groupDoc] = await Promise.all([
        User.findOne({ username }),
        Group.findOne({ groupId })
      ]);
      if (!userDoc || !groupDoc) return;
      const ms = Number(duration) || 0;
      const expire = ms > 0 ? new Date(Date.now() + ms) : null;
      const update = expire
        ? { $set: { muteUntil: expire } }
        : { $unset: { muteUntil: '' } };
      await GroupMember.updateOne(
        { user: userDoc._id, group: groupDoc._id },
        update,
        { upsert: true }
      );
      const ev = expire ? 'groupMuted' : 'muteCleared';
      const payload = expire
        ? { groupId, muteUntil: expire }
        : { groupId };
      io.to(socket.id).emit(ev, payload);
    } catch (err) {
      console.error('muteGroup error:', err);
    }
  });

  socket.on('muteChannel', async ({ groupId, channelId, duration }) => {
    try {
      if (!groupId || !channelId) return;
      const username = users[socket.id]?.username;
      if (!username) return;
      const [userDoc, groupDoc, channelDoc] = await Promise.all([
        User.findOne({ username }),
        Group.findOne({ groupId }),
        Channel.findOne({ channelId })
      ]);
      if (!userDoc || !groupDoc || !channelDoc) return;
      const ms = Number(duration) || 0;
      const expire = ms > 0 ? new Date(Date.now() + ms) : null;
      const field = `channelMuteUntil.${channelId}`;
      const update = expire ? { $set: { [field]: expire } } : { $unset: { [field]: '' } };
      await GroupMember.updateOne(
        { user: userDoc._id, group: groupDoc._id },
        update,
        { upsert: true }
      );
      const ev = expire ? 'channelMuted' : 'muteCleared';
      const payload = expire
        ? { groupId, channelId, muteUntil: expire }
        : { groupId, channelId };
      io.to(socket.id).emit(ev, payload);
    } catch (err) {
      console.error('muteChannel error:', err);
    }
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
  handleLeaveGroup,
  removeUserFromAllGroupsAndRooms,
  handleDisconnect
};
