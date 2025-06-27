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
  const User = { findOne: q => q.username === 'u1' ? query(userDoc) : query(null) };
  class Group {
    constructor(data) { Object.assign(this, data); this._id = 'gid-doc'; }
    async save() { savedGroups[this.groupId] = this; }
  }
  class Channel {
    constructor(data) { Object.assign(this, data); }
    async save() { savedChannels[this.channelId] = this; }
  }
  const GroupMember = { async create() {} };
  return { users, groups, savedGroups, savedChannels, User, Group, Channel, GroupMember };
}

test('createGroup saves group and channel documents', async () => {
  const socket = new EventEmitter();
  socket.id = 'sock1';
  const io = { emitted: [], to(room){ return { emit:(ev,p)=>io.emitted.push({room,ev,p}) }; } };
  const ctx = createContext();
  groupController.register(io, socket, { ...ctx, onlineUsernames: new Set(['u1']) });
  const handler = socket.listeners('createGroup')[0];

  await handler({ groupName: 'GroupA', channelName: 'general' });
  const gId = Object.keys(ctx.savedGroups)[0];
  assert.ok(gId);
  assert.strictEqual(ctx.savedGroups[gId].name, 'GroupA');
  const chId = Object.keys(ctx.savedChannels)[0];
  assert.ok(chId);
  assert.strictEqual(ctx.savedChannels[chId].name, 'general');
  assert.strictEqual(ctx.savedChannels[chId].group, ctx.savedGroups[gId]._id);
});
