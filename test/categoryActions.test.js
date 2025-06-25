const test = require('node:test');
const assert = require('assert');
const { EventEmitter } = require('events');

const groupController = require('../controllers/groupController');

function createContext() {
  const users = {};
  const groups = { group1: { owner: 'u1', name: 'g', users: [], rooms: { chan1: { name: 'Ch', type: 'text', users: [], order: 0, categoryId: null } }, categories: {} } };
  const categoryStore = {};
  const channelStore = { chan1: { channelId: 'chan1', group: { groupId: 'group1' } } };
  const Category = {
    async findOne(q) { const c = categoryStore[q.categoryId]; return c ? { ...c, group: { groupId: 'group1' } } : null; },
    async findOneAndUpdate(q,u){ const c=categoryStore[q.categoryId]; if(c){ if(u.name!==undefined) c.name=u.name; if(u.order!==undefined) c.order=u.order; return { ...c, group:{groupId:'group1'} }; } return null; },
    async findOneAndDelete(q){ if(categoryStore[q.categoryId]){ const res={...categoryStore[q.categoryId], group:{groupId:'group1'}}; delete categoryStore[q.categoryId]; return res;} return null; },
    async create(data){ categoryStore[data.categoryId]={...data}; }
  };
  const Channel = {
    async findOneAndUpdate(q, u){ channelStore[q.channelId] = { ...channelStore[q.channelId], ...u }; return channelStore[q.channelId]; }
  };
  const Group = {
    async findOne(q) { return q.groupId==='group1' ? { groupId:'group1', _id:'gdoc1' } : null; }
  };
  return { users, groups, Category, Channel, Group, categoryStore, channelStore };
}

function createContextWithChannel() {
  const ctx = createContext();
  ctx.groups.group1.rooms.chan2 = { name:'Other', type:'text', users:[], order:1, categoryId:null };
  ctx.channelStore.chan2 = { channelId:'chan2', group:{ groupId:'group1' }, order:1 };
  return ctx;
}

test('createCategory adds category to memory', async () => {
  const socket = new EventEmitter();
  const io = { emitted: [], to(room){ return { emit:(ev,p)=>io.emitted.push({room,ev,p}) }; } };
  const ctx = createContext();
  groupController.register(io, socket, { users: ctx.users, groups: ctx.groups, User:{}, Group: ctx.Group, Channel: ctx.Channel, Category: ctx.Category, onlineUsernames:new Set(), GroupMember:{} });
  const handler = socket.listeners('createCategory')[0];
  await handler({ groupId:'group1', name:'Cat' });
  const cid = Object.keys(ctx.groups.group1.categories)[0];
  assert.ok(cid);
  assert.strictEqual(ctx.groups.group1.categories[cid].name, 'Cat');
  assert.ok(io.emitted.find(e=>e.ev==='roomsList'));
});

test('assignChannelCategory updates channel', async () => {
  const socket = new EventEmitter();
  const io = { emitted: [], to(room){ return { emit:(ev,p)=>io.emitted.push({room,ev,p}) }; } };
  const ctx = createContext();
  ctx.groups.group1.categories.cat1 = { name: 'C1', order:0 };
  ctx.categoryStore.cat1 = { categoryId:'cat1', name:'C1', group:{ groupId:'group1' }, order:0 };
  // But we inserted property this way; we need to ensure Category.findOne works
  ctx.Category.findOne = async (q)=> q.categoryId==='cat1'?{ categoryId:'cat1', name:'C1', group:{groupId:'group1'} } : null;
  groupController.register(io, socket, { users: ctx.users, groups: ctx.groups, User:{}, Group: ctx.Group, Channel: ctx.Channel, Category: ctx.Category, onlineUsernames:new Set(), GroupMember:{} });
  const handler = socket.listeners('assignChannelCategory')[0];
  await handler({ groupId:'group1', channelId:'chan1', categoryId:'cat1' });
  assert.strictEqual(ctx.groups.group1.rooms.chan1.categoryId, 'cat1');
  assert.ok(io.emitted.find(e=>e.ev==='roomsList'));
});

test('createCategory persists to store', async () => {
  const socket = new EventEmitter();
  const io = { emitted: [], to(room){ return { emit:(ev,p)=>io.emitted.push({room,ev,p}) }; } };
  const ctx = createContext();
  groupController.register(io, socket, { users: ctx.users, groups: ctx.groups, User:{}, Group: ctx.Group, Channel: ctx.Channel, Category: ctx.Category, onlineUsernames:new Set(), GroupMember:{} });
  const handler = socket.listeners('createCategory')[0];
  await handler({ groupId:'group1', name:'Persist' });
  const cid = Object.keys(ctx.categoryStore)[0];
  assert.ok(cid);
  assert.strictEqual(ctx.categoryStore[cid].name, 'Persist');
});

test('assignChannelCategory persists update to channel store', async () => {
  const socket = new EventEmitter();
  const io = { emitted: [], to(room){ return { emit:(ev,p)=>io.emitted.push({room,ev,p}) }; } };
  const ctx = createContext();
  ctx.groups.group1.categories.cat1 = { name: 'C1', order:0 };
  ctx.categoryStore.cat1 = { categoryId:'cat1', name:'C1', group:{ groupId:'group1' }, _id:'doc1', order:0 };
  ctx.Category.findOne = async (q)=> q.categoryId==='cat1'?{ _id:'doc1', categoryId:'cat1', group:{groupId:'group1'} } : null;
  groupController.register(io, socket, { users: ctx.users, groups: ctx.groups, User:{}, Group: ctx.Group, Channel: ctx.Channel, Category: ctx.Category, onlineUsernames:new Set(), GroupMember:{} });
  const handler = socket.listeners('assignChannelCategory')[0];
  await handler({ groupId:'group1', channelId:'chan1', categoryId:'cat1' });
  assert.strictEqual(ctx.channelStore.chan1.category, 'doc1');
  assert.strictEqual(ctx.groups.group1.rooms.chan1.categoryId, 'cat1');
  assert.ok(io.emitted.find(e=>e.ev==='roomsList'));
});

test('reorderCategory updates order and emits roomsList', async () => {
  const socket = new EventEmitter();
  const io = { emitted: [], to(room){ return { emit:(ev,p)=>io.emitted.push({room,ev,p}) }; } };
  const ctx = createContext();
  ctx.groups.group1.categories.cat1 = { name:'C1', order:0 };
  ctx.groups.group1.categories.cat2 = { name:'C2', order:1 };
  ctx.categoryStore.cat1 = { categoryId:'cat1', name:'C1', group:{groupId:'group1'}, order:0 };
  ctx.categoryStore.cat2 = { categoryId:'cat2', name:'C2', group:{groupId:'group1'}, order:1 };
  groupController.register(io, socket, { users: ctx.users, groups: ctx.groups, User:{}, Group: ctx.Group, Channel: ctx.Channel, Category: ctx.Category, onlineUsernames:new Set(), GroupMember:{} });
  const handler = socket.listeners('reorderCategory')[0];
  await handler({ groupId:'group1', categoryId:'cat2', newIndex:0 });
  assert.strictEqual(ctx.groups.group1.categories.cat2.order, 0);
  assert.strictEqual(ctx.groups.group1.categories.cat1.order, 1);
  assert.strictEqual(ctx.categoryStore.cat2.order, 0);
  assert.strictEqual(ctx.categoryStore.cat1.order, 1);
  assert.ok(io.emitted.find(e=>e.ev==='roomsList'));
});

test('reorderCategory across channel adjusts orders', async () => {
  const socket = new EventEmitter();
  const io = { emitted: [], to(r){ return { emit:(ev,p)=>io.emitted.push({r,ev,p}) }; } };
  const ctx = createContextWithChannel();
  ctx.groups.group1.categories.cat1 = { name:'C1', order:1 };
  ctx.categoryStore.cat1 = { categoryId:'cat1', name:'C1', group:{groupId:'group1'}, order:1 };
  groupController.register(io, socket, { users: ctx.users, groups: ctx.groups, User:{}, Group: ctx.Group, Channel: ctx.Channel, Category: ctx.Category, onlineUsernames:new Set(), GroupMember:{} });
  const handler = socket.listeners('reorderCategory')[0];
  await handler({ groupId:'group1', categoryId:'cat1', newIndex:0 });
  assert.strictEqual(ctx.groups.group1.categories.cat1.order, 0);
  assert.strictEqual(ctx.groups.group1.rooms.chan1.order, 1);
  assert.strictEqual(ctx.categoryStore.cat1.order, 0);
});
