const test = require('node:test');
const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');
const { EventEmitter } = require('events');

class Node {
  constructor() {
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
  }
  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
  }
  contains(node) {
    if (this === node) return true;
    return this.children.some(c => c.contains(node));
  }
  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentNode = null;
    }
  }
}

test('screenShareEnded clears elements', async () => {
  const channelArea = new Node();
  const otherParent = new Node();
  global.document = {
    querySelector(sel) {
      if (sel === '.channel-content-area') return channelArea;
      return null;
    }
  };
  global.window = {};

  const webrtc = await import(pathToFileURL(path.join(__dirname, '../public/js/webrtc.js')));
  global.WebRTC = webrtc;

  const { initSocketEvents } = await import(pathToFileURL(path.join(__dirname, '../public/js/socketEvents.js')));
  const socket = new EventEmitter();
  initSocketEvents(socket);

  // Case 1: video directly inside channelContentArea, no clearScreenShareUI
  const vid1 = new Node();
  webrtc.setScreenShareVideo(vid1);
  channelArea.appendChild(vid1);
  socket.emit('screenShareEnded', { userId: 'u1', username: 'A' });
  assert.strictEqual(channelArea.children.length, 0);

  // Case 2: container in another parent with clearScreenShareUI defined
  window.clearScreenShareUI = function () {
    if (webrtc.screenShareContainer) {
      if (webrtc.screenShareContainer.parentNode) {
        webrtc.screenShareContainer.parentNode.removeChild(webrtc.screenShareContainer);
      }
      webrtc.setScreenShareContainer(null);
      webrtc.setScreenShareVideo(null);
    } else if (webrtc.screenShareVideo) {
      if (webrtc.screenShareVideo.parentNode) {
        webrtc.screenShareVideo.parentNode.removeChild(webrtc.screenShareVideo);
      }
      webrtc.setScreenShareVideo(null);
    }
  };

  const vid2 = new Node();
  const container = new Node();
  container.appendChild(vid2);
  otherParent.appendChild(container);
  webrtc.setScreenShareVideo(vid2);
  webrtc.setScreenShareContainer(container);

  socket.emit('screenShareEnded', { userId: 'u2', username: 'B' });
  assert.strictEqual(otherParent.children.length, 0);
});