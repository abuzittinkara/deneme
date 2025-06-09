const test = require('node:test');
const assert = require('assert');
const { EventEmitter } = require('events');

const groupController = require('../controllers/groupController');

function createContext() {
  const users = { sock1: { username: 'u1' } };
  const groups = {};
  const savedGroups = {};
  const savedChannels = {};
  const userDoc = { _id: 'uid1', username: 'u1', groups: [], async save() {} };
  function query(doc) { return { populate: async () => doc }; }
  const User = { findOne: (q) => q.username === 'u1' ? query(userDoc) : query(null) };
  class Group {
    constructor(data) { Object.assign(this, data); this._id = 'gid-doc'; }
    async save() { savedGroups[this.groupId] = this; }
    static async findOne(q) {
      const g = savedGroups[q.groupId];
      if (!g) return null;
      return { ...g, populate: async () => ({ ...g, users: [userDoc] }) };
    }
  }
  class Channel {
    constructor(data) { Object.assign(this, data); }
    async save() { savedChannels[this.channelId] = this; }
  }
  return { users, groups, User, Group, Channel, savedGroups, savedChannels, userDoc };
}

test('createGroup requires channel name and creates channel', async () => {
  const socket = new EventEmitter();
  const io = { to(){ return { emit(){} }; } };
  const ctx = createContext();
  groupController.register(io, socket, { ...ctx, onlineUsernames: new Set(['u1']) });
  const handler = socket.listeners('createGroup')[0];

  await handler({ groupName: 'GroupA', channelName: 'general' });
  const gId = Object.keys(ctx.groups)[0];
  assert.ok(gId);
  assert.strictEqual(ctx.groups[gId].name, 'GroupA');
  const chIds = Object.keys(ctx.groups[gId].rooms);
  assert.strictEqual(chIds.length, 1);
  assert.strictEqual(ctx.groups[gId].rooms[chIds[0]].name, 'general');
});

test('createGroup rejects without channel name', async () => {
  const socket = new EventEmitter();
  const io = { to(){ return { emit(){} }; } };
  const ctx = createContext();
  groupController.register(io, socket, { ...ctx, onlineUsernames: new Set(['u1']) });
  const handler = socket.listeners('createGroup')[0];

  await handler({ groupName: 'GroupA' });
  assert.strictEqual(Object.keys(ctx.groups).length, 0);
});