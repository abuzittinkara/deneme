+29-3
/**************************************
 * script.js
 * TAMAMEN SFU MANTIĞINA GEÇİLMİŞ VERSİYON
 **************************************/

/* clearScreenShareUI */
function clearScreenShareUI() {
  const channelContentArea = document.querySelector('.channel-content-area');
  if (screenShareContainer) {
    if (screenShareContainer.parentNode) {
      screenShareContainer.parentNode.removeChild(screenShareContainer);
    }
    screenShareContainer = null;
    screenShareVideo = null;
  } else if (screenShareVideo) {
    if (screenShareVideo.parentNode) {
      screenShareVideo.parentNode.removeChild(screenShareVideo);
    }
    screenShareVideo = null;
  }
  if (screenShareButton) {
    screenShareButton.classList.remove('active');
window.clearScreenShareUI = clearScreenShareUI;
  }
  const overlay = document.getElementById('screenShareOverlay');
  if (overlay && overlay.parentNode) {
    overlay.parentNode.removeChild(overlay);
  }
}

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
let selectedGroup = null;
let currentTextChannel = null; // Metin kanalı için seçili kanal id'si
let currentRoomType = null;    // "voice" veya "text"

// Yeni: Kullanıcının sesli kanala bağlandığı kanalın adını saklayacak değişken
let activeVoiceChannelName = "";

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
channelStatusPanel.style.height = "100px";
channelStatusPanel.style.zIndex = "20";
const pingValueSpan = document.getElementById('pingValue');
const cellBar1 = document.getElementById('cellBar1');
const cellBar2 = document.getElementById('cellBar2');
const cellBar3 = document.getElementById('cellBar3');
const cellBar4 = document.getElementById('cellBar4');

// Ayrıl Butonu
const leaveButton = document.getElementById('leaveButton');
const screenShareButton = document.getElementById('screenShareButton');

// Mikrofon / Kulaklık butonları
const micToggleButton = document.getElementById('micToggleButton');
const deafenToggleButton = document.getElementById('deafenToggleButton');
const settingsButton = document.getElementById('settingsButton');

// Metin Kanalı Elemanları
const textChannelContainer = document.getElementById('textChannelContainer');
const textMessages = document.getElementById('textMessages');
const textChatInputBar = document.getElementById('text-chat-input-bar');
const textChannelMessageInput = document.getElementById('textChannelMessageInput');
const sendTextMessageBtn = document.getElementById('sendTextMessageBtn');

// Ek: Seçili başlık ve ana içerik alanı
const selectedChannelTitle = document.getElementById('selectedChannelTitle');
const channelContentArea = document.getElementById('channelContentArea');

// Yeni: DM modunda kullanılacak content alanı (selectedDMBar altında)
const dmContentArea = document.getElementById('dmContentArea');

// "dmPanel" yine mevcut (display:none); DM paneli, dmChatSearchInput öğesini barındıracak
const dmPanel = document.getElementById('dmPanel');
Object.assign(window, {loginScreen, registerScreen, callScreen, loginUsernameInput, loginPasswordInput, loginButton, loginErrorMessage, regUsernameInput, regNameInput, regSurnameInput, regBirthdateInput, regEmailInput, regPhoneInput, regPasswordInput, regPasswordConfirmInput, registerButton, backToLoginButton, registerErrorMessage, showRegisterScreen, showLoginScreen, groupListDiv, createGroupButton, roomListDiv, groupTitle, groupDropdownIcon, groupDropdownMenu, copyGroupIdBtn, renameGroupBtn, createChannelBtn, deleteGroupBtn, toggleDMButton, roomPanel, rightPanel, leaveButton, screenShareButton, micToggleButton, deafenToggleButton, settingsButton, textChannelContainer, textMessages, textChatInputBar, textChannelMessageInput, sendTextMessageBtn, selectedChannelTitle, channelContentArea, dmContentArea, dmPanel});

Object.assign(window, WebRTC);
Object.assign(window, {selectedGroup, currentGroup, currentRoom, currentTextChannel, currentRoomType, activeVoiceChannelName, micEnabled, selfDeafened, micWasEnabledBeforeDeaf, hasMic});
window.applyAudioStates = (opts) => applyAudioStates(opts);
window.addEventListener('DOMContentLoaded', () => {
  toggleDMButton.querySelector('.material-icons').textContent = 'forum';
  
  socket = io("https://fisqos.com.tr", { transports: ['websocket'] });
  console.log("Socket connected =>", socket.id);
  initSocketEvents(socket);
  initUIEvents(socket, () => attemptLogin(socket, loginUsernameInput, loginPasswordInput, loginErrorMessage), () => attemptRegister(socket, {regUsernameInput, regNameInput, regSurnameInput, regBirthdateInput, regEmailInput, regPhoneInput, regPasswordInput, regPasswordConfirmInput, registerErrorMessage}));
  initTypingIndicator(socket, () => currentTextChannel, () => username);
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
      action: () => {
        if(confirm('Bu kanalı silmek istediğinize emin misiniz?')) {
          socket.emit('deleteChannel', roomObj.id);
        }
      }
    }
  ];
  menuItems.forEach(item => {
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

/* Yeni fonksiyon: Video için Context Menu */
function showVideoContextMenu(e) {
  e.preventDefault();
  if (!screenShareVideo) return;
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

  const peerId = screenShareVideo.dataset.peerId;
  const audioEl = remoteAudios.find(a => a.dataset.peerId === peerId);
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
function updateVoiceChannelUI(roomName) {
  selectedChannelTitle.textContent = roomName;
  const channelUsersContainer = document.getElementById('channelUsersContainer');
  if (channelUsersContainer) {
    channelUsersContainer.style.display = 'flex';
  }
  textChannelContainer.style.display = 'none';
  showChannelStatusPanel();
}
window.updateVoiceChannelUI = updateVoiceChannelUI;

/* showScreenShare */
async function showScreenShare(producerId) {
  if (!recvTransport) {
    console.warn("recvTransport yok");
    return;
  }
  const channelContentArea = document.querySelector('.channel-content-area');
  clearScreenShareUI();
  const consumeParams = await new Promise((resolve) => {
    socket.emit('consume', {
      groupId: currentGroup,
      roomId: currentRoom,
      transportId: recvTransport.id,
      producerId: producerId
    }, (res) => {
      resolve(res);
    });
  });
  if (consumeParams.error) {
    console.error("consume error:", consumeParams.error);
    return;
  }
  const consumer = await recvTransport.consume({
    id: consumeParams.id,
    producerId: consumeParams.producerId,
    kind: consumeParams.kind,
    rtpParameters: consumeParams.rtpParameters
  });
  consumer.appData = { peerId: consumeParams.producerPeerId };
  consumers[consumer.id] = consumer;
  if (consumer.kind === "audio") {
    const { track } = consumer;
    const audioEl = document.createElement('audio');
    audioEl.srcObject = new MediaStream([track]);
    audioEl.autoplay = true;
    audioEl.dataset.peerId = consumer.appData.peerId;
    remoteAudios.push(audioEl);
    audioEl.play().catch(err => console.error("Ses oynatılamadı:", err));
    startVolumeAnalysis(audioEl.srcObject, consumer.appData.peerId);
    console.log("Yeni audio consumer oluşturuldu:", consumer.id, "-> konuşan:", consumer.appData.peerId);
  } else if (consumer.kind === "video") {
    screenShareVideo = document.createElement('video');
    screenShareVideo.srcObject = new MediaStream([consumer.track]);
    screenShareVideo.autoplay = true;
    screenShareVideo.dataset.peerId = consumer.appData.peerId;
    screenShareContainer = document.createElement('div');
    screenShareContainer.classList.add('screen-share-container');
    screenShareContainer.appendChild(screenShareVideo);

    const endIcon = document.createElement('span');
    endIcon.classList.add('material-icons', 'screen-share-end-icon');
    endIcon.textContent = 'call_end';
    endIcon.style.display = 'none';
    screenShareContainer.appendChild(endIcon);

    screenShareContainer.addEventListener('mouseenter', () => {
      endIcon.style.display = 'block';
    });
    screenShareContainer.addEventListener('mouseleave', () => {
      endIcon.style.display = 'none';
    });
    endIcon.addEventListener('click', () => {
      consumer.close();
      delete consumers[consumer.id];
      for (const cid in consumers) {
        const c = consumers[cid];
        if (c.kind === 'audio' && c.appData.peerId === consumer.appData.peerId) {
          c.close();
          stopVolumeAnalysis(cid);
          delete consumers[cid];
          const idx = remoteAudios.findIndex(a => a.dataset.peerId === c.appData.peerId);
          if (idx !== -1) {
            const aEl = remoteAudios[idx];
            try { aEl.pause(); } catch(e) {}
            aEl.srcObject = null;
            remoteAudios.splice(idx,1);
          }
        }
      }
      if (screenShareContainer.parentNode) {
        screenShareContainer.parentNode.removeChild(screenShareContainer);
      }
      screenShareVideo = null;
      screenShareContainer = null;
    });

    removeScreenShareEndedMessage();
    if (channelContentArea) {
      screenShareContainer = document.createElement('div');
      screenShareContainer.classList.add('screen-share-container');
      screenShareContainer.appendChild(screenShareVideo);

      const fsIcon = document.createElement('span');
      fsIcon.classList.add('material-icons', 'fullscreen-icon');
      fsIcon.textContent = 'fullscreen';
      fsIcon.addEventListener('click', () => {
        if (screenShareContainer.requestFullscreen) {
          screenShareContainer.requestFullscreen();
        }
      });
      screenShareContainer.appendChild(fsIcon);

      channelContentArea.appendChild(screenShareContainer);
    }
    console.log("Yeni video consumer oluşturuldu:", consumer.id, "-> yayıncı:", consumer.appData.peerId);
  }
}
window.showScreenShare = showScreenShare;


/* displayScreenShareEndedMessage */
function displayScreenShareEndedMessage() {
  const channelContentArea = document.querySelector('.channel-content-area');
  let messageEl = document.getElementById('screenShareEndedMessage');
  if (!messageEl) {
    messageEl = document.createElement('div');
    messageEl.id = 'screenShareEndedMessage';
    messageEl.textContent = 'Bu yayın sonlandırıldı';
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
  const channelContentAreaElem = document.querySelector('.channel-content-area');
window.displayScreenShareEndedMessage = displayScreenShareEndedMessage;  
  channelContentAreaElem.appendChild(messageEl);
}

/* removeScreenShareEndedMessage */
function removeScreenShareEndedMessage() {
  const messageEl = document.getElementById('screenShareEndedMessage');
  if (messageEl && messageEl.parentNode) {
window.removeScreenShareEndedMessage = removeScreenShareEndedMessage;    
    messageEl.parentNode.removeChild(messageEl);
  }
}

/* DM Panel toggle işlevi, her tıklamada DM moduna geçiş veya çıkış yapar (initUIEvents içinde tanımlanacak). */