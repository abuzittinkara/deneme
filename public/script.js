/**************************************
 * script.js
 **************************************/

const socket = io();
let localStream;
let peers = {};
let audioPermissionGranted = false;
let remoteAudios = [];
let username = null;

// micEnabled / selfDeafened => global
let micEnabled = true;
let selfDeafened = false;

// Mevcut group/room
let currentGroup = null;
let currentRoom = null;
let currentRoomType = 'voice'; // "voice" veya "text"

// Göz atılan (browse edilen) group
let selectedGroup = null;

let pendingUsers = [];
let pendingNewUsers = [];

// ICE Candidate / session
let pendingCandidates = {};
let sessionUfrag = {};

// Kanal sağ tık menüsü (rename/delete)
let channelContextMenu = null;
let currentRightClickedChannel = null;

/* --- DOM Referansları --- */
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

// Gruplar (Sol sidebar)
const groupListDiv = document.getElementById('groupList');
const createGroupButton = document.getElementById('createGroupButton');

// Odalar (Kanallar)
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

// Ayrıl Butonu (sesli kanaldan)
const leaveButton = document.getElementById('leaveButton');

/* === YAZILI KANAL ALANI === */
const textChatContainer = document.createElement('div');
textChatContainer.id = 'textChatContainer';
textChatContainer.style.display = 'none';
textChatContainer.innerHTML = `
  <div id="chatMessages" style="flex:1; overflow:auto; padding:1rem; background:#2d2d2d;"></div>
  <div class="chat-input-row" style="display:flex; align-items:center; padding:0.5rem; background:#1f1f1f;">
    <input type="text" id="chatInput" placeholder="Mesajınızı yazın..." style="flex:1; background:#444; border:1px solid #666; border-radius:6px; color:#fff; font-size:0.9rem; padding:0.5rem; margin-right:0.5rem;"/>
    <button id="sendChatBtn" style="background:#c61884; border:none; border-radius:4px; color:#fff; cursor:pointer; font-size:0.8rem; padding:0.4rem 0.8rem;">Gönder</button>
  </div>
`;
document.querySelector('.main-content').appendChild(textChatContainer);

const chatMessagesDiv = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendChatBtn = document.getElementById('sendChatBtn');

// roomModal => Kanal Adı + Tipi (voice/text)
const roomModal = document.getElementById('roomModal');
const modalRoomName = document.getElementById('modalRoomName');
const modalCreateRoomBtn = document.getElementById('modalCreateRoomBtn');
const modalCloseRoomBtn = document.getElementById('modalCloseRoomBtn');

/* volume-up-fill ikonu => Kanal listesi */
function createWaveIcon() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("fill", "currentColor");
  svg.setAttribute("class", "channel-icon bi bi-volume-up-fill");
  svg.setAttribute("viewBox", "0 0 16 16");

  const p1 = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p1.setAttribute("d", "M9.717.55A.5.5 0 0 1 10 .999v14a.5.5...");
  const p2 = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p2.setAttribute("d", "M13.493 1.957a.5.5 0 0 1 .014.706...");
  const p3 = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p3.setAttribute("d", "M11.534 3.16a.5.5 0 0 1 .12.7...");

  svg.appendChild(p1);
  svg.appendChild(p2);
  svg.appendChild(p3);

  return svg;
}

/* Channel Context Menu => rename / delete */
function createChannelContextMenu() {
  channelContextMenu = document.createElement('div');
  channelContextMenu.id = 'channelContextMenu';
  channelContextMenu.style.position = 'absolute';
  channelContextMenu.style.display = 'none';
  channelContextMenu.style.background = '#333';
  channelContextMenu.style.border = '1px solid #666';
  channelContextMenu.style.borderRadius = '6px';
  channelContextMenu.style.padding = '0.5rem';
  channelContextMenu.style.zIndex = '9999';

  const renameBtn = document.createElement('div');
  renameBtn.textContent = 'Kanal Adını Değiştir';
  renameBtn.style.cursor = 'pointer';
  renameBtn.style.marginBottom = '0.3rem';
  renameBtn.addEventListener('click', () => {
    channelContextMenu.style.display = 'none';
    if (!currentRightClickedChannel) return;
    const newName = prompt("Yeni kanal ismi:", currentRightClickedChannel.name);
    if (!newName || !newName.trim()) return;

    const grp = currentGroup || selectedGroup;
    socket.emit('renameChannel', { groupId: grp, channelId: currentRightClickedChannel.id, newName: newName.trim() });
  });

  const deleteBtn = document.createElement('div');
  deleteBtn.textContent = 'Kanalı Sil';
  deleteBtn.style.cursor = 'pointer';
  deleteBtn.addEventListener('click', () => {
    channelContextMenu.style.display = 'none';
    if (!currentRightClickedChannel) return;
    const confirmDel = confirm("Bu kanalı silmek istediğinize emin misiniz?");
    if (!confirmDel) return;

    const grp = currentGroup || selectedGroup;
    socket.emit('deleteChannel', { groupId: grp, channelId: currentRightClickedChannel.id });
  });

  channelContextMenu.appendChild(renameBtn);
  channelContextMenu.appendChild(deleteBtn);

  document.body.appendChild(channelContextMenu);

  // Global click => menüyü kapat
  document.addEventListener('click', () => {
    channelContextMenu.style.display = 'none';
  });
}

function showChannelContextMenu(x, y) {
  if (!channelContextMenu) createChannelContextMenu();
  channelContextMenu.style.display = 'block';
  channelContextMenu.style.left = x + 'px';
  channelContextMenu.style.top = y + 'px';
}

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
  const groupModal = document.getElementById('groupModal');
  groupModal.style.display = 'flex';
});
document.getElementById('modalGroupCreateBtn').addEventListener('click', () => {
  document.getElementById('groupModal').style.display = 'none';
  document.getElementById('actualGroupCreateModal').style.display = 'flex';
});
document.getElementById('modalGroupJoinBtn').addEventListener('click', () => {
  document.getElementById('groupModal').style.display = 'none';
  document.getElementById('joinGroupModal').style.display = 'flex';
});
// Modal: Grup Kur
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

/* groupsList => sol sidebar */
socket.on('groupsList', (groupArray) => {
  groupListDiv.innerHTML = '';
  groupArray.forEach(groupObj => {
    const grpItem = document.createElement('div');
    grpItem.className = 'grp-item';
    grpItem.innerText = groupObj.name[0].toUpperCase();
    grpItem.title = groupObj.name + " (" + groupObj.id + ")";

    grpItem.addEventListener('click', () => {
      // Seçili highlight
      document.querySelectorAll('.grp-item').forEach(el => el.classList.remove('selected'));
      grpItem.classList.add('selected');

      selectedGroup = groupObj.id;
      currentGroup = null;
      groupTitle.textContent = groupObj.name;

      socket.emit('browseGroup', groupObj.id);

      // Grup sahibi isek => sil/rename butonları
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

/* Drop-down => butonlar */
// Grup ID Kopyala
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

// Grup İsmi Değiştir
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

// Grup Sil
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

/* Kanal Oluştur => Modal */
createRoomButton.addEventListener('click', () => {
  if (!selectedGroup) {
    alert("Önce bir gruba tıklayın!");
    return;
  }
  roomModal.style.display = 'flex';
  modalRoomName.value = '';
  modalRoomName.focus();
});
createChannelBtn.addEventListener('click', () => {
  groupDropdownMenu.style.display = 'none';
  if (!selectedGroup) {
    alert("Önce bir gruba tıklayın!");
    return;
  }
  roomModal.style.display = 'flex';
  modalRoomName.value = '';
  modalRoomName.focus();
});
modalCreateRoomBtn.addEventListener('click', () => {
  const rName = modalRoomName.value.trim();
  if (!rName) {
    alert("Kanal adı boş olamaz!");
    return;
  }
  const sel = document.querySelector('input[name="channelType"]:checked');
  const roomType = sel ? sel.value : 'voice';

  socket.emit('createRoom', { groupId: selectedGroup, roomName: rName, roomType });
  roomModal.style.display = 'none';
});
modalCloseRoomBtn.addEventListener('click', () => {
  roomModal.style.display = 'none';
});

/* roomsList => kanal listesi */
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

    // Sağ tık menüsü (rename/delete)
    roomItem.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      currentRightClickedChannel = {
        id: roomObj.id,
        name: roomObj.name
      };
      showChannelContextMenu(e.pageX, e.pageY);
    });

    // Sol tık => Kanala geçiş
    roomItem.addEventListener('click', () => {
      // Yalnızca voice->voice geçişinde closeAllPeers
      if (currentRoomType === 'voice' && roomObj.type === 'voice' && currentRoom !== roomObj.id) {
        closeAllPeers();
      }
      // Gruplar farklıysa => joinGroup
      if (currentGroup !== selectedGroup) {
        socket.emit('joinGroup', selectedGroup);
        setTimeout(() => {
          joinRoom(selectedGroup, roomObj.id, roomObj.name, roomObj.type);
        }, 300);
      } else {
        joinRoom(currentGroup, roomObj.id, roomObj.name, roomObj.type);
      }
    });

    roomListDiv.appendChild(roomItem);
  });
});

/* allChannelsData => voice kanallardaki kullanıcılar */
socket.on('allChannelsData', (channelsObj) => {
  Object.keys(channelsObj).forEach(roomId => {
    const cData = channelsObj[roomId];
    const channelDiv = document.getElementById(`channel-users-${roomId}`);
    if (!channelDiv) return;
    channelDiv.innerHTML = '';

    // Yalnızca voice kanallarda user listesi
    if (cData.type === 'voice' && cData.users) {
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
    }
  });
});

/* groupUsers => sağ panel => updateUserList */
socket.on('groupUsers', (dbUsersArray) => {
  console.log("groupUsers event alındı:", dbUsersArray);
  updateUserList(dbUsersArray);
});

/* roomUsers => voice channel => WebRTC init */
socket.on('roomUsers', (usersInRoom) => {
  console.log("roomUsers => odadaki kisiler:", usersInRoom);

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

/* previousMessages => text channel eski mesajlar */
socket.on('previousMessages', (messages) => {
  console.log("previousMessages =>", messages);
  chatMessagesDiv.innerHTML = '';
  messages.forEach(msg => {
    appendChatMessage(msg.user, msg.content, msg.timestamp);
  });
});

/* newMessage => text channel anlık mesaj */
socket.on('newMessage', (data) => {
  appendChatMessage(data.user, data.content, data.timestamp);
});

function appendChatMessage(user, content, timestamp) {
  const msgDiv = document.createElement('div');
  msgDiv.style.marginBottom = '0.5rem';
  const timeStr = new Date(timestamp).toLocaleTimeString();
  msgDiv.textContent = `[${timeStr}] ${user}: ${content}`;
  chatMessagesDiv.appendChild(msgDiv);
  chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
}

/* joinRoom => voice/text */
function joinRoom(groupId, roomId, roomName, roomType = 'voice') {
  currentGroup = groupId;
  currentRoom = roomId;
  currentRoomType = roomType;

  socket.emit('joinRoom', { groupId, roomId });

  if (roomType === 'text') {
    // Sesli kanalda kalmaya devam, leaveButton gözükmesin
    leaveButton.style.display = 'none';
    textChatContainer.style.display = 'flex';
  } else {
    // Voice => ayrıl butonu aktif
    leaveButton.style.display = 'flex';
    textChatContainer.style.display = 'none';
  }
}

/* Ayrıl Butonu => sesli kanaldan çık */
leaveButton.addEventListener('click', () => {
  if (!currentRoom) return;
  socket.emit('leaveRoom', { groupId: currentGroup, roomId: currentRoom });
  closeAllPeers();

  currentRoom = null;
  currentRoomType = 'voice';
  leaveButton.style.display = 'none';
  console.log("Kanaldan ayrıldınız.");

  // Text alanı kapat
  textChatContainer.style.display = 'none';
  chatMessagesDiv.innerHTML = '';

  if (currentGroup) {
    // Tekrar group'a browse
    socket.emit('browseGroup', currentGroup);
  }
});

/* Sağ panel => updateUserList => online/offline */
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

/* Tek bir kullanıcı satırı */
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
      console.warn("localStream yok => push:", from);
      pendingNewUsers.push(from);
      return;
    }
    peer = initPeer(from, false);
  }

  if (signal.type === "offer") {
    if (peer.signalingState === "have-local-offer") {
      console.log("Collision => rollback local offer");
      try {
        await peer.setLocalDescription({ type: "rollback" });
      } catch (err) {
        console.warn("rollback hata:", err);
      }
    } else if (peer.signalingState !== "stable" && peer.signalingState !== "have-remote-offer") {
      console.warn("signaling not stable => skip second offer");
      return;
    }
    await peer.setRemoteDescription(new RTCSessionDescription(signal));
    sessionUfrag[from] = parseIceUfrag(signal.sdp);

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
        } catch (err) {
          console.warn("Candidate eklenirken hata:", err);
        }
      }
      pendingCandidates[from] = [];
    }

  } else if (signal.type === "answer") {
    if (peer.signalingState === "stable" || peer.signalingState === "closed") {
      console.warn("PeerConnection already stable/closed. Second answer ignored.");
      return;
    }
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
      if (sessionUfrag[from] && sessionUfrag[from] !== signal.usernameFragment && signal.usernameFragment !== null) {
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
    if (isInitiator) {
      pendingUsers.push(userId);
    } else {
      pendingNewUsers.push(userId);
    }
    return;
  }
  if (peers[userId]) {
    console.log("Zaten peer var:", userId);
    return peers[userId];
  }

  console.log(`initPeer => userId=${userId}, isInitiator=${isInitiator}`);
  const peer = new RTCPeerConnection({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
    ],
  });
  peers[userId] = peer;

  // localStream => peer'e ekle
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
      socket.emit("signal", { to: userId, signal: offer2 });
    }, 200);
    return;
  }

  const offer = await peer.createOffer();
  await peer.setLocalDescription(offer);
  socket.emit("signal", { to: userId, signal: peer.localDescription });
}

/* closeAllPeers => Tüm RTCPeerConnection kapat */
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

/* Mikrofon & Kulaklık */
document.getElementById('micToggleButton').addEventListener('click', () => {
  micEnabled = !micEnabled;
  applyAudioStates();
});
document.getElementById('deafenToggleButton').addEventListener('click', () => {
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
  document.getElementById('micToggleButton').innerHTML = 
    (micEnabled && !selfDeafened) ? "MIC ON" : "MIC OFF";
  applyDeafenState();
  document.getElementById('deafenToggleButton').innerHTML =
    selfDeafened ? "DEAF ON" : "DEAF OFF";
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

/* renameGroup => UI update => groupRenamed */
socket.on('groupRenamed', (data) => {
  const { groupId, newName } = data;
  if (currentGroup === groupId || selectedGroup === groupId) {
    groupTitle.textContent = newName;
  }
  socket.emit('set-username', username);
});

/* deleteGroup => UI update => groupDeleted */
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

/* channelRenamed => refresh */
socket.on('channelRenamed', ({ groupId, channelId, newName }) => {
  console.log(`channelRenamed => channelId=${channelId}, newName=${newName}`);
  socket.emit('browseGroup', groupId);
});

/* channelDeleted => refresh */
socket.on('channelDeleted', ({ groupId, channelId }) => {
  console.log(`channelDeleted => channelId=${channelId}, groupId=${groupId}`);
  socket.emit('browseGroup', groupId);
});

/* Yazılı Kanal => Mesaj gönderme butonu */
sendChatBtn.addEventListener('click', () => {
  if (currentRoomType !== 'text') {
    alert("Burası yazılı kanal değil!");
    return;
  }
  const msg = chatInput.value.trim();
  if (!msg) return;
  socket.emit('sendMessage', { groupId: currentGroup, channelId: currentRoom, content: msg });
  chatInput.value = '';
});

/* newMessage => yazılı kanal */
socket.on('newMessage', (data) => {
  appendChatMessage(data.user, data.content, data.timestamp);
});

function appendChatMessage(user, content, timestamp) {
  const msgDiv = document.createElement('div');
  msgDiv.style.marginBottom = '0.5rem';
  const timeStr = new Date(timestamp).toLocaleTimeString();
  msgDiv.textContent = `[${timeStr}] ${user}: ${content}`;
  chatMessagesDiv.appendChild(msgDiv);
  chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
}
