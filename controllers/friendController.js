// Friend request and messaging handlers
function registerFriendHandlers(io, socket, context) {
  const { users, onlineUsernames, friendRequests, User, DMMessage, store } = context;

  socket.on('sendFriendRequest', (data, callback) => {
    const fromUsername = users[socket.id]?.username;
    try {
      if (!fromUsername) return callback({ success: false, message: 'Kullanıcı adı tanımlı değil.' });
      const targetUsername = data.to;
      if (!targetUsername) return callback({ success: false, message: 'Hedef kullanıcı adı belirtilmedi.' });
      if (!friendRequests[targetUsername]) friendRequests[targetUsername] = [];
      const exists = friendRequests[targetUsername].some(req => req.from === fromUsername);
      if (exists) return callback({ success: false, message: 'Zaten arkadaşlık isteği gönderildi.' });
      friendRequests[targetUsername].push({ from: fromUsername, timestamp: new Date() });
      if (store) store.setJSON(store.key('friendreq', targetUsername), friendRequests[targetUsername]);
      callback({ success: true });
    } catch (err) {
      callback({ success: false, message: 'Arkadaşlık isteği gönderilirken bir hata oluştu.' });
    }
  });

  socket.on('getPendingFriendRequests', async (data, callback) => {
    const username = users[socket.id]?.username;
    if (!username) return callback({ success: false, message: 'Kullanıcı adı tanımlı değil.' });
    let requests = friendRequests[username];
    if (!requests && store) requests = await store.getJSON(store.key('friendreq', username));
    requests = requests || [];
    friendRequests[username] = requests;
    callback({ success: true, requests });
  });

  socket.on('acceptFriendRequest', async (data, callback) => {
    try {
      const username = users[socket.id]?.username;
      if (!username) return callback({ success: false, message: 'Kullanıcı adı tanımlı değil.' });
      const fromUsername = data.from;
      if (!fromUsername) return callback({ success: false, message: 'Kimin isteği kabul edileceği belirtilmedi.' });
      if (friendRequests[username]) {
        friendRequests[username] = friendRequests[username].filter(req => req.from !== fromUsername);
        if (store) store.setJSON(store.key('friendreq', username), friendRequests[username]);
      }
      const userDoc = await User.findOne({ username });
      const friendDoc = await User.findOne({ username: fromUsername });
      if (!userDoc || !friendDoc) return callback({ success: false, message: 'Kullanıcılar bulunamadı.' });
      if (!userDoc.friends.includes(friendDoc._id)) userDoc.friends.push(friendDoc._id);
      if (!friendDoc.friends.includes(userDoc._id)) friendDoc.friends.push(userDoc._id);
      await userDoc.save();
      await friendDoc.save();
      callback({ success: true });
      // Notify both users that their friend list changed
      Object.keys(users).forEach(socketId => {
        const u = users[socketId].username;
        if (u === username || u === fromUsername) {
          io.to(socketId).emit('friendListUpdated');
        }
      });
    } catch (err) {
      callback({ success: false, message: 'Arkadaşlık isteği kabul edilirken hata oluştu.' });
    }
  });

  socket.on('removeFriend', async (data, callback) => {
    const username = users[socket.id]?.username;
    try {
      if (!username) return callback({ success: false, message: 'Kullanıcı adı tanımlı değil.' });
      const friendUsername = data.friendUsername;
      if (!friendUsername) return callback({ success: false, message: 'Arkadaş kullanıcı adı belirtilmedi.' });
      const userDoc = await User.findOne({ username });
      const friendDoc = await User.findOne({ username: friendUsername });
      if (!userDoc || !friendDoc) return callback({ success: false, message: 'Kullanıcılar bulunamadı.' });
      userDoc.friends = userDoc.friends.filter(id => id.toString() !== friendDoc._id.toString());
      friendDoc.friends = friendDoc.friends.filter(id => id.toString() !== userDoc._id.toString());
      await userDoc.save();
      await friendDoc.save();
      callback({ success: true });
      // Inform both users about updated friend list
      Object.keys(users).forEach(socketId => {
        const u = users[socketId].username;
        if (u === username || u === friendUsername) {
          io.to(socketId).emit('friendListUpdated');
        }
      });
    } catch (err) {
      callback({ success: false, message: 'Arkadaş silinirken bir hata oluştu.' });
    }
  });

  socket.on('getFriendsList', async (data, callback) => {
    const username = users[socket.id]?.username;
    try {
      if (!username) return callback({ success: false, message: 'Kullanıcı adı tanımlı değil.' });
      const userDoc = await User.findOne({ username }).populate('friends');
      if (!userDoc) return callback({ success: false, message: 'Kullanıcı bulunamadı.' });
      const friends = userDoc.friends.map(fr => ({
        username: fr.username,
        online: onlineUsernames.has(fr.username)
      }));
      callback({ success: true, friends });
    } catch (err) {
      callback({ success: false, message: 'Arkadaş listesi alınırken bir hata oluştu.' });
    }
  });

  socket.on('sendDM', async (data, callback) => {
    const fromUsername = users[socket.id]?.username;
    try {
      if (!fromUsername) return callback({ success: false, message: 'Kullanıcı adı tanımlı değil.' });
      const { toUsername, content } = data;
      if (!toUsername || !content) return callback({ success: false, message: 'Eksik parametre.' });
      const fromUserDoc = await User.findOne({ username: fromUsername });
      const toUserDoc = await User.findOne({ username: toUsername });
      if (!fromUserDoc || !toUserDoc) return callback({ success: false, message: 'Kullanıcılar bulunamadı.' });
      if (toUserDoc.blockedUsers.includes(fromUserDoc._id)) return callback({ success: false, message: 'Bu kullanıcıya mesaj gönderemezsiniz.' });
      const dmMessage = new DMMessage({ from: fromUserDoc._id, to: toUserDoc._id, content });
      await dmMessage.save();
      Object.keys(users).forEach(socketId => {
        if (users[socketId].username === toUsername) {
          io.to(socketId).emit('receiveDM', { from: fromUsername, content, timestamp: dmMessage.timestamp });
        }
      });
      callback({ success: true, timestamp: dmMessage.timestamp });
    } catch (err) {
      callback({ success: false, message: 'DM gönderilirken bir hata oluştu.' });
    }
  });
}

module.exports = registerFriendHandlers;
