const test = require('node:test');
const assert = require('assert');
const { EventEmitter } = require('events');

const groupController = require('../controllers/groupController');

function createContext() {
  const users = { sock1: { username: 'u1' } };
  const groups = { group1: { owner: 'u1', name: 'g', users: [], rooms: {}, categories: {} } };
  const savedChannels = {};
  const Group = { async findOne(q) { return q.groupId === 'group1' ? { groupId: 'group1', _id: 'gid' } : null; } };
  class Channel {
    constructor(data) { Object.assign(this, data); }
    async save() { savedChannels[this.channelId] = this; }
  }
  return { users, groups, Group, Channel, savedChannels };
}

test('createChannel uses provided type', async () => {
  const socket = new EventEmitter();
  socket.id = 'sock1';
  const io = { to() { return { emit() {} }; } };
  const ctx = createContext();
  groupController.register(io, socket, { ...ctx, User: {}, onlineUsernames: new Set() });
  const handler = socket.listeners('createChannel')[0];
  await handler({ groupId: 'group1', name: 'voiceCh', type: 'voice' });
  const id = Object.keys(ctx.groups.group1.rooms)[0];
  assert.ok(id);
  assert.strictEqual(ctx.groups.group1.rooms[id].type, 'voice');
  assert.strictEqual(ctx.savedChannels[id].type, 'voice');
});