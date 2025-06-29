// Group and channel management
const { v4: uuidv4 } = require('uuid');
const sfu = require('../sfu');
const store = require('../utils/sharedStore');
const GroupMember = require('../models/GroupMember');
const logger = require('../utils/logger');

// Events emitted when notification preferences change
const GROUP_NOTIFY_UPDATED = 'groupNotifyTypeUpdated';
const CHANNEL_NOTIFY_UPDATED = 'channelNotifyTypeUpdated';
const CATEGORY_COLLAPSE_UPDATED = 'categoryCollapseUpdated';
const CATEGORY_ORDER_UPDATED = 'categoryOrderUpdated';

// Timestamp representing an indefinite mute
const INDEFINITE_TS = new Date(8640000000000000);

function createEmptyGroupObj(groupDoc = {}) {
  const ownerName = groupDoc.owner && groupDoc.owner.username
    ? groupDoc.owner.username
    : null;
  return {
    owner: ownerName,
    name: groupDoc.name || '',
    users: [],
    rooms: {},
    categories: {}
  };
}

function convertChannelDoc(ch) {
  return {
    name: ch.name,
    type: ch.type,
    categoryId: ch.category && ch.category.categoryId ? ch.category.categoryId : null,
    users: [],
    order: ch.order || 0
  };
}

function convertCategoryDoc(cat) {
  return {
    name: cat.name,
    order: cat.order || 0
  };
}

function getNextOrder(groups, groupId) {
  const grp = groups[groupId];
  if (!grp) return 0;
  const orders = [
    ...Object.values(grp.rooms || {}).map(r => r.order || 0),
    ...Object.values(grp.categories || {}).map(c => c.order || 0)
  ];
  return orders.length > 0 ? Math.max(...orders) + 1 : 0;
}

async function createDefaultChannel(groupDoc, { Channel, groups, store }) {
  const channelId = uuidv4();
  await Channel.create({
    channelId,
    name: 'genel',
    type: 'text',
    group: groupDoc._id,
    order: 0
  });
  if (!groups[groupDoc.groupId]) {
    groups[groupDoc.groupId] = createEmptyGroupObj(groupDoc);
  }
  groups[groupDoc.groupId].rooms[channelId] = {
    name: 'genel',
    type: 'text',
    users: [],
    order: 0
  };
  if (store) store.setJSON(store.key('group', groupDoc.groupId), groups[groupDoc.groupId]);
  return channelId;
}

async function ensureUserDoc(doc) {
  if (doc && typeof doc.populate === 'function' &&
      (!Array.isArray(doc.groups) || !doc._id)) {
    doc = await doc.populate();
  }
  return doc;
}

async function loadGroupsFromDB({ Group, groups }) {
  try {
    let groupDocs = await Group.find({});
    if (groupDocs && typeof groupDocs.populate === 'function') {
      groupDocs = await groupDocs.populate('owner', 'username');
    }
    groupDocs.forEach(g => {
      const ownerName = g.owner ? g.owner.username : null;
      groups[g.groupId] = { owner: ownerName, name: g.name, users: [], rooms: {}, categories: {} };
      store.setJSON(store.key('group', g.groupId), groups[g.groupId]);
    });
    const groupKeys = Object.keys(groups);
    if (groupKeys.length === 0) {
      logger.warn('No groups found in MongoDB. Channels will not be available.');
    } else {
      logger.info('loadGroupsFromDB tamam, groups:', groupKeys);
    }
  } catch (err) {
    logger.error('loadGroupsFromDB hata:', err);
  }
}

async function loadChannelsFromDB({ Channel, groups }) {
  try {
    let channelDocs = await Channel.find({})
      .populate('group')
      .populate('category')
      .sort({ order: 1 });
    channelDocs.forEach(ch => {
      try {
        if (!ch.group || !ch.group.groupId) return;
        const gid = ch.group.groupId;
        if (!groups[gid]) {
          groups[gid] = createEmptyGroupObj(ch.group);
        }
        groups[gid].rooms[ch.channelId] = convertChannelDoc(ch);
        store.setJSON(store.key('group', gid), groups[gid]);
      } catch (e) {
        logger.error('loadChannelsFromDB channel error: %o', e);
      }
    });
    logger.info('loadChannelsFromDB tamam.');
    return channelDocs.length;
  } catch (err) {
    logger.error('loadChannelsFromDB hata: %o', err);
    return 0;
  }
}

async function loadCategoriesFromDB({ Category, groups }) {
  try {
    let categoryDocs = await Category.find({})
      .populate('group')
      .sort({ order: 1 });
    categoryDocs.forEach(cat => {
      try {
        if (!cat.group || !cat.group.groupId) return;
        const gid = cat.group.groupId;
        if (!groups[gid]) {
          groups[gid] = createEmptyGroupObj(cat.group);
        }
        if (!groups[gid].categories) groups[gid].categories = {};
        groups[gid].categories[cat.categoryId] = convertCategoryDoc(cat);
        store.setJSON(store.key('group', gid), groups[gid]);
      } catch (e) {
        logger.error('loadCategoriesFromDB category error: %o', e);
      }
    });
    logger.info('loadCategoriesFromDB tamam.');
    return categoryDocs.length;
  } catch (err) {
    logger.error('loadCategoriesFromDB hata: %o', err);
    return 0;
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
        let gm = null;
        if (GroupMember && typeof GroupMember.findOne === 'function') {
          gm = await GroupMember.findOne({ user: userDoc._id, group: g._id });
        }
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
    logger.error('sendGroupsListToUser hatası:', err);
  }
}

function normalizeSessions(entry) {
  if (!entry) return [];
  if (Array.isArray(entry)) return entry;
  if (entry instanceof Set) return Array.from(entry);
  return [entry];
}

async function sendGroupsListToUserSessions(io, username, context) {
  const { userSessions, User, users, GroupMember } = context;
  if (!userSessions || !username) return;
  const sessions = normalizeSessions(userSessions[username]);
  for (const sid of sessions) {
    await sendGroupsListToUser(io, sid, { User, users, GroupMember });
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
  const { groups, users, Group, User, GroupMember, Channel, Category, store } = context;
  if (!groups[groupId]) {
    logger.warn(`sendRoomsListToUser: unknown groupId ${groupId}`);
    return;
  }
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
      logger.error('sendRoomsListToUser error:', err);
    }
  }
  const groupObj = groups[groupId];
  if (Object.keys(groupObj.rooms).length === 0) {
    try {
      let gDoc = await Group.findOne({ groupId });
      if (gDoc && typeof gDoc.populate === 'function') {
        gDoc = await gDoc.populate('owner', 'username');
      }
      if (gDoc) {
        let chDocs = await Channel.find({ group: gDoc._id }).sort({ order: 1 });
        if (chDocs && typeof chDocs.populate === 'function') {
          chDocs = await chDocs.populate('group').populate('category');
        }
        chDocs.forEach(ch => {
          groupObj.rooms[ch.channelId] = convertChannelDoc(ch);
        });
        if (Object.keys(groupObj.rooms).length === 0) {
          await createDefaultChannel(gDoc, { Channel, groups, store });
        } else if (store) {
          store.setJSON(store.key('group', groupId), groupObj);
        }
      }
    } catch (err) {
      logger.error('sendRoomsListToUser reload error: %o', err);
    }
    if (Object.keys(groupObj.rooms).length === 0) {
      logger.warn(`sendRoomsListToUser: no channels for group ${groupId}`);
      io.to(socketId).emit('roomsList', [], { noChannels: true });
      return;
    }
  }
  if (Object.keys(groupObj.categories).length === 0) {
    try {
      let gDoc = await Group.findOne({ groupId });
      if (gDoc) {
        let catDocs = await Category.find({ group: gDoc._id }).sort({ order: 1 });
        if (catDocs && typeof catDocs.populate === 'function') {
          catDocs = await catDocs.populate('group');
        }
        catDocs.forEach(cat => {
          groupObj.categories[cat.categoryId] = convertCategoryDoc(cat);
        });
        if (store) store.setJSON(store.key('group', groupId), groupObj);
      }
    } catch (err) {
      logger.error('sendRoomsListToUser category reload error: %o', err);
    }
  }
  const items = [
    ...Object.entries(groupObj.categories || {}).map(([cid, cat]) => ({
      id: cid,
      name: cat.name,
      type: 'category',
      order: cat.order || 0
    })),
    ...Object.entries(groupObj.rooms || {}).map(([rid, rm]) => ({
      id: rid,
      name: rm.name,
      type: rm.type,
      categoryId: rm.categoryId || null,
      order: rm.order || 0,
      unreadCount: Number(channelUnreads[rid] || 0)
    }))
  ];
  items.sort((a,b)=>(a.order||0)-(b.order||0));
  io.to(socketId).emit('roomsList', items);
}

function broadcastRoomsListToGroup(io, groups, groupId) {
  if (!groups[groupId]?.rooms) {
    console.warn(`[broadcastRoomsListToGroup] rooms not found for groupId=${groupId}`);
    return;
  }
  const groupObj = groups[groupId];
  const items = [
    ...Object.entries(groupObj.categories || {}).map(([cid, cat]) => ({
      id: cid,
      name: cat.name,
      type: 'category',
      order: cat.order || 0
    })),
    ...Object.entries(groupObj.rooms || {}).map(([rid, rm]) => ({
      id: rid,
      name: rm.name,
      type: rm.type,
      categoryId: rm.categoryId || null,
      order: rm.order || 0,
      unreadCount: 0
    }))
  ];
  items.sort((a,b)=>(a.order||0)-(b.order||0));
  io.to(groupId).emit('roomsList', items);
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
    let groupDoc = await Group.findOne({ groupId });
    if (groupDoc && typeof groupDoc.populate === 'function') {
      groupDoc = await groupDoc.populate('users');
    }
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
    logger.error('broadcastGroupUsers hata:', err);
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
    logger.error('leaveGroup error:', err);
  }

  await sendGroupsListToUser(io, socket.id, { User, users, GroupMember });
  broadcastGroupUsers(io, groups, onlineUsernames, Group, groupId);
  if (store) store.setJSON(store.key('group', groupId), groups[groupId]);
}

function register(io, socket, context) {
  const { users, groups, User, Group, Channel, Category, onlineUsernames, GroupMember } = context;

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
      groups[groupId] = { owner: userName, name: trimmed, users: [{ id: socket.id, username: userName }], rooms: {}, categories: {} };
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

      logger.info(`Created group ${groupId} with channel ${channelId}`);

      await sendRoomsListToUser(io, socket.id, {
        groups,
        users,
        Group,
        User,
        GroupMember,
        Channel,
        Category,
        store: context.store
      }, groupId);
      broadcastRoomsListToGroup(io, groups, groupId);

      await sendGroupsListToUserSessions(io, userName, {
        userSessions: context.userSessions,
        User,
        users,
        GroupMember
      });
      broadcastGroupUsers(io, groups, onlineUsernames, Group, groupId);
    } catch (err) {
      logger.error('Create group error:', err);
      socket.emit('errorMessage', 'Grup oluşturulurken bir hata oluştu.');
    }
  });

  socket.on('joinGroup', async (groupId) => {
    try {
      if (!groups[groupId]) {
        socket.emit('errorMessage', 'Group not found');
        return;
      }
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
      await sendRoomsListToUser(io, socket.id, {
        groups, users, Group, User, GroupMember, Channel, Category,
        store: context.store
      }, groupId);
      await sendGroupsListToUser(io, socket.id, { User, users, GroupMember });
      broadcastAllChannelsData(io, users, groups, groupId);
      broadcastGroupUsers(io, groups, onlineUsernames, Group, groupId);
    } catch (err) {
      logger.error('joinGroup error:', err);
    }
  });

  socket.on('browseGroup', async (groupId) => {
    if (!groups[groupId]) return;
    await sendRoomsListToUser(io, socket.id, {
      groups, users, Group, User, GroupMember, Channel, Category,
      store: context.store
    }, groupId);
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
      logger.error('joinRoom error:', err);
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
      logger.error('moveUser error:', err);
    }
  });
  
  socket.on('leaveRoom', ({ groupId, roomId }) => {
    if (!groups[groupId] || !groups[groupId].rooms[roomId]) return;
    removeUserFromRoom(io, socket, users, groups, groupId, roomId);
  });

  socket.on('createChannel', async ({ groupId, name, type, categoryId }) => {
    try {
      if (!groupId || !name) return;
      const trimmed = name.trim();
      const groupDoc = await Group.findOne({ groupId });
      if (!groupDoc) return;
      const channelId = uuidv4();
      const order = getNextOrder(groups, groupId);
      const resolvedType = type === 'voice' ? 'voice' : 'text';
      let categoryDoc = null;
      if (categoryId) {
        categoryDoc = await Category.findOne({ categoryId });
      }
      const newChannel = new Channel({
        channelId,
        name: trimmed,
        group: groupDoc._id,
        type: resolvedType,
        order,
        category: categoryDoc ? categoryDoc._id : undefined
      });
      await newChannel.save();
      if (groups[groupId]) {
        groups[groupId].rooms[channelId] = { name: trimmed, type: resolvedType, users: [], order, categoryId: categoryId || null };
        io.to(groupId).emit('channelCreated', { id: channelId, name: trimmed, type: resolvedType, order });
        broadcastRoomsListToGroup(io, groups, groupId);
      }
    } catch (err) {
      logger.error('createChannel error:', err);
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
      logger.error('renameChannel error:', err);
    }
  });

  socket.on('reorderChannel', async ({ groupId, channelId, newIndex }) => {
    try {
      if (!groupId || !channelId || typeof newIndex !== 'number') return;
      const grp = groups[groupId];
      if (!grp || !grp.rooms[channelId]) return;

      const items = [
        ...Object.entries(grp.categories || {}).map(([id, c]) => ({ id, type: 'category', obj: c })),
        ...Object.entries(grp.rooms || {}).map(([id, r]) => ({ id, type: 'channel', obj: r }))
      ].sort((a, b) => (a.obj.order || 0) - (b.obj.order || 0));
      const oldIndex = items.findIndex(i => i.type === 'channel' && i.id === channelId);
      if (oldIndex === -1 || newIndex < 0 || newIndex >= items.length) return;
      const [moved] = items.splice(oldIndex, 1);
      items.splice(newIndex, 0, moved);
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        it.obj.order = i;
        if (it.type === 'category') {
          await Category.findOneAndUpdate({ categoryId: it.id }, { order: i });
        } else {
          await Channel.findOneAndUpdate({ channelId: it.id }, { order: i });
        }
      }
      grp.categories = {};
      grp.rooms = {};
      items.forEach(it => {
        if (it.type === 'category') grp.categories[it.id] = it.obj;
        else grp.rooms[it.id] = it.obj;
      });
      if (context.store) context.store.setJSON(context.store.key('group', groupId), grp);
      broadcastRoomsListToGroup(io, groups, groupId);
      broadcastAllChannelsData(io, users, groups, groupId);
    } catch (err) {
      logger.error('reorderChannel error:', err);
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
      logger.error('deleteChannel error:', err);
    }
  });

  socket.on('createCategory', async ({ groupId, name }) => {
    try {
      if (!groupId || !name) return;
      const trimmed = name.trim();
      const groupDoc = await Group.findOne({ groupId });
      if (!groupDoc) return;
      const categoryId = uuidv4();
      const order = getNextOrder(groups, groupId);
      await Category.create({ categoryId, name: trimmed, group: groupDoc._id, order });
      if (!groups[groupId]) groups[groupId] = createEmptyGroupObj(groupDoc);
      groups[groupId].categories[categoryId] = { name: trimmed, order };
      if (context.store) context.store.setJSON(context.store.key('group', groupId), groups[groupId]);
      broadcastRoomsListToGroup(io, groups, groupId);
    } catch (err) {
      logger.error('createCategory error:', err);
    }
  });

  socket.on('renameCategory', async ({ categoryId, newName }) => {
    try {
      if (!categoryId || !newName) return;
      const catDoc = await Category.findOneAndUpdate({ categoryId }, { name: newName.trim() });
      if (catDoc && typeof catDoc.populate === 'function') {
        await catDoc.populate('group');
      }
      if (!catDoc || !catDoc.group) return;
      const gid = catDoc.group.groupId;
      if (groups[gid] && groups[gid].categories[categoryId]) {
        groups[gid].categories[categoryId].name = newName.trim();
        if (context.store) context.store.setJSON(context.store.key('group', gid), groups[gid]);
        broadcastRoomsListToGroup(io, groups, gid);
      }
    } catch (err) {
      logger.error('renameCategory error:', err);
    }
  });

  socket.on('deleteCategory', async categoryId => {
    try {
      if (!categoryId) return;
      const catDoc = await Category.findOne({ categoryId });
      if (catDoc && typeof catDoc.populate === 'function') {
        await catDoc.populate('group');
      }
      if (!catDoc || !catDoc.group) return;
      const gid = catDoc.group.groupId;
      await Category.findOneAndDelete({ categoryId });
      if (groups[gid]) {
        delete groups[gid].categories[categoryId];
        Object.values(groups[gid].rooms).forEach(room => {
          if (room.categoryId === categoryId) room.categoryId = null;
        });
        if (context.store) context.store.setJSON(context.store.key('group', gid), groups[gid]);
        broadcastRoomsListToGroup(io, groups, gid);
      }
    } catch (err) {
      logger.error('deleteCategory error:', err);
    }
  });

  socket.on('reorderCategory', async ({ groupId, categoryId, newIndex }) => {
    try {
      if (!groupId || !categoryId || typeof newIndex !== 'number') return;
      const grp = groups[groupId];
      if (!grp || !grp.categories[categoryId]) return;
      const items = [
        ...Object.entries(grp.categories || {}).map(([id, c]) => ({ id, type: 'category', obj: c })),
        ...Object.entries(grp.rooms || {}).map(([id, r]) => ({ id, type: 'channel', obj: r }))
      ].sort((a,b)=>(a.obj.order||0)-(b.obj.order||0));
      const oldIndex = items.findIndex(i=>i.type==='category' && i.id===categoryId);
      if (oldIndex === -1 || newIndex < 0 || newIndex >= items.length) return;
      const [moved] = items.splice(oldIndex,1);
      items.splice(newIndex,0,moved);
      for (let i=0;i<items.length;i++) {
        const it = items[i];
        it.obj.order = i;
        if (it.type==='category') {
          await Category.findOneAndUpdate({ categoryId: it.id }, { order: i });
        } else {
          await Channel.findOneAndUpdate({ channelId: it.id }, { order: i });
        }
      }
      grp.categories = {};
      grp.rooms = {};
      items.forEach(it => { if(it.type==='category') grp.categories[it.id]=it.obj; else grp.rooms[it.id]=it.obj; });
      const orderMap = Object.fromEntries(Object.entries(grp.categories).map(([cid,cat])=>[cid,cat.order]));
      const username = users[socket.id]?.username;
      if (username) {
        const [userDoc, groupDoc] = await Promise.all([
          User.findOne({ username }),
          Group.findOne({ groupId })
        ]);
        if (userDoc && groupDoc) {
          await GroupMember.updateOne(
            { user: userDoc._id, group: groupDoc._id },
            { $set: { categoryOrder: orderMap } },
            { upsert: true }
          );
          Object.entries(users).forEach(([sid, u]) => {
            if (u.username === username) {
              io.to(sid).emit(CATEGORY_ORDER_UPDATED, { groupId, order: orderMap });
            }
          });
        }
      }
      if (context.store) context.store.setJSON(context.store.key('group', groupId), grp);
      broadcastRoomsListToGroup(io, groups, groupId);
    } catch (err) {
      logger.error('reorderCategory error:', err);
    }
  });

  socket.on('assignChannelCategory', async ({ groupId, channelId, categoryId }) => {
    try {
      if (!groupId || !channelId) return;
      const grp = groups[groupId];
      if (!grp || !grp.rooms[channelId]) return;
      let catDoc = null;
      if (categoryId) {
        catDoc = await Category.findOne({ categoryId });
        if (!catDoc) return;
      }
      if (catDoc) {
        await Channel.findOneAndUpdate({ channelId }, { category: catDoc._id });
      } else {
        await Channel.findOneAndUpdate({ channelId }, { $unset: { category: '' } });
      }
      grp.rooms[channelId].categoryId = categoryId || null;
      if (context.store) context.store.setJSON(context.store.key('group', groupId), grp);
      broadcastRoomsListToGroup(io, groups, groupId);
    } catch (err) {
      logger.error('assignChannelCategory error:', err);
    }
  });

  socket.on('setCategoryCollapsed', async ({ groupId, categoryId, collapsed }) => {
    try {
      if (!groupId || !categoryId || typeof collapsed !== 'boolean') return;
      const username = users[socket.id]?.username;
      if (!username) return;
      const [userDoc, groupDoc] = await Promise.all([
        User.findOne({ username }),
        Group.findOne({ groupId })
      ]);
      if (!userDoc || !groupDoc) return;
      const field = `collapsedCategories.${categoryId}`;
      await GroupMember.updateOne(
        { user: userDoc._id, group: groupDoc._id },
        { $set: { [field]: collapsed } },
        { upsert: true }
      );
      Object.entries(users).forEach(([sid, u]) => {
        if (u.username === username) {
          io.to(sid).emit(CATEGORY_COLLAPSE_UPDATED, { groupId, categoryId, collapsed });
        }
      });
    } catch (err) {
      logger.error('setCategoryCollapsed error:', err);
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
      logger.error('markGroupRead error:', err);
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
      const ms = Number(duration);
      let expire = null;
      if (ms === -1) {
        expire = INDEFINITE_TS;
      } else if (ms > 0) {
        expire = new Date(Date.now() + ms);
      }
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
      Object.entries(users).forEach(([sid, u]) => {
        if (u.username === username) {
          io.to(sid).emit(ev, payload);
        }
      });
    } catch (err) {
      logger.error('muteGroup error:', err);
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
      const ms = Number(duration);
      let expire = null;
      if (ms === -1) {
        expire = INDEFINITE_TS;
      } else if (ms > 0) {
        expire = new Date(Date.now() + ms);
      }
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
      Object.entries(users).forEach(([sid, u]) => {
        if (u.username === username) {
          io.to(sid).emit(ev, payload);
        }
      });
    } catch (err) {
      logger.error('muteChannel error:', err);
    }
  });

  socket.on('muteCategory', async ({ groupId, categoryId, duration }) => {
    try {
      if (!groupId || !categoryId) return;
      const username = users[socket.id]?.username;
      if (!username) return;
      const [userDoc, groupDoc, categoryDoc] = await Promise.all([
        User.findOne({ username }),
        Group.findOne({ groupId }),
        Category.findOne({ categoryId })
      ]);
      if (!userDoc || !groupDoc || !categoryDoc) return;
      const ms = Number(duration);
      let expire = null;
      if (ms === -1) {
        expire = INDEFINITE_TS;
      } else if (ms > 0) {
        expire = new Date(Date.now() + ms);
      }
      const field = `categoryMuteUntil.${categoryId}`;
      const update = expire ? { $set: { [field]: expire } } : { $unset: { [field]: '' } };
      await GroupMember.updateOne(
        { user: userDoc._id, group: groupDoc._id },
        update,
        { upsert: true }
      );
      const ev = expire ? 'categoryMuted' : 'muteCleared';
      const payload = expire ? { groupId, categoryId, muteUntil: expire } : { groupId, categoryId };
      Object.entries(users).forEach(([sid, u]) => {
        if (u.username === username) {
          io.to(sid).emit(ev, payload);
        }
      });
    } catch (err) {
      logger.error('muteCategory error:', err);
    }
  });

  socket.on('setGroupNotifyType', async ({ groupId, type }) => {
    try {
      if (!groupId || !['all', 'mentions', 'nothing'].includes(type)) return;
      const username = users[socket.id]?.username;
      if (!username) return;
      const [userDoc, groupDoc] = await Promise.all([
        User.findOne({ username }),
        Group.findOne({ groupId })
      ]);
      if (!userDoc || !groupDoc) return;
      await GroupMember.updateOne(
        { user: userDoc._id, group: groupDoc._id },
        { $set: { notificationType: type } },
        { upsert: true }
      );
      Object.entries(users).forEach(([sid, u]) => {
        if (u.username === username) {
          io.to(sid).emit(GROUP_NOTIFY_UPDATED, { groupId, type });
        }
      });
    } catch (err) {
      logger.error('setGroupNotifyType error:', err);
    }
  });

  socket.on('setChannelNotifyType', async ({ groupId, channelId, type }) => {
    try {
      if (!groupId || !channelId || !['all', 'mentions', 'nothing'].includes(type)) return;
      const username = users[socket.id]?.username;
      if (!username) return;
      const [userDoc, groupDoc, channelDoc] = await Promise.all([
        User.findOne({ username }),
        Group.findOne({ groupId }),
        Channel.findOne({ channelId })
      ]);
      if (!userDoc || !groupDoc || !channelDoc) return;
      const field = `channelNotificationType.${channelId}`;
      await GroupMember.updateOne(
        { user: userDoc._id, group: groupDoc._id },
        { $set: { [field]: type } },
        { upsert: true }
      );
      Object.entries(users).forEach(([sid, u]) => {
        if (u.username === username) {
          io.to(sid).emit(CHANNEL_NOTIFY_UPDATED, { groupId, channelId, type });
        }
      });
    } catch (err) {
      logger.error('setChannelNotifyType error:', err);
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
  loadCategoriesFromDB,
  sendGroupsListToUser,
  broadcastAllChannelsData,
  broadcastGroupUsers,
  handleLeaveGroup,
  removeUserFromAllGroupsAndRooms,
  handleDisconnect,
  sendGroupsListToUserSessions,
  INDEFINITE_TS,
  GROUP_NOTIFY_UPDATED,
  CHANNEL_NOTIFY_UPDATED,
  CATEGORY_COLLAPSE_UPDATED,
  CATEGORY_ORDER_UPDATED
};
