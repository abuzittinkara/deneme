const test = require('node:test');
const assert = require('assert');
const emitChannelUnread = require('../utils/emitChannelUnread');

function createContext(opts = {}) {
  const groupDoc = {
    _id: 'gid1',
    groupId: 'g1',
    users: [{ _id: 'uid1', username: 'u1' }]
  };
  const Group = {
    findOne: async q =>
      q.groupId === 'g1' ? { populate: async () => groupDoc } : null
  };
  const GroupMember = {
    async findOne() {
      return {
        notificationType: opts.notificationType || 'all',
        channelNotificationType: new Map(
          Object.entries(opts.channelNotificationType || {})
        ),
        muteUntil: undefined,
        channelMuteUntil: new Map()
      };
    },
    updateOne: async () => {}
  };
  const Channel = { findOne: async () => ({ _id: 'cid2', channelId: 'ch2', category: null }) };
  const userSessions = { u1: 's1' };
  const users = { s1: { currentGroup: 'g1', currentTextChannel: 'ch1' } };
  const io = {
    emitted: [],
    to() {
      return { emit: (ev, p) => this.emitted.push({ ev, p }) };
    }
  };
  return { io, Group, Channel, GroupMember, userSessions, users };
}

test('channel notify override to nothing prevents event', async () => {
  const ctx = createContext({
    notificationType: 'all',
    channelNotificationType: { ch2: 'nothing' }
  });
  await emitChannelUnread(
    ctx.io,
    'g1',
    'ch2',
    ctx.Group,
    ctx.Channel,
    ctx.userSessions,
    ctx.GroupMember,
    ctx.users,
    []
  );
  assert.strictEqual(ctx.io.emitted.length, 0);
});

test('group mentions type requires mention', async () => {
  const ctx = createContext({ notificationType: 'mentions' });
  await emitChannelUnread(
    ctx.io,
    'g1',
    'ch2',
    ctx.Group,
    ctx.Channel,
    ctx.userSessions,
    ctx.GroupMember,
    ctx.users,
    []
  );
  assert.strictEqual(ctx.io.emitted.length, 0);
});

test('group mentions emits when mentioned', async () => {
  const ctx = createContext({ notificationType: 'mentions' });
  await emitChannelUnread(
    ctx.io,
    'g1',
    'ch2',
    ctx.Group,
    ctx.Channel,
    ctx.userSessions,
    ctx.GroupMember,
    ctx.users,
    ['u1']
  );
  assert.strictEqual(ctx.io.emitted[0].ev, 'channelUnread');
});

test('channel notify override to all beats group mentions', async () => {
  const ctx = createContext({
    notificationType: 'mentions',
    channelNotificationType: { ch2: 'all' }
  });
  await emitChannelUnread(
    ctx.io,
    'g1',
    'ch2',
    ctx.Group,
    ctx.Channel,
    ctx.userSessions,
    ctx.GroupMember,
    ctx.users,
    []
  );
  assert.strictEqual(ctx.io.emitted.length, 1);
});

