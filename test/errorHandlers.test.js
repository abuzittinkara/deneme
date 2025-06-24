const test = require('node:test');
const assert = require('assert');
const logger = require('../utils/logger');

// Helper to require server without starting timers or the HTTP server
function loadServer() {
  const originalSetInterval = global.setInterval;
  const addedListeners = { uncaughtException: [], unhandledRejection: [] };
  global.setInterval = () => ({ unref() {} }); // prevent timers

  const originalOn = process.on;
  process.on = (evt, handler) => {
    if (evt === 'uncaughtException' || evt === 'unhandledRejection') {
      addedListeners[evt].push(handler);
    }
    return originalOn.call(process, evt, handler);
  };

  delete require.cache[require.resolve('../server')];
  const serverModule = require('../server');

  global.setInterval = originalSetInterval;
  process.on = originalOn;

  return { serverModule, addedListeners };
}

test('error handlers log without exiting', () => {
  process.env.NODE_ENV = 'test';
  const messages = [];
  const originalError = logger.error;
  logger.error = msg => messages.push(msg); // patch before loading server
  let exitCalled = false;
  const originalExit = process.exit;
  process.exit = () => { exitCalled = true; };

  const { addedListeners } = loadServer();

  const uncaught = new Error('boom');
  process.emit('uncaughtException', uncaught);
  process.emit('unhandledRejection', 'oops');

  assert.ok(messages.some(m => m.includes('Uncaught Exception: boom')));
  assert.ok(messages.some(m => m.includes('Unhandled Rejection: oops')));
  assert.strictEqual(exitCalled, false);

  logger.error = originalError;
  process.exit = originalExit;
  for (const l of addedListeners.uncaughtException) {
    process.off('uncaughtException', l);
  }
  for (const l of addedListeners.unhandledRejection) {
    process.off('unhandledRejection', l);
  }
});
