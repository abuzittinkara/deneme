/**************************************
 * modules/dmChat.js
 **************************************/
module.exports = function registerDMChatEvents(socket, { io, User, DMMessage, users, logger }) {
  socket.on('sendDM', async (data, callback) => {
    const fromUsername = users[socket.id]?.username;
    try {
      if (!fromUsername) {
        logger.warn('Send DM failed (g\xF6nderen kullan\x131c\x131 adi tan\x131ms\x131z)');
        return callback({ success: false, message: 'Kullan\x131c\x131 adi tan\x131ml\x131 de\x11f\x131l.' });
      }
      const { toUsername, content } = data;
      if (!toUsername || !content) {
        logger.warn('Send DM failed (eksik parametre): from %s to %s', fromUsername, toUsername);
        return callback({ success: false, message: 'Eksik parametre.' });
      }
      const fromUserDoc = await User.findOne({ username: fromUsername });
      const toUserDoc = await User.findOne({ username: toUsername });
      if (!fromUserDoc || !toUserDoc) {
        logger.warn("Send DM failed (kullan\x131c\x131lar DB'de yok): from %s to %s", fromUsername, toUsername);
        return callback({ success: false, message: 'Kullan\x131c\x131lar bulunamad\x131.' });
      }
      if (toUserDoc.blockedUsers.includes(fromUserDoc._id)) {
        logger.warn('Send DM failed (g\xF6nderen engellenmi\x15f): from %s to %s', fromUsername, toUsername);
        return callback({ success: false, message: 'Bu kullan\x131c\x131ya mesaj g\xF6nderemezsiniz.' });
      }
      const dmMessage = new DMMessage({
        from: fromUserDoc._id,
        to: toUserDoc._id,
        content: content
      });
      await dmMessage.save();
      Object.keys(users).forEach(socketId => {
        if (users[socketId].username === toUsername) {
          io.to(socketId).emit('receiveDM', {
            from: fromUsername,
            content: content,
            timestamp: dmMessage.timestamp
          });
        }
      });
      callback({ success: true, timestamp: dmMessage.timestamp });
      logger.info('DM sent: %s -> %s', fromUsername, toUsername);
    } catch (err) {
      logger.error('Send DM error: %o', err);
      callback({ success: false, message: 'DM g\xF6nderilirken bir hata olu\x15ftu.' });
    }
  });

  socket.on('getDMMessages', async (data, callback) => {
    const username = users[socket.id]?.username;
    try {
      if (!username) {
        logger.warn('Get DM messages failed (kullan\x131c\x131 adi tan\x131ms\x131z)');
        return callback({ success: false, message: 'Kullan\x131c\x131 adi tan\x131ml\x131 de\x11f\x131l.' });
      }
      const otherUsername = data.otherUsername;
      if (!otherUsername) {
        logger.warn('Get DM messages failed (di\x11f\x131r kullan\x131c\x131 adi yok): %s', username);
        return callback({ success: false, message: 'Di\x11f\x131r kullan\x131c\x131 adi belirtilmedi.' });
      }
      const userDoc = await User.findOne({ username });
      const otherUserDoc = await User.findOne({ username: otherUsername });
      if (!userDoc || !otherUserDoc) {
        logger.warn("Get DM messages failed (kullan\x131c\x131lar DB'de yok): %s, %s", username, otherUsername);
        return callback({ success: false, message: 'Kullan\x131c\x131lar bulunamad\x131.' });
      }
      const messages = await DMMessage.find({
        $or: [
          { from: userDoc._id, to: otherUserDoc._id },
          { from: otherUserDoc._id, to: userDoc._id }
        ]
      }).sort({ timestamp: 1 }).populate('from', 'username');

      callback({ success: true, messages: messages.map(m => ({
        from: m.from.username,
        content: m.content,
        timestamp: m.timestamp
      }))});
    } catch (err) {
      logger.error('Get DM messages error: %o', err);
      callback({ success: false, message: 'DM mesajlar\x131 al\x131n\x131rken bir hata olu\x15ftu.' });
    }
  });
};