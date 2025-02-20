/**************************************
 * modules/textChannel.js
 **************************************/
module.exports = function registerTextChannelEvents(socket, { Channel, Message, User }) {
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
  socket.on('textMessage', async ({ groupId, roomId, message, username }) => {
    try {
      const channelDoc = await Channel.findOne({ channelId: roomId });
      if (!channelDoc) {
        return;
      }
      const userDoc = await User.findOne({ username: username });
      if (!userDoc) {
        return;
      }
      const newMsg = new Message({
        channel: channelDoc._id,
        user: userDoc._id,
        content: message,
        timestamp: new Date()
      });
      await newMsg.save();
      
      const messageData = {
        channelId: roomId,
        message: {
          content: newMsg.content,
          username: username,
          timestamp: newMsg.timestamp
        }
      };

      // Gönderici hariç tüm kullanıcılara ve aynı zamanda göndericiye de mesajı gönderiyoruz.
      socket.broadcast.to(roomId).emit('newTextMessage', messageData);
      socket.emit('newTextMessage', messageData);
    } catch (err) {
      console.error("textMessage error:", err);
    }
  });
};
