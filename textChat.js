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
      console.log("[joinTextChannel] Gelen groupId:", groupId, "roomId:", roomId);
      
      // İlgili grubun varlığını kontrol ediyoruz
      const groupDoc = await Group.findOne({ groupId });
      if (!groupDoc) {
        console.error("[joinTextChannel] Group not found for groupId:", groupId);
        socket.emit('textHistory', []);
        return;
      }
      console.log("[joinTextChannel] Bulunan grup ObjectId:", groupDoc._id);
      
      // Kanalı, hem channelId hem de grup ilişkisini dikkate alarak sorguluyoruz
      const channelDoc = await Channel.findOne({ channelId: roomId, group: groupDoc._id });
      if (!channelDoc) {
        console.error("[joinTextChannel] Channel not found for roomId:", roomId, "in group:", groupDoc._id);
        socket.emit('textHistory', []);
        return;
      }
      console.log("[joinTextChannel] Kanal bulundu:", channelDoc);
      
      // Socket'i ilgili kanala (room) dahil ediyoruz
      socket.join(roomId);
      
      // DB'den mesaj geçmişini zaman sırasına göre çekiyoruz
      const messages = await Message.find({ channel: channelDoc._id })
        .sort({ timestamp: 1 })
        .populate('user')
        .lean();
      
      console.log("[joinTextChannel] DB'den çekilen mesaj sayısı:", messages.length);
      
      // Mesaj geçmişini sadece bu kanala yeni giren kullanıcıya gönderiyoruz
      socket.emit('textHistory', messages);
      
    } catch (err) {
      console.error("[joinTextChannel] Hata:", err);
      socket.emit('textHistory', []);
    }
  });
  
  /**
   * 2) Yeni metin mesajı geldiğinde DB'ye kaydetme ve aynı kanaldakilere yayma
   */
  socket.on('textMessage', async ({ groupId, roomId, message, username }) => {
    try {
      console.log("[textMessage] Gelen data:", { groupId, roomId, message, username });
      
      // İlgili grubun varlığını kontrol ediyoruz
      const groupDoc = await Group.findOne({ groupId });
      if (!groupDoc) {
        console.error("[textMessage] Group not found for groupId:", groupId);
        return;
      }
      
      // Kanalı, grup bilgisi ile birlikte sorguluyoruz
      const channelDoc = await Channel.findOne({ channelId: roomId, group: groupDoc._id });
      if (!channelDoc) {
        console.error("[textMessage] Channel not found for roomId:", roomId, "in group:", groupDoc._id);
        return;
      }
      
      // Mesajı gönderen kullanıcıyı sorguluyoruz
      const userDoc = await User.findOne({ username });
      if (!userDoc) {
        console.error("[textMessage] User not found for username:", username);
        return;
      }
      
      // Mesajı veritabanına kaydediyoruz
      const newMsg = new Message({
        channel: channelDoc._id,
        user: userDoc._id,
        content: message,
        timestamp: new Date()
      });
      await newMsg.save();
      console.log("[textMessage] Yeni mesaj kaydedildi. Kanal:", roomId);
      
      // Aynı kanaldaki diğer kullanıcılara mesajı yayınlıyoruz
      socket.broadcast.to(roomId).emit('newTextMessage', {
        channelId: roomId,
        message: {
          content: newMsg.content,
          username: username,
          timestamp: newMsg.timestamp
        }
      });
      
    } catch (err) {
      console.error("[textMessage] Hata:", err);
    }
  });
}

module.exports = { initTextChatHandlers };
