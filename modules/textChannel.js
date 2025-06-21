/**************************************
 * modules/textChannel.js
 **************************************/
const DOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');
const purify = DOMPurify(new JSDOM('').window);

module.exports = function registerTextChannelEvents(io, socket, { Channel, Message, User, users }) {
  // Kullanıcının bir metin kanalına katılma ve mesaj geçmişini alma
  socket.on('joinTextChannel', async ({ groupId, roomId }) => {
    try {
      const channelDoc = await Channel.findOne({ channelId: roomId });
      if (!channelDoc) {
        return;
      }
      socket.join(roomId);
      const messages = await Message.find({ channel: channelDoc._id })
                                    .sort({ timestamp: 1 })
                                    .populate('user')
                                    .lean();
      socket.emit('textHistory', messages);
    } catch (err) {
      console.error("joinTextChannel error:", err);
    }
  });

  // Gelen metin mesajlarını işleme ve diğer kullanıcılara iletme
  socket.on('textMessage', async ({ groupId, roomId, message, username, attachments = [] }) => {
    try {
      const channelDoc = await Channel.findOne({ channelId: roomId });
      if (!channelDoc) {
        return;
      }
      const userDoc = await User.findOne({ username: username });
      if (!userDoc) {
        return;
      }
      if (!Array.isArray(attachments) ||
          !attachments.every(a => a && typeof a === 'object' &&
            Object.prototype.hasOwnProperty.call(a, 'id') &&
            Object.prototype.hasOwnProperty.call(a, 'url') &&
            Object.prototype.hasOwnProperty.call(a, 'type'))) {
        console.warn('textMessage ignored due to invalid attachments');
        return;
      }      
      
      const clean = purify.sanitize(message, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
      const newMsg = new Message({
        channel: channelDoc._id,
        user: userDoc._id,
        content: clean,
        attachments,
        timestamp: new Date()
      });
      await newMsg.save();
      
      const messageData = {
        channelId: roomId,
        message: {
          id: newMsg._id.toString(),
          content: newMsg.content,
          username: username,
          timestamp: newMsg.timestamp,
          attachments: newMsg.attachments
        }
      };

      // Gönderici hariç tüm kullanıcılara ve aynı zamanda göndericiye de mesajı gönderiyoruz.
      socket.broadcast.to(roomId).emit('newTextMessage', messageData);
      socket.emit('newTextMessage', messageData);
      io.to(groupId).emit('channelUnread', { groupId, channelId: roomId });
    } catch (err) {
      console.error("textMessage error:", err);
    }
  });

  // Kullanıcının yazmaya başladığını diğer kullanıcılara bildir
  socket.on('typing', ({ username, channel }) => {
    if (!channel || !username) return;
    socket.broadcast.to(channel).emit('typing', { username, channel });
  });

  // Kullanıcının yazmayı bıraktığını diğer kullanıcılara bildir
  socket.on('stop typing', ({ username, channel }) => {
    if (!channel || !username) return;
    socket.broadcast.to(channel).emit('stop typing', { username, channel });
  });
  
  socket.on('deleteTextMessage', async ({ channelId, messageId }) => {
    try {
      if (!messageId) return;
      const msg = await Message.findById(messageId).populate('user');
      const username = users[socket.id]?.username;
      if (!msg || !username || msg.user.username !== username) return;
      await Message.deleteOne({ _id: messageId });
      io.to(channelId).emit('textMessageDeleted', { channelId, messageId });
    } catch (err) {
      console.error('deleteTextMessage error:', err);
    }
  });
};
