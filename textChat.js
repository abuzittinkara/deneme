/**************************************
 * textChat.js
 * Sunucuda yazılı sohbet (text chat) ile ilgili kodlar
 **************************************/
const Message = require('./models/Message');
const Channel = require('./models/Channel');
const User = require('./models/User');

/**
 * Socket.IO tarafında sadece yazılı sohbet (text chat) ile ilgili
 * eventleri dinleyip yönetmek için bu fonksiyonu kullanacağız.
 */
function initTextChatHandlers(io, socket) {
  /**
   * 1) Metin kanalına (text channel) katılma ve eski mesajları çekme
   */
  socket.on('joinTextChannel', async ({ groupId, roomId }) => {
    try {
      // O kanal gerçekten var mı?
      const channelDoc = await Channel.findOne({ channelId: roomId });
      if (!channelDoc) return;

      // Socket'i o kanala (room) dahil et
      socket.join(roomId);

      // DB'den eski mesajları zaman sırasına göre çek
      const messages = await Message.find({ channel: channelDoc._id })
        .sort({ timestamp: 1 })
        .populate('user')
        .lean();

      // Sadece bu kanala yeni giren kullanıcıya eski mesajları gönder
      socket.emit('textHistory', messages);

    } catch (err) {
      console.error("joinTextChannel error:", err);
    }
  });

  /**
   * 2) Yeni metin mesajı geldiğinde DB'ye kaydetme ve aynı kanaldakilere yayma
   */
  socket.on('textMessage', async ({ groupId, roomId, message, username }) => {
    try {
      // O kanal gerçekten var mı?
      const channelDoc = await Channel.findOne({ channelId: roomId });
      if (!channelDoc) return;

      // Mesajı atan kullanıcı var mı?
      const userDoc = await User.findOne({ username: username });
      if (!userDoc) return;

      // DB'ye kaydet
      const newMsg = new Message({
        channel: channelDoc._id,
        user: userDoc._id,
        content: message,
        timestamp: new Date()
      });
      await newMsg.save();

      // Aynı kanaldaki diğer kullanıcılara mesajı gönder
      // (mesajı gönderen kişiye tekrar yollamaya gerek yok)
      socket.broadcast.to(roomId).emit('newTextMessage', {
        channelId: roomId,
        message: {
          content: newMsg.content,
          username: username,
          timestamp: newMsg.timestamp
        }
      });
    } catch (err) {
      console.error("textMessage error:", err);
    }
  });
}

module.exports = { initTextChatHandlers };