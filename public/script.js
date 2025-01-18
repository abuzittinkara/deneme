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

// Bağlanması beklenen user listeleri
let pendingUsers = [];     // isInitiator = true olacak kullanıcılar
let pendingNewUsers = [];  // isInitiator = false olacak kullanıcılar

// ICE Candidate / session
let pendingCandidates = {};
let sessionUfrag = {};

/* Konuşma algılama analizleri */
let audioAnalyzers = {};
const SPEAKING_THRESHOLD = 0.0;  // Minimale ses bile stroke eklesin
const VOLUME_CHECK_INTERVAL = 100;

/* volume-up-fill ikonu */
function createWaveIcon() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("fill", "currentColor");
  svg.setAttribute("class", "channel-icon bi bi-volume-up-fill");
  svg.setAttribute("viewBox", "0 0 16 16");

  const path1 = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path1.setAttribute("d", "M9.717.55A.5.5 0 0 1 10 .999v14a.5.5 0 0 1-.783.409L5.825 12H3.5A1.5 1.5 0 0 1 2 10.5v-5A1.5 1.5 0 0 1 3.5 4h2.325l3.392-2.409a.5.5 0 0 1 .5-.041z");

  const path2 = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path2.setAttribute("d", "M13.493 1.957a.5.5 0 0 1 .014.706 7.979 7.979 0 0 1 0 10.674.5.5 0 1 1-.72-.694 6.979 6.979 0 0 0 0-9.286.5.5 0 0 1 .706-.014z");

  const path3 = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path3.setAttribute("d", "M11.534 3.16a.5.5 0 0 1 .12.7 4.978 4.978 0 0 1 0 5.281.5.5 0 1 1-.82-.574 3.978 3.978 0 0 0 0-4.133.5.5 0 0 1 .7-.12z");

  svg.appendChild(path1);
  svg.appendChild(path2);
  svg.appendChild(path3);

  return svg;
}

// DOM Ekranları
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
const dmPanel = document.getElementById('dmPanel');
const groupsAndRooms = document.getElementById('groupsAndRooms');
let isDMMode = false;

// Sağ panel (kullanıcı listesi)
const userListDiv = document.getElementById('userList');

// Ayrıl Butonu
const leaveButton = document.getElementById('leaveButton');

/* AYARLAR Paneli => div oluşturma */
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

// Sol alt user panel => buton ekle
const userPanelButtons = document.querySelector('.user-panel-buttons');
const settingsButton = document.createElement('button');
settingsButton.id = 'settingsButton';
settingsButton.classList.add('user-panel-btn');
settingsButton.title = 'Ayarlar';
settingsButton.innerHTML = `
  <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"
       stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="3"></circle>
    <path d="M19.4 15a1.65 1.65 0 0 
      0 .33 1.82l.06.06
      a2 2 0 0 1-2.83 2.83l-.06-.06
      a1.65 1.65 0 0 0-1.82-.33
      1.65 1.65 0 0 0-1 1.51v.28
      a2 2 0 0 1-2 2h-0.5
      a2 2 0 0 1-2-2v-.28
      a1.65 1.65 0 0 0-1-1.51
      1.65 1.65 0 0 0-1.82.33l-.06.06
      a2 2 0 0 1-2.83-2.83l.06-.06
      a1.65 1.65 0 0 
      0 .33-1.82
      1.65 1.65 0 0 
      0-1-1.51h-.28
      a2 2 0 0 1-2-2v-0.5
      a2 2 0 0 1 2-2h.28
      a1.65 1.65 0 0 
      0 1-1.51
      1.65 1.65 0 0 
      0-.33-1.82l-.06-.06
      a2 2 0 0 1-2.83-2.83l.06.06
      a1.65 1.65 0 0 0 1.82.33h0
      a1.65 1.65 0 0 0 1-1.51v-.28
      a2 2 0 0 1 2-2h0.5
      a2 2 0 0 1 2 2v.28
      a1.65 1.65 0 0 0 1 1.51h0
      a1.65 1.65 0 0 0 1.82-.33l.06-.06
      a2 2 0 0 1 2.83 2.83l-.06.06
      a1.65 1.65 0 0 0-.33 1.82v0
      a1.65 1.65 0 0 0 1 1.51h.28
      a2 2 0 0 1 2 2v0.5
      a2 2 0 0 1-2 2h-.28
      a1.65 1.65 0 0 0-1.51 1z"></path>
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

/* Modal referansları */
const groupModal = document.getElementById('groupModal');
const modalGroupCreateBtn = document.getElementById('modalGroupCreateBtn');
const modalGroupJoinBtn = document.getElementById('modalGroupJoinBtn');

const actualGroupCreateModal = document.getElementById('actualGroupCreateModal');
const actualGroupName = document.getElementById('actualGroupName');
const actualGroupNameBtn = document.getElementById('actualGroupNameBtn');
const closeCreateGroupModal = document.getElementById('closeCreateGroupModal');

const joinGroupModal = document.getElementById('joinGroupModal');
const joinGroupIdInput = document.getElementById('joinGroupIdInput');
const joinGroupIdBtn = document.getElementById('joinGroupIdBtn');
const closeJoinGroupModal = document.getElementById('closeJoinGroupModal');

const roomModal = document.getElementById('roomModal');
const modalRoomName = document.getElementById('modalRoomName');
const modalCreateRoomBtn = document.getElementById('modalCreateRoomBtn');
const modalCloseRoomBtn = document.getElementById('modalCloseRoomBtn');

/* Ekran geçişleri (login <-> register) */
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
    leftUserName.textContent = username;
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

/* Oda Oluşturma */
modalCreateRoomBtn.addEventListener('click', () => {
  const rName = modalRoomName.value.trim();
  if (!rName) {
    alert("Oda adı girin!");
    return;
  }
  const grp = currentGroup || selectedGroup;
  socket.emit('createRoom', { groupId: grp, roomName: rName });
  roomModal.style.display = 'none';
});
modalCloseRoomBtn.addEventListener('click', () => {
  roomModal.style.display = 'none';
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
      // tüm gruplardaki "selected"ı kaldır
      document.querySelectorAll('.grp-item').forEach(el => el.classList.remove('selected'));
      grpItem.classList.add('selected');

      // SADECE BAKMAK (browse)
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

/* groupDropdownIcon => menüyü aç/kapat */
groupDropdownIcon.addEventListener('click', () => {
  if (groupDropdownMenu.style.display === 'none' || groupDropdownMenu.style.display === '') {
    groupDropdownMenu.style.display = 'block';
  } else {
    groupDropdownMenu.style.display = 'none';
  }
});

/* Drop-down => Grup ID Kopyala, İsmi Değiştir, Kanal Oluştur, Grup Sil */
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
  roomModal.style.display = 'flex';
  modalRoomName.value = '';
  modalRoomName.focus();
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

/* Kanal => Right-click -> rename/delete => script */
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

/* roomsList => kanallar */
socket.on('roomsList', (roomsArray) => {
  roomListDiv.innerHTML = '';
  roomsArray.forEach(roomObj => {
    const roomItem = document.createElement('div');
    roomItem.className = 'channel-item';

    // *** YENİ => her channel-item'a eşsiz ID verelim
    roomItem.id = `channel-item-${roomObj.id}`;

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

    // Kanala tıklama
    roomItem.addEventListener('click', () => {
      if (currentRoom && (currentRoom !== roomObj.id || currentGroup !== selectedGroup)) {
        socket.emit('leaveRoom', { groupId: currentGroup, roomId: currentRoom });
        closeAllPeers();
        currentRoom = null;
      }
      joinRoom(selectedGroup, roomObj.id, roomObj.name);
    });

    // Sağ tık => context menu
    roomItem.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      rightClickedChannelId = roomObj.id;

      channelContextMenu.style.left = e.pageX + 'px';
      channelContextMenu.style.top = e.pageY + 'px';
      channelContextMenu.style.display = 'block';
    });

    // Eğer kullanıcı fiziksel olarak bu kanaldaysa stroke
    if (currentGroup === selectedGroup && currentRoom === roomObj.id) {
      roomItem.classList.add('inThisChannel');
    }

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
  console.log("groupUsers event alındı:", dbUsersArray);
  updateUserList(dbUsersArray);
});

/* roomUsers => odadaki kullanıcılar => WebRTC init */
socket.on('roomUsers', (usersInRoom) => {
  console.log("roomUsers => odadaki kisiler:", usersInRoom);

  const userIdsInRoom = usersInRoom.map(u => u.id);
  Object.keys(peers).forEach(peerId => {
    if (!userIdsInRoom.includes(peerId)) {
      console.log(`Peer ${peerId} is not in this room anymore => closing peer`);
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
  currentGroup = groupId;
  currentRoom = roomId;
  socket.emit('joinRoom', { groupId, roomId });
  leaveButton.style.display = 'flex';

  // 1) Tüm kanal öğelerinden inThisChannel sınıfını kaldır
  const allChannels = document.querySelectorAll('.channel-item');
  allChannels.forEach(ch => {
    ch.classList.remove('inThisChannel');
  });

  // 2) Katıldığımız kanala ekle => ID: "channel-item-<roomId>"
  const joinedChannelDiv = document.getElementById(`channel-item-${roomId}`);
  if (joinedChannelDiv) {
    joinedChannelDiv.classList.add('inThisChannel');
    console.log(`joinRoom => ${roomName} (ID=${roomId}) => .inThisChannel eklendi.`);
  }
}

/* Ayrıl Butonu => odadan çık */
leaveButton.addEventListener('click', () => {
  if (!currentRoom) return;
  socket.emit('leaveRoom', { groupId: currentGroup, roomId: currentRoom });
  closeAllPeers();
  currentRoom = null;
  leaveButton.style.display = 'none';
  console.log("Kanaldan ayrıldınız.");
  if (currentGroup) {
    socket.emit('browseGroup', currentGroup);
  }

  // Kanaldan ayrılınca => stroke kaldıysa sil
  const allChannels = document.querySelectorAll('.channel-item');
  allChannels.forEach(ch => {
    ch.classList.remove('inThisChannel');
  });
});

/* Sağ panel => updateUserList (Çevrimiçi/Çevrimdışı) */
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
    console.log("Mikrofon erişimi verildi:", stream);
    localStream = stream;
    audioPermissionGranted = true;
    applyAudioStates();

    // Konuşma algılama => local user
    startVolumeAnalysis(stream, socket.id);

    remoteAudios.forEach(audioEl => {
      audioEl.play().catch(err => console.error("Ses oynatılamadı:", err));
    });
  } catch(err) {
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

  localStream.getTracks().forEach(track => peer.addTrack(track, localStream));

  peer.onicecandidate = (ev) => {
    if (ev.candidate) {
      socket.emit("signal", { to: userId, signal: ev.candidate });
    }
  };
  peer.ontrack = (event) => {
    // Remote stream alındı
    const audio = new Audio();
    audio.srcObject = event.streams[0];
    audio.autoplay = false;
    audio.muted = false;
    audio.dataset.peerId = userId;
    remoteAudios.push(audio);

    // Konuşma algılama => remote user
    startVolumeAnalysis(event.streams[0], userId);

    if (audioPermissionGranted) {
      audio.play().catch(err => console.error("Ses oynatılamadı:", err));
    }
  };

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
const micToggleButton = document.getElementById('micToggleButton');
const deafenToggleButton = document.getElementById('deafenToggleButton');

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
  deafenToggleButton.innerHTML = selfDeafened ? "DEAF ON" : "DEAF OFF";
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
  }
  if (selectedGroup === groupId) {
    selectedGroup = null;
    groupTitle.textContent = "Seçili Grup";
    userListDiv.innerHTML = '';
    roomListDiv.innerHTML = '';
  }
  socket.emit('set-username', username);
});

/* Socket Durum */
socket.on("connect", () => {
  console.log("WebSocket bağlandı:", socket.id);
});
socket.on("disconnect", () => {
  console.log("WebSocket bağlantısı koptu.");
});

/* --- Konuşma Algılama (Volume Analysis) Fonksiyonları --- */
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
