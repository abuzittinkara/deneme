/**************************************
 * script.js
 * TAMAMEN SFU MANTIĞINA GEÇİLMİŞ VERSİYON
 **************************************/

/* clearScreenShareUI */
function clearScreenShareUI() {
  const channelContentArea = document.querySelector('.channel-content-area');
  if (screenShareVideo && channelContentArea && channelContentArea.contains(screenShareVideo)) {
    channelContentArea.removeChild(screenShareVideo);
    screenShareVideo = null;
  }
  if (screenShareButton) {
    screenShareButton.classList.remove('active');
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

let socket = null;
let device = null;   // mediasoup-client Device
let deviceIsLoaded = false;
let sendTransport = null;
let recvTransport = null;

function attemptRegister() {
  console.log("🔐 attemptRegister tetiklendi");  // ← Bunu buraya ekleyin

  const usernameVal = regUsernameInput.value.trim();
  const nameVal     = regNameInput.value.trim();
  const surnameVal  = regSurnameInput.value.trim();
  const birthVal    = regBirthdateInput.value.trim();
  const emailVal    = regEmailInput.value.trim();
  const phoneVal    = regPhoneInput.value.trim();
  const passVal     = regPasswordInput.value.trim();
  const passConfVal = regPasswordConfirmInput.value.trim();

  registerErrorMessage.style.display = 'none';
  [regUsernameInput, regPasswordInput, regPasswordConfirmInput].forEach(el => el.classList.remove('shake'));

  // 1) Zorunlu alan
  if (!usernameVal || !nameVal || !surnameVal || !birthVal || !emailVal || !phoneVal || !passVal || !passConfVal) {
    registerErrorMessage.textContent = 'Lütfen tüm alanları doldurunuz.';
    registerErrorMessage.style.display = 'block';
    return;
  }
  // 2) Küçük harf kontrolü
  if (usernameVal !== usernameVal.toLowerCase()) {
    registerErrorMessage.textContent = 'Kullanıcı adı sadece küçük harf olmalı!';
    registerErrorMessage.style.display = 'block';
    regUsernameInput.classList.add('shake');
    return;
  }
  // 3) Parola eşleşme
  if (passVal !== passConfVal) {
    registerErrorMessage.textContent = 'Parolalar eşleşmiyor!';
    registerErrorMessage.style.display = 'block';
    regPasswordInput.classList.add('shake');
    regPasswordConfirmInput.classList.add('shake');
    return;
  }
  // 4) Parola karmaşıklık
  const complexityRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
  if (!complexityRegex.test(passVal)) {
    registerErrorMessage.textContent = 'Parola en az 8 karakter, büyük/küçük harf, rakam ve özel karakter içermeli.';
    registerErrorMessage.style.display = 'block';
    regPasswordInput.classList.add('shake');
    return;
  }

  // Her şey tamam, sunucuya kayıt isteği gönder
  socket.emit('register', {
    username: usernameVal,
    name: nameVal,
    surname: surnameVal,
    birthdate: birthVal,
    email: emailVal,
    phone: phoneVal,
    password: passVal,
    passwordConfirm: passConfVal
  });
}

// Mikrofon akışı
let localStream = null;
let audioPermissionGranted = false;

// Producer (mikrofon)
let localProducer = null;

// Remote audio consumer objeleri
let consumers = {};  // consumerId -> consumer

// Remote audio elementlerini saklayalım
let remoteAudios = [];

// Global ekran paylaşım video elementi
let screenShareVideo = null;

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

// Ses seviyesi analizi
const SPEAKING_THRESHOLD = 0.02;
const VOLUME_CHECK_INTERVAL = 100;
let audioAnalyzers = {};

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

window.addEventListener('DOMContentLoaded', () => {
  toggleDMButton.querySelector('.material-icons').textContent = 'forum';
  
  socket = io("https://fisqos.com.tr", { transports: ['websocket'] });
  console.log("Socket connected =>", socket.id);
  initSocketEvents();
  initUIEvents();
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
    console.log("Video consumer alındı, ekran paylaşım için tıklama ile consume edilecek. Producer:", consumeParams.producerId);
  }
}

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
  channelContentAreaElem.appendChild(messageEl);
}

/* removeScreenShareEndedMessage */
function removeScreenShareEndedMessage() {
  const messageEl = document.getElementById('screenShareEndedMessage');
  if (messageEl && messageEl.parentNode) {
    messageEl.parentNode.removeChild(messageEl);
  }
}

/* initSocketEvents */
function initSocketEvents() {
  socket.on('connect', () => {
    console.log("Socket tekrar bağlandı =>", socket.id);
  });
  socket.on('disconnect', () => {
    console.log("Socket disconnect");
  });
  socket.on('loginResult', (data) => {
    if (data.success) {
      username = data.username;
      window.username = username;
      loginScreen.style.display = 'none';
      callScreen.style.display = 'flex';
      socket.emit('set-username', username);
      document.getElementById('leftUserName').textContent = username;
      applyAudioStates();
    } else {
      loginErrorMessage.textContent = "Lütfen girdiğiniz bilgileri kontrol edip tekrar deneyin";
      loginErrorMessage.style.display = 'block';
      loginUsernameInput.classList.add('shake');
      loginPasswordInput.classList.add('shake');
    }
  });
  socket.on('registerResult', (data) => {
    if (data.success) {
      alert("Hesap başarıyla oluşturuldu");
      registerScreen.style.display = 'none';
      loginScreen.style.display = 'block';
    } else {
      registerErrorMessage.textContent = data.message || "Kayıt hatası";
      registerErrorMessage.style.display = 'block';
    }
  });
  socket.on('groupUsers', (data) => {
    UserList.updateUserList(data);
  });
  socket.on('groupsList', (groupArray) => {
    groupListDiv.innerHTML = '';
    groupArray.forEach(groupObj => {
      const grpItem = document.createElement('div');
      grpItem.className = 'grp-item';
      grpItem.setAttribute('data-group-id', groupObj.id);
      grpItem.innerText = groupObj.name[0].toUpperCase();
      grpItem.title = groupObj.name + " (" + groupObj.id + ")";
      grpItem.addEventListener('click', () => {
        document.querySelectorAll('.grp-item').forEach(el => el.classList.remove('selected'));
        grpItem.classList.add('selected');
        selectedGroup = groupObj.id;
        groupTitle.textContent = groupObj.name;
        socket.emit('browseGroup', groupObj.id);
        if (groupObj.owner === username) {
          deleteGroupBtn.style.display = 'block';
          renameGroupBtn.style.display = 'block';
        } else {
          deleteGroupBtn.style.display = 'none';
          renameGroupBtn.style.display = 'none';
        }
      });
      groupListDiv.appendChild(grpItem);
    });
  });
  socket.on('groupDeleted', ({ groupId }) => {
    const grpItems = document.querySelectorAll('.grp-item');
    grpItems.forEach(item => {
      if (item.getAttribute('data-group-id') === groupId) {
        item.remove();
      }
    });
    if (selectedGroup === groupId) {
      selectedGroup = null;
      groupTitle.textContent = 'Seçili Grup';
    }
  });
  socket.on('roomsList', (roomsArray) => {
    roomListDiv.innerHTML = '';
    roomsArray.forEach(roomObj => {
      const roomItem = document.createElement('div');
      roomItem.className = 'channel-item';
      const channelHeader = document.createElement('div');
      channelHeader.className = 'channel-header';
      let icon;
      if (roomObj.type === 'voice') {
        icon = document.createElement('span');
        icon.classList.add('material-icons', 'channel-icon');
        icon.textContent = 'volume_up';
      } else {
        icon = document.createElement('span');
        icon.classList.add('material-icons', 'channel-icon');
        icon.textContent = 'chat';
      }
      const textSpan = document.createElement('span');
      textSpan.textContent = roomObj.name;
      channelHeader.appendChild(icon);
      channelHeader.appendChild(textSpan);
      const channelUsers = document.createElement('div');
      channelUsers.className = 'channel-users';
      channelUsers.id = `channel-users-${roomObj.id}`;
      roomItem.appendChild(channelHeader);
      roomItem.appendChild(channelUsers);
      
      roomItem.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showChannelContextMenu(e, roomObj);
      });
      
      roomItem.addEventListener('click', () => {
        if (roomObj.type === 'text') {
          console.log(`Text channel clicked => ${roomObj.name}`);
          selectedChannelTitle.textContent = roomObj.name;
          textChannelContainer.style.display = 'flex';
          // EK: Flex yönünü "column" olarak ayarla
          textChannelContainer.style.flexDirection = 'column';
          document.getElementById('channelUsersContainer').style.display = 'none';
          if (!(currentRoom && currentRoomType === 'voice')) {
            hideChannelStatusPanel();
            currentRoomType = "text";
          }
          textMessages.innerHTML = "";
          currentTextChannel = roomObj.id;
          textMessages.dataset.channelId = roomObj.id;
          socket.emit('joinTextChannel', { groupId: selectedGroup, roomId: roomObj.id });
          return;
        }
        clearScreenShareUI();
        document.getElementById('channelUsersContainer').style.display = 'flex';
        document.querySelectorAll('.channel-item').forEach(ci => ci.classList.remove('connected'));
        if (currentRoom === roomObj.id && currentGroup === selectedGroup) {
          roomItem.classList.add('connected');
          updateVoiceChannelUI(roomObj.name);
          return;
        }
        if (currentRoom && (currentRoom !== roomObj.id || currentGroup !== selectedGroup)) {
          leaveRoomInternal();
        }
        currentGroup = selectedGroup;
        requestMicrophoneAccess().then(() => {
          console.log("Mikrofon izni alındı, voice kanalına katılım isteği gönderiliyor.");
          joinRoom(currentGroup, roomObj.id, roomObj.name);
        }).catch(err => {
          console.error("Mikrofon izni alınamadı:", err);
        });
        roomItem.classList.add('connected');
      });
      roomListDiv.appendChild(roomItem);
    });
  });
  socket.on('joinRoomAck', ({ groupId, roomId }) => {
    console.log("joinRoomAck received:", groupId, roomId);
    currentGroup = groupId;
    currentRoom = roomId;
    currentRoomType = "voice";
    showChannelStatusPanel();
    if (!audioPermissionGranted || !localStream) {
      requestMicrophoneAccess().then(() => {
        console.log("Mikrofon izni alındı, SFU akışı başlatılıyor...");
        startSfuFlow();
      }).catch(err => {
        console.error("SFU akışı için mikrofon izni alınamadı:", err);
      });
    } else {
      console.log("SFU akışı başlatılıyor...");
      startSfuFlow();
    }
  });
  socket.on('newProducer', ({ producerId }) => {
    console.log("newProducer =>", producerId);
    if (!recvTransport) {
      console.warn("recvTransport yok, consume işlemi daha sonra yapılacak.");
      return;
    }
    consumeProducer(producerId);
  });
  socket.on('screenShareEnded', ({ userId }) => {
    const channelContentArea = document.querySelector('.channel-content-area');
    if (screenShareVideo && channelContentArea && channelContentArea.contains(screenShareVideo)) {
      channelContentArea.removeChild(screenShareVideo);
      screenShareVideo = null;
    }
    displayScreenShareEndedMessage();
  });
  socket.on('allChannelsData', (channelsObj) => {
    Object.keys(channelsObj).forEach(roomId => {
      const cData = channelsObj[roomId];
      const channelDiv = document.getElementById(`channel-users-${roomId}`);
      if (!channelDiv) return;
      channelDiv.innerHTML = '';
      cData.users.forEach(u => {
        const userRow = document.createElement('div');
        userRow.classList.add('channel-user');
        const leftDiv = document.createElement('div');
        leftDiv.classList.add('channel-user-left');
        const avatarDiv = document.createElement('div');
        avatarDiv.classList.add('channel-user-avatar');
        avatarDiv.id = `avatar-${u.id}`;
        const nameSpan = document.createElement('span');
        nameSpan.textContent = u.username || '(İsimsiz)';
        leftDiv.appendChild(avatarDiv);
        leftDiv.appendChild(nameSpan);
        const rightDiv = document.createElement('div');
        rightDiv.classList.add('channel-user-right');
        if (u.micEnabled === false) {
          const micIcon = document.createElement('span');
          micIcon.classList.add('material-icons');
          micIcon.textContent = 'mic_off';
          rightDiv.appendChild(micIcon);
        }
        if (u.selfDeafened === true) {
          const deafIcon = document.createElement('span');
          deafIcon.classList.add('material-icons');
          deafIcon.textContent = 'headset_off';
          rightDiv.appendChild(deafIcon);
        }
        if (u.isScreenSharing === true) {
          const screenIndicator = document.createElement('span');
          screenIndicator.classList.add('screen-share-indicator');
          screenIndicator.textContent = 'YAYINDA';
          if (u.screenShareProducerId) {
            screenIndicator.style.cursor = 'pointer';
            screenIndicator.addEventListener('click', () => {
              clearScreenShareUI();
              showScreenShare(u.screenShareProducerId);
            });
          }
          rightDiv.appendChild(screenIndicator);
        }
        userRow.appendChild(leftDiv);
        userRow.appendChild(rightDiv);
        channelDiv.appendChild(userRow);
      });
    });
  });
}

/* DM Panel toggle işlevi, her tıklamada DM moduna geçiş veya çıkış yapar (initUIEvents içinde tanımlanacak). */

/* startSfuFlow */
function startSfuFlow() {
  console.log("startSfuFlow => group:", currentGroup, " room:", currentRoom);
  if (!device) {
    device = new mediasoupClient.Device();
  }
  if (!localStream || localStream.getAudioTracks()[0].readyState === 'ended') {
    requestMicrophoneAccess().then(() => {
      console.log("Mikrofon izni alındı, SFU akışı başlatılıyor...");
      createTransportFlow();
    }).catch(err => {
      console.error("Mikrofon izni alınamadı:", err);
    });
  } else {
    createTransportFlow();
  }
}

/* createTransportFlow */
async function createTransportFlow() {
  const transportParams = await createTransport();
  if (transportParams.error) {
    console.error("createTransport error:", transportParams.error);
    return;
  }
  if (!deviceIsLoaded) {
    await device.load({ routerRtpCapabilities: transportParams.routerRtpCapabilities });
    deviceIsLoaded = true;
    console.log("Device yüklendi:", device.rtpCapabilities);
  } else {
    console.log("Device zaten yüklü.");
  }
  sendTransport = device.createSendTransport(transportParams);
  sendTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
    console.log("sendTransport connect => dtls");
    socket.emit('connectTransport', {
      groupId: currentGroup,
      roomId: currentRoom,
      transportId: transportParams.id,
      dtlsParameters
    }, (res) => {
      if (res && res.error) {
        errback(res.error);
      } else {
        callback();
      }
    });
  });
  sendTransport.on('produce', async (producerOptions, callback, errback) => {
    console.log("sendTransport produce =>", producerOptions);
    socket.emit('produce', {
      groupId: currentGroup,
      roomId: currentRoom,
      transportId: transportParams.id,
      kind: producerOptions.kind,
      rtpParameters: producerOptions.rtpParameters
    }, (res) => {
      if (res.error) {
        errback(res.error);
      } else {
        callback({ id: res.producerId });
      }
    });
  });
  if (!localStream) {
    await requestMicrophoneAccess();
  }
  let audioTrack = localStream.getAudioTracks()[0];
  try {
    localProducer = await sendTransport.produce({
      track: audioTrack,
      stopTracks: false
    });
    console.log("Mikrofon producer oluşturuldu:", localProducer.id);
  } catch (err) {
    if (err.name === "InvalidStateError") {
      console.error("Audio track bitti, yeniden mikrofon izni isteniyor...");
      await requestMicrophoneAccess();
      audioTrack = localStream.getAudioTracks()[0];
      localProducer = await sendTransport.produce({
        track: audioTrack,
        stopTracks: false
      });
      console.log("Yeni audio track ile producer oluşturuldu:", localProducer.id);
    } else {
      throw err;
    }
  }
  const recvParams = await createTransport();
  if (recvParams.error) {
    console.error("createTransport (recv) error:", recvParams.error);
    return;
  }
  recvTransport = device.createRecvTransport(recvParams);
  recvTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
    console.log("recvTransport connect => dtls");
    socket.emit('connectTransport', {
      groupId: currentGroup,
      roomId: currentRoom,
      transportId: recvParams.id,
      dtlsParameters
    }, (res) => {
      if (res && res.error) {
        errback(res.error);
      } else {
        callback();
      }
    });
  });
  const producers = await listProducers();
  console.log("Mevcut producerlar:", producers);
  for (const prod of producers) {
    if (prod.peerId === socket.id) {
      console.log("Kendi producer, tüketme yapılmıyor:", prod.id);
      continue;
    }
    await consumeProducer(prod.id);
  }
  console.log("SFU akışı tamamlandı.");
}

function createTransport() {
  return new Promise((resolve) => {
    socket.emit('createWebRtcTransport', {
      groupId: currentGroup,
      roomId: currentRoom
    }, (res) => {
      resolve(res);
    });
  });
}

function listProducers() {
  return new Promise((resolve) => {
    socket.emit('listProducers', {
      groupId: currentGroup,
      roomId: currentRoom
    }, (producerIds) => {
      resolve(producerIds || []);
    });
  });
}

/* consumeProducer */
async function consumeProducer(producerId) {
  if (!recvTransport) {
    console.warn("consumeProducer: recvTransport yok");
    return;
  }
  const consumeParams = await new Promise((resolve) => {
    socket.emit('consume', {
      groupId: currentGroup,
      roomId: currentRoom,
      transportId: recvTransport.id,
      producerId
    }, (res) => {
      resolve(res);
    });
  });
  if (consumeParams.error) {
    console.error("consume error:", consumeParams.error);
    return;
  }
  console.log("consumeProducer parametreleri:", consumeParams);
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
    console.log("Video consumer alındı, ekran paylaşım için tıklama ile consume edilecek. Producer:", consumeParams.producerId);
  }
}

/* startVolumeAnalysis */
async function startVolumeAnalysis(stream, userId) {
  if (!stream.getAudioTracks().length) {
    console.warn("No audio tracks in MediaStream for user:", userId);
    return;
  }
  stopVolumeAnalysis(userId);
  const audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(stream);
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);
  const dataArray = new Uint8Array(analyser.fftSize);
  const interval = setInterval(() => {
    analyser.getByteTimeDomainData(dataArray);
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const val = (dataArray[i] - 128) / 128.0;
      sum += Math.abs(val);
    }
    const average = sum / dataArray.length;
    const avatarElem = document.getElementById(`avatar-${userId}`);
    if (avatarElem) {
      if (average > SPEAKING_THRESHOLD) {
        avatarElem.classList.add('speaking');
      } else {
        avatarElem.classList.remove('speaking');
      }
    }
  }, VOLUME_CHECK_INTERVAL);
  audioAnalyzers[userId] = {
    audioContext,
    analyser,
    dataArray,
    interval
  };
}

/* stopVolumeAnalysis */
function stopVolumeAnalysis(userId) {
  if (audioAnalyzers[userId]) {
    clearInterval(audioAnalyzers[userId].interval);
    audioAnalyzers[userId].audioContext.close().catch(() => {});
    delete audioAnalyzers[userId];
  }
}

/* leaveRoomInternal */
function leaveRoomInternal() {
  clearScreenShareUI();
  if (window.screenShareProducerVideo || window.screenShareStream) {
    ScreenShare.stopScreenShare(socket);
    screenShareButton.classList.remove('active');
  }
  if (localProducer) {
    localProducer.close();
    localProducer = null;
  }
  if (sendTransport) {
    sendTransport.close();
    sendTransport = null;
  }
  if (recvTransport) {
    recvTransport.close();
    recvTransport = null;
  }
  for (const cid in consumers) {
    stopVolumeAnalysis(cid);
  }
  consumers = {};
  remoteAudios.forEach(a => {
    try { a.pause(); } catch(e){}
    a.srcObject = null;
  });
  remoteAudios = [];
  console.log("leaveRoomInternal: SFU transportlar kapatıldı");
}

/* joinRoom */
function joinRoom(groupId, roomId, roomName) {
  clearScreenShareUI();
  if (window.screenShareProducerVideo || window.screenShareStream) {
    ScreenShare.stopScreenShare(socket);
    screenShareButton.classList.remove('active');
  }
  console.log(`joinRoom çağrıldı: group=${groupId}, room=${roomId}, name=${roomName}`);
  socket.emit('joinRoom', { groupId, roomId });
  selectedChannelTitle.textContent = roomName;
  activeVoiceChannelName = roomName;
  showChannelStatusPanel();
  currentRoomType = "voice";
}

/* attemptLogin */
function attemptLogin() {
  const usernameVal = loginUsernameInput.value.trim();
  const passwordVal = loginPasswordInput.value.trim();
  loginErrorMessage.style.display = 'none';
  loginUsernameInput.classList.remove('shake');
  loginPasswordInput.classList.remove('shake');
  if (!usernameVal || !passwordVal) {
    loginErrorMessage.textContent = "Lütfen gerekli alanları doldurunuz";
    loginErrorMessage.style.display = 'block';
    loginUsernameInput.classList.add('shake');
    loginPasswordInput.classList.add('shake');
    return;
  }
  socket.emit('login', { username: usernameVal, password: passwordVal });
}

/* requestMicrophoneAccess */
async function requestMicrophoneAccess() {
  try {
    console.log("Mikrofon izni isteniyor...");
    const constraints = {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: false
      }
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    console.log("Mikrofon erişimi verildi:", stream);
    localStream = stream;
    audioPermissionGranted = true;
    applyAudioStates();
    startVolumeAnalysis(localStream, socket.id);
    remoteAudios.forEach(audioEl => {
      audioEl.play().catch(err => console.error("Ses oynatılamadı:", err));
    });
    return stream;
  } catch(err) {
    console.error("Mikrofon izni alınamadı:", err);
    throw err;
  }
}

function initUIEvents() {
  // Login
  loginButton.addEventListener('click', attemptLogin);
  loginUsernameInput.addEventListener('keydown', e => e.key==='Enter' && attemptLogin());
  loginPasswordInput.addEventListener('keydown', e => e.key==='Enter' && attemptLogin());

  // ** Register handler’ı burada ekleyin **
  registerButton.addEventListener('click', attemptRegister);
  regPasswordConfirmInput.addEventListener('keydown', e => e.key==='Enter' && attemptRegister());  

  // Sayfalar arası geçiş linkleri
  showRegisterScreen.addEventListener('click', () => {
    loginScreen.style.display    = 'none';
    registerScreen.style.display = 'block';
  });
  showLoginScreen.addEventListener('click', () => {
    registerScreen.style.display = 'none';
    loginScreen.style.display    = 'block';
  });
  backToLoginButton.addEventListener('click', () => {
    registerScreen.style.display = 'none';
    loginScreen.style.display    = 'block';
  });

  // Login
  loginButton.addEventListener('click', attemptLogin);
  loginUsernameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') attemptLogin();
  });
  loginPasswordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') attemptLogin();
  });
  
  // DM Panel toggle: Her tıklamada DM moduna geçiş veya çıkış yapar.
  toggleDMButton.addEventListener('click', () => {
    console.log("toggleDMButton clicked, current isDMMode:", isDMMode);
    const channelContentArea = document.getElementById('channelContentArea');
    const selectedChannelBar = document.getElementById('selectedChannelBar');
    const selectedDMBar = document.getElementById('selectedDMBar');
    const dmContentArea = document.getElementById('dmContentArea');
    const dmPanel = document.getElementById('dmPanel');
    
    if (!isDMMode) {
      // DM moduna geç
      roomPanel.style.display = 'none';
      channelContentArea.style.display = 'none';
      rightPanel.style.display = 'none';
      selectedChannelBar.style.display = 'none';
      
      selectedDMBar.style.display = 'flex';
      dmContentArea.style.display = 'flex';
      dmPanel.style.display = 'block';
      
      toggleDMButton.querySelector('.material-icons').textContent = 'group';
      isDMMode = true;
      console.log("Switched to DM mode");
    } else {
      // Kanal moduna geri dön
      roomPanel.style.display = 'flex';
      channelContentArea.style.display = 'flex';
      rightPanel.style.display = 'flex';
      selectedDMBar.style.display = 'none';
      dmContentArea.style.display = 'none';
      dmPanel.style.display = 'none';
      selectedChannelBar.style.display = 'flex';
      
      toggleDMButton.querySelector('.material-icons').textContent = 'forum';
      document.getElementById('selectedChannelTitle').textContent = 'Kanal Seçilmedi';
      isDMMode = false;
      console.log("Switched to channel mode");
    }
  });
  
  leaveButton.addEventListener('click', () => {
    clearScreenShareUI();
    if (!currentRoom) return;
    socket.emit('leaveRoom', { groupId: currentGroup, roomId: currentRoom });
    leaveRoomInternal();
    hideChannelStatusPanel();
    currentRoom = null;
    selectedChannelTitle.textContent = 'Kanal Seçilmedi';
    const container = document.getElementById('channelUsersContainer');
    if (container) {
      container.innerHTML = '';
      container.classList.remove('layout-1-user','layout-2-users','layout-3-users','layout-4-users','layout-n-users');
    }
    textChannelContainer.style.display = 'none';
    socket.emit('browseGroup', currentGroup);
  });
  micToggleButton.addEventListener('click', () => {
    micEnabled = !micEnabled;
    applyAudioStates();
  });
  deafenToggleButton.addEventListener('click', () => {
    if (!selfDeafened) {
      micWasEnabledBeforeDeaf = micEnabled;
      selfDeafened = true;
      micEnabled = false;
    } else {
      selfDeafened = false;
      if (micWasEnabledBeforeDeaf) micEnabled = true;
    }
    applyAudioStates();
  });
  settingsButton.addEventListener('click', () => {
    // ...
  });
  function sendTextMessage() {
    const msg = textChannelMessageInput.value.trim();
    if (!msg) return;
    socket.emit('textMessage', { 
      groupId: selectedGroup, 
      roomId: currentTextChannel, 
      message: msg, 
      username: username 
    });
    textChannelMessageInput.value = '';
    sendTextMessageBtn.style.display = "none";
  }
  sendTextMessageBtn.addEventListener('click', sendTextMessage);
  textChannelMessageInput.addEventListener('input', () => {
    if (textChannelMessageInput.value.trim() !== "") {
      sendTextMessageBtn.style.display = "block";
    } else {
      sendTextMessageBtn.style.display = "none";
    }
  });
  textChannelMessageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendTextMessage();
    }
  });
  if(screenShareButton) {
    screenShareButton.addEventListener('click', async () => {
      if(window.screenShareProducerVideo) {
        await ScreenShare.stopScreenShare(socket);
        screenShareButton.classList.remove('active');
      } else {
        try {
          if(!sendTransport) {
            alert("Ekran paylaşımı için transport henüz hazır değil.");
            return;
          }
          clearScreenShareUI();
          await ScreenShare.startScreenShare(sendTransport, socket);
          screenShareButton.classList.add('active');
        } catch(error) {
          console.error("Ekran paylaşımı başlatılırken hata:", error);
        }
      }
    });
  }
}

/* applyAudioStates */
function applyAudioStates() {
  if (localProducer) {
    if (micEnabled && !selfDeafened) {
      localProducer.resume();
      if (!audioAnalyzers[socket.id]) {
        startVolumeAnalysis(localStream, socket.id);
      }
    } else {
      localProducer.pause();
      stopVolumeAnalysis(socket.id);
      const avatarElem = document.getElementById(`avatar-${socket.id}`);
      if (avatarElem) {
        avatarElem.classList.remove('speaking');
      }
    }
  }
  if (!micEnabled || selfDeafened) {
    micToggleButton.innerHTML = `<span class="material-icons">mic_off</span>`;
    micToggleButton.classList.add('btn-muted');
  } else {
    micToggleButton.innerHTML = `<span class="material-icons">mic</span>`;
    micToggleButton.classList.remove('btn-muted');
  }
  if (selfDeafened) {
    deafenToggleButton.innerHTML = `<span class="material-icons">headset_off</span>`;
    deafenToggleButton.classList.add('btn-muted');
  } else {
    deafenToggleButton.innerHTML = `<span class="material-icons">headset</span>`;
    deafenToggleButton.classList.remove('btn-muted');
  }
  remoteAudios.forEach(audio => {
    audio.muted = selfDeafened;
  });
  socket.emit('audioStateChanged', { micEnabled, selfDeafened });
}

/* hideChannelStatusPanel */
function hideChannelStatusPanel() {
  channelStatusPanel.style.display = 'none';
  Ping.stopPingInterval();
}

/* showChannelStatusPanel */
function showChannelStatusPanel() {
  channelStatusPanel.style.height = "100px";
  channelStatusPanel.style.zIndex = "20";
  channelStatusPanel.style.display = 'block';
  channelStatusPanel.innerHTML = `
    <div class="status-content" style="display: flex; flex-direction: column; height: 100%; justify-content: space-between; padding: 0 10px;">
      <div class="status-main" style="display: flex; align-items: center; justify-content: space-between;">
        <div style="display: flex; align-items: center;">
          <span class="material-icons" id="rssIcon" style="font-size: 32px; margin-right: 8px;">rss_feed</span>
          <div id="statusMessage" style="font-size: 1.2em; font-weight: bold;">sese bağlanıldı</div>
        </div>
        <button id="leaveChannelBtn" style="background: none; border: none; cursor: pointer;">
          <span class="material-icons" style="font-size: 28px; color: #aaa;">call_end</span>
        </button>
      </div>
      <div style="display: flex; flex-direction: column;">
        <div id="channelGroupInfo" style="font-size: 0.8em; margin-bottom: 4px; color: #aaa;"> </div>
        <div class="status-buttons" style="display: flex; gap: 10px;">
          <button class="status-btn" id="screenShareStatusBtn" style="flex: 1; padding: 6px 12px; border: 1px solid #ccc; background-color: #444; color: #fff; border-radius: 4px;">
            <span class="material-icons" id="screenShareIcon">cast</span>
          </button>
          <button class="status-btn" style="flex: 1; padding: 6px 12px; border: 1px solid #ccc; background-color: #444; color: #fff; border-radius: 4px;">Buton 2</button>
          <button class="status-btn" style="flex: 1; padding: 6px 12px; border: 1px solid #ccc; background-color: #444; color: #fff; border-radius: 4px;">Buton 3</button>
        </div>
      </div>
    </div>
  `;
  const leaveChannelBtn = document.getElementById('leaveChannelBtn');
  leaveChannelBtn.addEventListener('mouseenter', () => {
    const icon = leaveChannelBtn.querySelector('.material-icons');
    if (icon) icon.style.color = "#c61884";
  });
  leaveChannelBtn.addEventListener('mouseleave', () => {
    const icon = leaveChannelBtn.querySelector('.material-icons');
    if (icon) icon.style.color = "#aaa";
  });
  const screenShareBtn = document.getElementById('screenShareStatusBtn');
  screenShareBtn.addEventListener('mouseenter', () => {
    if (!screenShareBtn.classList.contains('active')) {
      screenShareBtn.style.borderColor = "#c61884";
      screenShareBtn.style.color = "#c61884";
      const icon = document.getElementById('screenShareIcon');
      if(icon) icon.style.color = "#c61884";
    }
  });
  screenShareBtn.addEventListener('mouseleave', () => {
    if (!screenShareBtn.classList.contains('active')) {
      screenShareBtn.style.borderColor = "#ccc";
      screenShareBtn.style.color = "#fff";
      const icon = document.getElementById('screenShareIcon');
      if(icon) icon.style.color = "#fff";
      screenShareBtn.style.backgroundColor = "#444";
    }
  });
  screenShareBtn.addEventListener('click', async () => {
    const icon = document.getElementById('screenShareIcon');
    if(window.screenShareProducerVideo) {
      await ScreenShare.stopScreenShare(socket);
      screenShareBtn.classList.remove('active');
      if(icon) {
        icon.textContent = "cast";
        icon.style.color = "#fff";
      }
      screenShareBtn.style.borderColor = "#ccc";
      screenShareBtn.style.color = "#fff";
      screenShareBtn.style.backgroundColor = "#444";
    } else {
      try {
        if(!sendTransport) {
          alert("Ekran paylaşımı için transport henüz hazır değil.");
          return;
        }
        clearScreenShareUI();
        await ScreenShare.startScreenShare(sendTransport, socket);
        screenShareBtn.classList.add('active');
        if(icon) {
          icon.textContent = "cancel_presentation";
          icon.style.color = "#fff";
        }
        screenShareBtn.style.borderColor = "#c61884";
        screenShareBtn.style.color = "#c61884";
        screenShareBtn.style.backgroundColor = "#c61884";
      } catch(error) {
        console.error("Ekran paylaşımı başlatılırken hata:", error);
      }
    }
  });
  document.getElementById('leaveChannelBtn').addEventListener('click', () => {
    if (!currentRoom) return;
    socket.emit('leaveRoom', { groupId: currentGroup, roomId: currentRoom });
    leaveRoomInternal();
    hideChannelStatusPanel();
    currentRoom = null;
    selectedChannelTitle.textContent = 'Kanal Seçilmedi';
    const container = document.getElementById('channelUsersContainer');
    if (container) {
      container.innerHTML = '';
      container.classList.remove('layout-1-user','layout-2-users','layout-3-users','layout-4-users','layout-n-users');
    }
    textChannelContainer.style.display = 'none';
    socket.emit('browseGroup', currentGroup);
  });
  Ping.startPingInterval(socket);
  Ping.updateStatusPanel(0);
}

/* Text Channel Functions */
/**************************************
 * public/js/textChannel.js
 * Metin (mesaj) kanallarıyla ilgili tüm fonksiyonlar burada toplanmıştır.
 **************************************/
// [textChannel.js içeriği ayrı bir dosyada olduğu için burada include edilmiyor]

/* Typing Indicator Module */
/**************************************
 * typingIndicator.js içeriği ayrı bir dosyada olduğu için burada include edilmiyor.
 **************************************/
