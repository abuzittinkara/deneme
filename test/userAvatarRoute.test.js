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

test('GET /api/user/avatar returns avatar for existing user', async () => {
  process.env.NODE_ENV = 'test';
  const userDoc = { username: 'alice', avatar: 'a.png' };
  const User = { async findOne(q) { return q.username === 'alice' ? userDoc : null; } };
  const { app } = loadServer(User);
  const srv = app.listen(0);
  const port = srv.address().port;

  const token = sign({ username: 'any' });

  const res = await fetch(`http://localhost:${port}/api/user/avatar?username=alice`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const body = await res.json();

  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(body, { avatar: 'a.png' });

  srv.close();
});

test('GET /api/user/avatar returns 404 for missing user', async () => {
  process.env.NODE_ENV = 'test';
  const User = { async findOne() { return null; } };
  const { app } = loadServer(User);
  const srv = app.listen(0);
  const port = srv.address().port;

  const token = sign({ username: 'x' });

  const res = await fetch(`http://localhost:${port}/api/user/avatar?username=ghost`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const body = await res.json();

  assert.strictEqual(res.status, 404);
  assert.deepStrictEqual(body, { error: 'not found' });

  srv.close();
});

test('POST /api/user/avatar updates avatar', async () => {
  process.env.NODE_ENV = 'test';
  let saved = false;
  const userDoc = { username: 'bob', avatar: 'old.png', async save() { saved = true; } };
  const User = { async findOne(q) { return q.username === 'bob' ? userDoc : null; } };
  const { app } = loadServer(User);
  const srv = app.listen(0);
  const port = srv.address().port;

  const token = sign({ username: 'x' });

  const res = await fetch(`http://localhost:${port}/api/user/avatar?username=bob`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ avatar: 'new.png' })
  });
  const body = await res.json();

  assert.strictEqual(res.status, 200);
  assert.ok(saved);
  assert.strictEqual(userDoc.avatar, 'new.png');
  assert.deepStrictEqual(body, { success: true });

  srv.close();
});

