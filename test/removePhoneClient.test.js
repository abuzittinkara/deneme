const test = require('node:test');
const assert = require('assert');
const { JSDOM } = require('jsdom');

async function setup() {
  const dom = new JSDOM(`<!doctype html>
    <div id="userSettingsPage">
      <div class="settings-main-container">
        <div class="settings-panel">
          <aside class="settings-sidebar">
            <ul class="settings-menu">
              <li class="active" data-section="account">Hesabım</li>
            </ul>
          </aside>
          <div class="settings-content"></div>
        </div>
      </div>
    </div>
    <div id="callScreen"></div>
    <div id="removePhoneConfirmModal">
      <button id="confirmRemovePhoneBtn"></button>
      <button id="cancelRemovePhoneBtn"></button>
      <span id="closeRemovePhoneConfirmModal"></span>
    </div>`);
  global.window = dom.window;
  global.document = dom.window.document;
  global.closeModal = () => {};
  global.openModal = () => {};
  window.Cropper = function(){};
  window.loadAvatar = async () => '';
  const calls = [];
  global.fetch = async (url, opts) => {
    if (!opts) {
      return { ok: true, json: async () => ({ displayName:'d', username:'alice', email:'e', phone:'555' }) };
    }
    calls.push({ url, opts });
    return { ok: true, json: async () => ({}) };
  };
  window.localStorage.setItem('username', 'alice');
  const mod = await import('../public/js/userSettings.js');
  return { mod, calls, dom };
}

test('confirm remove phone updates UI and sends request', async () => {
  const { mod, calls } = await setup();
  mod.openUserSettings();
  await new Promise(r => setTimeout(r, 0));
  const phoneVal = document.querySelector('#phoneRow .info-value');
  assert.strictEqual(phoneVal.textContent, '555');
  document.getElementById('confirmRemovePhoneBtn').click();
  await new Promise(r => setTimeout(r, 0));
  assert.strictEqual(phoneVal.textContent, '—');
  assert.strictEqual(calls.length, 1);
  assert.ok(calls[0].url.includes('/api/user/me'));
  const body = JSON.parse(calls[0].opts.body);
  assert.deepStrictEqual(body, { field: 'phone', value: '' });
});
