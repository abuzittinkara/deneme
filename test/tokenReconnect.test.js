const test = require('node:test');
const assert = require('assert');
const { EventEmitter } = require('events');
process.env.JWT_SECRET = 'testsecret';
const { sign } = require('../utils/jwt');

class FakeIO {
  constructor() {
    this.useHandlers = [];
    this.connHandler = null;
    this.emitted = [];
    this.sockets = { sockets: new Map() };
  }
  use(fn) { this.useHandlers.push(fn); }
  on(ev, fn) { if (ev === 'connection') this.connHandler = fn; }
  to(id) { return { emit: (ev, p) => this.emitted.push({ id, ev, p }) }; }
}

function loadServer(io, groupController) {
  const originalSetInterval = global.setInterval;
  global.setInterval = () => ({ unref() {} });

  delete require.cache[require.resolve('socket.io')];
  require.cache[require.resolve('socket.io')] = { exports: () => io };

  delete require.cache[require.resolve('../controllers/groupController')];
  require.cache[require.resolve('../controllers/groupController')] = { exports: groupController };

  const stubs = ['../controllers/friendController','../modules/textChannel','../modules/mediaEvents','../modules/dmChat'];
  for (const p of stubs) { delete require.cache[require.resolve(p)]; require.cache[require.resolve(p)] = { exports: () => {} }; }

  delete require.cache[require.resolve('../server')];
  const srv = require('../server');

  global.setInterval = originalSetInterval;
  return srv;
}

test('reconnect with token emits groups and rooms', async () => {
  const io = new FakeIO();
  const calls = [];
  const groupController = {
    register() {},
    broadcastAllChannelsData() {},
    handleDisconnect() {},
    sendGroupsListToUser: async () => { calls.push('groups'); },
    sendRoomsListToUser: async () => { calls.push('rooms'); }
  };
  loadServer(io, groupController);

  const token = sign({ username: 'alice', lastGroupId: 'g1' });
  const socket = new EventEmitter();
  socket.id = 's1';
  socket.handshake = { auth: { token }, headers: {} };
  socket.join = () => {};
  io.sockets.sockets.set('s1', socket);

  await new Promise((res, rej) => io.useHandlers[0](socket, err => err ? rej(err) : res()));
  await io.connHandler(socket);

  assert.deepStrictEqual(calls, ['groups', 'rooms']);
});
