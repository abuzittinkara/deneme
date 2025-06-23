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

test('mention dot persists after switching groups', async () => {
  const { socket } = await setup();
  window.selectedGroup = 'g2';
  socket.emit('groupsList', [
    { id: 'g1', name: 'G1', owner: 'u1' },
    { id: 'g2', name: 'G2', owner: 'u2' }
  ]);
  socket.emit('channelUnread', { groupId: 'g1', channelId: 'c1' });
  socket.emit('mentionUnread', { groupId: 'g1', channelId: 'c1' });
  window.selectedGroup = 'g1';
  socket.emit('roomsList', [
    { id: 'c1', name: 'C1', type: 'text', unreadCount: 1 }
  ]);
  const ch1 = window.roomListDiv.querySelector('[data-room-id="c1"]');
  const dot = ch1.querySelector('.unread-dot');
  assert.ok(dot.classList.contains('mention-dot'));
});
