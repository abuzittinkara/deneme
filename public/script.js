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
}
window.clearScreenShareUI = clearScreenShareUI;

import * as TextChannel from './js/textChannel.js';
import * as ScreenShare from './js/screenShare.js';
import { initTypingIndicator } from './js/typingIndicator.js';
import { initFriendRequests } from './js/friendRequests.js';
import * as Ping from './js/ping.js';
import * as UserList from './js/userList.js';
import { attemptLogin, attemptRegister } from "./js/auth.js";
import { initUIEvents } from "./js/uiEvents.js";
import { initSocketEvents } from "./js/socketEvents.js";
import * as WebRTC from "./js/webrtc.js";
import { applyAudioStates } from "./js/audioUtils.js";

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

/* Formatlama fonksiyonları artık TextChannel modülünden sağlanıyor */

const loginScreen = document.getElementById('loginScreen');
const registerScreen = document.getElementById('registerScreen');
const callScreen = document.getElementById('callScreen');

// Login
const loginUsernameInput = document.getElementById('loginUsernameInput');
const loginPasswordInput = document.getElementById('loginPasswordInput');
const loginButton = document.getElementById('loginButton');
const loginErrorMessage = document.getElementById('loginErrorMessage');

// Register
const regUsernameInput = document.getElementById('regUsernameInput');
const regNameInput = document.getElementById('regNameInput');
const regSurnameInput = document.getElementById('regSurnameInput');
const regBirthdateInput = document.getElementById('regBirthdateInput');
const regEmailInput = document.getElementById('regEmailInput');
const regPhoneInput = document.getElementById('regPhoneInput');
const regPasswordInput = document.getElementById('regPasswordInput');
const regPasswordConfirmInput = document.getElementById('regPasswordConfirmInput');
const registerButton = document.getElementById('registerButton');
const backToLoginButton = document.getElementById('backToLoginButton');
const registerErrorMessage = document.getElementById('registerErrorMessage');

// Ekran geçiş linkleri
const showRegisterScreen = document.getElementById('showRegisterScreen');
const showLoginScreen = document.getElementById('showLoginScreen');

// Gruplar, Odalar
const groupListDiv = document.getElementById('groupList');
const createGroupButton = document.getElementById('createGroupButton');
const roomListDiv = document.getElementById('roomList');
const groupTitle = document.getElementById('groupTitle');
const groupDropdownIcon = document.getElementById('groupDropdownIcon');
const groupDropdownMenu = document.getElementById('groupDropdownMenu');
const copyGroupIdBtn = document.getElementById('copyGroupIdBtn');
const renameGroupBtn = document.getElementById('renameGroupBtn');
const createChannelBtn = document.getElementById('createChannelBtn');
const deleteGroupBtn = document.getElementById('deleteGroupBtn');
const groupSettingsBtn = document.getElementById('groupSettingsBtn');
const leaveGroupBtn = document.getElementById('leaveGroupBtn');

// DM panel ve odalar alanı (kanallar paneli)
const toggleDMButton = document.getElementById('toggleDMButton');
const roomPanel = document.getElementById('roomPanel');
let isDMMode = false;

// Sağ panel
const rightPanel = document.getElementById('rightPanel');
// Kullanıcı listesi (rightPanel içinde)
const userListDiv = document.getElementById('userList');

// Kanal Durum Paneli
const channelStatusPanel = document.getElementById('channelStatusPanel');
channelStatusPanel.style.zIndex = "20";
channelStatusPanel.style.display = 'flex';
const connectionStatusText = document.getElementById('connectionStatusText');
const pingValueSpan = document.getElementById('pingValue');
const cellBar1 = document.getElementById('cellBar1');
const cellBar2 = document.getElementById('cellBar2');
const cellBar3 = document.getElementById('cellBar3');
const cellBar4 = document.getElementById('cellBar4');
const connectionHeader = channelStatusPanel.querySelector('.connection-header');
const channelInfoRow = channelStatusPanel.querySelector('.channel-info-row');
const buttonRow = channelStatusPanel.querySelector('.button-row');
const panelDivider = channelStatusPanel.querySelector('.panel-divider');
const userCard = channelStatusPanel.querySelector('.user-card');

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
const leaveButton = document.getElementById('leaveButton');
const screenShareButton = document.getElementById('screenShareButton');
const cameraShareButton = document.getElementById('cameraShareButton');
const screenShareLargeButton = document.getElementById('screenShareLargeButton');
const soundbarButton = document.getElementById('soundbarButton');

// Mikrofon / Kulaklık butonları
const micToggleButton = document.getElementById('micToggleButton');
const deafenToggleButton = document.getElementById('deafenToggleButton');
const settingsButton = document.getElementById('settingsButton');

// Metin Kanalı Elemanları
const textChannelContainer = document.getElementById('textChannelContainer');
const textMessages = document.getElementById('textMessages');
const textChatInputBar = document.getElementById('textChatInputBar');
const textChannelMessageInput = document.getElementById('textChannelMessageInput');
const sendTextMessageBtn = document.getElementById('sendTextMessageBtn');

// Ek: Seçili başlık ve ana içerik alanı
const selectedChannelTitle = document.getElementById('selectedChannelTitle');
const channelContentArea = document.getElementById('channelContentArea');

// Yeni: DM modunda kullanılacak content alanı (selectedDMBar altında)
const dmContentArea = document.getElementById('dmContentArea');

// "dmPanel" yine mevcut (display:none); DM paneli, dmChatSearchInput öğesini barındıracak
const dmPanel = document.getElementById('dmPanel');
// Modal elements for group creation/joining
const groupModal = document.getElementById('groupModal');
const modalGroupCreateBtn = document.getElementById('modalGroupCreateBtn');
const modalGroupJoinBtn = document.getElementById('modalGroupJoinBtn');
const actualGroupCreateModal = document.getElementById('actualGroupCreateModal');
const actualGroupName = document.getElementById('actualGroupName');
const actualGroupNameBtn = document.getElementById('actualGroupNameBtn');
const closeCreateGroupModal = document.getElementById('closeCreateGroupModal');
const joinGroupModal = document.getElementById('joinGroupModal');
const joinGroupIdInput = document.getElementById('joinGroupIdInput');
const joinGroupIdBtn = document.getElementById('joinGroupIdBtn');
const closeJoinGroupModal = document.getElementById('closeJoinGroupModal');
const groupSettingsModal = document.getElementById('groupSettingsModal');
const closeGroupSettingsModal = document.getElementById('closeGroupSettingsModal');
const userSettingsModal = document.getElementById('userSettingsModal');
const closeUserSettingsModalBtn = document.getElementById('closeUserSettingsModalBtn');
const roomModal = document.getElementById('roomModal');
const modalRoomName = document.getElementById('modalRoomName');
const textChannel = document.getElementById('textChannel');
const voiceChannel = document.getElementById('voiceChannel');
const modalCreateRoomBtn = document.getElementById('modalCreateRoomBtn');
const modalCloseRoomBtn = document.getElementById('modalCloseRoomBtn');
Object.assign(window, {
  loginScreen,
  registerScreen,
  callScreen,
  loginUsernameInput,
  loginPasswordInput,
  loginButton,
  loginErrorMessage,
  regUsernameInput,
  regNameInput,
  regSurnameInput,
  regBirthdateInput,
  regEmailInput,
  regPhoneInput,
  regPasswordInput,
  regPasswordConfirmInput,
  registerButton,
  backToLoginButton,
  registerErrorMessage,
  showRegisterScreen,
  showLoginScreen,
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
  sendTextMessageBtn,
  selectedChannelTitle,
  channelContentArea,
  dmContentArea,
  dmPanel,
  cameraShareButton,
  screenShareLargeButton,
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
  userSettingsModal,
  closeUserSettingsModalBtn,
  roomModal,
  modalRoomName,
  textChannel,
  voiceChannel,
  modalCreateRoomBtn,
  modalCloseRoomBtn
});
window.WebRTC = WebRTC;
window.joinRoom = WebRTC.joinRoom;
window.leaveRoomInternal = WebRTC.leaveRoomInternal;
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
  toggleDMButton.querySelector('.material-icons').textContent = 'forum';
  
  // Hide voice channel sections until a voice channel is joined
  hideVoiceSections();

  const socketURL = window.SOCKET_URL || window.location.origin;
  socket = io(socketURL, { transports: ['websocket'] })
  initSocketEvents(socket);
  initUIEvents(socket, () => attemptLogin(socket, loginUsernameInput, loginPasswordInput, loginErrorMessage), () => attemptRegister(socket, {regUsernameInput, regNameInput, regSurnameInput, regBirthdateInput, regEmailInput, regPhoneInput, regPasswordInput, regPasswordConfirmInput, registerErrorMessage}));
  initTypingIndicator(socket, () => window.currentTextChannel, () => window.username);
  initFriendRequests(socket);
  
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
      console.log("DM Filter clicked:", filter);
    }
  });
});

/* Yeni fonksiyon: Context Menu Gösterimi */
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
  
  const menuItems = [
    {
      text: 'Kanal Ayarları',
      action: () => { alert('Kanal ayarları henüz uygulanmadı.'); }
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
    menuItem.textContent = item.text;
    menuItem.addEventListener('click', () => {
      item.action();
      menu.remove();
    });
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
    channelUsersContainer.style.display = 'flex';
  }
  textChannelContainer.style.display = 'none';
  if (alreadyConnected) {
    if (channelStatusPanel) channelStatusPanel.style.display = 'flex';
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

function closeUserSettingsModal() {
  if (userSettingsModal) {
    userSettingsModal.style.display = 'none';
    document.body.style.overflow = '';
  }
}
window.closeUserSettingsModal = closeUserSettingsModal;
