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

test('GET /api/user/profile returns profile data for existing user', async () => {
  process.env.NODE_ENV = 'test';
  const userDoc = { username: 'alice', name: 'Alice', avatar: 'avatar.png', badges: ['x'] };
  const User = { async findOne(q) { return q.username === 'alice' ? userDoc : null; } };
  const { app } = loadServer(User);
  const srv = app.listen(0);
  const port = srv.address().port;

  const token = sign({ username: 'bob' });

  const res = await fetch(`http://localhost:${port}/api/user/profile?username=alice`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const body = await res.json();

  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(body, {
    displayName: 'Alice',
    avatar: 'avatar.png',
    badges: ['x']
  });

  srv.close();
});
