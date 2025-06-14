/**************************************
 * modules/dmChat.js
 **************************************/
const DOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');
const purify = DOMPurify(new JSDOM('').window);

module.exports = function registerDMChatEvents(socket, { io, User, DMMessage, users, logger }) {
  function getRoomName(u1, u2) {
    return `dm::${[u1, u2].sort().join('::')}`;
  }

  socket.on('joinDM', async ({ friend }, callback = () => {}) => {
    const username = users[socket.id]?.username;
    try {
      if (!username || !friend) {
        logger.warn('joinDM failed: %s -> %s', username, friend);
        return callback({ success: false });
      }
      socket.join(getRoomName(username, friend));
      callback({ success: true });
    } catch (err) {
      logger.error('joinDM error: %o', err);
      callback({ success: false });
    }
  });

  socket.on('getDMMessages', async ({ friend }, callback) => {
    const username = users[socket.id]?.username;
    try {
      if (!username || !friend) {
        logger.warn('getDMMessages failed: %s -> %s', username, friend);
        return callback({ success: false, message: 'Eksik parametre.' });
      }
      const userDoc = await User.findOne({ username });
      const friendDoc = await User.findOne({ username: friend });
      if (!userDoc || !friendDoc) {
        logger.warn("getDMMessages failed (users not found): %s, %s", username, friend);
        return callback({ success: false, message: 'Kullanıcılar bulunamadı.' });
      }
      const messages = await DMMessage.find({
        $or: [
          { from: userDoc._id, to: friendDoc._id },
          { from: friendDoc._id, to: userDoc._id }
        ]
      }).sort({ timestamp: 1 }).populate('from', 'username');

      const formatted = messages.map(m => ({
        username: m.from.username,
        content: m.content,
        timestamp: m.timestamp
      }));
      callback({ success: true, messages: formatted });
    } catch (err) {
      logger.error('getDMMessages error: %o', err);
      callback({ success: false, message: 'DM mesajları alınırken bir hata oluştu.' });
    }
  });

  socket.on('dmMessage', async ({ friend, content }, callback) => {
    const fromUsername = users[socket.id]?.username;
    try {
      if (!fromUsername || !friend || !content) {
        logger.warn('dmMessage failed: from %s to %s', fromUsername, friend);
        return callback({ success: false, message: 'Eksik parametre.' });
      }
      const fromUserDoc = await User.findOne({ username: fromUsername });
      const toUserDoc = await User.findOne({ username: friend });
      if (!fromUserDoc || !toUserDoc) {
        logger.warn('dmMessage failed (users not found): from %s to %s', fromUsername, friend);
        return callback({ success: false, message: 'Kullanıcılar bulunamadı.' });
      }
      if (toUserDoc.blockedUsers.includes(fromUserDoc._id)) {
        logger.warn('dmMessage failed (blocked): from %s to %s', fromUsername, friend);
        return callback({ success: false, message: 'Bu kullanıcıya mesaj gönderemezsiniz.' });
      }
      const clean = purify.sanitize(content, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
      const dmMessage = new DMMessage({
        from: fromUserDoc._id,
        to: toUserDoc._id,
        content: clean
      });
      await dmMessage.save();
      const messageObj = {
        username: fromUsername,
        content: clean,
        timestamp: dmMessage.timestamp
      };
      socket.emit('newDMMessage', { friend, message: messageObj });
      Object.keys(users).forEach(socketId => {
        if (users[socketId].username === friend) {
          io.to(socketId).emit('newDMMessage', { friend: fromUsername, message: messageObj });
        }
      });
      callback({ success: true });
      logger.info('DM sent: %s -> %s', fromUsername, friend);
    } catch (err) {
      logger.error('dmMessage error: %o', err);
      callback({ success: false, message: 'DM gönderilirken bir hata oluştu.' });
    }
  });
};