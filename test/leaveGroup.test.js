const test = require('node:test');
const assert = require('assert');
const { EventEmitter } = require('events');

const groupController = require('../controllers/groupController');

function createContext(){
  const users = { s1: { username:'u1', currentGroup:'g1', currentRoom:'r1' } };
  const groups = {
    g1: {
      owner:'u1',
      name:'g',
      users:[{id:'s1', username:'u1'}],
      rooms:{ r1:{ name:'room', type:'text', users:[{id:'s1', username:'u1'}] } }
    }
  };
  const userDoc = {
    _id:'uid1',
    username:'u1',
    groups:['gid1'],
    async save(){},
    async populate(){ return this; }
  };
  const groupDoc = {
    _id:'gid1',
    groupId:'g1',
    users:['uid1'],
    async save(){},
    async populate(){ return this; }
  };
  function query(doc){
    return {
      ...doc,
      populate: async () => doc,
      then: (res) => res(doc)
    };
  }
  const User = { findOne(q){
      return q.username==='u1' ? query(userDoc) : query(null);
    } };
  const Group = { findOne(q){
      return q.groupId==='g1' ? query(groupDoc) : query(null);
    } };
  return { users, groups, User, Group, userDoc, groupDoc };
}

test('leaveGroup updates structures and emits events', async () => {
  const socket = new EventEmitter();
  socket.id = 's1';
  socket.leave = () => {};
  const io = { emitted: [], to(room){ return { emit:(ev,p)=>io.emitted.push({room,ev,p}) }; } };
  const { users, groups, User, Group, userDoc, groupDoc } = createContext();
  groupController.register(io, socket, { users, groups, User, Group, Channel:{}, onlineUsernames:new Set(['u1']) });
  const handler = socket.listeners('leaveGroup')[0];
  await handler('g1');
  assert.ok(groups.g1.users.length === 0);
  assert.ok(groups.g1.rooms.r1.users.length === 0);
  assert.strictEqual(userDoc.groups.length, 0);
  assert.strictEqual(groupDoc.users.length, 0);
  assert.ok(io.emitted.find(e=>e.ev==='groupsList'));
  assert.ok(io.emitted.find(e=>e.ev==='groupUsers'));
});