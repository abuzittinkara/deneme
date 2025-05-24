const test = require('node:test');
const assert = require('assert');
const mongoose = require('mongoose');
const User = require('../models/User');

test('blockedUsers defaults to an empty array', () => {
  const user = new User({ username: 'foo', passwordHash: 'bar' });
  assert.ok(Array.isArray(user.blockedUsers));
  assert.strictEqual(user.blockedUsers.length, 0);
});