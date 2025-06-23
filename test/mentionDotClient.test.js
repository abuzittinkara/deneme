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

test('mention dot added and removed correctly', async () => {
  const { socket } = await setup();
  window.selectedGroup = 'g1';
  socket.emit('groupsList', [{ id: 'g1', name: 'G1', owner: 'u1' }]);
  socket.emit('roomsList', [
    { id: 'c1', name: 'C1', type: 'text', unreadCount: 0 },
    { id: 'c2', name: 'C2', type: 'text', unreadCount: 0 }
  ]);
  window.currentTextChannel = 'c2';
  socket.emit('channelUnread', { groupId: 'g1', channelId: 'c2' });
  socket.emit('channelUnread', { groupId: 'g1', channelId: 'c1' });
  socket.emit('mentionUnread', { groupId: 'g1', channelId: 'c1' });
  const groupItem = window.groupListDiv.querySelector('.grp-item');
  const mentionDot = groupItem.querySelector('.unread-dot');
  assert.ok(mentionDot.classList.contains('mention-dot'));
  const ch1 = window.roomListDiv.querySelector('[data-room-id="c1"]');
  const cDot = ch1.querySelector('.unread-dot');
  assert.ok(cDot.classList.contains('mention-dot'));
  socket.emit('channelRead', { groupId: 'g1', channelId: 'c1' });
  const gDot = groupItem.querySelector('.unread-dot');
  assert.ok(gDot && !gDot.classList.contains('mention-dot'));
});
