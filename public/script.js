/**************************************
 * script.js
 **************************************/

const socket = io();
let localStream;
let peers = {};
let audioPermissionGranted = false;
let remoteAudios = [];
let username = null;

// micEnabled / selfDeafened => global scope
let micEnabled = true;
let selfDeafened = false;

// Mevcut group/room
let currentGroup = null;
let currentRoom = null;

// Göz atılan (browse edilen) grup
let selectedGroup = null;

// Bağlanması bekleyen user listeleri
let pendingUsers = [];     // isInitiator = true olacak kullanıcılar
let pendingNewUsers = [];  // isInitiator = false olacak kullanıcılar

// ICE Candidate / session
let pendingCandidates = {};
let sessionUfrag = {};

// Konuşma algılama
const SPEAKING_THRESHOLD = 0.0;
const VOLUME_CHECK_INTERVAL = 100; // 100ms

// Ionicon => volume-high-outline
function createWaveIcon() {
  const icon = document.createElement('ion-icon');
  icon.setAttribute('name', 'volume-high-outline');
  icon.classList.add('channel-icon');
  return icon;
}

// DOM Elemanları
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

// Ekran geçiş linkleri
const showRegisterScreen = document.getElementById('showRegisterScreen');
const showLoginScreen = document.getElementById('showLoginScreen');

// Gruplar
const groupListDiv = document.getElementById('groupList');
const createGroupButton = document.getElementById('createGroupButton');

// Odalar
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

// Sağ panel (kullanıcı listesi)
const userListDiv = document.getElementById('userList');

// Kanaldan Ayrıl Butonu => Artık channelStatusPanel içinde
const leaveButton = document.getElementById('leaveButton');

// Kanal Durum Paneli
const channelStatusPanel = document.getElementById('channelStatusPanel');
const pingValueSpan = document.getElementById('pingValue');

// Mikrofon/Deaf
const micToggleButton = document.getElementById('micToggleButton');
const deafenToggleButton = document.getElementById('deafenToggleButton');

// AYARLAR Paneli
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
    <p>Örneğin profil bilgileri, tema seçimi vs.</p>
  </div>
`;
document.body.appendChild(settingsPanel);

const userPanelButtons = document.querySelector('.user-panel-buttons');
const settingsButton = document.createElement('button');
settingsButton.id = 'settingsButton';
settingsButton.classList.add('user-panel-btn');
settingsButton.title = 'Ayarlar';
settingsButton.innerHTML = `<ion-icon name="settings-outline"></ion-icon>`;
userPanelButtons.appendChild(settingsButton);

// Ayarlar panel aç/kapa
document.getElementById('settingsBackBtn').addEventListener('click', () => {
  settingsPanel.style.display = 'none';
});
settingsButton.addEventListener('click', () => {
  settingsPanel.style.display = 'flex';
});

/* Ekran geçişleri */
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
    document.getElementById('leftUserName').textContent = username;
    applyAudioStates();
  } else {
    alert("Giriş başarısız: " + data.message);
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

/* Grup Oluştur / Seçenekleri */
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
// Modal: Gruba Katıl
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

/* Oda Oluşturma */
document.getElementById('modalCreateRoomBtn').addEventListener('click', () => {
  const rName = document.getElementById('modalRoomName').value.trim();
  if (!rName) {
    alert("Oda adı girin!");
    return;
  }
  const grp = currentGroup || selectedGroup;
  if (!grp) {
    alert("Önce bir gruba katılın!");
    return;
  }
  socket.emit('createRoom', { groupId: grp, roomName: rName });
  document.getElementById('roomModal').style.display = 'none';
});
document.getElementById('modalCloseRoomBtn').addEventListener('click', () => {
  document.getElementById('roomModal').style.display = 'none';
});

/* groupsList => sol sidebar */
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

/* Drop-down menü */
groupDropdownIcon.addEventListener('click', () => {
  if (groupDropdownMenu.style.display === 'none' || groupDropdownMenu.style.display === '') {
    groupDropdownMenu.style.display = 'block';
  } else {
    groupDropdownMenu.style.display = 'none';
  }
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

/* DM paneli */
toggleDMButton.addEventListener('click', () => {
  if (dmPanel.style.display === 'none' || dmPanel.style.display === '') {
    dmPanel.style.display = 'block';
    isDMMode = true;
  } else {
    dmPanel.style.display = 'none';
    isDMMode = false;
  }
});
closeDMButton.addEventListener('click', () => {
  dmPanel.style.display = 'none';
  isDMMode = false;
});

/* Kanal Sağ tık (context menu) */
const channelContextMenu = document.createElement('div');
channelContextMenu.classList.add('context-menu');
channelContextMenu.style.display = 'none';
channelContextMenu.innerHTML = `
  <div class="context-menu-item" id="renameChannelOption">Kanalın adını değiştir</div>
  <div class="context-menu-item" id="deleteChannelOption">Kanalı sil</div>
`;
document.body.appendChild(channelContextMenu);

let rightClickedChannelId = null;

document.getElementById('renameChannelOption').addEventListener('click', () => {
  if (!rightClickedChannelId) return;
  const newName = prompt("Kanal için yeni isim girin:");
  if (!newName || !newName.trim()) {
    channelContextMenu.style.display = 'none';
    return;
  }
  socket.emit('renameChannel', { channelId: rightClickedChannelId, newName: newName.trim() });
  channelContextMenu.style.display = 'none';
  rightClickedChannelId = null;
});
document.getElementById('deleteChannelOption').addEventListener('click', () => {
  if (!rightClickedChannelId) return;
  const confirmDel = confirm("Kanalı silmek istediğinizden emin misiniz?");
  if (!confirmDel) {
    channelContextMenu.style.display = 'none';
    return;
  }
  socket.emit('deleteChannel', rightClickedChannelId);
  channelContextMenu.style.display = 'none';
  rightClickedChannelId = null;
});
document.addEventListener('click', (e) => {
  if (channelContextMenu.style.display === 'block') {
    channelContextMenu.style.display = 'none';
  }
});

/* roomsList => Kanallar */
socket.on('roomsList', (roomsArray) => {
  roomListDiv.innerHTML = '';

  roomsArray.forEach(roomObj => {
    const roomItem = document.createElement('div');
    roomItem.className = 'channel-item';

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

    // Tıklayınca kanala gir
    roomItem.addEventListener('click', () => {
      // Aynı kanaldaysa hiçbir şey yapma
      if (currentRoom === roomObj.id && currentGroup === selectedGroup) {
        return;
      }

      // Başka odadaysa => oradan ayrıl + peer'ları kapat + paneli gizle
      if (currentRoom && (currentRoom !== roomObj.id || currentGroup !== selectedGroup)) {
        socket.emit('leaveRoom', { groupId: currentGroup, roomId: currentRoom });
        closeAllPeers();
        hideChannelStatusPanel();
        currentRoom = null;
      }
      // “Resmen” bu gruba katıl
      currentGroup = selectedGroup;

      joinRoom(currentGroup, roomObj.id, roomObj.name);
    });

    // Sağ tık => context menu
    roomItem.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      rightClickedChannelId = roomObj.id;
      channelContextMenu.style.left = e.pageX + 'px';
      channelContextMenu.style.top = e.pageY + 'px';
      channelContextMenu.style.display = 'block';
    });

    roomListDiv.appendChild(roomItem);
  });
});

/* allChannelsData => kanalda kim var */
socket.on('allChannelsData', (channelsObj) => {
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
      avatarDiv.id = `avatar-${u.id}`;

      const nameSpan = document.createElement('span');
      nameSpan.textContent = u.username || '(İsimsiz)';

      userDiv.appendChild(avatarDiv);
      userDiv.appendChild(nameSpan);
      channelDiv.appendChild(userDiv);
    });
  });
});

/* groupUsers => sağ panel */
socket.on('groupUsers', (dbUsersArray) => {
  updateUserList(dbUsersArray);
});

/* roomUsers => WebRTC init */
socket.on('roomUsers', (usersInRoom) => {
  const userIdsInRoom = usersInRoom.map(u => u.id);

  Object.keys(peers).forEach(peerId => {
    if (!userIdsInRoom.includes(peerId)) {
      peers[peerId].close();
      delete peers[peerId];
      stopVolumeAnalysis(peerId);

      remoteAudios = remoteAudios.filter(audioEl => {
        if (audioEl.dataset && audioEl.dataset.peerId === peerId) {
          try { audioEl.pause(); } catch (e) {}
          audioEl.srcObject = null;
          return false;
        }
        return true;
      });
    }
  });

  const otherUserIds = usersInRoom
    .filter(u => u.id !== socket.id)
    .map(u => u.id)
    .filter(id => !peers[id]);

  // Mikrofon izni yoksa / localStream yoksa => al
  if (!audioPermissionGranted || !localStream) {
    requestMicrophoneAccess().then(() => {
      otherUserIds.forEach(uid => {
        if (!peers[uid]) {
          const isInit = (socket.id < uid);
          initPeer(uid, isInit);
        }
      });
      pendingUsers.forEach(uid => {
        if (!peers[uid]) {
          initPeer(uid, true);
        }
      });
      pendingUsers = [];
      pendingNewUsers.forEach(uid => {
        if (!peers[uid]) {
          initPeer(uid, false);
        }
      });
      pendingNewUsers = [];
    }).catch(err => {
      console.error("Mikrofon izni alınamadı:", err);
    });
  } else {
    otherUserIds.forEach(uid => {
      if (!peers[uid]) {
        const isInit = (socket.id < uid);
        initPeer(uid, isInit);
      }
    });
  }
});

/* joinRoom => WebRTC */
function joinRoom(groupId, roomId, roomName) {
  socket.emit('joinRoom', { groupId, roomId });

  document.getElementById('selectedChannelTitle').textContent = roomName;
  showChannelStatusPanel(); // Kanal Durum Paneli

  currentGroup = groupId;
  currentRoom = roomId;
}

/* Kanaldan Ayrıl */
leaveButton.addEventListener('click', () => {
  if (!currentRoom) return;

  socket.emit('leaveRoom', { groupId: currentGroup, roomId: currentRoom });
  closeAllPeers();
  hideChannelStatusPanel();

  currentRoom = null;
  document.getElementById('selectedChannelTitle').textContent = 'Kanal Seçilmedi';
  console.log("Kanaldan ayrıldınız.");

  if (currentGroup) {
    socket.emit('browseGroup', currentGroup);
  }
});

/* Kanal Durum Paneli Göster/Gizle */
let pingInterval = null;

function showChannelStatusPanel() {
  channelStatusPanel.style.display = 'block';
  startPingInterval();
}
function hideChannelStatusPanel() {
  channelStatusPanel.style.display = 'none';
  stopPingInterval();
}

function startPingInterval() {
  if (pingInterval) clearInterval(pingInterval);
  pingInterval = setInterval(() => {
    // Socket.IO 4.x => engine.ping -> son ölçülen ping ms
    if (socket && socket.io && typeof socket.io.engine.ping !== 'undefined') {
      pingValueSpan.textContent = socket.io.engine.ping + ' ms';
    } else {
      pingValueSpan.textContent = '-- ms';
    }
  }, 1000);
}
function stopPingInterval() {
  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
  }
  pingValueSpan.textContent = '--';
}

/* Sağ panel => updateUserList */
function updateUserList(data) {
  userListDiv.innerHTML = '';

  // Çevrimiçi
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

  // Çevrimdışı
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

/* Kullanıcı öğesi oluşturma */
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
    localStream = stream;
    audioPermissionGranted = true;
    applyAudioStates();

    // Konuşma algılama => local user
    startVolumeAnalysis(stream, socket.id);

    remoteAudios.forEach(audioEl => {
      audioEl.play().catch(err => console.error("Ses oynatılamadı:", err));
    });
  } catch (err) {
    console.error("Mikrofon izni alınamadı:", err);
  }
}

/* WebRTC => Offer/Answer/ICE */
socket.on("signal", async (data) => {
  if (data.from === socket.id) return;

  const { from, signal } = data;
  let peer = peers[from];

  if (!peer) {
    if (!localStream) {
      console.warn(`localStream yok => pending user: ${from}`);
      pendingNewUsers.push(from);
      return;
    }
    const isInit = (socket.id < from);
    peer = initPeer(from, isInit);
  }

  if (signal.type === "offer") {
    await peer.setRemoteDescription(new RTCSessionDescription(signal));
    sessionUfrag[from] = parseIceUfrag(signal.sdp);

    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    socket.emit("signal", { to: from, signal: peer.localDescription });

    if (pendingCandidates[from]) {
      for (const c of pendingCandidates[from]) {
        if (sessionUfrag[from]
          && sessionUfrag[from] !== c.usernameFragment
          && c.usernameFragment !== null) {
          continue;
        }
        try {
          await peer.addIceCandidate(new RTCIceCandidate(c));
        } catch (err) {
          console.warn("Candidate eklenirken hata:", err);
        }
      }
      pendingCandidates[from] = [];
    }
  } else if (signal.type === "answer") {
    if (peer.signalingState === "stable") {
      return;
    }
    await peer.setRemoteDescription(new RTCSessionDescription(signal));
    sessionUfrag[from] = parseIceUfrag(signal.sdp);

    if (pendingCandidates[from]) {
      for (const c of pendingCandidates[from]) {
        if (sessionUfrag[from]
          && sessionUfrag[from] !== c.usernameFragment
          && c.usernameFragment !== null) {
          continue;
        }
        try {
          await peer.addIceCandidate(new RTCIceCandidate(c));
        } catch (err) {
          console.warn("Candidate eklenirken hata:", err);
        }
      }
      pendingCandidates[from] = [];
    }
  } else if (signal.candidate) {
    if (!peer.remoteDescription || peer.remoteDescription.type === "") {
      if (!pendingCandidates[from]) {
        pendingCandidates[from] = [];
      }
      pendingCandidates[from].push(signal);
    } else {
      if (sessionUfrag[from]
        && sessionUfrag[from] !== signal.usernameFragment
        && signal.usernameFragment !== null) {
        return;
      }
      try {
        await peer.addIceCandidate(new RTCIceCandidate(signal));
      } catch (err) {
        console.warn("ICE Candidate hata:", err);
      }
    }
  }
});

/* Peer Başlat => WebRTC */
function initPeer(userId, isInitiator) {
  if (!localStream || !audioPermissionGranted) {
    if (isInitiator) {
      pendingUsers.push(userId);
    } else {
      pendingNewUsers.push(userId);
    }
    return;
  }
  if (peers[userId]) {
    return peers[userId];
  }

  const peer = new RTCPeerConnection({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
    ],
  });
  peers[userId] = peer;

  // Yerel ses akışını ekle
  localStream.getTracks().forEach(track => peer.addTrack(track, localStream));

  // ICE Candidate
  peer.onicecandidate = (ev) => {
    if (ev.candidate) {
      socket.emit("signal", { to: userId, signal: ev.candidate });
    }
  };

  // Remote track
  peer.ontrack = (event) => {
    const audio = new Audio();
    audio.srcObject = event.streams[0];
    audio.autoplay = false;
    audio.muted = false;
    audio.dataset.peerId = userId;
    remoteAudios.push(audio);

    startVolumeAnalysis(event.streams[0], userId);

    if (audioPermissionGranted) {
      audio.play().catch(err => console.error("Ses oynatılamadı:", err));
    }
  };

  // Teklif oluştur
  if (isInitiator) {
    createOffer(peer, userId);
  }
  return peer;
}

/* createOffer => stable check */
async function createOffer(peer, userId) {
  if (peer.signalingState !== "stable") {
    setTimeout(async () => {
      if (peer.signalingState !== "stable") {
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

/* closeAllPeers => Tüm RTCPeerConnection'ları kapat */
function closeAllPeers() {
  for (const userId in peers) {
    if (peers[userId]) {
      peers[userId].close();
      delete peers[userId];
    }
    stopVolumeAnalysis(userId);
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

/* applyAudioStates => ikon & renk */
function applyAudioStates() {
  if (localStream) {
    localStream.getAudioTracks().forEach(track => {
      track.enabled = micEnabled && !selfDeafened;
    });
  }

  // Mikrofon ikonu
  if (!micEnabled || selfDeafened) {
    micToggleButton.innerHTML = `<ion-icon name="mic-off-outline"></ion-icon>`;
    micToggleButton.classList.add('btn-muted');
  } else {
    micToggleButton.innerHTML = `<ion-icon name="mic-outline"></ion-icon>`;
    micToggleButton.classList.remove('btn-muted');
  }

  // Deaf ikonu
  if (selfDeafened) {
    deafenToggleButton.innerHTML = `<ion-icon name="volume-mute-outline"></ion-icon>`;
    deafenToggleButton.classList.add('btn-muted');
  } else {
    deafenToggleButton.innerHTML = `<ion-icon name="volume-high-outline"></ion-icon>`;
    deafenToggleButton.classList.remove('btn-muted');
  }

  applyDeafenState();
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

/* groupRenamed => UI update */
socket.on('groupRenamed', (data) => {
  const { groupId, newName } = data;
  if (currentGroup === groupId || selectedGroup === groupId) {
    groupTitle.textContent = newName;
  }
  socket.emit('set-username', username);
});

/* groupDeleted => UI reset */
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

/* Socket Durum */
socket.on("connect", () => {
  console.log("WebSocket bağlandı:", socket.id);
});
socket.on("disconnect", () => {
  console.log("WebSocket bağlantısı koptu.");
  hideChannelStatusPanel();
});

/* Konuşma Algılama */
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
      sum += Math.abs((dataArray[i] - 128) / 128.0);
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
