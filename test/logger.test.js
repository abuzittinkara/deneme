const test = require('node:test');
const assert = require('assert');

const logger = require('../utils/logger');

test('logger exposes info method', () => {
  assert.strictEqual(typeof logger.info, 'function');
});