const test = require('node:test');
const assert = require('assert');

const collectMuteInfo = require('../utils/collectMuteInfo');

function query(doc) {
  return { populate: async () => doc };
}

test('collectMuteInfo filters out expired entries', async () => {
  const now = Date.now();
  const userDoc = { _id: 'u1id', groups: [{ _id: 'g1id', groupId: 'g1' }] };
  const User = { findOne: async q => q.username === 'u1' ? query(userDoc) : query(null) };
  const Group = {};
  const gm = { muteUntil: new Date(now - 1000), channelMuteUntil: new Map([['c1', new Date(now - 1000)]]) };
  const GroupMember = { findOne: async () => gm };
  const res = await collectMuteInfo('u1', { User, Group, GroupMember });
  assert.deepStrictEqual(res, {});
});
