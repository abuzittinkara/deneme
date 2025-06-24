const test = require('node:test');
const assert = require('assert');
const { EventEmitter } = require('events');
const { JSDOM } = require('jsdom');

async function setup() {
  const dom = new JSDOM('<!doctype html><div id="groupList"></div><div id="roomList"></div><div id="groupTitle"></div><div id="selectedChannelTitle"></div>');
  global.window = dom.window;
  global.document = dom.window.document;
  window.groupListDiv = document.getElementById('groupList');
  window.roomListDiv = document.getElementById('roomList');
  window.groupTitle = document.getElementById('groupTitle');
  window.selectedChannelTitle = document.getElementById('selectedChannelTitle');
  window.textChannelContainer = document.createElement('div');
  window.hideVoiceSections = () => {};
  window.loadAvatar = async () => '/a.png';
  window.showGroupContextMenu = () => {};
  window.showChannelContextMenu = () => {};
  window.updateVoiceChannelUI = () => {};
  window.joinRoom = () => {};
  window.clearScreenShareUI = () => {};
  window.applyAudioStates = () => {};
  window.showChannelStatusPanel = () => {};
  window.textMessages = document.createElement('div');
  window.showNotificationSubMenu = function(target, type) {
    const existing = document.getElementById('notifySubMenu');
    if (existing) existing.remove();
    window.openNotifyTarget = target;
    window.openNotifyType = type;
    const subMenu = document.createElement('div');
    subMenu.id = 'notifySubMenu';
    const opts = [
      { label: 'B\u00fct\u00fcn mesajlar', value: 'all' },
      { label: 'Sadece bahsetmeler', value: 'mentions' },
      { label: 'Hi\u00e7bir \u015fey', value: 'nothing' }
    ];
    const gid = type === 'group' ? target.dataset.groupId : window.selectedGroup;
    const cid = type === 'channel' ? target.dataset.channelId : null;
    let selected = 'all';
    if (type === 'channel' && window.channelNotifyType[gid]) {
      selected = window.channelNotifyType[gid][cid] || selected;
    } else if (type === 'group') {
      selected = window.groupNotifyType[gid] || selected;
    }
    opts.forEach(o => {
      const item = document.createElement('div');
      item.className = 'context-menu-item';
      item.textContent = o.label;
      if (o.value === selected) {
        const check = document.createElement('span');
        check.classList.add('material-icons');
        check.textContent = 'check';
        item.appendChild(check);
      }
      subMenu.appendChild(item);
    });
    document.body.appendChild(subMenu);
  };
  const mod = await import('../public/js/socketEvents.js');
  const socket = new EventEmitter();
  mod.initSocketEvents(socket);
  return { socket };
}

function getCheckedLabel() {
  const items = document.querySelectorAll('#notifySubMenu .context-menu-item');
  for (const it of items) {
    if (it.querySelector('span')) return it.textContent.trim();
  }
  return null;
}

test('initial notify type shows check mark', async () => {
  const { socket } = await setup();
  window.selectedGroup = 'g1';
  socket.emit('activeNotifyTypes', { g1: { notificationType: 'mentions', channelNotificationType: { ch1: 'nothing' } } });
  const target = document.createElement('div');
  target.dataset.groupId = 'g1';
  window.showNotificationSubMenu(target, 'group');
  assert.ok(getCheckedLabel().startsWith('Sadece bahsetmeler'));

  const cTarget = document.createElement('div');
  cTarget.dataset.groupId = 'g1';
  cTarget.dataset.channelId = 'ch1';
  window.showNotificationSubMenu(cTarget, 'channel');
  assert.ok(getCheckedLabel().startsWith('Hi\u00e7bir \u015fey'));
});

test('notify update refreshes open menu', async () => {
  const { socket } = await setup();
  window.selectedGroup = 'g1';
  socket.emit('activeNotifyTypes', { g1: { notificationType: 'mentions' } });
  const target = document.createElement('div');
  target.dataset.groupId = 'g1';
  window.showNotificationSubMenu(target, 'group');
  assert.ok(getCheckedLabel().startsWith('Sadece bahsetmeler'));
  socket.emit('groupNotifyTypeUpdated', { groupId: 'g1', type: 'nothing' });
  assert.ok(getCheckedLabel().startsWith('Hi\u00e7bir \u015fey'));
});
