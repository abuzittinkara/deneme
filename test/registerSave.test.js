const test = require('node:test');
const assert = require('assert');
const { EventEmitter } = require('events');

// Patch bcrypt to avoid heavy hashing
const bcrypt = require('bcryptjs');
const origHash = bcrypt.hash;
bcrypt.hash = async () => 'hashed';

const registerAuthHandlers = require('../controllers/authController');

function createContext() {
  const io = { to() { return { emit: () => {} }; }, sockets: { sockets: new Map() } };
  const socket = new EventEmitter();
  socket.id = 's1';
  socket.handshake = { address: '1.1.1.1' };
  socket.request = { ip: '1.1.1.1' };
  io.sockets.sockets.set('s1', socket);

  class User {
    constructor(data) { Object.assign(this, data); }
    async save() { User.saved = this; }
    static async findOne() { return null; }
  }

  const ctx = {
    User,
    Group: {},
    GroupMember: {},
    users: {},
    onlineUsernames: new Set(),
    groupController: null
  };

  return { io, socket, ctx, User };
}

test('register saves user document to database', async () => {
  const { io, socket, ctx, User } = createContext();
  registerAuthHandlers(io, socket, ctx);
  const handler = socket.listeners('register')[0];
  await handler({
    username: 'test',
    name: 'Test',
    surname: 'User',
    birthdate: '2000-01-01',
    email: 't@example.com',
    phone: '123',
    password: 'Aa1!aaaa',
    passwordConfirm: 'Aa1!aaaa'
  });
  assert.ok(User.saved);
  assert.strictEqual(User.saved.username, 'test');
  assert.strictEqual(User.saved.passwordHash, 'hashed');
});

// restore bcrypt
bcrypt.hash = origHash;
