const test = require('node:test');
const assert = require('assert');
const { EventEmitter } = require('events');

const registerTextChannelEvents = require('../modules/textChannel');

function createContext(initialUnreads) {
  const socket = new EventEmitter();
  socket.id = 's1';

  const users = { s1: { username: 'alice' } };

  const userDoc = { _id: 'uid1', username: 'alice' };
  const groupDoc = { _id: 'gid1', groupId: 'g1' };

  const User = { async findOne(q) { return q.username === 'alice' ? userDoc : null; } };
  const Group = { async findOne(q) { return q.groupId === 'g1' ? groupDoc : null; } };
  const Channel = {}; // not used
  const Message = {}; // not used

  const gmDoc = {
    user: userDoc._id,
    group: groupDoc._id,
    unread: Object.values(initialUnreads).reduce((a,b)=>a+Number(b||0),0),
    channelUnreads: { ...initialUnreads }
  };
  const updates = [];
  const GroupMember = {
    doc: gmDoc,
    async updateOne(filter, upd) {
      updates.push(upd);
      if (upd.$set) {
        for (const k of Object.keys(upd.$set)) {
          const val = upd.$set[k];
          if (k.startsWith('channelUnreads.')) {
            const ch = k.split('.').slice(1).join('.');
            this.doc.channelUnreads[ch] = val;
          } else {
            this.doc[k] = val;
          }
        }
      }
    },
    async findOne() {
      return { ...this.doc };
    }
  };

  const io = {
    emitted: [],
    to(id) {
      return {
        emit: (ev, p) => io.emitted.push({ id, ev, p })
      };
    }
  };

  registerTextChannelEvents(io, socket, { Channel, Message, User, users, Group, userSessions:{}, GroupMember });
  const handler = socket.listeners('markChannelRead')[0];

  return { handler, io, updates, gmDoc };
}

test('markChannelRead clears channel only', async () => {
  const { handler, io, updates, gmDoc } = createContext({ ch1: 1, ch2: 2 });
  await handler({ groupId: 'g1', channelId: 'ch1' });
  assert.strictEqual(updates[0].$set['channelUnreads.ch1'], 0);
  assert.ok(!updates[1]);
  assert.deepStrictEqual(io.emitted.find(e => e.ev === 'groupUnreadReset'), undefined);
  assert.strictEqual(gmDoc.channelUnreads.ch1, 0);
});

test('markChannelRead clears group when last channel read', async () => {
  const { handler, io, updates, gmDoc } = createContext({ ch1: 1 });
  await handler({ groupId: 'g1', channelId: 'ch1' });
  assert.strictEqual(updates[0].$set['channelUnreads.ch1'], 0);
  const reset = io.emitted.find(e => e.ev === 'groupUnreadReset');
  assert.ok(reset, 'groupUnreadReset emitted');
  assert.strictEqual(gmDoc.unread, 0);
});