const socket = io();
let localStream;
let peers = {};
let audioPermissionGranted = false;
let remoteAudios = []; 
let username = null;

// Artık grup ismi yerine grup ID saklayacağız
let currentGroup = null;  // Bu ID'yi tutar
let currentRoom = null;   // Bu da oda ID'yi tutar

// Bekleyen kullanıcı listeleri (WebRTC senaryosu)
let pendingUsers = [];
let pendingNewUsers = [];

// Ekran elementleri
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

// Geri Gel
const backToLoginButton = document.getElementById('backToLoginButton');

// Ekran değiştirme linkleri
const showRegisterScreen = document.getElementById('showRegisterScreen');
const showLoginScreen = document.getElementById('showLoginScreen');

// Gruplar (soldaki yuvarlak ikonlar)
const groupListDiv = document.getElementById('groupList');
const createGroupButton = document.getElementById('createGroupButton');

// Odalar (artık metin + ikon)
const roomListDiv = document.getElementById('roomList');
const createRoomButton = document.getElementById('createRoomButton');
const groupTitle = document.getElementById('groupTitle');
const groupDropdownIcon = document.getElementById('groupDropdownIcon');
const groupDropdownMenu = document.getElementById('groupDropdownMenu');

// Dropdown menü öğeleri
const renameGroupBtn = document.getElementById('renameGroupBtn');
const createChannelBtn = document.getElementById('createChannelBtn');
const deleteGroupBtn = document.getElementById('deleteGroupBtn');

// Sağ panel (kullanıcı listesi)
const userListDiv = document.getElementById('userList');

// Modal: Grup
const groupModal = document.getElementById('groupModal');
const modalGroupName = document.getElementById('modalGroupName');
const modalCreateGroupButton = document.getElementById('modalCreateGroupButton');
const modalCloseButton = document.getElementById('modalCloseButton');

// Modal: Oda
const roomModal = document.getElementById('roomModal');
const modalRoomName = document.getElementById('modalRoomName');
const modalCreateRoomBtn = document.getElementById('modalCreateRoomBtn');
const modalCloseRoomBtn = document.getElementById('modalCloseRoomBtn');

// DM / GRUP Sekmesi
const toggleDMButton = document.getElementById('toggleDMButton');
const closeDMButton = document.getElementById('closeDMButton');
const dmPanel = document.getElementById('dmPanel');
const groupsAndRooms = document.getElementById('groupsAndRooms');
let isDMMode = false;

// Ekran geçişleri
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

// Giriş yap
loginButton.addEventListener('click', () => {
  const usernameVal = loginUsernameInput.value.trim();
  const passwordVal = loginPasswordInput.value.trim();
  if (!usernameVal || !passwordVal) {
    alert("Lütfen kullanıcı adı ve parola girin.");
    return;
  }
  socket.emit('login', { username: usernameVal, password: passwordVal });
});

// Kayıt ol
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

// Sunucudan login sonucu
socket.on('loginResult', (data) => {
  if (data.success) {
    username = data.username;
    loginScreen.style.display = 'none';
    callScreen.style.display = 'flex';
    socket.emit('set-username', username);
  } else {
    alert("Giriş başarısız: " + data.message);
  }
});

// Sunucudan register sonucu
socket.on('registerResult', (data) => {
  if (data.success) {
    alert("Kayıt başarılı! Şimdi giriş yapabilirsiniz.");
    registerScreen.style.display = 'none';
    loginScreen.style.display = 'block';
  } else {
    alert("Kayıt başarısız: " + data.message);
  }
});

// DM butonuna tıklama
toggleDMButton.addEventListener('click', () => {
  isDMMode = true;
  groupsAndRooms.style.display = 'none';
  dmPanel.style.display = 'block';
});

// DM'den geri dönüş
closeDMButton.addEventListener('click', () => {
  isDMMode = false;
  dmPanel.style.display = 'none';
  groupsAndRooms.style.display = 'flex';
});

// Grup oluşturma
createGroupButton.addEventListener('click', () => {
  groupModal.style.display = 'flex';
  modalGroupName.value = '';
  modalGroupName.focus();
});
modalCreateGroupButton.addEventListener('click', () => {
  const grpName = modalGroupName.value.trim();
  if (grpName) {
    socket.emit('createGroup', grpName);
    groupModal.style.display = 'none';
  } else {
    alert("Lütfen bir grup adı girin");
  }
});
modalCloseButton.addEventListener('click', () => {
  groupModal.style.display = 'none';
});

// Sunucudan grup listesi
socket.on('groupsList', (groupArray) => {
  // groupArray => [ { id: '...', name: '...' }, ... ]
  groupListDiv.innerHTML = '';
  groupArray.forEach(groupObj => {
    // Bir div oluşturalım
    const grpItem = document.createElement('div');
    grpItem.className = 'grp-item'; // Yuvarlak grup ikonu
    grpItem.innerText = groupObj.name[0].toUpperCase(); // Örneğin ilk harf
    grpItem.title = groupObj.name;   // Tooltip olarak tam ad

    // ID'yi saklamak için
    grpItem.dataset.groupId = groupObj.id;

    // Tıklanınca joinGroup fonksiyonumuzu çağıralım
    grpItem.addEventListener('click', () => {
      joinGroup(groupObj.id, groupObj.name);
    });

    groupListDiv.appendChild(grpItem);
  });
});

// Bir gruba katıl
function joinGroup(groupId, groupName) {
  // Eğer zaten farklı bir gruptaysak, tüm Peer'ları kapat
  if (currentGroup && currentGroup !== groupId) {
    closeAllPeers();
    audioPermissionGranted = false;
    localStream = null;
  }
  currentGroup = groupId;
  currentRoom = null;
  roomListDiv.innerHTML = '';

  // Ekrandaki başlık
  groupTitle.textContent = groupName;

  // Sunucuya bildir
  socket.emit('joinGroup', groupId);
}

// Sunucudan odalar listesi geldi
socket.on('roomsList', (roomsArray) => {
  // roomsArray => [ { id: '...', name: '...' }, ... ]
  roomListDiv.innerHTML = '';
  roomsArray.forEach(roomObj => {
    // Kanalları artık "channel-item" stili ile yapıyoruz
    const roomItem = document.createElement('div');
    roomItem.className = 'channel-item';

    // Ses dalgası ikonu (SVG) oluşturalım
    const icon = createWaveIcon();

    // Kanal adını gösterecek span
    const textSpan = document.createElement('span');
    textSpan.textContent = roomObj.name;

    // Odaya tıklayınca joinRoom
    roomItem.addEventListener('click', () => {
      joinRoom(currentGroup, roomObj.id, roomObj.name);
    });

    // Elemanları birleştir
    roomItem.appendChild(icon);
    roomItem.appendChild(textSpan);

    // Oda listesi container'a ekle
    roomListDiv.appendChild(roomItem);
  });
});

// Oda oluşturma
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
  if (rName) {
    socket.emit('createRoom', { groupId: currentGroup, roomName: rName });
    roomModal.style.display = 'none';
  } else {
    alert("Lütfen bir oda adı girin");
  }
});
modalCloseRoomBtn.addEventListener('click', () => {
  roomModal.style.display = 'none';
});

// Odaya katıl
function joinRoom(groupId, roomId, roomName) {
  if (currentRoom && currentRoom !== roomId) {
    closeAllPeers();
    audioPermissionGranted = false;
    localStream = null;
  }
  currentRoom = roomId;
  socket.emit('joinRoom', { groupId, roomId });
}

// Odadaki kullanıcılar
socket.on('roomUsers', (usersInRoom) => {
  updateUserList(usersInRoom);

  const otherUserIds = usersInRoom
    .filter(u => u.id !== socket.id)
    .map(u => u.id)
    .filter(id => !peers[id]);

  if (!audioPermissionGranted || !localStream) {
    requestMicrophoneAccess().then(() => {
      if (otherUserIds.length > 0) {
        otherUserIds.forEach(userId => {
          if (!peers[userId]) initPeer(userId, true);
        });
      }
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

// Kullanıcı listesini sağ panelde güncelle
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

// Mikrofon izni
async function requestMicrophoneAccess() {
  console.log("Mikrofon izni isteniyor...");
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  console.log("Mikrofon erişimi verildi:", stream); 
  localStream = stream;
  audioPermissionGranted = true;
  remoteAudios.forEach(audioEl => {
    audioEl.play().catch(err => console.error("Ses oynatılamadı:", err));
  });
}

// WebRTC sinyal
socket.on("signal", async (data) => {
  console.log("Signal alındı:", data);
  const { from, signal } = data;

  let peer;
  if (!peers[from]) {
    if (!localStream) {
      console.warn("localStream yok, sinyal bekletiyoruz.");
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
  } else if (signal.type === "answer") {
    await peer.setRemoteDescription(new RTCSessionDescription(signal));
  } else if (signal.candidate) {
    await peer.addIceCandidate(new RTCIceCandidate(signal));
    console.log("ICE Candidate eklendi:", signal);
  }
});

// Peer başlat
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
    if (audioPermissionGranted) {
      audio.play().catch(err => console.error("Ses oynatılamadı:", err));
    }
  };

  if (isInitiator) {
    createOffer(peer, userId);
  }
  return peer;
}

// Offer oluştur
async function createOffer(peer, userId) {
  const offer = await peer.createOffer();
  await peer.setLocalDescription(offer);
  socket.emit("signal", { to: userId, signal: peer.localDescription });
}

// Tüm peer’ları kapat
function closeAllPeers() {
  for (const userId in peers) {
    if (peers[userId]) {
      peers[userId].close();
      delete peers[userId];
    }
  }
  remoteAudios = [];
}

// Basit bir ses dalgası ikonu (SVG) oluşturan fonksiyon
function createWaveIcon() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "18");
  svg.setAttribute("height", "18");
  svg.setAttribute("class", "channel-icon");
  
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  // Basit bir dalga path'i
  path.setAttribute("d", "M2,12 C4,8 8,4 12,12 16,20 20,16 22,12");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "2");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");

  svg.appendChild(path);
  return svg;
}

// Socket durum
socket.on("connect", () => {
  console.log("WebSocket bağlandı:", socket.id);
});
socket.on("disconnect", () => {
  console.log("WebSocket bağlantısı koptu.");
});

// Dropdown menü kontrolü
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
