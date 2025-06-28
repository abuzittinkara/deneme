const logger = require('./logger');
const getEntries = map => {
  if (!map) return [];
  if (typeof map.entries === 'function') return Array.from(map.entries());
  return Object.entries(map);
};

async function collectCategoryPrefs(username, { User, Group, GroupMember }) {
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
        gmQuery = gmQuery.select('categoryOrder collapsedCategories');
      }
      let gm = await gmQuery;
      if (gm && typeof gm.select === 'function') {
        gm = gm.select('categoryOrder collapsedCategories');
      }
      if (!gm) return;
      const orderEntries = getEntries(gm.categoryOrder)
        .filter(([, v]) => typeof v === 'number');
      const collapseEntries = getEntries(gm.collapsedCategories)
        .filter(([, v]) => typeof v === 'boolean');
      result[g.groupId] = {
        categoryOrder: Object.fromEntries(orderEntries),
        collapsedCategories: Object.fromEntries(collapseEntries)
      };
    }));
  } catch (err) {
    logger.error('collectCategoryPrefs error:', err);
  }
  return result;
}

module.exports = collectCategoryPrefs;
