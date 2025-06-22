async function emitChannelUnread(io, groupId, channelId, Group, userSessions, GroupMember, users) {
  try {
    const groupDoc = await Group.findOne({ groupId }).populate('users', 'username');
    if (!groupDoc) return;
    const updates = [];
    groupDoc.users.forEach(u => {
      const sid = userSessions[u.username];
      const viewing = sid && users[sid]?.currentGroup === groupId;
      if (!viewing) {
        updates.push(
          GroupMember.updateOne(
            { user: u._id, group: groupDoc._id },
            { $inc: { unread: 1 } },
            { upsert: true }
          )
        );
      }
      if (sid) {
        io.to(sid).emit('channelUnread', { groupId, channelId });
      }
    });
    if (updates.length) await Promise.all(updates);
  } catch (err) {
    console.error('emitChannelUnread error:', err);
  }
}

module.exports = emitChannelUnread;