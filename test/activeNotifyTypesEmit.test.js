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

  const userDoc = { _id: 'u1id', groups: [{ _id: 'g1id', groupId: 'g1' }] };
  const User = { findOne: async q => q.username === 'u1' ? query(userDoc) : query(null) };
  const Group = {};
  const GroupMember = {
    async findOne() {
      const doc = { notificationType: 'mentions', channelNotificationType: new Map([['c1', 'nothing']]) };
      return { select() { return doc; } };
    }
  };
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
  return { io, socket, ctx };
}

test('set-username emits activeNotifyTypes info', async () => {
  const { io, socket, ctx } = createContext();
  registerAuthHandlers(io, socket, ctx);
  let emitted;
  socket.emit = (ev, data) => { if(ev==='activeNotifyTypes') emitted = data; };
  const handler = socket.listeners('set-username')[0];
  await handler('u1');
  assert.deepStrictEqual(emitted, { g1: { notificationType: 'mentions', channelNotificationType: { c1: 'nothing' } } });
});
