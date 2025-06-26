const test = require('node:test');
const assert = require('assert');
process.env.JWT_SECRET = 'testsecret';
const { sign } = require('../utils/jwt');

function loadServer(User) {
  const originalSetInterval = global.setInterval;
  global.setInterval = () => ({ unref() {} });

  delete require.cache[require.resolve('../models/User')];
  require.cache[require.resolve('../models/User')] = { exports: User };
  delete require.cache[require.resolve('../server')];
  const serverModule = require('../server');

  global.setInterval = originalSetInterval;
  return serverModule;
}

test('PATCH /api/user/me clears phone', async () => {
  process.env.NODE_ENV = 'test';
  let saved = false;
  const userDoc = { username: 'alice', phone: '123', async save() { saved = true; } };
  const User = { async findOne(q) { return q.username === 'alice' ? userDoc : null; } };
  const serverModule = loadServer(User);
  const app = serverModule.app;
  const srv = app.listen(0);
  const port = srv.address().port;

  const token = sign({ username: 'alice' });

  const res = await fetch(`http://localhost:${port}/api/user/me`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ field: 'phone', value: '' })
  });
  await res.json();

  assert.strictEqual(res.status, 200);
  assert.ok(saved);
  assert.strictEqual(userDoc.phone, undefined);

  srv.close();
});
