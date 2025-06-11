/**************************************
 * modules/friendRequests.js
 **************************************/
module.exports = function registerFriendRequestEvents(socket, { User, friendRequests, users, onlineUsernames, logger }) {
  socket.on('sendFriendRequest', (data, callback) => {
    const fromUsername = users[socket.id]?.username;
    try {
      if (!fromUsername) {
        logger.warn('Send friend request failed (gönderen kullanıcı adı tanımsız)');
        return callback({ success: false, message: 'Kullanıcı adı tanımlı değil.' });
      }
      const targetUsername = data.to;
      if (!targetUsername) {
        logger.warn('Send friend request failed (hedef kullanıcı adı yok)');
        return callback({ success: false, message: 'Hedef kullanıcı adı belirtilmedi.' });
      }
      if (!friendRequests[targetUsername]) {
        friendRequests[targetUsername] = [];
      }
      const exists = friendRequests[targetUsername].some(req => req.from === fromUsername);
      if (exists) {
        logger.warn('Send friend request failed (istek zaten var): %s -> %s', fromUsername, targetUsername);
        return callback({ success: false, message: 'Zaten arkadaşlık isteği gönderildi.' });
      }
      friendRequests[targetUsername].push({ from: fromUsername, timestamp: new Date() });
      callback({ success: true });
      logger.info('Friend request sent: %s -> %s', fromUsername, targetUsername);
    } catch (err) {
      logger.error('Send friend request error: %o', err);
      callback({ success: false, message: 'Arkadaşlık isteği gönderilirken bir hata oluştu.' });
    }
  });

  socket.on('getPendingFriendRequests', (data, callback) => {
    const username = users[socket.id]?.username;
    if (!username) {
      return callback({ success: false, message: 'Kullanıcı adı tanımlı değil.' });
    }
    const requests = friendRequests[username] || [];
    callback({ success: true, requests });
  });

  socket.on('getOutgoingFriendRequests', (data, callback) => {
    try {
      const username = users[socket.id]?.username;
      if (!username) {
        return callback({ success: false, message: 'Kullanıcı adı tanımlı değil.' });
      }
      const outgoing = [];
      for (const target in friendRequests) {
        friendRequests[target].forEach(req => {
          if (req.from === username) {
            outgoing.push({ to: target, timestamp: req.timestamp });
          }
        });
      }
      callback({ success: true, requests: outgoing });
    } catch (err) {
      console.error("getOutgoingFriendRequests error:", err);
      callback({ success: false, message: 'Gönderilen istekler alınırken hata oluştu.' });
    }
  });

  socket.on('acceptFriendRequest', async (data, callback) => {
    try {
      const username = users[socket.id]?.username;
      if (!username) {
        logger.warn('Accept friend request failed (kullanıcı adı tanımsız)');
        return callback({ success: false, message: 'Kullanıcı adı tanımlı değil.' });
      }
      const fromUsername = data.from;
      if (!fromUsername) {
        logger.warn('Accept friend request failed (istek gönderen kullanıcı adı yok)');
        return callback({ success: false, message: 'Kimin isteği kabul edileceği belirtilmedi.' });
      }
      
      // Remove pending friend request in memory
      if (friendRequests[username]) {
        friendRequests[username] = friendRequests[username].filter(req => req.from !== fromUsername);
      }
      
      // Get both user documents from DB
      const userDoc = await User.findOne({ username });
      const friendDoc = await User.findOne({ username: fromUsername });
      if (!userDoc || !friendDoc) {
        logger.warn('Accept friend request failed (kullanıcılar DB\'de yok): %s, %s', username, fromUsername);
        return callback({ success: false, message: 'Kullanıcılar bulunamadı.' });
      }
      
      // Check if friend already added, if not, add them
      if (!userDoc.friends.includes(friendDoc._id)) {
        userDoc.friends.push(friendDoc._id);
      }
      if (!friendDoc.friends.includes(userDoc._id)) {
        friendDoc.friends.push(userDoc._id);
      }
      
      await userDoc.save();
      await friendDoc.save();
      
      callback({ success: true });
      logger.info('Friend request accepted: %s <- %s', username, fromUsername);
    } catch (err) {
      logger.error("acceptFriendRequest error: %o", err);
      callback({ success: false, message: 'Arkadaşlık isteği kabul edilirken hata oluştu.' });
    }
  });

  socket.on('rejectFriendRequest', (data, callback) => {
    const username = users[socket.id]?.username;
    try {
      if (!username) {
        logger.warn('Reject friend request failed (kullanıcı adı tanımsız)');
        return callback({ success: false, message: 'Kullanıcı adı tanımlı değil.' });
      }
      const fromUsername = data.from;
      if (!fromUsername) {
        logger.warn('Reject friend request failed (istek gönderen kullanıcı adı yok)');
        return callback({ success: false, message: 'Kimin isteği reddedileceği belirtilmedi.' });
      }
      if (friendRequests[username]) {
        friendRequests[username] = friendRequests[username].filter(req => req.from !== fromUsername);
      }
      callback({ success: true });
      logger.info('Friend request rejected: %s <- %s', username, fromUsername);
    } catch (err) {
      logger.error('Reject friend request error: %o', err);
      callback({ success: false, message: 'Arkadaşlık isteği reddedilirken bir hata oluştu.' });
    }
  });

  socket.on('cancelFriendRequest', (data, callback) => {
    const fromUsername = users[socket.id]?.username;
    try {
      if (!fromUsername) {
        logger.warn('Cancel friend request failed (gönderen kullanıcı adı tanımsız)');
        return callback({ success: false, message: 'Kullanıcı adı tanımlı değil.' });
      }
      const targetUsername = data.to;
      if (!targetUsername) {
        logger.warn('Cancel friend request failed (hedef kullanıcı adı yok)');
        return callback({ success: false, message: 'Hedef kullanıcı adı belirtilmedi.' });
      }
      if (friendRequests[targetUsername]) {
        friendRequests[targetUsername] = friendRequests[targetUsername].filter(req => req.from !== fromUsername);
      }
      callback({ success: true });
      logger.info('Friend request cancelled: %s -> %s', fromUsername, targetUsername);
    } catch (err) {
      logger.error('Cancel friend request error: %o', err);
      callback({ success: false, message: 'Arkadaşlık isteği iptal edilirken bir hata oluştu.' });
    }
  });

  socket.on('removeFriend', async (data, callback) => {
    const username = users[socket.id]?.username;
    try {
      if (!username) {
        logger.warn('Remove friend failed (kullanıcı adı tanımsız)');
        return callback({ success: false, message: 'Kullanıcı adı tanımlı değil.' });
      }
      const friendUsername = data.friendUsername;
      if (!friendUsername) {
        logger.warn('Remove friend failed (arkadaş kullanıcı adı yok)');
        return callback({ success: false, message: 'Arkadaş kullanıcı adı belirtilmedi.' });
      }
      const userDoc = await User.findOne({ username });
      const friendDoc = await User.findOne({ username: friendUsername });
      if (!userDoc || !friendDoc) {
        logger.warn('Remove friend failed (kullanıcılar DB\'de yok): %s, %s', username, friendUsername);
        return callback({ success: false, message: 'Kullanıcılar bulunamadı.' });
      }
      userDoc.friends = userDoc.friends.filter(friendId => friendId.toString() !== friendDoc._id.toString());
      friendDoc.friends = friendDoc.friends.filter(friendId => friendId.toString() !== userDoc._id.toString());
      await userDoc.save();
      await friendDoc.save();
      callback({ success: true });
      logger.info('Friend removed: %s <-> %s', username, friendUsername);
    } catch (err) {
      logger.error('Remove friend error: %o', err);
      callback({ success: false, message: 'Arkadaş silinirken bir hata oluştu.' });
    }
  });

  socket.on('blockUser', async (data, callback) => {
    const username = users[socket.id]?.username;
    try {
      if (!username) {
        logger.warn('Block user failed (kullanıcı adı tanımsız)');
        return callback({ success: false, message: 'Kullanıcı adı tanımlı değil.' });
      }
      const targetUsername = data.targetUsername;
      if (!targetUsername) {
        logger.warn('Block user failed (hedef kullanıcı adı yok)');
        return callback({ success: false, message: 'Hedef kullanıcı adı belirtilmedi.' });
      }
      const userDoc = await User.findOne({ username });
      const targetDoc = await User.findOne({ username: targetUsername });
      if (!userDoc || !targetDoc) {
        logger.warn('Block user failed (kullanıcılar DB\'de yok): %s, %s', username, targetUsername);
        return callback({ success: false, message: 'Kullanıcılar bulunamadı.' });
      }
      if (!userDoc.blockedUsers.includes(targetDoc._id)) {
        userDoc.blockedUsers.push(targetDoc._id);
        await userDoc.save();
      }
      callback({ success: true });
      logger.info('User blocked: %s -> %s', username, targetUsername);
    } catch (err) {
      logger.error('Block user error: %o', err);
      callback({ success: false, message: 'Kullanıcı engellenirken bir hata oluştu.' });
    }
  });

  socket.on('unblockUser', async (data, callback) => {
    const username = users[socket.id]?.username;
    try {
      if (!username) {
        logger.warn('Unblock user failed (kullanıcı adı tanımsız)');
        return callback({ success: false, message: 'Kullanıcı adı tanımlı değil.' });
      }
      const targetUsername = data.targetUsername;
      if (!targetUsername) {
        logger.warn('Unblock user failed (hedef kullanıcı adı yok)');
        return callback({ success: false, message: 'Hedef kullanıcı adı belirtilmedi.' });
      }
      const userDoc = await User.findOne({ username });
      const targetDoc = await User.findOne({ username: targetUsername });
      if (!userDoc || !targetDoc) {
        logger.warn('Unblock user failed (kullanıcılar DB\'de yok): %s, %s', username, targetUsername);
        return callback({ success: false, message: 'Kullanıcılar bulunamadı.' });
      }
      userDoc.blockedUsers = userDoc.blockedUsers.filter(userId => userId.toString() !== targetDoc._id.toString());
      await userDoc.save();
      callback({ success: true });
      logger.info('User unblocked: %s -> %s', username, targetUsername);
    } catch (err) {
      logger.error('Unblock user error: %o', err);
      callback({ success: false, message: 'Kullanıcı engeli kaldırılırken bir hata oluştu.' });
    }
  });

  socket.on('getFriendsList', async (data, callback) => {
    const username = users[socket.id]?.username;
    try {
      if (!username) {
        logger.warn('Get friends list failed (kullanıcı adı tanımsız)');
        return callback({ success: false, message: 'Kullanıcı adı tanımlı değil.' });
      }
      const userDoc = await User.findOne({ username }).populate('friends');
      if (!userDoc) {
        logger.warn('Get friends list failed (kullanıcı DB\'de yok): %s', username);
        return callback({ success: false, message: 'Kullanıcı bulunamadı.' });
      }
      const friends = userDoc.friends.map(friend => ({
        username: friend.username,
        isOnline: onlineUsernames.has(friend.username) 
      }));
      callback({ success: true, friends });
    } catch (err) {
      logger.error('Get friends list error: %o', err);
      callback({ success: false, message: 'Arkadaş listesi alınırken bir hata oluştu.' });
    }
  });

  socket.on('getBlockedUsersList', async (data, callback) => {
    const username = users[socket.id]?.username;
    try {
      if (!username) {
        logger.warn('Get blocked users list failed (kullanıcı adı tanımsız)');
        return callback({ success: false, message: 'Kullanıcı adı tanımlı değil.' });
      }
      const userDoc = await User.findOne({ username }).populate('blockedUsers');
      if (!userDoc) {
        logger.warn('Get blocked users list failed (kullanıcı DB\'de yok): %s', username);
        return callback({ success: false, message: 'Kullanıcı bulunamadı.' });
      }
      const blockedUsers = userDoc.blockedUsers.map(user => ({
        username: user.username
      }));
      callback({ success: true, blockedUsers });
    } catch (err) {
      logger.error('Get blocked users list error: %o', err);
      callback({ success: false, message: 'Engellenen kullanıcı listesi alınırken bir hata oluştu.' });
    }
  });

};
