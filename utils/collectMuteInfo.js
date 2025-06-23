const getEntries = map => {
  if (!map) return [];
  if (typeof map.entries === 'function') return Array.from(map.entries());
  return Object.entries(map);
};

async function collectMuteInfo(username, { User, Group, GroupMember }) {
  const result = {};
  try {
    const userDoc = await User.findOne({ username }).populate('groups');
    if (!userDoc) return result;
    const now = Date.now();
    await Promise.all(userDoc.groups.map(async g => {
      const gm = await GroupMember.findOne({ user: userDoc._id, group: g._id })
        .select('muteUntil channelMuteUntil');
      if (!gm) return;
      const groupMuteTs = gm.muteUntil instanceof Date ? gm.muteUntil.getTime() : 0;
      const channelMuteEntries = getEntries(gm.channelMuteUntil)
        .filter(([, ts]) => ts instanceof Date && ts.getTime() > now);
      const activeChan = Object.fromEntries(channelMuteEntries);
      if (groupMuteTs > now || channelMuteEntries.length > 0) {
        const entry = {};
        if (groupMuteTs > now) entry.muteUntil = gm.muteUntil;
        if (channelMuteEntries.length > 0) entry.channelMuteUntil = activeChan;
        result[g.groupId] = entry;
      }
    }));
  } catch (err) {
    console.error('collectMuteInfo error:', err);
  }
  return result;
}

module.exports = collectMuteInfo;
