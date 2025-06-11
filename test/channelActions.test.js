const test = require('node:test');
const assert = require('assert');
const { EventEmitter } = require('events');

const groupController = require('../controllers/groupController');

function createContext() {
  const users = {};
  const groups = {
    group1: { owner: 'u1', name: 'g', users: [], rooms: { chan1: { name: 'Old', type: 'text', users: [] } } }
  };
  const channelStore = {
    chan1: { channelId: 'chan1', name: 'Old', group: { groupId: 'group1' } }
  };
  const Channel = {
    async findOne(query) {
      if (query.channelId === 'chan1') {
        return { ...channelStore.chan1, group: { groupId: 'group1' } };
      }
      return null;
    },
    async findOneAndUpdate(query, update) {
      if (query.channelId === 'chan1') {
        channelStore.chan1.name = update.name;
        return { ...channelStore.chan1, group: { groupId: 'group1' } };
      }
      return null;
    },
    async findOneAndDelete(query) {
      if (query.channelId === 'chan1') {
        const res = { ...channelStore.chan1, group: { groupId: 'group1' } };
        delete channelStore.chan1;
        return res;
      }
      return null;
    }
  };
  return { users, groups, Channel, channelStore };
}

function createContextWithTwoChannels() {
  const ctx = createContext();
  ctx.groups.group1.rooms.chan2 = { name: 'Other', type: 'text', users: [] };
  ctx.channelStore.chan2 = { channelId: 'chan2', name: 'Other', group: { groupId: 'group1' } };
  return ctx;
}

test('renameChannel updates memory and emits event', async () => {
  const socket = new EventEmitter();
  const io = { emitted: [], to(room) { return { emit:(ev,p)=>io.emitted.push({room,ev,p}) }; } };
  const { users, groups, Channel, channelStore } = createContext();
  groupController.register(io, socket, { users, groups, User:{}, Group:{}, Channel, onlineUsernames:new Set() });
  const handler = socket.listeners('renameChannel')[0];
  await handler({ channelId:'chan1', newName:'New' });
  assert.strictEqual(channelStore.chan1.name, 'New');
  assert.strictEqual(groups.group1.rooms.chan1.name, 'New');
  assert.ok(io.emitted.find(e=>e.ev==='channelRenamed'));
});

test('deleteChannel removes from memory and emits event', async () => {
  const socket = new EventEmitter();
  const io = { emitted: [], to(room) { return { emit:(ev,p)=>io.emitted.push({room,ev,p}) }; } };
  const { users, groups, Channel } = createContextWithTwoChannels();
  groupController.register(io, socket, { users, groups, User:{}, Group:{}, Channel, onlineUsernames:new Set() });
  const handler = socket.listeners('deleteChannel')[0];
  await handler('chan1');
  assert.ok(!groups.group1.rooms.chan1);
});

test('deleteChannel refuses to remove last text channel', async () => {
  const socket = new EventEmitter();
  const errors = [];
  socket.on('errorMessage', (m) => errors.push(m));
  const io = { emitted: [], to(room) { return { emit:(ev,p)=>io.emitted.push({room,ev,p}) }; } };
  const { users, groups, Channel } = createContext();
  groupController.register(io, socket, { users, groups, User:{}, Group:{}, Channel, onlineUsernames:new Set() });
  const handler = socket.listeners('deleteChannel')[0];
  await handler('chan1');
  assert.ok(groups.group1.rooms.chan1);
  assert.ok(!io.emitted.find(e=>e.ev==='channelDeleted'));
  assert.ok(errors.length > 0);
  assert.ok(io.emitted.find(e=>e.ev==='channelDeleted'));
});