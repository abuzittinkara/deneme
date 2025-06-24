const getEntries = map => {
  if (!map) return [];
  if (typeof map.entries === 'function') return Array.from(map.entries());
  return Object.entries(map);
};

async function collectNotifyInfo(username, { User, Group, GroupMember }) {
  const result = {};
  try {
    let userDoc = await User.findOne({ username });
    if (userDoc && typeof userDoc.populate === 'function') {
      userDoc = await userDoc.populate('groups');
    }
    if (!userDoc) return result;
    await Promise.all(userDoc.groups.map(async g => {
      let gmQuery = GroupMember.findOne({ user: userDoc._id, group: g._id });
      if (gmQuery && typeof gmQuery.select === 'function') {
        gmQuery = gmQuery.select('notificationType channelNotificationType');
      }
      let gm = await gmQuery;
      if (gm && typeof gm.select === 'function') {
        gm = gm.select('notificationType channelNotificationType');
      }
      if (!gm) return;
      const channelEntries = getEntries(gm.channelNotificationType)
        .filter(([, val]) => typeof val === 'string');
      result[g.groupId] = {
        notificationType: gm.notificationType,
        channelNotificationType: Object.fromEntries(channelEntries)
      };
    }));
  } catch (err) {
    console.error('collectNotifyInfo error:', err);
  }
  return result;
}

module.exports = collectNotifyInfo;
