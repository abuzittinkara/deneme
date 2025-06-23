const test = require('node:test');
const assert = require('assert');
const { EventEmitter } = require('events');

const groupController = require('../controllers/groupController');

function createContext() {
  const socket = new EventEmitter();
  socket.id = 's1';

  const users = { s1: { username: 'u1' } };
  const groups = {};

  const userDoc = { _id: 'uid1', username: 'u1' };
  const groupDoc = { _id: 'gid1', groupId: 'g1', users: [{ _id: 'uid1', username: 'u1' }] };
  const channelDoc = { _id: 'cid1', channelId: 'ch1', group: groupDoc };

  const User = { findOne: async q => q.username === 'u1' ? userDoc : null };
  const Group = { findOne: async q => q.groupId === 'g1' ? groupDoc : null };
  const Channel = { findOne: async q => q.channelId === 'ch1' ? channelDoc : null };

  const gmDoc = { muteUntil: undefined, channelMuteUntil: new Map() };
  const updates = [];
  const GroupMember = {
    doc: gmDoc,
    async updateOne(filter, upd) {
      updates.push(upd);
      if (upd.$set) {
        for (const k of Object.keys(upd.$set)) {
          const val = upd.$set[k];
          if (k.startsWith('channelMuteUntil.')) {
            const ch = k.split('.').slice(1).join('.');
            this.doc.channelMuteUntil.set(ch, val);
          } else if (k === 'muteUntil') {
            this.doc.muteUntil = val;
          }
        }
      }
      if (upd.$unset) {
        for (const k of Object.keys(upd.$unset)) {
          if (k.startsWith('channelMuteUntil.')) {
            const ch = k.split('.').slice(1).join('.');
            this.doc.channelMuteUntil.delete(ch);
          } else if (k === 'muteUntil') {
            this.doc.muteUntil = undefined;
          }
        }
      }
    },
    async findOne() { return { muteUntil: this.doc.muteUntil, channelMuteUntil: this.doc.channelMuteUntil }; }
  };

  const io = { emitted: [], to(id) { return { emit: (ev, p) => io.emitted.push({ id, ev, p }) }; } };
  const userSessions = { u1: 's1' };

  return { io, socket, users, groups, User, Group, Channel, GroupMember, updates, userSessions };
}

test('indefinite channel mute persists until cleared', async () => {
  const ctx = createContext();
  groupController.register(ctx.io, ctx.socket, { users: ctx.users, groups: ctx.groups, User: ctx.User, Group: ctx.Group, Channel: ctx.Channel, GroupMember: ctx.GroupMember, onlineUsernames: new Set() });
  const handler = ctx.socket.listeners('muteChannel')[0];

  await handler({ groupId: 'g1', channelId: 'ch1', duration: -1 });
  const ts = ctx.GroupMember.doc.channelMuteUntil.get('ch1');
  assert.ok(ts instanceof Date);
  assert.strictEqual(ts.getTime(), groupController.INDEFINITE_TS.getTime());
  assert.strictEqual(ctx.io.emitted[0].ev, 'channelMuted');

  ctx.io.emitted.length = 0; ctx.updates.length = 0;

  await handler({ groupId: 'g1', channelId: 'ch1', duration: 0 });
  assert.strictEqual(ctx.updates[0].$unset['channelMuteUntil.ch1'], '');
  assert.strictEqual(ctx.io.emitted[0].ev, 'muteCleared');
});

test('indefinite group mute persists until cleared', async () => {
  const ctx = createContext();
  groupController.register(ctx.io, ctx.socket, { users: ctx.users, groups: ctx.groups, User: ctx.User, Group: ctx.Group, Channel: ctx.Channel, GroupMember: ctx.GroupMember, onlineUsernames: new Set() });
  const handler = ctx.socket.listeners('muteGroup')[0];

  await handler({ groupId: 'g1', duration: -1 });
  assert.ok(ctx.GroupMember.doc.muteUntil instanceof Date);
  assert.strictEqual(ctx.GroupMember.doc.muteUntil.getTime(), groupController.INDEFINITE_TS.getTime());
  assert.strictEqual(ctx.io.emitted[0].ev, 'groupMuted');

  ctx.io.emitted.length = 0; ctx.updates.length = 0;

  await handler({ groupId: 'g1', duration: 0 });
  assert.strictEqual(ctx.updates[0].$unset.muteUntil, '');
  assert.strictEqual(ctx.io.emitted[0].ev, 'muteCleared');
});
