const test = require('node:test');
const assert = require('assert');
const { EventEmitter } = require('events');

const groupController = require('../controllers/groupController');
const collectCategoryPrefs = require('../utils/collectCategoryPrefs');

function createContext() {
  const io = { emitted: [], to(id){ return { emit:(ev,p)=>io.emitted.push({id,ev,p}) }; }, sockets:{ sockets:new Map() } };
  const socket = new EventEmitter();
  socket.id = 's1';
  io.sockets.sockets.set('s1', socket);

  const users = { s1: { username: 'u1' } };
  const groups = { g1: { owner:'u1', name:'g', users:[], rooms:{}, categories:{ cat1:{ name:'C1', order:0 } } } };

  const userDoc = { _id:'uid1', username:'u1', groups:[{ _id:'gid1', groupId:'g1' }] };
  const groupDoc = { _id:'gid1', groupId:'g1' };

  const updates = [];
  const GroupMember = {
    doc: { collapsedCategories: new Map() },
    async updateOne(filter, upd){ updates.push(upd); if(upd.$set){ for(const k of Object.keys(upd.$set)){ const cid = k.split('.').slice(1).join('.'); this.doc.collapsedCategories.set(cid, upd.$set[k]); } } },
    async findOne(){ return { select: () => this.doc }; }
  };
  const User = { findOne: async q => q.username==='u1' ? userDoc : null };
  const Group = { findOne: async q => q.groupId==='g1' ? groupDoc : null };

  return { io, socket, context:{ users, groups, User, Group, Channel:{}, Category:{}, GroupMember, onlineUsernames:new Set() }, updates, User, Group, GroupMember };
}

test('collapsed state stored and restored on reconnect', async () => {
  const { io, socket, context, updates, User, Group, GroupMember } = createContext();
  groupController.register(io, socket, context);
  const handler = socket.listeners('setCategoryCollapsed')[0];
  await handler({ groupId:'g1', categoryId:'cat1', collapsed:true });
  assert.deepStrictEqual(updates[0], { $set: { 'collapsedCategories.cat1': true } });
  assert.ok(io.emitted.find(e=>e.ev==='categoryCollapseUpdated'));

  const prefs = await collectCategoryPrefs('u1', { User, Group, GroupMember });
  assert.deepStrictEqual(prefs, { g1: { categoryOrder: {}, collapsedCategories: { cat1: true } } });
});
