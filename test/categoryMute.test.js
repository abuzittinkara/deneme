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
  const categoryDoc = { _id: 'cat1id', categoryId: 'cat1', group: groupDoc };

  const User = { findOne: async q => q.username === 'u1' ? userDoc : null };
  const Group = { findOne: async q => q.groupId === 'g1' ? groupDoc : null };
  const Channel = {};
  const Category = { findOne: async q => q.categoryId === 'cat1' ? categoryDoc : null };

  const gmDoc = { categoryMuteUntil: new Map() };
  const updates = [];
  const GroupMember = {
    doc: gmDoc,
    async updateOne(filter, upd) {
      updates.push(upd);
      if (upd.$set) {
        for (const k of Object.keys(upd.$set)) {
          if (k.startsWith('categoryMuteUntil.')) {
            const cid = k.split('.').slice(1).join('.');
            this.doc.categoryMuteUntil.set(cid, upd.$set[k]);
          }
        }
      }
      if (upd.$unset) {
        for (const k of Object.keys(upd.$unset)) {
          if (k.startsWith('categoryMuteUntil.')) {
            const cid = k.split('.').slice(1).join('.');
            this.doc.categoryMuteUntil.delete(cid);
          }
        }
      }
    },
    async findOne() { return { categoryMuteUntil: this.doc.categoryMuteUntil }; }
  };

  const io = { emitted: [], to(id) { return { emit: (ev, p) => io.emitted.push({ id, ev, p }) }; } };
  const userSessions = { u1: 's1' };

  return { io, socket, users, groups, User, Group, Channel, Category, GroupMember, updates, userSessions };
}

test('indefinite category mute persists until cleared', async () => {
  const ctx = createContext();
  groupController.register(ctx.io, ctx.socket, { users: ctx.users, groups: ctx.groups, User: ctx.User, Group: ctx.Group, Channel: ctx.Channel, Category: ctx.Category, GroupMember: ctx.GroupMember, onlineUsernames: new Set() });
  const handler = ctx.socket.listeners('muteCategory')[0];

  await handler({ groupId: 'g1', categoryId: 'cat1', duration: -1 });
  const ts = ctx.GroupMember.doc.categoryMuteUntil.get('cat1');
  assert.ok(ts instanceof Date);
  assert.strictEqual(ts.getTime(), groupController.INDEFINITE_TS.getTime());
  assert.strictEqual(ctx.io.emitted[0].ev, 'categoryMuted');

  ctx.io.emitted.length = 0; ctx.updates.length = 0;

  await handler({ groupId: 'g1', categoryId: 'cat1', duration: 0 });
  assert.strictEqual(ctx.updates[0].$unset['categoryMuteUntil.cat1'], '');
  assert.strictEqual(ctx.io.emitted[0].ev, 'muteCleared');
});
