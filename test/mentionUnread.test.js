const test = require('node:test');
const assert = require('assert');
const emitMentionUnread = require('../utils/emitMentionUnread');

function createContext(opts = {}) {
  const groupDoc = {
    _id: 'gid1',
    groupId: 'g1',
    users: [
      { _id: 'uid1', username: 'u1' },
      { _id: 'uid2', username: 'u2' }
    ]
  };
  const Group = {
    findOne: async (q) => (q.groupId === 'g1' ? { populate: async () => groupDoc } : null)
  };
  const GroupMember = {
    async findOne(q) {
      if (q.user === 'uid2') {
        const doc = {
          muteUntil: opts.muteUntil,
          channelMuteUntil: new Map(Object.entries(opts.channelMuteUntil || {})),
          mentionUnreads: new Map(Object.entries(opts.mentionUnreads || {}))
        };
        return { select() { return doc; } };
      }
      return null;
    },
    updates: [],
    async updateOne(filter, upd) {
      this.updates.push(upd);
    }
  };
  const userSessions = { u2: 's2' };
  const users = { s2: { currentGroup: opts.currentGroup, currentTextChannel: opts.currentChannel } };
  const io = { emitted: [], to: () => ({ emit(ev,p){ io.emitted.push({ev,p}); } }) };
  return { io, Group, GroupMember, userSessions, users };
}

test('emitMentionUnread sends event for valid mention', async () => {
  const ctx = createContext({ currentGroup: 'g1', currentChannel: 'other' });
  await emitMentionUnread(ctx.io, 'g1', 'ch1', 'u2', ctx.Group, ctx.userSessions, ctx.GroupMember, ctx.users);
  assert.strictEqual(ctx.io.emitted.length, 1);
  assert.strictEqual(ctx.io.emitted[0].ev, 'mentionUnread');
  assert.strictEqual(ctx.GroupMember.updates[0].$inc['mentionUnreads.ch1'], 1);
});

test('emitMentionUnread ignores when viewing channel', async () => {
  const ctx = createContext({ currentGroup: 'g1', currentChannel: 'ch1' });
  await emitMentionUnread(ctx.io, 'g1', 'ch1', 'u2', ctx.Group, ctx.userSessions, ctx.GroupMember, ctx.users);
  assert.strictEqual(ctx.io.emitted.length, 0);
  assert.strictEqual(ctx.GroupMember.updates.length, 0);
});

test('emitMentionUnread still emits when muted', async () => {
  const muteUntil = new Date(Date.now() + 1000);
  const ctx = createContext({ currentGroup: 'g1', currentChannel: 'other', muteUntil });
  await emitMentionUnread(ctx.io, 'g1', 'ch1', 'u2', ctx.Group, ctx.userSessions, ctx.GroupMember, ctx.users);
  assert.strictEqual(ctx.io.emitted.length, 1);
  assert.strictEqual(ctx.io.emitted[0].ev, 'mentionUnread');
  assert.strictEqual(ctx.GroupMember.updates[0].$inc['mentionUnreads.ch1'], 1);
});
