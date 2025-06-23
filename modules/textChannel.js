/**************************************
 * modules/textChannel.js
 **************************************/
const DOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');
const purify = DOMPurify(new JSDOM('').window);
const emitChannelUnread = require('../utils/emitChannelUnread');
const emitMentionUnread = require('../utils/emitMentionUnread');

module.exports = function registerTextChannelEvents(io, socket, { Channel, Message, User, users, Group, userSessions, GroupMember }) {
  // Kullanıcının bir metin kanalına katılma ve mesaj geçmişini alma
  socket.on('joinTextChannel', async ({ groupId, roomId }) => {
    try {
      const channelDoc = await Channel.findOne({ channelId: roomId });
      if (!channelDoc) {
        return;
      }
      socket.join(roomId);
      if (users[socket.id]) {
        users[socket.id].currentTextChannel = roomId;
      }
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
      const mentionRegex = /@([A-Za-z0-9_]+)/g;
      const mentions = [];
      let m;
      while ((m = mentionRegex.exec(clean))) {
        const uname = m[1];
        if (uname && uname !== username && !mentions.includes(uname)) {
          mentions.push(uname);
        }
      }
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
      await emitChannelUnread(io, groupId, roomId, Group, userSessions, GroupMember, users);
      await Promise.all(
        mentions.map(u =>
          emitMentionUnread(io, groupId, roomId, u, Group, userSessions, GroupMember, users)
        )
      );
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
  socket.on('markChannelRead', async ({ groupId, channelId }) => {
    try {
      if (!groupId || !channelId) return;
      const username = users[socket.id]?.username;
      if (!username) return;
      const [userDoc, groupDoc] = await Promise.all([
        User.findOne({ username }),
        Group.findOne({ groupId })
      ]);
      if (!userDoc || !groupDoc) return;

      const update = {};
      update[`channelUnreads.${channelId}`] = 0;
      await GroupMember.updateOne(
        { user: userDoc._id, group: groupDoc._id },
        { $set: update },
        { upsert: true }
      );

      const gm = await GroupMember.findOne({ user: userDoc._id, group: groupDoc._id });
      const values = gm && gm.channelUnreads
        ? (typeof gm.channelUnreads.values === 'function'
            ? Array.from(gm.channelUnreads.values())
            : Object.values(gm.channelUnreads))
        : [];
      const total = values.reduce((a, b) => a + (Number(b) || 0), 0);
      const target = userSessions[username] || socket.id;
      if (total === 0) {
        await GroupMember.updateOne(
          { user: userDoc._id, group: groupDoc._id },
          { $set: { unread: 0 } }
        );
        io.to(target).emit('groupUnreadReset', { groupId });
      }

      io.to(target).emit('channelRead', { groupId, channelId });
    } catch (err) {
      console.error('markChannelRead error:', err);
    }
  });
};