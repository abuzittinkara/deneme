const getEntries = map => {
  if (!map) return [];
  if (typeof map.entries === 'function') return Array.from(map.entries());
  return Object.entries(map);
};

async function collectMuteInfo(username, { User, Group, GroupMember }) {
  const result = {};
  try {
    let userDoc = await User.findOne({ username });
    if (userDoc && typeof userDoc.populate === 'function') {
      userDoc = await userDoc.populate('groups');
    }
    if (!userDoc) return result;
    const now = Date.now();
    await Promise.all(userDoc.groups.map(async g => {
      let gmQuery = GroupMember.findOne({ user: userDoc._id, group: g._id });
      if (gmQuery && typeof gmQuery.select === 'function') {
        gmQuery = gmQuery.select('muteUntil channelMuteUntil categoryMuteUntil');
      }
      let gm = await gmQuery;
      if (gm && typeof gm.select === 'function') {
        gm = gm.select('muteUntil channelMuteUntil categoryMuteUntil');
      }
      if (!gm) return;
      const groupMuteTs = gm.muteUntil instanceof Date ? gm.muteUntil.getTime() : 0;
      const channelMuteEntries = getEntries(gm.channelMuteUntil)
        .filter(([, ts]) => ts instanceof Date && ts.getTime() > now);
      const categoryMuteEntries = getEntries(gm.categoryMuteUntil)
        .filter(([, ts]) => ts instanceof Date && ts.getTime() > now);
      const activeChan = Object.fromEntries(channelMuteEntries);
      const activeCat = Object.fromEntries(categoryMuteEntries);
      if (groupMuteTs > now || channelMuteEntries.length > 0 || categoryMuteEntries.length > 0) {
        const entry = {};
        if (groupMuteTs > now) entry.muteUntil = gm.muteUntil;
        if (channelMuteEntries.length > 0) entry.channelMuteUntil = activeChan;
        if (categoryMuteEntries.length > 0) entry.categoryMuteUntil = activeCat;
        result[g.groupId] = entry;
      }
    }));
  } catch (err) {
    console.error('collectMuteInfo error:', err);
  }
  return result;
}

module.exports = collectMuteInfo;
