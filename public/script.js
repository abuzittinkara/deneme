const socket = io();
let localStream;
let peers = {};
let audioPermissionGranted = false;
let remoteAudios = []; 
let username = null;

// Gruplar/Odalar
let currentGroup = null;  
let currentRoom = null;   

let pendingUsers = [];
let pendingNewUsers = [];

// DOM Elements
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

// Gruplar (sol sidebar)
const groupListDiv = document.getElementById('groupList');
const createGroupButton = document.getElementById('createGroupButton');

// Odalar (kanallar)
const roomListDiv = document.getElementById('roomList');
const createRoomButton = document.getElementById('createRoomButton');
const groupTitle = document.getElementById('groupTitle');
const groupDropdownIcon = document.getElementById('groupDropdownIcon');
const groupDropdownMenu = document.getElementById('groupDropdownMenu');
const copyGroupIdBtn = document.getElementById('copyGroupIdBtn');
const renameGroupBtn = document.getElementById('renameGroupBtn');
const createChannelBtn = document.getElementById('createChannelBtn');
const deleteGroupBtn = document.getElementById('deleteGroupBtn');

// DM / GRUP
const toggleDMButton = document.getElementById('toggleDMButton');
const closeDMButton = document.getElementById('closeDMButton');
const dmPanel = document.getElementById('dmPanel');
const groupsAndRooms = document.getElementById('groupsAndRooms');
let isDMMode = false;

// Sağ panel (kullanıcı listesi)
const userListDiv = document.getElementById('userList');

// Ayrıl Butonu
const leaveButton = document.getElementById('leaveButton');

// Modal: Grup Seçenekleri
const groupModal = document.getElementById('groupModal');
const modalGroupCreateBtn = document.getElementById('modalGroupCreateBtn');
const modalGroupJoinBtn = document.getElementById('modalGroupJoinBtn');

// Modal: Grup Kur
const actualGroupCreateModal = document.getElementById('actualGroupCreateModal');
const actualGroupName = document.getElementById('actualGroupName');
const actualGroupNameBtn = document.getElementById('actualGroupNameBtn');
const closeCreateGroupModal = document.getElementById('closeCreateGroupModal');

// Modal: Gruba Katıl
const joinGroupModal = document.getElementById('joinGroupModal');
const joinGroupIdInput = document.getElementById('joinGroupIdInput');
const joinGroupIdBtn = document.getElementById('joinGroupIdBtn');
const closeJoinGroupModal = document.getElementById('closeJoinGroupModal');

// Modal: Oda
const roomModal = document.getElementById('roomModal');
const modalRoomName = document.getElementById('modalRoomName');
const modalCreateRoomBtn = document.getElementById('modalCreateRoomBtn');
const modalCloseRoomBtn = document.getElementById('modalCloseRoomBtn');

// Sol alt kullanıcı paneli
const leftUserName = document.getElementById('leftUserName');
const micToggleButton = document.getElementById('micToggleButton');
const deafenToggleButton = document.getElementById('deafenToggleButton');

// Mikrofon & Kulaklık durumu
let micEnabled = true;
let selfDeafened = false;

/* ----------------------------------
   Mikrofon & Kulaklık SVG Kodları
-------------------------------------*/
// Mikrofon Açık
const micOnSVG = `
<svg width="22" height="22" viewBox="0 0 24 24" fill="none"
     stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M12 1v11a3 3 0 0 0 6 0V1" />
  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
  <line x1="12" y1="19" x2="12" y2="23" />
  <line x1="8" y1="23" x2="16" y2="23" />
</svg>
`;

// Mikrofon Kapalı (Slash kırmızı)
const micOffSVG = `
<svg width="22" height="22" viewBox="0 0 24 24" fill="none"
     stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M12 1v11a3 3 0 0 0 6 0V1" />
  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
  <line x1="12" y1="19" x2="12" y2="23" />
  <line x1="8" y1="23" x2="16" y2="23" />
  <line x1="1" y1="1" x2="23" y2="23" stroke="red" stroke-width="2" />
</svg>
`;

// Kulaklık Açık
const headphoneOffSVG = `
<svg width="22" height="22" viewBox="0 0 24 24" fill="none"
     stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
  <path d="M4 14h-2v4h2z" />
  <path d="M20 14h2v4h-2z" />
</svg>
`;

// Kulaklık Sağır (slash kırmızı)
const headphoneOnSVG = `
<svg width="22" height="22" viewBox="0 0 24 24" fill="none"
     stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
  <path d="M4 14h-2v4h2z" />
  <path d="M20 14h2v4h-2z" />
  <line x1="1" y1="1" x2="23" y2="23" stroke="red" stroke-width="2" />
</svg>
`;

/* ----------------------------------
   Ekran geçişleri
-------------------------------------*/
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

/* ----------------------------------
   Login
-------------------------------------*/
loginButton.addEventListener('click', () => {
  const usernameVal = loginUsernameInput.value.trim();
  const passwordVal = loginPasswordInput.value.trim();
  if (!usernameVal || !passwordVal) {
    alert("Lütfen kullanıcı adı ve parola girin.");
    return;
  }
  socket.emit('login', { username: usernameVal, password: passwordVal });
});

socket.on('loginResult', (data) => {
  if (data.success) {
    username = data.username;
    loginScreen.style.display = 'none';
    callScreen.style.display = 'flex';
    socket.emit('set-username', username);
    leftUserName.textContent = username;

    applyAudioStates();
  } else {
    alert("Giriş başarısız: " + data.message);
  }
});

/* ----------------------------------
   Register
-------------------------------------*/
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

socket.on('registerResult', (data) => {
  if (data.success) {
    alert("Kayıt başarılı! Şimdi giriş yapabilirsiniz.");
    registerScreen.style.display = 'none';
    loginScreen.style.display = 'block';
  } else {
    alert("Kayıt başarısız: " + data.message);
  }
});

/* ----------------------------------
   DM butonları
-------------------------------------*/
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

/* ----------------------------------
   Grup Oluştur / Seçenekleri
-------------------------------------*/
createGroupButton.addEventListener('click', () => {
  groupModal.style.display = 'flex';
});

// Modal: Grup Seçenekleri
modalGroupCreateBtn.addEventListener('click', () => {
  groupModal.style.display = 'none';
  actualGroupCreateModal.style.display = 'flex';
});
modalGroupJoinBtn.addEventListener('click', () => {
  groupModal.style.display = 'none';
  joinGroupModal.style.display = 'flex';
});

// Modal: Grup Kur
actualGroupNameBtn.addEventListener('click', () => {
  const grpName = actualGroupName.value.trim();
  if (!grpName) {
    alert("Grup adı boş olamaz!");
    return;
  }
  socket.emit('createGroup', grpName);
  actualGroupCreateModal.style.display = 'none';
});
closeCreateGroupModal.addEventListener('click', () => {
  actualGroupCreateModal.style.display = 'none';
});

// Modal: Gruba Katıl
joinGroupIdBtn.addEventListener('click', () => {
  const grpIdVal = joinGroupIdInput.value.trim();
  if (!grpIdVal) {
    alert("Grup ID boş olamaz!");
    return;
  }
  socket.emit('joinGroupByID', grpIdVal);
  joinGroupModal.style.display = 'none';
});
closeJoinGroupModal.addEventListener('click', () => {
  joinGroupModal.style.display = 'none';
});

/* ----------------------------------
   Sunucudan güncel grup listesi
-------------------------------------*/
socket.on('groupsList', (groupArray) => {
  groupListDiv.innerHTML = '';
  groupArray.forEach(groupObj => {
    const grpItem = document.createElement('div');
    grpItem.className = 'grp-item';
    grpItem.innerText = groupObj.name[0].toUpperCase();
    grpItem.title = groupObj.name + " (" + groupObj.id + ")";
    grpItem.dataset.groupId = groupObj.id;

    grpItem.addEventListener('click', () => {
      joinGroup(groupObj.id, groupObj.name);
    });

    groupListDiv.appendChild(grpItem);
  });
});

/* ----------------------------------
   Grup başlığı + ID kopyalama
-------------------------------------*/
copyGroupIdBtn.addEventListener('click', () => {
  if (!currentGroup) {
    alert("Şu an geçerli bir grup yok!");
    return;
  }
  navigator.clipboard.writeText(currentGroup)
    .then(() => {
      alert("Grup ID kopyalandı: " + currentGroup);
    })
    .catch(err => {
      console.error("Grup ID kopyalanamadı:", err);
    });
  groupDropdownMenu.style.display = 'none';
});

/* ----------------------------------
   Bir gruba ID ile veya listeden
-------------------------------------*/
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

/* ----------------------------------
   Oda Oluşturma
-------------------------------------*/
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
  if (!rName) {
    alert("Lütfen bir oda adı girin");
    return;
  }
  socket.emit('createRoom', { groupId: currentGroup, roomName: rName });
  roomModal.style.display = 'none';
});
modalCloseRoomBtn.addEventListener('click', () => {
  roomModal.style.display = 'none';
});

/* ----------------------------------
   roomsList Event => Odaları listele
   (Burada her oda altına channel-users <div> ekleyerek
   Discord benzeri alt alta kullanıcı gösterimi sağlanacak)
-------------------------------------*/
socket.on('roomsList', (roomsArray) => {
  roomListDiv.innerHTML = '';

  roomsArray.forEach(roomObj => {
    const roomItem = document.createElement('div');
    roomItem.className = 'channel-item';
    roomItem.dataset.roomId = roomObj.id;
    
    // Kanal başlık (icon + isim)
    const channelHeader = document.createElement('div');
    channelHeader.className = 'channel-header';

    const icon = createWaveIcon(); // dalga icon fonksiyonu
    const textSpan = document.createElement('span');
    textSpan.textContent = roomObj.name;

    channelHeader.appendChild(icon);
    channelHeader.appendChild(textSpan);

    // Kanal altına eklenecek kullanıcı listesi
    const channelUsers = document.createElement('div');
    channelUsers.className = 'channel-users';
    channelUsers.id = `channel-users-${roomObj.id}`;

    // Yapıyı ekle
    roomItem.appendChild(channelHeader);
    roomItem.appendChild(channelUsers);

    // Tıklayınca odaya katıl
    roomItem.addEventListener('click', () => {
      joinRoom(currentGroup, roomObj.id, roomObj.name);
    });

    roomListDiv.appendChild(roomItem);
  });
});

/* ----------------------------------
   joinRoom => Belirli odaya bağlan
-------------------------------------*/
function joinRoom(groupId, roomId, roomName) {
  if (currentRoom && currentRoom !== roomId) {
    closeAllPeers();
    audioPermissionGranted = false;
    localStream = null;
  }
  currentRoom = roomId;
  socket.emit('joinRoom', { groupId, roomId });

  // Kanala katıldık, Ayrıl butonu görünsün
  leaveButton.style.display = 'flex';
}

/* ----------------------------------
   Ayrıl Butonu
-------------------------------------*/
leaveButton.addEventListener('click', () => {
  if (!currentRoom) return;
  socket.emit('leaveRoom', { groupId: currentGroup, roomId: currentRoom });
  closeAllPeers();
  currentRoom = null;
  userListDiv.innerHTML = '';
  leaveButton.style.display = 'none';
  console.log("Kanaldan ayrıldınız.");
});

/* ----------------------------------
   Kullanıcıları sağ panelde listele
   + Kanal altına listele (Discord benzeri)
-------------------------------------*/
socket.on('roomUsers', (usersInRoom) => {
  // Sağ paneli güncelle
  updateUserList(usersInRoom);

  // Kanal altı listeyi güncelle (Discord benzeri)
  // currentRoom => şu an katıldığınız oda
  updateChannelUserList(currentRoom, usersInRoom);

  const otherUserIds = usersInRoom
    .filter(u => u.id !== socket.id)
    .map(u => u.id)
    .filter(id => !peers[id]);

  if (!audioPermissionGranted || !localStream) {
    requestMicrophoneAccess().then(() => {
      otherUserIds.forEach(userId => {
        if (!peers[userId]) initPeer(userId, true);
      });
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

/* 
   Sağ paneldeki kullanıcı listesi (varolan fonksiyon)
*/
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

/*
   Kanal altındaki kullanıcı listesi (Discord benzeri)
*/
function updateChannelUserList(roomId, usersInRoom) {
  // O anki "channel-users-{roomId}" DIV'i seç
  const channelUsersDiv = document.getElementById(`channel-users-${roomId}`);
  if (!channelUsersDiv) return; // Eleman yoksa çık
  
  // Önce temizle
  channelUsersDiv.innerHTML = '';

  // Her kullanıcı için bir .channel-user
  usersInRoom.forEach(user => {
    const userDiv = document.createElement('div');
    userDiv.classList.add('channel-user');

    // Avatar (örnek basit placeholder)
    const avatarDiv = document.createElement('div');
    avatarDiv.classList.add('channel-user-avatar');
    // Gerçek fotoğraf kullanacaksanız <img src="..." /> gibi ekleyebilirsiniz.

    const nameSpan = document.createElement('span');
    nameSpan.textContent = user.username || '(İsimsiz)';

    userDiv.appendChild(avatarDiv);
    userDiv.appendChild(nameSpan);
    channelUsersDiv.appendChild(userDiv);
  });
}

/* ----------------------------------
   Mikrofon Erişimi
-------------------------------------*/
async function requestMicrophoneAccess() {
  try {
    console.log("Mikrofon izni isteniyor...");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    console.log("Mikrofon erişimi verildi:", stream);
    localStream = stream;
    audioPermissionGranted = true;
    applyAudioStates();
    remoteAudios.forEach(audioEl => {
      audioEl.play().catch(err => console.error("Ses oynatılamadı:", err));
    });
  } catch(err) {
    console.error("Mikrofon izni alınamadı:", err);
  }
}

/* ----------------------------------
   WebRTC Sinyal
-------------------------------------*/
socket.on("signal", async (data) => {
  // 1) Kendimizin gönderdiği sinyal dönerse ignore ediyoruz:
  if (data.from === socket.id) {
    // Kendi sinyalimizi tekrar almayalım
    return;
  }

  console.log("Signal alındı:", data);
  const { from, signal } = data;

  let peer;
  if (!peers[from]) {
    if (!localStream) {
      console.warn("localStream yok, sinyal bekletiliyor.");
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
  } 
  else if (signal.type === "answer") {
    // 2) Halihazırda stable durumda isek answer set edilmesin:
    if (peer.signalingState === "stable") {
      console.warn("PeerConnection already stable. Second answer ignored.");
      return;
    }
    await peer.setRemoteDescription(new RTCSessionDescription(signal));
  } 
  else if (signal.candidate) {
    await peer.addIceCandidate(new RTCIceCandidate(signal));
    console.log("ICE Candidate eklendi:", signal);
  }
});

/* ----------------------------------
   Peer Başlat
-------------------------------------*/
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
    applyDeafenState();
    if (audioPermissionGranted) {
      audio.play().catch(err => console.error("Ses oynatılamadı:", err));
    }
  };

  if (isInitiator) {
    createOffer(peer, userId);
  }
  return peer;
}

async function createOffer(peer, userId) {
  const offer = await peer.createOffer();
  await peer.setLocalDescription(offer);
  socket.emit("signal", { to: userId, signal: peer.localDescription });
}

function closeAllPeers() {
  for (const userId in peers) {
    if (peers[userId]) {
      peers[userId].close();
      delete peers[userId];
    }
  }
  remoteAudios = [];
}

/* ----------------------------------
   Kanal ikonu (ses dalgası)
-------------------------------------*/
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

/* ----------------------------------
   Mikrofon & Kulaklık Butonları
-------------------------------------*/
micToggleButton.addEventListener('click', () => {
  micEnabled = !micEnabled;
  applyAudioStates();
});
deafenToggleButton.addEventListener('click', () => {
  selfDeafened = !selfDeafened;
  if (selfDeafened) {
    micEnabled = false;
  }
  applyAudioStates();
});

function applyAudioStates() {
  if (localStream) {
    localStream.getAudioTracks().forEach(track => {
      track.enabled = micEnabled && !selfDeafened;
    });
  }
  micToggleButton.innerHTML = (micEnabled && !selfDeafened) ? micOnSVG : micOffSVG;
  applyDeafenState();
  deafenToggleButton.innerHTML = selfDeafened ? headphoneOnSVG : headphoneOffSVG;
}

function applyDeafenState() {
  remoteAudios.forEach(audio => {
    audio.muted = selfDeafened;
  });
}

/* ----------------------------------
   Socket Durum
-------------------------------------*/
socket.on("connect", () => {
  console.log("WebSocket bağlandı:", socket.id);
});
socket.on("disconnect", () => {
  console.log("WebSocket bağlantısı koptu.");
});

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
