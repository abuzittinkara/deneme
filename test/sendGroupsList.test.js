const test = require('node:test');
const assert = require('assert');
const groupController = require('../controllers/groupController');

function createContext() {
  const users = { sock1: { username: 'u1' } };
  const groupDoc = { groupId: 'g1', name: 'Group1', owner: { username: 'owner1' } };
  const userDoc = { username: 'u1', groups: [groupDoc] };

  function query(doc) {
    return { populate: async () => doc };
  }

  const User = {
    findOne(queryObj) {
      return queryObj.username === 'u1' ? query(userDoc) : query(null);
    }
  };
  const GroupMember = { findOne: async () => ({ unread: 0 }) };
  return { users, User, GroupMember };
}

test('sendGroupsListToUser emits owners username', async () => {
  const io = { emitted: [], to(room){ return { emit:(ev,p)=>io.emitted.push({room, ev, p}) }; } };
  const { users, User, GroupMember } = createContext();
  await groupController.sendGroupsListToUser(io, 'sock1', { User, users, GroupMember });
  assert.strictEqual(io.emitted[0].ev, 'groupsList');
  assert.strictEqual(io.emitted[0].p[0].owner, 'owner1');
});

test('sendGroupsListToUser handles missing owner', async () => {
  const io = { emitted: [], to(room){ return { emit:(ev,p)=>io.emitted.push({room, ev, p}) }; } };
  const users = { sock1: { username: 'u1' } };
  const groupDoc = { groupId: 'g1', name: 'Group1', owner: null };
  const userDoc = { username: 'u1', groups: [groupDoc] };

  function query(doc){
    return { populate: async () => doc };
  }

  const User = {
    findOne(q){
      return q.username === 'u1' ? query(userDoc) : query(null);
    }
  };

  const GroupMember = { findOne: async () => ({ unread: 0 }) };
  await groupController.sendGroupsListToUser(io, 'sock1', { User, users, GroupMember });
  assert.strictEqual(io.emitted[0].p[0].owner, null);
});

test('group unreadCount sums channel unreads', async () => {
  const io = { emitted: [], to(room){ return { emit:(ev,p)=>io.emitted.push({room, ev, p}) }; } };
  const { users, User } = createContext();
  const GroupMember = { findOne: async () => ({ channelUnreads: { c1: 2, c2: 3 } }) };
  await groupController.sendGroupsListToUser(io, 'sock1', { User, users, GroupMember });
  assert.strictEqual(io.emitted[0].p[0].unreadCount, 5);
});