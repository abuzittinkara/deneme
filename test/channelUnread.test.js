const test = require('node:test');
const assert = require('assert');
const emitChannelUnread = require('../utils/emitChannelUnread');

function createContext() {
  const groupDoc = {
    _id: 'gid1',
    groupId: 'g1',
    users: [{ _id: 'uid1', username: 'u1' }]
  };
  const Group = {
    findOne: async (q) => (q.groupId === 'g1' ? { populate: async () => groupDoc } : null)
  };
  const updates = [];
  const GroupMember = {
    updateOne: async (q, upd) => { updates.push(upd); }
  };
  const userSessions = { u1: 's1' };
  const users = { s1: { currentGroup: 'g1', currentTextChannel: 'ch1' } };
  const io = { to: () => ({ emit() {} }) };
  return { io, Group, GroupMember, userSessions, users, updates };
}

test('emitChannelUnread increments per channel when not viewing channel', async () => {
  const { io, Group, GroupMember, userSessions, users, updates } = createContext();
  await emitChannelUnread(io, 'g1', 'ch2', Group, userSessions, GroupMember, users);
  assert.strictEqual(updates.length, 1);
  assert.strictEqual(updates[0].$inc['channelUnreads.ch2'], 1);
});