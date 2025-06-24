const test = require('node:test');
const assert = require('assert');
const { EventEmitter } = require('events');

const groupController = require('../controllers/groupController');

function createContext() {
  const io = {
    emitted: [],
    to(id) {
      return {
        emit: (ev, p) => this.emitted.push({ id, ev, p })
      };
    }
  };

  const socket1 = new EventEmitter();
  socket1.id = 's1';
  const socket2 = new EventEmitter();
  socket2.id = 's2';

  const users = { s1: { username: 'u1' }, s2: { username: 'u1' } };
  const groups = {};

  const userDoc = { _id: 'uid1', username: 'u1' };
  const groupDoc = { _id: 'gid1', groupId: 'g1', users: [{ _id: 'uid1', username: 'u1' }] };
  const channelDoc = { _id: 'cid1', channelId: 'ch1', group: groupDoc };

  const User = { findOne: async q => (q.username === 'u1' ? userDoc : null) };
  const Group = { findOne: async q => (q.groupId === 'g1' ? groupDoc : null) };
  const Channel = { findOne: async q => (q.channelId === 'ch1' ? channelDoc : null) };
  const updates = [];
  const GroupMember = { updateOne: async (f, u) => { updates.push(u); } };

  const context = { users, groups, User, Group, Channel, GroupMember, onlineUsernames: new Set() };

  return { io, socket1, socket2, context, updates };
}

test('setGroupNotifyType emits to all sessions and updates doc', async () => {
  const { io, socket1, socket2, context, updates } = createContext();
  groupController.register(io, socket1, context);
  groupController.register(io, socket2, context);
  const handler = socket1.listeners('setGroupNotifyType')[0];

  await handler({ groupId: 'g1', type: 'mentions' });
  assert.deepStrictEqual(updates[0], { $set: { notificationType: 'mentions' } });
  const ids = io.emitted.filter(e => e.ev === 'groupNotifyTypeUpdated').map(e => e.id);
  assert.ok(ids.includes('s1'));
  assert.ok(ids.includes('s2'));
});

test('setChannelNotifyType emits to all sessions and updates doc', async () => {
  const { io, socket1, socket2, context, updates } = createContext();
  groupController.register(io, socket1, context);
  groupController.register(io, socket2, context);
  const handler = socket1.listeners('setChannelNotifyType')[0];

  await handler({ groupId: 'g1', channelId: 'ch1', type: 'nothing' });
  assert.deepStrictEqual(updates[0], { $set: { 'channelNotificationType.ch1': 'nothing' } });
  const ids = io.emitted.filter(e => e.ev === 'channelNotifyTypeUpdated').map(e => e.id);
  assert.ok(ids.includes('s1'));
  assert.ok(ids.includes('s2'));
});
