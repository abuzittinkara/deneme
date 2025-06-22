async function emitChannelUnread(io, groupId, channelId, Group, userSessions, GroupMember, users) {
  try {
    const groupDoc = await Group.findOne({ groupId }).populate('users', 'username');
    if (!groupDoc) return;
    const updates = [];
    for (const u of groupDoc.users) {
      const sid = userSessions[u.username];
      const inGroup = sid && users[sid]?.currentGroup === groupId;
      const inChannel = sid && users[sid]?.currentTextChannel === channelId;

      const gm = await GroupMember.findOne({ user: u._id, group: groupDoc._id })
        .select('muteUntil channelMuteUntil');
      const now = Date.now();
      const groupMuteUntil = gm?.muteUntil instanceof Date ? gm.muteUntil.getTime() : 0;
      let channelMuteUntil;
      if (gm?.channelMuteUntil) {
        if (typeof gm.channelMuteUntil.get === 'function') {
          channelMuteUntil = gm.channelMuteUntil.get(channelId);
        } else {
          channelMuteUntil = gm.channelMuteUntil[channelId];
        }
      }
      const channelMuteTs = channelMuteUntil instanceof Date ? channelMuteUntil.getTime() : 0;
      const muteActive = groupMuteUntil > now || channelMuteTs > now;
      if (muteActive) continue;

      const inc = {};
      if (!inGroup) inc.unread = 1;
      if (!inChannel) inc[`channelUnreads.${channelId}`] = 1;
      if (Object.keys(inc).length > 0) {
        updates.push(
          GroupMember.updateOne(
            { user: u._id, group: groupDoc._id },
            { $inc: inc },
            { upsert: true }
          )
        );
      }
      if (sid) {
        io.to(sid).emit('channelUnread', { groupId, channelId });
      }
    }
    if (updates.length) await Promise.all(updates);
  } catch (err) {
    console.error('emitChannelUnread error:', err);
  }
}

module.exports = emitChannelUnread;