/**************************************************************
 * script.js
 * Tüm istemci (frontend) mantığı:
 * - Login / Register
 * - Grup oluşturma / Gruba ID ile katılma
 * - Oda oluşturma / Odaya katılma
 * - Sağ panelde online/offline kullanıcıları gösterme
 * - ID kopyalamak için dropdown menü
 **************************************************************/

const socket = io();

/* --------------------------------------------------
   DOM Elemanları
--------------------------------------------------*/
// Ekranlar
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

// Gruplar (sol panel)
const groupListDiv = document.getElementById('groupList');
const createGroupButton = document.getElementById('createGroupButton');

// Odalar (kanallar)
const roomListDiv = document.getElementById('roomList');
const createRoomButton = document.getElementById('createRoomButton');
const groupTitle = document.getElementById('groupTitle');
const groupDropdownIcon = document.getElementById('groupDropdownIcon');
const groupDropdownMenu = document.getElementById('groupDropdownMenu');

// Dropdown menü içindeki itemlar
const copyGroupIdBtn = document.getElementById('copyGroupIdBtn');
const renameGroupBtn = document.getElementById('renameGroupBtn');
const createChannelBtn = document.getElementById('createChannelBtn');
const deleteGroupBtn = document.getElementById('deleteGroupBtn');

// Sağ panel (kullanıcı listesi) => online / offline
const rightPanel = document.getElementById('rightPanel'); 
// (Sağ panelde userList yok, onun yerine groupUsers event geliyor.)

// Modal: Grup seçenekleri (Grup Kur / Gruba Katıl)
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

// Modal: Oda (Kanal) oluşturma
const roomModal = document.getElementById('roomModal');
const modalRoomName = document.getElementById('modalRoomName');
const modalCreateRoomBtn = document.getElementById('modalCreateRoomBtn');
const modalCloseRoomBtn = document.getElementById('modalCloseRoomBtn');

// Sol alt panel (kullanıcı)
const leftUserName = document.getElementById('leftUserName');
const micToggleButton = document.getElementById('micToggleButton');
const deafenToggleButton = document.getElementById('deafenToggleButton');

// Ayrıl butonu (odadan/gruptan)
const leaveButton = document.getElementById('leaveButton');

/* --------------------------------------------------
   Bazı değişkenler
--------------------------------------------------*/
let username = null; 
let currentGroup = null;
let currentRoom = null;

let audioPermissionGranted = false;
let localStream;
let peers = {};
let remoteAudios = []; 
let micEnabled = true;
let selfDeafened = false;
let dropdownOpen = false; // Grup dropdown

// Bekleyen peer istekleri vs.
let pendingUsers = [];
let pendingNewUsers = [];

/* --------------------------------------------------
   Ekran Geçişleri (Login / Register)
--------------------------------------------------*/
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

/* --------------------------------------------------
   Login
--------------------------------------------------*/
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

    // Sunucuya "set-username"
    socket.emit('set-username', username);
    leftUserName.textContent = username;
  } else {
    alert("Giriş başarısız: " + data.message);
  }
});

/* --------------------------------------------------
   Register
--------------------------------------------------*/
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

/* --------------------------------------------------
   DM paneli
--------------------------------------------------*/
const toggleDMButton = document.getElementById('toggleDMButton');
const closeDMButton = document.getElementById('closeDMButton');
const dmPanel = document.getElementById('dmPanel');
const groupsAndRooms = document.getElementById('groupsAndRooms');
let isDMMode = false;

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

/* --------------------------------------------------
   Grup Oluştur / Gruba Katıl
--------------------------------------------------*/
createGroupButton.addEventListener('click', () => {
  // Seçenek modali (Grup Kur / Gruba Katıl)
  groupModal.style.display = 'flex';
});

// Grup Seçenekleri -> Grup Kur
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

// Modal: Gruba Katıl (ID ile)
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

/* --------------------------------------------------
   "Grup ID kopyala" (dropdown menüde)
--------------------------------------------------*/
copyGroupIdBtn.addEventListener('click', () => {
  if (!currentGroup) {
    alert("Geçerli bir grup yok!");
    return;
  }
  navigator.clipboard.writeText(currentGroup)
    .then(() => {
      alert("Grup ID kopyalandı: " + currentGroup);
    })
    .catch(err => {
      console.error("Kopyalanamadı:", err);
    });
  groupDropdownMenu.style.display = 'none';
});

/* --------------------------------------------------
   Gruplar Listesi
--------------------------------------------------*/
socket.on('groupsList', (groupArray) => {
  // Mevcut grupları göster (sadece bu user’ın owner veya katıldığı)
  groupListDiv.innerHTML = '';
  groupArray.forEach(groupObj => {
    // groupObj = { id, name }
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

/* --------------------------------------------------
   Odalar (Kanal) Listesi
--------------------------------------------------*/
socket.on('roomsList', (roomsArray) => {
  roomListDiv.innerHTML = '';
  roomsArray.forEach(roomObj => {
    // roomObj = { id, name }
    const roomItem = document.createElement('div');
    roomItem.className = 'channel-item';

    const icon = createWaveIcon();
    const textSpan = document.createElement('span');
    textSpan.textContent = roomObj.name;

    roomItem.appendChild(icon);
    roomItem.appendChild(textSpan);

    roomItem.addEventListener('click', () => {
      joinRoom(currentGroup, roomObj.id, roomObj.name);
    });
    roomListDiv.appendChild(roomItem);
  });
});

function joinRoom(grpId, roomId, roomName) {
  if (currentRoom && currentRoom !== roomId) {
    closeAllPeers();
    audioPermissionGranted = false;
    localStream = null;
  }
  currentRoom = roomId;
  socket.emit('joinRoom', { groupId: grpId, roomId });
  // Ayrıl butonu göster
  leaveButton.style.display = 'flex';
}

/* --------------------------------------------------
   Oda Oluştur
--------------------------------------------------*/
createRoomButton.addEventListener('click', () => {
  if (!currentGroup) {
    alert("Önce bir gruba katılın!");
    return;
  }
  roomModal.style.display = 'flex';
  modalRoomName.value = '';
  modalRoomName.focus();
});
modalCreateRoomBtn.addEventListener('click', () => {
  const rName = modalRoomName.value.trim();
  if (!rName) {
    alert("Lütfen oda adı girin!");
    return;
  }
  socket.emit('createRoom', { groupId: currentGroup, roomName: rName });
  roomModal.style.display = 'none';
});
modalCloseRoomBtn.addEventListener('click', () => {
  roomModal.style.display = 'none';
});

/* --------------------------------------------------
   Odayı / Grubu Ayrıl Butonu
--------------------------------------------------*/
leaveButton.addEventListener('click', () => {
  if (!currentRoom) {
    // Gruptan ayrılmak isterseniz "offline" mantığıyla user’ı da “grup”tan çıkarabilirsiniz
    // Bu projenin tasarımına göre "gruptan ayrıl" event'i eklenebilir.
    alert("Şu an bir odada değilsiniz. (Grup’tan tam çıkma event’i isterseniz sunucuya ekleyin.)");
    return;
  }
  socket.emit('leaveRoom', { groupId: currentGroup, roomId: currentRoom });
  closeAllPeers();
  currentRoom = null;
  leaveButton.style.display = 'none';
});

/* --------------------------------------------------
   Sağ Panel: groupUsers => Online/Offline
--------------------------------------------------*/
socket.on('groupUsers', (members) => {
  updateGroupUsers(members);
});

/**
 * Sağ panelde “Çevrimiçi / Çevrimdışı” bölümleri,
 * userItem tıklanınca ID Kopyala dropdown’ı
 */
function updateGroupUsers(members) {
  rightPanel.innerHTML = ''; // Temizle

  // Çevrimiçi
  const onlineTitle = document.createElement('h2');
  onlineTitle.textContent = "Çevrimiçi";
  rightPanel.appendChild(onlineTitle);

  const onlineList = document.createElement('div');
  onlineList.style.marginBottom = "1rem";
  rightPanel.appendChild(onlineList);

  // Çevrimdışı
  const offlineTitle = document.createElement('h2');
  offlineTitle.textContent = "Çevrimdışı";
  rightPanel.appendChild(offlineTitle);

  const offlineList = document.createElement('div');
  rightPanel.appendChild(offlineList);

  // Sunucu side’da alfabetik sıralama yaptık, isterseniz burada da .sort() yapabilirsiniz
  members.forEach(user => {
    const userItem = document.createElement('div');
    userItem.classList.add('user-item');
    userItem.dataset.userid = user.id;

    // Profil
    const profileThumb = document.createElement('div');
    profileThumb.classList.add('profile-thumb');
    userItem.appendChild(profileThumb);

    // İsim
    const userNameSpan = document.createElement('span');
    userNameSpan.classList.add('user-name');
    userNameSpan.textContent = user.username || '(Bilinmeyen)';
    userItem.appendChild(userNameSpan);

    // Offline => soluk
    if (!user.online) {
      userItem.style.opacity = "0.5";
    }

    // Dropdown menü => ID Kopyala
    const dropdownMenu = document.createElement('div');
    dropdownMenu.classList.add('user-dropdown-menu');
    dropdownMenu.style.display = 'none';

    const copyIdItem = document.createElement('div');
    copyIdItem.classList.add('dropdown-item');
    copyIdItem.textContent = "ID Kopyala";
    copyIdItem.addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(user.id)
        .then(() => {
          alert(`Kullanıcı ID kopyalandı: ${user.id}`);
        })
        .catch(err => {
          console.error(err);
          alert("Kopyalama hatası!");
        });
      dropdownMenu.style.display = 'none';
    });
    dropdownMenu.appendChild(copyIdItem);
    userItem.appendChild(dropdownMenu);

    // Tıkla => menü aç/kapa
    userItem.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdownMenu.style.display = (dropdownMenu.style.display === 'none') ? 'block' : 'none';
    });

    if (user.online) {
      onlineList.appendChild(userItem);
    } else {
      offlineList.appendChild(userItem);
    }
  });
}

/* --------------------------------------------------
   Mikrofon / Kulaklık
--------------------------------------------------*/
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

/* --------------------------------------------------
   WebRTC vs. (opsiyonel)
--------------------------------------------------*/
socket.on("signal", async (data) => {
  // ...
  // WebRTC sinyalleşme mantığı
});

/* --------------------------------------------------
   Peer kapatma / closeAllPeers
--------------------------------------------------*/
function closeAllPeers() {
  for (const userId in peers) {
    if (peers[userId]) {
      peers[userId].close();
      delete peers[userId];
    }
  }
  remoteAudios = [];
}

/* --------------------------------------------------
   Mikrofon izni
--------------------------------------------------*/
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

/* --------------------------------------------------
   WebRTC Peer initOffer vb. (opsiyonel)
--------------------------------------------------*/

// Sinyal event’ler, initPeer, createOffer vs. eklenecek...
// ...

/* --------------------------------------------------
   Kanal ikonu (ses dalgası)
--------------------------------------------------*/
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

/* --------------------------------------------------
   Socket Durum
--------------------------------------------------*/
socket.on("connect", () => {
  console.log("WebSocket bağlandı:", socket.id);
});
socket.on("disconnect", () => {
  console.log("WebSocket bağlantısı koptu.");
});

/* --------------------------------------------------
   Grup dropdown menü
--------------------------------------------------*/
groupDropdownIcon.addEventListener('click', () => {
  dropdownOpen = !dropdownOpen;
  groupDropdownMenu.style.display = dropdownOpen ? 'flex' : 'none';
});
renameGroupBtn.addEventListener('click', () => {
  alert("Grup ismi değiştirme henüz yok!");
  groupDropdownMenu.style.display = 'none';
  dropdownOpen = false;
});
createChannelBtn.addEventListener('click', () => {
  alert("Kanal oluşturma henüz yok!");
  groupDropdownMenu.style.display = 'none';
  dropdownOpen = false;
});
deleteGroupBtn.addEventListener('click', () => {
  alert("Grubu silme henüz yok!");
  groupDropdownMenu.style.display = 'none';
  dropdownOpen = false;
});
