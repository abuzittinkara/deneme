const test = require('node:test');
const assert = require('assert');
const logger = require('../utils/logger');

// Helper to load and capture error handlers without loading the full server
function loadHandlers() {
  const addedListeners = { uncaughtException: [], unhandledRejection: [] };

  const originalOn = process.on;
  process.on = (evt, handler) => {
    if (evt === 'uncaughtException' || evt === 'unhandledRejection') {
      addedListeners[evt].push(handler);
    }
    return originalOn.call(process, evt, handler);
  };

  delete require.cache[require.resolve('../utils/errorHandlers')];
  const { setupErrorHandlers } = require('../utils/errorHandlers');
  setupErrorHandlers();

  process.on = originalOn;

  return { addedListeners };
}

test('error handlers log stack without exiting', () => {
  process.env.NODE_ENV = 'test';
  const messages = [];
  const originalError = logger.error;
  logger.error = msg => messages.push(msg); // patch before loading server
  let exitCalled = false;
  const originalExit = process.exit;
  process.exit = () => { exitCalled = true; };

  const { addedListeners } = loadHandlers();
  const { handleUncaughtException, handleUnhandledRejection } = require('../utils/errorHandlers');

  const uncaught = new Error('boom');
  handleUncaughtException(uncaught);
  handleUnhandledRejection('oops');

  assert.ok(messages.some(m =>
    m.includes('Uncaught Exception: Error: boom') && m.includes('\n')
  ));
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
