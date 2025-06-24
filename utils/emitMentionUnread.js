async function emitMentionUnread(io, groupId, channelId, username, Group, userSessions, GroupMember, users) {
  try {
    const groupDoc = await Group.findOne({ groupId }).populate('users', 'username');
    if (!groupDoc) return;
    const target = groupDoc.users.find(u => u.username === username);
    if (!target) return;
    const sid = userSessions[username];
    const inGroup = sid && users[sid]?.currentGroup === groupId;
    const inChannel = sid && users[sid]?.currentTextChannel === channelId;
    const gm = await GroupMember.findOne({ user: target._id, group: groupDoc._id })
      .select('muteUntil channelMuteUntil mentionUnreads');
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
    if (inChannel) return;

    await GroupMember.updateOne(
      { user: target._id, group: groupDoc._id },
      { $inc: { [`mentionUnreads.${channelId}`]: 1 } },
      { upsert: true }
    );

    if (sid) {
      io.to(sid).emit('mentionUnread', { groupId, channelId });
    }
  } catch (err) {
    console.error('emitMentionUnread error:', err);
  }
}

module.exports = emitMentionUnread;

