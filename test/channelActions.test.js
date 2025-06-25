const test = require('node:test');
const assert = require('assert');
const { EventEmitter } = require('events');

const groupController = require('../controllers/groupController');

function createContext() {
  const users = {};
  const groups = {
    group1: { owner: 'u1', name: 'g', users: [], rooms: { chan1: { name: 'Old', type: 'text', users: [], order: 0 } }, categories: {} }
  };
  const channelStore = {
    chan1: { channelId: 'chan1', name: 'Old', group: { groupId: 'group1' }, order: 0 }
  };
  const Channel = {
    async findOne(query) {
      const ch = channelStore[query.channelId];
      if (ch) {
        return { ...ch, group: { groupId: 'group1' } };
      }
      return null;
    },
    async findOneAndUpdate(query, update) {
      const ch = channelStore[query.channelId];
      if (ch) {
        if (update.name !== undefined) ch.name = update.name;
        if (update.order !== undefined) ch.order = update.order;
        return { ...ch, group: { groupId: 'group1' } };
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
  ctx.groups.group1.categories = {};
  ctx.groups.group1.rooms.chan2 = { name: 'Other', type: 'text', users: [], order: 1 };
  ctx.channelStore.chan2 = { channelId: 'chan2', name: 'Other', group: { groupId: 'group1' }, order: 1 };
  return ctx;
}

function createContextWithCategory() {
  const ctx = createContextWithTwoChannels();
  ctx.groups.group1.categories.cat1 = { name: 'Cat', order: 0 };
  ctx.channelStore.chan1.order = 1;
  ctx.channelStore.chan2.order = 2;
  ctx.groups.group1.rooms.chan1.order = 1;
  ctx.groups.group1.rooms.chan2.order = 2;
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
});

test('reorderChannel updates memory and emits roomsList', async () => {
  const socket = new EventEmitter();
  const io = { emitted: [], to(room) { return { emit:(ev,p)=>io.emitted.push({room,ev,p}) }; } };
  const { users, groups, Channel, channelStore } = createContextWithTwoChannels();
  groupController.register(io, socket, { users, groups, User:{}, Group:{}, Channel, onlineUsernames:new Set() });
  const handler = socket.listeners('reorderChannel')[0];
  await handler({ groupId:'group1', channelId:'chan2', newIndex:0 });
  assert.strictEqual(groups.group1.rooms.chan2.order, 0);
  assert.strictEqual(groups.group1.rooms.chan1.order, 1);
  assert.strictEqual(channelStore.chan2.order, 0);
  assert.strictEqual(channelStore.chan1.order, 1);
  assert.ok(io.emitted.find(e=>e.ev==='roomsList'));
});

test('reorderChannel also emits allChannelsData', async () => {
  const socket = new EventEmitter();
  const io = { emitted: [], to(room) { return { emit:(ev,p)=>io.emitted.push({room,ev,p}) }; } };
  const { users, groups, Channel } = createContextWithTwoChannels();
  groupController.register(io, socket, { users, groups, User:{}, Group:{}, Channel, onlineUsernames:new Set() });
  const handler = socket.listeners('reorderChannel')[0];
  await handler({ groupId:'group1', channelId:'chan2', newIndex:0 });
  assert.ok(io.emitted.find(e=>e.ev==='allChannelsData'));
});

test('reorderChannel across category adjusts all orders', async () => {
  const socket = new EventEmitter();
  const io = { emitted: [], to(r){ return { emit:(ev,p)=>io.emitted.push({r,ev,p}) }; } };
  const { users, groups, Channel, channelStore } = createContextWithCategory();
  groupController.register(io, socket, { users, groups, User:{}, Group:{}, Channel, onlineUsernames:new Set() });
  const handler = socket.listeners('reorderChannel')[0];
  await handler({ groupId:'group1', channelId:'chan2', newIndex:0 });
  assert.strictEqual(groups.group1.rooms.chan2.order, 0);
  assert.strictEqual(groups.group1.categories.cat1.order, 1);
  assert.strictEqual(channelStore.chan2.order, 0);
});