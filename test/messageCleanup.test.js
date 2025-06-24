const test = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

function loadServer() {
  const originalSetInterval = global.setInterval;
  global.setInterval = () => ({ unref() {} });

  delete require.cache[require.resolve('../server')];
  const serverModule = require('../server');

  global.setInterval = originalSetInterval;
  return serverModule;
}

test('failed /api/message request cleans up uploaded files', async () => {
  process.env.NODE_ENV = 'test';
  const serverModule = loadServer();
  const app = serverModule.app;

  const uploadsDir = path.join(__dirname, '..', 'uploads', 'cleanupUser');
  fs.rmSync(uploadsDir, { recursive: true, force: true });

  const srv = app.listen(0);
  const port = srv.address().port;

  const form = new FormData();
  form.append('username', 'cleanupUser');
  form.append('files', new Blob(['hi']), 'a.txt');

  const res = await fetch(`http://localhost:${port}/api/message`, {
    method: 'POST',
    body: form
  });
  await res.text();

  const files = fs.existsSync(uploadsDir) ? fs.readdirSync(uploadsDir) : [];
  assert.strictEqual(res.status, 400);
  assert.strictEqual(files.length, 0);

  srv.close();
});
