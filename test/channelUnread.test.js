const test = require('node:test');
const assert = require('assert');
const emitChannelUnread = require('../utils/emitChannelUnread');

function createContext(opts = {}) {
  const groupDoc = {
    _id: 'gid1',
    groupId: 'g1',
    users: [{ _id: 'uid1', username: 'u1' }]
  };
  const Group = {
    findOne: async (q) => (q.groupId === 'g1' ? { populate: async () => groupDoc } : null)
  };
  const Channel = { findOne: async () => ({ _id: 'cid2', channelId: 'ch2', category: null }) };
  const updates = [];
  const GroupMember = {
    updateOne: async (q, upd) => { updates.push(upd); },
    async findOne() {
      const doc = {
        muteUntil: opts.muteUntil,
        channelMuteUntil: new Map(Object.entries(opts.channelMuteUntil || {})),
        notificationType: undefined,
        channelNotificationType: undefined
      };
      return { select() { return doc; } };
    }
  };
  const userSessions = { u1: 's1' };
  const users = { s1: { currentGroup: 'g1', currentTextChannel: 'ch1' } };
  const io = { emitted: [], to: () => ({ emit(ev, p) { io.emitted.push({ ev, p }) } }) };
  return { io, Group, Channel, GroupMember, userSessions, users, updates };
}

test('emitChannelUnread increments per channel when not viewing channel', async () => {
  const { io, Group, Channel, GroupMember, userSessions, users, updates } = createContext();
  await emitChannelUnread(io, 'g1', 'ch2', Group, Channel, userSessions, GroupMember, users);
  assert.strictEqual(updates.length, 1);
  assert.strictEqual(updates[0].$inc['channelUnreads.ch2'], 1);
});

test('emitChannelUnread ignores group when group mute active', async () => {
  const muteUntil = new Date(Date.now() + 1000);
  const { io, Group, Channel, GroupMember, userSessions, users, updates } = createContext({ muteUntil });
  await emitChannelUnread(io, 'g1', 'ch2', Group, Channel, userSessions, GroupMember, users);
  assert.strictEqual(updates.length, 0);
  assert.strictEqual(io.emitted.length, 0);
});

test('emitChannelUnread ignores channel when channel mute active', async () => {
  const muteUntil = new Date(Date.now() + 1000);
  const { io, Group, Channel, GroupMember, userSessions, users, updates } = createContext({ channelMuteUntil: { ch2: muteUntil } });
  await emitChannelUnread(io, 'g1', 'ch2', Group, Channel, userSessions, GroupMember, users);
  assert.strictEqual(updates.length, 0);
  assert.strictEqual(io.emitted.length, 0);
});
