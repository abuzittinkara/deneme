const test = require('node:test');
const assert = require('assert');
const { EventEmitter } = require('events');

const registerDMChatEvents = require('../modules/dmChat');

function createContext() {
  const user1 = { _id: 'u1', username: 'alice', blockedUsers: [] };
  const user2 = { _id: 'u2', username: 'bob', blockedUsers: [] };
  const usersByName = { alice: user1, bob: user2 };
  const usersById = { u1: user1, u2: user2 };

  const users = { s1: { username: 'alice' }, s2: { username: 'bob' } };

  const User = {
    async findOne(q) {
      return usersByName[q.username] || null;
    }
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
    static find(q) {
      const [c1, c2] = q.$or;
      const msgs = DMMessage.messages.filter(m =>
        (m.from === c1.from && m.to === c1.to) ||
        (m.from === c2.from && m.to === c2.to)
      );
      return {
        sort() { msgs.sort((a, b) => a.timestamp - b.timestamp); return this; },
        async populate() {
          return msgs.map(m => ({
            _id: m._id,
            from: { username: usersById[m.from].username },
            content: m.content,
            attachments: m.attachments,
            timestamp: m.timestamp
          }));
        }
      };
    }
    static async findById(id) {
      const msg = DMMessage.messages.find(m => m._id === id) || null;
      if (!msg) return null;
      return {
        ...msg,
        async populate() {
          return { ...msg, from: { username: usersById[msg.from].username } };
        }
      };
    }
    static async deleteOne(query) {
      const idx = DMMessage.messages.findIndex(m => m._id === query._id);
      if (idx !== -1) DMMessage.messages.splice(idx, 1);
    }
  }

  const logger = { warn() {}, error() {}, info() {} };

  return { users, User, DMMessage, logger };
}

test('dm messages persist and history retrieval works', async () => {
  const { users, User, DMMessage, logger } = createContext();
  const socket1 = new EventEmitter();
  socket1.id = 's1';
  socket1.join = () => {};
  const socket2 = new EventEmitter();
  socket2.id = 's2';
  socket2.join = () => {};

  const io = {
    emitted: [],
    to(id) {
      return {
        emit: (ev, p) => {
          io.emitted.push({ id, ev, p });
          if (id === 's1') socket1.emit(ev, p);
          if (id === 's2') socket2.emit(ev, p);
        }
      };
    }
  };

  registerDMChatEvents(socket1, { io, User, DMMessage, users, logger });
  registerDMChatEvents(socket2, { io, User, DMMessage, users, logger });

  const join1 = socket1.listeners('joinDM')[0];
  const join2 = socket2.listeners('joinDM')[0];
  await new Promise(r => join1({ friend: 'bob' }, r));
  await new Promise(r => join2({ friend: 'alice' }, r));

  const dm1 = socket1.listeners('dmMessage')[0];
  const dm2 = socket2.listeners('dmMessage')[0];
  await new Promise(res => dm1({ friend: 'bob', content: 'Hello Bob' }, res));
  await new Promise(res => dm2({ friend: 'alice', content: 'Hi Alice' }, res));

  assert.strictEqual(DMMessage.messages.length, 2);

  const get1 = socket1.listeners('getDMMessages')[0];
  let history;
  await new Promise(res => get1({ friend: 'bob' }, (h) => { history = h; res(); }));

  assert.ok(history.success);
  assert.strictEqual(history.messages.length, 2);
  assert.strictEqual(history.messages[0].username, 'alice');
  assert.strictEqual(history.messages[1].username, 'bob');
  assert.strictEqual(history.messages[0].content, 'Hello Bob');
  assert.strictEqual(history.messages[1].content, 'Hi Alice');
});

test('dm messages are sanitized', async () => {
  const { users, User, DMMessage, logger } = createContext();
  const socket1 = new EventEmitter();
  socket1.id = 's1';
  socket1.join = () => {};
  const socket2 = new EventEmitter();
  socket2.id = 's2';
  socket2.join = () => {};

  const io = {
    emitted: [],
    to(id) {
      return {
        emit: (ev, p) => {
          io.emitted.push({ id, ev, p });
          if (id === 's1') socket1.emit(ev, p);
          if (id === 's2') socket2.emit(ev, p);
        }
      };
    }
  };

  registerDMChatEvents(socket1, { io, User, DMMessage, users, logger });
  registerDMChatEvents(socket2, { io, User, DMMessage, users, logger });

  const dm1 = socket1.listeners('dmMessage')[0];

  let selfPayload;
  let friendPayload;
  socket1.on('newDMMessage', p => { selfPayload = p; });
  socket2.on('newDMMessage', p => { friendPayload = p; });

  await new Promise(res => dm1({ friend: 'bob', content: '<i>Hello</i>' }, res));

  assert.strictEqual(DMMessage.messages[0].content, 'Hello');
  assert.strictEqual(selfPayload.message.content, 'Hello');
  assert.strictEqual(friendPayload.message.content, 'Hello');
});

test('dm message with valid attachments is stored', async () => {
  const { users, User, DMMessage, logger } = createContext();
  const socket = new EventEmitter();
  socket.id = 's1';
  socket.join = () => {};
  const io = { emitted: [], to() { return { emit() {} }; } };

  registerDMChatEvents(socket, { io, User, DMMessage, users, logger });

  const dm = socket.listeners('dmMessage')[0];
  await new Promise(res => dm({ friend: 'bob', content: 'f', attachments: [{ id: '1', url: '/a', type: 'img' }] }, res));

  assert.strictEqual(DMMessage.messages.length, 1);
  assert.strictEqual(DMMessage.messages[0].attachments[0].url, '/a');
});

test('dm message with invalid attachments is rejected', async () => {
  const { users, User, DMMessage, logger } = createContext();
  const socket = new EventEmitter();
  socket.id = 's1';
  socket.join = () => {};
  const io = { emitted: [], to() { return { emit() {} }; } };

  registerDMChatEvents(socket, { io, User, DMMessage, users, logger });

  const dm = socket.listeners('dmMessage')[0];
  let result;
  await new Promise(res => dm({ friend: 'bob', content: 'x', attachments: [{ id: '1', url: '/a' }] }, r => { result = r; res(); }));

  assert.ok(!result.success);
  assert.strictEqual(DMMessage.messages.length, 0);
});

test('dm message can be deleted by author', async () => {
  const { users, User, DMMessage, logger } = createContext();
  const socket = new EventEmitter();
  socket.id = 's1';
  socket.join = () => {};
  const io = { emitted: [], to(){ return { emit(){} } } };

  registerDMChatEvents(socket, { io, User, DMMessage, users, logger });

  const send = socket.listeners('dmMessage')[0];
  await new Promise(res => send({ friend: 'bob', content: 'hi' }, res));
  const del = socket.listeners('deleteDMMessage')[0];
  const id = DMMessage.messages[0]._id;
  await new Promise(res => del({ friend: 'bob', messageId: id }, res));
  assert.strictEqual(DMMessage.messages.length, 0);
});