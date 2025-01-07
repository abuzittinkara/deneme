/**************************************
 * script.js
 **************************************/

const socket = io();
let localStream;
let peers = {};
let audioPermissionGranted = false;
let remoteAudios = [];
let username = null;

let micEnabled = true;
let selfDeafened = false;

let currentGroup = null; 
let currentRoom = null;

let pendingUsers = [];
let pendingNewUsers = {}; 
let pendingCandidates = {};
let sessionUfrag = {};

function createWaveIcon() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("fill", "currentColor");
  svg.setAttribute("class", "channel-icon bi bi-volume-up-fill");
  svg.setAttribute("viewBox", "0 0 16 16");
  // path’ler (kısaltılmış)
  const p1 = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p1.setAttribute("d", "M9.717.55A.5...");
  const p2 = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p2.setAttribute("d", "M13.493 1.957a.5...");
  svg.appendChild(p1);
  svg.appendChild(p2);
  return svg;
}

// DOM ekranları
const loginScreen = document.getElementById('loginScreen');
const registerScreen = document.getElementById('registerScreen');
const callScreen = document.getElementById('callScreen');

const loginUsernameInput = document.getElementById('loginUsernameInput');
const loginPasswordInput = document.getElementById('loginPasswordInput');
const loginButton = document.getElementById('loginButton');

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

const groupListDiv = document.getElementById('groupList');
const createGroupButton = document.getElementById('createGroupButton');

const roomListDiv = document.getElementById('roomList');
const createRoomButton = document.getElementById('createRoomButton');
const groupTitle = document.getElementById('groupTitle');
const groupDropdownIcon = document.getElementById('groupDropdownIcon');
const groupDropdownMenu = document.getElementById('groupDropdownMenu');
const copyGroupIdBtn = document.getElementById('copyGroupIdBtn');
const renameGroupBtn = document.getElementById('renameGroupBtn');
const createChannelBtn = document.getElementById('createChannelBtn');
const deleteGroupBtn = document.getElementById('deleteGroupBtn');

const toggleDMButton = document.getElementById('toggleDMButton');
const closeDMButton = document.getElementById('closeDMButton');
const dmPanel = document.getElementById('dmPanel');
const groupsAndRooms = document.getElementById('groupsAndRooms');

let isDMMode = false;

// Sağ panel
const userListDiv = document.getElementById('userList');
const leaveButton = document.getElementById('leaveButton');

// Ekran geçiş
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

/* Login */
loginButton.addEventListener('click', () => {
  socket.emit('login', {
    username: loginUsernameInput.value.trim(),
    password: loginPasswordInput.value.trim()
  });
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
    alert("Giriş hatası: " + data.message);
  }
});

/* Register */
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
  socket.emit('register', userData);
});
socket.on('registerResult', (data) => {
  if (data.success) {
    alert("Kayıt başarılı! Giriş yapabilirsiniz.");
    registerScreen.style.display = 'none';
    loginScreen.style.display = 'block';
  } else {
    alert("Kayıt hatası: " + data.message);
  }
});

/* DM panel */
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

/* Grup Oluştur Seçenekleri */
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
actualGroupNameBtn.addEventListener('click', () => {
  const val = actualGroupName.value.trim();
  if (!val) return;
  socket.emit('createGroup', val);
  actualGroupCreateModal.style.display = 'none';
});
closeCreateGroupModal.addEventListener('click', () => {
  actualGroupCreateModal.style.display = 'none';
});
joinGroupIdBtn.addEventListener('click', () => {
  const v = joinGroupIdInput.value.trim();
  if (!v) return;
  socket.emit('joinGroupByID', v);
  joinGroupModal.style.display = 'none';
});
closeJoinGroupModal.addEventListener('click', () => {
  joinGroupModal.style.display = 'none';
});

/* groupsList => sol sidebar */
socket.on('groupsList', (groupArr) => {
  groupListDiv.innerHTML = '';
  groupArr.forEach(gObj => {
    const d = document.createElement('div');
    d.className = 'grp-item';
    d.innerText = gObj.name[0].toUpperCase();
    d.title = gObj.name + "(" + gObj.id + ")";
    d.addEventListener('click', () => {
      document.querySelectorAll('.grp-item').forEach(x => x.classList.remove('selected'));
      d.classList.add('selected');
      groupTitle.textContent = gObj.name;
      // Sadece "browseGroup"
      socket.emit('browseGroup', gObj.id);
    });
    groupListDiv.appendChild(d);
  });
});

/* roomsList => kanallar */
socket.on('roomsList', (roomsArray) => {
  roomListDiv.innerHTML = '';
  roomsArray.forEach(r => {
    const item = createChannelDOM(currentGroup, r.id, r.name);
    roomListDiv.appendChild(item);
  });
});

/* Kanal DOM */
function createChannelDOM(gId, rId, rName) {
  const uniq = `channel-${gId}-${rId}`;
  let ex = document.getElementById(uniq);
  if (ex) {
    ex.querySelector('.channel-header span').textContent = rName;
    return ex;
  }
  const item = document.createElement('div');
  item.className = 'channel-item';
  item.id = uniq;

  const head = document.createElement('div');
  head.className = 'channel-header';

  const icon = createWaveIcon();
  const sp = document.createElement('span');
  sp.textContent = rName;

  head.appendChild(icon);
  head.appendChild(sp);

  const usersDiv = document.createElement('div');
  usersDiv.className = 'channel-users';
  usersDiv.id = `channel-users-${gId}-${rId}`;

  item.appendChild(head);
  item.appendChild(usersDiv);

  // Kanala tıklayınca => voice
  item.addEventListener('click', () => {
    closeAllPeers();
    if (currentRoom && currentRoom !== rId) {
      socket.emit('leaveRoom', { groupId: currentGroup, roomId: currentRoom });
    }
    currentGroup = gId;
    joinChannelWithMic(rId);
  });
  return item;
}

/* allChannelsData */
socket.on('allChannelsData', (chObj) => {
  Object.keys(chObj).forEach(rId => {
    const cd = chObj[rId];
    const uniq = `channel-${currentGroup}-${rId}`;
    let cEl = document.getElementById(uniq);
    if (!cEl) {
      cEl = createChannelDOM(currentGroup, rId, cd.name);
      roomListDiv.appendChild(cEl);
    }
    const usDiv = document.getElementById(`channel-users-${currentGroup}-${rId}`);
    if (!usDiv) return;
    usDiv.innerHTML = '';
    cd.users.forEach(u => {
      const uD = document.createElement('div');
      uD.classList.add('channel-user');
      const av = document.createElement('div');
      av.classList.add('channel-user-avatar');
      const s = document.createElement('span');
      s.textContent = u.username;
      uD.appendChild(av);
      uD.appendChild(s);
      usDiv.appendChild(uD);
    });
  });
});

/* groupUsers => sağ panel */
socket.on('groupUsers', (dbArr) => {
  console.log("groupUsers =>", dbArr);
  updateUserList(dbArr);
});

/* roomUsers => o voice kanaldaki kişiler => WebRTC */
socket.on('roomUsers', (arr) => {
  console.log("roomUsers =>", arr);

  if (!currentGroup || !currentRoom) return;
  const cUsersId = `channel-users-${currentGroup}-${currentRoom}`;
  const cUsersDiv = document.getElementById(cUsersId);
  if (cUsersDiv) {
    cUsersDiv.innerHTML = '';
    arr.forEach(u => {
      const d = document.createElement('div');
      d.classList.add('channel-user');
      const av = document.createElement('div');
      av.classList.add('channel-user-avatar');
      const s = document.createElement('span');
      s.textContent = u.username;
      d.appendChild(av);
      d.appendChild(s);
      cUsersDiv.appendChild(d);
    });
  }

  // WebRTC
  const otherIds = arr.filter(x => x.id !== socket.id).map(x => x.id).filter(i => !peers[i]);
  if (!audioPermissionGranted || !localStream) {
    requestMicrophoneAccess().then(() => {
      otherIds.forEach(uid => {
        if (!peers[uid]) initPeer(uid, true);
      });
      pendingUsers.forEach(uid => {
        if (!peers[uid]) initPeer(uid, true);
      });
      pendingUsers = [];
      Object.keys(pendingNewUsers).forEach(k => {
        if (!peers[k]) initPeer(k, false);
      });
      pendingNewUsers = {};
    });
  } else {
    otherIds.forEach(uid => {
      if (!peers[uid]) initPeer(uid, true);
    });
  }
});

/* joinChannelWithMic */
function joinChannelWithMic(rId) {
  requestMicrophoneAccess().then(() => {
    currentRoom = rId;
    socket.emit('joinRoom', { groupId: currentGroup, roomId: rId });
    leaveButton.style.display = 'flex';
  }).catch(err => {
    alert("Mikrofon açılmadı: " + err);
  });
}

/* createRoom */
createRoomButton.addEventListener('click', () => {
  if (!currentGroup) {
    alert("Önce gruba göz at!");
    return;
  }
  roomModal.style.display = 'flex';
  modalRoomName.value = '';
  modalRoomName.focus();
});
createChannelBtn.addEventListener('click', () => {
  groupDropdownMenu.style.display = 'none';
  if (!currentGroup) {
    alert("Önce gruba göz at!");
    return;
  }
  roomModal.style.display = 'flex';
  modalRoomName.value = '';
  modalRoomName.focus();
});
modalCreateRoomBtn.addEventListener('click', () => {
  const val = modalRoomName.value.trim();
  if (!val) return;
  socket.emit('createRoom', { groupId: currentGroup, roomName: val });
  roomModal.style.display = 'none';
});
modalCloseRoomBtn.addEventListener('click', () => {
  roomModal.style.display = 'none';
});

/* leaveButton => voice kanaldan ayrıl */
leaveButton.addEventListener('click', () => {
  if (!currentRoom) return;
  socket.emit('leaveRoom', { groupId: currentGroup, roomId: currentRoom });
  closeAllPeers();
  currentRoom = null;
  userListDiv.innerHTML = '';
  leaveButton.style.display = 'none';
  console.log("Kanaldan ayrıldınız");
});

/* sağ panel => groupUsers => updateUserList */
function updateUserList(dbArr) {
  userListDiv.innerHTML = '';
  dbArr.forEach(u => {
    const d = document.createElement('div');
    d.classList.add('user-item');
    const pr = document.createElement('div');
    pr.classList.add('profile-thumb');
    const s = document.createElement('span');
    s.classList.add('user-name');
    s.textContent = u.username;

    const copyBtn = document.createElement('button');
    copyBtn.classList.add('copy-id-btn');
    copyBtn.textContent = "ID Kopyala";
    copyBtn.dataset.userid = u.username;
    copyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(e.target.dataset.userid)
        .then(() => alert("Kullanıcı kopyalandı!"))
        .catch(er => alert("Kopyalama hatası"));
    });

    d.appendChild(pr);
    d.appendChild(s);
    d.appendChild(copyBtn);
    userListDiv.appendChild(d);
  });
}

/* Mikrofon Erişimi */
async function requestMicrophoneAccess() {
  try {
    console.log("Mikrofon izni isteniyor...");
    const constraints = { audio: true };
    const st = await navigator.mediaDevices.getUserMedia(constraints);
    console.log("Mikrofon izni verildi:", st);
    localStream = st;
    audioPermissionGranted = true;
    applyAudioStates();
    remoteAudios.forEach(a => {
      a.play().catch(e => console.error("Ses oynatılamadı =>", e));
    });
  } catch(err) {
    console.error("Mikrofon izni hata =>", err);
    throw err;
  }
}

/* WebRTC => signal */
socket.on("signal", async (data) => {
  if (data.from === socket.id) return;
  const { from, signal } = data;
  let p = peers[from];
  if (!p) {
    if (!localStream) {
      pendingNewUsers[from] = true;
      return;
    }
    p = initPeer(from, false);
  }
  if (signal.type === "offer") {
    await p.setRemoteDescription(new RTCSessionDescription(signal));
    sessionUfrag[from] = parseIceUfrag(signal.sdp);

    const answer = await p.createAnswer();
    await p.setLocalDescription(answer);
    console.log("Answer gönderiliyor:", answer);
    socket.emit("signal", { to: from, signal: p.localDescription });

    if (pendingCandidates[from]) {
      for (const c of pendingCandidates[from]) {
        if (sessionUfrag[from] && sessionUfrag[from] !== c.usernameFragment && c.usernameFragment !== null) {
          console.warn("Candidate mismatch => drop:", c);
          continue;
        }
        await p.addIceCandidate(new RTCIceCandidate(c));
        console.log("ICE Candidate eklendi(pending):", c);
      }
      pendingCandidates[from] = [];
    }
  } else if (signal.type === "answer") {
    console.log("Answer geldi => setRemoteDescription");
    if (p.signalingState === "stable") {
      console.warn("signalingState === stable => 2. answer ignored");
      return;
    }
    try {
      await p.setRemoteDescription(new RTCSessionDescription(signal));
    } catch(x) {
      console.error("setRemoteDescription(answer) hata =>", x);
      return;
    }
    sessionUfrag[from] = parseIceUfrag(signal.sdp);

    if (pendingCandidates[from]) {
      for (const c of pendingCandidates[from]) {
        if (sessionUfrag[from] && sessionUfrag[from] !== c.usernameFragment && c.usernameFragment !== null) {
          console.warn("Candidate mismatch => drop =>", c);
          continue;
        }
        await p.addIceCandidate(new RTCIceCandidate(c));
        console.log("ICE Candidate eklendi(pending2):", c);
      }
      pendingCandidates[from] = [];
    }
  } else if (signal.candidate) {
    if (!p.remoteDescription || p.remoteDescription.type === "") {
      console.log("Henüz remoteDescription yok => candidate pending:", signal);
      if (!pendingCandidates[from]) pendingCandidates[from] = [];
      pendingCandidates[from].push(signal);
    } else {
      if (sessionUfrag[from] && sessionUfrag[from] !== signal.usernameFragment && signal.usernameFragment !== null) {
        console.warn("Candidate mismatch => drop =>", signal);
        return;
      }
      try {
        await p.addIceCandidate(new RTCIceCandidate(signal));
        console.log("ICE Candidate eklendi:", signal);
      } catch(e) {
        console.warn("ICE addCandidate hata =>", e);
      }
    }
  }
});

/* Peer Başlat => WebRTC */
function initPeer(userId, isInitiator) {
  if (!localStream || !audioPermissionGranted) {
    if (isInitiator) pendingUsers.push(userId);
    else pendingNewUsers[userId] = true;
    return;
  }
  if (peers[userId]) return peers[userId];

  console.log("initPeer => userId:", userId, " isInitiator:", isInitiator);
  const pc = new RTCPeerConnection({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      {
        urls: "turn:your.turn.server:3478",
        username: "testuser",
        credential: "testpass"
      }
    ]
  });
  peers[userId] = pc;

  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

  pc.onicecandidate = (ev) => {
    if (ev.candidate) {
      socket.emit("signal", { to: userId, signal: ev.candidate });
    }
  };
  pc.oniceconnectionstatechange = () => {
    console.log("ICE state =>", pc.iceConnectionState);
  };
  pc.onconnectionstatechange = () => {
    console.log("Peer state =>", pc.connectionState);
  };
  pc.ontrack = (evt) => {
    console.log("Remote track =>", evt.streams[0]);
    const au = new Audio();
    au.srcObject = evt.streams[0];
    au.autoplay = false;
    au.muted = false;
    remoteAudios.push(au);
    applyDeafenState();
    if (audioPermissionGranted) {
      au.play().catch(e => console.error("Ses oynatılamadı =>", e));
    }
  };

  if (isInitiator) createOffer(pc, userId);
  return pc;
}

/* createOffer => stable check => 50ms bekle */
async function createOffer(pc, userId) {
  if (pc.signalingState !== "stable") {
    console.log("signalingState not stable => 50ms bekle => createOffer");
    setTimeout(() => {
      if (pc.signalingState === "stable") {
        doOffer(pc, userId);
      } else {
        console.warn("Hâlâ stable değil => second offer ignored");
      }
    }, 50);
    return;
  }
  doOffer(pc, userId);
}
async function doOffer(pc, userId) {
  console.log("doOffer => creating offer");
  const off = await pc.createOffer();
  await pc.setLocalDescription(off);
  socket.emit("signal", { to: userId, signal: pc.localDescription });
}

/* closeAllPeers */
function closeAllPeers() {
  console.log("CLOSING ALL PEERS =>");
  Object.keys(peers).forEach(uid => {
    peers[uid].close();
    delete peers[uid];
  });
  remoteAudios = [];
  pendingCandidates = {};
  sessionUfrag = {};
}

/* Mikrofon & Kulaklık */
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
    localStream.getAudioTracks().forEach(t => {
      t.enabled = micEnabled && !selfDeafened;
    });
  }
  micToggleButton.innerHTML = (micEnabled && !selfDeafened) ? "MIC ON" : "MIC OFF";
  applyDeafenState();
  deafenToggleButton.innerHTML = selfDeafened ? "DEAF ON" : "DEAF OFF";
}
function applyDeafenState() {
  remoteAudios.forEach(a => {
    a.muted = selfDeafened;
  });
}

/* parseIceUfrag */
function parseIceUfrag(sdp) {
  const lines = sdp.split('\n');
  for (const l of lines) {
    if (l.startsWith('a=ice-ufrag:')) return l.split(':')[1].trim();
  }
  return null;
}

/* Socket connect/disconnect */
socket.on("connect", () => {
  console.log("WebSocket bağlandı =>", socket.id);
});
socket.on("disconnect", () => {
  console.log("WS bağlantısı koptu.");
});

/* drop-down menü */
let dropdownOpen = false;
groupDropdownIcon.addEventListener('click', () => {
  dropdownOpen = !dropdownOpen;
  groupDropdownMenu.style.display = dropdownOpen ? 'block' : 'none';
});
copyGroupIdBtn.addEventListener('click', () => {
  if (!currentGroup) return;
  navigator.clipboard.writeText(currentGroup).then(() => alert("Grup ID kopyalandı"));
  groupDropdownMenu.style.display = 'none';
  dropdownOpen = false;
});
renameGroupBtn.addEventListener('click', () => {
  if (!currentGroup) return;
  const n = prompt("Yeni grup ismi?");
  if (!n) return;
  socket.emit("renameGroup", { groupId: currentGroup, newName: n.trim() });
  groupDropdownMenu.style.display = 'none';
  dropdownOpen = false;
});
deleteGroupBtn.addEventListener('click', () => {
  if (!currentGroup) return;
  if (!confirm("Bu grubu silmek istiyor musun?")) return;
  socket.emit("deleteGroup", { groupId: currentGroup });
  groupDropdownMenu.style.display = 'none';
  dropdownOpen = false;
});
