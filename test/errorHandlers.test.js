const test = require('node:test');
const assert = require('assert');
const logger = require('../utils/logger');

// Helper to require server without starting timers or the HTTP server
function loadServer() {
  const originalSetInterval = global.setInterval;
  global.setInterval = () => ({ unref() {} }); // prevent timers
  delete require.cache[require.resolve('../server')];
  const serverModule = require('../server');
  global.setInterval = originalSetInterval;
  return serverModule;
}

test('error handlers log without exiting', () => {
  process.env.NODE_ENV = 'test';
  const messages = [];
  const originalError = logger.error;
  logger.error = msg => messages.push(msg);
  let exitCalled = false;
  const originalExit = process.exit;
  process.exit = () => { exitCalled = true; };

  loadServer();

  const uncaught = new Error('boom');
  process.emit('uncaughtException', uncaught);
  process.emit('unhandledRejection', 'oops');

  assert.ok(messages.some(m => m.includes('Uncaught Exception: boom')));
  assert.ok(messages.some(m => m.includes('Unhandled Rejection: oops')));
  assert.strictEqual(exitCalled, false);

  logger.error = originalError;
  process.exit = originalExit;
  process.removeAllListeners('uncaughtException');
  process.removeAllListeners('unhandledRejection');
});