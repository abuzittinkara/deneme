const test = require('node:test');
const assert = require('assert');
const mongoose = require('mongoose');
const GroupMember = require('../models/GroupMember');

test('default mute fields', () => {
  const gm = new GroupMember({
    user: new mongoose.Types.ObjectId(),
    group: new mongoose.Types.ObjectId()
  });
  assert.strictEqual(gm.muteUntil, undefined);
  assert.ok(gm.channelMuteUntil instanceof Map);
  assert.strictEqual(gm.channelMuteUntil.size, 0);
});

test('default unread maps', () => {
  const gm = new GroupMember({
    user: new mongoose.Types.ObjectId(),
    group: new mongoose.Types.ObjectId()
  });
  assert.ok(gm.channelUnreads instanceof Map);
  assert.strictEqual(gm.channelUnreads.size, 0);
  assert.ok(gm.mentionUnreads instanceof Map);
  assert.strictEqual(gm.mentionUnreads.size, 0);
});
