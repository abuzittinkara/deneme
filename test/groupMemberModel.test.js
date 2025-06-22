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
