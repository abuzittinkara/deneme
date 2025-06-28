const test = require('node:test');
const assert = require('assert');

function loadServer() {
  const originalSetInterval = global.setInterval;
  global.setInterval = () => ({ unref() {} });

  delete require.cache[require.resolve('../server')];
  const serverModule = require('../server');

  global.setInterval = originalSetInterval;
  return serverModule;
}

test('unknown route returns 404 json', async () => {
  process.env.NODE_ENV = 'test';
  const { app } = loadServer();
  const srv = app.listen(0);
  const port = srv.address().port;

  const res = await fetch(`http://localhost:${port}/does-not-exist`);
  const body = await res.json();

  assert.strictEqual(res.status, 404);
  assert.deepStrictEqual(body, { error: 'not found' });

  srv.close();
});
