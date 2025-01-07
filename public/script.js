/**************************************
 * script.js (GÜNCELLENMİŞ TAM HÂL)
 **************************************/

const socket = io();
let localStream;
let peers = {};
let audioPermissionGranted = false;
let remoteAudios = [];
let username = null;

// Mikrofon & Deaf durumu
let micEnabled = true;
let selfDeafened = false;

// Hangi group/room
let currentGroup = null;
let currentRoom = null;

let pendingUsers = [];
let pendingNewUsers = [];

// ICE Candidate / session
let pendingCandidates = {};
let sessionUfrag = {};

/* volume-up-fill ikonu */
function createWaveIcon() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("fill", "currentColor");
  svg.setAttribute("class", "channel-icon bi bi-volume-up-fill");
  svg.setAttribute("viewBox", "0 0 16 16");

  const p1 = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p1.setAttribute("d", "M9.717.55A.5.5 0 0 1 10 .999v14a.5.5 0 0 1-.783.409L5.825 12H3.5A1.5 1.5 0 0 1 2 10.5v-5A1.5 1.5 0 0 1 3.5 4h2.325l3.392-2.409a.5.5 0 0 1 .5-.041z");

  const p2 = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p2.setAttribute("d", "M13.493 1.957a.5.5 0 0 1 .014.706 7.979 7.979 0 0 1 0 10.674.5.5 0 1 1-.72-.694 6.979 6.979 0 0 0 0-9.286.5.5 0 0 1 .706-.014z");

  const p3 = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p3.setAttribute("d", "M11.534 3.16a.5.5 0 0 1 .12.7 4.978 4.978 0 0 1 0 5.281.5.5 0 1 1-.82-.574 3.978 3.978 0 0 0 0-4.133.5.5 0 0 1 .7-.12z");

  svg.appendChild(p1);
  svg.appendChild(p2);
  svg.appendChild(p3);

  return svg;
}

/* DOM elementleri */
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

const showRegisterScreen = document.getElementById('showRegisterScreen');
const showLoginScreen = document.getElementById('showLoginScreen');

// Gruplar
const groupListDiv = document.getElementById('groupList');
const createGroupButton = document.getElementById('createGroupButton');

// Odalar
const roomListDiv = document.getElementById('roomList');
const createRoomButton = document.getElementById('createRoomButton');
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
const dmPanel = document.getElementById('dmPanel');
const groupsAndRooms = document.getElementById('groupsAndRooms');
let isDMMode = false;

// Sağ panel (kullanıcı listesi)
const userListDiv = document.getElementById('userList');

// Ayrıl Butonu
const leaveButton = document.getElementById('leaveButton');

/* AYARLAR Paneli */
const settingsPanel = document.createElement('div');
settingsPanel.classList.add('settings-panel');
settingsPanel.id = 'settingsPanel';
settingsPanel.innerHTML = `
  <div class="settings-panel-header">
    <h2 class="settings-title">Ayarlar</h2>
    <button id="settingsBackBtn" class="settings-close-btn">&lt; Geri</button>
  </div>
  <div class="settings-content">
    <p>Burada kullanıcı ayarları olabilir.</p>
  </div>
`;
document.body.appendChild(settingsPanel);

const userPanelButtons = document.querySelector('.user-panel-buttons');
const settingsButton = document.createElement('button');
settingsButton.id = 'settingsButton';
settingsButton.classList.add('user-panel-btn');
settingsButton.title = 'Ayarlar';
settingsButton.innerHTML = `
  <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"
       stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="3"></circle>
    <path d="..."></path>
  </svg>
`;
userPanelButtons.appendChild(settingsButton);

// Geri butonu => kapat
document.getElementById('settingsBackBtn').addEventListener('click', () => {
  settingsPanel.style.display = 'none';
});
// Ayarlar butonu => aç
settingsButton.addEventListener('click', () => {
  settingsPanel.style.display = 'flex';
});

/* ----------------------------------
   Ekran Geçişleri
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
    alert("Tüm alanları doldurun.");
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
   DM paneli
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
   Grup Oluştur
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
   groupsList => sol sidebar
   => gruba tıklayınca => browseGroup
-------------------------------------*/
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

      groupTitle.textContent = groupObj.name;
      currentGroup = groupObj.id; 
      socket.emit('browseGroup', groupObj.id);
    });

    groupListDiv.appendChild(grpItem);
  });
});

/* roomsList => kanallar */
socket.on('roomsList', (roomsArray) => {
  roomListDiv.innerHTML = '';
  roomsArray.forEach(roomObj => {
    // Her bir oda için => createChannelDOM
    const roomItem = createChannelDOM(roomObj.id, roomObj.name);
    roomListDiv.appendChild(roomItem);
  });
});

/* 
  Kanal DOM'u dinamik oluşturma:
  (Aynı ID'de kanal yoksa => oluştur)
*/
function createChannelDOM(roomId, roomName) {
  // Var mı?
  let existing = document.getElementById(`channel-${roomId}`);
  if (existing) {
    // Zaten var => ismini vs. güncelle
    existing.querySelector('.channel-header span').textContent = roomName;
    return existing;
  }

  const roomItem = document.createElement('div');
  roomItem.className = 'channel-item';
  roomItem.id = `channel-${roomId}`;

  const channelHeader = document.createElement('div');
  channelHeader.className = 'channel-header';

  const icon = createWaveIcon();
  const textSpan = document.createElement('span');
  textSpan.textContent = roomName;

  channelHeader.appendChild(icon);
  channelHeader.appendChild(textSpan);

  const channelUsers = document.createElement('div');
  channelUsers.className = 'channel-users';
  channelUsers.id = `channel-users-${roomId}`;

  roomItem.appendChild(channelHeader);
  roomItem.appendChild(channelUsers);

  // Tıklayınca => join
  roomItem.addEventListener('click', () => {
    if (currentRoom && currentRoom !== roomId) {
      console.log("Leaving old room =>", currentRoom);
      socket.emit('leaveRoom', { groupId: currentGroup, roomId: currentRoom });
      closeAllPeers();

      setTimeout(() => {
        console.log("Joining new room =>", roomId);
        joinChannelWithMic(roomId);
      }, 300);
    } else {
      joinChannelWithMic(roomId);
    }
  });

  return roomItem;
}

/* allChannelsData => bu group'taki odalarda kimler var (avatar) */
socket.on('allChannelsData', (channelsObj) => {
  // YENİ: eğer DOM'da o kanal yoksa => createChannelDOM
  Object.keys(channelsObj).forEach(roomId => {
    // Oda verisi
    const cData = channelsObj[roomId];

    // Kanal DOM var mı? Yoksa oluştur
    let channelDiv = document.getElementById(`channel-${roomId}`);
    if (!channelDiv) {
      // Dinamik oluştur
      console.log("Dinamik kanal oluştur:", roomId, cData.name);
      const newItem = createChannelDOM(roomId, cData.name);
      roomListDiv.appendChild(newItem);
      channelDiv = newItem; 
    }

    // Şimdi altındaki .channel-users güncelle
    const channelUsersDiv = document.getElementById(`channel-users-${roomId}`);
    if (!channelUsersDiv) return;

    channelUsersDiv.innerHTML = '';
    cData.users.forEach(u => {
      const userDiv = document.createElement('div');
      userDiv.classList.add('channel-user');

      const avatarDiv = document.createElement('div');
      avatarDiv.classList.add('channel-user-avatar');

      const nameSpan = document.createElement('span');
      nameSpan.textContent = u.username || '(İsimsiz)';

      userDiv.appendChild(avatarDiv);
      userDiv.appendChild(nameSpan);
      channelUsersDiv.appendChild(userDiv);
    });
  });
});

/* groupUsers => sağ panel (kullanıcı listesi) */
socket.on('groupUsers', (dbUsersArray) => {
  console.log("groupUsers event:", dbUsersArray);
  updateUserList(dbUsersArray);
});

/* roomUsers => WebRTC akışı */
socket.on('roomUsers', (usersInRoom) => {
  console.log("roomUsers => ", usersInRoom);

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
    });
  } else {
    otherUserIds.forEach(userId => {
      if (!peers[userId]) {
        initPeer(userId, true);
      }
    });
  }
});

/* Kanala girerken => önce mikrofon izni al => room emit */
function joinChannelWithMic(newRoomId) {
  requestMicrophoneAccess()
    .then(() => {
      socket.emit('joinRoom', { groupId: currentGroup, roomId: newRoomId });
      currentRoom = newRoomId;
      leaveButton.style.display = 'flex';
    })
    .catch(err => {
      console.error("Mikrofon alınamadı:", err);
      alert("Mikrofona erişilemedi. Sesli sohbet başlatılamadı!");
    });
}

/* Oda oluşturma butonu */
createRoomButton.addEventListener('click', () => {
  if (!currentGroup) {
    alert("Önce bir gruba göz atın veya katılın!");
    return;
  }
  roomModal.style.display = 'flex';
  modalRoomName.value = '';
  modalRoomName.focus();
});
createChannelBtn.addEventListener('click', () => {
  groupDropdownMenu.style.display = 'none';
  if (!currentGroup) {
    alert("Önce bir gruba göz atın veya katılın!");
    return;
  }
  roomModal.style.display = 'flex';
  modalRoomName.value = '';
  modalRoomName.focus();
});
modalCreateRoomBtn.addEventListener('click', () => {
  const rName = modalRoomName.value.trim();
  if (!rName) {
    alert("Oda adı girin!");
    return;
  }
  socket.emit('createRoom', { groupId: currentGroup, roomName: rName });
  roomModal.style.display = 'none';
});
modalCloseRoomBtn.addEventListener('click', () => {
  roomModal.style.display = 'none';
});

/* Ayrıl Butonu => odadan çık */
leaveButton.addEventListener('click', () => {
  if (!currentRoom) return;
  socket.emit('leaveRoom', { groupId: currentGroup, roomId: currentRoom });
  closeAllPeers();
  currentRoom = null;
  userListDiv.innerHTML = '';
  leaveButton.style.display = 'none';
  console.log("Kanaldan ayrıldınız.");
});

/* sağ panel => groupUsers => updateUserList */
function updateUserList(dbUsersArray) {
  userListDiv.innerHTML = '';
  dbUsersArray.forEach(u => {
    const userItem = document.createElement('div');
    userItem.classList.add('user-item');

    const profileThumb = document.createElement('div');
    profileThumb.classList.add('profile-thumb');

    const userNameSpan = document.createElement('span');
    userNameSpan.classList.add('user-name');
    userNameSpan.textContent = u.username;

    const copyBtn = document.createElement('button');
    copyBtn.classList.add('copy-id-btn');
    copyBtn.textContent = "ID Kopyala";
    copyBtn.dataset.userid = u.username;
    copyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const val = e.target.dataset.userid;
      navigator.clipboard.writeText(val)
        .then(() => alert("Kullanıcı kopyalandı: " + val))
        .catch(err => {
          console.error("Kopyalama hatası:", err);
          alert("Kopyalama başarısız!");
        });
    });

    userItem.appendChild(profileThumb);
    userItem.appendChild(userNameSpan);
    userItem.appendChild(copyBtn);
    userListDiv.appendChild(userItem);
  });
}

/* Mikrofon Erişimi */
async function requestMicrophoneAccess() {
  try {
    console.log("Mikrofon izni isteniyor...");
    const constraints = {
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    console.log("Mikrofon erişimi verildi:", stream);
    localStream = stream;
    audioPermissionGranted = true;
    applyAudioStates();

    remoteAudios.forEach(audioEl => {
      audioEl.play().catch(err => console.error("Ses oynatılamadı:", err));
    });
  } catch(err) {
    console.error("Mikrofon izni alınamadı:", err);
    throw err; 
  }
}

/* WebRTC => Offer/Answer/ICE */
socket.on("signal", async (data) => {
  if (data.from === socket.id) return;
  const { from, signal } = data;
  let peer = peers[from];

  if (!peer) {
    if (!localStream) {
      console.warn("localStream yok => push:", from);
      pendingNewUsers.push(from);
      return;
    }
    peer = initPeer(from, false);
  }

  if (signal.type === "offer") {
    await peer.setRemoteDescription(new RTCSessionDescription(signal));
    sessionUfrag[from] = parseIceUfrag(signal.sdp);

    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    console.log("Answer gönderiliyor:", answer);
    socket.emit("signal", { to: from, signal: peer.localDescription });

    if (pendingCandidates[from]) {
      for (const c of pendingCandidates[from]) {
        if (sessionUfrag[from] 
            && sessionUfrag[from] !== c.usernameFragment 
            && c.usernameFragment !== null) {
          console.warn("Candidate mismatch => drop:", c);
          continue;
        }
        try {
          await peer.addIceCandidate(new RTCIceCandidate(c));
          console.log("ICE Candidate eklendi (pending):", c);
        } catch (err) {
          console.warn("Candidate eklenirken hata:", err);
        }
      }
      pendingCandidates[from] = [];
    }

  } else if (signal.type === "answer") {
    if (peer.signalingState === "stable") {
      console.warn("PeerConnection already stable. Second answer ignored.");
      return;
    }
    await peer.setRemoteDescription(new RTCSessionDescription(signal));
    sessionUfrag[from] = parseIceUfrag(signal.sdp);

    if (pendingCandidates[from]) {
      for (const c of pendingCandidates[from]) {
        if (sessionUfrag[from] 
            && sessionUfrag[from] !== c.usernameFragment 
            && c.usernameFragment !== null) {
          console.warn("Candidate mismatch => drop:", c);
          continue;
        }
        try {
          await peer.addIceCandidate(new RTCIceCandidate(c));
          console.log("ICE Candidate eklendi (pending):", c);
        } catch (err) {
          console.warn("Candidate eklenirken hata:", err);
        }
      }
      pendingCandidates[from] = [];
    }

  } else if (signal.candidate) {
    if (!peer.remoteDescription || peer.remoteDescription.type === "") {
      console.log("Henüz remoteDescription yok => pending candidate:", signal);
      if (!pendingCandidates[from]) {
        pendingCandidates[from] = [];
      }
      pendingCandidates[from].push(signal);
    } else {
      if (sessionUfrag[from] 
          && sessionUfrag[from] !== signal.usernameFragment 
          && signal.usernameFragment !== null) {
        console.warn("Candidate mismatch => drop:", signal);
        return;
      }
      try {
        await peer.addIceCandidate(new RTCIceCandidate(signal));
        console.log("ICE Candidate eklendi:", signal);
      } catch (err) {
        console.warn("ICE Candidate hata:", err);
      }
    }
  }
});

/* Peer Başlat => WebRTC */
function initPeer(userId, isInitiator) {
  if (!localStream || !audioPermissionGranted) {
    console.warn("localStream yok => initPeer bekle:", userId);
    if (isInitiator) pendingUsers.push(userId);
    else pendingNewUsers.push(userId);
    return;
  }
  if (peers[userId]) {
    console.log("Zaten peer var:", userId);
    return peers[userId];
  }

  console.log(`initPeer => userId=${userId}, isInitiator=${isInitiator}`);
  const peer = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  });
  peers[userId] = peer;

  localStream.getTracks().forEach(track => peer.addTrack(track, localStream));

  peer.onicecandidate = (ev) => {
    if (ev.candidate) {
      socket.emit("signal", { to: userId, signal: ev.candidate });
    }
  };
  peer.oniceconnectionstatechange = () => {
    console.log("ICE state:", peer.iceConnectionState);
  };
  peer.onconnectionstatechange = () => {
    console.log("Peer state:", peer.connectionState);
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

  if (isInitiator) createOffer(peer, userId);
  return peer;
}

/* createOffer => stable check */
async function createOffer(peer, userId) {
  if (peer.signalingState !== "stable") {
    console.log("signaling not stable => 200ms bekle...");
    setTimeout(async () => {
      if (peer.signalingState !== "stable") {
        console.warn("Hâlâ stable değil => offer iptal");
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

/* closeAllPeers */
function closeAllPeers() {
  console.log("CLOSING ALL PEERS!");
  for (const uid in peers) {
    if (peers[uid]) {
      peers[uid].close();
      delete peers[uid];
    }
  }
  remoteAudios = [];
  pendingCandidates = {};
  sessionUfrag = {};
}

/* Mikrofon & Kulaklık Butonları */
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
  micToggleButton.innerHTML = (micEnabled && !selfDeafened) ? "MIC ON" : "MIC OFF";
  applyDeafenState();
  deafenToggleButton.innerHTML = selfDeafened ? "DEAF ON" : "DEAF OFF";
}

function applyDeafenState() {
  remoteAudios.forEach(audio => {
    audio.muted = selfDeafened;
  });
}

/* parseIceUfrag => a=ice-ufrag:... */
function parseIceUfrag(sdp) {
  const lines = sdp.split('\n');
  for (const line of lines) {
    if (line.startsWith('a=ice-ufrag:')) {
      return line.split(':')[1].trim();
    }
  }
  return null;
}

/* Socket connect/disconnect */
socket.on("connect", () => {
  console.log("WebSocket bağlandı:", socket.id);
});
socket.on("disconnect", () => {
  console.log("WebSocket bağlantısı koptu.");
});

/* Drop-down menü aç/kapa */
let dropdownOpen = false;
groupDropdownIcon.addEventListener('click', () => {
  dropdownOpen = !dropdownOpen;
  groupDropdownMenu.style.display = dropdownOpen ? 'block' : 'none';
});

/* Drop-down menü butonları */
copyGroupIdBtn.addEventListener('click', () => {
  if (!currentGroup) {
    alert("Şu an geçerli bir grup yok!");
    return;
  }
  navigator.clipboard.writeText(currentGroup)
    .then(() => alert("Grup ID kopyalandı: " + currentGroup))
    .catch(err => console.error("Grup ID kopyalanamadı:", err));
  groupDropdownMenu.style.display = 'none';
  dropdownOpen = false;
});

renameGroupBtn.addEventListener('click', () => {
  if (!currentGroup) {
    alert("Geçerli bir grup yok!");
    return;
  }
  const newName = prompt("Yeni grup ismi:");
  if (!newName) return;

  socket.emit("renameGroup", {
    groupId: currentGroup,
    newName: newName.trim()
  });
  groupDropdownMenu.style.display = 'none';
  dropdownOpen = false;
});

deleteGroupBtn.addEventListener('click', () => {
  if (!currentGroup) {
    alert("Şu an geçerli bir grup yok!");
    return;
  }
  const sure = confirm("Bu grubu silmek istediğinize emin misiniz?");
  if (!sure) return;

  socket.emit("deleteGroup", { groupId: currentGroup });
  groupDropdownMenu.style.display = 'none';
  dropdownOpen = false;
});
