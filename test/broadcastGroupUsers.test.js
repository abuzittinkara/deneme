const test = require('node:test');
const assert = require('assert');
const groupController = require('../controllers/groupController');

function createContext() {
  const groupId = 'g1';
  const io = {
    emitted: [],
    to(room) {
      return {
        emit: (ev, p) => this.emitted.push({ room, ev, p })
      };
    }
  };
  const Group = {
    async findOne(q) {
      if (q.groupId !== groupId) return null;
      return {
        users: [
          { username: 'alice', avatar: 'a.png' },
          { username: 'bob', avatar: 'b.png' }
        ]
      };
    }
  };
  return { io, Group, groupId };
}

test('broadcastGroupUsers includes avatars in payload', async () => {
  const { io, Group, groupId } = createContext();
  const online = new Set(['alice']);
  await groupController.broadcastGroupUsers(io, {}, online, Group, groupId);
  assert.strictEqual(io.emitted.length, 1);
  const evt = io.emitted[0];
  assert.strictEqual(evt.room, groupId);
  assert.strictEqual(evt.ev, 'groupUsers');
  assert.deepStrictEqual(evt.p, {
    online: [{ username: 'alice', avatar: 'a.png' }],
    offline: [{ username: 'bob', avatar: 'b.png' }]
  });
});
