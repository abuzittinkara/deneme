/**************************************
 * script.js
 * TAMAMEN SFU MANTIĞINA GEÇİLMİŞ VERSİYON
 **************************************/
import * as TextChannel from './js/textChannel.js';

let socket = null; 
let device = null;   // mediasoup-client Device
let deviceIsLoaded = false;
let sendTransport = null;
let recvTransport = null;

// Mikrofon akışı
let localStream = null;
let audioPermissionGranted = false;

// Producer (mikrofon)
let localProducer = null;

// Remote audio consumer objeleri
let consumers = {};  // consumerId -> consumer

// Remote audio elementlerini saklayalım
let remoteAudios = [];

// Kimlik
let username = null;
let currentGroup = null;
let currentRoom = null;
let selectedGroup = null;
let currentTextChannel = null; // Metin kanalı için seçili kanal id'si
let currentRoomType = null;    // "voice" veya "text"

// Mikrofon / Kulaklık
let micEnabled = true;
let selfDeafened = false;
let micWasEnabledBeforeDeaf = false;

// Ses seviyesi analizi
const SPEAKING_THRESHOLD = 0.02;
const VOLUME_CHECK_INTERVAL = 100;
let audioAnalyzers = {};

let pingInterval = null;

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

// DM panel
const toggleDMButton = document.getElementById('toggleDMButton');
const closeDMButton = document.getElementById('closeDMButton');
let isDMMode = false;

// Sağ panel (userList)
const userListDiv = document.getElementById('userList');

// Kanal Durum Paneli
const channelStatusPanel = document.getElementById('channelStatusPanel');
const pingValueSpan = document.getElementById('pingValue');
const cellBar1 = document.getElementById('cellBar1');
const cellBar2 = document.getElementById('cellBar2');
const cellBar3 = document.getElementById('cellBar3');
const cellBar4 = document.getElementById('cellBar4');

// Ayrıl Butonu
const leaveButton = document.getElementById('leaveButton');

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

window.addEventListener('DOMContentLoaded', () => {
  socket = io("https://fisqos.com.tr", { transports: ['websocket'] });
  console.log("Socket connected =>", socket.id);
  initSocketEvents();
  initUIEvents();
  
  // textMessages için scroll event listener
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
  
  // Metin kanalına ait eventleri modül üzerinden başlatıyoruz.
  TextChannel.initTextChannelEvents(socket, textMessages);
});

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
      registerScreen.style.display = 'none';
      loginScreen.style.display = 'block';
    } else {
      registerErrorMessage.style.display = 'block';
      registerErrorMessage.textContent = data.message || "Lütfen girdiğiniz bilgileri kontrol edip tekrar deneyin";
      regUsernameInput.classList.add('shake');
      regPasswordInput.classList.add('shake');
      regPasswordConfirmInput.classList.add('shake');
    }
  });
  socket.on('groupsList', (groupArray) => {
    groupListDiv.innerHTML = '';
    groupArray.forEach(groupObj => {
      const grpItem = document.createElement('div');
      grpItem.className = 'grp-item';
      grpItem.innerText = groupObj.name[0].toUpperCase();
      grpItem.title = groupObj.name + " (" + groupObj.id + ")";
      grpItem.addEventListener('click', () => {
        document.querySelectorAll('.grp-item').forEach(el => el.classList.remove('selected'));
        grpItem.classList.add('selected');
        selectedGroup = groupObj.id;
        currentGroup = null;
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
  socket.on('roomsList', (roomsArray) => {
    roomListDiv.innerHTML = '';
    roomsArray.forEach(roomObj => {
      const roomItem = document.createElement('div');
      roomItem.className = 'channel-item';
      const channelHeader = document.createElement('div');
      channelHeader.className = 'channel-header';
      let icon;
      if (roomObj.type === 'voice') {
        icon = createWaveIcon();
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
      
      roomItem.addEventListener('click', () => {
        if (roomObj.type === 'text') {
          console.log(`Text channel clicked => ${roomObj.name}`);
          document.getElementById('selectedChannelTitle').textContent = roomObj.name;
          textChannelContainer.style.display = 'flex';
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
        // Voice channel için:
        textChannelContainer.style.display = 'none';
        document.getElementById('channelUsersContainer').style.display = 'flex';
        document.querySelectorAll('.channel-item').forEach(ci => ci.classList.remove('connected'));
        if (currentRoom === roomObj.id && currentGroup === selectedGroup) {
          roomItem.classList.add('connected');
          return;
        }
        if (currentRoom && (currentRoom !== roomObj.id || currentGroup !== selectedGroup)) {
          leaveRoomInternal();
        }
        currentGroup = selectedGroup;
        joinRoom(currentGroup, roomObj.id, roomObj.name);
        roomItem.classList.add('connected');
      });
      roomListDiv.appendChild(roomItem);
    });
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
        const buttonsDiv = document.createElement('div');
        buttonsDiv.classList.add('channel-user-buttons');
        if (!u.micEnabled) {
          const micIcon = document.createElement('span');
          micIcon.classList.add('material-icons');
          micIcon.style.color = '#c61884';
          micIcon.style.fontSize = '18px';
          micIcon.textContent = 'mic_off';
          buttonsDiv.appendChild(micIcon);
        }
        if (u.selfDeafened) {
          const deafIcon = document.createElement('span');
          deafIcon.classList.add('material-icons');
          deafIcon.style.color = '#c61884';
          deafIcon.style.fontSize = '18px';
          deafIcon.textContent = 'headset_off';
          buttonsDiv.appendChild(deafIcon);
        }
        userRow.appendChild(leftDiv);
        userRow.appendChild(buttonsDiv);
        channelDiv.appendChild(userRow);
      });
    });
  });
  socket.on('groupUsers', (dbUsersArray) => {
    updateUserList(dbUsersArray);
  });
  socket.on('joinRoomAck', ({ groupId, roomId }) => {
    console.log("joinRoomAck =>", groupId, roomId);
    currentGroup = groupId;
    currentRoom = roomId;
    currentRoomType = "voice";
    if (!audioPermissionGranted || !localStream) {
      requestMicrophoneAccess().then(() => {
        startSfuFlow();
      });
    } else {
      startSfuFlow();
    }
  });
  socket.on('roomUsers', (usersInRoom) => {
    console.log("roomUsers => odadaki kisiler:", usersInRoom);
    renderUsersInMainContent(usersInRoom);
  });
  socket.on('groupRenamed', (data) => {
    const { groupId, newName } = data;
    if (currentGroup === groupId || selectedGroup === groupId) {
      groupTitle.textContent = newName;
    }
    socket.emit('set-username', username);
  });
  socket.on('groupDeleted', (data) => {
    const { groupId } = data;
    if (currentGroup === groupId) {
      currentGroup = null;
      currentRoom = null;
      groupTitle.textContent = "Seçili Grup";
      userListDiv.innerHTML = '';
      roomListDiv.innerHTML = '';
      hideChannelStatusPanel();
    }
    if (selectedGroup === groupId) {
      selectedGroup = null;
      groupTitle.textContent = "Seçili Grup";
      userListDiv.innerHTML = '';
      roomListDiv.innerHTML = '';
      hideChannelStatusPanel();
    }
    socket.emit('set-username', username);
  });
  socket.on('newProducer', ({ producerId }) => {
    console.log("newProducer =>", producerId);
    if (!recvTransport) {
      console.warn("recvTransport yok => sonra consume edebiliriz");
      return;
    }
    consumeProducer(producerId);
  });
  
  // Metin mesajları render işlemleri artık TextChannel modülüne taşındı.
}

function startSfuFlow() {
  console.log("startSfuFlow => group:", currentGroup, " room:", currentRoom);
  if (!device) {
    device = new mediasoupClient.Device();
  }
  if (!localStream || localStream.getAudioTracks()[0].readyState === 'ended') {
    requestMicrophoneAccess().then(() => {
      createTransportFlow();
    });
  } else {
    createTransportFlow();
  }
}

async function createTransportFlow() {
  const transportParams = await createTransport();
  if (transportParams.error) {
    console.error("createTransport error:", transportParams.error);
    return;
  }
  if (!deviceIsLoaded) {
    await device.load({ routerRtpCapabilities: transportParams.routerRtpCapabilities });
    deviceIsLoaded = true;
    console.log("Device load bitti =>", device.rtpCapabilities);
  } else {
    console.log("Device zaten yüklü...");
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
    console.log("Mikrofon produce edildi =>", localProducer.id);
  } catch (err) {
    if (err.name === "InvalidStateError") {
      console.error("Audio track ended error, tekrar mikrofon alınıyor...");
      await requestMicrophoneAccess();
      audioTrack = localStream.getAudioTracks()[0];
      localProducer = await sendTransport.produce({
        track: audioTrack,
        stopTracks: false
      });
      console.log("Mikrofon produce edildi (yeni track) =>", localProducer.id);
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
  console.log("Mevcut producerlar =>", producers);
  for (const prod of producers) {
    if (prod.peerId === socket.id) {
      console.log("Kendi producer => tüketme yok:", prod.id);
      continue;
    }
    await consumeProducer(prod.id);
  }
  console.log("startSfuFlow => tamamlandı.");
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

async function consumeProducer(producerId) {
  if (!recvTransport) {
    console.warn("consumeProducer => recvTransport yok");
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
  console.log("consumeProducer =>", consumeParams);
  const consumer = await recvTransport.consume({
    id: consumeParams.id,
    producerId: consumeParams.producerId,
    kind: consumeParams.kind,
    rtpParameters: consumeParams.rtpParameters
  });
  consumer.appData = { peerId: consumeParams.producerPeerId };
  consumers[consumer.id] = consumer;
  const { track } = consumer;
  const audioEl = document.createElement('audio');
  audioEl.srcObject = new MediaStream([track]);
  audioEl.autoplay = true;
  audioEl.dataset.peerId = consumer.appData.peerId;
  remoteAudios.push(audioEl);
  audioEl.play().catch(err => console.error("Ses oynatılamadı:", err));
  startVolumeAnalysis(audioEl.srcObject, consumer.appData.peerId);
  console.log("Yeni consumer =>", consumer.id, "=> gerçekte konuşan:", consumer.appData.peerId);
}

function startVolumeAnalysis(stream, userId) {
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

function stopVolumeAnalysis(userId) {
  if (audioAnalyzers[userId]) {
    clearInterval(audioAnalyzers[userId].interval);
    audioAnalyzers[userId].audioContext.close().catch(() => {});
    delete audioAnalyzers[userId];
  }
}

function leaveRoomInternal() {
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
  console.log("leaveRoomInternal => SFU transportlar kapatıldı");
}

function joinRoom(groupId, roomId, roomName) {
  socket.emit('joinRoom', { groupId, roomId });
  document.getElementById('selectedChannelTitle').textContent = roomName;
  showChannelStatusPanel();
  currentRoomType = "voice";
}

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
  } catch(err) {
    console.error("Mikrofon izni alınamadı:", err);
  }
}

function initUIEvents() {
  loginButton.addEventListener('click', attemptLogin);
  loginUsernameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') attemptLogin();
  });
  loginPasswordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') attemptLogin();
  });
  registerButton.addEventListener('click', () => {
    const userData = {
      username: regUsernameInput.value.trim(),
      name: regNameInput.value.trim(),
      surname: regSurnameInput.value.trim(),
      birthdate: regBirthdateInput.value.trim(),
      email: regEmailInput.value.trim(),
      phone: regPhoneInput.value.trim(),
      password: regPasswordInput.value.trim(),
      passwordConfirm: regPasswordConfirmInput.value.trim()
    };
    registerErrorMessage.style.display = 'none';
    regUsernameInput.classList.remove('shake');
    regPasswordInput.classList.remove('shake');
    regPasswordConfirmInput.classList.remove('shake');
    let isError = false;
    if (!userData.username || !userData.name || !userData.surname ||
        !userData.birthdate || !userData.email || !userData.phone ||
        !userData.password || !userData.passwordConfirm) {
      regUsernameInput.classList.add('shake');
      regPasswordInput.classList.add('shake');
      regPasswordConfirmInput.classList.add('shake');
      registerErrorMessage.style.display = 'block';
      registerErrorMessage.textContent = "Lütfen girdiğiniz bilgileri kontrol edip tekrar deneyin";
      isError = true;
    } else if (userData.username !== userData.username.toLowerCase()) {
      regUsernameInput.classList.add('shake');
      registerErrorMessage.style.display = 'block';
      registerErrorMessage.textContent = "Kullanıcı adı sadece küçük harf olmalı!";
      isError = true;
    } else if (userData.password !== userData.passwordConfirm) {
      regPasswordInput.classList.add('shake');
      regPasswordConfirmInput.classList.add('shake');
      registerErrorMessage.style.display = 'block';
      registerErrorMessage.textContent = "Parolalar eşleşmiyor!";
      isError = true;
    }
    if (!isError) {
      socket.emit('register', userData);
    }
  });
  backToLoginButton.addEventListener('click', () => {
    registerScreen.style.display = 'none';
    loginScreen.style.display = 'block';
  });
  showRegisterScreen.addEventListener('click', () => {
    registerScreen.style.display = 'none';
    loginScreen.style.display = 'block';
  });
  showLoginScreen.addEventListener('click', () => {
    registerScreen.style.display = 'none';
    loginScreen.style.display = 'block';
  });
  createGroupButton.addEventListener('click', () => {
    document.getElementById('groupModal').style.display = 'flex';
  });
  document.getElementById('modalGroupCreateBtn').addEventListener('click', () => {
    document.getElementById('groupModal').style.display = 'none';
    document.getElementById('actualGroupCreateModal').style.display = 'flex';
  });
  document.getElementById('modalGroupJoinBtn').addEventListener('click', () => {
    document.getElementById('groupModal').style.display = 'none';
    document.getElementById('joinGroupModal').style.display = 'flex';
  });
  document.getElementById('actualGroupNameBtn').addEventListener('click', () => {
    const grpName = document.getElementById('actualGroupName').value.trim();
    if (!grpName) {
      alert("Grup adı boş olamaz!");
      return;
    }
    socket.emit('createGroup', grpName);
    document.getElementById('actualGroupCreateModal').style.display = 'none';
  });
  document.getElementById('closeCreateGroupModal').addEventListener('click', () => {
    document.getElementById('actualGroupCreateModal').style.display = 'none';
  });
  document.getElementById('joinGroupIdBtn').addEventListener('click', () => {
    const grpIdVal = document.getElementById('joinGroupIdInput').value.trim();
    if (!grpIdVal) {
      alert("Grup ID boş olamaz!");
      return;
    }
    socket.emit('joinGroupByID', grpIdVal);
    document.getElementById('joinGroupModal').style.display = 'none';
  });
  document.getElementById('closeJoinGroupModal').addEventListener('click', () => {
    document.getElementById('joinGroupModal').style.display = 'none';
  });
  document.getElementById('modalCreateRoomBtn').addEventListener('click', () => {
    const rName = document.getElementById('modalRoomName').value.trim();
    if (!rName) {
      alert("Oda adı girin!");
      return;
    }
    const channelType = document.querySelector('input[name="channelType"]:checked').value;
    const grp = currentGroup || selectedGroup;
    if (!grp) {
      alert("Önce bir gruba katılın!");
      return;
    }
    socket.emit('createRoom', { groupId: grp, roomName: rName, channelType: channelType });
    document.getElementById('roomModal').style.display = 'none';
  });
  document.getElementById('modalCloseRoomBtn').addEventListener('click', () => {
    document.getElementById('roomModal').style.display = 'none';
  });
  copyGroupIdBtn.addEventListener('click', () => {
    groupDropdownMenu.style.display = 'none';
    const grp = currentGroup || selectedGroup;
    if (!grp) {
      alert("Şu an bir grup seçili değil!");
      return;
    }
    navigator.clipboard.writeText(grp)
      .then(() => alert("Grup ID kopyalandı: " + grp))
      .catch(err => {
        console.error("Kopyalama hatası:", err);
        alert("Kopyalama başarısız!");
      });
  });
  renameGroupBtn.addEventListener('click', () => {
    groupDropdownMenu.style.display = 'none';
    const grp = currentGroup || selectedGroup;
    if (!grp) {
      alert("Şu an bir grup seçili değil!");
      return;
    }
    const newName = prompt("Yeni grup ismini girin:");
    if (!newName || !newName.trim()) {
      alert("Grup ismi boş olamaz!");
      return;
    }
    socket.emit('renameGroup', { groupId: grp, newName: newName.trim() });
  });
  createChannelBtn.addEventListener('click', () => {
    groupDropdownMenu.style.display = 'none';
    const grp = currentGroup || selectedGroup;
    if (!grp) {
      alert("Önce bir gruba katılın!");
      return;
    }
    document.getElementById('roomModal').style.display = 'flex';
    document.getElementById('modalRoomName').value = '';
    document.getElementById('modalRoomName').focus();
  });
  deleteGroupBtn.addEventListener('click', () => {
    groupDropdownMenu.style.display = 'none';
    const grp = currentGroup || selectedGroup;
    if (!grp) {
      alert("Şu an bir grup seçili değil!");
      return;
    }
    const confirmDel = confirm("Bu grubu silmek istediğinize emin misiniz?");
    if (!confirmDel) return;
    socket.emit('deleteGroup', grp);
  });
  groupDropdownIcon.addEventListener('click', () => {
    if (groupDropdownMenu.style.display === 'none' || groupDropdownMenu.style.display === '') {
      groupDropdownMenu.style.display = 'block';
    } else {
      groupDropdownMenu.style.display = 'none';
    }
  });
  toggleDMButton.addEventListener('click', () => {
    const dmPanel = document.getElementById('dmPanel');
    if (dmPanel.style.display === 'none' || dmPanel.style.display === '') {
      dmPanel.style.display = 'block';
      isDMMode = true;
    } else {
      dmPanel.style.display = 'none';
      isDMMode = false;
    }
  });
  closeDMButton.addEventListener('click', () => {
    document.getElementById('dmPanel').style.display = 'none';
    isDMMode = false;
  });
  leaveButton.addEventListener('click', () => {
    if (!currentRoom) return;
    socket.emit('leaveRoom', { groupId: currentGroup, roomId: currentRoom });
    leaveRoomInternal();
    hideChannelStatusPanel();
    currentRoom = null;
    document.getElementById('selectedChannelTitle').textContent = 'Kanal Seçilmedi';
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
  
  // Mesaj gönderme işlemi
  function sendTextMessage() {
    const msg = textChannelMessageInput.value.trim();
    if (!msg) return;
    const time = TextChannel.formatTimestamp(new Date());
    // Önceki mesajın göndericisini kontrol edelim (date-separator'ı atlayarak)
    let lastMsgElem = textMessages.lastElementChild;
    while (lastMsgElem && lastMsgElem.classList.contains('date-separator')) {
      lastMsgElem = lastMsgElem.previousElementSibling;
    }
    let msgClass = "";
    if (!lastMsgElem || lastMsgElem.getAttribute('data-sender') !== username) {
      // Yeni blok: sadece bir mesaj (tek mesaj)
      msgClass = "only-message";
    } else {
      // Aynı göndericinin ardışık mesajı: güncelleme
      if (lastMsgElem.classList.contains("only-message")) {
        lastMsgElem.classList.remove("only-message");
        lastMsgElem.classList.add("first-message");
      } else if (lastMsgElem.classList.contains("last-message")) {
        lastMsgElem.classList.remove("last-message");
        lastMsgElem.classList.add("middle-message");
      }
      msgClass = "last-message";
    }
    
    let msgHTML = "";
    if (msgClass === "only-message" || msgClass === "first-message" || msgClass === "last-message") {
      msgHTML = `
        <div class="message-item">
          <div class="message-header">
            <div class="avatar-and-name">
              <img class="message-avatar" src="/images/default-avatar.png" alt="">
              <span class="sender-name">${username}</span>
            </div>
            <span class="timestamp">${time}</span>
          </div>
          <div class="message-content">${msg}</div>
        </div>
      `;
    } else {
      msgHTML = `
        <div class="message-item">
          <div class="message-content" style="margin-left: 48px;">${msg}</div>
        </div>
      `;
    }
    const className = `text-message left-message ${msgClass}`;
    const msgDiv = document.createElement('div');
    msgDiv.className = className;
    msgDiv.setAttribute('data-timestamp', new Date());
    msgDiv.setAttribute('data-sender', username);
    msgDiv.innerHTML = msgHTML;
    textMessages.appendChild(msgDiv);
    textMessages.scrollTop = textMessages.scrollHeight;
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
  
  // Diğer UI event handler'ları korunuyor.
}

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

function updateUserList(data) {
  userListDiv.innerHTML = '';
  const onlineTitle = document.createElement('div');
  onlineTitle.textContent = 'Çevrimiçi';
  onlineTitle.style.fontWeight = 'normal';
  onlineTitle.style.fontSize = '0.85rem';
  userListDiv.appendChild(onlineTitle);
  if (data.online && data.online.length > 0) {
    data.online.forEach(u => {
      userListDiv.appendChild(createUserItem(u.username, true));
    });
  } else {
    const noneP = document.createElement('p');
    noneP.textContent = '(Kimse yok)';
    noneP.style.fontSize = '0.75rem';
    userListDiv.appendChild(noneP);
  }
  const offlineTitle = document.createElement('div');
  offlineTitle.textContent = 'Çevrimdışı';
  offlineTitle.style.fontWeight = 'normal';
  offlineTitle.style.fontSize = '0.85rem';
  offlineTitle.style.marginTop = '1rem';
  userListDiv.appendChild(offlineTitle);
  if (data.offline && data.offline.length > 0) {
    data.offline.forEach(u => {
      userListDiv.appendChild(createUserItem(u.username, false));
    });
  } else {
    const noneP2 = document.createElement('p');
    noneP2.textContent = '(Kimse yok)';
    noneP2.style.fontSize = '0.75rem';
    userListDiv.appendChild(noneP2);
  }
}

function createUserItem(username, isOnline) {
  const userItem = document.createElement('div');
  userItem.classList.add('user-item');
  const profileThumb = document.createElement('div');
  profileThumb.classList.add('profile-thumb');
  profileThumb.style.backgroundColor = isOnline ? '#2dbf2d' : '#777';
  const userNameSpan = document.createElement('span');
  userNameSpan.classList.add('user-name');
  userNameSpan.textContent = username;
  const copyIdBtn = document.createElement('button');
  copyIdBtn.classList.add('copy-id-btn');
  copyIdBtn.textContent = "ID Kopyala";
  copyIdBtn.dataset.userid = username;
  copyIdBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(username)
      .then(() => alert("Kullanıcı kopyalandı: " + username))
      .catch(err => {
        console.error("Kopyalama hatası:", err);
        alert("Kopyalama başarısız!");
      });
  });
  userItem.appendChild(profileThumb);
  userItem.appendChild(userNameSpan);
  userItem.appendChild(copyIdBtn);
  return userItem;
}

function createWaveIcon() {
  const icon = document.createElement('span');
  icon.classList.add('material-icons');
  icon.classList.add('channel-icon');
  icon.textContent = 'volume_up';
  return icon;
}

function renderUsersInMainContent(usersArray) {
  const container = document.getElementById('channelUsersContainer');
  if (!container) return;
  container.innerHTML = '';
  container.classList.remove('layout-1-user','layout-2-users','layout-3-users','layout-4-users','layout-n-users');
  if (usersArray.length === 1) {
    container.classList.add('layout-1-user');
  } else if (usersArray.length === 2) {
    container.classList.add('layout-2-users');
  } else if (usersArray.length === 3) {
    container.classList.add('layout-3-users');
  } else if (usersArray.length === 4) {
    container.classList.add('layout-4-users');
  } else {
    container.classList.add('layout-n-users');
  }
  usersArray.forEach(u => {
    const card = document.createElement('div');
    card.classList.add('user-card');
    const avatar = document.createElement('div');
    avatar.classList.add('user-card-avatar');
    avatar.id = `avatar-${u.id}`;
    const label = document.createElement('div');
    label.classList.add('user-label');
    label.textContent = u.username || '(İsimsiz)';
    card.appendChild(avatar);
    card.appendChild(label);
    container.appendChild(card);
  });
}

function showChannelStatusPanel() {
  channelStatusPanel.style.display = 'block';
  startPingInterval();
}

function hideChannelStatusPanel() {
  if (currentRoomType !== 'voice') {
    channelStatusPanel.style.display = 'none';
    startPingInterval();
  }
}

function startPingInterval() {
  if (pingInterval) clearInterval(pingInterval);
  pingInterval = setInterval(() => {
    let pingMs = 0;
    if (socket && socket.io && socket.io.engine && socket.io.engine.lastPingTimestamp) {
      const now = Date.now();
      pingMs = now - socket.io.engine.lastPingTimestamp;
      pingValueSpan.textContent = pingMs + ' ms';
    } else {
      pingValueSpan.textContent = '-- ms';
    }
    updateCellBars(pingMs);
  }, 1000);
}

function stopPingInterval() {
  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
  }
  pingValueSpan.textContent = '-- ms';
  updateCellBars(0);
}

function updateCellBars(ping) {
  let barsActive = 0;
  if (ping >= 1) {
    if (ping < 80) barsActive = 4;
    else if (ping < 150) barsActive = 3;
    else if (ping < 300) barsActive = 2;
    else barsActive = 1;
  } else {
    barsActive = 0;
  }
  cellBar1.classList.remove('active');
  cellBar2.classList.remove('active');
  cellBar3.classList.remove('active');
  cellBar4.classList.remove('active');
  if (barsActive >= 1) cellBar1.classList.add('active');
  if (barsActive >= 2) cellBar2.classList.add('active');
  if (barsActive >= 3) cellBar3.classList.add('active');
  if (barsActive >= 4) cellBar4.classList.add('active');
}

/* Yeni: Mesajlar arasında gün farkı varsa tarih ayracı ekle */
function insertSeparatorIfNeeded(prevTimestamp, currentTimestamp) {
  if (!prevTimestamp || TextChannel.isDifferentDay(prevTimestamp, currentTimestamp)) {
    insertDateSeparator(currentTimestamp);
  }
}

/* Yeni: #textMessages alanında scroll yapıldığında "scrolling" sınıfını ekle */
document.addEventListener('DOMContentLoaded', function() {
  const tm = document.getElementById('textMessages');
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
});
  
// METİN MESAJLARININ RENDER İŞLEMLERİ SONU
