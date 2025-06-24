const getEntries = map => {
  if (!map) return [];
  if (typeof map.entries === 'function') return Array.from(map.entries());
  return Object.entries(map);
};

async function collectNotifyInfo(username, { User, Group, GroupMember }) {
  const result = {};
  try {
    const userDoc = await User.findOne({ username }).populate('groups');
    if (!userDoc) return result;
    await Promise.all(userDoc.groups.map(async g => {
      const gm = await GroupMember.findOne({ user: userDoc._id, group: g._id })
        .select('notificationType channelNotificationType');
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
