const test = require('node:test');
const assert = require('assert');
const { EventEmitter } = require('events');

const registerAuthHandlers = require('../controllers/authController');

function query(doc) {
  return { populate: async () => doc };
}

function createContext() {
  const io = { to(){ return { emit: () => {} }; }, sockets:{ sockets: new Map() } };
  const socket = new EventEmitter();
  socket.id = 's1';
  io.sockets.sockets.set('s1', socket);

  const future = new Date(Date.now() + 1000);
  const userDoc = { _id: 'u1id', groups: [{ _id: 'g1id', groupId: 'g1' }] };
  const User = { findOne: async q => q.username === 'u1' ? query(userDoc) : query(null) };
  const Group = {};
  const GroupMember = { findOne: async () => ({ muteUntil: future, channelMuteUntil: new Map() }) };
  const ctx = {
    User,
    Group,
    GroupMember,
    users: { s1: {} },
    onlineUsernames: new Set(),
    groupController: { async sendGroupsListToUser() {} },
    store: null,
    userSessions: {}
  };
  return { io, socket, ctx, future };
}

test('set-username emits activeMutes info', async () => {
  const { io, socket, ctx, future } = createContext();
  registerAuthHandlers(io, socket, ctx);
  let emitted;
  socket.emit = (ev, data) => { if(ev==='activeMutes') emitted = data; };
  const handler = socket.listeners('set-username')[0];
  await handler('u1');
  assert.deepStrictEqual(emitted, { g1: { muteUntil: future } });
});
