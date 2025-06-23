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

test('unread class toggles and mute clears it', async () => {
  const { socket } = await setup();
  window.selectedGroup = 'g1';
  socket.emit('groupsList', [{ id: 'g1', name: 'G1', owner: 'u1' }]);
  socket.emit('roomsList', [{ id: 'c1', name: 'C1', type: 'text', unreadCount: 0 }]);
  const groupItem = window.groupListDiv.querySelector('.grp-item');
  const channelItem = window.roomListDiv.querySelector('.channel-item');
  window.currentTextChannel = null;
  socket.emit('channelUnread', { groupId: 'g1', channelId: 'c1' });
  assert.ok(groupItem.classList.contains('unread'));
  assert.ok(channelItem.classList.contains('unread'));
  socket.emit('channelRead', { groupId: 'g1', channelId: 'c1' });
  assert.ok(!groupItem.classList.contains('unread'));
  assert.ok(!channelItem.classList.contains('unread'));
  socket.emit('channelUnread', { groupId: 'g1', channelId: 'c1' });
  socket.emit('channelMuted', { groupId: 'g1', channelId: 'c1', muteUntil: Date.now() + 1000 });
  assert.ok(channelItem.classList.contains('muted'));
  assert.ok(!channelItem.classList.contains('unread'));
  assert.ok(!groupItem.classList.contains('unread'));
});
