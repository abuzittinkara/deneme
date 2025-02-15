/**************************************
 * textChat.js
 * Sunucuda yazılı sohbet (text chat) ile ilgili kodlar
 **************************************/
const Message = require('./models/Message');
const Channel = require('./models/Channel');
const User = require('./models/User');
const Group = require('./models/Group'); // Grup modelini ekledik

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
      console.log("joinTextChannel event received with groupId:", groupId, "roomId:", roomId);
      
      // İlgili grup var mı kontrol edelim
      const groupDoc = await Group.findOne({ groupId });
      if (!groupDoc) {
        console.error("joinTextChannel: Group not found for groupId:", groupId);
        socket.emit('textHistory', []);
        return;
      }
      
      // Kanalı, hem channelId hem de grup ilişkisini dikkate alarak sorguluyoruz.
      const channelDoc = await Channel.findOne({ channelId: roomId, group: groupDoc._id });
      if (!channelDoc) {
        console.error("joinTextChannel: Channel not found for roomId:", roomId, "in group:", groupDoc._id);
        socket.emit('textHistory', []);
        return;
      }
      
      console.log("joinTextChannel: Found channel:", channelDoc);
      
      // Socket'i o kanala (room) dahil et
      socket.join(roomId);
      
      // DB'den eski mesajları zaman sırasına göre çek
      const messages = await Message.find({ channel: channelDoc._id })
        .sort({ timestamp: 1 })
        .populate('user')
        .lean();
      
      console.log("joinTextChannel: Retrieved messages count:", messages.length);
      
      // Sadece bu kanala yeni giren kullanıcıya eski mesajları gönder
      socket.emit('textHistory', messages);
      
    } catch (err) {
      console.error("joinTextChannel error:", err);
      socket.emit('textHistory', []);
    }
  });
  
  /**
   * 2) Yeni metin mesajı geldiğinde DB'ye kaydetme ve aynı kanaldakilere yayma
   */
  socket.on('textMessage', async ({ groupId, roomId, message, username }) => {
    try {
      // O kanal gerçekten var mı?
      const channelDoc = await Channel.findOne({ channelId: roomId });
      if (!channelDoc) {
        console.error("textMessage: Channel not found for roomId:", roomId);
        return;
      }
  
      // Mesajı atan kullanıcı var mı?
      const userDoc = await User.findOne({ username: username });
      if (!userDoc) {
        console.error("textMessage: User not found for username:", username);
        return;
      }
  
      // DB'ye kaydet
      const newMsg = new Message({
        channel: channelDoc._id,
        user: userDoc._id,
        content: message,
        timestamp: new Date()
      });
      await newMsg.save();
  
      console.log("textMessage: New message saved for channel:", roomId);
  
      // Aynı kanaldaki diğer kullanıcılara mesajı gönder
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
