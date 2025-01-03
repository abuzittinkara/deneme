/**************************************
 * script.js (TAM HÂL, GECİKME + STABLE CHECK)
 **************************************/

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
const micOnSVG = `...`;   // Kısaltılmış
const micOffSVG = `...`;
const headphoneOffSVG = `...`;
const headphoneOnSVG = `...`;

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

    // -- YENİ: tıklanınca bu .grp-item "selected" olsun
    grpItem.addEventListener('click', () => {
      // Tüm grp-item'lardan selected kaldır
      document.querySelectorAll('.grp-item').forEach(el => el.classList.remove('selected'));
      // Bu elemana ekle
      grpItem.classList.add('selected');

      // Mevcut mantık:
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
   roomsList => Kanallar listesi
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

    roomItem.addEventListener('click', () => {
      if (currentRoom && currentRoom !== roomObj.id) {
        console.log("Leaving old room =>", currentRoom);
        socket.emit('leaveRoom', { groupId: currentGroup, roomId: currentRoom });
        closeAllPeers();

        // KISA GECİKME => 300ms
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
   allChannelsData => Her kanalda kim var?
-------------------------------------*/
socket.on('allChannelsData', (channelsObj) => {
  // { roomId: { name, users:[{id,username}] }, ... }
  Object.keys(channelsObj).forEach(roomId => {
    const cData = channelsObj[roomId];
    const channelDiv = document.getElementById(`channel-users-${roomId}`);
    if (!channelDiv) return; 
    channelDiv.innerHTML = '';

    cData.users.forEach(u => {
      const userDiv = document.createElement('div');
      userDiv.classList.add('channel-user');

      const avatarDiv = document.createElement('div');
      avatarDiv.classList.add('channel-user-avatar');

      const nameSpan = document.createElement('span');
      nameSpan.textContent = u.username || '(İsimsiz)';

      userDiv.appendChild(avatarDiv);
      userDiv.appendChild(nameSpan);
      channelDiv.appendChild(userDiv);
    });
  });
});

/* ----------------------------------
   roomUsers => O odadaki kullanıcılar (WebRTC)
-------------------------------------*/
socket.on('roomUsers', (usersInRoom) => {
  updateUserList(usersInRoom);

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
  if (data.from === socket.id) return;
  const { from, signal } = data;
  let peer = peers[from];

  if (!peer) {
    if (!localStream) {
      console.warn("localStream yok, sinyal bekletiliyor -> user push:", from);
      pendingNewUsers.push(from);
      return;
    }
    peer = initPeer(from, false);
  }

  if (signal.type === "offer") {
    await peer.setRemoteDescription(new RTCSessionDescription(signal));
    // Ardından answer
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    console.log("Answer gönderiliyor:", answer);
    socket.emit("signal", { to: from, signal: peer.localDescription });
  }
  else if (signal.type === "answer") {
    if (peer.signalingState === "stable") {
      console.warn("PeerConnection already stable. Second answer ignored.");
      return;
    }
    await peer.setRemoteDescription(new RTCSessionDescription(signal));
  }
  else if (signal.candidate) {
    if (!peer.remoteDescription || peer.remoteDescription.type === "") {
      console.log("Henüz remoteDescription yok, candidate pending'e alınıyor:", signal);
      // pendingCandidates vs. mantığı
      return;
    } else {
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
    console.warn("localStream yok, initPeer bekletilecek:", userId);
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

/* ----------------------------------
   Offer Yaratırken => stable check
-------------------------------------*/
async function createOffer(peer, userId) {
  if (peer.signalingState !== "stable") {
    console.log("Peer signalingState not stable, bekliyoruz 200ms...");
    setTimeout(async () => {
      if (peer.signalingState !== "stable") {
        console.warn("Peer hâlâ stable değil, offer iptal.");
        return;
      }
      const offer2 = await peer.createOffer();
      await peer.setLocalDescription(offer2);
      socket.emit("signal", { to: userId, signal: peer.localDescription });
    }, 200);
    return;
  }
  
  const offer = await peer.createOffer();
  await peer.setLocalDescription(offer);
  socket.emit("signal", { to: userId, signal: peer.localDescription });
}

/* ----------------------------------
   closeAllPeers
-------------------------------------*/
function closeAllPeers() {
  console.log("CLOSING ALL PEERS!");
  for (const userId in peers) {
    if (peers[userId]) {
      peers[userId].close();
      delete peers[userId];
    }
  }
  remoteAudios = [];
  // pendingCandidates vs. kullanılabilir
}

/* ----------------------------------
   Mikrofon & Kulaklık
-------------------------------------*/
micToggleButton.addEventListener('click', () => {
  micEnabled = !micEnabled;
  applyAudioStates();
});
deafenToggleButton.addEventListener('click', () => {
  selfDeafened = !selfDeafened;
  if (selfDeafened) micEnabled = false;
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
   createWaveIcon
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
   Socket Durum
-------------------------------------*/
socket.on("connect", () => {
  console.log("WebSocket bağlandı:", socket.id);
});
socket.on("disconnect", () => {
  console.log("WebSocket bağlantısı koptu.");
});
