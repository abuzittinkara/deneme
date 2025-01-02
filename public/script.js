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

/**
 *  pendingCandidates[from] = dizi halinde ICE candidate objeleri
 *  sessionUfrag[from] = o peer için remoteDescription'dan parse ettiğimiz ufrag
 */
let pendingCandidates = {};
let sessionUfrag = {};

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

// Odalar (kanallar) ve üst dropdown
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

// Modal: Oda Oluşturma
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
      currentGroup = groupObj.id;
      groupTitle.textContent = groupObj.name;
      socket.emit('joinGroup', groupObj.id);
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
   roomsList => oda listesi sunucudan gelince
-------------------------------------*/
socket.on('roomsList', (roomsArray) => {
  roomListDiv.innerHTML = '';
  roomsArray.forEach(roomObj => {
    const roomItem = document.createElement('div');
    roomItem.className = 'channel-item';
    roomItem.dataset.roomId = roomObj.id;

    const channelHeader = document.createElement('div');
    channelHeader.className = 'channel-header';

    const icon = createWaveIcon();
    const textSpan = document.createElement('span');
    textSpan.textContent = roomObj.name;

    channelHeader.appendChild(icon);
    channelHeader.appendChild(textSpan);

    const channelUsers = document.createElement('div');
    channelUsers.className = 'channel-users';
    channelUsers.id = `channel-users-${roomObj.id}`;

    roomItem.appendChild(channelHeader);
    roomItem.appendChild(channelUsers);

    // Odaya tıklayınca => oda değişimi
    roomItem.addEventListener('click', () => {
      if (currentRoom && currentRoom !== roomObj.id) {
        console.log("Leaving old room =>", currentRoom);
        socket.emit('leaveRoom', { groupId: currentGroup, roomId: currentRoom });
        closeAllPeers();

        setTimeout(() => {
          console.log("Joining new room =>", roomObj.id);
          joinRoom(currentGroup, roomObj.id, roomObj.name);
        }, 300);
      } else {
        joinRoom(currentGroup, roomObj.id, roomObj.name);
      }
    });

    roomListDiv.appendChild(roomItem);
  });
});

/* ----------------------------------
   Oda oluşturma butonları
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

// Grup menüsündeki "Kanal Oluştur"
createChannelBtn.addEventListener('click', () => {
  groupDropdownMenu.style.display = 'none';
  if (!currentGroup) {
    alert("Önce bir gruba katılın veya oluşturun!");
    return;
  }
  roomModal.style.display = 'flex';
  modalRoomName.value = '';
  modalRoomName.focus();
});

// Modal’da "Oluştur" tıklanınca
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
   joinRoom
-------------------------------------*/
function joinRoom(groupId, roomId, roomName) {
  currentGroup = groupId;
  currentRoom = roomId;
  socket.emit('joinRoom', { groupId, roomId });
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
  console.log("Kanaldan ayrıldınız (Ayrıl Butonu).");
});

/* ----------------------------------
   roomUsers => kullanıcıları listele + Peer init
-------------------------------------*/
socket.on('roomUsers', (usersInRoom) => {
  updateUserList(usersInRoom);
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

/* ----------------------------------
   Sağ panel kullanıcı listesi
-------------------------------------*/
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

/* ----------------------------------
   Kanal altındaki kullanıcı listesi
-------------------------------------*/
function updateChannelUserList(roomId, usersInRoom) {
  if (!roomId) return;
  const channelUsersDiv = document.getElementById(`channel-users-${roomId}`);
  if (!channelUsersDiv) return;
  
  channelUsersDiv.innerHTML = '';
  usersInRoom.forEach(user => {
    const userDiv = document.createElement('div');
    userDiv.classList.add('channel-user');

    // Avatar (örnek placeholder)
    const avatarDiv = document.createElement('div');
    avatarDiv.classList.add('channel-user-avatar');

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
   WebRTC Sinyal (Offer/Answer/ICE)
-------------------------------------*/
socket.on("signal", async (data) => {
  // Kendimizin gönderdiği sinyal mi?
  if (data.from === socket.id) {
    return;
  }

  const { from, signal } = data;
  let peer = peers[from];

  // Bu peer yoksa => yeni init (non-initiator)
  if (!peer) {
    if (!localStream) {
      console.warn("localStream yok, sinyal bekletiliyor -> user push:", from);
      pendingNewUsers.push(from);
      return;
    }
    peer = initPeer(from, false);
  }

  // Offer
  if (signal.type === "offer") {
    await peer.setRemoteDescription(new RTCSessionDescription(signal));
    sessionUfrag[from] = parseIceUfrag(signal.sdp);

    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    console.log("Answer gönderiliyor:", answer);
    socket.emit("signal", { to: from, signal: peer.localDescription });

    // pending candidate ekle
    if (pendingCandidates[from]) {
      for (const c of pendingCandidates[from]) {
        if (sessionUfrag[from] && sessionUfrag[from] !== c.usernameFragment) {
          console.warn("Candidate ufrag doesn't match current session. Dropping candidate:", c);
          continue;
        }
        try {
          await peer.addIceCandidate(new RTCIceCandidate(c));
          console.log("ICE Candidate eklendi (pendingCandidates):", c);
        } catch (err) {
          console.warn("Candidate eklerken hata:", err);
        }
      }
      pendingCandidates[from] = [];
    }

  }
  // Answer
  else if (signal.type === "answer") {
    if (peer.signalingState === "stable") {
      console.warn("PeerConnection already stable. Second answer ignored.");
      return;
    }
    await peer.setRemoteDescription(new RTCSessionDescription(signal));
    sessionUfrag[from] = parseIceUfrag(signal.sdp);

    if (pendingCandidates[from]) {
      for (const c of pendingCandidates[from]) {
        if (sessionUfrag[from] && sessionUfrag[from] !== c.usernameFragment) {
          console.warn("Candidate ufrag doesn't match current session. Dropping candidate:", c);
          continue;
        }
        try {
          await peer.addIceCandidate(new RTCIceCandidate(c));
          console.log("ICE Candidate eklendi (pendingCandidates):", c);
        } catch (err) {
          console.warn("Candidate eklerken hata:", err);
        }
      }
      pendingCandidates[from] = [];
    }

  }
  // ICE Candidate
  else if (signal.candidate) {
    // remoteDescription yoksa => pending
    if (!peer.remoteDescription || peer.remoteDescription.type === "") {
      console.log("Henüz remoteDescription yok, candidate pending'e alınıyor:", signal);
      if (!pendingCandidates[from]) {
        pendingCandidates[from] = [];
      }
      pendingCandidates[from].push(signal);
    } else {
      // Ufrag check
      if (sessionUfrag[from] && sessionUfrag[from] !== signal.usernameFragment) {
        console.warn("Candidate ufrag doesn't match current session. Dropping candidate:", signal);
        return;
      }
      try {
        await peer.addIceCandidate(new RTCIceCandidate(signal));
        console.log("ICE Candidate eklendi:", signal);
      } catch (err) {
        console.warn("ICE Candidate eklenirken hata:", err);
      }
    }
  }
});

/* ----------------------------------
   Peer Başlat
-------------------------------------*/
function initPeer(userId, isInitiator) {
  if (!localStream || !audioPermissionGranted) {
    console.warn("localStream yok, initPeer bekletilecek. userId=", userId);
    if (isInitiator) {
      pendingUsers.push(userId);
    } else {
      pendingNewUsers.push(userId);
    }
    return;
  }
  if (peers[userId]) {
    console.log("Bu kullanıcı için zaten bir peer var:", userId);
    return peers[userId];
  }

  console.log(`initPeer: userId=${userId}, isInitiator=${isInitiator}`);
  const peer = new RTCPeerConnection({
    iceServers: [
      // Sadece STUN. (TURN eklemezsek NAT arkasında fail olabilir.)
      { urls: "stun:stun.l.google.com:19302" },
    ],
  });
  peers[userId] = peer;

  // local tracks
  localStream.getTracks().forEach(track => peer.addTrack(track, localStream));

  peer.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("signal", { to: userId, signal: event.candidate });
    }
  };
  peer.oniceconnectionstatechange = () => {
    console.log("ICE durumu:", peer.iceConnectionState);
    // 'disconnected' veya 'failed' => NAT engeli olabilir, ya da user tarayıcıyı kapatmıştır.
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
  console.log("CLOSING ALL PEERS!");
  for (const userId in peers) {
    if (peers[userId]) {
      peers[userId].close();
      delete peers[userId];
    }
  }
  remoteAudios = [];
  pendingCandidates = {};
  sessionUfrag = {};
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
   Ufak Yardımcı: parseIceUfrag
-------------------------------------*/
function parseIceUfrag(sdp) {
  const lines = sdp.split('\n');
  for (const line of lines) {
    if (line.startsWith('a=ice-ufrag:')) {
      return line.split(':')[1].trim();
    }
  }
  return null;
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
deleteGroupBtn.addEventListener('click', () => {
  alert("Grubu silme işlemi henüz tanımlanmadı.");
  groupDropdownMenu.style.display = 'none';
  dropdownOpen = false;
});
