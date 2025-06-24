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

  const gmDoc = { notificationType: 'all', channelNotificationType: new Map() };
  const updates = [];
  const GroupMember = {
    doc: gmDoc,
    async updateOne(filter, upd) {
      updates.push(upd);
      if (upd.$set) {
        for (const k of Object.keys(upd.$set)) {
          const val = upd.$set[k];
          if (k.startsWith('channelNotificationType.')) {
            const ch = k.split('.').slice(1).join('.');
            this.doc.channelNotificationType.set(ch, val);
          } else if (k === 'notificationType') {
            this.doc.notificationType = val;
          }
        }
      }
    },
    async findOne() {
      return { notificationType: this.doc.notificationType, channelNotificationType: this.doc.channelNotificationType };
    }
  };

  const io = { emitted: [], to(id){ return { emit:(ev,p)=>io.emitted.push({ id, ev, p }) }; } };
  const userSessions = { u1: 's1' };

  return { io, socket, users, groups, User, Group, Channel, GroupMember, updates, userSessions };
}

test('channel notify type persists when changed', async () => {
  const ctx = createContext();
  groupController.register(ctx.io, ctx.socket, { users: ctx.users, groups: ctx.groups, User: ctx.User, Group: ctx.Group, Channel: ctx.Channel, GroupMember: ctx.GroupMember, onlineUsernames: new Set() });
  const handler = ctx.socket.listeners('setChannelNotifyType')[0];

  await handler({ groupId: 'g1', channelId: 'ch1', type: 'mentions' });
  assert.strictEqual(ctx.GroupMember.doc.channelNotificationType.get('ch1'), 'mentions');
  assert.strictEqual(ctx.io.emitted[0].ev, 'channelNotifyTypeUpdated');

  ctx.io.emitted.length = 0; ctx.updates.length = 0;

  await handler({ groupId: 'g1', channelId: 'ch1', type: 'nothing' });
  assert.strictEqual(ctx.GroupMember.doc.channelNotificationType.get('ch1'), 'nothing');
  assert.strictEqual(ctx.io.emitted[0].ev, 'channelNotifyTypeUpdated');
});

test('group notify type persists when changed', async () => {
  const ctx = createContext();
  groupController.register(ctx.io, ctx.socket, { users: ctx.users, groups: ctx.groups, User: ctx.User, Group: ctx.Group, Channel: ctx.Channel, GroupMember: ctx.GroupMember, onlineUsernames: new Set() });
  const handler = ctx.socket.listeners('setGroupNotifyType')[0];

  await handler({ groupId: 'g1', type: 'mentions' });
  assert.strictEqual(ctx.GroupMember.doc.notificationType, 'mentions');
  assert.strictEqual(ctx.io.emitted[0].ev, 'groupNotifyTypeUpdated');

  ctx.io.emitted.length = 0; ctx.updates.length = 0;

  await handler({ groupId: 'g1', type: 'all' });
  assert.strictEqual(ctx.GroupMember.doc.notificationType, 'all');
  assert.strictEqual(ctx.io.emitted[0].ev, 'groupNotifyTypeUpdated');
});
