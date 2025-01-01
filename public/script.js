const socket = io();
let localStream;
let peers = {};
let audioPermissionGranted = false;
let remoteAudios = []; 
let username = null;

// Artık grup ismi yerine grup ID saklayacağız
let currentGroup = null;  // Bu ID'yi tutar
let currentRoom = null;   // Bu da oda ID'yi tutar

// Bekleyen kullanıcı listeleri (WebRTC senaryosu)
let pendingUsers = [];
let pendingNewUsers = [];

// Ekran elementleri
const loginScreen = document.getElementById('loginScreen');
const registerScreen = document.getElementById('registerScreen');
const callScreen = document.getElementById('callScreen');

// Login
const loginUsernameInput = document.getElementById('loginUsernameInput');
const loginPasswordInput = document.getElementById('loginPasswordInput');
const loginButton = document.getElementById('loginButton');

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

// Ekran değiştirme linkleri
const showRegisterScreen = document.getElementById('showRegisterScreen');
const showLoginScreen = document.getElementById('showLoginScreen');

// Gruplar (soldaki yuvarlak ikonlar)
const groupListDiv = document.getElementById('groupList');
const createGroupButton = document.getElementById('createGroupButton');

// Odalar (kanallar)
const roomListDiv = document.getElementById('roomList');
const createRoomButton = document.getElementById('createRoomButton');
const groupTitle = document.getElementById('groupTitle');
const groupDropdownIcon = document.getElementById('groupDropdownIcon');
const groupDropdownMenu = document.getElementById('groupDropdownMenu');
const renameGroupBtn = document.getElementById('renameGroupBtn');
const createChannelBtn = document.getElementById('createChannelBtn');
const deleteGroupBtn = document.getElementById('deleteGroupBtn');

// DM / GRUP Sekmesi
const toggleDMButton = document.getElementById('toggleDMButton');
const closeDMButton = document.getElementById('closeDMButton');
const dmPanel = document.getElementById('dmPanel');
const groupsAndRooms = document.getElementById('groupsAndRooms');
let isDMMode = false;

// Sağ panel (kullanıcı listesi)
const userListDiv = document.getElementById('userList');

// Modal: Grup
const groupModal = document.getElementById('groupModal');
const modalGroupName = document.getElementById('modalGroupName');
const modalCreateGroupButton = document.getElementById('modalCreateGroupButton');
const modalCloseButton = document.getElementById('modalCloseButton');

// Modal: Oda
const roomModal = document.getElementById('roomModal');
const modalRoomName = document.getElementById('modalRoomName');
const modalCreateRoomBtn = document.getElementById('modalCreateRoomBtn');
const modalCloseRoomBtn = document.getElementById('modalCloseRoomBtn');

// Sol alt kullanıcı paneli
const leftUserName = document.getElementById('leftUserName');
const micToggleButton = document.getElementById('micToggleButton');
const deafenToggleButton = document.getElementById('deafenToggleButton');

// Mikrofon ve Deafen durumları
let micEnabled = true;
let selfDeafened = false;

/* 
   1) Mikrofon Açık (beyaz) 
   (defs kaldırıldı, style inline eklendi)
*/
const micOnSVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 11.53 19.95">
  <style>
    .cls-1 { fill: #fff; }
    .cls-2 {
      fill: none;
      stroke: #fff;
      stroke-miterlimit: 10;
      stroke-width: 1.5px;
    }
  </style>
  <path class="cls-2" d="M.75,4.35v6.55c0,.78.18,1.55.53,2.24h0c1.85,3.7,7.13,3.7,8.97,0h0c.35-.7.53-1.46.53-2.24v-6.55"/>
  <path class="cls-2" d="M5.77,15.91v3.29"/>
  <path class="cls-2" d="M10.78,19.2H.75"/>
  <rect class="cls-1" x="2.38" y="0" width="6.77" height="14.28" rx="3.36" ry="3.36"/>
</svg>
`;

/* 
   2) Mikrofon Kapalı (kırmızı)
   (defs kaldırıldı, style inline eklendi)
*/
const micOffSVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 19.28 19.96">
  <style>
    .cls-1 { fill: red; }
  </style>
  <g>
    <path class="cls-1" d="M5.45,11.69l-1.22,1.22c-.24-.64-.36-1.33-.36-2.01v-6.54h1.5v6.54c0,.27.03.53.08.79Z"/>
    <path class="cls-1" d="M6.69,13.98l-1.05,1.05c-.38-.35-.69-.74-.94-1.18l1.1-1.1s.01.04.02.06c.23.46.52.86.87,1.17Z"/>
    <polygon class="cls-1" points="15.41 4.36 15.41 5.26 13.91 6.76 13.91 4.64 14.19 4.36 15.41 4.36"/>
    <path class="cls-1" d="M15.41,6.67v4.23c0,.89-.21,1.78-.61,2.58-.88,1.74-2.52,2.9-4.41,3.14v1.84h4.27v1.5H4.62v-1.5h4.27v-1.84c-.91-.11-1.75-.44-2.48-.95l1.07-1.07c.63.37,1.38.57,2.16.57,1.65,0,3.08-.88,3.82-2.36.29-.59.45-1.25.45-1.91v-2.73l1.5-1.5Z"/>
  </g>
  <path class="cls-1" d="M13.03,3.36v.75l-6.78,6.78V3.36c0-1.85,1.51-3.36,3.36-3.36h.06c1.85,0,3.36,1.51,3.36,3.36Z"/>
  <path class="cls-1" d="M13.03,5.52v2.12l-5.73,5.73c-.37-.36-.66-.79-.84-1.28l6.57-6.57Z"/>
  <path class="cls-1" d="M13.03,9.05v1.88c0,1.86-1.51,3.36-3.36,3.36h-.06c-.53,0-1.03-.12-1.47-.35l4.89-4.89Z"/>
  <polygon class="cls-1" points="19.28 1.39 13.03 7.64 7.3 13.37 6.69 13.98 1.06 19.61 0 18.55 4.7 13.85 5.8 12.75 6.46 12.09 18.22 .33 19.28 1.39"/>
</svg>
`;

/* 
   3) Kulaklık Normal (beyaz)
   (defs kaldırıldı, style inline eklendi)
*/
const headphoneOffSVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18.53 19.02">
  <style>
    .cls-1 { fill: #fff; }
  </style>
  <path class="cls-1" d="M16.63,8.08h-.6v-2.05c0-3.33-2.71-6.03-6.03-6.03S3.97,2.71,3.97,6.03v2.05h-.6c-1.05,0-1.9.85-1.9,1.9v3.71c0,1.05.85,1.9,1.9,1.9h2.1V6.03c0-2.5,2.03-4.53,4.53-4.53s4.53,2.03,4.53,4.53v9.57h2.1c1.05,0,1.9-.85,1.9-1.9v-3.71c0-1.05-.85-1.9-1.9-1.9Z"/>
</svg>
`;

/* 
   4) Kulaklık Sağır (kırmızı)
   (defs kaldırıldı, style inline eklendi)
*/
const headphoneOnSVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 19.61 19.61">
  <style>
    .cls-1 { fill: red; }
  </style>
  <path class="cls-1" d="M14.5,2.63l-1.06,1.06c-.82-.98-2.06-1.6-3.44-1.6-2.5,0-4.53,2.04-4.53,4.54v5.03l-3.68,3.68c-.2-.3-.32-.66-.32-1.05v-3.71c0-1.05.85-1.9,1.9-1.9h.6v-2.05C3.97,3.3,6.67.59,10,.59c1.8,0,3.41.79,4.5,2.04Z"/>
  <path class="cls-1" d="M18.53,10.58v3.71c0,1.05-.85,1.9-1.9,1.9h-2.1V7.56l1.47-1.47c.02.18.03.36.03.54v2.05h.6c1.05,0,1.9.85,1.9,1.9Z"/>
  <polygon class="cls-1" points="19.61 1.06 14.51 6.16 14.51 6.17 5.47 15.2 4.48 16.19 1.45 19.22 .39 18.16 2.55 16 5.47 13.08 14.01 4.54 15.11 3.44 18.55 0 19.61 1.06"/>
</svg>
`;

// ------------------
// Ekran geçişleri
// ------------------
showRegisterScreen.addEventListener('click', () => {
  loginScreen.style.display = 'none';
  registerScreen.style.display = 'block';
});
showLoginScreen.addEventListener('click', () => {
  registerScreen.style.display = 'none';
  loginScreen.style.display = 'block';
});
backToLoginButton.addEventListener('click', () => {
  registerScreen.style.display = 'none';
  loginScreen.style.display = 'block';
});

// ------------------
// Giriş Yap (Login)
// ------------------
loginButton.addEventListener('click', () => {
  const usernameVal = loginUsernameInput.value.trim();
  const passwordVal = loginPasswordInput.value.trim();
  if (!usernameVal || !passwordVal) {
    alert("Lütfen kullanıcı adı ve parola girin.");
    return;
  }
  socket.emit('login', { username: usernameVal, password: passwordVal });
});

// ------------------
// Kayıt Ol (Register)
// ------------------
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
  
  if (!userData.username || !userData.name || !userData.surname || 
      !userData.birthdate || !userData.email || !userData.phone ||
      !userData.password || !userData.passwordConfirm) {
    alert("Lütfen tüm alanları doldurun.");
    return;
  }

  if (userData.username !== userData.username.toLowerCase()) {
    alert("Kullanıcı adı sadece küçük harf olmalı.");
    return;
  }

  if (userData.password !== userData.passwordConfirm) {
    alert("Parolalar eşleşmiyor!");
    return;
  }

  socket.emit('register', userData);
});

// ------------------
// Sunucudan Login Sonucu
// ------------------
socket.on('loginResult', (data) => {
  if (data.success) {
    username = data.username;
    loginScreen.style.display = 'none';
    callScreen.style.display = 'flex';
    socket.emit('set-username', username);

    // Sol alt panelde kullanıcı adını göster
    leftUserName.textContent = username;
    // İlk ikon durumlarını atayalım
    applyAudioStates();
  } else {
    alert("Giriş başarısız: " + data.message);
  }
});

// ------------------
// Sunucudan Register Sonucu
// ------------------
socket.on('registerResult', (data) => {
  if (data.success) {
    alert("Kayıt başarılı! Şimdi giriş yapabilirsiniz.");
    registerScreen.style.display = 'none';
    loginScreen.style.display = 'block';
  } else {
    alert("Kayıt başarısız: " + data.message);
  }
});

// ------------------
// DM butonları
// ------------------
toggleDMButton.addEventListener('click', () => {
  isDMMode = true;
  groupsAndRooms.style.display = 'none';
  dmPanel.style.display = 'block';
});
closeDMButton.addEventListener('click', () => {
  isDMMode = false;
  dmPanel.style.display = 'none';
  groupsAndRooms.style.display = 'flex';
});

// ------------------
// Grup Oluşturma Modal
// ------------------
createGroupButton.addEventListener('click', () => {
  groupModal.style.display = 'flex';
  modalGroupName.value = '';
  modalGroupName.focus();
});
modalCreateGroupButton.addEventListener('click', () => {
  const grpName = modalGroupName.value.trim();
  if (grpName) {
    socket.emit('createGroup', grpName);
    groupModal.style.display = 'none';
  } else {
    alert("Lütfen bir grup adı girin");
  }
});
modalCloseButton.addEventListener('click', () => {
  groupModal.style.display = 'none';
});

// ------------------
// Sunucudan grup listesi
// ------------------
socket.on('groupsList', (groupArray) => {
  groupListDiv.innerHTML = '';
  groupArray.forEach(groupObj => {
    const grpItem = document.createElement('div');
    grpItem.className = 'grp-item';
    grpItem.innerText = groupObj.name[0].toUpperCase();
    grpItem.title = groupObj.name;
    grpItem.dataset.groupId = groupObj.id;

    grpItem.addEventListener('click', () => {
      joinGroup(groupObj.id, groupObj.name);
    });

    groupListDiv.appendChild(grpItem);
  });
});

// ------------------
// Bir gruba katıl
// ------------------
function joinGroup(groupId, groupName) {
  if (currentGroup && currentGroup !== groupId) {
    closeAllPeers();
    audioPermissionGranted = false;
    localStream = null;
  }
  currentGroup = groupId;
  currentRoom = null;
  roomListDiv.innerHTML = '';

  groupTitle.textContent = groupName;
  socket.emit('joinGroup', groupId);
}

// ------------------
// Odalar (kanallar) listesi
// ------------------
socket.on('roomsList', (roomsArray) => {
  roomListDiv.innerHTML = '';
  roomsArray.forEach(roomObj => {
    const roomItem = document.createElement('div');
    roomItem.className = 'channel-item';

    const icon = createWaveIcon();
    const textSpan = document.createElement('span');
    textSpan.textContent = roomObj.name;

    roomItem.addEventListener('click', () => {
      joinRoom(currentGroup, roomObj.id, roomObj.name);
    });

    roomItem.appendChild(icon);
    roomItem.appendChild(textSpan);
    roomListDiv.appendChild(roomItem);
  });
});

// ------------------
// Oda oluşturma Modal
// ------------------
createRoomButton.addEventListener('click', () => {
  if (!currentGroup) {
    alert("Önce bir gruba katılın veya oluşturun!");
    return;
  }
  roomModal.style.display = 'flex';
  modalRoomName.value = '';
  modalRoomName.focus();
});
modalCreateRoomBtn.addEventListener('click', () => {
  const rName = modalRoomName.value.trim();
  if (rName) {
    socket.emit('createRoom', { groupId: currentGroup, roomName: rName });
    roomModal.style.display = 'none';
  } else {
    alert("Lütfen bir oda adı girin");
  }
});
modalCloseRoomBtn.addEventListener('click', () => {
  roomModal.style.display = 'none';
});

// ------------------
// Odaya katıl
// ------------------
function joinRoom(groupId, roomId, roomName) {
  if (currentRoom && currentRoom !== roomId) {
    closeAllPeers();
    audioPermissionGranted = false;
    localStream = null;
  }
  currentRoom = roomId;
  socket.emit('joinRoom', { groupId, roomId });
}

// ------------------
// Odadaki kullanıcılar
// ------------------
socket.on('roomUsers', (usersInRoom) => {
  updateUserList(usersInRoom);

  const otherUserIds = usersInRoom
    .filter(u => u.id !== socket.id)
    .map(u => u.id)
    .filter(id => !peers[id]);

  if (!audioPermissionGranted || !localStream) {
    requestMicrophoneAccess().then(() => {
      if (otherUserIds.length > 0) {
        otherUserIds.forEach(userId => {
          if (!peers[userId]) initPeer(userId, true);
        });
      }
      pendingUsers.forEach(userId => {
        if (!peers[userId]) initPeer(userId, true);
      });
      pendingUsers = [];
      pendingNewUsers.forEach(userId => {
        if (!peers[userId]) initPeer(userId, false);
      });
      pendingNewUsers = [];
    }).catch(err => {
      console.error("Mikrofon izni alınamadı:", err);
    });
  } else {
    otherUserIds.forEach(userId => {
      if (!peers[userId]) {
        initPeer(userId, true);
      }
    });
  }
});

// ------------------
// Kullanıcı listesini (Sağ panel) güncelle
// ------------------
function updateUserList(usersInRoom) {
  userListDiv.innerHTML = ''; 
  usersInRoom.forEach(user => {
    const userItem = document.createElement('div');
    userItem.classList.add('user-item');

    const profileThumb = document.createElement('div');
    profileThumb.classList.add('profile-thumb');

    const userNameSpan = document.createElement('span');
    userNameSpan.classList.add('user-name');
    userNameSpan.textContent = user.username || '(İsimsiz)';

    const copyIdButton = document.createElement('button');
    copyIdButton.classList.add('copy-id-btn');
    copyIdButton.textContent = "ID Kopyala";
    copyIdButton.dataset.userid = user.id; 
    copyIdButton.addEventListener('click', (e) => {
      e.stopPropagation();
      const socketId = e.target.dataset.userid;
      navigator.clipboard.writeText(socketId)
        .then(() => {
          alert("Kullanıcı ID kopyalandı: " + socketId);
        })
        .catch(err => {
          console.error("Kopyalama hatası:", err);
          alert("Kopyalama başarısız!");
        });
    });

    userItem.appendChild(profileThumb);
    userItem.appendChild(userNameSpan);
    userItem.appendChild(copyIdButton);
    userListDiv.appendChild(userItem);
  });
}

// ------------------
// Mikrofon izni (ses açma)
// ------------------
async function requestMicrophoneAccess() {
  console.log("Mikrofon izni isteniyor...");
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  console.log("Mikrofon erişimi verildi:", stream); 
  localStream = stream;
  audioPermissionGranted = true;
  applyAudioStates(); // Mute / Deaf durumu uygula
  remoteAudios.forEach(audioEl => {
    audioEl.play().catch(err => console.error("Ses oynatılamadı:", err));
  });
}

// ------------------
// WebRTC sinyal
// ------------------
socket.on("signal", async (data) => {
  console.log("Signal alındı:", data);
  const { from, signal } = data;

  let peer;
  if (!peers[from]) {
    if (!localStream) {
      console.warn("localStream yok, sinyal bekletiyoruz.");
      pendingNewUsers.push(from);
      return;
    }
    peer = initPeer(from, false);
  } else {
    peer = peers[from];
  }

  if (signal.type === "offer") {
    await peer.setRemoteDescription(new RTCSessionDescription(signal));
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    console.log("Answer gönderiliyor:", answer);
    socket.emit("signal", { to: from, signal: peer.localDescription });
  } else if (signal.type === "answer") {
    await peer.setRemoteDescription(new RTCSessionDescription(signal));
  } else if (signal.candidate) {
    await peer.addIceCandidate(new RTCIceCandidate(signal));
    console.log("ICE Candidate eklendi:", signal);
  }
});

// ------------------
// Peer başlat
// ------------------
function initPeer(userId, isInitiator) {
  if (!localStream || !audioPermissionGranted) {
    console.warn("localStream yok, initPeer bekletilecek.");
    if (isInitiator) {
      pendingUsers.push(userId);
    } else {
      pendingNewUsers.push(userId);
    }
    return;
  }
  if (peers[userId]) {
    console.log("Bu kullanıcı için zaten bir peer var.");
    return peers[userId];
  }

  console.log(`initPeer: userId=${userId}, isInitiator=${isInitiator}`);
  const peer = new RTCPeerConnection({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
    ],
  });
  peers[userId] = peer;

  localStream.getTracks().forEach(track => peer.addTrack(track, localStream));

  peer.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("signal", { to: userId, signal: event.candidate });
    }
  };
  peer.oniceconnectionstatechange = () => {
    console.log("ICE durumu:", peer.iceConnectionState);
  };
  peer.onconnectionstatechange = () => {
    console.log("PeerConnection durumu:", peer.connectionState);
  };
  peer.ontrack = (event) => {
    console.log("Remote stream alındı.");
    const audio = new Audio();
    audio.srcObject = event.streams[0];
    audio.autoplay = false; 
    audio.muted = false;
    remoteAudios.push(audio);
    applyDeafenState(); // Deaf isek sesi kapat
    if (audioPermissionGranted) {
      audio.play().catch(err => console.error("Ses oynatılamadı:", err));
    }
  };

  if (isInitiator) {
    createOffer(peer, userId);
  }
  return peer;
}

// ------------------
// Offer oluştur
// ------------------
async function createOffer(peer, userId) {
  const offer = await peer.createOffer();
  await peer.setLocalDescription(offer);
  socket.emit("signal", { to: userId, signal: peer.localDescription });
}

// ------------------
// Tüm peer’ları kapat
// ------------------
function closeAllPeers() {
  for (const userId in peers) {
    if (peers[userId]) {
      peers[userId].close();
      delete peers[userId];
    }
  }
  remoteAudios = [];
}

// ------------------
// Kanal ikonu (ses dalgası)
///------------------
function createWaveIcon() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("class", "channel-icon");
  
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M2,12 C4,8 8,4 12,12 16,20 20,16 22,12");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "2");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");

  svg.appendChild(path);
  return svg;
}

// ------------------------------------------------
// Mikrofon ve Kulaklık butonları (Sol alt panel)
// ------------------------------------------------
micToggleButton.addEventListener('click', () => {
  micEnabled = !micEnabled;
  applyAudioStates();
});

deafenToggleButton.addEventListener('click', () => {
  selfDeafened = !selfDeafened;
  // Deaf olduysa otomatik mic kapat
  if (selfDeafened) {
    micEnabled = false;
  }
  applyAudioStates();
});

// Uygun buton simgelerini ayarla, localStream track.enabled ayarla, remoteAudios muted ayarla
function applyAudioStates() {
  // Mikrofon durumu
  if (localStream) {
    localStream.getAudioTracks().forEach(track => {
      track.enabled = micEnabled && !selfDeafened; 
    });
  }
  // Mic ikonu
  micToggleButton.innerHTML = (micEnabled && !selfDeafened) ? micOnSVG : micOffSVG;

  // Deafen durumu
  applyDeafenState();
  deafenToggleButton.innerHTML = selfDeafened ? headphoneOnSVG : headphoneOffSVG;
}

// Gelen sesleri kapat/aç
function applyDeafenState() {
  remoteAudios.forEach(audio => {
    audio.muted = selfDeafened; 
  });
}

// ------------------
// Socket durum
// ------------------
socket.on("connect", () => {
  console.log("WebSocket bağlandı:", socket.id);
});
socket.on("disconnect", () => {
  console.log("WebSocket bağlantısı koptu.");
});

// ------------------
// Dropdown menü kontrolü
// ------------------
let dropdownOpen = false;
groupDropdownIcon.addEventListener('click', () => {
  dropdownOpen = !dropdownOpen;
  groupDropdownMenu.style.display = dropdownOpen ? 'flex' : 'none';
});

renameGroupBtn.addEventListener('click', () => {
  alert("Grup ismi değiştirme işlemi henüz tanımlanmadı.");
  groupDropdownMenu.style.display = 'none';
  dropdownOpen = false;
});
createChannelBtn.addEventListener('click', () => {
  alert("Kanal oluşturma işlemi henüz tanımlanmadı.");
  groupDropdownMenu.style.display = 'none';
  dropdownOpen = false;
});
deleteGroupBtn.addEventListener('click', () => {
  alert("Grubu silme işlemi henüz tanımlanmadı.");
  groupDropdownMenu.style.display = 'none';
  dropdownOpen = false;
});
