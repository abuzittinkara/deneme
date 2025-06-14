const test = require('node:test');
const assert = require('assert');
const { EventEmitter } = require('events');

const registerAuthHandlers = require('../controllers/authController');

function createIO() {
  const map = new Map();
  return {
    sockets: { sockets: map },
    to(id) { return { emit: () => {} }; }
  };
}

test('new login disconnects previous session', async () => {
  const io = createIO();
  const socket1 = new EventEmitter();
  socket1.id = 's1';
  io.sockets.sockets.set('s1', socket1);
  const socket2 = new EventEmitter();
  socket2.id = 's2';
  io.sockets.sockets.set('s2', socket2);

  const users = { s1: {}, s2: {} };
  const ctx = {
    User: {},
    users,
    onlineUsernames: new Set(),
    groupController: { async sendGroupsListToUser() {} },
    store: null,
    userSessions: {}
  };

  registerAuthHandlers(io, socket1, ctx);
  registerAuthHandlers(io, socket2, ctx);

  let forceLogoutSent = false;
  socket1.emit = (ev) => { if (ev === 'forceLogout') forceLogoutSent = true; };
  socket1.disconnect = () => { forceLogoutSent = true; };

  const h1 = socket1.listeners('set-username')[0];
  await h1('alice');
  assert.strictEqual(ctx.userSessions['alice'], 's1');

  const h2 = socket2.listeners('set-username')[0];
  await h2('alice');
  assert.strictEqual(ctx.userSessions['alice'], 's2');
  assert.ok(forceLogoutSent);
});