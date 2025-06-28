const logger = require('./logger');
async function emitChannelUnread(io, groupId, channelId, Group, Channel, userSessions, GroupMember, users, mentions = []) {
  try {
    let groupDoc = await Group.findOne({ groupId });
    if (groupDoc && typeof groupDoc.populate === 'function') {
      groupDoc = await groupDoc.populate('users', 'username');
    }
    if (!groupDoc) return;
    let channelDoc = await Channel.findOne({ channelId });
    if (channelDoc && typeof channelDoc.populate === 'function') {
      channelDoc = await channelDoc.populate('category');
    }
    const updates = [];
    for (const u of groupDoc.users) {
      const sid = userSessions[u.username];
      const inGroup = sid && users[sid]?.currentGroup === groupId;
      const inChannel = sid && users[sid]?.currentTextChannel === channelId;

      let gmQuery = GroupMember.findOne({ user: u._id, group: groupDoc._id });
      if (gmQuery && typeof gmQuery.select === 'function') {
        gmQuery = gmQuery.select('muteUntil channelMuteUntil categoryMuteUntil notificationType channelNotificationType');
      }
      let gm = await gmQuery;
      if (gm && typeof gm.select === 'function') {
        gm = gm.select('muteUntil channelMuteUntil categoryMuteUntil notificationType channelNotificationType');
      }
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
      let categoryMuteUntil;
      const catId = channelDoc && channelDoc.category ? channelDoc.category.categoryId : null;
      if (catId && gm?.categoryMuteUntil) {
        categoryMuteUntil = typeof gm.categoryMuteUntil.get === 'function'
          ? gm.categoryMuteUntil.get(catId)
          : gm.categoryMuteUntil[catId];
      }
      const catMuteTs = categoryMuteUntil instanceof Date ? categoryMuteUntil.getTime() : 0;
      const muteActive = groupMuteUntil > now || channelMuteTs > now || catMuteTs > now;
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
      let notifyType = 'all';
      if (gm) {
        let chType;
        if (gm.channelNotificationType) {
          chType = typeof gm.channelNotificationType.get === 'function'
            ? gm.channelNotificationType.get(channelId)
            : gm.channelNotificationType[channelId];
        }
        notifyType = chType || gm.notificationType || 'all';
      }

      const shouldEmit =
        notifyType === 'all' || (notifyType === 'mentions' && mentions.includes(u.username));

      if (sid && shouldEmit) {
        io.to(sid).emit('channelUnread', { groupId, channelId });
      }
    }
    if (updates.length) await Promise.all(updates);
  } catch (err) {
    logger.error('emitChannelUnread error:', err);
  }
}

module.exports = emitChannelUnread;
