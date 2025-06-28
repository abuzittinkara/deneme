/**************************************
 * script.js
 * TAMAMEN SFU MANTIĞINA GEÇİLMİŞ VERSİYON
 **************************************/

function clearScreenShareUI() {
  const channelContentArea = document.querySelector('.channel-content-area');
  if (WebRTC.screenShareContainer) {
    if (WebRTC.screenShareContainer.parentNode) {
      WebRTC.screenShareContainer.parentNode.removeChild(WebRTC.screenShareContainer);
    }
    WebRTC.setScreenShareContainer(null);
    WebRTC.setScreenShareVideo(null);
  } else if (WebRTC.screenShareVideo) {
    if (WebRTC.screenShareVideo.parentNode) {
      WebRTC.screenShareVideo.parentNode.removeChild(WebRTC.screenShareVideo);
    }
    WebRTC.setScreenShareVideo(null);
  }
  if (!window.screenShareProducerVideo && screenShareButton) {
    screenShareButton.classList.remove('active');
    const smallIcon = screenShareButton.querySelector('.material-icons');
    if (smallIcon) smallIcon.textContent = 'desktop_windows';
  }
  if (!window.screenShareProducerVideo && screenShareLargeButton) {
    screenShareLargeButton.classList.remove('active');
    const largeIcon = screenShareLargeButton.querySelector('.material-icons, .material-icons-outlined');
    if (largeIcon) largeIcon.textContent = 'desktop_windows';
  }
  const overlay = document.getElementById('screenShareOverlay');
  if (overlay && overlay.parentNode) {
    overlay.parentNode.removeChild(overlay);
  }
  if (window.removeScreenShareEndedMessage) {
    window.removeScreenShareEndedMessage();
  }
  const container = document.getElementById('channelUsersContainer');
  if (container) {
    container.classList.remove('broadcast-mode');
    container.style.display = 'grid';
    container.style.flexDirection = '';
    container.style.justifyContent = '';
  }
  window.broadcastingUserId = null;
  if (
    window.latestChannelsData &&
    window.currentRoom &&
    typeof window.renderVoiceChannelGrid === 'function' &&
    window.latestChannelsData[window.currentRoom]
  ) {
    window.renderVoiceChannelGrid(
      window.latestChannelsData[window.currentRoom].users,
    );
  }
}
window.clearScreenShareUI = clearScreenShareUI;

import * as TextChannel from './js/textChannel.js';
import * as ScreenShare from './js/screenShare.js';
import { initTypingIndicator } from './js/typingIndicator.js';
import { initFriendRequests } from './js/friendRequests.js';
import * as Ping from './js/ping.js';
import * as UserList from './js/userList.js';
import { initUIEvents } from "./js/uiEvents.js";
import { initSocketEvents } from "./js/socketEvents.js";
import * as WebRTC from "./js/webrtc.js";
import { applyAudioStates } from "./js/audioUtils.js";
import { initUserSettings, openUserSettings, closeUserSettings } from "./js/userSettings.js";
import { showProfilePopout, initProfilePopout } from "./js/profilePopout.js";
import { initAttachments } from "./js/attachments.js";
import { attemptLogin, attemptRegister } from "./js/auth.js";

let socket = null;
let device = null;   // mediasoup-client Device

// Kimlik
let username = null;
let currentGroup = null;
let currentRoom = null;
let selectedGroup = localStorage.getItem('lastGroupId') || null;
let currentTextChannel = null; // Metin kanalı için seçili kanal id'si
let currentRoomType = null;    // "voice" veya "text"

// Yeni: Kullanıcının sesli kanala bağlandığı kanalın adını saklayacak değişken
let activeVoiceChannelName = "";
// Yeni: Kullanıcının bağlı olduğu sesli kanalın grubunun adını saklayacak değişken
let activeVoiceGroupName = "";

// Mikrofon / Kulaklık
let micEnabled = true;
let selfDeafened = false;
let micWasEnabledBeforeDeaf = false;
let hasMic = true;

window.getAuthToken = function() {
  try {
    const token = localStorage.getItem('token');
    if (token) return token;
  } catch (e) {}
  return socket && socket.auth && socket.auth.token ? socket.auth.token : null;
};

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').then(reg => {
    window.swRegistration = reg;
  }).catch(err => console.warn('Service worker registration failed', err));
}

window.cacheUploadUrls = function(urls) {
  if (!Array.isArray(urls) || !urls.length || !navigator.serviceWorker) return;
  const send = reg => { reg.active && reg.active.postMessage({ type: 'cache-uploads', urls }); };
  if (window.swRegistration) {
    send(window.swRegistration);
  } else {
    navigator.serviceWorker.getRegistration('/sw.js').then(reg => { if (reg) send(reg); });
  }
};
window.userAvatars = {};
window.loadAvatar = async function(username) {
  if (!username) return null;
  if (window.userAvatars[username]) return window.userAvatars[username];
  try {
    let token = window.getAuthToken();
    let headers = token ? { Authorization: `Bearer ${token}` } : undefined;

    let resp = await fetch(
      `/api/user/avatar?username=${encodeURIComponent(username)}`,
      { headers }
    );

    if (resp.status === 401) {
      const retryToken = window.getAuthToken();
      if (!token && retryToken) {
        resp = await fetch(
          `/api/user/avatar?username=${encodeURIComponent(username)}`,
          { headers: { Authorization: `Bearer ${retryToken}` } }
        );
      }
    }

    if (resp.ok) {
      const data = await resp.json();
      window.userAvatars[username] = data.avatar || '/images/default-avatar.png';
    } else {
      window.userAvatars[username] = '/images/default-avatar.png';
    }
  } catch (e) {
    window.userAvatars[username] = '/images/default-avatar.png';
  }
  return window.userAvatars[username];
};

// Stores local notification preferences
window.groupNotifyType = {};
window.channelNotifyType = {};
window.openNotifyTarget = null;
window.openNotifyType = null;

/* Formatlama fonksiyonları artık TextChannel modülünden sağlanıyor */

// Gruplar, Odalar
let groupListDiv;
let createGroupButton;
let roomListDiv;
let groupTitle;
let groupDropdownIcon;
let groupDropdownMenu;
let copyGroupIdBtn;
let renameGroupBtn;
let createChannelBtn;
let deleteGroupBtn;
let groupSettingsBtn;
let leaveGroupBtn;

// DM panel ve odalar alanı (kanallar paneli)
let toggleDMButton;
let roomPanel;
let isDMMode = false;

// Sağ panel
let rightPanel;
// Kullanıcı listesi (rightPanel içinde)
let userListDiv;
let toggleUserListButton;

// Kanal Durum Paneli
let channelStatusPanel;
let connectionStatusText;
let pingValueSpan;
let cellBar1;
let cellBar2;
let cellBar3;
let cellBar4;
let connectionHeader;
let channelInfoRow;
let buttonRow;
let panelDivider;
let userCard;

function showVoiceSections() {
  if (connectionHeader) connectionHeader.style.display = 'flex';
  if (channelInfoRow) channelInfoRow.style.display = 'flex';
  if (buttonRow) buttonRow.style.display = 'flex';
  if (panelDivider) panelDivider.style.display = 'block';
  if (userCard) userCard.style.display = 'flex';
}

function hideVoiceSections() {
  if (connectionHeader) connectionHeader.style.display = 'none';
  if (channelInfoRow) channelInfoRow.style.display = 'none';
  if (buttonRow) buttonRow.style.display = 'none';
  if (panelDivider) panelDivider.style.display = 'none';
  if (userCard) userCard.style.display = 'flex';
}

function setConnectionStatus(state) {
  if (!connectionStatusText) return;
  connectionStatusText.classList.remove('status-connected', 'status-connecting');
  if (state === 'connected') {
    connectionStatusText.textContent = 'Kanala bağlanıldı';
    connectionStatusText.classList.add('status-connected');
  } else {
    connectionStatusText.textContent = 'RTC Bağlanıyor';
    connectionStatusText.classList.add('status-connecting');
  }
}

function showChannelStatusPanel() {
  if (window.currentRoomType !== 'voice') return;
  if (channelStatusPanel) {
    channelStatusPanel.style.display = 'flex';
    showVoiceSections();
  }
  setConnectionStatus('connecting');
  Ping.updateStatusPanel(0);
  Ping.startPingInterval(socket);
}

function hideChannelStatusPanel() {
  if (channelStatusPanel) {
    channelStatusPanel.style.display = 'none';
  }
  Ping.stopPingInterval();
}
window.showChannelStatusPanel = showChannelStatusPanel;
window.hideChannelStatusPanel = hideChannelStatusPanel;
window.setConnectionStatus = setConnectionStatus;
window.showVoiceSections = showVoiceSections;
window.hideVoiceSections = hideVoiceSections;

// Ayrıl Butonu
let leaveButton;
let screenShareButton;
let cameraShareButton;
let screenShareLargeButton;
let soundbarButton;

// Mikrofon / Kulaklık butonları
let micToggleButton;
let deafenToggleButton;
let settingsButton;

// Metin Kanalı Elemanları
let textChannelContainer;
let textMessages;
let textChatInputBar;
let textChannelMessageInput;
let micMessageBtn;
let sendTextMessageBtn;

// Ek: Seçili başlık ve ana içerik alanı
let selectedChannelTitle;
let channelContentArea;

// Yeni: DM modunda kullanılacak content alanı (selectedDMBar altında)
let dmContentArea;

// "dmPanel" yine mevcut (display:none); DM paneli, dmChatSearchInput öğesini barındıracak
let dmPanel;
// Modal elements for group creation/joining
let groupModal;
let modalGroupCreateBtn;
let modalGroupJoinBtn;
let actualGroupCreateModal;
let actualGroupName;
let actualGroupNameBtn;
let closeCreateGroupModal;
let joinGroupModal;
let joinGroupIdInput;
let joinGroupIdBtn;
let closeJoinGroupModal;
let groupSettingsModal;
let closeGroupSettingsModal;
let userSettingsPage;
let closeUserSettingsPageBtn;
let roomModal;
let modalRoomName;
let textChannel;
let voiceChannel;
let modalCreateRoomBtn;
let modalCloseRoomBtn;
let createCategoryBtn;
let categoryModal;
let modalCategoryName;
let modalCreateCategoryBtn;
let modalCloseCategoryBtn;

window.WebRTC = WebRTC;
window.joinRoom = WebRTC.joinRoom;
window.leaveRoomInternal = WebRTC.leaveRoomInternal;
const _leaveRoomInternal = window.leaveRoomInternal;
window.leaveRoomInternal = function (...args) {
  if (window.channelAreaResizeObserver) {
    window.channelAreaResizeObserver.disconnect();
    window.channelAreaResizeObserver = null;
  }
  if (window.channelAreaResizeHandler) {
    window.removeEventListener('resize', window.channelAreaResizeHandler);
    window.channelAreaResizeHandler = null;
  }
  return _leaveRoomInternal.apply(this, args);
};
['device','deviceIsLoaded','sendTransport','recvTransport','localStream','audioPermissionGranted','localProducer','consumers','remoteAudios','screenShareVideo','screenShareContainer'].forEach((prop)=>{
  Object.defineProperty(window, prop, {
    get() { return WebRTC[prop]; },
    set(v) {
      if (prop === 'screenShareVideo') WebRTC.setScreenShareVideo(v);
      else if (prop === 'screenShareContainer') WebRTC.setScreenShareContainer(v);
      else WebRTC[prop] = v;
    }
  });
});
Object.assign(window, {selectedGroup, currentGroup, currentRoom, currentTextChannel, currentRoomType, activeVoiceChannelName, activeVoiceGroupName, micEnabled, selfDeafened, micWasEnabledBeforeDeaf, hasMic});
window.applyAudioStates = (opts) => {
  if (!opts) {
    opts = {
      localProducer: WebRTC.localProducer,
      localStream: WebRTC.localStream,
      socket,
      micEnabled: window.micEnabled,
      selfDeafened: window.selfDeafened,
      micToggleButton,
      deafenToggleButton,
      remoteAudios: WebRTC.remoteAudios,
      hasMic: window.hasMic,
    };
  }
  applyAudioStates(opts);
};
window.addEventListener('DOMContentLoaded', () => {
  // Query DOM elements once the page has loaded
  groupListDiv = document.getElementById('groupList');
  createGroupButton = document.getElementById('createGroupButton');
  roomListDiv = document.getElementById('roomList');
  groupTitle = document.getElementById('groupTitle');
  groupDropdownIcon = document.getElementById('groupDropdownIcon');
  groupDropdownMenu = document.getElementById('groupDropdownMenu');
  copyGroupIdBtn = document.getElementById('copyGroupIdBtn');
  renameGroupBtn = document.getElementById('renameGroupBtn');
  createChannelBtn = document.getElementById('createChannelBtn');
  deleteGroupBtn = document.getElementById('deleteGroupBtn');
  groupSettingsBtn = document.getElementById('groupSettingsBtn');
  leaveGroupBtn = document.getElementById('leaveGroupBtn');

  toggleDMButton = document.getElementById('toggleDMButton');
  roomPanel = document.getElementById('roomPanel');

  rightPanel = document.getElementById('rightPanel');
  userListDiv = document.getElementById('userList');
  toggleUserListButton = document.getElementById('toggleUserListButton');

  channelStatusPanel = document.getElementById('channelStatusPanel');
  connectionStatusText = document.getElementById('connectionStatusText');
  pingValueSpan = document.getElementById('pingValue');
  cellBar1 = document.getElementById('cellBar1');
  cellBar2 = document.getElementById('cellBar2');
  cellBar3 = document.getElementById('cellBar3');
  cellBar4 = document.getElementById('cellBar4');
  if (channelStatusPanel) {
    channelStatusPanel.style.zIndex = '20';
    channelStatusPanel.style.display = 'flex';
    connectionHeader = channelStatusPanel.querySelector('.connection-header');
    channelInfoRow = channelStatusPanel.querySelector('.channel-info-row');
    buttonRow = channelStatusPanel.querySelector('.button-row');
    panelDivider = channelStatusPanel.querySelector('.panel-divider');
    userCard = channelStatusPanel.querySelector('.user-card');
  }

  leaveButton = document.getElementById('leaveButton');
  screenShareButton = document.getElementById('screenShareButton');
  cameraShareButton = document.getElementById('cameraShareButton');
  screenShareLargeButton = document.getElementById('screenShareLargeButton');
  soundbarButton = document.getElementById('soundbarButton');

  micToggleButton = document.getElementById('micToggleButton');
  deafenToggleButton = document.getElementById('deafenToggleButton');
  settingsButton = document.getElementById('settingsButton');

  textChannelContainer = document.getElementById('textChannelContainer');
  textMessages = document.getElementById('textMessages');
  textChatInputBar = document.getElementById('textChatInputBar');
  textChannelMessageInput = document.getElementById('textChannelMessageInput');
  micMessageBtn = document.getElementById('micMessageBtn');
  sendTextMessageBtn = document.getElementById('sendTextMessageBtn');

  selectedChannelTitle = document.getElementById('selectedChannelTitle');
  channelContentArea = document.getElementById('channelContentArea');
  dmContentArea = document.getElementById('dmContentArea');

  dmPanel = document.getElementById('dmPanel');
  groupModal = document.getElementById('groupModal');
  modalGroupCreateBtn = document.getElementById('modalGroupCreateBtn');
  modalGroupJoinBtn = document.getElementById('modalGroupJoinBtn');
  actualGroupCreateModal = document.getElementById('actualGroupCreateModal');
  actualGroupName = document.getElementById('actualGroupName');
  actualGroupNameBtn = document.getElementById('actualGroupNameBtn');
  closeCreateGroupModal = document.getElementById('closeCreateGroupModal');
  joinGroupModal = document.getElementById('joinGroupModal');
  joinGroupIdInput = document.getElementById('joinGroupIdInput');
  joinGroupIdBtn = document.getElementById('joinGroupIdBtn');
  closeJoinGroupModal = document.getElementById('closeJoinGroupModal');
  groupSettingsModal = document.getElementById('groupSettingsModal');
  closeGroupSettingsModal = document.getElementById('closeGroupSettingsModal');
  userSettingsPage = document.getElementById('userSettingsPage');
  closeUserSettingsPageBtn = document.getElementById('closeUserSettingsPageBtn');
  roomModal = document.getElementById('roomModal');
  modalRoomName = document.getElementById('modalRoomName');
  textChannel = document.getElementById('textChannel');
  voiceChannel = document.getElementById('voiceChannel');
  modalCreateRoomBtn = document.getElementById('modalCreateRoomBtn');
  modalCloseRoomBtn = document.getElementById('modalCloseRoomBtn');
  createCategoryBtn = document.getElementById('createCategoryBtn');
  categoryModal = document.getElementById('categoryModal');
  modalCategoryName = document.getElementById('modalCategoryName');
  modalCreateCategoryBtn = document.getElementById('modalCreateCategoryBtn');
  modalCloseCategoryBtn = document.getElementById('modalCloseCategoryBtn');

  Object.assign(window, {
    groupListDiv,
    createGroupButton,
    roomListDiv,
    groupTitle,
    groupDropdownIcon,
    groupDropdownMenu,
    copyGroupIdBtn,
    renameGroupBtn,
    createChannelBtn,
    groupSettingsBtn,
    leaveGroupBtn,
    deleteGroupBtn,
    toggleDMButton,
    roomPanel,
    rightPanel,
    leaveButton,
    screenShareButton,
    micToggleButton,
    deafenToggleButton,
    settingsButton,
    textChannelContainer,
    textMessages,
    textChatInputBar,
    textChannelMessageInput,
    micMessageBtn,
    sendTextMessageBtn,
    selectedChannelTitle,
    channelContentArea,
    dmContentArea,
    dmPanel,
    cameraShareButton,
    screenShareLargeButton,
    toggleUserListButton,
    soundbarButton,
    groupModal,
    modalGroupCreateBtn,
    modalGroupJoinBtn,
    actualGroupCreateModal,
    actualGroupName,
    actualGroupNameBtn,
    closeCreateGroupModal,
    joinGroupModal,
    joinGroupIdInput,
    joinGroupIdBtn,
    closeJoinGroupModal,
    groupSettingsModal,
    closeGroupSettingsModal,
    userSettingsPage,
    closeUserSettingsPageBtn,
    roomModal,
    modalRoomName,
    textChannel,
    voiceChannel,
    modalCreateRoomBtn,
    modalCloseRoomBtn,
    createCategoryBtn,
    categoryModal,
    modalCategoryName,
    modalCreateCategoryBtn,
    modalCloseCategoryBtn,
    attemptLogin,
    attemptRegister
  });

  if (toggleDMButton) {
    toggleDMButton.querySelector('.material-icons').textContent = 'forum';
  }

  // Hide voice channel sections until a voice channel is joined
  hideVoiceSections();

  const socketURL = window.SOCKET_URL || window.location.origin;
  const savedToken = (() => { try { return localStorage.getItem('token'); } catch (e) { return null; } })();
  if (window.socket) {
    socket = window.socket;
  } else {
    socket = io(socketURL, { transports: ['websocket'], auth: savedToken ? { token: savedToken } : {} });
    window.socket = socket;
  }
  initSocketEvents(socket);
  initProfilePopout(socket);
  initUIEvents(socket);
  initTypingIndicator(socket, () => window.currentTextChannel, () => window.username);
  initFriendRequests(socket);
  initUserSettings();
  initAttachments();

  const area = document.getElementById('channelContentArea');
  const resizeCb = () => {
    if (
      window.currentRoomType === 'voice' &&
      window.latestChannelsData &&
      window.latestChannelsData[window.currentRoom]
    ) {
      window.renderVoiceChannelGrid(
        window.latestChannelsData[window.currentRoom].users
      );
    }
  };
  if (area) {
    if ('ResizeObserver' in window) {
      window.channelAreaResizeObserver = new ResizeObserver(resizeCb);
      window.channelAreaResizeObserver.observe(area);
    } else {
      window.channelAreaResizeHandler = resizeCb;
      window.addEventListener('resize', window.channelAreaResizeHandler);
    }
  }  

  const tm = textMessages;
  let removeScrollingTimeout;
  if (tm) {
    tm.addEventListener('scroll', function() {
      const atBottom = tm.scrollTop + tm.clientHeight >= tm.scrollHeight - 5;
      if (!atBottom) {
        clearTimeout(removeScrollingTimeout);
        tm.classList.add('scrolling');
      } else {
        removeScrollingTimeout = setTimeout(() => {
          const stillAtBottom = tm.scrollTop + tm.clientHeight >= tm.scrollHeight - 5;
          if (stillAtBottom) {
            tm.classList.remove('scrolling');
          }
        }, 1000);
      }
    });
  }
  
  TextChannel.initTextChannelEvents(socket, textMessages);

  document.addEventListener('click', function(e) {
    if(e.target && e.target.classList.contains('dm-filter-item')) {
      const filter = e.target.getAttribute('data-filter');
      console.info('DM Filter clicked: ' + filter);
    }
  });
});

/* Yeni fonksiyon: Context Menu Gösterimi */
function showMuteSubMenu(target, type) {
  const existing = document.getElementById('muteSubMenu');
  if (existing) existing.remove();
  const subMenu = document.createElement('div');
  subMenu.id = 'muteSubMenu';
  subMenu.className = 'context-menu';
  subMenu.style.position = 'absolute';
  const rect = target.getBoundingClientRect();
  subMenu.style.top = rect.top + 'px';
  subMenu.style.left = rect.right + 'px';
  subMenu.style.display = 'flex';
  subMenu.style.flexDirection = 'column';

  const durations = [
    { label: '15 dakika', ms: 15 * 60 * 1000 },
    { label: '30 dakika', ms: 30 * 60 * 1000 },
    { label: '1 saat', ms: 60 * 60 * 1000 },
    { label: '3 saat', ms: 3 * 60 * 60 * 1000 },
    { label: '8 saat', ms: 8 * 60 * 60 * 1000 },
    { label: '24 saat', ms: 24 * 60 * 60 * 1000 },
    { label: 'Ben tekrar açana kadar', ms: -1 }
  ];

  durations.forEach(d => {
    const item = document.createElement('div');
    item.className = 'context-menu-item';
    item.textContent = d.label;
    item.addEventListener('click', () => {
      if (type === 'channel') {
        const gid = window.selectedGroup;
        const cid = target.dataset.channelId;
        socket.emit('muteChannel', { groupId: gid, channelId: cid, duration: d.ms });
        if (!window.channelMuteUntil[gid]) window.channelMuteUntil[gid] = {};
        if (d.ms > 0) {
          window.channelMuteUntil[gid][cid] = Date.now() + d.ms;
        } else if (d.ms === -1) {
          window.channelMuteUntil[gid][cid] = Infinity;
        } else {
          delete window.channelMuteUntil[gid][cid];
        }
        if (gid === window.selectedGroup) {
          const el = document.querySelector(`.channel-item[data-room-id="${cid}"]`);
          if (el) {
            if (d.ms > 0 || d.ms === -1) el.classList.add('muted', 'channel-muted');
            else el.classList.remove('muted', 'channel-muted');
          }
        }
      } else if (type === 'group') {
        const gid = target.dataset.groupId;
        socket.emit('muteGroup', { groupId: gid, duration: d.ms });
      } else if (type === 'category') {
        const cid = target.dataset.categoryId;
        socket.emit('muteCategory', { groupId: window.selectedGroup, categoryId: cid, duration: d.ms });
      }
      subMenu.remove();
      const ctxId = type === 'channel' ? 'channelContextMenu' : type === 'group' ? 'groupContextMenu' : 'categoryContextMenu';
      const ctx = document.getElementById(ctxId);
      if (ctx) ctx.remove();
    });
    subMenu.appendChild(item);
  });

  document.body.appendChild(subMenu);
  const removeIfOutside = e => {
    const to = e.relatedTarget;
    if (!target.contains(to) && !subMenu.contains(to)) {
      subMenu.remove();
      target.removeEventListener('mouseleave', removeIfOutside);
      subMenu.removeEventListener('mouseleave', removeIfOutside);
    }
  };

  target.addEventListener('mouseleave', removeIfOutside);
  subMenu.addEventListener('mouseleave', removeIfOutside);

  document.addEventListener('click', function handler() {
    const m = document.getElementById('muteSubMenu');
    if (m) m.remove();
    document.removeEventListener('click', handler);
  });
}
window.showMuteSubMenu = showMuteSubMenu;

function showNotificationSubMenu(target, type) {
  const existing = document.getElementById('notifySubMenu');
  if (existing) existing.remove();
  window.openNotifyTarget = target;
  window.openNotifyType = type;
  const subMenu = document.createElement('div');
  subMenu.id = 'notifySubMenu';
  subMenu.className = 'context-menu';
  subMenu.style.position = 'absolute';
  const rect = target.getBoundingClientRect();
  subMenu.style.top = rect.top + 'px';
  subMenu.style.left = rect.right + 'px';
  subMenu.style.display = 'flex';
  subMenu.style.flexDirection = 'column';

  const options = [
    { label: 'Bütün mesajlar', value: 'all' },
    { label: 'Sadece bahsetmeler', value: 'mentions' },
    { label: 'Hiçbir şey', value: 'nothing' }
  ];

  const gid = type === 'group' ? target.dataset.groupId : window.selectedGroup;
  const cid = type === 'channel' ? target.dataset.channelId : null;
  let selected = 'all';
  if (type === 'channel' && window.channelNotifyType[gid]) {
    selected = window.channelNotifyType[gid][cid] || selected;
  } else if (type === 'group') {
    selected = window.groupNotifyType[gid] || selected;
  }

  options.forEach(o => {
    const item = document.createElement('div');
    item.className = 'context-menu-item';
    item.textContent = o.label;
    if (o.value === selected) {
      const check = document.createElement('span');
      check.classList.add('material-icons');
      check.textContent = 'check';
      item.appendChild(check);
    }
    item.addEventListener('click', () => {
      if (type === 'channel') {
        socket.emit('setChannelNotifyType', { groupId: gid, channelId: cid, type: o.value });
        window.channelNotifyType[gid] = window.channelNotifyType[gid] || {};
        window.channelNotifyType[gid][cid] = o.value;
      } else {
        socket.emit('setGroupNotifyType', { groupId: gid, type: o.value });
        window.groupNotifyType[gid] = o.value;
      }
      subMenu.remove();
      const ctx = document.getElementById(type === 'channel' ? 'channelContextMenu' : 'groupContextMenu');
      if (ctx) ctx.remove();
      window.openNotifyTarget = null;
      window.openNotifyType = null;
    });
    subMenu.appendChild(item);
  });

  document.body.appendChild(subMenu);
  const removeIfOutside = e => {
    const to = e.relatedTarget;
    if (!target.contains(to) && !subMenu.contains(to)) {
      subMenu.remove();
      target.removeEventListener('mouseleave', removeIfOutside);
      subMenu.removeEventListener('mouseleave', removeIfOutside);
    }
  };

  target.addEventListener('mouseleave', removeIfOutside);
  subMenu.addEventListener('mouseleave', removeIfOutside);

  document.addEventListener('click', function handler() {
    const m = document.getElementById('notifySubMenu');
    if (m) m.remove();
    window.openNotifyTarget = null;
    window.openNotifyType = null;
    document.removeEventListener('click', handler);
  });
}
window.showNotificationSubMenu = showNotificationSubMenu;

function showChannelContextMenu(e, roomObj) {
  const existingMenu = document.getElementById('channelContextMenu');
  if(existingMenu) {
    existingMenu.remove();
  }
  const menu = document.createElement('div');
  menu.id = 'channelContextMenu';
  menu.className = 'context-menu';
  menu.style.position = 'absolute';
  menu.style.top = e.pageY + 'px';
  menu.style.left = e.pageX + 'px';
  menu.style.display = 'flex';
  menu.style.flexDirection = 'column';
  let textChannelCount = 0;
  if (window.latestChannelsData) {
    textChannelCount = Object.values(window.latestChannelsData)
      .filter(c => c.type === 'text').length;
  }
  
  const cMuteTs =
    window.channelMuteUntil[window.selectedGroup] &&
    window.channelMuteUntil[window.selectedGroup][roomObj.id];
  const channelMuted = cMuteTs && Date.now() < cMuteTs;

  const menuItems = [
    {
      text: 'Kanal Ayarları',
      action: () => { alert('Kanal ayarları henüz uygulanmadı.'); }
    },
    channelMuted
      ? {
          text: 'Bu kanalın sesini aç',
          action: () => {
            socket.emit('muteChannel', {
              groupId: window.selectedGroup,
              channelId: roomObj.id,
              duration: 0
            });
          }
        }
      : {
          text: 'Bu kanalı sessize al',
          mute: true,
          action: () => {}
        },
    {
      text: 'Bildirim türü',
      notification: true,
      action: () => {}
    },
    {
      text: 'Kanalın İsmini Değiştir',
      action: () => {
        const newName = prompt('Yeni kanal ismini girin:', roomObj.name);
        if(newName && newName.trim() !== '') {
          socket.emit('renameChannel', { channelId: roomObj.id, newName: newName.trim() });
        }
      }
    },
    {
      text: 'Kanalı Sil',
      hide: roomObj.type === 'text' && textChannelCount === 1,
      action: () => {
        if(confirm('Bu kanalı silmek istediğinize emin misiniz?')) {
          socket.emit('deleteChannel', roomObj.id);
        }
      }
    }
  ];
  menuItems.forEach(item => {
    if (item.hide) return;
    const menuItem = document.createElement('div');
    menuItem.className = 'context-menu-item';
    if (item.mute) {
      const label = document.createElement('span');
      label.textContent = item.text;
      const icon = document.createElement('span');
      icon.classList.add('material-icons');
      icon.textContent = 'chevron_right';
      menuItem.appendChild(label);
      menuItem.appendChild(icon);
      menuItem.dataset.channelId = roomObj.id;
      menuItem.addEventListener('mouseenter', () => showMuteSubMenu(menuItem, 'channel'));
    } else if (item.notification) {
      const label = document.createElement('span');
      label.textContent = item.text;
      const icon = document.createElement('span');
      icon.classList.add('material-icons');
      icon.textContent = 'chevron_right';
      menuItem.appendChild(label);
      menuItem.appendChild(icon);
      menuItem.dataset.channelId = roomObj.id;
      menuItem.addEventListener('mouseenter', () => showNotificationSubMenu(menuItem, 'channel'));
    } else {
      menuItem.textContent = item.text;
      menuItem.addEventListener('click', () => {
        item.action();
        menu.remove();
      });
    }
    menu.appendChild(menuItem);
  });
  document.body.appendChild(menu);
  document.addEventListener('click', function handler() {
    if(document.getElementById('channelContextMenu')){
      document.getElementById('channelContextMenu').remove();
    }
    document.removeEventListener('click', handler);
  });
}
window.showChannelContextMenu = showChannelContextMenu;

function showCategoryContextMenu(e, catObj) {
  const existingMenu = document.getElementById('categoryContextMenu');
  if (existingMenu) existingMenu.remove();
  const menu = document.createElement('div');
  menu.id = 'categoryContextMenu';
  menu.className = 'context-menu';
  menu.style.position = 'absolute';
  menu.style.top = e.pageY + 'px';
  menu.style.left = e.pageX + 'px';
  menu.style.display = 'flex';
  menu.style.flexDirection = 'column';

  const cMuteTs = window.categoryMuteUntil[window.selectedGroup] && window.categoryMuteUntil[window.selectedGroup][catObj.id];
  const muted = cMuteTs && Date.now() < cMuteTs;

  const menuItems = [
    { text: 'Kategori ayarları', action: () => { alert('Kategori ayarları henüz uygulanmadı.'); } },
    muted
      ? { text: 'Bu kategorinin sesini aç', action: () => { socket.emit('muteCategory', { groupId: window.selectedGroup, categoryId: catObj.id, duration: 0 }); } }
      : { text: 'Bu kategoriyi sessize al', mute: true, action: () => {} },
    { text: 'Bildirim türü', notification: true, action: () => {} },
    { text: 'Kategorinin ismini değiştir', action: () => { const n = prompt('Yeni kategori ismini girin:', catObj.name); if(n && n.trim() !== '') socket.emit('renameCategory', { categoryId: catObj.id, newName: n.trim() }); } },
    { text: 'Kategoriyi sil', action: () => { if(confirm('Bu kategoriyi silmek istediğinize emin misiniz?')) socket.emit('deleteCategory', catObj.id); } }
  ];

  menuItems.forEach(item => {
    const menuItem = document.createElement('div');
    menuItem.className = 'context-menu-item';
    if (item.mute) {
      const label = document.createElement('span');
      label.textContent = item.text;
      const icon = document.createElement('span');
      icon.classList.add('material-icons');
      icon.textContent = 'chevron_right';
      menuItem.appendChild(label);
      menuItem.appendChild(icon);
      menuItem.dataset.categoryId = catObj.id;
      menuItem.addEventListener('mouseenter', () => showMuteSubMenu(menuItem, 'category'));
    } else if (item.notification) {
      const label = document.createElement('span');
      label.textContent = item.text;
      const icon = document.createElement('span');
      icon.classList.add('material-icons');
      icon.textContent = 'chevron_right';
      menuItem.appendChild(label);
      menuItem.appendChild(icon);
    } else {
      menuItem.textContent = item.text;
      menuItem.addEventListener('click', () => { item.action(); menu.remove(); });
    }
    menu.appendChild(menuItem);
  });

  document.body.appendChild(menu);
  document.addEventListener('click', function handler() {
    const m = document.getElementById('categoryContextMenu');
    if (m) m.remove();
    document.removeEventListener('click', handler);
  });
}
window.showCategoryContextMenu = showCategoryContextMenu;

function showGroupContextMenu(e, groupObj) {
  const existingMenu = document.getElementById('groupContextMenu');
  if (existingMenu) existingMenu.remove();
  const menu = document.createElement('div');
  menu.id = 'groupContextMenu';
  menu.className = 'context-menu';
  menu.style.position = 'absolute';
  menu.style.top = e.pageY + 'px';
  menu.style.left = e.pageX + 'px';
  menu.style.display = 'flex';
  menu.style.flexDirection = 'column';

  const gMuteTs = window.groupMuteUntil[groupObj.id];
  const groupMuted = gMuteTs && Date.now() < gMuteTs;

  const menuItems = [
    { text: 'Grup ID Kopyala', action: () => navigator.clipboard.writeText(groupObj.id) },
    groupMuted
      ? { text: 'Bu grubun sesini aç', action: () => { socket.emit('muteGroup', { groupId: groupObj.id, duration: 0 }); } }
      : { text: 'Bu grubu sessize al', mute: true, action: () => {} },
    { text: 'Bildirim türü', notification: true, action: () => {} },
    { text: 'Gruptan Ayrıl', hide: groupObj.owner === window.username, action: () => { socket.emit('leaveGroup', groupObj.id); } }
  ];

  menuItems.forEach(item => {
    if (item.hide) return;
    const menuItem = document.createElement('div');
    menuItem.className = 'context-menu-item';
    if (item.mute) {
      const label = document.createElement('span');
      label.textContent = item.text;
      const icon = document.createElement('span');
      icon.classList.add('material-icons');
      icon.textContent = 'chevron_right';
      menuItem.appendChild(label);
      menuItem.appendChild(icon);
      menuItem.dataset.groupId = groupObj.id;
      menuItem.addEventListener('mouseenter', () => showMuteSubMenu(menuItem, 'group'));
    } else if (item.notification) {
      const label = document.createElement('span');
      label.textContent = item.text;
      const icon = document.createElement('span');
      icon.classList.add('material-icons');
      icon.textContent = 'chevron_right';
      menuItem.appendChild(label);
      menuItem.appendChild(icon);
      menuItem.dataset.groupId = groupObj.id;
      menuItem.addEventListener('mouseenter', () => showNotificationSubMenu(menuItem, 'group'));
    } else {
      menuItem.textContent = item.text;
      menuItem.addEventListener('click', () => {
        item.action();
        menu.remove();
      });
    }
    menu.appendChild(menuItem);
  });

  document.body.appendChild(menu);
  document.addEventListener('click', function handler() {
    const m = document.getElementById('groupContextMenu');
    if (m) m.remove();
    document.removeEventListener('click', handler);
  });
}
window.showGroupContextMenu = showGroupContextMenu;

/* Yeni fonksiyon: Video için Context Menu */
function showVideoContextMenu(e) {
  e.preventDefault();
  if (!WebRTC.screenShareVideo) return;
  const existing = document.getElementById('videoContextMenu');
  if (existing) existing.remove();

  const menu = document.createElement('div');
  menu.id = 'videoContextMenu';
  menu.className = 'context-menu';
  menu.style.position = 'absolute';
  menu.style.top = e.pageY + 'px';
  menu.style.left = e.pageX + 'px';
  menu.style.display = 'flex';
  menu.style.flexDirection = 'column';

  const peerId = WebRTC.screenShareVideo.dataset.peerId;
  const audioEl = WebRTC.remoteAudios.find(a => a.dataset.peerId === peerId);
  if (audioEl) {
    const volumeItem = document.createElement('div');
    volumeItem.className = 'context-menu-item';
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '1';
    slider.step = '0.01';
    slider.value = audioEl.volume;
    slider.addEventListener('input', () => {
      audioEl.volume = parseFloat(slider.value);
    });
    volumeItem.textContent = 'Ses: ';
    volumeItem.appendChild(slider);
    menu.appendChild(volumeItem);
  }

  document.body.appendChild(menu);
  document.addEventListener('click', function handler() {
    const m = document.getElementById('videoContextMenu');
    if (m) m.remove();
    document.removeEventListener('click', handler);
  });
}
window.showVideoContextMenu = showVideoContextMenu;

/* Yeni fonksiyon: updateVoiceChannelUI */
function updateVoiceChannelUI(roomName, alreadyConnected = false) {
  selectedChannelTitle.textContent = roomName;
  const channelUsersContainer = document.getElementById('channelUsersContainer');
  if (channelUsersContainer) {
    channelUsersContainer.style.display = 'grid';
  }
  textChannelContainer.style.display = 'none';
  if (alreadyConnected) {
    showVoiceSections();
  } else {
    showChannelStatusPanel();
  }
}
window.updateVoiceChannelUI = updateVoiceChannelUI;

/* showScreenShare */
function showScreenShare(producerId) {
  WebRTC.showScreenShare(socket, currentGroup, currentRoom, producerId, clearScreenShareUI);
}
window.showScreenShare = showScreenShare;


/* displayScreenShareEndedMessage */
function displayScreenShareEndedMessage(msg) {
  const channelContentArea = document.querySelector('.channel-content-area');
  let messageEl = document.getElementById('screenShareEndedMessage');
  if (!messageEl) {
    messageEl = document.createElement('div');
    messageEl.id = 'screenShareEndedMessage';
    messageEl.style.position = 'absolute';
    messageEl.style.top = '50%';
    messageEl.style.left = '50%';
    messageEl.style.transform = 'translate(-50%, -50%)';
    messageEl.style.color = '#fff';
    messageEl.style.backgroundColor = 'rgba(0,0,0,0.7)';
    messageEl.style.padding = '1rem';
    messageEl.style.borderRadius = '8px';
    messageEl.style.fontSize = '1.2rem';
  }
  messageEl.textContent = msg || 'Bu yayın sonlandırıldı';
  const channelContentAreaElem = document.querySelector('.channel-content-area');
  channelContentAreaElem.appendChild(messageEl);
}
window.displayScreenShareEndedMessage = displayScreenShareEndedMessage;

/* removeScreenShareEndedMessage */
function removeScreenShareEndedMessage() {
  const messageEl = document.getElementById('screenShareEndedMessage');
  if (messageEl && messageEl.parentNode) {   
    messageEl.parentNode.removeChild(messageEl);
  }
}
window.removeScreenShareEndedMessage = removeScreenShareEndedMessage;

/* DM Panel toggle işlevi, her tıklamada DM moduna geçiş veya çıkış yapar (initUIEvents içinde tanımlanacak). */

window.openUserSettings = openUserSettings;
window.closeUserSettings = closeUserSettings;
