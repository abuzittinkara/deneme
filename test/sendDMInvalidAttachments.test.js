const test = require('node:test');
const assert = require('assert');
const { EventEmitter } = require('events');

const registerFriendHandlers = require('../controllers/friendController');

function createContext() {
  const user1 = { _id: 'u1', username: 'alice', blockedUsers: [] };
  const user2 = { _id: 'u2', username: 'bob', blockedUsers: [] };
  const usersByName = { alice: user1, bob: user2 };
  const users = { s1: { username: 'alice' }, s2: { username: 'bob' } };
  const User = {
    async findOne(q) { return usersByName[q.username] || null; }
  };
  class DMMessage {
    static messages = [];
    constructor({ from, to, content, attachments = [] }) {
      this.from = from;
      this.to = to;
      this.content = content;
      this.attachments = attachments;
      this.timestamp = new Date();
      this._id = `m${DMMessage.messages.length + 1}`;
    }
    async save() {
      DMMessage.messages.push({
        _id: this._id,
        from: this.from,
        to: this.to,
        content: this.content,
        attachments: this.attachments,
        timestamp: this.timestamp
      });
    }
  }
  return {
    users,
    User,
    DMMessage,
    onlineUsernames: new Set(),
    friendRequests: {},
    store: null
  };
}

test('sendDM rejects invalid attachments', async () => {
  const ctx = createContext();
  const socket = new EventEmitter();
  socket.id = 's1';
  socket.join = () => {};
  const io = { emitted: [], to() { return { emit() {} }; } };

  registerFriendHandlers(io, socket, ctx);
  const send = socket.listeners('sendDM')[0];

  let result;
  await new Promise(res => send({ toUsername: 'bob', content: 'hi', attachments: [{ id: '1', url: '/a' }] }, r => { result = r; res(); }));

  assert.ok(!result.success);
  assert.strictEqual(ctx.DMMessage.messages.length, 0);
});
