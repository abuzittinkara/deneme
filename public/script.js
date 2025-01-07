/**************************************
 * script.js (GÜNCELLENMİŞ TAM HÂL)
 **************************************/

const socket = io();
let localStream;
let peers = {};
let audioPermissionGranted = false;
let remoteAudios = [];
let username = null;

// Mikrofon & Deaf
let micEnabled = true;
let selfDeafened = false;

// Mevcut group/room
let currentGroup = null;
let currentRoom = null;

let pendingUsers = [];
let pendingNewUsers = [];

// ICE "ufrag" vs.
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

// Sağ panel
const userListDiv = document.getElementById('userList');
const leaveButton = document.getElementById('leaveButton');

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

/* Login */
loginButton.addEventListener('click', () => {
  const usernameVal = loginUsernameInput.value.trim();
  const passwordVal = loginPasswordInput.value.trim();
  if (!usernameVal || !passwordVal) {
    alert("Kullanıcı adı/parola eksik");
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
    alert("Giriş başarısız:" + data.message);
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
    alert("Kayıt başarılı, şimdi giriş yap");
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

/* Grup oluştur */
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

// Grup Kur
actualGroupNameBtn.addEventListener('click', () => {
  const gName = actualGroupName.value.trim();
  if (!gName) return;
  socket.emit('createGroup', gName);
  actualGroupCreateModal.style.display = 'none';
});
closeCreateGroupModal.addEventListener('click', () => {
  actualGroupCreateModal.style.display = 'none';
});

// Gruba Katıl
joinGroupIdBtn.addEventListener('click', () => {
  const gIdVal = joinGroupIdInput.value.trim();
  if (!gIdVal) return;
  socket.emit('joinGroupByID', gIdVal);
  joinGroupModal.style.display = 'none';
});
closeJoinGroupModal.addEventListener('click', () => {
  joinGroupModal.style.display = 'none';
});

/* groupsList => sol sidebar */
socket.on('groupsList', (groupArray) => {
  groupListDiv.innerHTML = '';
  groupArray.forEach(gObj => {
    const grpItem = document.createElement('div');
    grpItem.className = 'grp-item';
    grpItem.innerText = gObj.name[0].toUpperCase();
    grpItem.title = gObj.name + "(" + gObj.id + ")";
    grpItem.addEventListener('click', () => {
      document.querySelectorAll('.grp-item').forEach(x => x.classList.remove('selected'));
      grpItem.classList.add('selected');
      groupTitle.textContent = gObj.name;
      currentGroup = gObj.id;
      socket.emit('browseGroup', gObj.id);
    });
    groupListDiv.appendChild(grpItem);
  });
});

/* roomsList => kanallar */
socket.on('roomsList', (roomsArray) => {
  roomListDiv.innerHTML = '';
  roomsArray.forEach(rObj => {
    const item = createChannelDOM(currentGroup, rObj.id, rObj.name);
    roomListDiv.appendChild(item);
  });
});

/* Kanal DOM => "channel-<groupId>-<roomId>" */
function createChannelDOM(gId, rId, rName) {
  const uniqueId = `channel-${gId}-${rId}`;
  let existing = document.getElementById(uniqueId);
  if (existing) {
    existing.querySelector('.channel-header span').textContent = rName;
    return existing;
  }
  const roomItem = document.createElement('div');
  roomItem.className = 'channel-item';
  roomItem.id = uniqueId;

  const headerDiv = document.createElement('div');
  headerDiv.className = 'channel-header';
  const icon = createWaveIcon();
  const spanTxt = document.createElement('span');
  spanTxt.textContent = rName;

  headerDiv.appendChild(icon);
  headerDiv.appendChild(spanTxt);

  const usersDiv = document.createElement('div');
  usersDiv.className = 'channel-users';
  usersDiv.id = `channel-users-${gId}-${rId}`;

  roomItem.appendChild(headerDiv);
  roomItem.appendChild(usersDiv);

  // Tıklayınca => closeAllPeers => leaveRoom => joinChannelWithMic
  roomItem.addEventListener('click', () => {
    console.log("CLOSING ALL PEERS =>");
    closeAllPeers();

    if (currentRoom && currentRoom !== rId) {
      socket.emit('leaveRoom', { groupId: currentGroup, roomId: currentRoom });
    }
    joinChannelWithMic(rId);
  });
  return roomItem;
}

/* allChannelsData => her odada kimler var */
socket.on('allChannelsData', (channelsObj) => {
  Object.keys(channelsObj).forEach(rId => {
    const cInfo = channelsObj[rId];
    const uniq = `channel-${currentGroup}-${rId}`;
    let cDiv = document.getElementById(uniq);
    if (!cDiv) {
      cDiv = createChannelDOM(currentGroup, rId, cInfo.name);
      roomListDiv.appendChild(cDiv);
    }
    const cuDiv = document.getElementById(`channel-users-${currentGroup}-${rId}`);
    if (!cuDiv) return;
    cuDiv.innerHTML = '';
    cInfo.users.forEach(u => {
      const ud = document.createElement('div');
      ud.classList.add('channel-user');
      const av = document.createElement('div');
      av.classList.add('channel-user-avatar');
      const sp = document.createElement('span');
      sp.textContent = u.username || '(İsimsiz)';

      ud.appendChild(av);
      ud.appendChild(sp);
      cuDiv.appendChild(ud);
    });
  });
});

/* groupUsers => sağ panel */
socket.on('groupUsers', (dbUsersArray) => {
  console.log("groupUsers =>", dbUsersArray);
  updateUserList(dbUsersArray);
});

/* roomUsers => WebRTC */
socket.on('roomUsers', (usersInRoom) => {
  console.log("roomUsers =>", usersInRoom);

  if (!currentGroup || !currentRoom) return;
  const cUsersId = `channel-users-${currentGroup}-${currentRoom}`;
  const cUsersDiv = document.getElementById(cUsersId);
  if (cUsersDiv) {
    cUsersDiv.innerHTML = '';
    usersInRoom.forEach(u => {
      const ud = document.createElement('div');
      ud.classList.add('channel-user');
      const av = document.createElement('div');
      av.classList.add('channel-user-avatar');
      const sp = document.createElement('span');
      sp.textContent = u.username;
      ud.appendChild(av);
      ud.appendChild(sp);
      cUsersDiv.appendChild(ud);
    });
  }

  // WebRTC
  const otherUserIds = usersInRoom
    .filter(u => u.id !== socket.id)
    .map(u => u.id)
    .filter(i => !peers[i]);

  if (!audioPermissionGranted || !localStream) {
    requestMicrophoneAccess().then(() => {
      otherUserIds.forEach(uid => {
        if (!peers[uid]) initPeer(uid, true);
      });
      pendingUsers.forEach(uid => {
        if (!peers[uid]) initPeer(uid, true);
      });
      pendingUsers = [];
      pendingNewUsers.forEach(uid => {
        if (!peers[uid]) initPeer(uid, false);
      });
      pendingNewUsers = [];
    });
  } else {
    otherUserIds.forEach(uid => {
      if (!peers[uid]) initPeer(uid, true);
    });
  }
});

/* joinChannelWithMic */
function joinChannelWithMic(rId) {
  requestMicrophoneAccess()
    .then(() => {
      currentRoom = rId;
      socket.emit('joinRoom', { groupId: currentGroup, roomId: rId });
      leaveButton.style.display = 'flex';
    })
    .catch(err => {
      console.error("Mic error =>", err);
      alert("Mikrofon açılamadı!");
    });
}

/* Oda oluştur */
createRoomButton.addEventListener('click', () => {
  if (!currentGroup) {
    alert("Önce bir gruba göz atmalısın!");
    return;
  }
  roomModal.style.display = 'flex';
  modalRoomName.value = '';
  modalRoomName.focus();
});
createChannelBtn.addEventListener('click', () => {
  groupDropdownMenu.style.display = 'none';
  if (!currentGroup) {
    alert("Önce bir gruba göz at!");
    return;
  }
  roomModal.style.display = 'flex';
  modalRoomName.value = '';
  modalRoomName.focus();
});
modalCreateRoomBtn.addEventListener('click', () => {
  const rName = modalRoomName.value.trim();
  if (!rName) return;
  socket.emit('createRoom', { groupId: currentGroup, roomName: rName });
  roomModal.style.display = 'none';
});
modalCloseRoomBtn.addEventListener('click', () => {
  roomModal.style.display = 'none';
});

/* Ayrıl Butonu */
leaveButton.addEventListener('click', () => {
  if (!currentRoom) return;
  socket.emit('leaveRoom', { groupId: currentGroup, roomId: currentRoom });
  closeAllPeers();
  currentRoom = null;
  userListDiv.innerHTML = '';
  leaveButton.style.display = 'none';
  console.log("Kanaldan ayrıldın.");
});

/* Sağ panel => groupUsers => updateUserList */
function updateUserList(dbUsersArray) {
  userListDiv.innerHTML = '';
  dbUsersArray.forEach(u => {
    const item = document.createElement('div');
    item.classList.add('user-item');
    const thumb = document.createElement('div');
    thumb.classList.add('profile-thumb');
    const nameSp = document.createElement('span');
    nameSp.classList.add('user-name');
    nameSp.textContent = u.username;

    const copyBtn = document.createElement('button');
    copyBtn.classList.add('copy-id-btn');
    copyBtn.textContent = "ID Kopyala";
    copyBtn.dataset.userid = u.username;
    copyBtn.addEventListener('click', e => {
      e.stopPropagation();
      navigator.clipboard.writeText(e.target.dataset.userid)
        .then(() => alert("Kullanıcı kopyalandı!"))
        .catch(er => alert("Kopyalama hatası!"));
    });

    item.appendChild(thumb);
    item.appendChild(nameSp);
    item.appendChild(copyBtn);
    userListDiv.appendChild(item);
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
    console.log("Mikrofon izni verildi:", stream);
    localStream = stream;
    audioPermissionGranted = true;
    applyAudioStates();
    remoteAudios.forEach(a => {
      a.play().catch(e => console.error("Ses oynatılamadı:", e));
    });
  } catch(err) {
    console.error("Mic request hata:", err);
    throw err;
  }
}

/* WebRTC => signal */
socket.on("signal", async (data) => {
  if (data.from === socket.id) return;
  const { from, signal } = data;
  let peer = peers[from];
  if (!peer) {
    if (!localStream) {
      console.warn("LocalStream yok => push new user:", from);
      pendingNewUsers.push(from);
      return;
    }
    peer = initPeer(from, false);
  }

  if (signal.type === "offer") {
    await peer.setRemoteDescription(new RTCSessionDescription(signal));
    sessionUfrag[from] = parseIceUfrag(signal.sdp);

    // Tekrar "2. answer" iptal yok, her zaman answer ver
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    console.log("Answer gönderiliyor:", answer);
    socket.emit("signal", { to: from, signal: peer.localDescription });

    if (pendingCandidates[from]) {
      for (const c of pendingCandidates[from]) {
        if (sessionUfrag[from] && sessionUfrag[from] !== c.usernameFragment && c.usernameFragment !== null) {
          console.warn("Candidate mismatch => drop:", c);
          continue;
        }
        try {
          await peer.addIceCandidate(new RTCIceCandidate(c));
          console.log("ICE Candidate eklendi (pending):", c);
        } catch (er) {
          console.warn("Candidate eklenirken hata:", er);
        }
      }
      pendingCandidates[from] = [];
    }

  } else if (signal.type === "answer") {
    // "PeerConnection already stable. second answer ignored." => KALDIRILDI
    console.log("Answer geldi => setRemoteDescription");
    await peer.setRemoteDescription(new RTCSessionDescription(signal));
    sessionUfrag[from] = parseIceUfrag(signal.sdp);

    if (pendingCandidates[from]) {
      for (const c of pendingCandidates[from]) {
        if (sessionUfrag[from] && sessionUfrag[from] !== c.usernameFragment && c.usernameFragment !== null) {
          console.warn("Candidate mismatch => drop:", c);
          continue;
        }
        try {
          await peer.addIceCandidate(new RTCIceCandidate(c));
          console.log("ICE Candidate eklendi (pending2):", c);
        } catch (er) {
          console.warn("Candidate eklenirken hata:", er);
        }
      }
      pendingCandidates[from] = [];
    }

  } else if (signal.candidate) {
    if (!peer.remoteDescription || peer.remoteDescription.type === "") {
      console.log("Henüz remoteDescription yok => candidate pending:", signal);
      if (!pendingCandidates[from]) pendingCandidates[from] = [];
      pendingCandidates[from].push(signal);
    } else {
      if (sessionUfrag[from] && sessionUfrag[from] !== signal.usernameFragment && signal.usernameFragment !== null) {
        console.warn("Candidate mismatch => drop:", signal);
        return;
      }
      try {
        await peer.addIceCandidate(new RTCIceCandidate(signal));
        console.log("ICE Candidate eklendi:", signal);
      } catch (er) {
        console.warn("ICE addCandidate hata =>", er);
      }
    }
  }
});

/* Peer Başlat => WebRTC */
function initPeer(userId, isInitiator) {
  if (!localStream || !audioPermissionGranted) {
    console.warn("localStream yok => initPeer => push:", userId);
    if (isInitiator) pendingUsers.push(userId);
    else pendingNewUsers.push(userId);
    return;
  }
  if (peers[userId]) {
    console.log("Zaten peer var =>", userId);
    return peers[userId];
  }

  console.log("initPeer => userId:", userId, " isInitiator:", isInitiator);
  const peer = new RTCPeerConnection({
    iceServers: [ { urls: "stun:stun.l.google.com:19302" } ]
  });
  peers[userId] = peer;

  localStream.getTracks().forEach(t => peer.addTrack(t, localStream));

  peer.onicecandidate = (ev) => {
    if (ev.candidate) {
      socket.emit("signal", { to: userId, signal: ev.candidate });
    }
  };
  peer.oniceconnectionstatechange = () => {
    console.log("ICE state =>", peer.iceConnectionState);
  };
  peer.onconnectionstatechange = () => {
    console.log("Peer state =>", peer.connectionState);
  };
  peer.ontrack = (evt) => {
    console.log("Remote track =>", evt.streams[0]);
    const audio = new Audio();
    audio.srcObject = evt.streams[0];
    audio.autoplay = false;
    audio.muted = false;
    remoteAudios.push(audio);
    applyDeafenState();
    if (audioPermissionGranted) {
      audio.play().catch(e => console.error("Ses oynatılamadı:", e));
    }
  };

  if (isInitiator) {
    createOffer(peer, userId);
  }
  return peer;
}

/* createOffer => stable check */
async function createOffer(peer, userId) {
  // Basitleştirdik: eğer stable değilse 50ms bekle, tekrar dene
  if (peer.signalingState !== "stable") {
    console.log("signalingState not stable => 50ms bekle => createOffer");
    setTimeout(() => {
      if (peer.signalingState === "stable") {
        doOffer(peer, userId);
      } else {
        console.warn("Tekrar stable değil => offer iptal");
      }
    }, 50);
    return;
  }
  // Stable ise direkt doOffer
  doOffer(peer, userId);
}

async function doOffer(peer, userId) {
  console.log("doOffer => creating offer");
  const offer = await peer.createOffer();
  await peer.setLocalDescription(offer);
  socket.emit("signal", { to: userId, signal: peer.localDescription });
}

/* closeAllPeers */
function closeAllPeers() {
  console.log("CLOSING ALL PEERS =>");
  for (const uid in peers) {
    peers[uid].close();
    delete peers[uid];
  }
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
    localStream.getAudioTracks().forEach(track => {
      track.enabled = micEnabled && !selfDeafened;
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

/* parseIceUfrag => a=ice-ufrag:... */
function parseIceUfrag(sdp) {
  const lines = sdp.split('\n');
  for (const l of lines) {
    if (l.startsWith('a=ice-ufrag:')) {
      return l.split(':')[1].trim();
    }
  }
  return null;
}

/* Soket connect/disconnect */
socket.on("connect", () => {
  console.log("WebSocket bağlandı =>", socket.id);
});
socket.on("disconnect", () => {
  console.log("WS bağlantısı koptu.");
});

/* Drop-down menü */
let dropdownOpen = false;
groupDropdownIcon.addEventListener('click', () => {
  dropdownOpen = !dropdownOpen;
  groupDropdownMenu.style.display = dropdownOpen ? 'block' : 'none';
});

/* copyGroupId, renameGroup, deleteGroup */
copyGroupIdBtn.addEventListener('click', () => {
  if (!currentGroup) {
    alert("Grup yok!");
    return;
  }
  navigator.clipboard.writeText(currentGroup).then(() => alert("Grup ID kopyalandı"));
  groupDropdownMenu.style.display = 'none';
  dropdownOpen = false;
});
renameGroupBtn.addEventListener('click', () => {
  if (!currentGroup) return;
  const newN = prompt("Grup ismi:");
  if (!newN) return;
  socket.emit("renameGroup", { groupId: currentGroup, newName: newN.trim() });
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
