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
  const GroupMember = { updateOne: async () => {}, findOne: async () => ({}) };

  const context = { users, groups, User, Group, Channel, GroupMember, onlineUsernames: new Set() };

  return { io, socket1, socket2, context };
}

test('muteGroup emits to all sessions of user', async () => {
  const { io, socket1, socket2, context } = createContext();
  groupController.register(io, socket1, context);
  groupController.register(io, socket2, context);
  const handler = socket1.listeners('muteGroup')[0];

  await handler({ groupId: 'g1', duration: 1000 });
  const ids = io.emitted.filter(e => e.ev === 'groupMuted').map(e => e.id);
  assert.ok(ids.includes('s1')); 
  assert.ok(ids.includes('s2')); 
});

test('muteChannel emits to all sessions of user', async () => {
  const { io, socket1, socket2, context } = createContext();
  groupController.register(io, socket1, context);
  groupController.register(io, socket2, context);
  const handler = socket1.listeners('muteChannel')[0];

  await handler({ groupId: 'g1', channelId: 'ch1', duration: 1000 });
  const ids = io.emitted.filter(e => e.ev === 'channelMuted').map(e => e.id);
  assert.ok(ids.includes('s1')); 
  assert.ok(ids.includes('s2')); 
});
