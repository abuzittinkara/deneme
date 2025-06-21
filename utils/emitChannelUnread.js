async function emitChannelUnread(io, groupId, channelId, Group, userSessions) {
  try {
    const groupDoc = await Group.findOne({ groupId }).populate('users', 'username');
    if (!groupDoc) return;
    groupDoc.users.forEach(u => {
      const sid = userSessions[u.username];
      if (sid) {
        io.to(sid).emit('channelUnread', { groupId, channelId });
      }
    });
  } catch (err) {
    console.error('emitChannelUnread error:', err);
  }
}

module.exports = emitChannelUnread;