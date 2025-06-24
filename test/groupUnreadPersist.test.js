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
  const mod = await import('../public/js/socketEvents.js');
  const socket = new EventEmitter();
  mod.initSocketEvents(socket);
  return { socket };
}

test('group unread dot persists until channel read', async () => {
  const { socket } = await setup();
  const emitted = [];
  socket.on('markChannelRead', (p) => emitted.push(p));
  window.selectedGroup = 'g1';
  socket.emit('groupsList', [{ id: 'g1', name: 'G1', owner: 'u1' }]);
  socket.emit('roomsList', [
    { id: 'c1', name: 'C1', type: 'text', unreadCount: 1 },
    { id: 'c2', name: 'C2', type: 'text', unreadCount: 0 }
  ]);
  const groupItem = window.groupListDiv.querySelector('[data-group-id="g1"]');
  const ch1 = window.roomListDiv.querySelector('[data-room-id="c1"]');
  const dotBefore = groupItem.querySelector('.unread-dot');
  assert.ok(dotBefore, 'dot exists before clicking');

  ch1.dispatchEvent(new window.Event('click', { bubbles: true }));

  const dotAfterClick = groupItem.querySelector('.unread-dot');
  assert.ok(dotAfterClick, 'dot persists after switch');
  assert.strictEqual(emitted.length, 0, 'no markChannelRead emitted on switch');

  window.textMessages.clientHeight = 100;
  window.textMessages.scrollHeight = 100;
  window.textMessages.scrollTop = 0;
  window.textMessages.dispatchEvent(new window.Event('scroll', { bubbles: true }));

  assert.strictEqual(emitted.length, 1, 'markChannelRead emitted after scroll');
  socket.emit('channelRead', { groupId: 'g1', channelId: 'c1' });
  const dotAfterRead = groupItem.querySelector('.unread-dot');
  assert.ok(!dotAfterRead, 'dot removed after read');
});
