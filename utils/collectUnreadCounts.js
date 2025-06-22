const getEntries = map => {
  if (!map) return [];
  if (typeof map.entries === 'function') return Array.from(map.entries());
  return Object.entries(map);
};

async function collectUnreadCounts(username, { User, Group, GroupMember }) {
  const result = {};
  try {
    const userDoc = await User.findOne({ username }).populate('groups');
    if (!userDoc) return result;
    await Promise.all(userDoc.groups.map(async g => {
      const gm = await GroupMember.findOne({ user: userDoc._id, group: g._id });
      if (!gm || !gm.channelUnreads) return;
      const entries = getEntries(gm.channelUnreads)
        .filter(([, count]) => Number(count) > 0);
      if (entries.length) {
        result[g.groupId] = Object.fromEntries(entries);
      }
    }));
  } catch (err) {
    console.error('collectUnreadCounts error:', err);
  }
  return result;
}

module.exports = collectUnreadCounts;